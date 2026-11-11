# batchlane

[![CI](https://github.com/wuhuaguo321/batchlane/actions/workflows/ci.yml/badge.svg)](https://github.com/wuhuaguo321/batchlane/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**一个让批量任务有秩序地运行的小函数库。** 零运行时依赖，JavaScript / TypeScript 可用，同时提供 ESM、CommonJS 和类型声明。

[English](README.en.md) · [版本下载](https://github.com/wuhuaguo321/batchlane/releases) · [问题反馈](https://github.com/wuhuaguo321/batchlane/issues)

## 用大白话说

假设你要让程序处理 100 张图片：

- `chunk` 像分箱员：每 10 张装一箱。
- `mapLimit` 像调度员：同一时间只让 3 张图片在处理，避免一口气启动 100 个任务。结果仍按原来的顺序交给你。
- `retry` 像补救员：临时失败后等一会，再试一次；次数用完就报告失败。
- `delay` 像闹钟：等一段时间再继续，也能中途取消。
- `withTimeout` 像计时员：任务等得太久就返回超时错误，同时向任务发出停止信号。

它是一盒供其他程序调用的小工具，没有独立的软件窗口，也不会自行上传或处理你的文件。

## 安装

需要 Node.js 22 或以上。本项目通过 **GitHub Releases** 分发已编译安装包，暂未发布到 npm 公共注册表。复制完整地址安装：

```sh
npm install https://github.com/wuhuaguo321/batchlane/releases/download/v0.1.0/batchlane-0.1.0.tgz
```

安装包已经编译好，使用者不需要安装 TypeScript。Release 同时附带 `SHA256SUMS.txt`，可核对下载文件。

## 一分钟上手

保存为 `demo.mjs`，执行 `node demo.mjs`：

```js
import { mapLimit, retry, delay } from 'batchlane';

const results = await mapLimit([101, 102, 103, 104], 2, (id, _index, signal) =>
  retry(async ({ attempt, signal }) => {
    await delay(10, { signal });
    if (id === 103 && attempt === 1) throw new Error('临时故障');
    return `订单 ${id} 完成`;
  }, { attempts: 3, delayMs: 20, signal }),
);

console.log(results); // 4 个订单的结果，顺序不变；103 会自动重试。
```

CommonJS 同样可用：

```js
const { chunk } = require('batchlane');
console.log(chunk([1, 2, 3, 4, 5], 2)); // [[1, 2], [3, 4], [5]]
```

## API

### `chunk(items, size)`

将数组切成若干个新数组。`size` 必须是正安全整数。空输入返回 `[]`；最后一组可以不足 `size`。不会修改原数组，组内的对象仍是原来的对象，不做深拷贝。

### `mapLimit(items, concurrency, mapper, { signal }?)`

`mapper(item, index, signal)` 可以返回普通值或 Promise。`concurrency` 必须是正安全整数。函数先对输入数组做浅拷贝，最多启动指定数量的任务，并按输入顺序返回结果。稀疏数组的空槽按 `undefined` 处理。

任一任务失败后，整个调用报错，保留最早观察到的失败原因；停止安排后续任务，向已经启动的任务发送取消信号。不会返回部分结果。调用者取消也会停止排队；即使输入为空，已经取消的信号仍会使调用失败。

```js
const values = await mapLimit([1, 2, 3], 2, async (n) => n * 10);
// [10, 20, 30]
```

### `retry(task, options?)`

`task({ attempt, signal })` 接收从 **1** 开始的尝试次数。一次失败结束后才会开始下一次，不重叠执行。

- `attempts`：总尝试次数，默认 `3`，**包含第一次**。
- `delayMs`：第一次失败后的等待时间，默认 `100` 毫秒。
- `factor`：后续等待的倍率，默认 `2`，必须是大于等于 1 的有限数。
- `maxDelayMs`：每次等待的上限，默认 `30000` 毫秒，也约束第一次等待。
- `shouldRetry(error, attempt)`：可选的同步或异步判断，返回 `false` 就停止。最后一次失败后不会调用它；判断函数自己抛出的错误会直接返回。
- `signal`：可选取消信号；执行任务、等待间隔和异步判断期间都可以取消。

例如默认间隔为 100、200 毫秒，第三次仍失败就抛出最后一次的原始错误。等待按倍率增长、受上限限制，实际传给计时器时向下取整。没有内置随机抖动。已经被外部取消的任务不会继续重试。

仅对适合重复执行的操作启用重试。创建订单、扣款等可能产生重复副作用的操作，应由业务方提供去重方式。

### `delay(ms, { signal }?)`

等待指定毫秒数。`delay(0)` 也会等到后续的计时器轮次。取消会立刻拒绝 Promise，并清理计时器与监听器。

### `withTimeout(task, ms, { signal }?)`

`task(signal)` 接收这个调用的取消信号。超时后抛出 `TimeoutError`，其 `name` 为 `"TimeoutError"`，`timeoutMs` 是设定的时限。提前成功或失败都会清理计时器。外部取消保留原始 `signal.reason`，不会改成超时错误。

```js
import { withTimeout, TimeoutError } from 'batchlane';

try {
  const data = await withTimeout(async (signal) => {
    const response = await fetch('https://example.com/api', { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, 3000);
  console.log(data);
} catch (error) {
  if (error instanceof TimeoutError) console.log('等待超过 3 秒');
  else throw error;
}
```

## 取消与时间边界

所有毫秒参数必须是 `0` 到 `2147483647` 的整数，避免超大计时值在运行环境中变成几毫秒。非法参数会立即报错：`chunk` 同步抛出，异步函数返回拒绝的 Promise。

取消意味着“停止等待，并通知任务停止”。**任务需要把收到的 `signal` 传给 `fetch`、`delay` 等支持取消的操作，才能真正停止底层工作。** 不理会信号的任务仍可能继续运行，库会接住它迟到的错误，避免出现未处理的 Promise 拒绝。子任务不会反向取消调用者的信号。

这些工具管理异步任务，不创建线程，也不能中断阻塞 JavaScript 的同步计算。计时器可能因事件循环忙碌而晚触发；`withTimeout(task, 0)` 仍允许任务在计时器触发前同步完成。`mapLimit` 限制同时运行数，不限制每秒请求数；`retry` 是单个任务的尝试次数，组合时由你选择对每个任务重试还是对整个批次重试。

## 本地开发

```sh
git clone https://github.com/wuhuaguo321/batchlane.git
cd batchlane
npm ci --ignore-scripts
npm run check
npm run demo
npm run test:coverage
```

`check` 包含编译、类型检查、行为测试，以及把真实 `.tgz` 安装到干净临时目录后验证 ESM / CommonJS 和对应类型。测试覆盖并发上限、输出顺序、取消、退避、资源清理、迟到的失败与多个函数组合。

CI 在 Ubuntu / Windows 与 Node.js 22 / 24 的组合上运行。源码见 `src/`，示例见 `examples/`。实现只使用标准 JavaScript 和 Web 取消接口；浏览器不在当前自动化验收范围内。

## 开源

[MIT License](LICENSE)。欢迎通过 Issue 报告问题或提交 Pull Request。贡献和发布步骤见 [CONTRIBUTING.md](CONTRIBUTING.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)。
