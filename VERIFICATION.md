# 验证记录

当前源码 `0.2.0-alpha.6`，DSH `0.2.0-rc.2`，macOS arm64。浏览器执行改为真实 Playwright 和本机 Chrome，没有修改官方 DSH Desktop。

| 检查 | 证据 |
| --- | --- |
| TypeScript、构建与单元 / 进程测试 | [host-unit-tests.txt](evidence/host-unit-tests.txt) |
| Playwright 1.64.0 + Chrome 155，可见窗口 | [playwright-browser-report.json](evidence/playwright-browser-report.json) |
| stock DSH 安装 bundle、审批、真实沙箱和 Chrome | [installed-host-report.json](evidence/installed-host-report.json) |
| 已安装 Desktop 可执行文件的 Node 模式，同一安装验收 | [installed-electron-host-report.json](evidence/installed-electron-host-report.json) |
| stock Web profile 设置保存、动态生效和重启持久化 | [settings-report.json](evidence/settings-report.json) |

浏览器测试把已构建的解释器 worker 接到真实 Playwright，运行本地 HTTP 夹具。覆盖定位器严格匹配、等待按钮可操作、可信点击和键盘事件、表单、正则和组合定位器、跨源 iframe、拖拽、导航、ARIA snapshot、真实 PNG、弹出标签归属、跨 owner / 跨标签拒绝，以及外层超时关闭浏览器。另验证不开放任意求值、CDP 或截图文件路径。

安装测试在临时 `DSH_HOME` 中安装打包产物，使用官方 npm rc.2 的 ToolRuntime / subprocess / sandbox / approval；开启 Chrome 测试时执行真实定位器输入、截图和超时释放。Desktop Node 模式使用已安装 Electron 44.0.0 / Node 24.18.1，**不等于重新安装并验收 Desktop UI**。不会修改用户 managed profile。

设置验收使用完整 stock Web profile，验证宿主 allow / ask / deny、原生禁用、变量保留、过期 revision 与非法字段拒绝，以及重启后的配置恢复。原生 SDK 只执行无提示权限查询；本轮未逐项实测原生应用输入。浏览器夹具不代表任意网站兼容性，也不包含实时 PiP。

## 复现

### 当前源码新增的权限设置

本次变更通过 TypeScript、构建及全部 28 项单元 / 进程测试，其中 12 项权限测试覆盖只读查询、并发申请合并、申请后读取实际状态、原生禁用、非 macOS Host、卸载期间禁止延迟弹窗、原生操作缺少权限的诊断，以及固定系统设置入口的参数校验。测试使用真实 DSH Typert registry / Host Gateway 和已发布 Client 模块，通过模拟 carrier 往返，不创建 Agent。Client 挂载在带依赖检查的 Cordis 插件作用域中，覆盖动态命名空间注入与卸载；额外覆盖操作超时、错误详情、重试和旧响应失效。临时移除命名空间依赖后，该测试能复现 Desktop 的 `without inject` 错误。

另用本机 Chrome 的 headless 页面检查中英文权限面板与启用引导的按钮、返回窗口后重查、授权失败重试和非 macOS 状态。页面复用已发布的 DSH Button / StateDot 实现，原生权限 API 使用模拟状态。记录见 [permissions-settings-report.json](evidence/permissions-settings-report.json)。

修复版通过官方 Desktop 的插件管理页面安装并启用，完全退出并重新启动 Desktop 后，权限面板显示辅助功能和屏幕录制均为 Granted；重新检测成功，四项配置保持原值。已安装的 `dist/client.js` 与本次构建哈希一致，未修改 Desktop 或直接编辑 managed profile。记录见 [desktop-permissions-report.json](evidence/desktop-permissions-report.json)。

本机两项权限原先已授权，因此本轮没有触发真实 macOS 授权弹窗。首次授权、曾拒绝后打开系统设置以及新授予权限后的重启要求仍需单独验收；不能用本次已授权状态查询或历史安装报告代替。

### 配置布局调整

权限区已移到原生应用开关下方，保存按钮位于整个表单末尾；移除重新检测按钮，打开页面、返回窗口和保存原生开关后自动查询。新版 bundle 已通过官方 Desktop 安装和启用，英文页面中两项权限均为 Granted，高级设置保留原值；已安装 Client 与构建哈希一致。类型检查、构建及 28 项测试通过。范围与限制见 [settings-layout-report.json](evidence/settings-layout-report.json)。前一节的手动重新检测记录对应调整前的 UI。

### macOS Agent Cursor（未发布源码）

已接入 trycua 0.34.0 的独立 GUI worker，官方 Desktop 无需补丁。生产下载路径实际完成官方 universal 压缩包下载、压缩包与可执行文件的 SHA-256 校验、缓存落盘；上游签名通过 `codesign --verify --strict`。类型检查、构建与 35 项单元 / 进程测试通过，覆盖并发准备、取消、校验失败、缓存损坏修复与退出清理。

`npm run test:native-helper` 在真实 macOS 图形会话中启动两个 worker，确认进程隔离、光标设施启用、默认主题及 shutdown 后进程退出；使用 Desktop 可执行文件的 Node 模式再次通过。这个集成测试只查询设施，不发送输入，也不申请权限。

测试包已通过官方 Desktop 插件管理页面安装并启用，已安装 Host 和解释器 worker 与构建哈希一致。已有两项权限保持 Granted；随后通过 Desktop 中的助手执行计算器清除、`1 + 2 =`，每次点击重新观察，独立窗口截图确认结果为 `3`。随后 `cua_repl_reset` 返回成功，进程检查确认该会话 worker 已退出。应用窗口截图不包含独立系统叠加层，因此不能单凭截图认定光标已肉眼可见。具体范围、哈希和限制见 [native-agent-cursor-report.json](evidence/native-agent-cursor-report.json)。

### 构建与测试命令

先在测试机器安装 Google Chrome，然后：

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
npm run test:browser
# macOS 图形会话：首次运行会下载固定的原生 helper。
npm run test:native-helper

# 可见 Chrome；默认浏览器测试以 headless 运行。
DSH_CUA_HEADED_TEST=1 npm run test:browser

# stock DSH 的 pnpm 必须在 PATH；测试创建并清理自己的 DSH_HOME。
DSH_CLI=/absolute/path/to/dsh DSH_CUA_CHROME_TEST=1 npm run test:install
DSH_CLI=/absolute/path/to/dsh npm run test:settings
DSH_CLI=/absolute/path/to/dsh DSH_CUA_CHROME_TEST=1 \
  DSH_TEST_NODE='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' \
  npm run test:install
```

这些命令不下载 Electron 或 Playwright 自带浏览器。CI 使用 runner 已安装的 Google Chrome。插件生产入口始终打开可见窗口；headless 开关仅在测试构造器中使用。

## 历史证据

`evidence` 中的 Desktop UI、旧 browser guest 和 GitHub 安装报告保留了各自版本与范围。其中 alpha.2–alpha.5 的侧栏浏览器验证属于旧实现，不计入 alpha.6 的通过项。以前版本的完整验证说明可在对应 Git 历史中查看。
