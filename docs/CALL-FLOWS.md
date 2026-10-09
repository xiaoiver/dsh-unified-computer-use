# Host 后端详细调用图

对应 `0.2.0-alpha.4`、DSH `0.2.0-rc.2`。图中描述的是当前实现；独立实时 PiP、Playwright / CDP 和可信浏览器键鼠输入不在这条调用链中。安装与验证范围见 [README](../README.md) 和 [VERIFICATION](../VERIFICATION.md)。

## 1. 进程和组件总览

```mermaid
flowchart TB
  Model["DSH Agent / 模型"]
  subgraph Host["DSH Host：已有运行时"]
    Tool["ToolRuntime 审批 → host-plugin"]
    ReplHost["ReplHost：策略、进程、控制管道"]
    Dispatch["按 Agent 串行分发 Computer Use 操作"]
    Broker["BrowserBroker：命令及 owner 绑定"]
    Native["NativeSurface → NativeRuntime / Cua Driver"]
  end
  subgraph Worker["DSH subprocess 创建的独立进程"]
    Repl["node:repl：持久变量、顶层 await、cua API"]
  end
  subgraph Desktop["现有 DSH Desktop"]
    Client["插件客户端：侧栏、会话、标签管理"]
    Main["Desktop preload / main：浏览器租约"]
    Guest["插件创建的 sandboxed webview"]
  end
  OS["本机应用窗口 / OS 权限"]
  Model -->|"cua_repl(code)"| Tool
  Tool --> ReplHost
  ReplHost <-->|"eval / output / done；DSH control pipe"| Repl
  Repl -->|"call：结构化 native / browser 操作"| ReplHost
  ReplHost --> Dispatch
  Dispatch --> Broker
  Dispatch --> Native
  Broker <-->|"已有认证连接：poll / reply"| Client
  Client <-->|"acquire / release"| Main
  Main -.->|"绑定租约与 guest；强制权限策略"| Guest
  Client <-->|"DOM 操作 / 观察 / 显式截图"| Guest
  Native <-->|"指定 pid + windowId"| OS
```

这里仍有一个独立 **Node REPL 子进程**，但不下载或启动另一套 Electron 应用。`ReplHost` 使用 Host 的 `process.execPath`；Host 本身在 Electron 中运行时，为子进程设置 `ELECTRON_RUN_AS_NODE=1`。浏览器网页由现有 Desktop 的 guest 进程承载。原生 SDK 在 Host 侧按需加载，不在 REPL 子进程中执行。

Node 文件访问由 DSH 当前沙箱策略约束；`danger-full-access` 不做 OS 沙箱封装。REPL 可以调用 Node API，图中的结构化 `cua` 分发并不是限制所有 JavaScript 行为的安全边界。

## 2. 每个 REPL cell 的执行与回传

```mermaid
sequenceDiagram
  autonumber
  participant T as DSH ToolRuntime
  participant P as host-plugin
  participant H as ReplHost
  participant W as REPL worker
  participant D as native / browser dispatcher
  T->>T: 由 DSH 工具策略决定 allow / ask / deny
  T->>P: cua_repl(code, timeout_ms)，携带精确 Agent 和取消信号
  P->>P: 校验 Agent 存活、无并发 cell；解析当前 sandboxPolicy
  Note over P,H: 已有进程失效或策略变化：释放旧 owner，返回重置提示；本次不执行代码
  P->>H: 创建或复用该 Agent 的解释器
  opt 首次调用
    H->>H: fs 映射 worker 路径；解析现有可执行文件；sandbox.confine
    H->>W: subprocess.spawn；清理环境；提供 control pipe
    W-->>H: ready
  end
  H->>W: eval(id, code)
  W->>W: node:repl 求值；保留 lexical state 和顶层 await
  W->>H: call(id, seq, surface, operation)
  H->>H: 校验 schema、当前 evaluation、调用上限
  H->>D: 按 Agent 队列串行执行；传递取消信号
  D-->>H: Result 或可读错误
  H-->>W: reply(seq, result / error)
  W-->>H: output：nodeRepl.write / emitImage
  W->>W: 关闭新 capability 准入，等待已接纳的操作结束
  W-->>H: done(id, value / error)
  H-->>P: Result：文本、图片及 isError
  P->>P: 原生观察 token 失效；启动空闲回收计时
  P-->>T: 工具结果回到模型
```

默认 cell 时限 30 秒，可通过 `timeout_ms` 配置至 120 秒。普通语法 / 求值错误返回 `isError`，已建立的变量可继续使用；进程取消、超时、协议错误或输出超限会关闭解释器。每个 cell 最多 16 个未完成 capability 调用、累计最多 256 个；协议帧及累计输出受 4 MiB 上限约束。旧异步回调不能在后续 cell 中继续调用 `cua`。

