import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { ThreadTurn } from "@/lib/agent/planner";
import { createChatModel, isLangGraphLlmEnabled } from "@/lib/agent/langgraph/model";
import { withLlmRetry } from "@/lib/agent/llm-retry";

const MAX_FOLLOW_UPS = 3;

function normalizeFollowUps(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const text = String(item ?? "")
      .replace(/^[\d）).、.\s-]+/, "")
      .replace(/^["「『]|["」』]$/g, "")
      .trim();
    if (!text || text.length > 80 || seen.has(text)) {
      continue;
    }
    seen.add(text);
    out.push(text);
    if (out.length >= MAX_FOLLOW_UPS) {
      break;
    }
  }
  return out;
}

function parseFollowUpsFromModelText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeFollowUps(parsed);
    }
    if (parsed && typeof parsed === "object" && "followUps" in parsed) {
      return normalizeFollowUps((parsed as { followUps?: unknown }).followUps);
    }
  } catch {
    // fall through: extract JSON array substring
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return normalizeFollowUps(JSON.parse(arrayMatch[0]));
    } catch {
      // ignore
    }
  }

  return normalizeFollowUps(
    trimmed
      .split("\n")
      .map((line) => line.replace(/^[\d）).、.\s-]+/, "").trim())
      .filter(Boolean),
  );
}

/** 无 LLM 时按问题与结论做规则级追问 */
export function buildRuleFollowUps(input: {
  message: string;
  answer: string;
}): string[] {
  const text = `${input.message}\n${input.answer}`;
  const out: string[] = [];

  if (/客户|crm|recordId|跟进|意向|手机号|微信/i.test(text)) {
    out.push("这个客户最近的跟进记录有哪些？");
    out.push("这个客户的意向车型再展开看看？");
    out.push("同店同等级客户还有多少？");
  } else if (/车源|车辆|在售|matador.*car/i.test(text)) {
    out.push("那按城市分布呢？");
    out.push("按车源状态拆一下呢？");
    out.push("近 7 天新增车源有多少？");
  } else if (/订单|成交|放款|金融/i.test(text)) {
    out.push("按门店对比一下呢？");
    out.push("环比上月怎么样？");
    out.push("按状态拆分看看？");
  } else if (/用户|cheniu|手机号/i.test(text)) {
    out.push("这个用户关联的客户线索有哪些？");
    out.push("最近登录或活跃情况如何？");
  } else {
    out.push("按门店再拆一下呢？");
    out.push("近一周趋势怎么样？");
    out.push("还有哪些相关指标可以看？");
  }

  return out.slice(0, MAX_FOLLOW_UPS);
}

/**
 * 追问建议是界面糖，默认不值得为它多付一次模型调用。
 * 需要更贴合上下文的推荐时置 AGENT_LLM_FOLLOW_UPS=1。
 */
export function isLlmFollowUpsEnabled() {
  const flag = process.env.AGENT_LLM_FOLLOW_UPS?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

/**
 * 基于当前会话与本轮回答，生成可直接发送的追问建议。
 * 默认走零成本规则；开启 AGENT_LLM_FOLLOW_UPS 后优先 LLM，失败仍回退规则。
 */
export async function suggestFollowUpQuestions(input: {
  message: string;
  answer: string;
  conversation?: ThreadTurn[];
}): Promise<{ followUps: string[]; mock: boolean }> {
  const conversation = input.conversation ?? [];
  const fallback = buildRuleFollowUps(input);

  if (!isLlmFollowUpsEnabled()) {
    return { followUps: fallback, mock: true };
  }

  if (!input.answer.trim() || !isLangGraphLlmEnabled()) {
    return { followUps: fallback, mock: true };
  }

  try {
    const model = createChatModel();
    const response = await withLlmRetry(() => model.invoke([
      new SystemMessage(
        [
          "你是大风车数据智能体的追问推荐器。",
          "根据用户问题、会话上下文与本轮回答，推荐 2～3 条用户可直接发送的追问。",
          "要求：短句、可执行、贴合当前实体/指标；不要重复原问题；不要解释。",
          '只输出 JSON：{"followUps":["...","..."]}',
        ].join("\n"),
      ),
      ...conversation.slice(-6).map((turn) =>
        turn.role === "user"
          ? new HumanMessage(turn.content)
          : new HumanMessage(`[assistant] ${turn.content.slice(0, 600)}`),
      ),
      new HumanMessage(
        [
          `本轮用户问题：${input.message}`,
          "本轮回答摘要：",
          input.answer.slice(0, 1200),
        ].join("\n"),
      ),
    ]), { maxAttempts: 2 });

    const text =
      typeof response.content === "string" ? response.content.trim() : "";
    const followUps = parseFollowUpsFromModelText(text);
    if (followUps.length) {
      return { followUps, mock: false };
    }
  } catch {
    // fall through
  }

  return { followUps: fallback, mock: true };
}
