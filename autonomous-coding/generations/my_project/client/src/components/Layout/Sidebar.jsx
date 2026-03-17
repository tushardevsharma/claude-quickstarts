import { useState } from 'react';
import { deleteConversation } from '../../services/api.js';

function ConversationItem({ conversation, isActive, onClick, onDelete }) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!showConfirm) {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
      return;
    }
    try {
      await deleteConversation(conversation.id);
      if (onDelete) onDelete(conversation.id);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const date = new Date(conversation.updated_at);
  const isToday = new Date().toDateString() === date.toDateString();
  const timeStr = isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
      }`}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{conversation.title || 'New Conversation'}</div>
        <div className="text-xs text-gray-400 dark:text-gray-500">{timeStr}</div>
      </div>
      <button
        onClick={handleDelete}
        className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-all ${
          showConfirm
            ? 'bg-red-100 dark:bg-red-900/40 text-red-600 opacity-100'
            : 'opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400'
        }`}
        title={showConfirm ? 'Click again to confirm delete' : 'Delete conversation'}
      >
        {showConfirm ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function Sidebar({ isOpen, onClose, conversations, activeConversationId, onSelectConversation, onNewConversation, onDeleteConversation }) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Conversations</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New conversation button */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() => { onNewConversation(); onClose(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Conversation
          </button>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-600">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onClick={() => { onSelectConversation(conv); onClose(); }}
                onDelete={onDeleteConversation}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
