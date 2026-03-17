import { STATES } from '../../context/PipelineContext.jsx';

const STATE_CONFIG = {
  [STATES.IDLE]: {
    label: 'Ready',
    color: 'text-gray-400 dark:text-gray-500',
    dot: 'bg-gray-400',
    animate: false,
    show: false,
  },
  [STATES.LISTENING]: {
    label: 'Listening...',
    color: 'text-blue-500',
    dot: 'bg-blue-500',
    animate: true,
    show: true,
  },
  [STATES.THINKING]: {
    label: 'Thinking...',
    color: 'text-amber-500',
    dot: 'bg-amber-500',
    animate: true,
    show: true,
  },
  [STATES.SPEAKING]: {
    label: 'Speaking...',
    color: 'text-emerald-500',
    dot: 'bg-emerald-500',
    animate: true,
    show: true,
  },
  [STATES.ERROR]: {
    label: 'Error',
    color: 'text-red-500',
    dot: 'bg-red-500',
    animate: false,
    show: true,
  },
  [STATES.CONNECTING]: {
    label: 'Connecting...',
    color: 'text-gray-400',
    dot: 'bg-gray-400',
    animate: true,
    show: true,
  },
};

export default function StateIndicator({ state }) {
  const config = STATE_CONFIG[state] || STATE_CONFIG[STATES.IDLE];

  if (!config.show) {
    return (
      <div className="flex items-center gap-2 h-6">
        <span className="text-xs text-gray-400 dark:text-gray-600">Nova</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 h-6 ${config.color} animate-fade-in`}>
      <div className={`relative flex items-center justify-center`}>
        <span className={`w-2 h-2 rounded-full ${config.dot}`}></span>
        {config.animate && (
          <span className={`absolute w-2 h-2 rounded-full ${config.dot} animate-ping opacity-75`}></span>
        )}
      </div>
      <span className="text-xs font-medium">{config.label}</span>

      {/* Thinking dots animation */}
      {state === STATES.THINKING && (
        <div className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`w-1 h-1 rounded-full ${config.dot} opacity-80`}
              style={{
                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* Waveform for speaking */}
      {state === STATES.SPEAKING && (
        <div className="flex items-center gap-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`w-0.5 rounded-full ${config.dot} opacity-80`}
              style={{
                height: `${8 + Math.random() * 8}px`,
                animation: `soundwave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
