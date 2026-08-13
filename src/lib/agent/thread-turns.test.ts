import { describe, expect, it } from "vitest";

import { threadMessagesToTurns } from "@/lib/agent/thread-turns";

describe("threadMessagesToTurns", () => {
  it("pairs user/assistant messages into conversation turns", () => {
    const turns = threadMessagesToTurns([
      { role: "user", content: "本月放款？", ts: 1 },
      { role: "assistant", content: "合计 120 万", ts: 2 },
      { role: "user", content: "按城市呢？", ts: 3 },
      { role: "assistant", content: "杭州最多", ts: 4 },
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      question: "本月放款？",
      finalAnswer: "合计 120 万",
      status: "done",
    });
    expect(turns[1]).toMatchObject({
      question: "按城市呢？",
      finalAnswer: "杭州最多",
    });
  });
});
