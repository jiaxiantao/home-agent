import { describe, expect, it } from "vitest";

import { withIdleHeartbeat } from "@/lib/agent/stream-heartbeat";

async function* delayedValues<T>(items: T[], delayMs: number): AsyncGenerator<T> {
  for (const item of items) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    yield item;
  }
}

describe("withIdleHeartbeat", () => {
  it("does not heartbeat when values arrive quickly", async () => {
    const received: string[] = [];
    for await (const item of withIdleHeartbeat(
      delayedValues(["a", "b"], 5),
      50,
      () => "beat",
    )) {
      received.push(item);
    }
    expect(received).toEqual(["a", "b"]);
  });

  it("emits heartbeats while waiting on a slow source", async () => {
    const received: string[] = [];
    for await (const item of withIdleHeartbeat(
      delayedValues(["done"], 80),
      25,
      (waitedMs) => `beat:${waitedMs > 0 ? "yes" : "no"}`,
    )) {
      received.push(item);
    }

    expect(received.at(-1)).toBe("done");
    expect(received.some((item) => item.startsWith("beat:"))).toBe(true);
  });
});
