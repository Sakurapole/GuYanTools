# Android 工具箱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Windows x64 首先交付由 Electron 主进程管理的内置 ADB/scrcpy/fastboot、键鼠共享、Android 音频回传和受权限控制的插件 API。

**Architecture:** TypeScript 主进程新增 Android 工具领域，使用固定路径和参数数组托管 ADB、scrcpy、fastboot 子进程；Vue 通过 typed preload API 消费设备/会话状态。Rust `multi_platform_core` 不参与本期子进程编排，插件只能通过 sender context 绑定的高层 API 调用。

**Tech Stack:** Electron Forge/Vite、Vue 3、TypeScript、Pinia、Vitest、官方 ADB Platform Tools、官方 scrcpy release、fastboot。

**Spec:** `docs/superpowers/specs/2026-08-28-android-toolbox-design.md`

## Global Constraints

- 第一版目标平台是 Windows x64；Android 音频转发要求 Android 11+。
- 主进程核心逻辑使用 TypeScript；不重写 ADB/scrcpy/fastboot 协议，不把这层放入 Rust。
- 所有外部进程使用固定绝对路径、参数数组、`shell: false`、`windowsHide: true` 和可取消生命周期。
- Renderer 不访问 Node/Electron/数据库；插件不获得任意命令、任意路径、`adb shell` 或 fastboot 写权限。
- `permissions` 与 `capabilities` 分离；会话 owner 从 IPC sender context 推导。
- 第一版不嵌入 scrcpy SDL 窗口、不提供插件实时音频流、不实现 fastboot flash/erase/unlock。

---

### Task 1: 锁定发行资源与开发工具目录

**Files:**
- Create: `desktop/src/main/android-tools/toolchain.ts`
- Create: `desktop/src/main/android-tools/toolchain.test.ts`
- Create: `desktop/src/main/android-tools/resources/win32-x64/.gitkeep`（仅目录占位，不提交二进制）
- Modify: `desktop/forge.config.ts`
- Modify: `desktop/electron-builder.config.cjs`
- Modify: `.gitignore`
- Create: `docs/superpowers/specs/2026-08-28-android-toolbox-third-party-notices.md`

**Interfaces:**
- Produces `AndroidToolchainStatus`、`AndroidToolchainManager.resolve()`、`AndroidToolchainManager.getToolPath(tool)` 和 `AndroidToolchainManager.verify()`，供后续设备和会话服务调用。

- [ ] **Step 1: 写工具链状态的失败测试。** 测试缺少 `adb.exe`、缺少 scrcpy server、版本不匹配和路径逃逸时返回稳定错误码。
- [ ] **Step 2: 运行测试确认失败。**

```powershell
pnpm --dir desktop exec vitest run src/main/android-tools/toolchain.test.ts
```

预期：FAIL，尚未存在 `toolchain.ts`。

- [ ] **Step 3: 实现固定根目录解析和版本/摘要校验。** 在 `AndroidToolchainManager` 中实现 `resolve(): AndroidToolchainStatus`、`getToolPath(tool: 'adb' | 'fastboot' | 'scrcpy' | 'scrcpy-server'): string` 和 `verify(): Promise<AndroidToolchainStatus>`；只接受 `resources/android-tools/<platform>-<arch>` 或显式开发覆盖目录，使用 `execFile` 参数数组读取版本，拒绝任意用户路径和缺失依赖。
- [ ] **Step 4: 配置打包复制规则和许可证清单。** 将 `android-tools` 加入 Forge `extraResource` 与 Builder `extraResources`，保留上游 LICENSE/NOTICE，不把二进制放入 Git。
- [ ] **Step 5: 运行测试确认通过。**

```powershell
pnpm --dir desktop exec vitest run src/main/android-tools/toolchain.test.ts
pnpm exec git diff --check
```

- [ ] **Step 6: Commit。**

```powershell
git add desktop/src/main/android-tools/toolchain.ts desktop/src/main/android-tools/toolchain.test.ts desktop/forge.config.ts desktop/electron-builder.config.cjs .gitignore docs/superpowers/specs/2026-08-28-android-toolbox-third-party-notices.md
git commit -m "feat(desktop): package android toolchain resources"
```

### Task 2: 实现 ADB 设备发现与状态事件

