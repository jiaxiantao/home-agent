# Changelog

本仓库遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式。

## [Unreleased]

## [0.3.9] - 2026-08-11

### Changed

- Composer / 偏好库：去掉系统原生浅色下拉，改为深色自定义菜单；快捷问法改为轻量胶囊样式。

## [0.3.8] - 2026-08-11

### Added

- 产品品牌统一为「大风车数据分析助手 / DFC Data Agent」。
- 客户/用户 ID 问数：自动路由 `matador.cheniu_user` 并生成待确认 SQL。
- 偏好库默认「自动」——无需手动选库选表。

## [0.3.7] - 2026-08-11

### Added

- `route_question`：按自然语言自动规划候选数据库与表；跨库 `search_schema(acrossDatabases)`。
- 规则/LLM 规划器业务问数标准路径：route → describe/search → `propose_sql`（\`db\`.\`table\`）。

### Changed

- 默认 `AGENT_MAX_STEPS` 6 → 8，覆盖多步路由。
- MySQL 不可达时路由仍返回规则层候选库（CI / 离线可用）。

### Added

- 大风车数据分析助手：对接 matador test MySQL（`ANALYTICS_MYSQL_*`）。
- 只读 SQL guard / LIMIT / 超时；`propose_sql` → HITL 确认 → `execute_sql`。
- A2UI 确认卡、表格、图表（Recharts）；SSE 事件 `a2ui` / `awaiting_input`。
- Schema catalog（车源 / 订单 / 求购 / 运营日报）。
- `GET /api/health` 增加 `analyticsMysql` 连通性字段。

### Removed

- 笔记库与 Prisma/Postgres 全栈（`search_notes`、`/api/notes/search`、pg_trgm 等）。
- 学习型工具 `calculate` / `current_time`；Agent 仅保留问数四件套。

### Changed (continued)

- 健康检查与 Docker/CI 仅依赖分析 MySQL + LLM，不再要求应用 Postgres。

### Added (earlier)

- `GET /api/health` 响应增加 `agent.maxSteps` 字段，便于排查循环步数配置。
- `AGENT_MAX_STEPS_DEFAULT` / `AGENT_MAX_STEPS_CAP` 常量导出，统一默认与上限。
- `docs/roadmap.md` 记录从 demo 到业务 Agent 的演进方向。

### Changed (earlier)

- `getAgentMaxSteps` 无效环境变量时回退默认值的行为补充单元测试。
