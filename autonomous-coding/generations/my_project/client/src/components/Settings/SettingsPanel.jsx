import { useApp } from '../../context/AppContext.jsx';
import { clearAllConversations } from '../../services/api.js';

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer ${
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
    </label>
  );
}

function Slider({ value, min, max, step, onChange, label, displayValue }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{displayValue || value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-600"
      />
    </div>
  );
}

export default function SettingsPanel({ isOpen, onClose, onClearHistory }) {
  const { theme, volume, showTranscript, setTheme, setVolume, setShowTranscript } = useApp();

  if (!isOpen) return null;

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear all conversation history? This cannot be undone.')) {
      try {
        await clearAllConversations();
        if (onClearHistory) onClearHistory();
      } catch (err) {
        console.error('Failed to clear history:', err);
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 dark:bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-900 shadow-2xl z-50 overflow-y-auto animate-slide-up">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Display */}
          <section className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Display</h3>
            <div className="space-y-4">
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">Theme</span>
                <div className="flex gap-2">
                  {['light', 'dark', 'auto'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors capitalize ${
                        theme === t
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <Toggle
                checked={showTranscript}
                onChange={setShowTranscript}
                label="Show transcript"
              />
            </div>
          </section>

          {/* Voice */}
          <section className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Voice</h3>
            <div className="space-y-4">
              <Slider
                label="Volume"
                value={volume}
                min={0}
                max={100}
                step={5}
                onChange={setVolume}
                displayValue={`${volume}%`}
              />
            </div>
          </section>

          {/* Privacy */}
          <section className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Privacy</h3>
            <button
              onClick={handleClearHistory}
              className="w-full py-2.5 px-4 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Clear all conversation history
            </button>
          </section>

          {/* About */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">About</h3>
            <p className="text-xs text-gray-500 dark:text-gray-500 leading-relaxed">
              Digital Human Companion v1.0<br />
              Powered by Claude AI, with 2D animated avatar and voice interaction.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
