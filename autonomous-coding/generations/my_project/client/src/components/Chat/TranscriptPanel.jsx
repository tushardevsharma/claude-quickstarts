import { useEffect, useRef } from 'react';
import { usePipeline, STATES } from '../../context/PipelineContext.jsx';
import { useApp } from '../../context/AppContext.jsx';

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 animate-slide-up`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex-shrink-0 mr-2 flex items-center justify-center text-white text-xs font-bold mt-1">
          N
        </div>
      )}
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
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex-shrink-0 ml-2 flex items-center justify-center text-white text-xs font-bold mt-1">
          Y
        </div>
      )}
    </div>
  );
}

function StreamingMessage({ text }) {
  return (
    <div className="flex justify-start mb-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex-shrink-0 mr-2 flex items-center justify-center text-white text-xs font-bold mt-1">
        N
      </div>
      <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
        {text}
        <span className="inline-block w-0.5 h-3.5 bg-gray-500 dark:bg-gray-400 ml-0.5 align-middle animate-pulse" />
      </div>
    </div>
  );
}

export default function TranscriptPanel({ messages, isCollapsed, onToggle }) {
  const scrollRef = useRef(null);
  const { currentText, avatarState } = usePipeline();
  const { captionFontSize } = useApp();
  const fontSizeClass = { small: 'text-xs', medium: 'text-sm', large: 'text-base' }[captionFontSize] || 'text-sm';

  // Auto-scroll to bottom when new content appears
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentText]);

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

  const isStreaming =
    (avatarState === STATES.THINKING || avatarState === STATES.SPEAKING) && currentText;

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
        {messages.length === 0 && !isStreaming ? (
          <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-600">
            Start a conversation...
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id || msg.tempId} message={msg} />
            ))}
            {isStreaming && <StreamingMessage text={currentText} />}
          </>
        )}
      </div>
    </div>
  );
}
