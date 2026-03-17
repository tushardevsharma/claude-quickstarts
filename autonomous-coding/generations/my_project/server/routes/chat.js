import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';
import { streamClaudeResponse, buildMessages, generateTitle } from '../services/claude.js';
import { SentenceSplitter } from '../services/sentence-splitter.js';
import { isElevenLabsConfigured, synthesizeElevenLabs } from '../services/tts.js';
import { MODEL_REGISTRY } from './models.js';

// Map user-facing model ID to bedrock model ID
function resolveBedrockModelId(modelId) {
  const entry = MODEL_REGISTRY.find(m => m.id === modelId);
  // Use the process env override if present, otherwise construct from model tier
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
    // Use the main configured model for sonnet-class; haiku for background tasks
    if (modelId && modelId.includes('haiku')) {
      return process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'anthropic.claude-haiku-4-5-20251104-v1:0';
    }
    if (modelId && modelId.includes('opus')) {
      return process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || 'anthropic.claude-opus-4-5-20251101-v1:0';
    }
    // Default to configured sonnet model (may be an inference profile ARN)
    return process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || process.env.ANTHROPIC_MODEL ||
      'anthropic.claude-sonnet-4-5-20250929-v1:0';
  }
  // Direct API
  if (modelId && modelId.includes('haiku')) return 'claude-haiku-4-5';
  if (modelId && modelId.includes('opus')) return 'claude-opus-4-5-20251101';
  return 'claude-sonnet-4-5-20250929';
}

// Get active model from settings DB
function getActiveModelId(db) {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'active_model'").get();
    if (row?.value) return JSON.parse(row.value);
  } catch {}
  return 'claude-sonnet-4-5';
}

const router = Router();

// Active generation map: generationId -> { abortController }
const activeGenerations = new Map();