**Files:**
- Create: `desktop/src/contracts/android-tools.ts`
- Create: `desktop/src/main/android-tools/adb_service.ts`
- Create: `desktop/src/main/android-tools/adb_parser.ts`
- Create: `desktop/src/main/android-tools/adb_parser.test.ts`
- Create: `desktop/src/main/android-tools/adb_service.test.ts`

**Interfaces:**
- Consumes `AndroidToolchainManager.getToolPath('adb')`。
- Produces `listDevices(): Promise<AndroidDevice[]>`, `onDevicesChanged(listener): () => void`, `getDevice(serial): AndroidDevice | null`。

- [ ] **Step 1: 写解析失败测试。** 覆盖单设备、多设备、`unauthorized`、`offline`、空列表和异常行；断言 transport、serial、model 字段。
- [ ] **Step 2: 运行指定 Vitest 确认失败。**

```powershell
pnpm --dir desktop exec vitest run src/main/android-tools/adb_parser.test.ts
```

- [ ] **Step 3: 实现纯函数解析器。** 只解析 `adb devices -l` 的结构化列，不从任意文本猜 serial；未知状态归一为 `unknown`。
- [ ] **Step 4: 实现 ADB 服务。** 使用固定 `adb` 路径执行 `start-server`、`devices -l` 和 `track-devices`；限制输出大小，取消时杀掉 track 子进程。
- [ ] **Step 5: 写并运行服务生命周期测试。** 模拟设备快照变化、重复事件、子进程退出和 unsubscribe。
- [ ] **Step 6: Commit。**

```powershell
git add desktop/src/contracts/android-tools.ts desktop/src/main/android-tools/adb_service.ts desktop/src/main/android-tools/adb_parser.ts desktop/src/main/android-tools/*test.ts
git commit -m "feat(desktop): discover android devices through adb"
```

### Task 3: 实现 scrcpy 会话编排

**Files:**
- Create: `desktop/src/main/android-tools/scrcpy_service.ts`
- Create: `desktop/src/main/android-tools/scrcpy_args.ts`
- Create: `desktop/src/main/android-tools/scrcpy_args.test.ts`
- Create: `desktop/src/main/android-tools/scrcpy_service.test.ts`
- Modify: `desktop/src/contracts/android-tools.ts`

**Interfaces:**
- Consumes `AdbDeviceService` and `AndroidToolchainManager`。
- Produces `startMirror`, `startAudio`, `startOtg`, `stopSession`, `listSessions`, `onSessionEvent`。

- [ ] **Step 1: 写参数白名单和回退测试。** 断言 mirror 默认 `--keyboard=uhid --mouse=uhid`，SDK 回退参数、audio-only、`audio-dup` 和 OTG 参数；任意 argv/路径输入必须失败。
- [ ] **Step 2: 运行测试确认失败。**

```powershell
pnpm --dir desktop exec vitest run src/main/android-tools/scrcpy_args.test.ts
```

- [ ] **Step 3: 实现 `buildScrcpyArgs`。** 根据结构化输入生成固定参数，校验 serial 来自设备快照；音频复制只允许 Android 13+ 请求路径并保留能力错误。
- [ ] **Step 4: 实现会话服务。** 使用 `spawn` 创建进程，记录 pid/owner/status，消费 stdout/stderr，区分正常退出、设备断开和启动失败；停止操作发送终止信号并设置清理超时。
- [ ] **Step 5: 增加回归测试。** 覆盖 UHID 启动失败后的 SDK 重试、重复 stop、进程异常退出、设备断开和所有会话清理。
- [ ] **Step 6: Commit。**

```powershell
git add desktop/src/main/android-tools/scrcpy_service.ts desktop/src/main/android-tools/scrcpy_args.ts desktop/src/main/android-tools/*test.ts desktop/src/contracts/android-tools.ts
git commit -m "feat(desktop): manage scrcpy android sessions"
```

### Task 4: 实现 fastboot 只读服务

**Files:**
- Create: `desktop/src/main/android-tools/fastboot_service.ts`
- Create: `desktop/src/main/android-tools/fastboot_args.ts`
- Create: `desktop/src/main/android-tools/fastboot_service.test.ts`
- Modify: `desktop/src/contracts/android-tools.ts`

**Interfaces:**
- Produces `getFastbootDevices`, `getVars`, `reboot`；不产生 flash/erase/unlock 方法。

