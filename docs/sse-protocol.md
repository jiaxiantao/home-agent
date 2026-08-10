# SSE / AG-UI 事件协议

`POST /api/agent` 返回 `text/event-stream`。每个事件块格式：

```
event: <type>
data: <JSON>

```

`event` 与 JSON 内的 `type` 字段一致。当前实现是向 AG-UI 对齐的过渡协议：用 SSE 承载运行生命周期、工具调用与 A2UI 声明式 UI。

## 请求体

```ts
{
  message?: string;           // 新问题（resume 时可空）
  threadId?: string;          // 预留
  resume?: {
    actionId: "confirm_sql" | "cancel_sql";
    payload?: { runId?: string };
  };
}
```

## 事件类型

| type | 字段 | 说明 |
|------|------|------|
| `trace` | `phase`, `message` | 循环阶段日志（如 `start`、`plan`、`resume`） |
| `plan` | `plan` | 规划器输出：`action: tool \| answer` |
| `tool_call` | `tool`, `args` | 即将执行的工具 |
| `tool_result` | `tool`, `output`, `data?` | 工具返回摘要 + 可选结构化数据 |
| `a2ui` | `surface` | A2UI surface（确认卡 / 表格 / 图表） |
| `awaiting_input` | `runId`, `reason`, `sql`, `explanation` | 暂停等待用户确认 SQL |
| `step_metric` | `step`, `planMs`, `toolMs?`, `totalMs` | 单步耗时 |
| `answer` | `text`, `mock?` | 最终回答；`mock: true` 表示规则回退 |
| `done` | `steps`, `toolCalls`, `totalMs` | 循环结束统计 |
| `error` | `message` | 错误（工具失败或请求中断） |

## 问数确认序列

1. 用户提问 → `propose_sql` → `a2ui`（确认卡）→ `awaiting_input`（无 `done`）
2. 用户 `resume.confirm_sql` → `execute_sql` → `a2ui`（表格/图表）→ `answer` → `done`
3. 或 `resume.cancel_sql` → `answer`（已取消）→ `done`

## 前端消费

```ts
const { run, resume, surfaces, pendingRunId } = useAgentStream();

await run("正式车源一共有多少辆？");
// surfaces 中出现确认卡后：
await resume({ actionId: "confirm_sql", payload: { runId: pendingRunId! } });
```

## curl 调试

```bash
curl -N -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message":"大风车正式车源一共有多少辆？"}'
```