// POST /api/chat/stream - stream a message to Claude with SSE
router.post('/stream', async (req, res) => {
  const { text, conversation_id, generation_id, model_id } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  const db = getDatabase();

  // Determine active model
  const activeModelId = model_id || getActiveModelId(db);
  const resolvedModel = resolveBedrockModelId(activeModelId);

  // Get or create conversation
  let convId = conversation_id;
  if (!convId) {
    convId = uuidv4();
    db.prepare(
      `INSERT INTO conversations (id, title, persona_id, active_model) VALUES (?, ?, ?, ?)`
    ).run(convId, 'New Conversation', 'nova', activeModelId);
  }

  // Verify conversation exists
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  // Update conversation active_model if changed
  if (activeModelId && conversation.active_model !== activeModelId) {
    db.prepare(`UPDATE conversations SET active_model = ? WHERE id = ?`).run(activeModelId, convId);
  }

  // Get persona
  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(conversation.persona_id || 'nova');

  // Build system prompt with response style
  let systemPrompt = persona?.system_prompt || 'You are Nova, a warm AI companion.';
  try {
    const styleRow = db.prepare("SELECT value FROM settings WHERE key = 'response_style'").get();
    if (styleRow?.value) {
      const style = JSON.parse(styleRow.value);
      if (style === 'verbose') {
        systemPrompt += '\n\nRESPONSE STYLE: Give thorough, detailed responses. Expand on ideas fully.';
      }
      // concise is the default from the system prompt
    }
  } catch {}

  // Save user message
  const userMsgId = uuidv4();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)`
  ).run(userMsgId, convId, 'user', text.trim());

  // Update conversation timestamp
  db.prepare(
    `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(convId);

  // Get conversation history
  const history = db.prepare(
    `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
  ).all(convId);

  const claudeMessages = buildMessages(history, conversation.summary);

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Conversation-Id', convId);
  res.flushHeaders();

  const genId = generation_id || uuidv4();
  const abortController = new AbortController();
  activeGenerations.set(genId, { abortController, convId });

  const splitter = new SentenceSplitter();
  let fullResponse = '';
  const assistantMsgId = uuidv4();

  // Send initial state
  res.write(`data: ${JSON.stringify({ type: 'state', state: 'thinking', conversation_id: convId, generation_id: genId })}\n\n`);

  const elevenLabsEnabled = isElevenLabsConfigured();

  try {
    await streamClaudeResponse({
      messages: claudeMessages,
      systemPrompt,
      model: resolvedModel,
      signal: abortController.signal,
      onToken: (token) => {
        fullResponse += token;

        // Send text token to client
        res.write(`data: ${JSON.stringify({ type: 'text_token', token, generation_id: genId })}\n\n`);

        // Try to extract a complete sentence
        const sentence = splitter.ingest(token);
        if (sentence) {
          res.write(`data: ${JSON.stringify({ type: 'sentence', text: sentence, generation_id: genId, tts_mode: elevenLabsEnabled ? 'elevenlabs' : 'browser' })}\n\n`);
        }
      },
      onComplete: async (fullText) => {
        // Flush remaining buffer
        const remaining = splitter.flush();
        if (remaining) {
          res.write(`data: ${JSON.stringify({ type: 'sentence', text: remaining, generation_id: genId, tts_mode: elevenLabsEnabled ? 'elevenlabs' : 'browser', is_final: true })}\n\n`);
        }

        // Save assistant message with model_id
        db.prepare(
          `INSERT INTO messages (id, conversation_id, role, content, model_id) VALUES (?, ?, ?, ?, ?)`
        ).run(assistantMsgId, convId, 'assistant', fullText, activeModelId);

        // Auto-generate title after first exchange
        const msgCount = db.prepare(
          `SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?`
        ).get(convId);

        if (msgCount.count === 2 && conversation.title === 'New Conversation') {
          // Generate title in background
          generateTitle(text, fullText).then((title) => {
            db.prepare(
              `UPDATE conversations SET title = ? WHERE id = ?`
            ).run(title, convId);
          });
        }

        res.write(`data: ${JSON.stringify({ type: 'complete', conversation_id: convId, generation_id: genId, model_id: activeModelId })}\n\n`);
        res.end();
        activeGenerations.delete(genId);
      },
      onError: (err) => {
        console.error('[Chat] Claude error:', err.message);
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message, generation_id: genId })}\n\n`);
        res.end();
        activeGenerations.delete(genId);
      },
    });
  } catch (err) {
    if (!abortController.signal.aborted && !res.writableEnded) {
      console.error('[Chat] Stream error:', err.message);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to get response', generation_id: genId })}\n\n`);
      res.end();
    }
    activeGenerations.delete(genId);
  }
});

// POST /api/chat/interrupt - abort current generation
router.post('/interrupt', (req, res) => {
  const { generation_id, conversation_id } = req.body;

  if (generation_id && activeGenerations.has(generation_id)) {
    const gen = activeGenerations.get(generation_id);
    gen.abortController.abort();
    activeGenerations.delete(generation_id);

    // Mark last message as interrupted if conversation_id provided
    if (conversation_id) {
      const db = getDatabase();
      const lastMsg = db.prepare(
        `SELECT id FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`
      ).get(conversation_id);

      if (lastMsg) {
        db.prepare(
          `UPDATE messages SET was_interrupted = 1 WHERE id = ?`
        ).run(lastMsg.id);
      }
    }

    res.json({ success: true, message: 'Generation interrupted' });
  } else {
    res.json({ success: true, message: 'No active generation found' });
  }
});

// POST /api/chat/tts - proxy TTS for a sentence (ElevenLabs)
router.post('/tts', (req, res) => {
  const { text, voice_id } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (!isElevenLabsConfigured()) {
    return res.status(503).json({ error: 'ElevenLabs not configured', fallback: 'browser' });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Transfer-Encoding', 'chunked');

  synthesizeElevenLabs(
    text,
    voice_id,
    (chunk) => res.write(chunk),
    () => res.end(),
    (err) => {
      console.error('[TTS] ElevenLabs error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'TTS synthesis failed' });
      } else {
        res.end();
      }
    }
  );
});

export default router;
