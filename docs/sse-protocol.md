# SSE 事件协议

`POST /api/agent` 返回 `text/event-stream`。每个事件块格式：

```
event: <type>
data: <JSON>

```

`event` 与 JSON 内的 `type` 字段一致。

## 事件类型

| type | 字段 | 说明 |
|------|------|------|
| `trace` | `phase`, `message` | 循环阶段日志（如 `start`、`plan`） |
| `plan` | `plan` | 规划器输出：`action: tool \| answer` |
| `tool_call` | `tool`, `args` | 即将执行的工具 |
| `tool_result` | `tool`, `output` | 工具返回文本 |
| `step_metric` | `step`, `planMs`, `toolMs?`, `totalMs` | 单步耗时 |
| `answer` | `text`, `mock?` | 最终回答；`mock: true` 表示规则回退 |
| `done` | `steps`, `toolCalls`, `totalMs` | 循环结束统计 |
| `error` | `message` | 错误（工具失败或请求中断） |

## 示例序列（询问时间）

```
event: trace
data: {"type":"trace","phase":"start","message":"Agent 循环启动"}

event: plan
data: {"type":"plan","plan":{"action":"tool","tool":"current_time","args":{},"reasoning":"..."}}

event: tool_call
data: {"type":"tool_call","tool":"current_time","args":{}}

event: tool_result
data: {"type":"tool_result","tool":"current_time","output":"2026/6/9 12:00:00"}

event: answer
data: {"type":"answer","text":"现在是 ...","mock":true}

event: done
data: {"type":"done","steps":2,"toolCalls":1,"totalMs":42}
```

## 前端消费

项目提供 `useAgentStream` Hook（`src/hooks/use-agent-sse.ts`）：

```ts
const { run, stop, running, lines, finalAnswer, stats, stepMetrics } =
  useAgentStream({
    onEvent: (event) => console.log(event),
  });

await run("现在几点？");
```

底层用 `fetch` + `ReadableStream` 按 `\n\n` 分块解析 SSE。

## curl 调试

```bash
curl -N -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message":"计算 1+2"}'
```
