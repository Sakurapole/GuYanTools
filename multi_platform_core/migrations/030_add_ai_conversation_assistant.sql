ALTER TABLE ai_chat_conversations
    ADD COLUMN assistant_id TEXT NOT NULL DEFAULT 'default-assistant';

CREATE INDEX IF NOT EXISTS idx_ai_chat_conversations_assistant
    ON ai_chat_conversations(assistant_id, archived, pinned, updated_at);
