# Changelog

本仓库遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式。

## [Unreleased]

### Added

- `GET /api/health` 响应增加 `agent.maxSteps` 字段，便于排查循环步数配置。
- `AGENT_MAX_STEPS_DEFAULT` / `AGENT_MAX_STEPS_CAP` 常量导出，统一默认与上限。
- `docs/roadmap.md` 记录从 demo 到业务 Agent 的演进方向。

### Changed

- `getAgentMaxSteps` 无效环境变量时回退默认值的行为补充单元测试。
