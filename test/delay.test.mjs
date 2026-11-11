import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { delay } from "../dist/esm/index.js";
import { flush, invalidDurations } from "./helpers.mjs";

test("delay resolves only after its timer and removes its listener", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController();
  let done = false;
  const pending = delay(100, { signal: controller.signal }).then(() => { done = true; });
  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  t.mock.timers.tick(99);
  await flush();
  assert.equal(done, false);
  t.mock.timers.tick(1);
  await pending;
  assert.equal(done, true);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
test("delay(0) yields to a later timer turn", async () => {
  let done = false;
  const pending = delay(0).then(() => { done = true; });
  await flush();
  assert.equal(done, false);
  await pending;
});
test("delay preserves an already-aborted signal's reason", async () => {
  const reason = { canceled: true };
  await assert.rejects(delay(1, { signal: AbortSignal.abort(reason) }), (error) => error === reason);
});
test("delay cancels a long timer and cleans its listener", async () => {
  const controller = new AbortController();
  const reason = new Error("stop waiting");
  const pending = delay(60_000, { signal: controller.signal });
  const rejected = assert.rejects(pending, (error) => error === reason);
  controller.abort(reason);
  await rejected;
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
for (const ms of invalidDurations) {
  test(`delay rejects invalid duration ${String(ms)}`, async () => assert.rejects(delay(ms), RangeError));
}
