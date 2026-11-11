import test from "node:test";
import assert from "node:assert/strict";
import { chunk } from "../dist/esm/index.js";
import { invalidCounts } from "./helpers.mjs";

test("chunk splits evenly and retains a short final batch", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
});
test("chunk handles empty input and a size larger than the input", () => {
  assert.deepEqual(chunk([], 3), []);
  assert.deepEqual(chunk([1, 2], 10), [[1, 2]]);
});
test("chunk leaves frozen input untouched and copies each array", () => {
  const source = Object.freeze([1, 2, 3]);
  const result = chunk(source, 2);
  result[0][0] = 99;
  assert.deepEqual(source, [1, 2, 3]);
});
test("chunk deliberately retains object references", () => {
  const item = { id: 1 };
  assert.equal(chunk([item], 1)[0][0], item);
});
test("chunk rejects a non-array", () => assert.throws(() => chunk("abc", 2), TypeError));
for (const size of invalidCounts) {
  test(`chunk rejects invalid size ${String(size)}`, () => assert.throws(() => chunk([], size), RangeError));
}
