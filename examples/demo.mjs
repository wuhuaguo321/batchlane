import { chunk, delay, mapLimit, retry, withTimeout, TimeoutError } from "../dist/esm/index.js";

const orders = [101, 102, 103, 104, 105, 106];
console.log("把 6 个订单每 3 个分成一组：", chunk(orders, 3));
let active = 0;
let peak = 0;
const results = await mapLimit(orders, 2, (id, _index, signal) => retry(
  ({ attempt, signal: retrySignal }) => withTimeout(async (taskSignal) => {
    peak = Math.max(peak, ++active);
    try {
      await delay(20, { signal: taskSignal });
      if (id === 103 && attempt === 1) {
        console.log("订单 103 第一次失败，自动等一会再试。");
        throw new Error("模拟临时故障");
      }
      return { id, attempt, status: "完成" };
    } finally { active--; }
  }, 1000, { signal: retrySignal }),
  { attempts: 3, delayMs: 10, signal },
));
console.log("处理结果（仍按原来的顺序）：", results);
console.log(`同时处理的任务最多 ${peak} 个。`);
try {
  await withTimeout((signal) => delay(1000, { signal }), 10);
} catch (error) {
  if (!(error instanceof TimeoutError)) throw error;
  console.log("另一个任务太慢，超过 10 毫秒后已取消等待并发出停止信号。");
}
