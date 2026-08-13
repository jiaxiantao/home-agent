import { describe, expect, it } from "vitest";

import { encodeSseEvent, parseSseBlock, SSE_PAD_COMMENT, takeSseBlocks } from "@/lib/sse";

describe("sse", () => {
  it("round-trips trace events", () => {
    const payload = { type: "trace", phase: "start", message: "ok" } as const;
    const block = encodeSseEvent("trace", payload).trim();
    const parsed = parseSseBlock(block);

    expect(parsed?.event).toBe("trace");
    expect(parsed?.payload).toEqual(payload);
  });

  it("returns null for empty data blocks", () => {
    expect(parseSseBlock("event: trace\ndata: ")).toBeNull();
  });

  it("splits padded SSE chunks without dropping events", () => {
    const first = encodeSseEvent("trace", { type: "trace", phase: "start", message: "a" });
    const second = encodeSseEvent("plan_stream", {
      type: "plan_stream",
      step: 1,
      text: "规划中",
      delta: "规划中",
    });
    const { blocks, rest } = takeSseBlocks(`${first}${SSE_PAD_COMMENT}${second}${SSE_PAD_COMMENT}`);

    expect(rest).toBe("");
    expect(blocks).toHaveLength(2);
    expect(parseSseBlock(blocks[0]!)?.payload).toMatchObject({ phase: "start" });
    expect(parseSseBlock(blocks[1]!)?.payload).toMatchObject({ type: "plan_stream" });
  });
});
