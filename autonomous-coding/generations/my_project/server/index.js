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
import { initDatabase } from './db/database.js';
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import settingsRoutes from './routes/settings.js';
import personaRoutes from './routes/personas.js';
import { logConfig as logClaudeConfig } from './services/claude.js';

logClaudeConfig();

const PORT = process.env.PORT || 3000;
const app = express();
const httpServer = createServer(app);

// Middleware
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
    },
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`[Server] Digital Human Companion running on port ${PORT}`);
  console.log(`[Server] Health: http://localhost:${PORT}/api/health`);

  const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === '1';
  if (useBedrock) {
    console.log(`[Server] Using AWS Bedrock (${process.env.AWS_REGION || 'us-west-2'})`);
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[Server] WARNING: No Claude API configured - responses will fail');
  }
});

export default app;
