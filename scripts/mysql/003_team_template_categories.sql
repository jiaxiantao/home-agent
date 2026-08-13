CREATE TABLE IF NOT EXISTS team_template_categories (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(40) NOT NULL,
  description VARCHAR(200) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_team_template_categories_name (name),
  KEY idx_team_template_categories_sort (sort_order, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
