import { describe, expect, it } from "vitest";

import { dispatchSsePayloads } from "@/lib/sse-dispatch";

describe("dispatchSsePayloads", () => {
  it("applies a single payload immediately", async () => {
    const received: number[] = [];
    await dispatchSsePayloads([1], (value) => received.push(value), async () => {
      throw new Error("should not yield for a single payload");
    });
    expect(received).toEqual([1]);
  });

  it("yields between multiple payloads so UI can paint", async () => {
    const received: number[] = [];
    let yields = 0;
    await dispatchSsePayloads([1, 2, 3], (value) => received.push(value), async () => {
      yields += 1;
    });
    expect(received).toEqual([1, 2, 3]);
    expect(yields).toBe(2);
  });
});
