CREATE TABLE IF NOT EXISTS ai_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    instructions TEXT,
    knowledge_library_id TEXT,
    knowledge_space_id TEXT,
    include_global_memory INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE ai_chat_conversations ADD COLUMN project_id TEXT REFERENCES ai_projects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ai_memories (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    scope_id TEXT,
    content TEXT NOT NULL,
    source_message_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (source_message_id) REFERENCES ai_chat_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_projects_updated
    ON ai_projects(archived, updated_at);

CREATE INDEX IF NOT EXISTS idx_ai_chat_conversations_project
    ON ai_chat_conversations(project_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_ai_memories_scope
    ON ai_memories(scope, scope_id, enabled, updated_at);
