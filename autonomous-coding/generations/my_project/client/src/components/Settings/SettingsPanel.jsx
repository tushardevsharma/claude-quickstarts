import { useApp } from '../../context/AppContext.jsx';
import { clearAllConversations } from '../../services/api.js';

// ── Reusable components ───────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, sublabel }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <div>
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        {sublabel && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sublabel}</p>}
      </div>
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 ml-3 ${
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
        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{displayValue || value}</span>
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

function RadioGroup({ value, options, onChange, label }) {
  return (
    <div>
      {label && <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">{label}</span>}
      <div className="flex gap-1.5 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
              value === opt.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
      {title}
    </h3>
  );
}

// ── Model tier badge colors ────────────────────────────────────────────────────
const TIER_COLORS = {
  fast: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  balanced: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  powerful: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
};

// ── ModelPicker component ─────────────────────────────────────────────────────
function ModelPicker({ activeModel, models, onChange }) {
  const defaultModels = [
    { id: 'claude-haiku-4-5', display_name: 'Haiku — Fast & Snappy', tier: 'fast', speed_label: '⚡ Instant' },
    { id: 'claude-sonnet-4-5', display_name: 'Sonnet — Balanced', tier: 'balanced', speed_label: '🎯 Balanced' },
    { id: 'claude-opus-4-5', display_name: 'Opus — Deep Thinker', tier: 'powerful', speed_label: '🧠 Powerful' },
  ];
  const modelList = models?.length ? models : defaultModels;

  return (
    <div className="space-y-2" aria-label="Active model selector">
      {modelList.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-left ${
            activeModel === m.id
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-400'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800/50'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              m.tier === 'fast' ? 'bg-blue-500' : m.tier === 'balanced' ? 'bg-green-500' : 'bg-amber-500'
            }`} />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{m.display_name}</span>
          </div>
          <span className={`text-xs px-1.5 py-0.5 rounded-md flex-shrink-0 ml-2 ${TIER_COLORS[m.tier] || TIER_COLORS.balanced}`}>
            {m.speed_label || m.tier}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Main SettingsPanel ────────────────────────────────────────────────────────

export default function SettingsPanel({ isOpen, onClose, onClearHistory }) {
  const {
    theme, volume, showTranscript, setTheme, setVolume, setShowTranscript,
    speechRate, setSpeechRate,
    activeModel, availableModels, setActiveModel,
    modelSwitchingScope, setModelSwitchingScope,
    showModelIndicator, setShowModelIndicator,
    ttsVoice, setTtsVoice,
    avatarCharacter,
    idleAnimationIntensity, setIdleAnimationIntensity,
    inputMode, setInputMode,
    pushToTalk, setPushToTalk,
    captionFontSize, setCaptionFontSize,
    responseStyle, setResponseStyle,
    storeHistory, setStoreHistory,
  } = useApp();

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
      <div className="fixed right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-900 shadow-2xl z-50 overflow-y-auto">
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

          {/* ── AI / Model section ─────────────────────────────── */}
          <section className="mb-6">
            <SectionHeader title="AI" />
            <div className="space-y-4">
              {/* Active Model */}
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">Active model</span>
                <ModelPicker
                  activeModel={activeModel}
                  models={availableModels}
                  onChange={(modelId) => setActiveModel(modelId, modelSwitchingScope)}
                />
              </div>

              {/* Model switching scope */}
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">Model switching scope</span>
                <RadioGroup
                  value={modelSwitchingScope}
                  onChange={setModelSwitchingScope}
                  options={[
                    { value: 'this_conversation', label: 'This conversation' },
                    { value: 'all_new_conversations', label: 'All new conversations' },
                  ]}
                />
              </div>

              {/* Show model indicator */}
              <Toggle
                checked={showModelIndicator}
                onChange={setShowModelIndicator}
                label="Show model indicator in UI"
                sublabel="Colored badge in avatar viewport"
              />

              {/* Response style */}
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">Response style</span>
                <RadioGroup
                  value={responseStyle}
                  onChange={setResponseStyle}
                  options={[
                    { value: 'concise', label: 'Concise' },
                    { value: 'verbose', label: 'Verbose' },
                  ]}
                />
              </div>
            </div>
          </section>

          {/* ── Display section ────────────────────────────────── */}
          <section className="mb-6">
            <SectionHeader title="Display" />
            <div className="space-y-4">
              {/* Theme */}
              <RadioGroup
                label="Theme"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'auto', label: 'Auto' },
                ]}
              />

              {/* Show transcript */}
              <Toggle
                checked={showTranscript}
                onChange={setShowTranscript}
                label="Show transcript"
              />

              {/* Caption font size */}
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">Caption font size</span>
                <RadioGroup
                  value={captionFontSize}
                  onChange={setCaptionFontSize}
                  options={[
                    { value: 'small', label: 'Small' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'large', label: 'Large' },
                  ]}
                />
              </div>
            </div>
          </section>

          {/* ── Voice section ──────────────────────────────────── */}
          <section className="mb-6">
            <SectionHeader title="Voice" />
            <div className="space-y-4">
              {/* Volume */}
              <Slider
                label="Volume"
                value={volume}
                min={0}
                max={100}
                step={5}
                onChange={setVolume}
                displayValue={`${volume}%`}
              />

              {/* Speech rate */}
              <Slider
                label="Speech rate"
                value={speechRate}
                min={0.5}
                max={2.0}
                step={0.25}
                onChange={setSpeechRate}
                displayValue={`${speechRate}x`}
              />

              {/* TTS Voice selection */}
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">TTS voice</span>
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="default">Default (Browser TTS)</option>
                  <option value="21m00Tcm4TlvDq8ikWAM">ElevenLabs — Rachel</option>
                  <option value="AZnzlk1XvdvUeBnXmlld">ElevenLabs — Domi</option>
                  <option value="EXAVITQu4vr4xnSDxMaL">ElevenLabs — Bella</option>
                  <option value="ErXwobaYiN019PkySvjV">ElevenLabs — Antoni</option>
                </select>
              </div>
            </div>
          </section>

          {/* ── Avatar section ─────────────────────────────────── */}
          <section className="mb-6">
            <SectionHeader title="Avatar" />
            <div className="space-y-4">
              {/* Character selector */}
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">Character</span>
                <select
                  value={avatarCharacter}
                  disabled
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 opacity-70 cursor-not-allowed"
                >
                  <option value="nova">Nova (Default)</option>
                </select>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">More characters coming soon</p>
              </div>

              {/* Idle animation intensity */}
              <Slider
                label="Idle animation intensity"
                value={idleAnimationIntensity}
                min={0}
                max={2}
                step={1}
                onChange={setIdleAnimationIntensity}
                displayValue={['Subtle', 'Medium', 'Lively'][idleAnimationIntensity] || 'Medium'}
              />
            </div>
          </section>

          {/* ── Input section ──────────────────────────────────── */}
          <section className="mb-6">
            <SectionHeader title="Input" />
            <div className="space-y-4">
              {/* Default input mode */}
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300 block mb-2">Default input mode</span>
                <RadioGroup
                  value={inputMode}
                  onChange={setInputMode}
                  options={[
                    { value: 'voice', label: 'Voice' },
                    { value: 'text', label: 'Text' },
                  ]}
                />
              </div>

              {/* Push-to-talk */}
              <Toggle
                checked={pushToTalk}
                onChange={setPushToTalk}
                label="Push-to-talk mode"
                sublabel="Hold button to record; release to send"
              />
            </div>
          </section>

          {/* ── Privacy section ────────────────────────────────── */}
          <section className="mb-6">
            <SectionHeader title="Privacy" />
            <div className="space-y-4">
              {/* Store history */}
              <Toggle
                checked={storeHistory}
                onChange={setStoreHistory}
                label="Store conversation history"
                sublabel="Persist chats to local database"
              />

              {/* Clear history */}
              <button
                onClick={handleClearHistory}
                className="w-full py-2.5 px-4 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Clear all conversation history
              </button>
            </div>
          </section>

          {/* ── About section ──────────────────────────────────── */}
          <section>
            <SectionHeader title="About" />
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
