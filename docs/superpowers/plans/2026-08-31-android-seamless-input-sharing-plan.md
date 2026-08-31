# Android 无缝键鼠共享 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Windows x64 上为单台 Android 设备提供基于屏幕边缘和全局快捷键的无缝键鼠共享。

**Architecture:** Rust/N-API 提供 Windows 低级键鼠 Hook、光标控制和事件队列；Electron 主进程的 `AndroidInputRouter` 管理坐标、状态机、配置与生命周期；ADB 推送一次性 Android UHID 控制服务。Renderer 仅通过 typed IPC 配置和显示状态，插件不接触全局输入桥接。

**Tech Stack:** Rust 2021、napi-rs、Windows user32 API、Electron 主进程、Vue 3、TypeScript、Vitest、现有 ADB 工具链。

**Spec:** `docs/superpowers/specs/2026-08-31-android-seamless-input-sharing-design.md`

## Global Constraints

- 只支持 Windows x64、单台当前选中的 Android 设备。
- 不以 scrcpy 窗口接收输入，不安装常驻 Android App，不要求 Root。
- `Ctrl+Alt+A` 与双击 `Esc` 永远可释放输入；不捕获 UAC 安全桌面。
- 所有 IPC payload 使用结构化 schema；serial 必须来自当前设备快照。
- Hook、临时服务、光标隐藏和按键状态必须在异常、断开和退出路径清理。

### Task 1: Define contracts and persisted configuration

**Files:**
- Modify: `desktop/src/contracts/android-tools.ts`
- Modify: `desktop/src/contracts/app_config.ts`
- Modify: `desktop/src/main/app-config/manager.ts`
- Test: `desktop/src/main/android-tools/input_router.test.ts`

**Interfaces:**
- `AndroidInputConfig` with placement, dimensions, edge thresholds, toggle shortcut and independent preserve-key flags.
- `AndroidInputState = 'windows' | 'entering' | 'android' | 'returning' | 'suspended'`.
- `AndroidInputStatus` includes state, deviceSerial, virtual cursor and error fields.

- [x] **Step 1: Write config validation and default tests.** Assert defaults (`right`, `120`, `12`, `Ctrl+Alt+A`), reject invalid dimensions/shortcut/serial, and preserve independent Win/AltTab/volume flags.
- [ ] **Step 2: Run the focused Vitest test and verify failure.**
- [x] **Step 3: Add contracts, defaults, app-config serialization and validation.** Keep backward compatibility for configs without `androidInput`.
- [x] **Step 4: Run focused tests and typecheck.**
- [x] **Step 5: Commit** `feat(desktop): add android input sharing contracts`.

### Task 2: Implement Windows native input bridge

**Files:**
- Create: `multi_platform_core/src/bindings/windows_input.rs`
- Modify: `multi_platform_core/src/bindings/napi.rs`
- Modify: `multi_platform_core/Cargo.toml`
- Test: `multi_platform_core/src/bindings/windows_input.rs` unit tests

**Interfaces:**
- N-API `windowsInputStart(options, callback)`, `windowsInputStop()`, `windowsInputGetCursor()`, `windowsInputSetCursor(x, y)`, `windowsInputSetBlocked(blocked)`.
- Callback events: `{ kind: 'move'|'button'|'wheel'|'key', ... }` with bounded movement queue and guaranteed button/key-up delivery.

- [x] **Step 1: Add Rust tests for event normalization, button release ordering and coordinate bounds.**
- [ ] **Step 2: Run `cargo test --manifest-path multi_platform_core/Cargo.toml windows_input` and verify failure.**
- [x] **Step 3: Implement Windows-only `WH_MOUSE_LL`/`WH_KEYBOARD_LL` hooks, cursor hide/show, clipping and N-API thread-safe callback.** Provide non-Windows stubs that return a stable unsupported error.
- [x] **Step 4: Run Rust tests and debug build.**
- [x] **Step 5: Commit** `feat(core): add windows global input bridge`.

### Task 3: Implement Android temporary UHID service transport

**Files:**
- Create: `desktop/src/main/android-tools/android_uhid_service.ts`
- Create: `desktop/src/main/android-tools/android_uhid_service.test.ts`
- Modify: `desktop/src/main/android-tools/toolchain.ts`
- Modify: `desktop/src/contracts/android-tools.ts`

**Interfaces:**
- `AndroidUhidSession.start(deviceSerial): Promise<{ sessionId: string }>`
- `sendKeyboardReport(report)`, `sendMouseReport(report)`, `stop(): Promise<void>`
- Errors: `ANDROID_UHID_START_FAILED`, `ANDROID_UHID_DISCONNECTED`, `ANDROID_UHID_PROTOCOL_ERROR` with sanitized stderr.

