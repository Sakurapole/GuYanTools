CREATE TABLE IF NOT EXISTS knowledge_libraries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_libraries_default
    ON knowledge_libraries(is_default)
    WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS knowledge_spaces (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'library',
    color TEXT NOT NULL DEFAULT '#4A90D9',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_spaces_default
    ON knowledge_spaces(library_id, is_default)
    WHERE is_default = 1;
CREATE INDEX IF NOT EXISTS idx_knowledge_spaces_library ON knowledge_spaces(library_id, sort_order);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL,
    space_id TEXT,
    parent_id TEXT,
    node_type TEXT NOT NULL CHECK (node_type IN ('folder', 'page', 'document', 'quick_note')),
    title TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
    FOREIGN KEY (space_id) REFERENCES knowledge_spaces(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_id) REFERENCES knowledge_nodes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_library ON knowledge_nodes(library_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_space ON knowledge_nodes(space_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_parent ON knowledge_nodes(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_updated ON knowledge_nodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_archived ON knowledge_nodes(is_archived);

CREATE TABLE IF NOT EXISTS knowledge_pages (
    id TEXT PRIMARY KEY,
    page_type TEXT NOT NULL DEFAULT 'markdown' CHECK (page_type IN ('markdown', 'block', 'canvas', 'external_document')),
    content_markdown TEXT NOT NULL DEFAULT '',
    content_json TEXT,
    content_text TEXT NOT NULL DEFAULT '',
    properties_json TEXT,
    source_asset_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_pages_type ON knowledge_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_pages_updated ON knowledge_pages(updated_at);

CREATE TABLE IF NOT EXISTS knowledge_assets (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL,
    hash TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    extension TEXT NOT NULL DEFAULT '',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL,
    original_path TEXT,
    preview_path TEXT,
    thumbnail_path TEXT,
    extracted_text TEXT NOT NULL DEFAULT '',
    metadata_json TEXT,
    import_status TEXT NOT NULL DEFAULT 'pending' CHECK (import_status IN ('pending', 'ready', 'failed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_assets_library ON knowledge_assets(library_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_assets_hash ON knowledge_assets(hash);
CREATE INDEX IF NOT EXISTS idx_knowledge_assets_status ON knowledge_assets(import_status);

CREATE TABLE IF NOT EXISTS knowledge_tags (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4A90D9',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
    UNIQUE (library_id, name)
);

CREATE TABLE IF NOT EXISTS knowledge_tag_bindings (
    id TEXT PRIMARY KEY,
    tag_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('page', 'asset', 'quick_note', 'todo')),
    target_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tag_id) REFERENCES knowledge_tags(id) ON DELETE CASCADE,
    UNIQUE (tag_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tag_bindings_target
    ON knowledge_tag_bindings(target_type, target_id);

CREATE TABLE IF NOT EXISTS knowledge_links (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    target_url TEXT,
    link_type TEXT NOT NULL DEFAULT 'reference',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_source ON knowledge_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_target ON knowledge_links(target_type, target_id);

CREATE TABLE IF NOT EXISTS knowledge_index_jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
    progress REAL NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_index_jobs_status ON knowledge_index_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_index_jobs_target ON knowledge_index_jobs(target_type, target_id);

CREATE TABLE IF NOT EXISTS knowledge_ai_chunks (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content_text TEXT NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (source_type, source_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    id TEXT PRIMARY KEY,
    chunk_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    dimension INTEGER NOT NULL,
    vector_blob BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (chunk_id) REFERENCES knowledge_ai_chunks(id) ON DELETE CASCADE,
    UNIQUE (chunk_id, provider, model)
);
