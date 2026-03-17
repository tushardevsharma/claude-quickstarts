import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';
import { streamClaudeResponse, buildMessages, generateTitle } from '../services/claude.js';
import { SentenceSplitter } from '../services/sentence-splitter.js';
import { isElevenLabsConfigured, synthesizeElevenLabs } from '../services/tts.js';

const router = Router();

// Active generation map: generationId -> { abortController }
const activeGenerations = new Map();

// POST /api/chat/stream - stream a message to Claude with SSE
router.post('/stream', async (req, res) => {
  const { text, conversation_id, generation_id } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  const db = getDatabase();

  // Get or create conversation
  let convId = conversation_id;
  if (!convId) {
    convId = uuidv4();
    db.prepare(
      `INSERT INTO conversations (id, title, persona_id) VALUES (?, ?, ?)`
    ).run(convId, 'New Conversation', 'nova');
  }

  // Verify conversation exists
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  // Get persona
  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(conversation.persona_id || 'nova');
  const systemPrompt = persona?.system_prompt || 'You are Nova, a warm AI companion.';

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

        // Save assistant message
        db.prepare(
          `INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)`
        ).run(assistantMsgId, convId, 'assistant', fullText);

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

        res.write(`data: ${JSON.stringify({ type: 'complete', conversation_id: convId, generation_id: genId })}\n\n`);
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
