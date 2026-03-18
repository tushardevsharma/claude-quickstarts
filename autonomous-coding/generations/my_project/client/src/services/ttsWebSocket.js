/**
 * TTS WebSocket service — Pre-warmed persistent connection to the TTS endpoint. (#99)
 *
 * Key behaviors:
 *  - Connected at app startup (pre-warm), kept alive for the session
 *  - Reused for every TTS request — no reconnect per turn
 *  - Exposes sendTTSRequest() to synthesize text via WebSocket
 *  - Falls back to browser TTS when ElevenLabs is not configured
 *  - Auto-reconnects with exponential backoff on unexpected disconnect
 */

let ttsWs = null;
let ttsReconnectTimer = null;
let ttsReconnectAttempts = 0;
let ttsIntentionallyClosed = false;
let elevenlabsAvailable = false;

const TTS_MAX_RECONNECT_DELAY_MS = 30000;
const ttsListeners = new Set();
const pendingRequests = new Map(); // requestId -> { resolve, reject }

function getTtsReconnectDelay() {
  return Math.min(1000 * Math.pow(2, ttsReconnectAttempts), TTS_MAX_RECONNECT_DELAY_MS);
}

function notifyTtsListeners(msg) {
  ttsListeners.forEach((fn) => {
    try { fn(msg); } catch {}
  });
}

/**
 * Connect to the /ws/tts endpoint and keep the connection warm.
 * Should be called once at app startup. (#99)
 */
export function connectTtsWebSocket() {
  if (ttsWs && (ttsWs.readyState === WebSocket.OPEN || ttsWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ttsIntentionallyClosed = false;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/tts`;

  try {
    ttsWs = new WebSocket(wsUrl);
  } catch (err) {
    console.warn('[WS/TTS] Failed to create TTS WebSocket:', err.message);
    scheduleTtsReconnect();
    return;
  }

  ttsWs.onopen = () => {
    console.log('[WS/TTS] Pre-warm connection established');
    ttsReconnectAttempts = 0;
    notifyTtsListeners({ type: 'tts_ws_connected' });
  };

  ttsWs.onmessage = (event) => {
    // Handle binary audio data
    if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
      const blobToArrayBuffer = async (blob) => {
        const ab = await blob.arrayBuffer();
        notifyTtsListeners({ type: 'tts_audio_chunk', data: ab });
      };
      if (event.data instanceof Blob) {
        blobToArrayBuffer(event.data);
      } else {
        notifyTtsListeners({ type: 'tts_audio_chunk', data: event.data });
      }
      return;
    }

    // Handle JSON control messages
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'tts_ready') {
        elevenlabsAvailable = msg.elevenlabs || false;
        console.log(`[WS/TTS] Server ready (ElevenLabs: ${elevenlabsAvailable})`);
      }

      notifyTtsListeners(msg);

      // Resolve/reject pending requests
      if (msg.request_id && pendingRequests.has(msg.request_id)) {
        const pending = pendingRequests.get(msg.request_id);
        if (msg.type === 'tts_use_browser') {
          pending.resolve({ mode: 'browser', text: msg.text });
          pendingRequests.delete(msg.request_id);
        } else if (msg.type === 'tts_end') {
          // Bug 7 fix: tts_end signals that ElevenLabs audio has been fully sent
          // Resolve the pending promise so audio plays promptly without 5s timeout
          pending.resolve({ mode: 'elevenlabs' });
          pendingRequests.delete(msg.request_id);
        } else if (msg.type === 'tts_error') {
          pending.reject(new Error(msg.message || 'TTS error'));
          pendingRequests.delete(msg.request_id);
        }
      }
    } catch {
      // Not JSON — ignore
    }
  };

  ttsWs.onclose = () => {
    if (ttsIntentionallyClosed) return;
    console.log('[WS/TTS] Disconnected — scheduling reconnect');
    notifyTtsListeners({ type: 'tts_ws_disconnected' });
    scheduleTtsReconnect();
  };

  ttsWs.onerror = () => {
    // onerror is always followed by onclose
  };
}

function scheduleTtsReconnect() {
  if (ttsReconnectTimer) clearTimeout(ttsReconnectTimer);
  const delay = getTtsReconnectDelay();
  ttsReconnectAttempts++;
  ttsReconnectTimer = setTimeout(() => {
    if (!ttsIntentionallyClosed) connectTtsWebSocket();
  }, delay);
}

/**
 * Disconnect the TTS WebSocket (called on app unmount).
 */
export function disconnectTtsWebSocket() {
  ttsIntentionallyClosed = true;
  if (ttsReconnectTimer) {
    clearTimeout(ttsReconnectTimer);
    ttsReconnectTimer = null;
  }
  if (ttsWs) {
    ttsWs.close();
    ttsWs = null;
  }
}

/**
 * Send a TTS synthesis request over the pre-warmed WebSocket connection.
 * Returns a promise resolving to { mode: 'browser', text } when ElevenLabs is not available.
 * When ElevenLabs IS available, audio arrives via tts_audio_chunk listener events.
 *
 * Falls back to HTTP if WS is not connected.
 */
export function sendTTSRequest(text, voiceId) {
  if (!isTtsWsConnected()) {
    return Promise.resolve({ mode: 'browser', text });
  }

  const requestId = `tts-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });

    ttsWs.send(JSON.stringify({
      type: 'tts_request',
      request_id: requestId,
      text,
      voice_id: voiceId || null,
    }));

    // Timeout fallback (5 seconds)
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        resolve({ mode: 'browser', text });
      }
    }, 5000);
  });
}

/**
 * Add a listener for TTS WebSocket events.
 * Returns cleanup function.
 */
export function addTtsWsListener(fn) {
  ttsListeners.add(fn);
  return () => ttsListeners.delete(fn);
}

/** True if TTS WebSocket is currently connected */
export function isTtsWsConnected() {
  return ttsWs?.readyState === WebSocket.OPEN;
}

/** True if ElevenLabs is available via TTS WebSocket */
export function isTtsElevenLabsAvailable() {
  return elevenlabsAvailable;
}
