# Android UHID 临时服务 Implementation Plan

> 目标：为 GuYanTools 生成并集成可由 ADB 临时推送执行的 Android UHID 服务，修复当前 guyanTools-uhid-service.apk 不存在且 APK 不能直接执行的问题。任务按顺序执行，每完成一个任务再停止。

## 现状与关键决策

- 当前桌面端通过 adb push 后执行 adb shell <remotePath>，因此产物必须是 Android ARM64 ELF 可执行文件，不是 APK。
- 当前仓库没有 Android UHID 服务工程，desktop/src/main/android-tools/resources/win32-x64/ 只有 .gitkeep。
- 桌面端发送 newline-delimited JSON：
  - 键盘：{"type":"keyboard","report":{"modifiers":0,"keys":[4]}}
  - 鼠标：{"type":"mouse","report":{"buttons":0,"dx":0,"dy":0,"wheel":0}}
- 服务需要打开 /dev/uhid，创建虚拟键盘和鼠标，并将报告写入 UHID。
- 服务只在当前 ADB 会话期间存在，退出时删除远程临时文件。

## 任务 1：建立 Android native service 工程

**文件：**

- 新建 android-uhid-service/CMakeLists.txt
- 新建 android-uhid-service/src/main.cpp
- 新建 android-uhid-service/README.md

**实现：**

- 使用 Android NDK + CMake，目标 ABI 为 arm64-v8a。
- 只依赖 NDK/Android libc，不引入 Activity、常驻 Service 或 APK manifest。
- 编译参数启用 C++17、PIE、strip。
- 定义稳定退出码和 stderr 错误前缀，禁止输出 serial、密钥和完整输入内容。
- host 可测试的协议解析代码与 Android UHID 设备代码分层。

- [ ] Step 1: 建立工程和 host 可测试的协议模块。

## 任务 2：实现 UHID 设备创建与销毁

**文件：**

- 修改 android-uhid-service/src/main.cpp
- 新建 android-uhid-service/src/uhid_device.h
- 新建 android-uhid-service/src/uhid_device.cpp

**实现：**

- 打开 /dev/uhid，失败时输出 UHID_OPEN_FAILED。
- 使用固定 HID descriptor 创建虚拟键盘和鼠标。
- 键盘支持修饰键和最多 6 个普通键；鼠标支持按钮、相对 X/Y 和滚轮。
- 等待 UHID_START/创建完成事件后再接受输入。
- stdin EOF、SIGTERM、UHID 设备错误都执行 UHID_DESTROY、关闭 fd 并退出。
- 不使用 root 提权、不写入持久目录。

- [x] Step 1: 完成 UHID 设备封装。
- [x] Step 2: 完成键盘/鼠标 descriptor 和销毁流程。

## 任务 3：实现 stdin JSON 协议与输入循环

**文件：**

- 新建 android-uhid-service/src/protocol.h
- 新建 android-uhid-service/src/protocol.cpp
- 修改 android-uhid-service/src/main.cpp
- 新建 host 测试

**实现：**

- 按行读取 JSON，拒绝超过 4096 字节的单行。
- 严格接受 keyboard 和 mouse 两种 type，拒绝未知字段、NaN、越界整数和非法数组长度。
- 键盘报告固定为 modifier + 6 keycodes；鼠标报告固定为 buttons + signed dx/dy + wheel。
- 每条报告写入 UHID 后继续读取，协议错误输出 UHID_PROTOCOL_ERROR 并安全退出。
- 与 desktop/src/main/android-tools/android_uhid_service.ts 的序列化结果逐字对齐。

- [x] Step 1: 完成协议解析。
- [x] Step 2: 完成输入循环和错误码。

## 任务 4：接入桌面端推送、权限和资源命名

**文件：**

- 修改 desktop/src/main/android-tools/android_uhid_service.ts
- 修改 desktop/src/main/android-tools/toolchain.ts
- 修改 desktop/src/main/android-tools/android_uhid_service.test.ts
- 修改 desktop/scripts/verify-android-input-sharing.cjs

**实现：**

- 将资源名从 guyanTools-uhid-service.apk 改为 guyanTools-uhid-service。
- adb push 后执行 adb -s <serial> shell chmod 700 <remotePath>。
- 仅允许固定远程目录 /data/local/tmp/ 和随机 UUID 文件名。
- 启动参数保持固定，不允许 renderer/plugin 传入 argv、path 或 shell 命令。
- 停止时先关闭 stdin，再杀进程并清理当前 UUID 对应的远程文件。
- 启动错误保留稳定错误码，并清理已推送文件。

- [x] Step 1: 更新资源命名和推送权限。
- [x] Step 2: 更新测试与静态门禁。

## 任务 5：构建资源同步与 Electron 打包

**文件：**

- 新建 android-uhid-service/scripts/build-android-uhid.ps1
- 修改根目录 package.json
- 修改 desktop/package.json
- 修改 desktop/electron-builder.config.cjs
- 将 Release ELF 放入 desktop/src/main/android-tools/resources/win32-x64/android-uhid-service/guyantools-uhid-service

**实现：**

- 增加显式构建命令，不在普通前端构建中隐式下载 NDK。
- 构建脚本检查 ANDROID_NDK_HOME、cmake、ninja 和目标 ABI。
- 复制前做 SHA-256 校验并生成构建清单。
- Electron extraResources 继续复制 resources 目录，安装包内路径与开发路径一致。
- 禁止提交 build、target、未剥离调试符号和临时日志。

- [x] Step 1: 完成 NDK 构建脚本。
- [x] Step 2: 完成资源同步和打包检查。

## 任务 6：真实设备验证与回归

**文件：**

- 修改 docs/superpowers/verification/2026-08-28-android-toolbox-device-matrix.md
- 新建 android-uhid-service/scripts/smoke-android-uhid.ps1

**验证场景：**

- Android 11、12、13+，仅记录系统版本、设备型号和错误码，不记录 serial。
- ADB push/chmod/启动/停止/远程清理。
- 键盘普通键、修饰键、6 键上限和释放。
- 鼠标三键、拖拽、滚轮、边界移动。
- 设备拔线、服务异常退出、桌面端紧急释放。
- /dev/uhid 权限失败时状态进入 suspended，Windows 输入恢复。
- 小米等需要额外 USB 调试安全设置的设备单独记录。

- [x] Step 1: 完成 smoke 脚本。
- [x] Step 2: 记录真实设备矩阵。
- [ ] Step 3: 完成发布前回归。

## 发布门禁

- [ ] Android native service Release ELF 已构建并纳入资源。
- [ ] 桌面端不再使用 .apk 作为可执行服务路径。
- [ ] host 协议测试通过。
- [ ] Electron UHID 测试通过。
- [ ] test:android-input、verify:android-input、TypeScript、Rust、Renderer 构建通过。
- [ ] 至少一台真实 Android ARM64 设备验证通过。
- [ ] 无常驻 Android App、无 Root 依赖、无任意 shell/argv/path 注入。
