import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(dbPath = './data/companion.db') {
  // Ensure directory exists
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  const migrationSql = readFileSync(
    join(__dirname, 'migrations', '001_initial.sql'),
    'utf-8'
  );
  db.exec(migrationSql);

  console.log('[DB] Database initialized at', dbPath);
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
