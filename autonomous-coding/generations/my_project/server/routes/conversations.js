import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';

const router = Router();

// GET /api/conversations - list all conversations
router.get('/', (req, res) => {
  const db = getDatabase();
  const conversations = db
    .prepare(
      `SELECT id, title, created_at, updated_at, model, active_model, persona_id, is_archived
       FROM conversations
       WHERE is_archived = 0
       ORDER BY updated_at DESC
       LIMIT 50`
    )
    .all();
  res.json({ conversations });
});

// POST /api/conversations - create new conversation
router.post('/', (req, res) => {
  const db = getDatabase();
  const id = uuidv4();
  const { persona_id = 'nova', model = 'claude-sonnet-4-5-20250929' } = req.body;

  db.prepare(
    `INSERT INTO conversations (id, title, persona_id, model)
     VALUES (?, ?, ?, ?)`
  ).run(id, 'New Conversation', persona_id, model);

  const conversation = db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id);

  res.status(201).json({ conversation });
});

// GET /api/conversations/:id - get conversation with messages
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const conversation = db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(req.params.id);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const messages = db
    .prepare(
      `SELECT id, role, content, model_id, audio_duration_ms, was_interrupted, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`
    )
    .all(req.params.id);

  res.json({ conversation, messages });
});

// DELETE /api/conversations/:id - delete conversation
router.delete('/:id', (req, res) => {
  const db = getDatabase();
  const result = db
    .prepare('DELETE FROM conversations WHERE id = ?')
    .run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  res.json({ success: true });
});

// DELETE /api/conversations - delete all conversations
router.delete('/', (req, res) => {
  const db = getDatabase();
  db.prepare('DELETE FROM messages').run();
  db.prepare('DELETE FROM conversations').run();
  res.json({ success: true });
});

// PATCH /api/conversations/:id/title - update title
router.patch('/:id/title', (req, res) => {
  const db = getDatabase();
  const { title } = req.body;

  db.prepare(
    `UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(title, req.params.id);

  res.json({ success: true });
});

export default router;
