import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { chunk, delay, mapLimit, retry, withTimeout, TimeoutError } from "../dist/esm/index.js";

test("batching, concurrency, retries and per-task timeouts compose", async () => {
  const items = Array.from({ length: 20 }, (_, index) => index);
  const attempts = new Map();
  let active = 0;
  let peak = 0;
  const results = [];
  for (const batch of chunk(items, 7)) {
    results.push(...await mapLimit(batch, 3, (item, _index, signal) => retry(
      ({ signal: retrySignal }) => withTimeout(async (taskSignal) => {
        peak = Math.max(peak, ++active);
        try {
          await delay(0, { signal: taskSignal });
          const attempt = (attempts.get(item) ?? 0) + 1;
          attempts.set(item, attempt);
          if (item % 3 === 0 && attempt === 1) throw new Error("temporary");
          return item * 2;
        } finally {
          active--;
        }
      }, 1000, { signal: retrySignal }),
      { attempts: 2, delayMs: 0, signal },
    )));
  }
  assert.deepEqual(results, items.map((item) => item * 2));
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.equal(attempts.get(0), 2);
  assert.equal(attempts.get(1), 1);
});
test("an overall timeout cancels nested retries and never starts queued items", async () => {
  let calls = 0;
  let active = 0;
  await assert.rejects(withTimeout((signal) => mapLimit([1, 2, 3, 4], 2, (_item, _index, taskSignal) => retry(
    async ({ signal: retrySignal }) => {
      calls++;
      active++;
      try { await delay(60_000, { signal: retrySignal }); }
      finally { active--; }
    },
    { attempts: 5, signal: taskSignal },
  ), { signal }), 10), TimeoutError);
  await new Promise(setImmediate);
  assert.equal(calls, 2);
  assert.equal(active, 0);
});
test("many operations on the same parent leave no listeners behind", async () => {
  const controller = new AbortController();
  for (let index = 0; index < 50; index++) {
    await withTimeout((signal) => mapLimit([1, 2, 3], 3, () => retry(() => 1, { signal }), { signal }), 1000, { signal: controller.signal });
  }
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
test("a large worker pool processes every item once", async () => {
  const items = Array.from({ length: 1000 }, (_, index) => index);
  const seen = new Set();
  const output = await mapLimit(items, 32, async (item) => {
    assert.equal(seen.has(item), false);
    seen.add(item);
    await Promise.resolve();
    return item;
  });
  assert.deepEqual(output, items);
  assert.equal(seen.size, items.length);
});
