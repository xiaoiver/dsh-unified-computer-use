# 验证记录

2026-10-09，macOS arm64，Node 24.18.1，Electron **44.7.0**，Cua Driver **0.34.0**，Harness **0.2.0-rc.2**。当前实现是独立插件加其拥有的桌面进程，**没有宿主补丁**。

## 已验证

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript / 构建 | 通过 | `npm run typecheck` / `npm run build` |
| 单元及 DSH ToolRuntime 测试 | **18 / 18** | `evidence/unit-tests.txt` |
| 插件完整调用链 | 通过 | `evidence/companion-report.json` |
| 原版 DSH 安装、激活及启动 | 通过 | `evidence/installed-bundle-report.json` |
| 浏览器 + 视频 PiP | 通过 | `evidence/electron-report.json` |
| 原生窗口 + 视频 PiP | 通过 | `evidence/native-report.json` |

安装验收使用 npm 的原版 `@deepseek-ai/dsh@0.2.0-rc.2`，在隔离的 `DSH_HOME` 中执行真实的 `dsh plugin --profile cua-test add`。确认 profile 自动加入 bundle、`--dump-config` 显示插件配置层，然后用原版 `dsh` 启动完整 profile。仅增加测试 fixture 插件以创建测试 Agent、处理审批并检查结果；未改 DSH 文件、工具执行器或进程协议。已安装的 `cua` 通过插件拥有的 Electron 进程读取本地测试网页，Agent 销毁后回收进程。

调用链测试运行真实 Cordis、DSH Agent / ToolRuntime / Approval 和编译后的插件。Node 测试进程没有 parent IPC；运行时由插件解析 / 准备，经过 6 次审批完成打开、填写、观察、点击、结果回读、reset、重新启动及 Agent 清理。运行时校验采用内置固定 SHA-256；这条安装 / 调用链测试复用已有缓存，没有覆盖 Desktop 首次联网下载成功。

浏览器验收覆盖隐藏窗口下填写和点击、结果观察、旧 ref 拒绝、跨会话隔离、暂停与恢复、关闭 PiP 后继续操作、取消导航和窗口回收。PiP 的 `video.currentTime` 在没有工具调用时继续增长。点击前使用一次低质量合成帧截图同步（不返回模型）来处理 Chromium 隐藏窗口首帧输入问题；没有点击重试，也没有预览截图轮询。

原生验收只操作临时 AppKit fixture：窗口发现与绑定、AX 填写 / 按钮操作、回读业务结果与截图、实时窗口视频；PiP 不使 AX token 失效；源应用退出撤销目标。

## 0.1.1 启动恢复修复

新增回归覆盖冷缓存下载中 DSH 对象型取消原因的可读诊断、网络 cause 保留、取消启动后同一及另一 live Agent 的后续调用恢复。下载取消测试使用受控 fetch 故障；恢复测试通过真实 DSH ToolRuntime 与子进程 fixture。真实 Electron 调用链再次通过，仍复用缓存。未把这些结果当作 Desktop 首次下载或 UI 成功验收。

## 复现

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build

# 本机图形桌面；目录须为绝对路径，首次会下载桌面运行时。
DSH_CUA_RUNTIME_DIR=/absolute/path/test-cache npm run test:integration

# 原版 rc.2 CLI；pnpm 须在 PATH 中。测试自动使用临时 DSH_HOME。
DSH_CLI=/absolute/path/dsh \
DSH_CUA_RUNTIME_DIR=/absolute/path/test-cache \
npm run test:install
```

`test:install` 默认安装本地 `npm pack` 产物；设置 `DSH_CUA_INSTALL_SPEC=github:xiaoiver/dsh-unified-computer-use#<commit>` 可验证公开仓库的确切提交。

媒体和原生专项验收使用已准备好的 Electron：

```sh
DSH_CUA_TEST_ELECTRON=/absolute/path/test-cache/electron-44.7.0-darwin-arm64/Electron.app/Contents/MacOS/Electron npm run test:electron
DSH_CUA_TEST_ELECTRON=/absolute/path/test-cache/electron-44.7.0-darwin-arm64/Electron.app/Contents/MacOS/Electron npm run test:native
```

原生测试还需 Xcode Command Line Tools 和 macOS 权限。所有图片只包含测试创建的网页或应用：`built-in-browser.png`、`picture-in-picture.png`、`native-window.png`、`native-pip.png`。

## 未覆盖

- 没有真实 LLM API 推理或长时间自主任务；测试驱动 DSH 的真实工具执行与审批链。
- 验证了原版 CLI 的完整 profile 启动及工具调用，尚未通过正式 Desktop 对话 UI 逐项交互验收。Desktop 的安装入口已对照 0.2.0-rc.2 源码确认：应用内「插件」→「添加插件」；CLI 明确拒绝 `desktop` profile，隔离的 `cua-test` 安装验收不代表 Desktop UI 安装验收。
- 尚未验证新用户机器的系统权限首次授权流程、显示器热插拔、所有网站的跨域 frame / 特殊控件或多窗口长时间压力。
- Windows、Linux、Intel Mac 不属于首版支持范围。浏览器是独立窗口，不接管现有 DSH 侧栏。
- npm audit 的原始结果在 `evidence/dependency-audit.json`。rc.2 的 DSH MCP client 依赖链包含 OAuth advisory；本插件只调用其工具结果适配函数，不连接远程 MCP 或执行 OAuth，但这不等于整个依赖树已通过安全审计。

CI 覆盖跨平台可运行的类型、单元测试和构建一致性，桌面专项验收记录来自上述本机环境。
