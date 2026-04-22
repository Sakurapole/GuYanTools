-- 为 home_categories 添加背景字段
ALTER TABLE home_categories ADD COLUMN background_color TEXT;
ALTER TABLE home_categories ADD COLUMN background_image TEXT;
ALTER TABLE home_categories ADD COLUMN background_video TEXT;
ALTER TABLE home_categories ADD COLUMN background_style TEXT;

-- 为 home_widgets 添加视频背景和样式字段
ALTER TABLE home_widgets ADD COLUMN background_video TEXT;
ALTER TABLE home_widgets ADD COLUMN background_style TEXT;
