# GuYanTools Android 工具箱设计规格

日期：2026-08-28

状态：设计已确认，待实施

## 1. 背景与目标

GuYanTools 需要提供类似 Android 工具箱的桌面能力，依托 ADB、scrcpy 和 fastboot，并允许受信任的插件调用稳定的高层级能力。本期聚焦有线连接：共享 PC 键盘鼠标到 Android 设备，以及将 Android 设备音频转发到电脑播放。

目标是新增一个由 Electron 主进程统一管理的 Android 工具领域：内置并校验工具链、发现设备、管理 scrcpy 会话、暴露 typed IPC 和插件 API，并在设备断开、插件卸载、应用退出时可靠清理进程。主进程编排使用 TypeScript；Rust `multi_platform_core` 不承载 ADB/scrcpy/fastboot 子进程管理，除非后续需要实现底层协议、实时音频解码或跨客户端设备服务。

## 2. 范围

### 2.1 本期包含

1. Windows x64 内置 ADB、scrcpy、fastboot 及其运行时依赖。
2. 工具路径、版本、SHA-256 和 scrcpy client/server 匹配检查。
3. ADB 设备列表、授权状态、设备属性和 `track-devices` 热插拔事件。
4. scrcpy 镜像/控制会话，默认优先 UHID 键盘鼠标，失败时可回退 SDK。
5. scrcpy 音频-only 会话，支持 Android 11+；Android 13+ 可选 `audio-dup`。
6. OTG 控制模式的显式能力说明：仅键鼠，不提供镜像和音频。
7. fastboot 只读能力：设备发现、getvar、slot、reboot；写操作只预留安全边界，不在本期默认开放。
8. typed preload/IPC 契约和插件 `android` facade。
9. 插件权限、会话归属、生命周期回收、事件订阅和任务记录。
10. Windows 设备矩阵和工具链诊断验收。

### 2.2 非目标

- 不重写 ADB、scrcpy 或 fastboot 协议。
- 不将 scrcpy SDL 原生窗口嵌入 Electron 主窗口；第一版使用独立 scrcpy 窗口。
- 不向 sandboxed 插件暴露任意 shell、任意本地进程或任意 ADB 参数。
- 不在本期向插件提供实时 PCM/Opus 音频流、混音、虚拟声卡或录音接口。
- 不在本期实现 fastboot flash、erase、unlock 等写操作。
- 不把 OTG 当作音频或镜像链路；OTG 与 ADB/scrcpy 会话分开管理。
- 不把这套能力迁移到 Rust 或 Flutter。

## 3. 上游与版本策略

- scrcpy 固定一个经过验证的官方 release；设计评估时官方最新 release 为 4.1，本机现有版本为 3.3.1，实施前必须选择并锁定实际发布版本。
- ADB/fastboot 使用同一版本的 Android Platform Tools，随应用发布，不依赖用户 PATH。
- scrcpy client、`scrcpy-server` 和随附 SDL/FFmpeg/libusb DLL 必须来自同一发行包或经过兼容性验证的组合。
- 发布包保留 Apache License 2.0、Android Platform Tools NOTICE 和各随附动态库许可证。
- 应用启动时返回工具链诊断，不在线静默下载或替换生产工具。

## 4. 总体架构

```text
Vue Renderer
    |
    | typed preload API
    v
Electron Main
    |
    +-- AndroidToolchainManager
    |     +-- adb
    |     +-- fastboot
    |     +-- scrcpy
    |     +-- scrcpy-server
    |
    +-- AdbDeviceManager
    +-- ScrcpySessionManager
    +-- FastbootManager
    +-- Android IPC handlers
    +-- Plugin Android Host API
```

### 4.1 责任边界

- `AndroidToolchainManager`：按平台架构定位可执行文件，校验版本、摘要、依赖和 server/client 匹配。
- `AdbDeviceManager`：启动/复用受控 ADB server，解析 `adb devices -l`，监听 `track-devices`，查询属性并标准化错误。
- `ScrcpySessionManager`：创建、记录、停止和回收镜像、音频-only、OTG 会话；所有会话绑定 device serial 和 owner。
- `FastbootManager`：只接受结构化只读/重启请求，确认 bootloader 状态并执行固定参数命令。
- Renderer：展示设备、会话、错误和操作按钮，不访问 Node/Electron/数据库。
- Plugin Host：通过 sender context + permission guard 调用高层服务，插件不得传入任意可执行路径或命令。

### 4.2 子进程规则

