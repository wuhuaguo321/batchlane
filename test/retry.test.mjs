import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { retry } from "../dist/esm/index.js";
import { deferred, flush, invalidCounts } from "./helpers.mjs";

test("retry returns first success without repeating", async () => {
  let calls = 0;
  assert.equal(await retry(({ attempt, signal }) => {
    calls++;
    assert.equal(attempt, 1);
    assert.equal(signal.aborted, false);
    return 42;
  }), 42);
  assert.equal(calls, 1);
});
test("retry retries synchronous and asynchronous failures sequentially", async () => {
  const seen = [];
  const result = await retry(({ attempt }) => {
    seen.push(attempt);
    if (attempt === 1) throw new Error("sync");
    if (attempt === 2) return Promise.reject(new Error("async"));
    return "ok";
  }, { delayMs: 0 });
  assert.equal(result, "ok");
  assert.deepEqual(seen, [1, 2, 3]);
});
test("retry uses capped exponential backoff", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const attempts = [];
  const pending = retry(({ attempt }) => {
    attempts.push(attempt);
    if (attempt < 4) throw new Error("transient");
    return "done";
  }, { attempts: 4, delayMs: 10, factor: 2, maxDelayMs: 15 });
  await flush();
  t.mock.timers.tick(9);
  await flush();
  assert.deepEqual(attempts, [1]);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(attempts, [1, 2]);
  t.mock.timers.tick(14);
  await flush();
  assert.deepEqual(attempts, [1, 2]);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(attempts, [1, 2, 3]);
  t.mock.timers.tick(15);
  assert.equal(await pending, "done");
});
test("retry floors fractional backoff and caps the first wait", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const pending = retry(() => { if (++calls < 3) throw new Error("again"); return calls; }, {
    delayMs: 100, factor: 1.5, maxDelayMs: 3,
  });
  await flush();
  t.mock.timers.tick(3);
  await flush();
  assert.equal(calls, 2);
  t.mock.timers.tick(3);
  assert.equal(await pending, 3);
});
test("retry throws the last original error after exactly the total attempts", async () => {
  const errors = [new Error("first"), new Error("last")];
  let calls = 0;
  await assert.rejects(retry(() => { throw errors[calls++]; }, { attempts: 2, delayMs: 0 }), (error) => error === errors[1]);
  assert.equal(calls, 2);
});
test("retry's predicate can stop retries and receives the failed attempt", async () => {
  const reason = new Error("permanent");
  let calls = 0;
  await assert.rejects(retry(() => { calls++; throw reason; }, {
    shouldRetry: async (error, attempt) => { assert.equal(error, reason); assert.equal(attempt, 1); return false; },
  }), (error) => error === reason);
  assert.equal(calls, 1);
});
test("retry does not call the predicate after the last attempt", async () => {
  await assert.rejects(retry(() => { throw new Error("last"); }, {
    attempts: 1,
    shouldRetry: () => assert.fail("no attempts left"),
  }), /last/);
});
test("retry propagates a predicate error", async () => {
  const reason = new Error("predicate broke");
  await assert.rejects(retry(() => { throw new Error("task broke"); }, {
    shouldRetry: () => { throw reason; },
  }), (error) => error === reason);
});
test("retry cancels during backoff without another attempt", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = retry(() => { calls++; throw new Error("again"); }, { delayMs: 60_000, signal: controller.signal });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await flush();
  controller.abort();
  await rejected;
  assert.equal(calls, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
test("retry cancels a stuck task and observes its late failure", async () => {
  const gate = deferred();
  const controller = new AbortController();
  let calls = 0;
  const pending = retry(() => { calls++; return gate.promise; }, { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  controller.abort();
  await rejected;
  gate.reject(new Error("late failure"));
  await flush();
  assert.equal(calls, 1);
});
test("retry can cancel while an async predicate is stuck", async () => {
  const controller = new AbortController();
  const pending = retry(() => { throw new Error("fail"); }, {
    signal: controller.signal,
    shouldRetry: () => new Promise(() => {}),
  });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await flush();
  controller.abort();
  await rejected;
});
test("retry respects pre-abort and releases parent listeners on completion", async () => {
  await assert.rejects(retry(() => assert.fail("must not run"), { signal: AbortSignal.abort() }), { name: "AbortError" });
  const controller = new AbortController();
  await retry(() => 1, { signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  await assert.rejects(retry(() => { throw new Error("fail"); }, { attempts: 1, signal: controller.signal }));
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
test("retry validates task, predicate, factor and timer options before running", async () => {
  await assert.rejects(retry(null), TypeError);
  for (const options of [{ shouldRetry: true }, { factor: 0.5 }, { factor: Infinity }, { delayMs: -1 }, { maxDelayMs: NaN }]) {
    await assert.rejects(retry(() => assert.fail("must not run"), options));
  }
});
for (const attempts of invalidCounts) {
  test(`retry rejects invalid attempts ${String(attempts)}`, async () => assert.rejects(retry(() => 1, { attempts }), RangeError));
}
