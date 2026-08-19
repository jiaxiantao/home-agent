import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { describe, expect, it } from "vitest";

import {
  clampMessageText,
  estimateMessagesTokens,
  estimateTokens,
  groupMessages,
  trimMessagesToBudget,
} from "@/lib/agent/context-budget";

describe("estimateTokens", () => {
  it("中文按字计，不再用 length/4 低估", () => {
    // 24 个汉字：按 length/4 只有 6，实际接近 24
    const chinese = "查询大风车正式车源在杭州的分布情况并按城市分组统计";
    expect(estimateTokens(chinese)).toBeGreaterThan(chinese.length * 0.8);
  });

  it("英文按约 4 字符 1 token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("空串为 0", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("clampMessageText", () => {
  it("预算内的文本原样返回", () => {
    expect(clampMessageText("short", 100)).toBe("short");
  });

  it("超预算时保留头尾并标注省略量", () => {
    const long = "x".repeat(20_000);
    const clamped = clampMessageText(long, 100);
    expect(clamped.length).toBeLessThan(long.length);
    expect(clamped).toContain("超出单条上下文预算");
  });
});

describe("groupMessages", () => {
  it("把 AIMessage 与它的 ToolMessage 绑成一组", () => {
    const ai = new AIMessage({
      content: "",
      tool_calls: [{ id: "c1", name: "route_api", args: {}, type: "tool_call" }],
    });
    const groups = groupMessages([
      new HumanMessage("问题"),
      ai,
      new ToolMessage({ content: "结果", tool_call_id: "c1" }),
      new AIMessage("答案"),
    ]);

    expect(groups.map((group) => group.length)).toEqual([1, 2, 1]);
  });
});

describe("trimMessagesToBudget", () => {
  function toolRound(index: number, size: number) {
    return [
      new AIMessage({
        content: "",
        tool_calls: [
          { id: `c${index}`, name: "search_api", args: { i: index }, type: "tool_call" },
        ],
      }),
      new ToolMessage({ content: "结".repeat(size), tool_call_id: `c${index}` }),
    ];
  }

  it("预算充足时不改动消息", () => {
    const messages = [new HumanMessage("原始诉求"), new AIMessage("好的")];
    const result = trimMessagesToBudget(messages, { maxTokens: 10_000 });
    expect(result.droppedGroups).toBe(0);
    expect(result.messages).toHaveLength(2);
  });

  it("超预算时保留首条用户消息，解决遗忘原始诉求", () => {
    const messages = [
      new HumanMessage("原始诉求：统计杭州车源"),
      ...toolRound(1, 800),
      ...toolRound(2, 800),
      ...toolRound(3, 800),
      new HumanMessage("最新追问"),
    ];

    const result = trimMessagesToBudget(messages, { maxTokens: 1_500 });

    expect(result.droppedGroups).toBeGreaterThan(0);
    expect(result.tokensAfter).toBeLessThanOrEqual(1_500);
    expect((result.messages[0] as HumanMessage).content).toContain("原始诉求");
    expect(result.messages.at(-1)).toBe(messages.at(-1));
  });

  it("裁剪后不会留下没有结果的 tool_call", () => {
    const messages = [
      new HumanMessage("原始诉求"),
      ...toolRound(1, 900),
      ...toolRound(2, 900),
      ...toolRound(3, 900),
    ];

    const result = trimMessagesToBudget(messages, { maxTokens: 1_200 });

    const toolCallIds = new Set<string>();
    for (const message of result.messages) {
      if (message instanceof AIMessage) {
        for (const call of message.tool_calls ?? []) {
          toolCallIds.add(call.id!);
        }
      }
    }
    const resultIds = new Set(
      result.messages
        .filter((message): message is ToolMessage => message instanceof ToolMessage)
        .map((message) => message.tool_call_id),
    );

    for (const id of toolCallIds) {
      expect(resultIds.has(id)).toBe(true);
    }
    for (const id of resultIds) {
      expect(toolCallIds.has(id)).toBe(true);
    }
  });

  it("被裁剪时插入省略说明", () => {
    const messages = [
      new HumanMessage("原始诉求"),
      ...toolRound(1, 900),
      ...toolRound(2, 900),
      new HumanMessage("最新追问"),
    ];
    const result = trimMessagesToBudget(messages, { maxTokens: 1_000 });
    const texts = result.messages.map((message) => String(message.content));
    expect(texts.some((text) => text.includes("已省略中间"))).toBe(true);
  });

  it("系统消息始终保留", () => {
    const messages = [
      new SystemMessage("系统规则"),
      new HumanMessage("原始诉求"),
      ...toolRound(1, 2_000),
      ...toolRound(2, 2_000),
    ];
    const result = trimMessagesToBudget(messages, { maxTokens: 500 });
    expect(result.messages[0]).toBeInstanceOf(SystemMessage);
  });

  it("reservedTokens 从预算中扣除", () => {
    const messages = [new HumanMessage("诉求"), ...toolRound(1, 400)];
    const loose = trimMessagesToBudget(messages, { maxTokens: 2_000 });
    const tight = trimMessagesToBudget(messages, {
      maxTokens: 2_000,
      reservedTokens: 1_900,
    });
    expect(loose.droppedGroups).toBe(0);
    expect(tight.droppedGroups).toBeGreaterThan(0);
  });

  it("单条超大工具结果会被截断而不是整组丢弃", () => {
    const messages = [
      new HumanMessage("诉求"),
      ...toolRound(1, 50_000),
    ];
    const result = trimMessagesToBudget(messages, {
      maxTokens: 100_000,
      perMessageTokens: 500,
    });
    expect(result.droppedGroups).toBe(0);
    expect(estimateMessagesTokens(result.messages)).toBeLessThan(2_000);
  });
});
