import { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from '../utils/uuid.js';
import { streamMessage, sendInterrupt } from '../services/api.js';

// Avatar/Pipeline states
export const STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  ERROR: 'error',
  CONNECTING: 'connecting',
  INTERRUPTED: 'interrupted',
};

// Sentiment-based expression detection (#88-90)
const EXPRESSION_PATTERNS = {
  surprised: /(!{2,}|wow|amazing|incredible|oh my|unbelievable|no way|really\?|seriously\?|what\?!)/i,
  empathetic: /(sorry|i understand|that must|must be hard|i can imagine|i feel|how difficult|that's tough|i'm here|must be)/i,
  positive: /(great|excellent|wonderful|fantastic|perfect|absolutely|happy to|love that|awesome|that's great|brilliant)/i,
};

function detectExpression(text) {
  if (EXPRESSION_PATTERNS.surprised.test(text)) return 'surprised';
  if (EXPRESSION_PATTERNS.empathetic.test(text)) return 'empathetic';
  if (EXPRESSION_PATTERNS.positive.test(text)) return 'positive';
  return null;
}

// Minimum time between interrupt events (ms) — #97 rate limiting
const INTERRUPT_COOLDOWN_MS = 1000;

// Per-model thinking timeout thresholds — #54
// If no first token arrives within this window, show an error state
const THINKING_TIMEOUTS = {
  'claude-haiku-4-5': 3000,
  'claude-sonnet-4-5': 5000,
  'claude-opus-4-5': 8000,
};

function getThinkingTimeout(modelId) {
  return THINKING_TIMEOUTS[modelId] || THINKING_TIMEOUTS['claude-sonnet-4-5'];
}

// Word reveal rate for live captions — #98 (ms per word, ~150 wpm)
const CAPTION_WORD_INTERVAL_MS = 380;

const PipelineContext = createContext(null);

const initialState = {
  avatarState: STATES.IDLE,
  conversationId: null,
  generationId: null,
  currentText: '', // streaming text being built
  captionText: '', // audio-synchronized caption text (word-by-word) — #98
  partialText: '', // text at the moment of interrupt (shown as partial bubble)
  expression: null, // 'surprised' | 'empathetic' | 'positive' | null
  error: null,
  isMicEnabled: false,
  lastUserMessage: null, // stored for retry after error
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, avatarState: action.payload };
    case 'SET_CONVERSATION':
      return { ...state, conversationId: action.payload };
    case 'SET_GENERATION':
      return { ...state, generationId: action.payload };
    case 'APPEND_TEXT':
      return { ...state, currentText: state.currentText + action.payload };
    case 'CLEAR_TEXT':
      return { ...state, currentText: '', partialText: '', captionText: '' };
    case 'APPEND_CAPTION':
      return { ...state, captionText: state.captionText ? state.captionText + ' ' + action.payload : action.payload };
    case 'SAVE_PARTIAL':
      return { ...state, partialText: state.currentText };
    case 'SET_EXPRESSION':
      return { ...state, expression: action.payload };
    case 'SET_LAST_MESSAGE':
      return { ...state, lastUserMessage: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, avatarState: STATES.ERROR };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_MIC':
      return { ...state, isMicEnabled: action.payload };
    default:
      return state;
  }
}

