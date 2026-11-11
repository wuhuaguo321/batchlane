# Changelog

## 0.1.0 — 2026-11-11

首次公开版本。

- `chunk`：数组分组，不修改原数组。
- `mapLimit`：有并发上限的异步映射，保留输入顺序，失败时取消同组任务。
- `retry`：总次数上限、可配置退避、错误筛选和取消。
- `delay`：可取消的等待。
- `withTimeout` / `TimeoutError`：超时边界及可识别的错误类型。
- ESM / CommonJS、TypeScript 类型、内嵌源码的 source maps。
- 中文和英文文档、可执行示例、安装包验收、Ubuntu / Windows CI。
