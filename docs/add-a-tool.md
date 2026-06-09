# 如何新增一个 Tool

以添加 `echo`（回显用户输入）为例，需改 4 处并保持类型一致。

## 1. 声明工具名与类型

`src/lib/agent/types.ts`：

```ts
export type AgentToolName =
  | "search_notes"
  | "calculate"
  | "current_time"
  | "echo"; // 新增
```

## 2. 注册工具目录（UI 展示）

`src/lib/agent/tool-catalog.ts`：

```ts
{
  name: "echo",
  label: "回显",
  description: "原样返回输入文本",
  args: { text: "string" },
},
```

## 3. 实现工具逻辑

`src/lib/agent/tools.ts` 的 `runAgentTool`：

```ts
case "echo": {
  const text = String(args.text ?? "").trim();
  return text || "（空输入）";
}
```

## 4. 告诉规划器有这个工具

`src/lib/agent/planner.ts` 的 `plannerSystem` 字符串中加入：

```
- echo: { "text": string } — 回显文本
```

并在 `planner-schema.ts` 的 `agentToolNameSchema` 枚举中加入 `"echo"`。

可选：在 `planner-mock.ts` 增加关键词规则，便于 `LLM_DISABLED=1` 时演示。

## 5. 验证

```bash
pnpm typecheck
pnpm test
pnpm dev   # 另一终端
pnpm smoke
```

在 `/agents` 页面输入「请 echo 你好」观察 trace 是否出现 `tool_call → echo`。

## 检查清单

- [ ] `types.ts` 工具名
- [ ] `tool-catalog.ts` 文档
- [ ] `tools.ts` 实现
- [ ] `planner-schema.ts` Zod 枚举
- [ ] `planner.ts` system prompt
- [ ] （可选）`planner-mock.ts` 规则
- [ ] （可选）`agent-quick-prompts.ts` 快捷按钮
