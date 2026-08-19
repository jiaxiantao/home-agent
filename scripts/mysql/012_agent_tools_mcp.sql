ALTER TABLE agent_tools ADD COLUMN mcp_json JSON NULL AFTER http_json;

-- mcp_json stores: { "serverUrl": "...", "toolName": "...", "authToken?": "..." }
