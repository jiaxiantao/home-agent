CREATE TABLE IF NOT EXISTS team_templates (
  id VARCHAR(64) NOT NULL,
  label VARCHAR(40) NOT NULL,
  prompt VARCHAR(2000) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT '通用',
  created_by VARCHAR(64) NOT NULL DEFAULT 'system',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_team_templates_prompt (prompt(191)),
  KEY idx_team_templates_category (category, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favorites (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  label VARCHAR(40) NOT NULL,
  prompt VARCHAR(2000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_favorites_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS query_history (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  thread_id VARCHAR(64) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NULL,
  sql_text TEXT NULL,
  row_count INT NULL,
  status VARCHAR(32) NOT NULL,
  run_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_query_history_user (user_id, created_at),
  KEY idx_query_history_run (user_id, run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_threads (
  thread_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  messages_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, thread_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pending_sql_runs (
  run_id VARCHAR(64) NOT NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (run_id),
  KEY idx_pending_sql_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_user (user_id),
  KEY idx_audit_event (event)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
