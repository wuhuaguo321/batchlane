export interface SignalOptions {
  /** Cancel waiting and propagate the reason to cooperative tasks. */
  signal?: AbortSignal;
}

export function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

export function assertDuration(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 2_147_483_647) {
    throw new RangeError(`${name} must be an integer from 0 to 2147483647`);
  }
}

export function assertFunction(value: unknown, name: string): void {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
}

export function assertArray(value: unknown): void {
  if (!Array.isArray(value)) throw new TypeError("items must be an array");
}

/** One child signal, with an explicit cleanup for the parent listener. */
export function createScope(parent?: AbortSignal) {
  const controller = new AbortController();
  const forward = () => controller.abort(parent!.reason);
  if (parent?.aborted) forward();
  else parent?.addEventListener("abort", forward, { once: true });

  return {
    signal: controller.signal,
    abort: (reason: unknown) => controller.abort(reason),
    dispose: () => parent?.removeEventListener("abort", forward),
  };
}

/** Observe late rejections even when cancellation has already won the race. */
export function runAbortable<T>(
  task: (signal: AbortSignal) => T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      Promise.resolve(task(signal)).then(
        (value) => { cleanup(); resolve(value); },
        (error: unknown) => { cleanup(); reject(error); },
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
