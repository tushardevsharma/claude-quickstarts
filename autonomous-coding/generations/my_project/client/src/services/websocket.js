/**
 * WebSocket client service for real-time model switching and updates.
 * Supports:
 *  - model_switch message (client → server) — #54
 *  - model_switched ACK (server → client) — #55
 *  - Auto-reconnect with exponential backoff — #82
 */

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let isIntentionallyClosed = false;
const MAX_RECONNECT_DELAY_MS = 30000;
const listeners = new Set();

/** Compute next reconnect delay: 1s, 2s, 4s, 8s … max 30s */
function getReconnectDelay() {
  return Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_MS);
}

function notifyListeners(msg) {
  listeners.forEach((fn) => {
    try { fn(msg); } catch {}
  });
}

export function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  isIntentionallyClosed = false;

  // Connect via Vite proxy (/ws → ws://localhost:3000/ws)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.warn('[WS] Failed to create WebSocket:', err.message);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[WS] Connected to companion server');
    reconnectAttempts = 0;
    notifyListeners({ type: 'ws_connected' });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      notifyListeners(msg);
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    if (isIntentionallyClosed) return;
    console.log('[WS] Disconnected — scheduling reconnect');
    notifyListeners({ type: 'ws_disconnected' });
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onerror is always followed by onclose, which handles reconnect
  };
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = getReconnectDelay();
  reconnectAttempts++;
  console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  notifyListeners({ type: 'ws_reconnecting', delay, attempt: reconnectAttempts });
  reconnectTimer = setTimeout(() => {
    if (!isIntentionallyClosed) connectWebSocket();
  }, delay);
}

export function disconnectWebSocket() {
  isIntentionallyClosed = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

/**
 * Send a JSON message over the WebSocket.
 * Returns true if sent successfully, false if not connected.
 */
export function sendWsMessage(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

/**
 * Add a listener for incoming WebSocket messages.
 * Returns a cleanup function to remove the listener.
 */
export function addWsListener(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True if the WebSocket is currently connected */
export function isWsConnected() {
  return ws?.readyState === WebSocket.OPEN;
}
