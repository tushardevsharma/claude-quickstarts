import { useState, useRef, useEffect } from 'react';
import { usePipeline, STATES } from '../../context/PipelineContext.jsx';

export default function TextInput({ onSend, interimTranscript }) {
  const [text, setText] = useState('');
  const { avatarState, interrupt } = usePipeline();
  const inputRef = useRef(null);
  const isSpeaking = avatarState === STATES.SPEAKING || avatarState === STATES.THINKING;

  // Show interim transcript in input
  useEffect(() => {
    if (interimTranscript && !text) {
      // Don't override user's typed text with interim transcript
    }
  }, [interimTranscript, text]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    if (onSend) onSend(trimmed);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    interrupt();
  };

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 relative">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            interimTranscript
              ? interimTranscript + '...'
              : 'Type a message or use the mic...'
          }
          rows={1}
          className="w-full px-4 py-3 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors leading-5"
          style={{ maxHeight: '120px', overflowY: 'auto' }}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
        />
      </div>

      {isSpeaking ? (
        // Stop button during speaking/thinking
        <button
          onClick={handleStop}
          className="flex-shrink-0 w-11 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all duration-150 shadow-sm hover:shadow-md"
          title="Stop"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>
      ) : (
        // Send button
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="flex-shrink-0 w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-400 flex items-center justify-center transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
          title="Send"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
