import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { delay, withTimeout, TimeoutError } from "../dist/esm/index.js";
import { deferred, invalidDurations } from "./helpers.mjs";

test("withTimeout returns values and clears its long timer", async () => {
  assert.equal(await withTimeout(() => 42, 60_000), 42);
  assert.equal(await withTimeout(async () => "ok", 60_000), "ok");
});
test("withTimeout preserves synchronous throws and async rejections", async () => {
  const reason = new Error("original");
  await assert.rejects(withTimeout(() => { throw reason; }, 60_000), (error) => error === reason);
  await assert.rejects(withTimeout(() => Promise.reject(reason), 60_000), (error) => error === reason);
});
test("withTimeout aborts cooperative work with the same TimeoutError", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let childSignal;
  const pending = withTimeout((signal) => { childSignal = signal; return delay(1000, { signal }); }, 25);
  const rejected = assert.rejects(pending, (error) => {
    assert.ok(error instanceof TimeoutError);
    assert.equal(error.name, "TimeoutError");
    assert.equal(error.timeoutMs, 25);
    assert.match(error.message, /25 ms/);
    assert.equal(childSignal.reason, error);
    return true;
  });
  t.mock.timers.tick(25);
  await rejected;
  assert.equal(childSignal.aborted, true);
});
test("withTimeout returns on time even for a task that ignores cancellation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const gate = deferred();
  const pending = withTimeout(() => gate.promise, 10);
  const rejected = assert.rejects(pending, TimeoutError);
  t.mock.timers.tick(10);
  await rejected;
  gate.reject(new Error("late failure must be observed"));
});
test("withTimeout forwards parent cancellation without aborting the parent itself", async () => {
  const controller = new AbortController();
  const reason = { cause: "caller" };
  let childSignal;
  const pending = withTimeout((signal) => { childSignal = signal; return new Promise(() => {}); }, 60_000, { signal: controller.signal });
  const rejected = assert.rejects(pending, (error) => error === reason);
  controller.abort(reason);
  await rejected;
  assert.equal(childSignal.reason, reason);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
test("withTimeout does not start work with a pre-aborted signal", async () => {
  await assert.rejects(withTimeout(() => assert.fail("must not run"), 10, { signal: AbortSignal.abort() }), { name: "AbortError" });
});
test("withTimeout cleans parent listeners after success and timeout", async () => {
  const controller = new AbortController();
  await withTimeout(() => 1, 10, { signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  await assert.rejects(withTimeout(() => new Promise(() => {}), 0, { signal: controller.signal }), TimeoutError);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal(controller.signal.aborted, false);
});
test("withTimeout(0) permits a synchronous result before the timer fires", async () => {
  assert.equal(await withTimeout(() => 1, 0), 1);
});
test("withTimeout rejects an invalid task", async () => assert.rejects(withTimeout(null, 10), TypeError));
for (const ms of invalidDurations) {
  test(`withTimeout rejects invalid duration ${String(ms)}`, async () => assert.rejects(withTimeout(() => 1, ms), RangeError));
}
