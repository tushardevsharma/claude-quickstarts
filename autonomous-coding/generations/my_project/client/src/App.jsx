import { useState, useEffect, useRef, useCallback } from 'react';
import { AppProvider, useApp } from './context/AppContext.jsx';
import { PipelineProvider, usePipeline, STATES } from './context/PipelineContext.jsx';
import AvatarCanvas from './components/Avatar/AvatarCanvas.jsx';
import StateIndicator from './components/Chat/StateIndicator.jsx';
import TranscriptPanel from './components/Chat/TranscriptPanel.jsx';
import TextInput from './components/Chat/TextInput.jsx';
import MicrophoneManager from './components/Voice/MicrophoneManager.jsx';
import SettingsPanel from './components/Settings/SettingsPanel.jsx';
import Sidebar from './components/Layout/Sidebar.jsx';
import Header from './components/Layout/Header.jsx';
import { AudioPlayer } from './components/Voice/AudioPlayer.js';
import {
  listConversations,
  createConversation,
  getConversation,
  fetchTTSAudio,
} from './services/api.js';
import { v4 as uuidv4 } from './utils/uuid.js';

// ── CompanionApp: the main UI, inside PipelineProvider context ────────────────

// Model tier badge colors
const MODEL_BADGE = {
  'claude-haiku-4-5': { color: 'bg-blue-500', label: 'Haiku', tier: 'fast' },
  'claude-sonnet-4-5': { color: 'bg-green-500', label: 'Sonnet', tier: 'balanced' },
  'claude-opus-4-5': { color: 'bg-amber-500', label: 'Opus', tier: 'powerful' },
};

function ModelBadge({ modelId }) {
  const badge = MODEL_BADGE[modelId] || MODEL_BADGE['claude-sonnet-4-5'];
  return (
    <div
      className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-2 py-1 z-10"
      title={`Active model: ${badge.label}`}
    >
      <div className={`w-2 h-2 rounded-full ${badge.color}`} />
      <span className="text-white text-xs font-medium leading-none">{badge.label}</span>
    </div>
  );
}

