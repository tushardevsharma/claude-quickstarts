import { Router } from 'express';
import { getDatabase } from '../db/database.js';
import { isElevenLabsConfigured } from '../services/tts.js';

const router = Router();

// GET /api/settings - get all settings
router.get('/', (req, res) => {
  const db = getDatabase();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(({ key, value }) => {
    try {
      settings[key] = JSON.parse(value);
    } catch {
      settings[key] = value;
    }
  });

  // Add server capabilities
  settings._capabilities = {
    elevenlabs: isElevenLabsConfigured(),
    deepgram: !!(process.env.DEEPGRAM_API_KEY),
  };

  res.json({ settings });
});

// PUT /api/settings - update settings
router.put('/', (req, res) => {
  const db = getDatabase();
  const { settings } = req.body;

  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings object required' });
  }

  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );

  const upsertMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
      // Skip internal capability keys
      if (key.startsWith('_')) continue;
      upsert.run(key, JSON.stringify(value));
    }
  });

  upsertMany(Object.entries(settings));
  res.json({ success: true });
});

export default router;