所有进程调用使用固定绝对路径、参数数组、`shell: false`、`windowsHide: true`，并设置超时、取消和独立进程组。stdout/stderr 只作为结构化诊断和有限日志；退出、设备断开、窗口关闭、插件禁用/卸载和应用退出都必须触发清理。

## 5. 工具链打包

生产资源由 Electron Forge/Builder 复制到 `resources/android-tools/<platform>-<arch>/`，开发环境允许从仓库工具目录读取。建议结构：

```text
android-tools/
  win32-x64/
    platform-tools/adb.exe
    platform-tools/fastboot.exe
    platform-tools/AdbWinApi.dll
    platform-tools/AdbWinUsbApi.dll
    scrcpy/scrcpy.exe
    scrcpy/scrcpy-server
    scrcpy/SDL2.dll
    scrcpy/av*.dll
    scrcpy/libusb-1.0.dll
```

工具路径不得从 renderer 或插件传入。用户可查看版本和校验结果，但不能替换生产内置文件；开发模式可提供显式的本地工具路径覆盖以便调试。

## 6. 设备与会话模型

```ts
type AndroidTransport = 'adb-usb' | 'adb-tcpip' | 'fastboot-usb';
type AndroidDeviceState = 'device' | 'unauthorized' | 'offline' | 'bootloader' | 'no-permissions' | 'unknown';

interface AndroidToolchainStatus {
  available: boolean;
  platform: string;
  architecture: string;
  versions: { adb?: string; fastboot?: string; scrcpy?: string; scrcpyServer?: string };
  rootPath?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface AndroidDevice {
  serial: string;
  state: AndroidDeviceState;
  transport: AndroidTransport;
  model?: string;
  product?: string;
  androidVersion?: string;
  sdkLevel?: number;
  usb?: boolean;
}

interface AndroidSession {
  sessionId: string;
  deviceSerial: string;
  mode: 'mirror-control' | 'audio-only' | 'otg';
  keyboard: 'sdk' | 'uhid' | 'aoa' | 'disabled';
  mouse: 'sdk' | 'uhid' | 'aoa' | 'disabled';
  pid?: number;
  ownerPluginId?: string;
  status: 'starting' | 'running' | 'stopping' | 'exited' | 'failed';
  startedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

interface AndroidSessionEvent {
  type: 'created' | 'started' | 'stopped' | 'exited' | 'failed' | 'device-disconnected';
  session: AndroidSession;
  timestamp: string;
}
```

所有多设备操作必须显式携带 `serial`。默认设备选择只用于 UI 提示，不用于后台会话创建。

## 7. 高层功能行为

### 7.1 键鼠共享

镜像/控制会话默认参数为：

```text
scrcpy --serial=<serial> --keyboard=uhid --mouse=uhid
```

UHID 不可用或启动失败时，UI 可请求 SDK 回退：

```text
scrcpy --serial=<serial> --keyboard=sdk --mouse=sdk
```

UI 必须提示：UHID 可能需要一次性配置 Android 物理键盘布局；部分设备（尤其小米）需要额外开启“USB 调试（安全设置）”；SDK 模式对非 ASCII 输入和部分游戏的行为有限制。

OTG 会话使用 `scrcpy --otg --serial=<serial>`（设备选择规则按上游支持情况实现），并明确显示“仅键鼠、无镜像、无音频、仅 USB”。Windows 下若 ADB 占用 USB 设备，必须返回可理解的冲突错误。

### 7.2 音频回传

音频-only 会话使用：

```text
scrcpy --serial=<serial> --no-video --no-control
```

Android 11 需要设备在启动时解锁；Android 12+ 通常开箱即用；Android 10 及以下显示“不支持音频转发”。Android 13+ 可选：

```text
--audio-source=playback --audio-dup
```

默认音频源可能停止设备本地播放，`audio-dup` 仅在 playback capture 可用且应用未选择退出时有效。音频播放由 scrcpy/SDL 进程负责，第一版不在 GuYanTools 内另建音频播放器。

## 8. IPC 与插件契约

新增 `desktop/src/contracts/android-tools.ts` 和 `window.androidApi`，至少包含：