function CompanionApp({ sharedAudioRef }) {
  const { volume, showTranscript, activeModel, showModelIndicator, inputMode, pushToTalk, isSettingsLoaded } = useApp();
  const { avatarState, error, sendMessage, interrupt, clearError, retryLastMessage, registerAudioPlayer, onAudioComplete, setMicEnabled } = usePipeline();

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [micEnabled, setMicEnabledLocal] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  // Conversation state
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [activeConvIdRef] = useState({ current: null }); // stable ref for callbacks
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Mouth openness for lip-sync
  const [mouthOpenness, setMouthOpenness] = useState(0);

  // Persistent mic error (shown even after MicrophoneManager unmounts)
  const [micError, setMicError] = useState(null);

  // ── Init audio player ────────────────────────────────────────────────────
  useEffect(() => {
    const player = new AudioPlayer({
      volume: volume / 100,
      onEnd: () => onAudioComplete(),
      onMouthOpenness: (openness) => setMouthOpenness(openness),
    });
    // Share with parent handler AND register in pipeline context
    sharedAudioRef.current = player;
    registerAudioPlayer(player);
    return () => {
      player.stop();
      sharedAudioRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync volume to audio player
  useEffect(() => {
    if (sharedAudioRef.current) {
      sharedAudioRef.current.setVolume(volume / 100);
    }
  }, [volume, sharedAudioRef]);

  // ── Auto-enable mic when default input mode is 'voice' — #69 ────────────
  useEffect(() => {
    if (isSettingsLoaded && inputMode === 'voice' && !micEnabled && !pushToTalk) {
      setMicEnabledLocal(true);
      setMicEnabled(true);
    }
  }, [isSettingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Push-to-talk: hold spacebar to activate mic — #70 ────────────────────
  useEffect(() => {
    if (!pushToTalk) return;
    let isHolding = false;

    const handleKeyDown = (e) => {
      if (e.code !== 'Space' || e.repeat || isHolding) return;
      // Don't intercept when typing in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      isHolding = true;
      setMicEnabledLocal(true);
      setMicEnabled(true);
    };

    const handleKeyUp = (e) => {
      if (e.code !== 'Space' || !isHolding) return;
      e.preventDefault();
      isHolding = false;
      setMicEnabledLocal(false);
      setMicEnabled(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pushToTalk, setMicEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load conversations on mount ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { conversations: convs } = await listConversations();
        setConversations(convs);
        if (convs.length > 0) {
          const { conversation, messages: msgs } = await getConversation(convs[0].id);
          setActiveConversationId(conversation.id);
          activeConvIdRef.current = conversation.id;
          setMessages(msgs);
        }
      } catch (err) {
        console.warn('Failed to load conversations:', err.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep ref in sync with state ──────────────────────────────────────────
  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
  }, [activeConversationId, activeConvIdRef]);

  // ── Conversation reload after generation completes ───────────────────────
  const reloadConversation = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const [{ messages: msgs }, { conversations: convs }] = await Promise.all([
        getConversation(convId),
        listConversations(),
      ]);
      setMessages(msgs);
      setConversations(convs);
    } catch (err) {
      console.warn('Failed to reload conversation:', err.message);
    }
  }, []);

  // ── Handle send (text or voice) ──────────────────────────────────────────
  const handleSend = useCallback(
    async (text) => {
      if (!text?.trim()) return;

      let convId = activeConvIdRef.current;
      if (!convId) {
        try {
          const { conversation } = await createConversation();
          convId = conversation.id;
          setActiveConversationId(convId);
          activeConvIdRef.current = convId;
          setConversations((prev) => [conversation, ...prev]);
        } catch (err) {
          console.error('Failed to create conversation:', err);
          return;
        }
      }

      // Optimistic user message
      setMessages((prev) => [
        ...prev,
        { id: `temp-${uuidv4()}`, role: 'user', content: text.trim(), created_at: new Date().toISOString() },
      ]);

      // Pass activeModel so pipeline can apply per-model thinking timeout — #54
      sendMessage(text.trim(), convId, activeModel);
    },
    [activeConvIdRef, sendMessage]
  );

  // ── Handle voice transcript ──────────────────────────────────────────────
  const handleTranscript = useCallback(
    (text, isFinal) => {
      if (isFinal) {
        setInterimTranscript('');
        handleSend(text);
      } else {
        setInterimTranscript(text);
      }
    },
    [handleSend]
  );

  // ── Mic toggle ───────────────────────────────────────────────────────────
  const handleMicToggle = () => {
    const newVal = !micEnabled;
    setMicEnabledLocal(newVal);
    setMicEnabled(newVal);
  };

  // ── Mic permission denied ────────────────────────────────────────────────
  const handleMicPermissionDenied = useCallback((errMsg) => {
    setMicEnabledLocal(false);
    setMicEnabled(false);
    setMicError(errMsg || 'Microphone permission denied. Please allow microphone access in your browser settings.');
  }, [setMicEnabled]);

  // ── New conversation ─────────────────────────────────────────────────────
  const handleNewConversation = async () => {
    interrupt();
    try {
      const { conversation } = await createConversation();
      setActiveConversationId(conversation.id);
      activeConvIdRef.current = conversation.id;
      setMessages([]);
      setConversations((prev) => [conversation, ...prev]);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  // ── Select conversation ──────────────────────────────────────────────────
  const handleSelectConversation = async (conv) => {
    if (conv.id === activeConvIdRef.current) return;
    interrupt();
    try {
      const { conversation, messages: msgs } = await getConversation(conv.id);
      setActiveConversationId(conversation.id);
      activeConvIdRef.current = conversation.id;
      setMessages(msgs);
    } catch (err) {
      console.warn('Failed to select conversation:', err.message);
    }
  };

  // ── Delete conversation ──────────────────────────────────────────────────
  const handleDeleteConversation = (id) => {
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (id === activeConvIdRef.current) {
        if (remaining.length > 0) {
          getConversation(remaining[0].id).then(({ conversation, messages: msgs }) => {
            setActiveConversationId(conversation.id);
            activeConvIdRef.current = conversation.id;
            setMessages(msgs);
          }).catch(console.warn);
        } else {
          setActiveConversationId(null);
          activeConvIdRef.current = null;
          setMessages([]);
        }
      }
      return remaining;
    });
  };

  // ── Clear all history ────────────────────────────────────────────────────
  const handleClearHistory = () => {
    setConversations([]);
    setMessages([]);
    setActiveConversationId(null);
    activeConvIdRef.current = null;
  };

  // ── Generation complete - reload messages ────────────────────────────────
  // This is triggered via PipelineContext's onMessage (in parent wrapper)
  // We expose a reload method via effect
  useEffect(() => {
    // Listen for custom events from PipelineWrapper
    const handler = (e) => {
      reloadConversation(e.detail?.conversationId);
    };
    window.addEventListener('companion:generation-complete', handler);
    return () => window.removeEventListener('companion:generation-complete', handler);
  }, [reloadConversation]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Header */}
      <Header
        onMenuClick={() => setSidebarOpen(true)}
        onSettingsClick={() => setSettingsOpen(true)}
        micEnabled={micEnabled}
        onMicToggle={handleMicToggle}
      />

      {/* Scrollable main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 flex flex-col gap-4">
          {/* Avatar area */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700"
              style={{ width: '100%', maxWidth: '340px', aspectRatio: '3/4' }}
            >
              <AvatarCanvas avatarState={avatarState} mouthOpenness={mouthOpenness} />
              {showModelIndicator && <ModelBadge modelId={activeModel} />}
            </div>
            <StateIndicator state={avatarState} />
          </div>

          {/* Transcript */}
          {showTranscript && (
            <TranscriptPanel
              messages={messages}
              isCollapsed={transcriptCollapsed}
              onToggle={() => setTranscriptCollapsed((v) => !v)}
            />
          )}
        </div>
      </main>

      {/* Input bar */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <TextInput onSend={handleSend} interimTranscript={interimTranscript} />
        </div>
      </div>

      {/* Overlays */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(conv) => { handleSelectConversation(conv); setSidebarOpen(false); }}
        onNewConversation={() => { handleNewConversation(); setSidebarOpen(false); }}
        onDeleteConversation={handleDeleteConversation}
      />

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onClearHistory={handleClearHistory}
      />

      {micEnabled && (
        <MicrophoneManager
          enabled={micEnabled}
          onTranscript={handleTranscript}
          onPermissionDenied={handleMicPermissionDenied}
        />
      )}

      {/* Mic permission error toast */}
      {micError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div className="bg-orange-600 dark:bg-orange-700 text-white rounded-xl px-4 py-3 shadow-xl flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Microphone unavailable</p>
              <p className="text-xs text-orange-100 mt-0.5">{micError}</p>
              <p className="text-xs text-orange-200 mt-1">You can still use text input to chat.</p>
            </div>
            <button
              onClick={() => setMicError(null)}
              className="text-orange-200 hover:text-white flex-shrink-0 mt-0.5"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && avatarState === STATES.ERROR && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div className="bg-red-600 dark:bg-red-700 text-white rounded-xl px-4 py-3 shadow-xl flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Something went wrong</p>
              <p className="text-xs text-red-100 mt-0.5 break-words">{error}</p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <button
                onClick={retryLastMessage}
                className="text-xs bg-white/25 hover:bg-white/35 px-2 py-1 rounded-md transition-colors font-medium w-full text-center"
                title="Retry last message"
              >
                Retry
              </button>
              <button
                onClick={clearError}
                className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded-md transition-colors w-full text-center"
                title="Dismiss error"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-gray-950/80 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Loading companion...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── App root: wires everything together ───────────────────────────────────────

export default function App() {
  // Shared ref: PipelineWrapper creates this, CompanionApp populates it
  const sharedAudioRef = useRef(null);

  return (
    <AppProvider>
      <PipelineWrapper sharedAudioRef={sharedAudioRef} />
    </AppProvider>
  );
}

function PipelineWrapper({ sharedAudioRef }) {
  // Track current generation ID to prevent stale audio from playing — #85
  const currentGenIdRef = useRef(null);

  // Handle pipeline messages at this level, where we have access to sharedAudioRef
  const handleMessage = useCallback((event) => {
    switch (event.type) {
      case 'user_message':
        // Update current generation ID when a new message is sent
        if (event.generationId) {
          currentGenIdRef.current = event.generationId;
        }
        break;

      case 'sentence_ready': {
        // Stale audio prevention: discard TTS from old generations — #85
        if (event.generationId && currentGenIdRef.current &&
            event.generationId !== currentGenIdRef.current) {
          console.debug('[TTS] Discarding stale audio for gen:', event.generationId);
          break;
        }
        if (!sharedAudioRef.current) break;
        const capturedGenId = event.generationId;
        if (event.ttsMode === 'elevenlabs') {
          fetchTTSAudio(event.text)
            .then((arrayBuffer) => {
              // Re-check generation ID when fetch completes (async guard)
              if (capturedGenId && currentGenIdRef.current &&
                  capturedGenId !== currentGenIdRef.current) return;
              sharedAudioRef.current?.playAudioBuffer(arrayBuffer);
            })
            .catch((err) => {
              console.warn('[TTS] ElevenLabs failed, falling back to browser TTS:', err.message);
              if (capturedGenId && currentGenIdRef.current &&
                  capturedGenId !== currentGenIdRef.current) return;
              sharedAudioRef.current?.speakBrowser(event.text);
            });
        } else {
          sharedAudioRef.current.speakBrowser(event.text);
        }
        break;
      }

      case 'generation_complete':
        // Notify CompanionApp to reload messages
        window.dispatchEvent(
          new CustomEvent('companion:generation-complete', {
            detail: { conversationId: event.conversationId },
          })
        );
        break;
    }
  }, [sharedAudioRef]);

  return (
    <PipelineProvider onMessage={handleMessage}>
      <CompanionApp sharedAudioRef={sharedAudioRef} />
    </PipelineProvider>
  );
}
