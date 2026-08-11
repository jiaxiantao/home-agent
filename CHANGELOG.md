# Changelog

本仓库遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式。

## [Unreleased]

## [0.4.5] - 2026-08-11

### Added

- 问数页支持 **测试 / 预发 / 线上** 三套数据环境切换（深色下拉，选择持久化到 localStorage）。
- 默认声明 `test,prepub,prod` 三个 profile；未配置的环境显示「未配置」且不可选。

### Changed

- `.env.example` 补充三套 MySQL 连接模板；环境标签「线上」替代「生产」。

## [0.4.4] - 2026-08-11

### Added

- 业务实体口径层 `business-glossary.ts`：区分车牛用户（matador.cheniu_user）、CRM 客户（super_mario.customer）、会员（danube_member）等易混概念。
- 扩展 schema-catalog：super_mario.customer、danube_member.membership_personal_information。
- Planner 动态上下文：按当前问题注入相关库/路由/表结构，减少 42 库全量 prompt。

### Changed

- 问数路由精确化：「用户 id」→ matador；「客户管理/跟进」→ super_mario；「客户 id」歧义时双候选。

## [0.4.3] - 2026-08-11

### Added

- 登记大风车 DBHub 全量 **42** 个业务库（`config/dbhub-dfc-sources.toml` + `project-databases.ts`），Agent 规划时可按自然语言语义路由到合适库。
- 扩展问数路由规则：SCRM、线索分发、客户管理、企业微信、检测、车牛用户等；客户/用户 ID 类问题优先 `cheniu_user`。

## [0.4.2] - 2026-08-11

### Changed

- 移除 matador 隐式兜底：无问题语义命中时不默认选库，改为跨库 `search_schema` 探索。
- UI 不再在状态栏/环境下拉强调 matador「连接默认」；仅用户手动指定时才加权偏好库。

## [0.4.1] - 2026-08-11

### Fixed

- 站点顶栏仍显示 `HOME AGENT`，已改为 `DFC Data Agent`。

## [0.4.0] - 2026-08-11

### Changed

- 项目名称统一为 **DFC Data Agent**（npm 包名 `dfc-data-agent`）；页面标题、K8s 清单、Redis/本地存储前缀同步更名。
- 默认 SSO 头改为 `x-dfc-data-agent-user-id` / `x-dfc-data-agent-user-name`（可用环境变量覆盖）。

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