- [x] **Step 1: Write tests for fixed ADB push/start args, report framing, disconnect and cleanup.**
- [x] **Step 2: Run focused tests and verify the implemented transport.**
- [x] **Step 3: Implement fixed-path ADB transport and temporary service lifecycle; reject arbitrary paths/argv and cap report queue size.**
- [x] **Step 4: Run tests and verify no child process survives stop/dispose.**
- [x] **Step 5: Commit** `feat(desktop): add android uhid input transport`.

### Task 4: Implement AndroidInputRouter state machine

**Files:**
- Create: `desktop/src/main/android-tools/input_router.ts`
- Create: `desktop/src/main/android-tools/input_router.test.ts`

**Interfaces:**
- `AndroidInputRouter.start(config): Promise<AndroidInputStatus>`
- `stop(reason): Promise<void>`
- `toggle(): Promise<AndroidInputStatus>`
- `handleNativeEvent(event): void`
- `onStatus(listener): () => void`

- [x] **Step 1: Write failing tests for Windows→Android entry on all four edges with 120ms/12px resistance.**
- [x] **Step 2: Add tests for Android→Windows proportional return, toggle shortcut, double-Esc emergency release, preserve-key policies and suspended cleanup.**
- [ ] **Step 3: Run focused tests and verify failure.**
- [x] **Step 4: Implement state transitions, virtual cursor, edge timers, key state flushing and error recovery using injected bridge/UHID dependencies.**
- [x] **Step 5: Run router tests and refactor only after green.**
- [x] **Step 6: Commit** `feat(desktop): route input across android screen boundary`.

### Task 5: Wire main-process IPC, lifecycle and config persistence

**Files:**
- Create: `desktop/src/main/android-tools/input_ipc.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/src/preload.ts`
- Modify: `desktop/src/contracts/android-tools.ts`
- Test: `desktop/src/main/android-tools/input_ipc.test.ts`

**Interfaces:**
- `android:get-input-config`, `android:update-input-config`, `android:start-input-sharing`, `android:stop-input-sharing`, `android:toggle-input-sharing`, `android:get-input-status`.
- `window.androidApi.input` exposes typed calls and removable `onStatus` listener.

- [x] **Step 1: Write failing IPC tests for schema validation, device serial ownership, duplicate start and unsubscribe.**
- [x] **Step 2: Implement handlers deriving device state from `AdbDeviceService`, register during app construction, and dispose on `will-quit`.**
- [x] **Step 3: Add preload facade and status broadcast without exposing native handles or arbitrary commands.**
- [x] **Step 4: Run IPC tests, typecheck and Android static verification.**
- [x] **Step 5: Commit** `feat(desktop): expose android input sharing ipc`.

### Task 6: Build configuration UI and status surface

**Files:**
- Create: `desktop/src/windows/main/pages/AndroidTools/components/AndroidInputSharingPanel.vue`
- Modify: `desktop/src/windows/main/pages/AndroidTools/AndroidTools.vue`
- Modify: `desktop/src/windows/main/pages/AndroidTools/android-tools.scss`
- Test: `desktop/src/windows/main/pages/AndroidTools/AndroidInputSharingPanel.test.ts`

**Interfaces:**
- Configuration controls for placement, dimensions, edge delay/threshold, toggle shortcut and Win/AltTab/volume policies.
- Start/stop/toggle actions and visible state/error recovery.

- [x] **Step 1: Write failing component tests for config rendering, disabled state without device, error display and emergency stop affordance.**
- [x] **Step 2: Implement panel using existing UI components and `window.androidApi.input`; keep copy Chinese-first and focus states visible.**
- [x] **Step 3: Add responsive placement preview using semantic tokens, not decorative gradients or new color systems.**
- [x] **Step 4: Run component tests through the renderer Vitest config and build renderer.**
- [x] **Step 5: Commit** `feat(ui): add android seamless input sharing controls`.

### Task 7: Device and packaging verification

**Files:**
- Create: `desktop/scripts/verify-android-input-sharing.cjs`
- Modify: `desktop/package.json`
- Modify: `package.json`
- Modify: `docs/superpowers/verification/2026-08-28-android-toolbox-device-matrix.md`

- [x] **Step 1: Add static checks for native bridge registration, forbidden plugin access, fixed ADB paths, emergency release and no scrcpy-window dependency.**
- [x] **Step 2: Add `test:android-input` and `verify:android-input` scripts.**
- [x] **Step 3: Run full Rust tests, Android tests, typecheck, renderer/app build and `git diff --check`.**
- [ ] **Step 4: Record real-device results for four directions, shortcut release, preserve-key policies, disconnect and recovery without serials or sensitive logs.**
- [ ] **Step 5: Commit** `test(android): verify seamless input sharing`.