## 3. 浏览器：从创建标签到读取网页

```mermaid
sequenceDiagram
  autonumber
  participant W as REPL / Host 分发
  participant B as BrowserBroker
  participant C as Desktop 插件客户端
  participant M as Desktop preload / main
  participant V as 新建 webview
  W->>B: open(url)，携带 owner、session、workspace、signal
  B->>B: 保存命令 id 与 deadline
  C->>B: poll(client UUID, 当前 mounted session)
  B->>B: 匹配 session；owner 绑定一个 client；每次派发一个命令
  B-->>C: commands 和该 client 的存活 owners
  C->>C: 校验 owner / deadline / URL；打开并等待侧栏挂载
  C->>M: browser.acquire(workspace)
  M-->>C: lease + partition
  C->>V: 设置 partition，src = about:blank#lease；附加到侧栏
  M->>M: 租约匹配 guest / 主窗口；施加 sandbox 与权限策略
  V-->>C: dom-ready
  C->>V: loadURL(url)
  C->>V: executeJavaScript：标题、URL、正文、元素 ref
  V-->>C: 页面观察结果
  C->>B: reply(client UUID, command id, result)
  B->>B: 校验待完成命令及其 client；忽略不匹配或迟到回复
  B-->>W: Result；创建持久 tab 对象并输出初次观察
  W->>B: tab.getState() 发起下一条 observe 命令
```

客户端通过 `connection.rpc.call('/api', 'unified-cua/poll', ...)` 和 `reply` 使用 DSH 现有连接；Host 注册 `/api/unified-cua/poll`、`/api/unified-cua/reply` 精确 Fetch 路由，与 rc.2 gateway 的 `/api` 拦截器共存。客户端必须运行在受信任的 `dsh-app://app` 页面且具有 `dshDesktop` bridge。没有额外 HTTP 服务或监听端口。

`poll` 是命令及 owner 状态轮询，Host 每次等待约 500 ms；**不是截图轮询，也不是视频流**。操作的客户端 deadline 当前固定为分发时起 30 秒，外层 cell 也有自己的超时；扩大 cell 时限不会扩大浏览器命令 deadline。

后续 `navigate / click / fill / scroll / observe / close` 复用同一分发路径。每个 target 必须归属于当前 owner。点击和填写只接受当前观察产生的 ref；导航会令 ref 失效。`click / fill` 通过 DOM 执行，随后返回新观察；密码和文件字段要求手动操作。截图只在显式请求时调用 `capturePage()`。`press` 当前直接返回不支持的错误。

## 4. 原生应用：观察、校验和输入

```mermaid
sequenceDiagram
  autonumber
  participant W as REPL / Host 分发
  participant S as NativeSurface
  participant R as NativeRuntime / Cua Driver
  participant O as OS / 原生窗口
  W->>S: apps / windows：发现 pid 和 windowId
  S->>R: list_apps / list_windows
  R->>O: 查询可访问的应用与窗口
  O-->>W: 结果沿调用链回传
  W->>S: getApp({pid, windowId}) → select
  S->>R: 验证进程身份、窗口归属；创建 owner 内 target
  S->>R: get_window_state：AX tree，可选 screenshot
  R->>O: 读取指定窗口
  O-->>S: pid、windowId、elements、可选图片
  S->>S: 再校验身份；记录可用 token / secure token / screenshot 状态
  S-->>W: 观察结果与 target
  W->>S: app.act(tool, args)
  S->>S: 验证身份、当前观察、参数白名单、token 或截图坐标
  S->>R: 强制指定 session、pid、window_id；适用操作使用 background delivery
  R->>O: 执行输入，受系统权限限制
  O-->>W: 输入结果沿调用链回传
  Note over W,S: 输入消耗观察资格；下次输入前重新 getState，操作后观察验证
```

每次 cell 结束也会使原生观察 token 失效，即使 `app` 对象仍保存在 REPL 中。窗口身份改变时撤销 target，不自动选择别的窗口。原生 `app.close()` 只释放插件目标句柄，不退出用户应用；浏览器 `tab.close()` 则会移除本插件创建的 guest 并释放租约。

原生 SDK 的权限查询已在真实 Host 验证；此 alpha 的原生输入还没有在已安装 Desktop 中逐项验收。图中表示已实现的调用路径，不代表每种动作都已经完成实际 UI 验收。

## 5. 取消、重置与释放

