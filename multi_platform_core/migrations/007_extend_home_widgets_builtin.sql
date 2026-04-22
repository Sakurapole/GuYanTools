ALTER TABLE home_widgets ADD COLUMN source_type TEXT NOT NULL DEFAULT 'shortcut';
ALTER TABLE home_widgets ADD COLUMN widget_type TEXT NOT NULL DEFAULT 'shortcut';
ALTER TABLE home_widgets ADD COLUMN size_preset TEXT;
ALTER TABLE home_widgets ADD COLUMN widget_config TEXT;
