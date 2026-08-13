ALTER TABLE agent_threads
  ADD COLUMN title VARCHAR(120) NULL AFTER messages_json;

ALTER TABLE agent_threads
  ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER title;

ALTER TABLE agent_threads
  ADD KEY idx_agent_threads_updated (user_id, updated_at);
