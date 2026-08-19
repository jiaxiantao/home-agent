import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";

/**
 * 按 token 预算裁剪消息历史。
 *
 * 之前只有按字符截断（1200 / 2400 字符），对中文严重低估，且历史消息在单轮内无上限增长。
 * 这里做三件事：
 *   1. 中日韩感知的 token 估算，不再用 length/4 这种对中文失真的算法
 *   2. 始终保留首条用户消息——「遗忘早期关键信息」的根因就是 slice(-10) 把原始诉求切掉了
 *   3. 裁剪时保持 AIMessage(tool_calls) 与对应 ToolMessage 成组，
 *      落单的 tool_call 会让 OpenAI 兼容接口直接报 400
 */

const DEFAULT_TOTAL_BUDGET = 24_000;
/** 单条工具结果的上限，防止一次大结果集吃掉整个预算 */
const DEFAULT_PER_MESSAGE_BUDGET = 3_000;

const CJK_PATTERN =
  /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;

/**
 * 估算 token 数。各家分词器不同，这里取偏保守的估计：
 * 中日韩字符按 1 token 计，其余按 4 字符 1 token 计。
 */
export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  const cjkCount = text.match(CJK_PATTERN)?.length ?? 0;
  const restCount = text.length - cjkCount;
  return cjkCount + Math.ceil(restCount / 4);
}

function messageText(message: BaseMessage): string {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

export function estimateMessageTokens(message: BaseMessage): number {
  let total = estimateTokens(messageText(message));
  if (message instanceof AIMessage && message.tool_calls?.length) {
    for (const call of message.tool_calls) {
      total += estimateTokens(call.name) + estimateTokens(JSON.stringify(call.args ?? {}));
    }
  }
  // 每条消息的角色标记与分隔符开销
  return total + 4;
}

export function estimateMessagesTokens(messages: BaseMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

export function getContextTokenBudget(): number {
  const raw = Number.parseInt(process.env.AGENT_CONTEXT_TOKEN_BUDGET ?? "", 10);
  return Number.isFinite(raw) && raw > 2_000 ? raw : DEFAULT_TOTAL_BUDGET;
}

/** 单条消息过长时从中间截断：结果集的头尾通常都比中间有信息量 */
export function clampMessageText(text: string, maxTokens = DEFAULT_PER_MESSAGE_BUDGET) {
  if (estimateTokens(text) <= maxTokens) {
    return text;
  }
  // 估算保留的字符数：按当前文本的平均 token 密度反推
  const density = text.length / Math.max(1, estimateTokens(text));
  const keepChars = Math.max(200, Math.floor(maxTokens * density));
  const head = Math.floor(keepChars * 0.7);
  const tail = keepChars - head;
  return `${text.slice(0, head)}\n…（已省略 ${text.length - keepChars} 字，超出单条上下文预算）…\n${text.slice(-tail)}`;
}

/**
 * 把消息切成不可拆分的组：一条 AIMessage 与它触发的所有 ToolMessage 必须同进同出。
 */
export function groupMessages(messages: BaseMessage[]): BaseMessage[][] {
  const groups: BaseMessage[][] = [];
  for (const message of messages) {
    const previous = groups.at(-1);
    if (
      message instanceof ToolMessage &&
      previous &&
      previous[0] instanceof AIMessage &&
      previous[0].tool_calls?.length
    ) {
      previous.push(message);
      continue;
    }
    groups.push([message]);
  }
  return groups;
}

export type TrimResult = {
  messages: BaseMessage[];
  droppedGroups: number;
  tokensBefore: number;
  tokensAfter: number;
};

export type TrimOptions = {
  maxTokens?: number;
  /** 已被系统提示等占用的 token，会从预算里先扣掉 */
  reservedTokens?: number;
  perMessageTokens?: number;
};

/**
 * 保留：系统消息 → 首条用户消息（原始诉求）→ 省略提示 → 预算内最新的若干组。
 */
export function trimMessagesToBudget(
  messages: BaseMessage[],
  options: TrimOptions = {},
): TrimResult {
  const perMessageTokens = options.perMessageTokens ?? DEFAULT_PER_MESSAGE_BUDGET;
  const clamped = messages.map((message) => {
    const text = messageText(message);
    const next = clampMessageText(text, perMessageTokens);
    if (next === text) {
      return message;
    }
    if (message instanceof ToolMessage) {
      return new ToolMessage({
        content: next,
        name: message.name,
        status: message.status,
        tool_call_id: message.tool_call_id,
      });
    }
    if (message instanceof HumanMessage) {
      return new HumanMessage(next);
    }
    return message;
  });

  const tokensBefore = estimateMessagesTokens(clamped);
  const budget =
    (options.maxTokens ?? getContextTokenBudget()) - (options.reservedTokens ?? 0);

  if (tokensBefore <= budget) {
    return {
      messages: clamped,
      droppedGroups: 0,
      tokensBefore,
      tokensAfter: tokensBefore,
    };
  }

  const groups = groupMessages(clamped);
  const systemGroups = groups.filter((group) => group[0] instanceof SystemMessage);
  const rest = groups.filter((group) => !(group[0] instanceof SystemMessage));

  const firstHumanIndex = rest.findIndex((group) => group[0] instanceof HumanMessage);
  const anchorGroups = firstHumanIndex >= 0 ? [rest[firstHumanIndex]!] : [];
  const candidates = rest.filter((_, index) => index !== firstHumanIndex);

  const pinned = [...systemGroups, ...anchorGroups];
  let used = pinned.reduce((sum, group) => sum + estimateMessagesTokens(group), 0);

  const kept: BaseMessage[][] = [];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const group = candidates[index]!;
    const cost = estimateMessagesTokens(group);
    if (used + cost > budget) {
      break;
    }
    used += cost;
    kept.unshift(group);
  }

  const droppedGroups = candidates.length - kept.length;
  const notice =
    droppedGroups > 0
      ? [
          new HumanMessage(
            `（已省略中间 ${droppedGroups} 轮历史以控制上下文长度。上方首条消息是用户的原始诉求，请始终以它为准。）`,
          ),
        ]
      : [];

  const result = [
    ...systemGroups.flat(),
    ...anchorGroups.flat(),
    ...notice,
    ...kept.flat(),
  ];

  return {
    messages: result,
    droppedGroups,
    tokensBefore,
    tokensAfter: estimateMessagesTokens(result),
  };
}
