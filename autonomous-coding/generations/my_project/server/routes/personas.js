import { Router } from 'express';
import { getDatabase } from '../db/database.js';

const router = Router();

// GET /api/personas - list all personas
router.get('/', (req, res) => {
  const db = getDatabase();
  const personas = db.prepare('SELECT id, name, voice_id, avatar_asset_pack FROM personas').all();
  res.json({ personas });
});

// GET /api/personas/:id - get a specific persona
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(req.params.id);

  if (!persona) {
    return res.status(404).json({ error: 'Persona not found' });
  }

  res.json({ persona });
});

export default router;
