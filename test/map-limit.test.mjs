import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { mapLimit } from "../dist/esm/index.js";
import { deferred, flush, invalidCounts } from "./helpers.mjs";

test("mapLimit bounds active tasks and preserves order despite out-of-order completion", async () => {
  const gates = Array.from({ length: 5 }, deferred);
  const started = [];
  let active = 0;
  let peak = 0;
  const pending = mapLimit([0, 1, 2, 3, 4], 2, async (item, index) => {
    assert.equal(item, index);
    started.push(item);
    peak = Math.max(peak, ++active);
    await gates[item].promise;
    active--;
    return item * 10;
  });
  assert.deepEqual(started, [0, 1]);
  gates[1].resolve();
  await flush();
  assert.deepEqual(started, [0, 1, 2]);
  gates[2].resolve();
  await flush();
  gates[3].resolve();
  await flush();
  gates[4].resolve();
  gates[0].resolve();
  assert.deepEqual(await pending, [0, 10, 20, 30, 40]);
  assert.equal(peak, 2);
  assert.equal(active, 0);
});
test("mapLimit supports synchronous mappers and sequential execution", async () => {
  const seen = [];
  assert.deepEqual(await mapLimit([1, 2, 3], 1, (item) => { seen.push(item); return item + 1; }), [2, 3, 4]);
  assert.deepEqual(seen, [1, 2, 3]);
});
test("mapLimit handles empty input and concurrency above length", async () => {
  assert.deepEqual(await mapLimit([], 2, () => { throw new Error("must not run"); }), []);
  assert.deepEqual(await mapLimit([2], 100, (item) => item * 2), [4]);
});
test("mapLimit snapshots input before calling the mapper", async () => {
  const input = [1, 2, 3];
  assert.deepEqual(await mapLimit(input, 1, (item) => { input[1] = 99; input.push(4); return item; }), [1, 2, 3]);
});
test("mapLimit treats sparse array slots as undefined", async () => {
  assert.deepEqual(await mapLimit(new Array(2), 2, (value) => value), [undefined, undefined]);
});
test("mapLimit stops queued work and aborts peers on the first failure", async () => {
  const gate = deferred();
  const late = deferred();
  const started = [];
  const signals = [];
  const reason = new Error("task failed");
  const pending = mapLimit([0, 1, 2, 3], 2, (item, _index, signal) => {
    started.push(item);
    signals.push(signal);
    return item === 0 ? gate.promise : late.promise;
  });
  const rejected = assert.rejects(pending, (error) => error === reason);
  gate.reject(reason);
  await rejected;
  assert.deepEqual(started, [0, 1]);
  assert.ok(signals.every((signal) => signal.aborted && signal.reason === reason));
  late.reject(new Error("late rejection must be observed"));
  await flush();
});
test("mapLimit preserves a synchronous throw", async () => {
  const reason = new Error("sync failure");
  await assert.rejects(mapLimit([1], 1, () => { throw reason; }), (error) => error === reason);
});
test("mapLimit preserves undefined as the original failure reason", async () => {
  let rejected = false;
  await mapLimit([1, 2], 2, () => Promise.reject(undefined)).then(
    () => assert.fail("must reject"),
    (error) => { rejected = true; assert.equal(error, undefined); },
  );
  assert.equal(rejected, true);
});
test("mapLimit cancels even if a running task ignores its signal", async () => {
  const controller = new AbortController();
  const reason = new Error("caller canceled");
  const pending = mapLimit([1, 2], 1, () => new Promise(() => {}), { signal: controller.signal });
  const rejected = assert.rejects(pending, (error) => error === reason);
  controller.abort(reason);
  await rejected;
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
test("mapLimit checks pre-aborted signals even for empty input", async () => {
  const signal = AbortSignal.abort();
  await assert.rejects(mapLimit([], 1, () => 1, { signal }), { name: "AbortError" });
  await assert.rejects(mapLimit([1], 1, () => assert.fail("must not run"), { signal }), { name: "AbortError" });
});
test("mapLimit removes the parent listener on success and failure", async () => {
  const controller = new AbortController();
  await mapLimit([1, 2], 2, (item) => item, { signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  await assert.rejects(mapLimit([1], 1, () => { throw new Error("fail"); }, { signal: controller.signal }));
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal(controller.signal.aborted, false);
});
test("mapLimit validates array and mapper", async () => {
  await assert.rejects(mapLimit("abc", 1, (item) => item), TypeError);
  await assert.rejects(mapLimit([], 1, null), TypeError);
});
for (const concurrency of invalidCounts) {
  test(`mapLimit rejects invalid concurrency ${String(concurrency)}`, async () => {
    await assert.rejects(mapLimit([], concurrency, () => 1), RangeError);
  });
}
