# Contributing

欢迎用中文或英文提交 Issue / Pull Request。

1. 使用 Node.js 22 或以上，执行 `npm ci --ignore-scripts`。
2. 修改 `src/`；为可观察行为的变化补充测试。
3. 执行 `npm run check`，确认真实安装包也可用。
4. 如有 API 或行为变化，更新中英文 README 和 CHANGELOG。

保持零运行时依赖；优先使用标准接口。涉及计时的测试尽量用可控计时器或手动 Promise，避免依赖真实网络及脆弱的精确耗时断言。

## 维护者发布步骤

1. 更新 `package.json` 版本，执行 `npm install --package-lock-only --ignore-scripts` 同步锁文件。
2. 更新 README 安装地址与 CHANGELOG；执行 `npm run check` 和 `npm run test:coverage`。
3. 提交并推送到 `main`，等待 CI 的全部环境通过。
4. 执行 `npm pack --pack-destination artifacts`（先创建 `artifacts` 目录），生成编译好的 `.tgz`，并生成 SHA-256 校验文件。
5. 将同一提交打上 `v<版本号>` 标签，推送并创建 GitHub Release，附上 `.tgz`、校验文件与版本说明。
6. 从公开 Release 地址安装一次，确认用户能实际下载使用。

当前没有自动 npm 发布流程；不需要向仓库提交访问令牌或账号配置。
