CREATE TABLE IF NOT EXISTS route_rules (
  id VARCHAR(64) NOT NULL,
  pattern VARCHAR(500) NOT NULL,
  databases JSON NOT NULL,
  search_terms JSON NOT NULL,
  reason VARCHAR(200) NOT NULL DEFAULT '',
  suggested_tables JSON NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by VARCHAR(64) NOT NULL DEFAULT 'system',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_route_rules_enabled (enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
