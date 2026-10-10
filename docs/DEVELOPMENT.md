# 开发与配置

## 本地构建

构建当前检出的源码（包括尚未发布的 PR 修改）：

```sh
git clone https://github.com/xiaoiver/dsh-unified-computer-use.git
cd dsh-unified-computer-use
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
npm pack --ignore-scripts
```

在 Desktop「插件 → 添加插件」中输入生成的 `.tgz` 绝对路径，然后安装、启用并完全重启应用。需要复现已发布版本时，先切换到对应标签，例如 `git checkout v0.2.0-alpha.6`，再执行构建步骤。

也可下载 Release 安装包及 `SHA256SUMS`，放到同一目录执行 `shasum -a 256 -c SHA256SUMS`，再通过 Desktop 安装。每个发布标签和安装包固定版本；不会随 main 更新。

## 普通 CLI / Web profile

```sh
dsh plugin --profile cua-test add /absolute/path/to/dsh-unified-computer-use-0.2.0-alpha.6.tgz
```

浏览器在 DSH Host 所在机器启动，因此 CLI / Web profile 也可使用，但 Host 必须具有图形环境并安装 Google Chrome。远程 Host 不会在本地客户端打开浏览器。`desktop` profile 由 Electron 应用独占管理，不能使用 `dsh plugin --profile desktop add`。

## 配置字段

插件详情页将时间以秒展示，底层仍以毫秒保存：

| 字段 | 默认值 | 作用 |
| --- | --- | --- |
| `timeoutMs` | `30000` | 单次调用默认时限；工具的 `timeout_ms` 可覆写至 120000 |
| `idleTimeoutMs` | `600000` | 空闲多久后清理解释器、Chrome 与目标绑定 |
| `native` | `true` | 启用原生应用操作 |
| `maxTargets` | `12` | 原生目标上限；浏览器固定上限为 12 |

保存后配置立即可读，正在执行的调用保留原超时时限。空闲时限在下一次调用结束时重新计时；降低目标上限不会主动关闭已有目标。配置保存到 DSH 当前 profile，重启后恢复。发生并发配置冲突时，重新打开插件页面读取最新值再编辑。只有可写的本机 Host 连接能保存。

工具审批统一由 DSH 决定，没有插件级审批开关。审批单位为整个 JavaScript cell，其中可能包含多次操作。

## API 文档与运行时

插件注册 `cua_repl` 和 `cua_repl_reset`。模型通过简短系统提示发现入口；首次执行返回[通用 API](CUA-API.md)，首次成功浏览器入口返回[浏览器 API](BROWSER-API.md)。Markdown 文件直接打包进运行时，避免另一份面向模型的说明发生偏差。重读入口、返回值、示例与能力边界见这两份参考。

独立 Node 子进程使用 Host 的 `process.execPath`，不安装另一套 Electron；原生 SDK 在 Host 侧执行，网页由 `playwright-core@1.64.0` 启动已安装的 Chrome 承载。生产环境使用 `channel: chrome`、可见窗口和临时 BrowserContext；不运行 Playwright 浏览器下载命令，不允许模型指定可执行文件、启动参数或已有 CDP 地址。Node 内置解释器的异常通道适配目前验证了 Node 24.18.1。

文件访问遵守 DSH 当前会话沙箱，解释器不是仅允许 `cua` 的 JavaScript 沙箱。取消、超时、重置、空闲过期及沙箱策略变化会销毁解释器和绑定；已有文件或网页修改不会因此撤销。浏览器命令由控制管道交给 Host，真实 Page / Locator 只留在 Host 中，再由 Playwright 通过管道连接独立 Chrome。没有额外 HTTP / CDP 监听端口；每个 Agent 有独立浏览器实例和目标表，不能引用其他会话的标签。Chrome 进程由 Host 启动，不在 REPL 文件沙箱内；这里的归属校验约束 CUA 接口，并不是对整个 Node 解释器的隔离承诺。

`tab.playwright` 提供受限的真实 Playwright Page / Locator 接口，包括自动等待、可信键鼠输入、iframe 和截图。定位器描述跨管道传输，在 Host 解析；不暴露任意页面求值、文件上传下载、原始 BrowserContext / CDP 或现有标签接管。独立实时 PiP 仍未实现。进程边界、生命周期、文档和截图回传详见[调用图](CALL-FLOWS.md)，可复现测试见[验证记录](../VERIFICATION.md)。
