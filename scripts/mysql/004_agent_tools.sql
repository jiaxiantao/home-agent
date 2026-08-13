CREATE TABLE IF NOT EXISTS agent_tools (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  label VARCHAR(80) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  args_json JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  kind VARCHAR(16) NOT NULL,
  http_json JSON NULL,
  builtin TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(64) NOT NULL DEFAULT 'system',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_agent_tools_name (name),
  KEY idx_agent_tools_kind (kind, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
