CREATE TABLE IF NOT EXISTS mobile_home_widget_layouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    widget_id TEXT NOT NULL,
    layout_scope TEXT NOT NULL,
    col INTEGER NOT NULL,
    row INTEGER NOT NULL,
    col_span INTEGER NOT NULL,
    row_span INTEGER NOT NULL,
    preferred_col INTEGER NOT NULL,
    preferred_row INTEGER NOT NULL,
    priority INTEGER NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (workspace_id) REFERENCES home_workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (widget_id) REFERENCES home_widgets(id) ON DELETE CASCADE,
    UNIQUE (workspace_id, widget_id, layout_scope)
);

CREATE INDEX IF NOT EXISTS idx_mobile_home_widget_layouts_scope
    ON mobile_home_widget_layouts(workspace_id, layout_scope);
