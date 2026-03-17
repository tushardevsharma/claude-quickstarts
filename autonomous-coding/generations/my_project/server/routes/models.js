import { Router } from 'express';

const router = Router();

// Model registry with display metadata
export const MODEL_REGISTRY = [
  {
    id: 'claude-haiku-4-5',
    display_name: 'Haiku — Fast & Snappy',
    tier: 'fast',
    latency_profile: 'low',
    cost_per_1k_input: 0.0008,
    cost_per_1k_output: 0.004,
    thinking_timeout_ms: 3000,
    badge_color: 'blue',
    speed_label: '⚡ Instant',
    description: 'Fastest responses, perfect for casual chat',
  },
  {
    id: 'claude-sonnet-4-5',
    display_name: 'Sonnet — Balanced',
    tier: 'balanced',
    latency_profile: 'medium',
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.015,
    thinking_timeout_ms: 5000,
    badge_color: 'green',
    speed_label: '🎯 Balanced',
    description: 'Best balance of speed and intelligence',
  },
  {
    id: 'claude-opus-4-5',
    display_name: 'Opus — Deep Thinker',
    tier: 'powerful',
    latency_profile: 'high',
    cost_per_1k_input: 0.015,
    cost_per_1k_output: 0.075,
    thinking_timeout_ms: 8000,
    badge_color: 'amber',
    speed_label: '🧠 Powerful',
    description: 'Most capable, best for complex reasoning',
  },
];

// GET /api/models - return the model registry
router.get('/', (req, res) => {
  res.json({
    models: MODEL_REGISTRY,
    background_task_model: 'claude-haiku-4-5',
    default_model: 'claude-sonnet-4-5',
  });
});

export default router;
