# Desktop Terminal Requirements

## Scope

- v1 only supports local terminal sessions.
- SSH is out of scope for this phase.
- The session model must stay reusable for a future SSH transport adapter.

## Functional Requirements

### Shell Profiles

- Support platform-specific shell profiles.
- Windows profiles:
  - `pwsh.exe`
  - `powershell.exe`
  - `cmd.exe`
- Linux/macOS profiles:
  - `$SHELL` when available
  - fallback to `bash`, `zsh`, `sh`
- The app must expose detected profiles to the renderer and allow selecting the default profile.

### Terminal Rendering

- Renderer uses xterm.js.
- Support renderer mode selection:
  - `auto`
  - `standard`
  - `webgl`
- `webgl` failure must fall back to `standard` without breaking the session.

### PTY Behavior

- PTY backend is implemented in Rust with `portable-pty`.
- Support:
  - create session
  - list sessions
  - write input
  - resize terminal
  - kill session
  - attach session to target view
  - move detached session back to main view
- Session state is in-memory only.
- App restart does not restore sessions.

### Image / Sixel

- xterm image support is enabled through `@xterm/addon-image`.
- Sixel is controlled by a feature flag in app config.
- v1 target is "available and degradable", not perfect compatibility for every TUI/image workload.

### Clipboard / Context Menu

- Right click behavior is terminal-local:
  - if selection exists: copy selection to clipboard
  - otherwise: paste clipboard text into the PTY
- Renderer does not call Electron clipboard APIs directly.
- Clipboard access goes through preload and main-process IPC.

### Multi-Session / Windowing

- Main app provides a `/terminal` page.
- The page manages multiple terminal sessions as internal tabs.
- A session can be detached into a popup window.
- When a popup closes, its session reattaches to the main view.

## Non-Functional Requirements

- Prefer mature open-source implementations for non-core parts.
- Rust core owns terminal lifecycle and process control.
- Electron main process owns IPC routing, window management, and clipboard.
- Renderer owns xterm lifecycle and interaction behavior.

## Validation Notes

- Rust PTY creation, NAPI export, and desktop renderer build are implemented.
- On Windows, headless smoke tests receive control sequences before a real emulator replies.
- The actual desktop path uses xterm.js, which provides the expected terminal-side responses during interactive use.