- [ ] **Step 1: 写安全参数测试。** 断言只允许 `devices -l`、`getvar <allowlisted-name>` 和 `reboot [bootloader|system]`，拒绝分区、镜像路径和未知参数。
- [ ] **Step 2: 实现固定参数服务。** 通过 `execFile` 调用内置 fastboot，要求目标在当前快照中且状态为 bootloader；解析 stderr 中的 `Finished`/`FAILED`。
- [ ] **Step 3: 运行测试并提交。**

```powershell
pnpm --dir desktop exec vitest run src/main/android-tools/fastboot_service.test.ts
git add desktop/src/main/android-tools/fastboot_service.ts desktop/src/main/android-tools/fastboot_args.ts desktop/src/main/android-tools/fastboot_service.test.ts desktop/src/contracts/android-tools.ts
git commit -m "feat(desktop): add read-only fastboot operations"
```

### Task 5: 接入主进程 IPC、preload 和会话事件

**Files:**
- Create: `desktop/src/main/android-tools/ipc.ts`
- Modify: `desktop/src/preload.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/src/contracts/android-tools.ts`
- Create: `desktop/src/main/android-tools/ipc.test.ts`

**Interfaces:**
- Produces `window.androidApi` 与 `android:*` 通道；renderer 只接触 contracts 中的类型。

- [ ] **Step 1: 写 IPC 权限和 payload 测试。** 断言未知 serial、任意参数、重复 handler 注册和事件 unsubscribe 被拒绝/安全处理。
- [ ] **Step 2: 实现领域注册。** 在 `App` 构造阶段调用 `registerAndroidToolsIpcHandlers()`；将设备和会话事件广播到所有有效窗口。
- [ ] **Step 3: 实现 preload facade。** 只暴露白名单方法和可清理 listener，不暴露 child process、绝对路径或 service 实例。
- [ ] **Step 4: 运行类型检查和测试。**

```powershell
pnpm --dir desktop exec vitest run src/main/android-tools/ipc.test.ts
pnpm --dir desktop run typecheck
```

- [ ] **Step 5: Commit。**

```powershell
git add desktop/src/main/android-tools/ipc.ts desktop/src/main/android-tools/ipc.test.ts desktop/src/preload.ts desktop/src/main/index.ts desktop/src/contracts/android-tools.ts
git commit -m "feat(desktop): expose android tools through typed ipc"
```

### Task 6: 添加主窗口 Android 工具箱 UI

**Files:**
- Create: `desktop/src/windows/main/pages/AndroidTools/AndroidTools.vue`
- Create: `desktop/src/windows/main/pages/AndroidTools/android-tools.scss`
- Modify: `desktop/src/windows/main/routes/router.ts`
- Modify: `desktop/src/windows/main/App.vue`
- Create: `desktop/src/windows/main/pages/AndroidTools/AndroidTools.test.ts`

**Interfaces:**
- Consumes `window.androidApi`。
- Produces设备列表、授权/离线提示、工具链诊断、镜像/音频/OTG 控件、session 状态和停止/重连动作。

- [ ] **Step 1: 写 UI 状态测试。** 覆盖无工具、无设备、unauthorized、Android 10 音频禁用、Android 11 解锁提示、多设备选择和 session 退出。
- [ ] **Step 2: 实现页面和路由。** 复用现有 UI 组件与主题变量；页面文案中文优先，按钮使用已有图标按钮/tooltip 规范。
- [ ] **Step 3: 实现事件订阅清理。** `onMounted` 订阅设备/session 事件，`onUnmounted` 取消；页面关闭不停止用户仍运行的会话，只提供显式停止。
- [ ] **Step 4: 运行 UI 测试和构建。**

```powershell
pnpm --dir desktop exec vitest run src/windows/main/pages/AndroidTools/AndroidTools.test.ts
pnpm --dir desktop run build:renderer
```

- [ ] **Step 5: Commit。**

```powershell
git add desktop/src/windows/main/pages/AndroidTools desktop/src/windows/main/routes/router.ts desktop/src/windows/main/App.vue
git commit -m "feat(ui): add android tools control page"
```

### Task 7: 接入插件权限与 Android facade

