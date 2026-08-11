# 安全与内网部署

大风车数据分析助手上线前必读。

## 生产环境变量（必填）

```env
NODE_ENV=production
PRODUCTION_STRICT=1

AUTH_MODE=trusted_header   # 或 token
TRUSTED_PROXY_ONLY=1

ANALYTICS_MYSQL_USER=souche_ro
ANALYTICS_MYSQL_TABLE_ALLOWLIST=car,car_extra,main_order,common_order,car_deal,buy_car,buy_call,operate_report

REDIS_URL=redis://...
REDIS_REQUIRED=1

LLM_REQUIRE=1
OLLAMA_BASE_URL=http://internal-llm:11434/v1

ANALYTICS_MYSQL_EXPLAIN_GUARD=1
ANALYTICS_MYSQL_EXPLAIN_MAX_ROWS=200000

AUTH_ADMIN_USER_IDS=admin001
RATE_LIMIT_AGENT_PER_MIN=30
```

## 鉴权模式

| 模式 | 适用 |
|------|------|
| `token` | 内测 / 小团队 |
| `trusted_header` | **推荐**：SSO 网关注入用户头 |
| `disabled` | 仅本地开发 |

### SSO 网关（推荐）

```env
AUTH_MODE=trusted_header
AUTH_TRUSTED_USER_ID_HEADER=x-home-agent-user-id
AUTH_TRUSTED_USER_NAME_HEADER=x-home-agent-user-name
TRUSTED_PROXY_ONLY=1
```

应用不得暴露公网；仅内网负载均衡 / SSO 网关可访问。

## 数据安全

1. **只读账号**：`souche_ro` 或同等权限
2. **表白名单**：`ANALYTICS_MYSQL_TABLE_ALLOWLIST`
3. **PII 脱敏**：phone/mobile/id_card 等字段自动掩码
4. **EXPLAIN 守卫**：大扫描量 SQL 拒绝执行
5. **HITL**：任意业务 SQL 必须用户确认

## 审计

- stdout 输出 `{"audit":{...}}`，接入 ELK/Loki
- 同时写入 Redis List / 内存缓冲（TTL 14 天，最多 500 条）
- 管理员可查询：`GET /api/audit?limit=50`（需 `AUTH_ADMIN_USER_IDS`）

## 查询历史

- 服务端：`GET /api/history`（按用户隔离，Redis/内存，最多 100 条）
- 前端侧边栏优先展示服务端历史，失败时回退本地 localStorage

## 收藏问法

- `GET/POST/DELETE /api/favorites`：按用户持久化常用自然语言问法

## 多环境分析库

```env
ANALYTICS_MYSQL_PROFILES=test,prepub
ANALYTICS_MYSQL_PREPUB_HOST=...
ANALYTICS_MYSQL_PREPUB_DATABASE=matador
ANALYTICS_MYSQL_PREPUB_USER=souche_ro
ANALYTICS_MYSQL_PREPUB_PASSWORD=...
```

前端可切换环境；`POST /api/agent` 传 `analyticsEnv`。凭证仅存服务端。

## 审计 HTTP sink

```env
AUDIT_HTTP_URL=https://logs.example.internal/ingest
AUDIT_HTTP_TOKEN=...
```

每条审计 JSON POST 到日志平台（失败不影响主流程）。

## 角色

- **analyst**（默认）：问数、元数据、提出/确认 SQL
- **admin**（`AUTH_ADMIN_USER_IDS`）：额外可用 `sample_table_rows`、查看 `/api/audit`

## 部署检查

- [ ] `GET /api/health` → `ready: true`
- [ ] VPN/内网可达 matador
- [ ] Redis 多副本会话
- [ ] LLM 内网可达且 `LLM_REQUIRE=1`
- [ ] 日志平台采集 audit

详见 [deployment.md](./deployment.md) · [analyst-guide.md](./analyst-guide.md)
