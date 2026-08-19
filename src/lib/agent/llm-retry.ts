/**
 * LLM / 上游 HTTP 的瞬时故障重试。
 * 只重试「重试一次就可能成功」的错误：限流、网关抖动、连接中断、超时。
 * 参数错误、鉴权失败、模型不存在这类确定性错误立即失败，避免把一次失败放大成 N 次计费。
 */

export const LLM_RETRY_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 400;
const MAX_DELAY_MS = 4000;

const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

const TRANSIENT_PATTERNS = [
  /\btimed?\s*out\b/i,
  /\btimeout\b/i,
  /econnreset/i,
  /econnrefused/i,
  /epipe/i,
  /enotfound/i,
  /eai_again/i,
  /socket hang up/i,
  /fetch failed/i,
  /network error/i,
  /overloaded/i,
  /rate.?limit/i,
  /too many requests/i,
  /temporarily unavailable/i,
  /service unavailable/i,
  /bad gateway/i,
];

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    response?: { status?: unknown };
  };
  for (const value of [
    candidate.status,
    candidate.statusCode,
    candidate.response?.status,
  ]) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 100) {
      return parsed;
    }
  }
  return undefined;
}

export function isTransientLlmError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return false;
  }

  const status = readStatus(error);
  if (status !== undefined) {
    return TRANSIENT_STATUS.has(status);
  }

  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && TRANSIENT_PATTERNS.some((re) => re.test(code))) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(message));
}

/** 指数退避 + 抖动：抖动用于避免多个并发会话在同一毫秒重试打爆上游 */
export function computeRetryDelayMs(attempt: number, random: () => number = Math.random) {
  const exponential = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
  return Math.round(exponential * (0.5 + random() * 0.5));
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Agent request aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new Error("Agent request aborted"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type LlmRetryOptions = {
  maxAttempts?: number;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
};

export async function withLlmRetry<T>(
  run: (attempt: number) => Promise<T>,
  options: LlmRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? LLM_RETRY_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientLlmError(error)) {
        throw error;
      }
      const delayMs = computeRetryDelayMs(attempt);
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs, options.signal);
    }
  }

  throw lastError;
}

/**
 * 流式调用的重试：只在「尚未吐出任何内容」时允许重试。
 * 已经把 delta 推给前端后再重试会导致内容重复，此时直接向上抛。
 */
export async function* streamWithLlmRetry<T>(
  createStream: (attempt: number) => Promise<AsyncIterable<T>>,
  options: LlmRetryOptions = {},
): AsyncGenerator<T> {
  const maxAttempts = options.maxAttempts ?? LLM_RETRY_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let emitted = false;
    try {
      const stream = await createStream(attempt);
      for await (const chunk of stream) {
        emitted = true;
        yield chunk;
      }
      return;
    } catch (error) {
      const retryable =
        !emitted && attempt < maxAttempts && isTransientLlmError(error);
      if (!retryable) {
        throw error;
      }
      const delayMs = computeRetryDelayMs(attempt);
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs, options.signal);
    }
  }
}
