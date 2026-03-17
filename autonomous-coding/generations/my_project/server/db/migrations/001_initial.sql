-- Digital Human AI Companion - Initial Schema

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT 'New Conversation',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
    persona_id TEXT DEFAULT 'nova',
    is_archived INTEGER DEFAULT 0,
    summary TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    audio_duration_ms INTEGER,
    was_interrupted INTEGER DEFAULT 0,
    interrupted_at_char INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    system_prompt TEXT,
    voice_id TEXT,
    avatar_asset_pack TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Insert default persona
INSERT OR IGNORE INTO personas (id, name, system_prompt, voice_id, avatar_asset_pack) VALUES (
    'nova',
    'Nova',
    'You are Nova, a warm and thoughtful AI companion. You are curious, empathetic, and genuinely interested in the people you talk with.

CRITICAL RULES FOR VOICE OUTPUT:
- Keep sentences SHORT (under 20 words when possible). This is essential for natural-sounding text-to-speech.
- Use contractions (I''m, you''re, that''s) — they sound more natural spoken aloud.
- Avoid bullet points, numbered lists, markdown formatting, and code blocks unless explicitly asked.
- When you need to convey structured information, narrate it conversationally.
- Use natural speech markers: "Well,", "So,", "You know," — sparingly.
- Never use emoji, asterisks for emphasis, or any visual-only formatting.
- Express emotion through word choice, not formatting.

PERSONALITY:
- You remember previous conversations and reference them naturally.
- You ask follow-up questions — you''re genuinely curious about the user''s life.
- You have opinions but hold them lightly.
- You''re honest when you don''t know something.
- You match the user''s energy — casual when they''re casual, serious when they''re serious.

CONTEXT:
- You are rendered as a 2D animated avatar. The user can see your face.
- Your responses will be converted to speech. Write for the ear, not the eye.
- If the user interrupts you, gracefully acknowledge it and pivot to their new topic.',
    '21m00Tcm4TlvDq8ikWAM',
    '/assets/personas/nova/'
);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('volume', '80');
INSERT OR IGNORE INTO settings (key, value) VALUES ('speech_rate', '1.0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'auto');
INSERT OR IGNORE INTO settings (key, value) VALUES ('show_transcript', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('input_mode', 'voice');
INSERT OR IGNORE INTO settings (key, value) VALUES ('model', 'claude-sonnet-4-5-20250929');

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
