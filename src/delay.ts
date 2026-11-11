import { assertDuration, type SignalOptions } from "./internal.js";

/** Wait for milliseconds, or reject immediately when the signal aborts. */
export async function delay(ms: number, { signal }: SignalOptions = {}): Promise<void> {
  assertDuration(ms, "ms");
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => { cleanup(); reject(signal!.reason); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
