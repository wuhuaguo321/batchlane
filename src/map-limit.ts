import {
  assertArray, assertFunction, assertPositiveInteger, createScope, runAbortable,
  type SignalOptions,
} from "./internal.js";

export type Mapper<T, R> = (item: T, index: number, signal: AbortSignal) => R | PromiseLike<R>;

/** Process a snapshot with bounded concurrency and preserve input order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: Mapper<T, R>,
  { signal }: SignalOptions = {},
): Promise<R[]> {
  assertArray(items);
  assertPositiveInteger(concurrency, "concurrency");
  assertFunction(mapper, "mapper");
  const input = Array.from(items);
  const results = new Array<R>(input.length);
  const scope = createScope(signal);
  let cursor = 0;
  let firstFailure: { error: unknown } | undefined;

  const worker = async () => {
    while (cursor < input.length) {
      scope.signal.throwIfAborted();
      const index = cursor++;
      try {
        results[index] = await runAbortable((taskSignal) => mapper(input[index]!, index, taskSignal), scope.signal);
      } catch (error) {
        if (!firstFailure) {
          firstFailure = { error };
          scope.abort(error);
        }
        throw error;
      }
    }
  };

  try {
    scope.signal.throwIfAborted();
    await Promise.all(Array.from({ length: Math.min(concurrency, input.length) }, worker));
    return results;
  } catch (error) {
    throw firstFailure ? firstFailure.error : error;
  } finally {
    scope.dispose();
  }
}
