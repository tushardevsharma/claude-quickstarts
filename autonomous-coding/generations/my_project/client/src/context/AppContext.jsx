import { createContext, useContext, useReducer, useEffect } from 'react';
import { getSettings, updateSettings } from '../services/api.js';

const AppContext = createContext(null);

const initialState = {
  theme: 'auto', // 'light' | 'dark' | 'auto'
  volume: 80,
  speechRate: 1.0,
  showTranscript: true,
  inputMode: 'voice', // 'voice' | 'text'
  model: 'claude-sonnet-4-5-20250929',
  capabilities: {
    elevenlabs: false,
    deepgram: false,
  },
  isSettingsLoaded: false,
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
        model: action.payload.model || state.model,
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
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load settings on mount
  useEffect(() => {
    getSettings()
      .then(({ settings }) => {
        dispatch({ type: 'SET_SETTINGS', payload: settings });
      })
      .catch((err) => {
        console.warn('[AppContext] Failed to load settings:', err.message);
        dispatch({ type: 'SET_SETTINGS', payload: {} });
      });
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

  return (
    <AppContext.Provider
      value={{
        ...state,
        setTheme,
        setVolume,
        setShowTranscript,
        setInputMode,
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
