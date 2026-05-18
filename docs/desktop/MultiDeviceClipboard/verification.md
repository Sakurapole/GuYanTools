# 多设备剪贴板验证记录

## 已执行验证

- `cargo test --manifest-path multi_platform_core/Cargo.toml`
  - 通过。
  - 覆盖新增 history/device 基础存储和 content hash 稳定性测试。
- `cargo check --manifest-path multi_platform_core/Cargo.toml --features flutter`
  - 通过。
  - 证明新增 core 类型和 Flutter feature 在当前主机工具链下可编译。
- `rustup target add aarch64-linux-android`
  - 通过。
- `cargo check --manifest-path multi_platform_core/Cargo.toml --target aarch64-linux-android --features flutter`
  - 未通过，阻塞在环境缺少 Android NDK compiler `aarch64-linux-android-clang`。
  - 失败点来自 `libsqlite3-sys` native build，不是新增多设备剪贴板代码直接依赖 Electron/Node。
- `pnpm --dir desktop run lint`
  - 通过，当前仅剩仓库既有 `fs-extra` import warning。
- `pnpm --dir desktop exec tsc --noEmit`
  - 通过。
- `pnpm --dir desktop run build:app`
  - 通过。
- `pnpm --dir multi_platform_core build:debug`
  - Rust/NAPI 编译完成，但复制 `.node` artifact 时失败。
  - 原因是当前运行中的 GuYanTools/Electron 进程锁定了 `multi-platform-core.win32-x64-msvc.node`。

## 待补验收

- 两台桌面设备在同一局域网内发现彼此。
- 发起配对后另一端收到配对请求和 6 位配对码。
- 批准配对后文本同步成功。
- 图片同步成功并能在历史窗口显示缩略图。
- 小文件同步成功，超限文件只进入本机历史。
- `Alt+V` 在 Windows 上唤出右下角窗口，位置贴近任务栏上方。
- 窗口聚焦时双击 `Esc` 关闭。
- 双击历史项后内容写回系统剪贴板。

## Android/Flutter 后续验证

- 安装 Android NDK 后重新执行：

```powershell
cargo check --manifest-path multi_platform_core\Cargo.toml --target aarch64-linux-android --features flutter
```

- 在 Flutter 工程中执行 flutter_rust_bridge codegen dry run，确认新增类型可生成 Dart binding。
- 真机验证 Rust `mdns-sd` backend；如不稳定，改走 Android `NsdManager` backend。

