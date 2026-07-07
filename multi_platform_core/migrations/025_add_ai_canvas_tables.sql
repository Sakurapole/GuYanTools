CREATE TABLE IF NOT EXISTS ai_canvas_workspaces (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    title TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'markdown',
    active_version_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES ai_chat_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_canvas_files (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    path TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'markdown',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(workspace_id, path),
    FOREIGN KEY (workspace_id) REFERENCES ai_canvas_workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_canvas_versions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    source_message_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(workspace_id, version_no),
    FOREIGN KEY (workspace_id) REFERENCES ai_canvas_workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (source_message_id) REFERENCES ai_chat_messages(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_canvas_operations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    source_message_id TEXT,
    operation_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'applied',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (workspace_id) REFERENCES ai_canvas_workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (source_message_id) REFERENCES ai_chat_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_canvas_workspaces_conversation
    ON ai_canvas_workspaces(conversation_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_ai_canvas_files_workspace
    ON ai_canvas_files(workspace_id, path);

CREATE INDEX IF NOT EXISTS idx_ai_canvas_versions_workspace
    ON ai_canvas_versions(workspace_id, version_no);

CREATE INDEX IF NOT EXISTS idx_ai_canvas_operations_workspace
    ON ai_canvas_operations(workspace_id, created_at);