```ts
interface AndroidToolsApi {
  getToolchainStatus(): Promise<AndroidToolchainStatus>;
  listDevices(): Promise<AndroidDevice[]>;
  onDevicesChanged(listener: (devices: AndroidDevice[]) => void): () => void;
  listSessions(): Promise<AndroidSession[]>;
  startMirror(input: { deviceSerial: string; keyboard?: 'uhid' | 'sdk'; mouse?: 'uhid' | 'sdk'; }): Promise<AndroidSession>;
  startAudio(input: { deviceSerial: string; duplicateOnDevice?: boolean; }): Promise<AndroidSession>;
  startOtg(input: { deviceSerial: string; keyboard?: boolean; mouse?: boolean; }): Promise<AndroidSession>;
  stopSession(sessionId: string): Promise<void>;
  getFastbootDevices(): Promise<AndroidDevice[]>;
  fastbootGetVars(deviceSerial: string, names: string[]): Promise<Record<string, string>>;
  fastbootReboot(deviceSerial: string, target?: 'system' | 'bootloader'): Promise<void>;
  onSessionEvent(listener: (event: AndroidSessionEvent) => void): () => void;
}
```

插件 facade 只暴露同等高层方法：

```ts
pluginAPI.android.devices.list()
pluginAPI.android.sessions.startMirror(input)
pluginAPI.android.sessions.startAudio(input)
pluginAPI.android.sessions.stop(sessionId)
pluginAPI.android.sessions.list()
pluginAPI.android.sessions.onEvent(listener)
```

建议权限：

```text
android.devices.read
android.sessions.read
android.sessions.control
android.audio.playback
android.otg.control
android.fastboot.read
android.fastboot.reboot
android.adb.shell   # 本期不向第三方开放
android.fastboot.write # 本期不向第三方开放
```

`capabilities` 仍只描述插件业务能力，不自动授予权限。会话 owner 从 IPC sender context 推导，插件无法通过参数伪造 pluginId。插件禁用、卸载、worker/UI 销毁时，宿主自动停止其会话和事件订阅。

## 9. 错误与安全

稳定错误码至少包括：

```text
ANDROID_TOOL_UNAVAILABLE
ANDROID_TOOL_VERSION_MISMATCH
ANDROID_DEVICE_NOT_FOUND
ANDROID_DEVICE_UNAUTHORIZED
ANDROID_DEVICE_OFFLINE
ANDROID_DEVICE_BUSY
ANDROID_USB_CONFLICT
ANDROID_AUDIO_UNSUPPORTED
ANDROID_AUDIO_CAPTURE_FAILED
ANDROID_SESSION_START_FAILED
ANDROID_SESSION_EXITED
ANDROID_PERMISSION_DENIED
ANDROID_FASTBOOT_REQUIRED
ANDROID_FASTBOOT_OPERATION_DENIED
```

安全约束：

- 不接受插件传入的可执行路径、任意 argv、shell 字符串或环境变量。
- 所有请求按 schema 校验，serial 必须来自当前设备快照或明确的 fastboot 快照。
- `adb shell`、fastboot 写操作和解锁操作不向 sandboxed 插件开放。
- fastboot 只读/重启操作始终显示目标 serial；未来写操作必须显示镜像路径、SHA-256、分区并二次确认。
- 日志脱敏 token、password、cookie、authorization、ADB 密钥路径等字段。
- 设备断开和进程异常退出必须广播事件，并将 session 标记为 `exited` 或 `failed`，不可静默重试高风险操作。

## 10. 验收与测试

### 10.1 单元/集成测试

- 工具链路径、版本、摘要和 client/server 匹配校验。
- ADB 输出解析：单设备、多设备、unauthorized、offline、空列表和异常行。
- `track-devices` 事件去抖与订阅清理。
- scrcpy 参数白名单、UHID -> SDK 回退、音频-only 和 audio-dup 参数。
- 进程退出、取消、设备断开、应用退出和插件卸载清理。
- fastboot 只读命令参数固定，写操作拒绝。
- IPC sender context、权限、session owner 隔离。

### 10.2 Windows 设备矩阵

至少覆盖 Android 11、12、13+，一台需要额外安全设置的小米设备，USB 2/3、单/多设备、未授权、断线重连、ADB server 已运行、UHID 不可用、音频 capture 失败和 OTG/ADB 冲突。

### 10.3 项目验证

```powershell
pnpm --dir desktop exec vitest run src/main/android-tools
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
git diff --check
```

设备矩阵是硬件依赖验证，不能由 TypeScript、lint 或构建结果替代；发布说明必须分别记录自动化结果和未覆盖的真实设备。

## 11. 后续演进

只有当需求需要实时音频数据、协议解码、虚拟声卡、多客户端共享或自研 USB 传输时，才评估新增 Rust `AndroidDeviceService`。届时 Rust 负责底层协议/流处理，Electron 仍负责窗口、权限、插件和生命周期；两边不得同时拥有同一进程或设备会话。
