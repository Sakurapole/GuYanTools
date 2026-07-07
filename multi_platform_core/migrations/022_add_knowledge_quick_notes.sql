CREATE TABLE IF NOT EXISTS knowledge_quick_notes (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL,
    node_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    color TEXT NOT NULL DEFAULT 'yellow',
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    converted_page_id TEXT,
    converted_todo_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (converted_page_id) REFERENCES knowledge_pages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_quick_notes_library
    ON knowledge_quick_notes(library_id, is_pinned DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_quick_notes_node
    ON knowledge_quick_notes(node_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_quick_notes_todo
    ON knowledge_quick_notes(converted_todo_id);
