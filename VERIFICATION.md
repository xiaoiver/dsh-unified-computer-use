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

本次变更通过 TypeScript、构建及全部 24 项单元 / 进程测试，其中 8 项权限测试覆盖只读查询、并发申请合并、申请后读取实际状态、原生禁用、非 macOS Host、卸载期间禁止延迟弹窗、原生操作缺少权限的诊断，以及固定系统设置入口的参数校验。测试使用真实 DSH Typert registry / Host Gateway 和已发布 Client 模块，通过模拟 carrier 往返，不创建 Agent。

另用本机 Chrome 的 headless 页面检查中英文权限面板与启用引导的按钮、返回窗口后重查、授权失败重试和非 macOS 状态。页面复用已发布的 DSH Button / StateDot 实现，原生权限 API 使用模拟状态。记录见 [permissions-settings-report.json](evidence/permissions-settings-report.json)。

**本轮未重新安装 Desktop 插件，也未触发真实 macOS 授权弹窗。** TCC 授权主体、用户曾拒绝后打开系统设置的行为，以及授予权限后的重启要求，仍需在真实 DSH Desktop 中手动验收。上述历史安装报告不作为本次新增权限流程的安装验收证据。

### 构建与测试命令

先在测试机器安装 Google Chrome，然后：

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
npm run test:browser

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
