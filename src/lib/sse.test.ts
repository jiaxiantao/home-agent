import { describe, expect, it } from "vitest";

import { encodeSseEvent, parseSseBlock } from "@/lib/sse";

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
});
