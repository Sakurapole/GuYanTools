-- Todo 功能数据表
-- 列表表
CREATE TABLE IF NOT EXISTS todo_lists (
    id TEXT PRIMARY KEY,
    workspace_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'list',
    theme_color TEXT DEFAULT '#4A90D9',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 任务表
CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    title TEXT NOT NULL,
    note TEXT DEFAULT '',
    is_completed INTEGER NOT NULL DEFAULT 0,
    is_important INTEGER NOT NULL DEFAULT 0,
    is_my_day INTEGER NOT NULL DEFAULT 0,
    my_day_date TEXT,
    due_date TEXT,
    repeat_rule TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (list_id) REFERENCES todo_lists(id) ON DELETE CASCADE
);

-- 步骤表
CREATE TABLE IF NOT EXISTS todo_steps (
    id TEXT PRIMARY KEY,
    todo_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

-- 提醒表
CREATE TABLE IF NOT EXISTS todo_reminders (
    id TEXT PRIMARY KEY,
    todo_id TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    is_sent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_todos_list_id ON todos(list_id);
CREATE INDEX IF NOT EXISTS idx_todos_is_my_day ON todos(is_my_day, my_day_date);
CREATE INDEX IF NOT EXISTS idx_todos_is_important ON todos(is_important);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_is_completed ON todos(is_completed);
CREATE INDEX IF NOT EXISTS idx_todo_steps_todo_id ON todo_steps(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_reminders_remind_at ON todo_reminders(remind_at, is_sent);

-- 插入默认列表
INSERT INTO todo_lists (id, workspace_id, name, icon, theme_color, sort_order)
VALUES ('default-tasks', 1, '任务', 'list', '#4A90D9', 0);
