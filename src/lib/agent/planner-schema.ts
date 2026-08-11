import { z } from "zod";

export const agentToolNameSchema = z.enum([
  "list_project_databases",
  "list_databases",
  "list_tables",
  "describe_table",
  "get_column",
  "list_indexes",
  "list_foreign_keys",
  "show_create_table",
  "get_table_stats",
  "search_schema",
  "route_question",
  "sample_table_rows",
  "list_schema",
  "propose_sql",
  "execute_sql",
  "build_chart",
]);

const toolPlanSchema = z.object({
  action: z.literal("tool"),
  tool: agentToolNameSchema,
  args: z.record(z.string(), z.unknown()).default({}),
  reasoning: z.string().optional(),
});

const answerPlanSchema = z.object({
  action: z.literal("answer"),
  answer: z.string().min(1),
  reasoning: z.string().optional(),
});

export const agentPlanSchema = z.discriminatedUnion("action", [
  toolPlanSchema,
  answerPlanSchema,
]);

export function parsePlanFromLlm(raw: string) {
  const json = JSON.parse(raw) as unknown;
  const parsed = agentPlanSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error("Planner JSON 格式无效");
  }

  const plan = parsed.data;

  if (plan.action === "tool") {
    return {
      action: "tool" as const,
      tool: plan.tool,
      args: plan.args,
      reasoning: plan.reasoning?.trim() || `调用 ${plan.tool} 完成当前步骤`,
    };
  }

  return {
    action: "answer" as const,
    answer: plan.answer,
    reasoning: plan.reasoning?.trim() || "基于已有信息直接回答",
  };
}
