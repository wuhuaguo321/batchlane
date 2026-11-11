import { assertArray, assertPositiveInteger } from "./internal.js";

/** Split an array into new arrays without changing the input. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  assertArray(items);
  assertPositiveInteger(size, "size");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
