# Android 无缝键鼠共享设计规格

日期：2026-08-31

状态：待实现

## 1. 背景与目标

现有 Android 工具箱的键鼠能力依赖 scrcpy 镜像窗口，属于镜像控制，不是跨屏键鼠共享。本功能面向 Windows x64 单设备场景：用户配置 Android 设备相对于 Windows 屏幕的上下左右位置后，鼠标移动到 Windows 对应边缘即可无缝进入 Android；鼠标移动到 Android 外侧边缘可返回 Windows，并支持全局快捷键快速切换。

进入 Android 后，Windows 光标隐藏并锁定，键盘和鼠标输入独占发送到 Android。设备断开、服务异常、应用退出和安全快捷键触发时，必须恢复 Windows 输入。

## 2. 范围

### 2.1 本期包含

- 单台当前选中 Android 设备。
- Windows 屏幕相对 Android 的 `left`、`right`、`top`、`bottom` 位置配置。
- Windows 边缘进入、Android 边缘返回、120ms/12px 边缘阻力。
- 全局切换快捷键，默认 `Ctrl+Alt+A`。
- 双击 `Esc` 紧急释放输入。
- `Win`、`Alt+Tab`、音量键分别配置是否始终保留在 Windows。
- 一次性通过 ADB 推送并启动临时 Android 控制服务；不安装常驻 App，不要求 Root。
- Windows 原生全局键鼠 Hook、光标隐藏/锁定/恢复和输入阻止。
- 设备断开、Hook 失败、临时服务失败时的可恢复状态与错误显示。

### 2.2 非目标

- 不支持多台 Android 设备同时作为虚拟屏幕。
- 不支持 Android 多屏、旋转自动布局或跨多个 Windows 显示器的复杂拓扑；第一版使用单个 Windows 工作区矩形。
- 不捕获 UAC 安全桌面，不绕过 Windows 安全边界。
- 不向插件开放全局 Hook、光标控制或任意输入注入。
- 不以 scrcpy 窗口作为输入接收面；镜像会话与键鼠共享会话独立管理。

## 3. 架构

```text
Vue Renderer
    |
    | typed preload IPC
    v
Electron Main
    +-- AndroidInputRouter
    |     +-- WindowsInputBridge (Rust/N-API)
    |     +-- AndroidUhidSession (ADB temporary service)
    |     +-- placement/state/config policy
    +-- existing AdbDeviceService
    +-- existing AndroidToolchainManager
```

### 3.1 WindowsInputBridge

Rust/N-API 实现 Windows 低级键盘/鼠标 Hook，提供：

- `start(options)` / `stop()` 生命周期。
- 鼠标移动、按键、滚轮事件回调。
- 当前光标位置读取、设置、隐藏和恢复。
- 按策略阻止或放行 Windows 原生输入。
- Hook 线程与 Electron 主线程之间的有界事件队列，溢出时丢弃移动事件但不得丢弃释放按键事件。

### 3.2 AndroidInputRouter

Electron 主进程维护状态机：

- `windows`：输入留在 Windows。
- `entering`：鼠标压向配置边缘，累计 `edgeDelayMs` 或 `edgeThresholdPx` 后进入 Android。
- `android`：隐藏并锁定 Windows 光标，将输入转换为 Android 键盘/鼠标报告。
- `returning`：Android 虚拟光标到达外侧边缘，恢复 Windows 光标并释放 Hook。
- `suspended`：设备断开、Hook/ADB/临时服务异常或紧急释放后的安全状态。

Android 虚拟光标以配置的 `androidWidth`、`androidHeight` 为边界。进入时从 Android 对应侧边缘进入，返回时按比例映射到 Windows 相邻边缘。设备方向或尺寸变化时重置到中心，不自动抢占输入。

### 3.3 AndroidUhidSession

通过内置 ADB 将临时控制服务推送到设备并启动，服务负责接收标准键盘/鼠标报告并写入 UHID。服务绑定当前 serial，停止、断开或应用退出时自动退出并清理临时文件。任何启动失败必须返回 stderr 和稳定错误码。

## 4. 配置

配置写入现有应用配置 IPC，不使用 localStorage：

```ts
interface AndroidInputConfig {
  deviceSerial: string;
  placement: 'left' | 'right' | 'top' | 'bottom';
  androidWidth: number;
  androidHeight: number;
  edgeDelayMs: number;
  edgeThresholdPx: number;
  toggleShortcut: string;
  preserveWinKey: boolean;
  preserveAltTab: boolean;
  preserveVolumeKeys: boolean;
}
```

默认值：`edgeDelayMs=120`、`edgeThresholdPx=12`、`toggleShortcut=Ctrl+Alt+A`。`Ctrl+Alt+A` 与双击 `Esc` 是不可删除的安全路径；Win、Alt+Tab、音量键策略可分别切换。

## 5. 输入策略

- Windows 状态下不改变系统输入。
- Android 状态下，除配置为保留的按键及安全快捷键外，键盘、鼠标、滚轮均阻止 Windows 传播并发送至 Android。
- 音量键默认发送至 Android；Win 键和 Alt+Tab 默认保留在 Windows。
- 按下切换快捷键时必须先释放当前按键状态，再改变目标，避免 Android 遗留按键卡住。
- 双击 Esc 在 400ms 内触发紧急释放；单次 Esc 仍按当前策略转发。

## 6. 错误处理与生命周期

- Hook 启动失败：保持 Windows 输入，状态显示“系统输入桥接不可用”。
- ADB/临时服务启动失败：释放 Hook、恢复光标，展示具体 stderr/错误码。
- 设备断开：进入 `suspended`，停止发送报告，恢复 Windows 光标；重新连接后需用户再次启用。
- 应用退出：停止临时服务、释放 Hook、恢复光标；原生桥接提供进程退出清理兜底。
- UAC 安全桌面不捕获、不注入。
- 插件仅可继续使用既有受限 Android 会话 API，不能调用输入桥接。

## 7. 验收与测试

### 7.1 自动化

- Rust：Hook 生命周期、按键过滤、移动事件有界队列、坐标边界、边缘阻力、光标恢复。
- TypeScript：状态机转换、四方向映射、快捷键策略、配置校验、设备断开和服务失败清理。
- IPC：配置读写、owner/权限边界、错误码和事件订阅清理。

### 7.2 Windows 真实设备

- 单设备 Android 11/12/13+，四方向进入/返回。
- 进入 Android 后光标隐藏，返回 Windows 后位置恢复。
- `Ctrl+Alt+A`、双击 Esc、安全释放。
- Win、Alt+Tab、音量键三项独立策略。
- USB 断开、ADB 服务异常、临时服务启动失败后的恢复。
- 多 Windows 分辨率与窄窗口配置界面；不要求多 Android 设备。

真实设备测试结果必须与自动化结果分开记录，不以构建或单元测试替代硬件验证。

## 8. 安全与约束

- 所有输入注入限定为当前配置 serial，不能由 renderer 或插件传入任意 serial/argv/path。
- 临时服务和 Hook 生命周期与会话绑定，禁止后台常驻。
- 任何异常路径都必须释放按键、鼠标捕获和光标隐藏状态。
- 不修改现有 scrcpy 镜像参数来模拟跨屏共享。
