# Desktop Terminal Architecture

## Overview

The desktop terminal feature is split into four layers:

1. Rust core in `multi_platform_core`
2. Electron main process
3. Electron preload bridge
4. Vue renderer with xterm.js

## Layering

### Rust Core

Files:

- `multi_platform_core/src/terminal/mod.rs`
- `multi_platform_core/src/bindings/napi.rs`

Responsibilities:

- detect shell profiles per platform
- create and manage PTY sessions with `portable-pty`
- keep session registry in memory
- stream PTY output
- emit `data`, `state`, `exit`, `error` events
- handle `write`, `resize`, `kill`, `attach`

The Rust side exports `JsTerminalHost` over NAPI. Events are serialized as JSON strings and pushed through a single threadsafe callback sink.

### Electron Main

Files:

- `desktop/src/main/terminal_host.ts`
- `desktop/src/main/terminal_ipc.ts`

Responsibilities:

- hold a singleton `JsTerminalHost`
- register the Rust event sink once
- expose terminal IPC handlers to renderer
- create detached popup windows
- bridge clipboard read/write

### Preload

File:

- `desktop/src/preload.ts`

Responsibility:

- expose `window.terminalApi`
- keep renderer isolated from Electron and NAPI details

### Renderer

Files:

- `desktop/src/renderer/pages/Terminal/TerminalPage.vue`
- `desktop/src/renderer/pages/Terminal/TerminalViewport.vue`
- `desktop/src/renderer/pages/Terminal/TerminalToolbar.vue`
- `desktop/src/renderer/pages/Terminal/TerminalSearchPanel.vue`
- `desktop/src/renderer/stores/terminal_store.ts`

Responsibilities:

- render terminal sessions with xterm.js
- manage active session tabs
- handle search, clear, renderer mode switching
- translate right-click behavior into copy/paste actions
- send resize info including pixel dimensions

## Event Flow

1. Renderer calls `window.terminalApi.createSession(...)`.
2. Electron main forwards the request to `JsTerminalHost`.
3. Rust creates a PTY, spawns the shell, stores session metadata, and emits a `state` event.
4. Rust reader thread emits `data` events as PTY output arrives.
5. Main process receives the JSON payload and forwards it through `terminal:event`.
6. Renderer store updates buffers and session state.
7. `TerminalViewport` writes incremental output into xterm.

## Attach / Detach Lifecycle

- Main view target is `main`.
- Detached windows use a unique `popup:<sessionId>:<timestamp>` target.
- Detaching updates the session attachment target in Rust and opens a popup route.
- Closing a popup calls `closeDetachedView`, which rebinds the session to `main` if the popup still owns it.

## Configuration Model

Terminal settings live in `AppConfig.features.terminal`:

- `defaultProfileId`
- `defaultCwd`
- `env`
- `rendererMode`
- `enableSixel`
- `detachToWindowByDefault`

This config is normalized by `app_config_manager` and consumed by both settings UI and terminal UI.

## Current Constraints

- Sessions are not persisted across app restarts.
- Rust emits raw PTY bytes as UTF-8 lossy strings.
- Event delivery is currently broadcast to renderer windows; filtering is done by session usage on the renderer side.
- Interactive Windows shells may emit terminal capability queries during startup; xterm handles those in the actual app flow.
