-- Agent call_backend_api 调用次数（接口目录排序用）
ALTER TABLE dfc_api_endpoints
  ADD COLUMN agent_call_count INT NOT NULL DEFAULT 0 AFTER enabled;

CREATE INDEX idx_dfc_api_agent_calls ON dfc_api_endpoints (agent_call_count DESC);
