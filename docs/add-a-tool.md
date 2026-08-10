# 如何新增一个 Tool

以添加 `count_tables`（统计表行数）为例，需改 4 处并保持类型一致。

## 1. 声明工具名与类型

`src/lib/agent/types.ts`：

```ts
export type AgentToolName =
  | "list_schema"
  | "propose_sql"
  | "execute_sql"
  | "build_chart"
  | "count_tables"; // 新增
```

## 2. 注册工具目录（UI 展示）

`src/lib/agent/tool-catalog.ts`：

```ts
{
  name: "count_tables",
  label: "表行数",
  description: "统计指定表的行数",
  args: { table: "string" },
},
```

## 3. 实现工具逻辑

`src/lib/agent/tools.ts` 的 `runAgentTool`：

```ts
case "count_tables": {
  const table = String(args.table ?? "").trim();
  // 调用 runAnalyticsQuery 等
  return { output: `表 ${table} 共 N 行` };
}
```

## 4. 告诉规划器有这个工具

`src/lib/agent/planner.ts` 的 system prompt 中加入：

```
- count_tables: { "table": string } — 统计表行数
```

并在 `planner-schema.ts` 的 `agentToolNameSchema` 枚举中加入 `"count_tables"`。

可选：在 `planner-mock.ts` 增加关键词规则，便于 `LLM_DISABLED=1` 时演示。

## 5. 验证

```bash
pnpm typecheck
pnpm test
pnpm dev   # 另一终端
pnpm smoke
```

## 检查清单

- [ ] `types.ts` 工具名
- [ ] `tool-catalog.ts` 文档
- [ ] `tools.ts` 实现
- [ ] `planner-schema.ts` Zod 枚举
- [ ] `planner.ts` system prompt
- [ ] （可选）`planner-mock.ts` 规则
- [ ] （可选）`agent-quick-prompts.ts` 快捷按钮
