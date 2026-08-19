CREATE TABLE IF NOT EXISTS dashboard_cards (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  question VARCHAR(2000) NOT NULL,
  sql_text TEXT NULL,
  surface_json JSON NULL,
  chart_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  shared TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_dashboard_user (user_id, sort_order),
  KEY idx_dashboard_shared (shared, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
