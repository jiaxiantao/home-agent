import { describe, expect, it } from "vitest";

import {
  buildAgentSystemPrompt,
  buildAnswerSynthesisSystemPrompt,
  buildQuestionContextPrompt,
  buildStaticAgentSystemPrompt,
} from "@/lib/agent/langgraph/prompts";

const QUESTIONS = [
  "查一下杭州最近30天的成交车辆数量",
  "车牌号为浙A12345的车辆信息",
  "客户手机号13800138000的跟进记录",
  "会员一共有多少人",
];

describe("agent prompts", () => {
  it("静态段与问题无关，保证跨请求前缀缓存可命中", () => {
    const baseline = buildStaticAgentSystemPrompt();
    for (const question of QUESTIONS) {
      expect(buildStaticAgentSystemPrompt()).toBe(baseline);
    }
    // 静态段不得泄漏任何问题相关内容
    for (const question of QUESTIONS) {
      expect(baseline).not.toContain(question);
    }
  });

  it("完整系统提示以静态段开头，可变内容全部排在其后", () => {
    const staticPrefix = buildStaticAgentSystemPrompt();
    for (const question of QUESTIONS) {
      expect(buildAgentSystemPrompt(question).startsWith(staticPrefix)).toBe(true);
    }
  });

  it("不同问题之间的公共前缀不小于静态段长度", () => {
    const staticLength = buildStaticAgentSystemPrompt().length;
    const [first, ...rest] = QUESTIONS.map((question) =>
      buildAgentSystemPrompt(question),
    );

    for (const other of rest) {
      let shared = 0;
      while (shared < first!.length && first![shared] === other[shared]) {
        shared += 1;
      }
      expect(shared).toBeGreaterThanOrEqual(staticLength);
    }
  });

  it("问题上下文段随问题变化", () => {
    const unique = new Set(QUESTIONS.map((q) => buildQuestionContextPrompt(q)));
    expect(unique.size).toBe(QUESTIONS.length);
  });

  it("回答合成提示远小于规划提示，且不含接口目录", () => {
    const synthesis = buildAnswerSynthesisSystemPrompt();
    expect(synthesis.length).toBeLessThan(600);
    expect(synthesis).not.toContain("接口目录");
    expect(synthesis).not.toContain("route_api");
  });

  it("静态段声明了不可信数据边界", () => {
    expect(buildStaticAgentSystemPrompt()).toContain("不可信数据边界");
  });
});
