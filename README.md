# DSH Unified Computer Use

让 DSH 助手在内置浏览器中打开、阅读和操作网页，也能查看和操作本机应用。直接使用现有 DSH Desktop，**无需额外下载 Electron 或修改 DSH**。

预览版 · MIT。已发布 **0.2.0-alpha.4**；当前源码为 **alpha.5（尚未发布）**。

## 安装

已测试：**DSH 0.2.0-rc.2、macOS Apple Silicon**。

在 DSH Desktop 的「插件 → 添加插件」中输入：

```text
github:xiaoiver/dsh-unified-computer-use#v0.2.0-alpha.4
```

安装并启用，然后完全退出并重新打开 Desktop。请通过 Desktop 插件页面安装，不要用 CLI 修改 Desktop 的插件配置。

也可从 [Pre-release](https://github.com/xiaoiver/dsh-unified-computer-use/releases/tag/v0.2.0-alpha.4) 下载 `.tgz`，在同一页面填写安装包的绝对路径。发布页同时提供校验文件。

## 使用

打开一个会话，直接告诉助手要做什么，例如：

> 打开 example.com，告诉我网页标题。

> 总结刚才打开的网页。

> 查看已打开的计算器窗口，告诉我显示的结果。

无需指定工具名或编写代码。浏览器任务会自动打开右侧 Computer Use 面板；执行时保持当前会话可见。若 DSH 要求确认，按提示批准。

操作本机应用时，需要按需为运行 DSH 的应用授予 macOS 辅助功能、屏幕录制权限。

## 设置

**设置页面在当前 alpha.5 源码中提供，已发布的 alpha.4 尚不包含。**

在插件详情页可调整：

- **原生应用操作**：关闭后仅保留内置浏览器。
- **高级设置**：调用超时、空闲释放时间、原生目标数量上限。

点击「保存」后对后续操作生效，无需重启。是否需要手动确认由 DSH 的工具审批策略统一管理。

## 当前限制

- 内置浏览器仅在 DSH Desktop 中可用，只操作本插件创建的标签。
- 网页操作支持读取、点击、填写与滚动；部分需要真实键鼠事件的页面操作暂不支持，密码和文件上传请手动处理。
- 暂无现有外部浏览器标签接管及独立实时画中画。

## 开发与验证

- [本地构建、CLI 安装及配置字段](docs/DEVELOPMENT.md)
- [通用 API](docs/CUA-API.md) · [浏览器 API](docs/BROWSER-API.md)
- [架构与详细调用图](docs/CALL-FLOWS.md)
- [测试与验证记录](VERIFICATION.md)
