/**
 * 单轮运行内的工具调用护栏。
 *
 * 步数上限只能兜住「最坏情况」，兜不住「同一个调用重复 8 次」这种空转：
 * 每空转一步都要付一次完整的规划 LLM 费用。这里用两条确定性规则提前掐断：
 *   1. 参数完全相同的调用不再执行，直接把已有结论回给模型
 *   2. 每个工具有独立的调用预算，超了就提示换路
 * 两种情况都返回一条 ToolMessage 内容让模型改变策略，而不是终止整轮。
 */

/** 超过预算说明模型在原地打转，而不是在推进 */
export const DEFAULT_TOOL_CALL_BUDGET: Record<string, number> = {
  route_api: 2,
  search_api: 3,
  route_question: 2,
  search_schema: 4,
  describe_table: 5,
  list_tables: 3,
  list_databases: 2,
  list_schema: 2,
  call_backend_api: 4,
  propose_sql: 3,
  build_chart: 2,
};

const DEFAULT_BUDGET_FALLBACK = 3;

/** 键排序后序列化，保证 {a:1,b:2} 与 {b:2,a:1} 指向同一次调用 */
export function fingerprintToolCall(name: string, args: unknown): string {
  return `${name}:${stableStringify(args)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

export type LoopGuardVerdict =
  | { allowed: true }
  | { allowed: false; reason: "duplicate" | "budget"; message: string };

export type AgentLoopGuardOptions = {
  budget?: Record<string, number>;
  fallbackBudget?: number;
};

export class AgentLoopGuard {
  private readonly seen = new Set<string>();
  private readonly counts = new Map<string, number>();
  private readonly budget: Record<string, number>;
  private readonly fallbackBudget: number;

  constructor(options: AgentLoopGuardOptions = {}) {
    this.budget = options.budget ?? DEFAULT_TOOL_CALL_BUDGET;
    this.fallbackBudget = options.fallbackBudget ?? DEFAULT_BUDGET_FALLBACK;
  }

  budgetFor(name: string) {
    return this.budget[name] ?? this.fallbackBudget;
  }

  usedFor(name: string) {
    return this.counts.get(name) ?? 0;
  }

  inspect(name: string, args: unknown): LoopGuardVerdict {
    if (this.seen.has(fingerprintToolCall(name, args))) {
      return {
        allowed: false,
        reason: "duplicate",
        message:
          `工具 ${name} 已用完全相同的参数调用过，结果见上文，不会重复执行。` +
          `请改变参数、换一个工具，或基于已有结果直接作答。`,
      };
    }

    const limit = this.budgetFor(name);
    if (this.usedFor(name) >= limit) {
      return {
        allowed: false,
        reason: "budget",
        message:
          `工具 ${name} 本轮已调用 ${limit} 次，达到上限。` +
          `请改用其它工具推进（例如 route_api → call_backend_api → propose_sql），或基于已有结果直接作答。`,
      };
    }

    return { allowed: true };
  }

  record(name: string, args: unknown) {
    this.seen.add(fingerprintToolCall(name, args));
    this.counts.set(name, this.usedFor(name) + 1);
  }

  /** 一次判定并登记；被拦截的调用不计入预算，避免二次惩罚 */
  admit(name: string, args: unknown): LoopGuardVerdict {
    const verdict = this.inspect(name, args);
    if (verdict.allowed) {
      this.record(name, args);
    }
    return verdict;
  }
}
