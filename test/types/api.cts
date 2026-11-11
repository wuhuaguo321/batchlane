import batchlane = require("batchlane");

const chunks: number[][] = batchlane.chunk([1, 2], 1);
const result: Promise<number[]> = batchlane.mapLimit([1, 2], 2, (value) => value * 2);
const timed: Promise<string> = batchlane.withTimeout(() => "ok", 10);
const retried: Promise<number> = batchlane.retry(({ attempt }) => attempt);
// @ts-expect-error CommonJS must retain generic result checking.
const wrong: Promise<boolean[]> = batchlane.mapLimit([1], 1, () => 123);
void [chunks, result, timed, retried, wrong];