```mermaid
flowchart TD
  Cancel["cell 取消 / 超时 / 进程或协议故障"] --> Release["host-plugin.release：移除 Agent owner，清理计时器"]
  Reset["cua_repl_reset / 空闲到期 / Agent 或插件销毁"] --> Release
  Policy["新调用发现策略变化或旧进程失效"] --> Release
  Release --> Broker["BrowserBroker.release：移除 owner，拒绝待完成命令"]
  Release --> Worker["ReplHost.dispose：关闭管道，终止并等待子进程"]
  Worker --> Native["NativeSurface.dispose → SDK end_session / shutdown"]
  Broker --> Poll["客户端后续 poll 发现 owner 消失"]
  Poll --> Guest["移除 guest；browser.release(lease)"]
  Unmount["侧栏 Body 卸载"] --> Guest
  Guest --> End["变量和目标不再可用；已产生的网页 / 文件效果不撤销"]
  Native --> End
```

浏览器清理由客户端异步跟进，不意味着 Host 返回错误时所有 guest 已同步消失。客户端断开会尝试释放其持有的目标；Desktop 自身也管理窗口与租约生命周期。取消后不会自动重放输入。普通 cell 求值错误与上述“解释器故障”不同，不必然触发整套释放。

## 6. 源码入口与验证映射

| 职责 | 源码 | 验证 |
| --- | --- | --- |
| 后端选择、工具注册、Agent 生命周期及策略 | [index.ts](../src/index.ts)、[host-plugin.ts](../src/host-plugin.ts) | stock 安装测试、Desktop 审批 |
| 进程启动、控制协议、持久解释器 | [repl-host.ts](../src/repl-host.ts)、[repl-channel.ts](../src/repl-channel.ts)、[repl-worker.ts](../src/repl-worker.ts) | 真实进程测试、沙箱写入拒绝、Desktop 跨调用变量 |
| 命令路由、session / owner / client 绑定 | [browser-broker.ts](../src/browser-broker.ts) | 真实 Connection 服务路由测试、完整 Web profile |
| 侧栏、租约、DOM 观察及输入 | [client.ts](../src/client.ts) | stock browser fixture；Desktop 打开及读取标题 |
| 原生 target 校验、SDK 调用 | [native.ts](../src/native.ts) | 参数与观察约束测试、真实 Host 无提示权限查询 |

当前代码和安装包不再包含独立 Electron / PiP 链路；实时画中画仍需验证或新增合适的 Desktop 宿主接口。


## 7. Desktop 插件配置保存与动态生效（alpha.5）

```mermaid
sequenceDiagram
  actor User as 用户
  participant Page as 插件详情 / SettingsPanel
  participant Form as DSH ConfigForms
  participant Settings as Host Settings service
  participant Disk as 当前 profile 的用户配置
  participant Refs as Cordis volatile 引用
  participant Tool as cua_repl / NativeSurface
  Page->>Form: get(unified-computer-use) / subscribe
  Form->>Settings: describe / 配置变化订阅
  Settings-->>Form: schema + value + revision
  Form-->>Page: 当前设置快照
  User->>Page: 修改原生开关 / 高级设置并保存
  Page->>Page: 校验数值 / 秒转毫秒
  Page->>Form: mutate(四项修改, 编辑开始时的 revision)
  Form->>Settings: settings.mutate
  alt revision 过期或字段无效
    Settings-->>Page: 拒绝 / 显示错误，保留草稿
  else 接受修改
    Settings->>Disk: 持久化用户配置
    Settings->>Refs: 更新动态字段引用
    Settings-->>Form: 新 revision / value
    Form-->>Page: 保存成功
  end
  Tool->>Refs: get() 读取当前配置
  Note over Refs,Tool: 原生开关与数量上限在操作时读取<br/>调用开始确定超时；调用结束安排空闲清理
```

客户端从 Desktop 已加载的 `@deepseek-ai/dsh-client-ui-primitives` 复用 `SettingsForm`、`SettingsValueField` 和 `Switch`，构建将它声明为 external，不复制另一套 React 或控件样式。

设置词典通过 `ctx.locale.register` 注册中英文，插槽声明 `locale`，由 DSH renderer 注入响应语言切换的 `t`。字段、校验和保存结果都在渲染时翻译；没有恢复默认或重新载入按钮，过期 revision 仍拒绝写入，用户重新打开页面后读取最新配置。

插件以 npm 包名 `dsh-unified-computer-use` 注册到 `plugins.bundle.config` 详情插槽，以 Loader entry id `unified-computer-use` 访问 Host 配置。四个字段都声明为 `.volatile()`；Host 直接接收这些引用，以 `.get()` 读取，避免复制配置或保存后重建整个 REPL。插件没有额外的审批中间件；allow / ask / deny 完全由 DSH 工具运行时处理。

源码：[配置表单](../src/settings-client.ts)、[输入校验](../src/settings-model.ts)、[配置 schema](../src/index.ts)、[执行侧读取](../src/host-plugin.ts)。隔离 profile 的 [stock DSH 验收](../test/installed-settings.mjs) 覆盖 DSH 的允许 / 审批 / 拒绝、状态保留、原生禁用、冲突拒绝、策略拒绝和重启持久化。
