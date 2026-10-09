# 验证记录

2026-10-09。当前源码 0.2.0-alpha.5，macOS arm64，DSH 0.2.0-rc.2。没有使用本地 DSH 工作树中的旧补丁。

| 检查 | 结果 / 证据 |
| --- | --- |
| TypeScript、构建、14 项单元及进程测试 | [host-unit-tests.txt](evidence/host-unit-tests.txt) |
| alpha.5 已安装 Desktop 设置页 | [desktop-settings-report.json](evidence/desktop-settings-report.json) |
| alpha.5 设置动态生效与重启持久化 | [settings-report.json](evidence/settings-report.json) |
| alpha.4 安装包产物及依赖清理（历史证据） | [host-package-report.json](evidence/host-package-report.json) |
| alpha.3 公开 GitHub 分支直接安装及 REPL（历史证据） | [installed-github-host-report.json](evidence/installed-github-host-report.json) |
| 普通 Node 下 stock DSH 安装及 REPL | [installed-host-report.json](evidence/installed-host-report.json) |
| 已安装 Desktop 的 Node 模式运行 stock DSH 安装测试 | [installed-electron-host-report.json](evidence/installed-electron-host-report.json) |
| alpha.2 / alpha.3 已安装 Desktop UI（历史证据） | [desktop-ui-report.json](evidence/desktop-ui-report.json) |
| 完整 Web profile 与 gateway 路由共存 | [installed-web-host-report.json](evidence/installed-web-host-report.json) |
| 插件客户端与 stock 浏览器租约接口 | [host-browser-report.json](evidence/host-browser-report.json) |

REPL 测试覆盖 lexical state、top-level await、隔离、环境清理、异步 capability 归属、运行时错误、输出上限和死循环超时。进程单测中的 sandbox 是夹具；安装测试使用 stock DSH 的真实 subprocess / sandbox / ToolRuntime / approval。Desktop Node 模式测试另验证了权限变化时重置与 read-only 文件写入拒绝。

浏览器测试运行真实插件 React 客户端和 BrowserBroker，导入 **rc.2 未修改**的 `browser-guests.ts`、`preload-browser.ts`、`ipc.ts`。侧栏注册、连接载体由最小夹具提供；设置入口在此浏览器专用夹具中排除，设置 UI 另行验证，不能替代已安装 Desktop 的客户端装载验收。测试验证 DOM 填写 / 点击的页面结果、截图、跨 owner 拒绝以及释放后 webview 消失。

浏览器夹具使用已缓存 Electron 44.7.0。已安装 Desktop Node 模式测试使用 `/Applications/DeepSeek Harness.app` 中的 Electron 44.0.0、Node 24.18.1；只验证其 Node 模式和真实 DSH Host 服务，该项证据不包含 Desktop UI。原生 SDK 仅执行无提示权限查询，没有操作用户应用。

## 复现

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test

# stock DSH 的 pnpm 必须在 PATH；测试创建并删除自己的 DSH_HOME。
DSH_CLI=/absolute/path/to/dsh npm run test:install
DSH_CLI=/absolute/path/to/dsh npm run test:settings
DSH_CLI=/absolute/path/to/dsh \
  DSH_TEST_NODE='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' \
  npm run test:install

# 浏览器夹具不下载 Electron；提供已有运行时和 rc.2 源码。
DSH_SOURCE=/absolute/path/to/deepseek-harness \
  DSH_TEST_ELECTRON=/absolute/path/to/Electron \
  npm run test:host-browser
```

## alpha.2 / alpha.3 已安装 Desktop 实测（历史证据）

通过应用的插件管理器安装本地 alpha.3 bundle、启用并完全重启。真实模型调用 `cua_repl` 获得单次批准后，成功创建插件侧栏标签并返回标题 `Example Domain`；界面中可同时看到工具 Completed 和实际网页。此前 alpha.2 的两次 REPL 调用已确认变量从 `2` 持续到 `3`。未修改 Desktop 安装文件或 managed profile，host 后端未启动独立 Electron。

修复了 rc.2 的连接兼容问题：插件通过已有 Connection 的精确 Fetch 路由处理请求，与 gateway 的 `/api` 拦截器共存；没有新增监听端口。界面实测不覆盖原生输入、浏览器可信键鼠输入、全部 DOM 操作或实时 PiP。

## alpha.4 清理范围

移除旧工具、配置选择、Electron 下载器、独立浏览器 / PiP 代码及产物，原生 Surface 也不再保留预览回调。保留的测试覆盖持久 REPL、浏览器路由、原生输入约束和错误信息；旧 companion 专属测试与证据已删除，不以它们计入当前通过数量。

重新执行当前 bundle 的 stock DSH 安装、真实沙箱、已安装 Desktop 可执行文件的 Node 模式测试及 stock 浏览器夹具。Desktop UI 历史证据明确保留版本，不宣称已对 alpha.4 重新执行全部 UI 验收。


## alpha.5 插件设置

新增插件详情表单：审批模式、原生开关，以及超时、空闲释放、原生目标数量上限。动态字段通过 DSH Settings / Cordis volatile 引用读取，保存不重建 REPL。隔离的 stock Web profile 测试验证 `ask → inherit → ask`、REPL 变量保留、原生禁用、DSH 拒绝保留、过期 revision 和无效字段拒绝，以及整个 Host 重启后恢复设置。两项新增单测验证秒与毫秒转换精度及非法输入。

当前源码同时通过 stock CLI 安装、已安装 Desktop 可执行文件的 Node 模式安装、stock 浏览器夹具测试。alpha.4 已发布标签和安装包保持不变；alpha.5 尚未发布。

Desktop 实测通过插件管理器安装并启用本地 alpha.5 bundle，完全重启后加载宿主共享 `ui-primitives` 的设置表单、分段选择、Switch 和高级输入框。审批保持 `ask`；在界面将调用时限从 30 秒改为 31 秒并保存，完全重启后确认仍为 31 秒，随后恢复 30 秒。未修改 Desktop 安装文件或 managed profile。
