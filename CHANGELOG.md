# Changelog

本仓库遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式。

## [Unreleased]

### Added

- 大风车数据分析助手：对接 matador test MySQL（`ANALYTICS_MYSQL_*`）。
- 只读 SQL guard / LIMIT / 超时；`propose_sql` → HITL 确认 → `execute_sql`。
- A2UI 确认卡、表格、图表（Recharts）；SSE 事件 `a2ui` / `awaiting_input`。
- Schema catalog（车源 / 订单 / 求购 / 运营日报）。
- `GET /api/health` 增加 `analyticsMysql` 连通性字段。

### Changed

- `/agents` 定位为问数工作台；快捷问法改为车源/订单/趋势等。
- Agent 工具输出支持结构化 `data`；文档与 roadmap 同步更新。

### Added (earlier)

- `GET /api/health` 响应增加 `agent.maxSteps` 字段，便于排查循环步数配置。
- `AGENT_MAX_STEPS_DEFAULT` / `AGENT_MAX_STEPS_CAP` 常量导出，统一默认与上限。
- `docs/roadmap.md` 记录从 demo 到业务 Agent 的演进方向。

### Changed (earlier)

- `getAgentMaxSteps` 无效环境变量时回退默认值的行为补充单元测试。
