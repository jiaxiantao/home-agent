/** 同一 TCP 块里若有多条 SSE，分帧交给 UI，避免 React 一次批成「突然弹出」 */
export async function dispatchSsePayloads<T>(
  payloads: T[],
  onPayload: (payload: T) => void,
  yieldFrame: () => Promise<void> = defaultYieldFrame,
) {
  for (let index = 0; index < payloads.length; index += 1) {
    onPayload(payloads[index]!);
    if (payloads.length > 1 && index < payloads.length - 1) {
      await yieldFrame();
    }
  }
}

function defaultYieldFrame() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}
