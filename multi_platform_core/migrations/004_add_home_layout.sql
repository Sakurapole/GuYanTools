CREATE TABLE IF NOT EXISTS home_workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS home_categories (
    id TEXT PRIMARY KEY,
    workspace_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    icon TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (workspace_id) REFERENCES home_workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS home_widgets (
    id TEXT PRIMARY KEY,
    workspace_id INTEGER NOT NULL,
    category_id TEXT NOT NULL,
    label TEXT NOT NULL,
    icon TEXT,
    action TEXT,
    col INTEGER NOT NULL,
    row INTEGER NOT NULL,
    col_span INTEGER NOT NULL,
    row_span INTEGER NOT NULL,
    preferred_col INTEGER NOT NULL,
    preferred_row INTEGER NOT NULL,
    priority INTEGER NOT NULL,
    color TEXT NOT NULL,
    background_image TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (workspace_id) REFERENCES home_workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES home_categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_home_categories_workspace_sort
    ON home_categories(workspace_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_home_widgets_workspace_category_priority
    ON home_widgets(workspace_id, category_id, priority);

INSERT OR IGNORE INTO home_workspaces (key, name, is_default)
VALUES ('default', 'Default Workspace', 1);

INSERT OR IGNORE INTO home_categories (id, workspace_id, label, icon, sort_order)
VALUES
    ('category-tools', (SELECT id FROM home_workspaces WHERE key = 'default'), '常用工具', 'category-tools', 1),
    ('category-media', (SELECT id FROM home_workspaces WHERE key = 'default'), '媒体处理', 'category-media', 2),
    ('category-text', (SELECT id FROM home_workspaces WHERE key = 'default'), '文本处理', 'category-text', 3),
    ('category-dev', (SELECT id FROM home_workspaces WHERE key = 'default'), '开发工具', 'category-dev', 4);

INSERT OR IGNORE INTO home_widgets (
    id,
    workspace_id,
    category_id,
    label,
    icon,
    action,
    col,
    row,
    col_span,
    row_span,
    preferred_col,
    preferred_row,
    priority,
    color,
    background_image,
    hidden
)
VALUES
    ('grid-item-1', (SELECT id FROM home_workspaces WHERE key = 'default'), 'category-tools', '工具1', 'tool', NULL, 1, 1, 1, 1, 1, 1, 1, 'linear-gradient(135deg, #5c9ded, #84c9ff)', NULL, 0),
    ('grid-item-2', (SELECT id FROM home_workspaces WHERE key = 'default'), 'category-tools', '工具2', 'settings', NULL, 3, 1, 1, 2, 3, 1, 2, 'linear-gradient(135deg, #ff9a75, #ffc38f)', NULL, 0),
    ('grid-item-3', (SELECT id FROM home_workspaces WHERE key = 'default'), 'category-tools', '工具3', 'tool', NULL, 5, 1, 2, 1, 5, 1, 3, 'linear-gradient(135deg, #6bdcba, #a5f2d4)', NULL, 0),
    ('grid-item-4', (SELECT id FROM home_workspaces WHERE key = 'default'), 'category-media', '视频', 'video', NULL, 1, 1, 2, 2, 1, 1, 1, 'linear-gradient(135deg, #b97fff, #d7a6ff)', NULL, 0),
    ('grid-item-5', (SELECT id FROM home_workspaces WHERE key = 'default'), 'category-media', '音频', 'audio', NULL, 4, 1, 1, 1, 4, 1, 2, 'linear-gradient(135deg, #ff6b9d, #ffa0c5)', NULL, 0),
    ('grid-item-6', (SELECT id FROM home_workspaces WHERE key = 'default'), 'category-text', '编辑器', 'edit', NULL, 1, 1, 3, 1, 1, 1, 1, 'linear-gradient(135deg, #ffd93d, #ffed4e)', NULL, 0),
    ('grid-item-7', (SELECT id FROM home_workspaces WHERE key = 'default'), 'category-text', '转换', 'convert', NULL, 1, 3, 1, 1, 1, 3, 2, 'linear-gradient(135deg, #6bcf7f, #a5f2b4)', NULL, 0),
    ('grid-item-8', (SELECT id FROM home_workspaces WHERE key = 'default'), 'category-dev', 'API', 'api', NULL, 1, 1, 2, 1, 1, 1, 1, 'linear-gradient(135deg, #667eea, #764ba2)', NULL, 0);