export function PipelineProvider({ children, onMessage }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const streamRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const sentenceQueueRef = useRef([]);
  const isSpeakingRef = useRef(false);
  // Rate limiting for interrupts — #97
  const lastInterruptTimeRef = useRef(0);
  // Expression auto-clear timer
  const expressionTimerRef = useRef(null);
  // Per-model thinking timeout — #54
  const thinkingTimerRef = useRef(null);
  const avatarStateRef = useRef(STATES.IDLE); // mirrors state.avatarState for stale-closure-free reads
  // Live caption word reveal — #98
  const captionWordsRef = useRef([]); // queue of pending words to reveal
  const captionTimerRef = useRef(null);

  // Keep avatarStateRef in sync with state.avatarState for stale-closure-free reads — #54
  useEffect(() => {
    avatarStateRef.current = state.avatarState;
  }, [state.avatarState]);

  // Register audio player
  const registerAudioPlayer = useCallback((player) => {
    audioPlayerRef.current = player;
  }, []);

  // Set expression with auto-reset after delay
  const setExpressionWithTimer = useCallback((expr) => {
    if (expressionTimerRef.current) {
      clearTimeout(expressionTimerRef.current);
    }
    dispatch({ type: 'SET_EXPRESSION', payload: expr });
    if (expr) {
      expressionTimerRef.current = setTimeout(() => {
        dispatch({ type: 'SET_EXPRESSION', payload: null });
        expressionTimerRef.current = null;
      }, 3000);
    }
  }, []);

  // Stop caption word-reveal interval — #98
  const stopCaptionReveal = useCallback(() => {
    if (captionTimerRef.current) {
      clearInterval(captionTimerRef.current);
      captionTimerRef.current = null;
    }
  }, []);

  // Start caption word-reveal interval — #98
  // Reveals queued words one-by-one at CAPTION_WORD_INTERVAL_MS rate
  const startCaptionReveal = useCallback(() => {
    if (captionTimerRef.current) return; // already running
    captionTimerRef.current = setInterval(() => {
      if (captionWordsRef.current.length === 0) {
        // Nothing left to reveal — keep timer alive (more words may arrive)
        return;
      }
      const word = captionWordsRef.current.shift();
      dispatch({ type: 'APPEND_CAPTION', payload: word });
    }, CAPTION_WORD_INTERVAL_MS);
  }, []);

  // Send a message through the pipeline
  // modelId is optional — used to determine the per-model thinking timeout (#54)
  const sendMessage = useCallback(
    async (text, conversationId, modelId) => {
      if (!text?.trim()) return;

      // Cancel any active stream
      if (streamRef.current) {
        streamRef.current.abort();
        streamRef.current = null;
      }

      // Stop any playing audio
      if (audioPlayerRef.current) {
        audioPlayerRef.current.stop();
      }

      // Clear caption state and pending words — #98
      stopCaptionReveal();
      captionWordsRef.current = [];

      sentenceQueueRef.current = [];
      isSpeakingRef.current = false;

      const genId = uuidv4();
      const convId = conversationId || state.conversationId;

      dispatch({ type: 'SET_GENERATION', payload: genId });
      // Brief CONNECTING state before THINKING — #93
      dispatch({ type: 'SET_STATE', payload: STATES.CONNECTING });
      dispatch({ type: 'CLEAR_TEXT' });
      dispatch({ type: 'CLEAR_ERROR' });
      dispatch({ type: 'SET_LAST_MESSAGE', payload: { text, conversationId: convId, modelId } });

      // Notify parent about user message (includes genId for stale audio prevention)
      if (onMessage) {
        onMessage({
          type: 'user_message',
          text,
          conversationId: convId,
          generationId: genId,
        });
      }

      let resolvedConvId = convId;
      let firstTokenReceived = false; // used to cancel thinking timeout on first content

      // Start per-model thinking timeout — #54
      const thinkingTimeoutMs = getThinkingTimeout(modelId);
      if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = setTimeout(() => {
        // Only fire if still in THINKING/CONNECTING and no content received yet
        const curState = avatarStateRef.current;
        if (!firstTokenReceived && (curState === STATES.THINKING || curState === STATES.CONNECTING)) {
          console.warn(`[Pipeline] Thinking timeout (${thinkingTimeoutMs}ms) for model: ${modelId || 'default'}`);
          if (streamRef.current) {
            streamRef.current.abort();
            streamRef.current = null;
          }
          dispatch({ type: 'SET_ERROR', payload: `Response timed out after ${thinkingTimeoutMs / 1000}s. Please try again.` });
        }
        thinkingTimerRef.current = null;
      }, thinkingTimeoutMs);

      streamRef.current = streamMessage({
        text,
        conversationId: convId,
        generationId: genId,
        modelId,  // Bug 10 fix: forward modelId so server uses correct model immediately
        onEvent: (event) => {
          if (event.generation_id && event.generation_id !== genId) return;

          switch (event.type) {
            case 'state':
              if (event.state === 'thinking') {
                dispatch({ type: 'SET_STATE', payload: STATES.THINKING });
              }
              if (event.conversation_id && !resolvedConvId) {
                resolvedConvId = event.conversation_id;
                dispatch({ type: 'SET_CONVERSATION', payload: event.conversation_id });
              }
              break;

            case 'text_token':
              // Cancel thinking timeout on first token — #54
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                if (thinkingTimerRef.current) {
                  clearTimeout(thinkingTimerRef.current);
                  thinkingTimerRef.current = null;
                }
              }
              dispatch({ type: 'APPEND_TEXT', payload: event.token });
              break;

            case 'sentence': {
              // Cancel thinking timeout on first sentence — #54
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                if (thinkingTimerRef.current) {
                  clearTimeout(thinkingTimerRef.current);
                  thinkingTimerRef.current = null;
                }
              }

              // Queue sentence for TTS playback
              sentenceQueueRef.current.push(event.text);
              dispatch({ type: 'SET_STATE', payload: STATES.SPEAKING });

              // Queue words for audio-synchronized caption reveal — #98
              const words = event.text.split(/\s+/).filter(Boolean);
              captionWordsRef.current.push(...words);
              startCaptionReveal(); // start or keep running

              // Sentiment expression detection — #88-90
              const expr = detectExpression(event.text);
              if (expr) setExpressionWithTimer(expr);

              // Notify for audio player to pick up
              if (onMessage) {
                onMessage({
                  type: 'sentence_ready',
                  text: event.text,
                  ttsMode: event.tts_mode,
                  generationId: genId,
                  isFinal: event.is_final,
                });
              }
              break;
            }

            case 'complete':
              if (event.conversation_id) {
                dispatch({ type: 'SET_CONVERSATION', payload: event.conversation_id });
              }
              if (onMessage) {
                onMessage({ type: 'generation_complete', conversationId: event.conversation_id });
              }
              break;

            case 'error':
              // Cancel thinking timeout on error — #54
              if (thinkingTimerRef.current) {
                clearTimeout(thinkingTimerRef.current);
                thinkingTimerRef.current = null;
              }
              stopCaptionReveal();
              dispatch({ type: 'SET_ERROR', payload: event.message });
              if (onMessage) onMessage({ type: 'error', message: event.message });
              break;
          }
        },
        onError: (err) => {
          // Cancel thinking timeout on error — #54
          if (thinkingTimerRef.current) {
            clearTimeout(thinkingTimerRef.current);
            thinkingTimerRef.current = null;
          }
          stopCaptionReveal();
          console.error('[Pipeline] Stream error:', err.message);
          dispatch({ type: 'SET_ERROR', payload: err.message });
        },
        onComplete: () => {
          streamRef.current = null;
        },
      });
    },
    [state.conversationId, onMessage, setExpressionWithTimer, startCaptionReveal, stopCaptionReveal]
  );

  // Interrupt current generation
  const interrupt = useCallback(async () => {
    const { generationId, conversationId, isMicEnabled } = state;

    // Rate limiting: ignore rapid successive interrupts — #97
    const now = Date.now();
    if (now - lastInterruptTimeRef.current < INTERRUPT_COOLDOWN_MS) {
      return;
    }
    lastInterruptTimeRef.current = now;

    // Cancel thinking timeout on interrupt — #54
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }

    // Stop caption reveal — #98
    stopCaptionReveal();
    captionWordsRef.current = [];

    if (streamRef.current) {
      streamRef.current.abort();
      streamRef.current = null;
    }

    // 100ms audio fade-out — #95
    if (audioPlayerRef.current) {
      audioPlayerRef.current.fadeOut(100);
    }

    sentenceQueueRef.current = [];
    isSpeakingRef.current = false;

    // Snapshot current partial text before clearing — #96
    dispatch({ type: 'SAVE_PARTIAL' });

    // Show INTERRUPTED state briefly — #91
    dispatch({ type: 'SET_STATE', payload: STATES.INTERRUPTED });

    if (generationId) {
      try {
        await sendInterrupt(generationId, conversationId);
      } catch (err) {
        console.warn('[Pipeline] Interrupt signal failed:', err.message);
      }
    }

    // After showing INTERRUPTED briefly, return to LISTENING or IDLE
    // Also trigger a transcript reload so partial message appears — #96
    setTimeout(() => {
      dispatch({ type: 'SET_STATE', payload: isMicEnabled ? STATES.LISTENING : STATES.IDLE });
      dispatch({ type: 'CLEAR_TEXT' }); // clear streaming preview
      // Reload conversation to show saved partial message
      if (conversationId) {
        window.dispatchEvent(new CustomEvent('companion:generation-complete', {
          detail: { conversationId },
        }));
      }
    }, 1200);
  }, [state, stopCaptionReveal]);

  // Clear error state and return to idle
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
    dispatch({ type: 'SET_STATE', payload: STATES.IDLE });
  }, []);

  // Retry the last failed message
  const retryLastMessage = useCallback(() => {
    const { lastUserMessage } = state;
    if (!lastUserMessage) return;
    dispatch({ type: 'CLEAR_ERROR' });
    dispatch({ type: 'SET_STATE', payload: STATES.IDLE });
    sendMessage(lastUserMessage.text, lastUserMessage.conversationId, lastUserMessage.modelId);
  }, [state, sendMessage]);

  // Called when audio finishes playing all queued sentences
  const onAudioComplete = useCallback(() => {
    isSpeakingRef.current = false;
    // Flush any remaining caption words immediately when audio ends — #98
    stopCaptionReveal();
    if (captionWordsRef.current.length > 0) {
      const remaining = captionWordsRef.current.join(' ');
      captionWordsRef.current = [];
      dispatch({ type: 'APPEND_CAPTION', payload: remaining });
    }
    dispatch({ type: 'SET_STATE', payload: STATES.IDLE });
  }, [stopCaptionReveal]);

  const setMicEnabled = useCallback((enabled) => {
    dispatch({ type: 'SET_MIC', payload: enabled });
    if (enabled) {
      dispatch({ type: 'SET_STATE', payload: STATES.IDLE });
    }
  }, []);

  const setListening = useCallback(() => {
    dispatch({ type: 'SET_STATE', payload: STATES.LISTENING });
  }, []);

  const setIdle = useCallback(() => {
    if (state.avatarState !== STATES.SPEAKING) {
      dispatch({ type: 'SET_STATE', payload: STATES.IDLE });
    }
  }, [state.avatarState]);

  return (
    <PipelineContext.Provider
      value={{
        ...state,
        sendMessage,
        interrupt,
        clearError,
        retryLastMessage,
        registerAudioPlayer,
        onAudioComplete,
        setMicEnabled,
        setListening,
        setIdle,
      }}
    >
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error('usePipeline must be used within PipelineProvider');
  return ctx;
}
