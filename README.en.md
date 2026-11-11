# batchlane

Small, dependency-free TypeScript helpers for predictable asynchronous batch work. ESM, CommonJS, type declarations, and source maps included. Node.js 22+.

[中文说明](README.md) · [Releases](https://github.com/wuhuaguo321/batchlane/releases) · [MIT](LICENSE)

## Install

The compiled package is distributed through GitHub Releases, **not the public npm registry**:

```sh
npm install https://github.com/wuhuaguo321/batchlane/releases/download/v0.1.0/batchlane-0.1.0.tgz
```

## Example

```js
import { mapLimit, retry, delay } from 'batchlane';

const results = await mapLimit([1, 2, 3], 2, (id, _index, signal) =>
  retry(async ({ attempt, signal }) => {
    await delay(10, { signal });
    if (id === 2 && attempt === 1) throw new Error('Temporary failure');
    return id * 10;
  }, { attempts: 3, delayMs: 20, signal }),
);
console.log(results); // [10, 20, 30]
```

CommonJS: `const { chunk } = require('batchlane');`

## API

- `chunk(items, size)` creates new arrays of at most `size` elements. Does not mutate input or deep-clone elements. Size must be a positive safe integer.
- `mapLimit(items, concurrency, mapper, { signal }?)` snapshots the input and calls `mapper(item, index, signal)` with bounded concurrency. Output order matches input. Sparse slots are passed as `undefined`. The first observed failure rejects the entire call, stops queued work, and aborts peers. No partial results. Concurrency must be a positive safe integer.
- `retry(task, options?)` calls `task({ attempt, signal })` sequentially. Attempts start at 1. Defaults: `attempts: 3` (including the initial call), `delayMs: 100`, `factor: 2`, `maxDelayMs: 30000`. Backoff is capped, then floored for the timer, without jitter. Optional `shouldRetry(error, attempt)` may be async; false stops, throwing propagates, and it is not called after the final attempt. The last task error is preserved on exhaustion. `factor` must be finite and at least 1. External cancellation also interrupts a pending predicate or backoff.
- `delay(ms, { signal }?)` waits asynchronously. Zero still yields to a later timer turn.
- `withTimeout(task, ms, { signal }?)` calls `task(signal)`. On timeout it rejects with `TimeoutError` (`name`, `message`, `timeoutMs`) and aborts the task's signal. Caller cancellation preserves the original reason. Success/failure cleans up the timer.

All millisecond options must be integers from 0 to 2147483647. Invalid input throws in `chunk`, and rejects the returned Promise in async functions. Empty maps still respect pre-aborted signals. Child cancellation never aborts the caller's signal.

**Cancellation is cooperative.** Pass the supplied signal to `fetch`, `delay`, or other cancellable operations. A task ignoring its signal may keep running after the wrapper rejects; late rejections are still observed. These functions do not create threads, interrupt synchronous CPU work, or guarantee exact timing. A zero timeout permits a synchronous result before the timer fires. Concurrency limits are not requests-per-second limits. Retry only operations safe to repeat, or supply application-level deduplication.

## Develop

```sh
npm ci --ignore-scripts
npm run check
npm run demo
npm run test:coverage
```

`check` builds both module formats, checks types, runs behavioral tests, and tests an actual tarball installed offline into an isolated consumer project. CI covers Ubuntu/Windows and Node.js 22/24. Browser compatibility is not currently tested. See [CONTRIBUTING.md](CONTRIBUTING.md).
