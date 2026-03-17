-- Migration 002: Add model_id to messages and active_model to conversations

-- Add model_id column to messages (stores which model generated each assistant turn)
ALTER TABLE messages ADD COLUMN model_id TEXT DEFAULT NULL;

-- Add active_model column to conversations (stores current active model for the conversation)
ALTER TABLE conversations ADD COLUMN active_model TEXT DEFAULT 'claude-sonnet-4-5';

-- Add new settings defaults
INSERT OR IGNORE INTO settings (key, value) VALUES ('active_model', '"claude-sonnet-4-5"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('model_switching_scope', '"this_conversation"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('show_model_indicator', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('tts_voice', '"default"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('avatar_character', '"nova"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('idle_animation_intensity', '1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('push_to_talk', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('caption_font_size', '"medium"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('response_style', '"concise"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('store_history', 'true');
