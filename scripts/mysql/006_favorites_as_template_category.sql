-- 收藏问法改为团队模板固定分类「我的收藏」，不再使用独立 favorites 表。

DROP TABLE IF EXISTS favorites;

SET @has_uk := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'team_templates'
    AND index_name = 'uk_team_templates_prompt'
);
SET @sql := IF(
  @has_uk > 0,
  'ALTER TABLE team_templates DROP INDEX uk_team_templates_prompt',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'team_templates'
    AND index_name = 'idx_team_templates_owner_prompt'
);
SET @sql := IF(
  @has_idx = 0,
  'ALTER TABLE team_templates ADD KEY idx_team_templates_owner_prompt (created_by, prompt(191))',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO team_template_categories (id, name, description, sort_order)
VALUES ('cat_my_favorites', '我的收藏', '个人收藏的问法，不可删除', 0);
