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

浏览器测试运行真实插件 React 客户端和 BrowserBroker，导入 **rc.2 未修改**的 `browser-guests.ts`、`preload-browser.ts`、`ipc.ts`。侧栏注册、连接载体及 locale 服务由最小夹具提供；设置入口在此浏览器专用夹具中排除，设置 UI 另行验证，不能替代已安装 Desktop 的客户端装载验收。测试验证 DOM 填写 / 点击的页面结果、截图、跨 owner 拒绝以及释放后 webview 消失。

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

新增插件详情表单：原生开关，以及超时、空闲释放、原生目标数量上限。插件级审批配置及额外中间件已删除，工具审批统一由 DSH 管理。动态字段通过 DSH Settings / Cordis volatile 引用读取，保存不重建 REPL。隔离的 stock Web profile 测试验证 DSH 的 allow 无额外确认、ask 触发确认、deny 拒绝，以及 REPL 变量保留、原生禁用、DSH 拒绝保留、过期 revision 和无效字段拒绝，以及整个 Host 重启后恢复设置。两项新增单测验证秒与毫秒转换精度及非法输入。

当前源码同时通过 stock CLI 安装、已安装 Desktop 可执行文件的 Node 模式安装、stock 浏览器夹具测试。alpha.4 已发布标签和安装包保持不变；alpha.5 尚未发布。

早期 alpha.5 设置页实测（删除插件级审批之前）：通过插件管理器安装并启用本地 alpha.5 bundle，完全重启后加载宿主共享 `ui-primitives` 的设置表单、分段选择、Switch 和高级输入框。审批保持 `ask`；在界面将调用时限从 30 秒改为 31 秒并保存，完全重启后确认仍为 31 秒，随后恢复 30 秒。未修改 Desktop 安装文件或 managed profile。

设置页的中英文词典按官方插件方式注册到 DSH locale 服务，插槽按当前语言注入翻译函数。保存结果存储词典 key，在渲染时翻译。恢复默认与重新载入按钮均不再显示；并发冲突保留草稿，提示重新打开插件页面。

国际化更新包（删除插件级审批之前）已在英文 Desktop 中重装验证：五项字段、说明、Save 和无效数值提示均为英文，编辑草稿时没有恢复或重新载入按钮。离开并重开后恢复已保存的 30 秒。中文词典由同一组 key 进行类型检查，本轮未改变用户的语言偏好。

删除审批配置后的当前 bundle 通过 stock DSH 设置验收：四项字段、动态生效、状态保留、宿主 allow / ask / deny 行为及重启持久化。Desktop UI 的上述记录保留为早期 alpha.5 证据，不作为当前四项表单的重新安装记录。

## 浏览器工具栏样式

浏览器外框使用 DSH 的主题变量，包含紧凑标签、内嵌关闭按钮、可选择复制的只读地址栏及中英文空状态。网页内容独立渲染，主题样式只作用于插件外框。

真实 Electron 浏览器夹具加载 stock DSH 的主题 CSS，验证亮色与深色、320px 窄侧栏、长标题截断、切换标签保留同一 webview 和页面输入、关闭活动与非活动标签、键盘焦点恢复、切换语言保留地址选择，以及释放后的空状态。截图另行检查。该项仍是隔离夹具验证，未替代已安装 Desktop 的整包更新验证。
