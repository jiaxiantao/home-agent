# 架构说明

大风车数据分析助手：自然语言问数 → 只读 SQL（HITL 确认）→ MySQL 查询 → A2UI 表格/图表。

## 模块职责

| 路径 | 职责 |
|------|------|
| `src/lib/analytics/*` | MySQL 连接、SQL guard、执行、schema catalog、chartSpec |
| `src/lib/a2ui/*` | A2UI surface / component 构建 |
| `src/lib/agent/run-loop.ts` | Agent 主循环 + SQL 确认暂停/恢复 |
| `src/lib/agent/planner.ts` | LLM 规划 + 规则回退 |
| `src/lib/agent/tools.ts` | 问数工具实现 |
| `src/app/api/agent/route.ts` | HTTP 入口（message / resume）→ SSE |
| `src/hooks/use-agent-sse.ts` | 前端消费 SSE + resume |
| `src/components/a2ui/*` | A2UI 渲染（含 Recharts） |

## 数据流

```mermaid
sequenceDiagram
  participant UI as /agents
  participant API as POST_api_agent
  participant Loop as runAgentLoop
  participant Plan as planAgentStep
  participant MySQL as matador_MySQL

  UI->>API: message
  API->>Loop: start
  Loop->>Plan: plan
  Plan-->>Loop: propose_sql
  Loop-->>UI: a2ui + awaiting_input
  UI->>API: resume confirm_sql
  API->>Loop: resume
  Loop->>MySQL: SELECT
  MySQL-->>Loop: rows
  Loop-->>UI: a2ui table/chart + answer + done
```

## 数据源

仅 **MySQL**（`ANALYTICS_MYSQL_*`）：大风车 matador 分析库（默认 test）。

## LLM 与回退

- 默认 Ollama + `qwen3`；也支持 OpenAI 兼容 API。
- `LLM_DISABLED=1` 或失败时使用 `planner-mock.ts`。
- 规划器不得直接 `execute_sql`；系统会改写为 `propose_sql`。

## 安全说明

- `/api/agent` 暂无鉴权，仅适合内网/本地。
- SQL 层强制只读 + LIMIT + 超时；执行前必须用户确认。
