/** 源长时间无产出时插入心跳，避免 SSE/UI 看起来卡死 */
export const STREAM_HEARTBEAT_MS = 1500;

export async function* withIdleHeartbeat<T>(
  source: AsyncIterable<T>,
  intervalMs: number,
  heartbeat: (waitedMs: number) => T,
): AsyncGenerator<T> {
  const startedAt = performance.now();
  const iterator = source[Symbol.asyncIterator]();
  let pending = iterator.next();

  try {
    while (true) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const raced = await Promise.race([
        pending.then((value) => ({ tag: "next" as const, value })),
        new Promise<{ tag: "timeout" }>((resolve) => {
          timeoutId = setTimeout(() => resolve({ tag: "timeout" }), intervalMs);
        }),
      ]);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (raced.tag === "timeout") {
        yield heartbeat(Math.round(performance.now() - startedAt));
        continue;
      }

      if (raced.value.done) {
        return;
      }

      yield raced.value.value;
      pending = iterator.next();
    }
  } finally {
    try {
      await iterator.return?.();
    } catch {
      // ignore iterator cleanup errors
    }
  }
}
