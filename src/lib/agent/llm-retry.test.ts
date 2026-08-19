import { describe, expect, it } from "vitest";

import {
  computeRetryDelayMs,
  isTransientLlmError,
  streamWithLlmRetry,
  withLlmRetry,
} from "@/lib/agent/llm-retry";

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe("isTransientLlmError", () => {
  it("把限流与网关抖动判定为可重试", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isTransientLlmError(httpError(status))).toBe(true);
    }
    expect(isTransientLlmError(new Error("fetch failed"))).toBe(true);
    expect(isTransientLlmError(new Error("socket hang up"))).toBe(true);
    expect(isTransientLlmError(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe(
      true,
    );
  });

  it("确定性错误不重试，避免把一次失败放大成多次计费", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isTransientLlmError(httpError(status))).toBe(false);
    }
    expect(isTransientLlmError(new Error("model not found"))).toBe(false);
  });

  it("用户中止不重试", () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(isTransientLlmError(aborted)).toBe(false);
  });
});

describe("computeRetryDelayMs", () => {
  it("指数增长且带抖动，上限 4s", () => {
    expect(computeRetryDelayMs(1, () => 1)).toBe(400);
    expect(computeRetryDelayMs(2, () => 1)).toBe(800);
    expect(computeRetryDelayMs(9, () => 1)).toBe(4000);
    // 抖动下界为半个退避窗口
    expect(computeRetryDelayMs(2, () => 0)).toBe(400);
  });
});

describe("withLlmRetry", () => {
  it("瞬时错误后重试直至成功", async () => {
    let attempts = 0;
    const result = await withLlmRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw httpError(503);
      }
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("确定性错误只尝试一次", async () => {
    let attempts = 0;
    await expect(
      withLlmRetry(async () => {
        attempts += 1;
        throw httpError(401);
      }),
    ).rejects.toThrow("HTTP 401");
    expect(attempts).toBe(1);
  });

  it("超过上限后抛出最后一次错误", async () => {
    let attempts = 0;
    await expect(
      withLlmRetry(
        async () => {
          attempts += 1;
          throw httpError(429);
        },
        { maxAttempts: 2 },
      ),
    ).rejects.toThrow("HTTP 429");
    expect(attempts).toBe(2);
  });
});

describe("streamWithLlmRetry", () => {
  it("首个 chunk 之前失败可以重试", async () => {
    let attempts = 0;
    async function* good() {
      yield "a";
      yield "b";
    }
    const chunks: string[] = [];
    for await (const chunk of streamWithLlmRetry(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw httpError(502);
      }
      return good();
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["a", "b"]);
    expect(attempts).toBe(2);
  });

  it("已经吐出内容后失败不重试，避免前端出现重复文本", async () => {
    let attempts = 0;
    async function* partial() {
      yield "a";
      throw httpError(503);
    }
    const chunks: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of streamWithLlmRetry(async () => {
          attempts += 1;
          return partial();
        })) {
          chunks.push(chunk);
        }
      })(),
    ).rejects.toThrow("HTTP 503");
    expect(chunks).toEqual(["a"]);
    expect(attempts).toBe(1);
  });
});
