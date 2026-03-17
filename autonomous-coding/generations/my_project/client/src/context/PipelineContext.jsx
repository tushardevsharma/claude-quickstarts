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
};

const PipelineContext = createContext(null);

const initialState = {
  avatarState: STATES.IDLE,
  conversationId: null,
  generationId: null,
  currentText: '', // streaming text being built
  error: null,
  isMicEnabled: false,
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
      return { ...state, currentText: '' };
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

  // Register audio player
  const registerAudioPlayer = useCallback((player) => {
    audioPlayerRef.current = player;
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
      dispatch({ type: 'SET_STATE', payload: STATES.THINKING });
      dispatch({ type: 'CLEAR_TEXT' });
      dispatch({ type: 'CLEAR_ERROR' });

      // Notify parent about user message
      if (onMessage) {
        onMessage({
          type: 'user_message',
          text,
          conversationId: convId,
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

            case 'sentence':
              // Queue sentence for TTS playback
              sentenceQueueRef.current.push(event.text);
              dispatch({ type: 'SET_STATE', payload: STATES.SPEAKING });
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
    [state.conversationId, onMessage]
  );

  // Interrupt current generation
  const interrupt = useCallback(async () => {
    const { generationId, conversationId } = state;

    if (streamRef.current) {
      streamRef.current.abort();
      streamRef.current = null;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.fadeOut();
    }

    sentenceQueueRef.current = [];
    isSpeakingRef.current = false;

    dispatch({ type: 'SET_STATE', payload: STATES.LISTENING });

    if (generationId) {
      try {
        await sendInterrupt(generationId, conversationId);
      } catch (err) {
        console.warn('[Pipeline] Interrupt signal failed:', err.message);
      }
    }
  }, [state]);

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
