# 架构说明

Home Agent 演示一条最小可用的 **Plan → Tool → Answer** 循环，并通过 SSE 把每一步推给前端，方便学习「Agent 编排 UI」。

## 模块职责

| 路径 | 职责 |
|------|------|
| `src/lib/agent/types.ts` | 规划结果、工具名、SSE 事件类型 |
| `src/lib/agent/run-loop.ts` | Agent 主循环（步数上限、工具执行、事件产出） |
| `src/lib/agent/planner.ts` | LLM 规划 + 规则回退 |
| `src/lib/agent/planner-mock.ts` | 无 LLM 时的规则规划器 |
| `src/lib/agent/planner-schema.ts` | Zod 校验 LLM 输出的 JSON |
| `src/lib/agent/tools.ts` | 工具实现（检索、计算、时间） |
| `src/app/api/agent/route.ts` | HTTP 入口，将循环事件转为 SSE |
| `src/hooks/use-agent-sse.ts` | 前端消费 SSE 的可复用 Hook |
| `src/lib/note-search.ts` | 笔记检索（pg_trgm / memory） |

## 数据流

```mermaid
sequenceDiagram
  participant UI as /agents 页面
  participant API as POST /api/agent
  participant Loop as runAgentLoop
  participant Plan as planAgentStep
  participant Tool as executeAgentTool

  UI->>API: { message }
  API->>Loop: 启动 async generator
  loop 每步
    Loop->>Plan: message + priorTools
    Plan-->>Loop: AgentPlan
    alt action = tool
      Loop->>Tool: tool + args
      Tool-->>Loop: output
    else action = answer
      Loop-->>API: answer + done
    end
    Loop-->>API: trace / plan / tool_* 事件
  end
  API-->>UI: text/event-stream
```

## LLM 与回退

- 配置 Ollama 或 OpenAI 兼容 API 时，规划器用 `response_format: json_object` 要求结构化输出。
- `LLM_DISABLED=1` 或 LLM 调用失败时，使用 `planner-mock.ts` 中的规则规划器（CI 依赖此路径）。
- LLM 返回的 JSON 经 Zod 校验；无效时同样回退规则规划器。

## 前端编排（进阶）

`src/lib/front-intelligence-preferences.ts` 与 `IntelligenceLearningPanel` 演示如何把用户偏好注入 prompt，并通过 localStorage 持久化。这是**可选进阶模块**，不影响 Agent 核心循环。

## 安全说明

- `/api/agent` 无鉴权，仅适合本地学习与 demo。
- `calculate` 工具使用受限表达式求值，生产环境需沙箱方案。
