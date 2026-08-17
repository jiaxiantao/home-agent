-- 大风车接口目录（HTTP / Dubbo），含默认测试入参
CREATE TABLE IF NOT EXISTS dfc_api_endpoints (
  id VARCHAR(512) NOT NULL,
  app_code VARCHAR(64) NOT NULL,
  kind VARCHAR(8) NOT NULL,
  title VARCHAR(256) NOT NULL,
  description TEXT NULL,
  read_only TINYINT(1) NOT NULL DEFAULT 1,
  base_url_env_key VARCHAR(128) NOT NULL DEFAULT 'DFC_API_GATEWAY_BASE_URL',
  endpoint_json JSON NOT NULL,
  default_test_params_json JSON NULL,
  seeded TINYINT(1) NOT NULL DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(64) NOT NULL DEFAULT 'system',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_dfc_api_app_kind (app_code, kind),
  KEY idx_dfc_api_kind_enabled (kind, enabled),
  KEY idx_dfc_api_title (title(64))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
