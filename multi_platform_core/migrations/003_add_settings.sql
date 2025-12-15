-- 添加设置表
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 创建设置索引
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
-- 插入默认设置
INSERT
  OR IGNORE INTO settings (key, value, description)
VALUES ('app_version', '0.1.0', '应用版本'),
  ('theme', 'light', '主题设置'),
  ('language', 'zh-CN', '语言设置');