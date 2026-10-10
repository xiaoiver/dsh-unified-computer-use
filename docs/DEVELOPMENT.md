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

在 Desktop「插件 → 添加插件」中输入生成的 `.tgz` 绝对路径，然后安装、启用并完全重启应用。需要复现已发布版本时，先切换到对应标签，例如 `git checkout v0.2.0-alpha.7`，再执行构建步骤。

也可下载 Release 安装包及 `SHA256SUMS`，放到同一目录执行 `shasum -a 256 -c SHA256SUMS`，再通过 Desktop 安装。每个发布标签和安装包固定版本；不会随 main 更新。

## 普通 CLI / Web profile

```sh
dsh plugin --profile cua-test add /absolute/path/to/dsh-unified-computer-use-0.2.0-alpha.7.tgz
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

独立 Node 子进程使用 Host 的 `process.execPath`，不安装另一套 Electron；macOS 原生操作由 SDK 直接启动的 private worker 执行，权限设置仍在 Host 中执行；网页由 `playwright-core@1.64.0` 启动已安装的 Chrome 承载。生产环境使用 `channel: chrome`、可见窗口和临时 BrowserContext；不运行 Playwright 浏览器下载命令，不允许模型指定可执行文件、启动参数或已有 CDP 地址。Node 内置解释器的异常通道适配目前验证了 Node 24.18.1。

文件访问遵守 DSH 当前会话沙箱，解释器不是仅允许 `cua` 的 JavaScript 沙箱。取消、超时、重置、空闲过期及沙箱策略变化会销毁解释器和绑定；已有文件或网页修改不会因此撤销。浏览器命令由控制管道交给 Host，真实 Page / Locator 只留在 Host 中，再由 Playwright 通过管道连接独立 Chrome。没有额外 HTTP / CDP 监听端口；每个 Agent 有独立浏览器实例和目标表，不能引用其他会话的标签。Chrome 进程由 Host 启动，不在 REPL 文件沙箱内；这里的归属校验约束 CUA 接口，并不是对整个 Node 解释器的隔离承诺。

`tab.playwright` 提供受限的真实 Playwright Page / Locator 接口，包括自动等待、可信键鼠输入、iframe 和截图。定位器描述跨管道传输，在 Host 解析；不暴露任意页面求值、文件上传下载、原始 BrowserContext / CDP 或现有标签接管。独立实时 PiP 仍未实现。进程边界、生命周期、文档和截图回传详见[调用图](CALL-FLOWS.md)，可复现测试见[验证记录](../VERIFICATION.md)。

## macOS Agent Cursor 辅助进程

固定使用与 SDK 一致的官方 `cua-driver 0.34.0` universal 签名二进制。首次原生操作从固定 GitHub Release 下载约 47 MB 压缩包，对照源码固定的压缩包与可执行文件 SHA-256 校验，仅提取 `cua-driver`。缓存位于 `~/Library/Caches/dsh-unified-computer-use/native/0.34.0/darwin-universal`，每次新建运行时前验证缓存；不执行安装脚本，也不允许模型指定可执行文件或下载地址。

同一插件实例共享准备过程，下载最多等待 5 分钟；工具调用取消只停止该调用等待，后续调用复用准备结果。插件卸载会取消准备并删除暂存文件。下载失败可重试，没有隐藏的无光标回退。已校验的缓存保留以供后续安装复用。

每个 Agent 的 `NativeRuntime` 使用 `CuaDriver.createPrivateWorker` 创建专属子进程。它通过继承的 stdin/stdout 通信，不创建监听端口、共享 socket 或常驻 daemon；AppKit 主线程由原生子进程拥有。运行模式仅允许 SDK `standard`，没有 unrestricted 或自动批准回调。原生输入仍受原有 pid/windowId、session 和观察 token 约束。DSH Host 直接启动子进程，权限查询与申请仍在 Host 中完成。

取消、重置、空闲清理、Agent 销毁及插件卸载会关闭其会话、执行 SDK shutdown 并释放绑定。SDK 管理私有子进程退出；光标可在空闲时自行淡出。其他系统暂时保留原有 SDK 路径，本次光标支持仅覆盖 macOS。

运行 `npm run test:native-helper` 可验证真实 macOS GUI worker 的光标设施、进程隔离和退出，不触发权限申请或应用输入。完整可见光标仍需通过 Desktop 中的原生任务验收。

## 原生窗口实时 PiP

macOS 13+ 使用随包提供的 `native/bin/dsh-native-pip`（arm64 / x86_64 universal）。它由公开的 `native/NativePip.swift` 和 `native/PipPanel.swift` 构建，采用 ad-hoc 签名；不是 Apple notarization 或 Developer ID 签名。Host 启动前校验固定 SHA-256。用户不需要 Xcode、Swift 编译器或另一套 Electron。

维护者修改 Swift 后，在 macOS 安装 Xcode 命令行工具并运行 `npm run build:native`，一并提交源文件、通用二进制及 `native/manifest.json`，然后 `npm run build`。普通 JS 构建不会调用 Swift；单元测试核对源文件和二进制哈希及两个架构，macOS CI 另外重新编译并检查签名。

每个 Agent 按需持有一个 PiP 进程，在其中按目标身份持有多个独立窗口和采集流，通过继承管道传递由 Host 验证过的窗口身份。Host 为不同 Agent / 目标分配互不重复的堆叠槽位，初始窗口沿右上角以 32 点错开。每个目标保留自己的位置、尺寸与本轮关闭状态。`SCContentFilter(desktopIndependentWindow:)` 只采集该窗口，最大边 960 像素、目标 15 fps、无音频。帧直接送入 AppKit 的 `AVSampleBufferDisplayLayer`，不发送给模型、不经过 Host Gateway、不保存图片。主线程只排队一帧；拥塞时丢弃后续帧，避免增长队列。

手动关闭仅抑制该目标本轮再次打开，不影响其他窗口；下一轮仅在重新观察原生目标时重开。Agent idle 停止采集，1.5 秒后隐藏；目标关闭、身份失效或锁屏立即停止并清空。唤醒不自动恢复采集，必须再次观察合法目标。reset、超时、卸载与父进程 EOF 退出辅助程序；Host 等待真实进程退出并提供强制终止上限。权限不足或采集失败仅报告预览不可用，不降级捕获整个桌面。

PiP 显示 Host 所在 Mac 的窗口。它不会跟随其他机器的 Desktop 客户端显示；当前实现不提供远程视频转发、Chrome PiP、系统音频或预览内远程控制。

浮窗使用透明无边框 `NSPanel` 和 14 点圆角；控制按钮与渐变来源信息只在悬停或键盘焦点时显示。画面本身是拖动区域，右下角提供等比缩放；方向键微调，Shift 加大步长，Escape 撤销当前拖动。初始画面适配 480×300 的范围，最大适配 720×450；窄竖屏不会被固定最小宽度撑高。跨显示器移动使用桌面坐标，包含负原点；显示器变化会把浮窗约束到可用区域。用户点击预览才会让它接受键盘焦点，自动出现时不抢焦点。

`npm run test:native-pip` 编译并运行 Swift 布局边界测试，不打开窗口、不采集屏幕。`test/native-pip-ui.swift` 是本地交互夹具；以 `-D PIP_UI_FIXTURE` 与两个原生源文件一同编译后，无参数启动会展示横向、竖向模拟内容，可检查拖拽、缩放和关闭隔离。该入口不编入生产程序。
