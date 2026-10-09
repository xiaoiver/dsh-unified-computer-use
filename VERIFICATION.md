# Host backend 验证记录

2026-10-09。0.2.0-alpha.3，macOS arm64，DSH 0.2.0-rc.2。没有使用本地 DSH 工作树中的旧补丁。

| 检查 | 结果 / 证据 |
| --- | --- |
| TypeScript、构建、单元及进程测试 | `npm run typecheck && npm run build && npm test` |
| 公开 GitHub 分支直接安装及 REPL | [installed-github-host-report.json](evidence/installed-github-host-report.json) |
| 普通 Node 下 stock DSH 安装及 REPL | [installed-host-report.json](evidence/installed-host-report.json) |
| 已安装 Desktop 的 Node 模式运行 stock DSH 安装测试 | [installed-electron-host-report.json](evidence/installed-electron-host-report.json) |
| 已安装 Desktop 插件管理器、持久 REPL、侧栏网页 | [desktop-ui-report.json](evidence/desktop-ui-report.json) |
| 完整 Web profile 与 gateway 路由共存 | [installed-web-host-report.json](evidence/installed-web-host-report.json) |
| 插件客户端与 stock 浏览器租约接口 | [host-browser-report.json](evidence/host-browser-report.json) |

REPL 测试覆盖 lexical state、top-level await、隔离、环境清理、异步 capability 归属、运行时错误、输出上限和死循环超时。进程单测中的 sandbox 是夹具；安装测试使用 stock DSH 的真实 subprocess / sandbox / ToolRuntime / approval。Desktop Node 模式测试另验证了权限变化时重置与 read-only 文件写入拒绝。

浏览器测试运行真实插件 React 客户端和 BrowserBroker，导入 **rc.2 未修改**的 `browser-guests.ts`、`preload-browser.ts`、`ipc.ts`。侧栏注册、连接载体由最小夹具提供，不能替代已安装 Desktop 的客户端装载验收。测试验证 DOM 填写 / 点击的页面结果、截图、跨 owner 拒绝以及释放后 webview 消失。

浏览器夹具使用已缓存 Electron 44.7.0。已安装 Desktop Node 模式测试使用 `/Applications/DeepSeek Harness.app` 中的 Electron 44.0.0、Node 24.18.1；只验证其 Node 模式和真实 DSH Host 服务，该项证据不包含 Desktop UI。原生 SDK 仅执行无提示权限查询，没有操作用户应用。

## 复现

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test

# stock DSH 的 pnpm 必须在 PATH；测试创建并删除自己的 DSH_HOME。
DSH_CLI=/absolute/path/to/dsh npm run test:install:host
DSH_CLI=/absolute/path/to/dsh \
  DSH_TEST_NODE='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' \
  npm run test:install:host

# 浏览器夹具不下载 Electron；提供已有运行时和 rc.2 源码。
DSH_SOURCE=/absolute/path/to/deepseek-harness \
  DSH_TEST_ELECTRON=/absolute/path/to/Electron \
  npm run test:host-browser
```

旧版独立 companion 的历史验证保留于 [VERIFICATION.companion.md](VERIFICATION.companion.md)，其中 PiP 结果不属于新 host 后端。

## 已安装 Desktop 实测

通过应用的插件管理器安装本地 alpha.3 bundle、启用并完全重启。真实模型调用 `cua_repl` 获得单次批准后，成功创建插件侧栏标签并返回标题 `Example Domain`；界面中可同时看到工具 Completed 和实际网页。此前 alpha.2 的两次 REPL 调用已确认变量从 `2` 持续到 `3`。未修改 Desktop 安装文件或 managed profile，host 后端未启动独立 Electron。

修复了 rc.2 的连接兼容问题：插件通过已有 Connection 的精确 Fetch 路由处理请求，与 gateway 的 `/api` 拦截器共存；没有新增监听端口。界面实测不覆盖原生输入、浏览器可信键鼠输入、全部 DOM 操作或实时 PiP。
