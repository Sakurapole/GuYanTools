# 多设备剪贴板架构

## 分层原则

多设备剪贴板分为三层：

- Rust core：承载跨平台可复用逻辑，包括数据模型、SQLite 持久化、hash 去重、设备与历史服务、配对状态、同步协议结构和 mDNS discovery 抽象。
- Electron main：承载桌面平台能力，包括系统剪贴板读写、文件路径解析、资产落盘、本地 HTTP 同步服务、窗口管理和全局快捷键。
- Renderer：承载用户界面，包括右下角历史窗口、配对请求、设备标签、设置页入口。

这样划分的原因是：系统剪贴板、窗口和 Windows `FileNameW` 等能力天然属于桌面平台层；而设备、历史、hash、协议和 discovery 边界需要能被 Android/Flutter 复用。

## Rust Core

核心模块位于：

- `multi_platform_core/src/multi_device_clipboard/`
- `multi_platform_core/src/models/multi_device_clipboard.rs`
- `multi_platform_core/migrations/017_add_multi_device_clipboard.sql`

主要职责：

- `MultiDeviceClipboardManager` 提供设备、历史、hash、裁剪和 discovery 入口。
- `DiscoveryBackend` trait 隔离具体发现实现。
- 桌面默认 backend 使用 `mdns-sd` 发布/浏览 `_guyantools_clipboard._tcp.local.`。
- NAPI 通过 `JsMultiDeviceClipboardHost` 暴露给 Electron。
- Flutter 通过 `bindings/flutter.rs` 暴露基础核心函数。

## Electron Main

桌面平台适配位于：

- `desktop/src/main/multi-device-clipboard/service.ts`
- `desktop/src/main/multi-device-clipboard/ipc.ts`
- `desktop/src/main/multi-device-clipboard/window.ts`
- `desktop/src/main/shortcuts/service.ts`

主要职责：

- 轮询 Electron clipboard，采集文本、图片和文件路径。
- 图片和小文件写入 `userData/multi-device-clipboard-assets`。
- 启动本地 HTTP 服务处理配对和同步请求。
- 只向已配对/受信任设备广播同步内容。
- 注册 `Alt+V` 并打开右下角窗口。

## Renderer

UI 位于：

- `desktop/clipboard.html`
- `desktop/src/windows/clipboard/App.vue`
- `desktop/src/windows/clipboard/main.ts`
- `desktop/src/windows/main/pages/Settings.vue`

主要职责：

- 展示剪贴板历史、来源设备、内容类型、大小和时间。
- 展示局域网发现设备并发起配对。
- 展示配对请求和 6 位配对码。
- 双击记录或按回车将记录写回系统剪贴板。
- 聚焦时双击 `Esc` 关闭窗口。

## Android/Flutter 复用边界

本期不实现完整 Android/Flutter 功能，只确认复用路径：

- Rust core 类型和基础函数不依赖 Electron/Node。
- Flutter feature 在当前主机工具链下可以编译。
- Android target 检查已推进到 native SQLite 编译阶段，当前环境缺少 Android NDK compiler `aarch64-linux-android-clang`。
- 如果 Rust `mdns-sd` 在 Android 真机不可用，Android 可实现 `NsdManager` backend，并继续复用 Rust core 的设备、历史、hash、协议和配对逻辑。

Android 后续需要处理：

- 网络访问和局域网发现权限。
- 必要时获取 WiFi multicast lock。
- Android 剪贴板后台读取限制。
- 应用内手动同步/分享入口作为后台监听受限时的备选方案。

