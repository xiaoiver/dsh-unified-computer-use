# DSH Unified Computer Use

让 DSH 助手打开、阅读和操作网页，也能查看和操作本机应用。浏览器使用本机已安装的 **Google Chrome**，在独立窗口中运行。**官方 DSH Desktop 无需补丁，不额外下载 Electron 或浏览器运行时。**

预览版 · MIT。当前版本 **0.2.0-alpha.6**。

## 安装

已测试：**DSH 0.2.0-rc.2、macOS Apple Silicon、Google Chrome 155**。

在 DSH Desktop「插件 → 添加插件」中输入：

```text
github:xiaoiver/dsh-unified-computer-use#v0.2.0-alpha.6
```

安装并启用，然后完全退出并重新打开 Desktop。也可从 [Pre-release](https://github.com/xiaoiver/dsh-unified-computer-use/releases/tag/v0.2.0-alpha.6) 下载 `.tgz` 和校验文件，在同一页面填写安装包的绝对路径。

当前源码新增了权限设置流程，尚未包含在上述已发布的 alpha.6 安装包中；可按开发文档本地构建安装。启用后，插件管理器会提供「设置权限」引导。也可在插件详情页的「macOS 系统权限」中提前检测并授权辅助功能、屏幕录制，无需先让助手执行原生任务。仅使用 Chrome 网页操作时可跳过。

请通过 Desktop 插件页面安装，不要用 CLI 修改 Desktop 的插件配置。已发布版本及固定安装包见 [Releases](https://github.com/xiaoiver/dsh-unified-computer-use/releases)。

## 使用

打开一个会话，直接告诉助手要做什么，例如：

> 打开 example.com，告诉我网页标题。

> 总结刚才打开的网页。

> 查看已打开的计算器窗口，告诉我显示的结果。

无需指定工具名或编写代码。首次网页操作会打开独立 Chrome 窗口；它使用临时配置，不会复用你日常 Chrome 的登录状态或标签。重置、调用超时或长时间空闲会关闭这些窗口。若 DSH 要求确认，按提示批准。

操作本机应用前，可在插件设置中点击「授权所需权限」。打开页面只查询状态，点击按钮后才申请；曾拒绝的权限可用「打开系统设置」手动开启。返回插件窗口后会自动更新状态。若 macOS 提示重启，请完全退出并重新打开 DSH。权限由运行原生驱动的 Host 进程申请，远程 Host 的授权应在 Host 所在机器完成。

## 设置

在插件详情页可调整：

- **原生应用操作**：关闭后仅保留 Chrome 网页操作。
- **macOS 系统权限**：检测辅助功能、屏幕录制状态，主动申请或打开对应系统隐私设置。原生应用操作关闭时，先开启并保存，状态会自动更新，再申请权限。
- **高级设置**：调用超时、空闲释放时间、原生目标数量上限。

点击「保存」后对后续操作生效，无需重启。是否需要手动确认由 DSH 的工具审批策略统一管理。

## 当前限制

- 只操作本插件创建的 Chrome 标签；暂不接管已有浏览器窗口。
- 暂不提供文件上传、下载功能。系统权限必须由用户确认，插件不能自动授予。
- 暂无 Desktop 内嵌浏览器及独立实时画中画。

## 开发与验证

- [本地构建、CLI 安装及配置字段](docs/DEVELOPMENT.md)
- [通用 API](docs/CUA-API.md) · [浏览器 API](docs/BROWSER-API.md)
- [架构与详细调用图](docs/CALL-FLOWS.md)
- [测试与验证记录](VERIFICATION.md)
