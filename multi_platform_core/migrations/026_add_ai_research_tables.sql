CREATE TABLE IF NOT EXISTS ai_research_jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    query TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    stage TEXT NOT NULL DEFAULT 'plan',
    provider_id TEXT,
    model_id TEXT,
    progress REAL NOT NULL DEFAULT 0,
    report_markdown TEXT,
    error_message TEXT,
    options_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_research_sources (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    source_id TEXT,
    snippet TEXT,
    summary TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (job_id) REFERENCES ai_research_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_research_jobs_status_updated
    ON ai_research_jobs(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_ai_research_sources_job
    ON ai_research_sources(job_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_research_sources_identity
    ON ai_research_sources(job_id, source_type, source_id, url);
