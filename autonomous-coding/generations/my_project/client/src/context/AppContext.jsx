import { createContext, useContext, useReducer, useEffect } from 'react';
import { getSettings, updateSettings, listModels } from '../services/api.js';
import { connectWebSocket, sendWsMessage, addWsListener, disconnectWebSocket } from '../services/websocket.js';

const AppContext = createContext(null);

const initialState = {
  theme: 'auto', // 'light' | 'dark' | 'auto'
  volume: 80,
  speechRate: 1.0,
  showTranscript: true,
  inputMode: 'voice', // 'voice' | 'text'
  // Model settings
  activeModel: 'claude-sonnet-4-5',
  modelSwitchingScope: 'this_conversation', // 'this_conversation' | 'all_new_conversations'
  showModelIndicator: true,
  // Voice settings
  ttsVoice: 'default',
  // Avatar settings
  avatarCharacter: 'nova',
  idleAnimationIntensity: 1, // 0=subtle, 1=medium, 2=lively
  // Input settings
  pushToTalk: false,
  // Display settings
  captionFontSize: 'medium', // 'small' | 'medium' | 'large'
  // AI settings
  responseStyle: 'concise', // 'concise' | 'verbose'
  // Privacy settings
  storeHistory: true,
  // Capabilities
  capabilities: {
    elevenlabs: false,
    deepgram: false,
  },
  isSettingsLoaded: false,
  // Available models from server
  availableModels: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_SETTINGS':
      return {
        ...state,
        theme: action.payload.theme || state.theme,
        volume: action.payload.volume ?? state.volume,
        speechRate: action.payload.speech_rate ?? state.speechRate,
        showTranscript: action.payload.show_transcript ?? state.showTranscript,
        inputMode: action.payload.input_mode || state.inputMode,
        activeModel: action.payload.active_model || action.payload.model || state.activeModel,
        modelSwitchingScope: action.payload.model_switching_scope || state.modelSwitchingScope,
        showModelIndicator: action.payload.show_model_indicator ?? state.showModelIndicator,
        ttsVoice: action.payload.tts_voice || state.ttsVoice,
        avatarCharacter: action.payload.avatar_character || state.avatarCharacter,
        idleAnimationIntensity: action.payload.idle_animation_intensity ?? state.idleAnimationIntensity,
        pushToTalk: action.payload.push_to_talk ?? state.pushToTalk,
        captionFontSize: action.payload.caption_font_size || state.captionFontSize,
        responseStyle: action.payload.response_style || state.responseStyle,
        storeHistory: action.payload.store_history ?? state.storeHistory,
        capabilities: action.payload._capabilities || state.capabilities,
        isSettingsLoaded: true,
      };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'SET_VOLUME':
      return { ...state, volume: action.payload };
    case 'SET_SHOW_TRANSCRIPT':
      return { ...state, showTranscript: action.payload };
    case 'SET_INPUT_MODE':
      return { ...state, inputMode: action.payload };
    case 'SET_ACTIVE_MODEL':
      return { ...state, activeModel: action.payload };
    case 'SET_MODEL_SWITCHING_SCOPE':
      return { ...state, modelSwitchingScope: action.payload };
    case 'SET_SHOW_MODEL_INDICATOR':
      return { ...state, showModelIndicator: action.payload };
    case 'SET_TTS_VOICE':
      return { ...state, ttsVoice: action.payload };
    case 'SET_IDLE_ANIMATION_INTENSITY':
      return { ...state, idleAnimationIntensity: action.payload };
    case 'SET_PUSH_TO_TALK':
      return { ...state, pushToTalk: action.payload };
    case 'SET_CAPTION_FONT_SIZE':
      return { ...state, captionFontSize: action.payload };
    case 'SET_RESPONSE_STYLE':
      return { ...state, responseStyle: action.payload };
    case 'SET_STORE_HISTORY':
      return { ...state, storeHistory: action.payload };
    case 'SET_SPEECH_RATE':
      return { ...state, speechRate: action.payload };
    case 'SET_AVAILABLE_MODELS':
      return { ...state, availableModels: action.payload };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load settings and models on mount; connect WebSocket
  useEffect(() => {
    Promise.all([
      getSettings().catch(() => ({ settings: {} })),
      listModels().catch(() => ({ models: [] })),
    ]).then(([{ settings }, { models }]) => {
      dispatch({ type: 'SET_SETTINGS', payload: settings });
      if (models?.length) {
        dispatch({ type: 'SET_AVAILABLE_MODELS', payload: models });
      }
    });

    // Connect WebSocket for real-time model switching — #54-57, #82
    connectWebSocket();

    // Handle model_switched ACK from server — #55
    const removeListener = addWsListener((msg) => {
      if (msg.type === 'model_switched') {
        dispatch({ type: 'SET_ACTIVE_MODEL', payload: msg.model_id });
      }
    });

    return () => {
      removeListener();
      disconnectWebSocket();
    };
  }, []);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const effectiveTheme =
      state.theme === 'auto'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : state.theme;

    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.theme]);

  // Apply caption font size to document root
  useEffect(() => {
    const sizes = { small: '0.8125rem', medium: '0.9375rem', large: '1.0625rem' };
    document.documentElement.style.setProperty(
      '--caption-font-size',
      sizes[state.captionFontSize] || sizes.medium
    );
  }, [state.captionFontSize]);

  const setTheme = (theme) => {
    dispatch({ type: 'SET_THEME', payload: theme });
    updateSettings({ theme }).catch(console.warn);
  };

  const setVolume = (volume) => {
    dispatch({ type: 'SET_VOLUME', payload: volume });
    updateSettings({ volume }).catch(console.warn);
  };

  const setShowTranscript = (show) => {
    dispatch({ type: 'SET_SHOW_TRANSCRIPT', payload: show });
    updateSettings({ show_transcript: show }).catch(console.warn);
  };

  const setInputMode = (mode) => {
    dispatch({ type: 'SET_INPUT_MODE', payload: mode });
    updateSettings({ input_mode: mode }).catch(console.warn);
  };

  const setActiveModel = (modelId, scope) => {
    dispatch({ type: 'SET_ACTIVE_MODEL', payload: modelId });
    const effectiveScope = scope || state.modelSwitchingScope;

    // Send via WebSocket for real-time model switching — #54
    const sent = sendWsMessage({ type: 'model_switch', model_id: modelId, scope: effectiveScope });

    // Fallback to HTTP settings if WebSocket not connected
    if (!sent) {
      updateSettings({ active_model: modelId, model: modelId }).catch(console.warn);
      if (effectiveScope === 'all_new_conversations') {
        updateSettings({ model: modelId }).catch(console.warn);
      }
    }
  };

  const setModelSwitchingScope = (scope) => {
    dispatch({ type: 'SET_MODEL_SWITCHING_SCOPE', payload: scope });
    updateSettings({ model_switching_scope: scope }).catch(console.warn);
  };

  const setShowModelIndicator = (show) => {
    dispatch({ type: 'SET_SHOW_MODEL_INDICATOR', payload: show });
    updateSettings({ show_model_indicator: show }).catch(console.warn);
  };

  const setTtsVoice = (voice) => {
    dispatch({ type: 'SET_TTS_VOICE', payload: voice });
    updateSettings({ tts_voice: voice }).catch(console.warn);
  };

  const setIdleAnimationIntensity = (intensity) => {
    dispatch({ type: 'SET_IDLE_ANIMATION_INTENSITY', payload: intensity });
    updateSettings({ idle_animation_intensity: intensity }).catch(console.warn);
  };

  const setPushToTalk = (val) => {
    dispatch({ type: 'SET_PUSH_TO_TALK', payload: val });
    updateSettings({ push_to_talk: val }).catch(console.warn);
  };

  const setCaptionFontSize = (size) => {
    dispatch({ type: 'SET_CAPTION_FONT_SIZE', payload: size });
    updateSettings({ caption_font_size: size }).catch(console.warn);
  };

  const setResponseStyle = (style) => {
    dispatch({ type: 'SET_RESPONSE_STYLE', payload: style });
    updateSettings({ response_style: style }).catch(console.warn);
  };

  const setStoreHistory = (val) => {
    dispatch({ type: 'SET_STORE_HISTORY', payload: val });
    updateSettings({ store_history: val }).catch(console.warn);
  };

  const setSpeechRate = (rate) => {
    dispatch({ type: 'SET_SPEECH_RATE', payload: rate });
    updateSettings({ speech_rate: rate }).catch(console.warn);
  };

  return (
    <AppContext.Provider
      value={{
        ...state,
        setTheme,
        setVolume,
        setShowTranscript,
        setInputMode,
        setActiveModel,
        setModelSwitchingScope,
        setShowModelIndicator,
        setTtsVoice,
        setIdleAnimationIntensity,
        setPushToTalk,
        setCaptionFontSize,
        setResponseStyle,
        setStoreHistory,
        setSpeechRate,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
