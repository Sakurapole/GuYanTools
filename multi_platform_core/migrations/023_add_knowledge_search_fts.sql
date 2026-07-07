CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_search_fts USING fts5(
    library_id UNINDEXED,
    source_type UNINDEXED,
    source_id UNINDEXED,
    node_id UNINDEXED,
    asset_id UNINDEXED,
    title,
    body,
    tags,
    metadata,
    tokenize = 'unicode61'
);

CREATE INDEX IF NOT EXISTS idx_knowledge_ai_chunks_source
    ON knowledge_ai_chunks(source_type, source_id);
