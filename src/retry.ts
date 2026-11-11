import { delay } from "./delay.js";
import {
  assertDuration, assertFunction, assertPositiveInteger, createScope, runAbortable,
  type SignalOptions,
} from "./internal.js";

export interface RetryContext {
  /** One-based attempt number. */
  attempt: number;
  signal: AbortSignal;
}

export interface RetryOptions extends SignalOptions {
  /** Total calls, including the first. Default: 3. */
  attempts?: number;
  /** Initial wait between failed calls in milliseconds. Default: 100. */
  delayMs?: number;
  /** Multiplier for each subsequent wait, at least 1. Default: 2. */
  factor?: number;
  /** Upper bound on each wait in milliseconds. Default: 30000. */
  maxDelayMs?: number;
  /** Return false to stop. Called only when another attempt is available. */
  shouldRetry?: (error: unknown, attempt: number) => boolean | PromiseLike<boolean>;
}

/** Retry a task sequentially, with capped exponential backoff. */
export async function retry<T>(
  task: (context: RetryContext) => T | PromiseLike<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { attempts = 3, delayMs = 100, factor = 2, maxDelayMs = 30_000, shouldRetry, signal } = options;
  assertFunction(task, "task");
  assertPositiveInteger(attempts, "attempts");
  assertDuration(delayMs, "delayMs");
  assertDuration(maxDelayMs, "maxDelayMs");
  if (!Number.isFinite(factor) || factor < 1) throw new RangeError("factor must be finite and at least 1");
  if (shouldRetry !== undefined) assertFunction(shouldRetry, "shouldRetry");
  const scope = createScope(signal);
  let waitMs = Math.min(delayMs, maxDelayMs);

  try {
    for (let attempt = 1; ; attempt++) {
      scope.signal.throwIfAborted();
      try {
        return await runAbortable((taskSignal) => task({ attempt, signal: taskSignal }), scope.signal);
      } catch (error) {
        scope.signal.throwIfAborted();
        if (attempt === attempts) throw error;
        if (shouldRetry && !await runAbortable(() => shouldRetry(error, attempt), scope.signal)) throw error;
        await delay(Math.floor(waitMs), { signal: scope.signal });
        waitMs = Math.min(maxDelayMs, waitMs * factor);
      }
    }
  } finally {
    scope.dispose();
  }
}
