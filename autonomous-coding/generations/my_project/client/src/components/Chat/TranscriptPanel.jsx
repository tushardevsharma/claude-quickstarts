import { useEffect, useRef } from 'react';
import { usePipeline, STATES } from '../../context/PipelineContext.jsx';
import { useApp } from '../../context/AppContext.jsx';

// Model badge colors for non-default turns — #61
const MODEL_BADGE_MAP = {
  'claude-haiku-4-5': { color: 'bg-blue-500', label: 'Haiku' },
  'claude-sonnet-4-5': null, // default — don't show badge
  'claude-opus-4-5': { color: 'bg-amber-500', label: 'Opus' },
};

const DEFAULT_MODEL_ID = 'claude-sonnet-4-5';

function ModelTurnBadge({ modelId }) {
  if (!modelId || modelId === DEFAULT_MODEL_ID) return null;
  const badge = MODEL_BADGE_MAP[modelId];
  if (!badge) return null;
  return (
    <div className={`inline-flex items-center gap-1 ${badge.color} rounded-full px-1.5 py-0.5 mt-1.5`}>
      <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
      <span className="text-white text-[10px] font-medium leading-none">{badge.label}</span>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 animate-slide-up`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex-shrink-0 mr-2 flex items-center justify-center text-white text-xs font-bold mt-1">
          N
        </div>
      )}
      <div className="flex flex-col">
        <div
          className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm'
          }`}
        >
          {message.content}
          {!!message.was_interrupted && (
            <span className="text-xs opacity-60 ml-1">[interrupted]</span>
          )}
        </div>
        {/* Model badge for non-default assistant turns — #61 */}
        {!isUser && <ModelTurnBadge modelId={message.model_id} />}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex-shrink-0 ml-2 flex items-center justify-center text-white text-xs font-bold mt-1">
          Y
        </div>
      )}
    </div>
  );
}

function StreamingMessage({ text, isInterrupted }) {
  return (
    <div className="flex justify-start mb-3">
      <div className={`w-7 h-7 rounded-full flex-shrink-0 mr-2 flex items-center justify-center text-white text-xs font-bold mt-1 ${
        isInterrupted
          ? 'bg-gradient-to-br from-orange-400 to-orange-600'
          : 'bg-gradient-to-br from-violet-500 to-purple-700'
      }`}>
        N
      </div>
      <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed ${
        isInterrupted
          ? 'bg-orange-50 dark:bg-orange-950/30 text-gray-700 dark:text-gray-300 border border-orange-200 dark:border-orange-800/50'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
      }`}>
        {text}
        {isInterrupted ? (
          <span className="text-xs opacity-50 ml-1">[interrupted]</span>
        ) : (
          <span className="inline-block w-0.5 h-3.5 bg-gray-500 dark:bg-gray-400 ml-0.5 align-middle animate-pulse" />
        )}
      </div>
    </div>
  );
}

export default function TranscriptPanel({ messages, isCollapsed, onToggle }) {
  const scrollRef = useRef(null);
  const { currentText, captionText, partialText, avatarState } = usePipeline();
  const { captionFontSize } = useApp();
  const fontSizeClass = { small: 'text-xs', medium: 'text-sm', large: 'text-base' }[captionFontSize] || 'text-sm';

  // Auto-scroll to bottom when new content appears
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentText, captionText, partialText]);

  if (isCollapsed) {
    return (
      <div className="flex justify-center">
        <button
          onClick={onToggle}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 py-1 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Show transcript
        </button>
      </div>
    );
  }

  // During THINKING/CONNECTING: show currentText (real-time streaming)
  // During SPEAKING: show captionText (audio-synchronized, word-by-word) — #98
  const isActivelyStreaming =
    (avatarState === STATES.THINKING || avatarState === STATES.CONNECTING) && currentText;
  const isSpeakingWithCaption =
    avatarState === STATES.SPEAKING && captionText;

  // Show interrupted partial text with interrupted styling — #96
  const isInterrupted = avatarState === STATES.INTERRUPTED && partialText;

  return (
    <div className="flex flex-col bg-white/50 dark:bg-gray-900/50 backdrop-blur rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Transcript
        </span>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="Collapse transcript"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className={`overflow-y-auto p-3 space-y-1 max-h-48 ${fontSizeClass}`}
        style={{ scrollBehavior: 'smooth' }}
      >
        {messages.length === 0 && !isActivelyStreaming && !isSpeakingWithCaption && !isInterrupted ? (
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-600">
            Start a conversation...
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id || msg.tempId} message={msg} />
            ))}
            {/* Thinking/Connecting: show real-time streaming text */}
            {isActivelyStreaming && <StreamingMessage text={currentText} isInterrupted={false} />}
            {/* Speaking: show audio-synchronized caption text — #98 */}
            {isSpeakingWithCaption && !isActivelyStreaming && (
              <StreamingMessage text={captionText} isInterrupted={false} />
            )}
            {/* Interrupted partial text (orange styling) — #96 */}
            {isInterrupted && !isActivelyStreaming && !isSpeakingWithCaption && (
              <StreamingMessage text={partialText} isInterrupted={true} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