**Files:**
- Modify: `desktop/src/contracts/plugin_host.ts`
- Modify: `packages/plugin-sdk/src/contracts.ts`
- Modify: `packages/plugin-sdk/src/runtime.ts`
- Modify: `desktop/src/core/plugin_core/sdk.ts`
- Modify: `desktop/src/main/plugin-host/host_services.ts`
- Modify: `desktop/src/main/plugin-host/ipc.ts`
- Modify: `desktop/src/main/plugin-host/permission_manager.ts`
- Create: `desktop/src/main/plugin-host/android_service.ts`
- Create: `desktop/src/main/plugin-host/android_service.test.ts`

**Interfaces:**
- Produces `pluginAPI.android`，以及 `android.devices.read`、`android.sessions.read`、`android.sessions.control`、`android.audio.playback`、`android.otg.control`、`android.fastboot.read`、`android.fastboot.reboot` 权限校验。

- [ ] **Step 1: 写插件安全测试。** 断言未声明权限、伪造 pluginId、访问其他插件 session、调用 fastboot 写操作和传入任意 argv 均失败；插件卸载会停止 owner session。
- [ ] **Step 2: 扩展 contracts 和 capability summary。** 保持 `permissions` 与 `capabilities` 分离，新增 android host capability 仅用于展示 API 范围。
- [ ] **Step 3: 实现 `AndroidHostService`。** 将 pluginId 绑定到 session owner，复用主进程 `ScrcpySessionManager`，只接受规格中的结构化输入；订阅事件时过滤 owner。
- [ ] **Step 4: 接入 runtime IPC 和 SDK facade。** 在 preload plugin 中仅暴露 `pluginAPI.android`，所有 handler 通过 sender context 获取 pluginId/runtime。
- [ ] **Step 5: 运行插件测试、类型检查和平台回归。**

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/android_service.test.ts src/main/plugin-host/runtime_security.test.ts
pnpm --dir desktop run typecheck
pnpm --dir desktop run verify:plugin-platform
```

- [ ] **Step 6: Commit。**

```powershell
git add desktop/src/contracts/plugin_host.ts packages/plugin-sdk/src/contracts.ts packages/plugin-sdk/src/runtime.ts desktop/src/core/plugin_core/sdk.ts desktop/src/main/plugin-host/android_service.ts desktop/src/main/plugin-host/android_service.test.ts desktop/src/main/plugin-host/host_services.ts desktop/src/main/plugin-host/ipc.ts desktop/src/main/plugin-host/permission_manager.ts
git commit -m "feat(plugins): expose controlled android tool capabilities"
```

### Task 8: 端到端验证与设备矩阵记录

**Files:**
- Create: `desktop/scripts/verify-android-tools.cjs`
- Create: `docs/superpowers/verification/2026-08-28-android-toolbox-device-matrix.md`
- Modify: `desktop/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces `verify:android-tools` 和可审计设备矩阵记录；不把真实设备序列号、授权密钥或日志敏感值提交到仓库。

- [ ] **Step 1: 写静态验证脚本。** 检查工具路径不依赖 PATH、调用使用参数数组、无任意 shell/argv、插件权限清单和 fastboot 写操作边界。
- [ ] **Step 2: 加入 package scripts。**

```json
{
  "verify:android-tools": "node scripts/verify-android-tools.cjs",
  "test:android-tools": "vitest run src/main/android-tools src/main/plugin-host/android_service.test.ts"
}
```

- [ ] **Step 3: 执行自动化验证。**

```powershell
pnpm --dir desktop run test:android-tools
pnpm --dir desktop run verify:android-tools
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
git diff --check
```

- [ ] **Step 4: 在 Windows 设备矩阵上记录结果。** 至少记录 Android 11/12/13+、小米安全设置、USB 2/3、单/多设备、未授权、断线、UHID 回退、audio-dup、OTG/ADB 冲突；失败项记录错误码和复现步骤。
- [ ] **Step 5: Commit。**

```powershell
git add desktop/scripts/verify-android-tools.cjs desktop/package.json package.json docs/superpowers/verification/2026-08-28-android-toolbox-device-matrix.md
git commit -m "test(android): add android tools verification gates"
```

## Execution Notes

- 每个 Task 独立完成测试后再提交；不要把官方二进制、`node_modules`、`target` 或真实设备凭据加入 Git。
- 真实设备验证不能由模拟测试替代；如果硬件不可用，保留自动化结果并在矩阵文档中明确未验证项。
- 未来若要新增 Rust 设备服务，必须先建立新的规格/计划，不能在本计划中悄然改变会话所有权或 IPC 契约。
