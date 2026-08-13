CREATE TABLE IF NOT EXISTS team_template_usage (
  template_id VARCHAR(64) NOT NULL,
  use_count INT NOT NULL DEFAULT 0,
  last_used_at DATETIME(3) NULL,
  PRIMARY KEY (template_id),
  KEY idx_team_template_usage_count (use_count DESC, last_used_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
