# 多设备剪贴板实现记录

## 已完成代码变更

### Rust Core

- 新增 `mdns-sd` 依赖。
- 新增迁移 `017_add_multi_device_clipboard.sql`：
  - `multi_device_clipboard_devices`
  - `multi_device_clipboard_items`
- 新增模型：
  - `MultiDeviceClipboardDevice`
  - `MultiDeviceClipboardItem`
  - `MultiDeviceClipboardDiscoveryConfig`
  - `MultiDeviceClipboardDiscoveredDevice`
  - `MultiDeviceClipboardEvent`
- 新增 `MultiDeviceClipboardManager`：
  - 本机设备创建/更新。
  - 已发现设备缓存。
  - 已配对设备持久化。
  - 历史记录 CRUD。
  - `sourceDeviceId + contentHash` 去重。
  - 历史数量裁剪。
  - content hash 计算。
- 新增 `DiscoveryBackend` trait 和桌面 mDNS backend。
- 新增 NAPI host `JsMultiDeviceClipboardHost`。
- 在 Flutter binding 中暴露基础复用函数。

### Electron Main

- 新增 `multiDeviceClipboardService`：
  - 初始化 Rust host。
  - 启动/停止 mDNS discovery。
  - 启动本地 HTTP 同步服务。
  - 轮询系统剪贴板。
  - 捕获文本、图片、文件。
  - 写回系统剪贴板。
  - 处理配对请求和配对确认。
  - 向受信任设备广播同步 item。
- 新增 IPC：
  - `multi-device-clipboard:list-items`
  - `multi-device-clipboard:apply-item`
  - `multi-device-clipboard:delete-item`
  - `multi-device-clipboard:clear-history`
  - `multi-device-clipboard:list-devices`
  - `multi-device-clipboard:list-discovered-devices`
  - `multi-device-clipboard:list-pairing-requests`
  - `multi-device-clipboard:start-pairing`
  - `multi-device-clipboard:approve-pairing`
  - `multi-device-clipboard:reject-pairing`
  - `multi-device-clipboard:forget-device`
  - `multi-device-clipboard:show-window`
  - `multi-device-clipboard:close-window`
- 新增 preload API：`window.multiDeviceClipboardApi`。
- 扩展全局快捷键服务，支持 `toggleMultiDeviceClipboard`。

### Renderer/UI

- 新增独立入口 `clipboard.html`。
- 新增右下角窗口 Vue app：
  - 历史列表。
  - 图片缩略图。
  - 文件/文本摘要。
  - 来源设备标签。
  - 发现设备 chip。
  - 配对请求卡片。
  - 双击应用内容。
  - 双击 `Esc` 关闭。
- 设置页新增“多设备剪贴板”标签页。
- 快捷键设置新增“多设备剪贴板”系统快捷键。

## 当前限制

- 首版配对机制是短码确认和本地信任列表，尚未实现完整端到端加密和公钥签名校验。
- mDNS 只负责发现，数据同步使用本地 HTTP 服务。
- 剪贴板监听采用轮询，后续可按平台替换为更原生的事件机制。
- 文件同步当前适合小文件；1GB 上限是配置硬约束，但还没有断点续传、进度、重试和冲突恢复。
- 多实例/多设备 E2E 需要真实局域网设备进一步验收。
- WebDAV 和主同步设备方案尚未实现。

## 后续建议

- 将配对升级为持久公钥身份和请求签名。
- 为同步 payload 增加版本号、能力协商和错误码。
- 给大文件同步增加进度、取消、断点续传和失败重试。
- 增加搜索、置顶、收藏、类型过滤等多设备剪贴板高级能力。
- Android 端优先实现应用内手动发送/接收，再评估后台剪贴板监听。

