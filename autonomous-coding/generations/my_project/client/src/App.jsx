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
} from './services/api.js';
import { v4 as uuidv4 } from './utils/uuid.js';

// ── CompanionApp: the main UI, inside PipelineProvider context ────────────────

function CompanionApp({ sharedAudioRef }) {
  const { volume, showTranscript } = useApp();
  const { avatarState, sendMessage, interrupt, registerAudioPlayer, onAudioComplete, setMicEnabled } = usePipeline();

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

      sendMessage(text.trim(), convId);
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
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4">
          {/* Avatar area */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700"
              style={{ width: '100%', maxWidth: '340px', aspectRatio: '3/4' }}
            >
              <AvatarCanvas avatarState={avatarState} mouthOpenness={mouthOpenness} />
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
        <MicrophoneManager enabled={micEnabled} onTranscript={handleTranscript} />
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
  // Handle pipeline messages at this level, where we have access to sharedAudioRef
  const handleMessage = useCallback((event) => {
    switch (event.type) {
      case 'sentence_ready':
        // Use browser TTS via the shared audio player
        if (sharedAudioRef.current) {
          sharedAudioRef.current.speakBrowser(event.text);
        }
        break;

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
