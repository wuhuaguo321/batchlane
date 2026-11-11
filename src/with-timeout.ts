import { assertDuration, assertFunction, createScope, runAbortable, type SignalOptions } from "./internal.js";

export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Task timed out after ${timeoutMs} ms`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** Bound waiting time and signal cooperative cancellation to the task. */
export async function withTimeout<T>(
  task: (signal: AbortSignal) => T | PromiseLike<T>,
  ms: number,
  { signal }: SignalOptions = {},
): Promise<T> {
  assertFunction(task, "task");
  assertDuration(ms, "ms");
  const scope = createScope(signal);
  const timer = setTimeout(() => scope.abort(new TimeoutError(ms)), ms);
  try {
    return await runAbortable(task, scope.signal);
  } finally {
    clearTimeout(timer);
    scope.dispose();
  }
}
