import { createContext, useContext, useReducer, useRef, useCallback } from 'react';
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

const PipelineContext = createContext(null);

const initialState = {
  avatarState: STATES.IDLE,
  conversationId: null,
  generationId: null,
  currentText: '', // streaming text being built
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
      return { ...state, currentText: '', partialText: '' };
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

  // Send a message through the pipeline
  const sendMessage = useCallback(
    async (text, conversationId) => {
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

      sentenceQueueRef.current = [];
      isSpeakingRef.current = false;

      const genId = uuidv4();
      const convId = conversationId || state.conversationId;

      dispatch({ type: 'SET_GENERATION', payload: genId });
      // Brief CONNECTING state before THINKING — #93
      dispatch({ type: 'SET_STATE', payload: STATES.CONNECTING });
      dispatch({ type: 'CLEAR_TEXT' });
      dispatch({ type: 'CLEAR_ERROR' });
      dispatch({ type: 'SET_LAST_MESSAGE', payload: { text, conversationId: convId } });

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

      streamRef.current = streamMessage({
        text,
        conversationId: convId,
        generationId: genId,
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
              dispatch({ type: 'APPEND_TEXT', payload: event.token });
              break;

            case 'sentence': {
              // Queue sentence for TTS playback
              sentenceQueueRef.current.push(event.text);
              dispatch({ type: 'SET_STATE', payload: STATES.SPEAKING });

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
              dispatch({ type: 'SET_ERROR', payload: event.message });
              if (onMessage) onMessage({ type: 'error', message: event.message });
              break;
          }
        },
        onError: (err) => {
          console.error('[Pipeline] Stream error:', err.message);
          dispatch({ type: 'SET_ERROR', payload: err.message });
        },
        onComplete: () => {
          streamRef.current = null;
        },
      });
    },
    [state.conversationId, onMessage, setExpressionWithTimer]
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
  }, [state]);

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
    sendMessage(lastUserMessage.text, lastUserMessage.conversationId);
  }, [state, sendMessage]);

  // Called when audio finishes playing all queued sentences
  const onAudioComplete = useCallback(() => {
    isSpeakingRef.current = false;
    dispatch({ type: 'SET_STATE', payload: STATES.IDLE });
  }, []);

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
