import { chunk, delay, mapLimit, retry, withTimeout, TimeoutError, type RetryOptions } from "batchlane";

const chunks: number[][] = chunk([1, 2] as const, 1);
const pending: Promise<string[]> = mapLimit([1, 2], 2, async (item, index, signal) => {
  const context: [number, number, AbortSignal] = [item, index, signal];
  return String(context[0]);
});
const options: RetryOptions = { attempts: 2, shouldRetry: async (_error, attempt) => attempt < 2 };
const retried: Promise<number> = retry(({ attempt, signal }) => {
  const abort: AbortSignal = signal;
  return abort.aborted ? 0 : attempt;
}, options);
const timed: Promise<number> = withTimeout(async (signal) => { await delay(0, { signal }); return 1; }, 10);
const timeout: number = new TimeoutError(1).timeoutMs;
// @ts-expect-error A mapper's input is inferred from the array.
mapLimit([1, 2], 2, (item: string) => item);
// @ts-expect-error The inferred task result cannot become a string.
const wrong: Promise<string> = retry(() => 42);
// @ts-expect-error A duration must be numeric.
delay("100");
// @ts-expect-error Chunking does not change the element type.
const wrongChunk: string[][] = chunk([1, 2], 1);
void [chunks, pending, retried, timed, timeout, wrong, wrongChunk];
