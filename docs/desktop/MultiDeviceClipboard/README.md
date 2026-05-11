# 多设备剪贴板

多设备剪贴板用于替代系统剪贴板并扩展跨设备同步、历史记录和来源设备展示。首版以桌面端完整闭环为目标：基于 mDNS 在局域网发现设备，配对后同步文本、图片和小文件，并通过 `Alt+V` 唤出右下角剪贴板窗口。

## 文档索引

- [requirements.md](./requirements.md)：需求范围、内容支持、显示逻辑和同步方案取舍。
- [architecture.md](./architecture.md)：Rust core、Electron 主进程、renderer 窗口和 Android/Flutter 复用边界。
- [implementation.md](./implementation.md)：本次已完成的代码变更、配置、IPC/API、数据表和已知限制。
- [verification.md](./verification.md)：已执行验证、结果、阻塞项和后续验收建议。

## 当前状态

- 已实现桌面端基础闭环：本地剪贴板采集、历史存储、右下角窗口、快捷键、设备发现、配对请求、受信任设备同步通道。
- 已将核心数据模型、历史存储、hash 去重、mDNS discovery 抽象和 NAPI/Flutter 暴露点放入 `multi_platform_core`。
- Android/Flutter 本期只完成可用路径确认，不实现完整移动端 UI 或后台剪贴板同步。

