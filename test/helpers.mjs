export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function flush() {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}

export const invalidDurations = [-1, 0.5, NaN, Infinity, 2_147_483_648, "10"];
export const invalidCounts = [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "2"];
