const API_BASE = '/api';

/**
 * REST API client for the Digital Human Companion backend
 */

// ── Conversations ──────────────────────────────────────────────────────────

export async function listConversations() {
  const res = await fetch(`${API_BASE}/conversations`);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function createConversation(personaId = 'nova') {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona_id: personaId }),
  });
  if (!res.ok) throw new Error('Failed to create conversation');
  return res.json();
}

export async function getConversation(id) {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  if (!res.ok) throw new Error('Failed to fetch conversation');
  return res.json();
}

export async function deleteConversation(id) {
  const res = await fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete conversation');
  return res.json();
}

export async function clearAllConversations() {
  const res = await fetch(`${API_BASE}/conversations`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to clear conversations');
  return res.json();
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function getSettings() {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function updateSettings(settings) {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

// ── Personas ───────────────────────────────────────────────────────────────

export async function listPersonas() {
  const res = await fetch(`${API_BASE}/personas`);
  if (!res.ok) throw new Error('Failed to fetch personas');
  return res.json();
}

// ── Models ─────────────────────────────────────────────────────────────────

export async function listModels() {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

// ── Health ─────────────────────────────────────────────────────────────────

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

// ── Chat SSE Stream ────────────────────────────────────────────────────────

/**
 * Stream a chat message via SSE.
 * Returns an object with an abort() method.
 */
export function streamMessage({ text, conversationId, generationId, onEvent, onError, onComplete }) {
  const controller = new AbortController();

  fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      conversation_id: conversationId,
      generation_id: generationId,
    }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        if (onError) onError(new Error(err.error || 'Stream request failed'));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (onEvent) onEvent(data);
              if (data.type === 'complete' && onComplete) onComplete(data);
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError' && onError) {
        onError(err);
      }
    });

  return {
    abort: () => controller.abort(),
  };
}

// ── TTS ────────────────────────────────────────────────────────────────────

/**
 * Fetch TTS audio from ElevenLabs via the server proxy.
 * Returns an ArrayBuffer of MP3 audio data.
 */
export async function fetchTTSAudio(text, voiceId) {
  const res = await fetch(`${API_BASE}/chat/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'TTS failed' }));
    throw new Error(err.error || 'TTS request failed');
  }
  return res.arrayBuffer();
}

// ── Interrupt ──────────────────────────────────────────────────────────────

export async function sendInterrupt(generationId, conversationId) {
  const res = await fetch(`${API_BASE}/chat/interrupt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generation_id: generationId, conversation_id: conversationId }),
  });
  if (!res.ok) throw new Error('Failed to send interrupt');
  return res.json();
}
