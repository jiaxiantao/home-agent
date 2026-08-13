-- 收藏问法改为团队模板固定分类「我的收藏」：按用户记录星标，不再复制问法行。

DROP TABLE IF EXISTS favorites;

CREATE TABLE IF NOT EXISTS team_template_favorites (
  user_id VARCHAR(64) NOT NULL,
  template_id VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, template_id),
  KEY idx_team_template_favorites_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO team_template_categories (id, name, description, sort_order)
VALUES ('cat_my_favorites', '我的收藏', '个人收藏的问法，不可删除', 0);
