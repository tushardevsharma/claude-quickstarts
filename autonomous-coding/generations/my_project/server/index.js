// Load .env first
import 'dotenv/config';

// Load Claude Code settings env vars (AWS Bedrock config, etc.)
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

try {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  if (settings.env) {
    for (const [key, value] of Object.entries(settings.env)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log('[Server] Loaded Claude Code env vars (Bedrock config)');
  }
} catch {
  // No claude settings, that's fine
}

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { initDatabase, getDatabase } from './db/database.js';
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import settingsRoutes from './routes/settings.js';
import personaRoutes from './routes/personas.js';
import modelRoutes from './routes/models.js';
import { logConfig as logClaudeConfig } from './services/claude.js';
import { isElevenLabsConfigured, synthesizeElevenLabs } from './services/tts.js';

logClaudeConfig();

const PORT = process.env.PORT || 3000;
const app = express();
const httpServer = createServer(app);

// ── WebSocket Servers ─────────────────────────────────────────────────────────
// Both servers use noServer:true so a single manual upgrade handler can route:
//   /ws     → wss    (real-time model switching — #54-#57, #82)
//   /ws/tts → ttswss (pre-warmed TTS connection  — #99)
//
// Using `noServer: true` for both prevents the ws library from registering its
// own upgrade listener (which would 400-reject any path it doesn't own before
// our handler can claim it).
const wss = new WebSocketServer({ noServer: true });
const ttswss = new WebSocketServer({ noServer: true });

// Single upgrade router — must be registered before any ws internal listeners
httpServer.on('upgrade', (request, socket, head) => {
  const url = request.url || '';
  if (url === '/ws/tts' || url.startsWith('/ws/tts?')) {
    ttswss.handleUpgrade(request, socket, head, (ws) => {
      ttswss.emit('connection', ws, request);
    });
  } else if (url === '/ws' || url.startsWith('/ws?')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // model_switch: client requests a model change — #54
      if (msg.type === 'model_switch') {
        const { model_id, scope } = msg;
        if (!model_id) return;

        const db = getDatabase();

        // Update active_model setting — #56 (new messages use new model immediately)
        db.prepare(
          "INSERT OR REPLACE INTO settings (key, value) VALUES ('active_model', ?)"
        ).run(JSON.stringify(model_id));

        // If scope is all_new_conversations, update default model too — #57
        if (scope === 'all_new_conversations') {
          db.prepare(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('model', ?)"
          ).run(JSON.stringify(model_id));
          db.prepare(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('model_switching_scope', ?)"
          ).run(JSON.stringify(scope));
        }

        // ACK with model_switched — #55
        ws.send(JSON.stringify({
          type: 'model_switched',
          model_id,
          scope: scope || 'this_conversation',
        }));

        console.log(`[WS] Model switched to ${model_id} (scope: ${scope || 'this_conversation'})`);
      }
    } catch (err) {
      console.warn('[WS] Message parse error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });

  ws.on('error', (err) => {
    console.warn('[WS] Socket error:', err.message);
  });

  // Send initial hello so client knows connection is live
  ws.send(JSON.stringify({ type: 'ws_ready' }));
});

ttswss.on('connection', (ws) => {
  console.log('[WS/TTS] Client connected (pre-warm)');

  // Send tts_ready immediately so client knows the connection is live — #99
  ws.send(JSON.stringify({ type: 'tts_ready', elevenlabs: isElevenLabsConfigured() }));

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'tts_request' && msg.text) {
      const requestId = msg.request_id || Date.now().toString();

      if (isElevenLabsConfigured()) {
        // Stream ElevenLabs audio back as binary chunks
        const chunks = [];
        synthesizeElevenLabs(
          msg.text,
          msg.voice_id || null,
          (chunk) => {
            chunks.push(chunk);
          },
          () => {
            // Send all chunks as a single binary message
            const combined = Buffer.concat(chunks);
            ws.send(JSON.stringify({ type: 'tts_start', request_id: requestId }));
            ws.send(combined, { binary: true });
            ws.send(JSON.stringify({ type: 'tts_end', request_id: requestId }));
          },
          (err) => {
            console.error('[WS/TTS] ElevenLabs error:', err.message);
            ws.send(JSON.stringify({ type: 'tts_error', request_id: requestId, message: err.message }));
          }
        );
      } else {
        // No TTS configured — tell client to use browser TTS
        ws.send(JSON.stringify({ type: 'tts_use_browser', request_id: requestId, text: msg.text }));
      }
    }
  });

  ws.on('close', () => {
    console.log('[WS/TTS] Client disconnected');
  });

  ws.on('error', (err) => {
    console.warn('[WS/TTS] Socket error:', err.message);
  });
});

// ── HTTP Middleware ────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json());

// Initialize database
initDatabase(process.env.DB_PATH || './data/companion.db');

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/personas', personaRoutes);
app.use('/api/models', modelRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === '1';
  res.json({
    status: 'ok',
    name: 'Digital Human Companion API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    capabilities: {
      claude: useBedrock || !!process.env.ANTHROPIC_API_KEY,
      elevenlabs: !!(process.env.ELEVENLABS_API_KEY),
      deepgram: !!(process.env.DEEPGRAM_API_KEY),
      bedrock: useBedrock,
      websocket: true,
      tts_websocket: true,
    },
  });
});

// Start server
httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[Server] Digital Human Companion running on port ${PORT}`);
  console.log(`[Server] Health: http://localhost:${PORT}/api/health`);
  console.log(`[Server] WebSocket: ws://localhost:${PORT}/ws`);

  const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === '1';
  if (useBedrock) {
    console.log(`[Server] Using AWS Bedrock (${process.env.AWS_REGION || 'us-west-2'})`);
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[Server] WARNING: No Claude API configured - responses will fail');
  }
});

export default app;
