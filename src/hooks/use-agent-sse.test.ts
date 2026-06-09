import { describe, expect, it } from "vitest";

import { parseSseBlock } from "@/hooks/use-agent-sse";

describe("parseSseBlock", () => {
  it("parses trace event", () => {
    const parsed = parseSseBlock(
      'event: trace\ndata: {"type":"trace","phase":"start","message":"ok"}',
    );

    expect(parsed?.event).toBe("trace");
    expect(parsed?.payload.type).toBe("trace");
  });

  it("returns null for empty data", () => {
    expect(parseSseBlock("event: trace\ndata: ")).toBeNull();
  });
});
