# Desktop Terminal Development Plan

## Implemented

### Rust / NAPI

- Added `portable-pty` to `multi_platform_core`.
- Implemented terminal session manager in Rust.
- Exported `JsTerminalHost` from NAPI and package entrypoints.

### Electron

- Added terminal host singleton in main process.
- Added terminal IPC for sessions, detach flow, and clipboard.
- Added preload `terminalApi`.

### Renderer

- Added `/terminal` page.
- Added terminal store and xterm-based viewport.
- Added search, clear, multi-session tab strip, renderer mode switch.
- Added settings integration for terminal config.

### Docs

- Added requirements, architecture, and implementation plan documents under `docs/desktop/Terminal`.

## Remaining Follow-Up

- Add automated integration tests around renderer event handling and popup attach/detach.
- Improve event routing to send terminal events only to relevant windows.
- Consider binary-safe transport for PTY output if future workloads need exact byte fidelity.
- Add session close controls per tab if product requires explicit tab-level lifecycle UX.

## Risks

### Windows Interactive Shell Behavior

- Interactive shells may emit terminal queries before becoming fully ready.
- Headless smoke tests without a real emulator can stall on those sequences.
- In desktop runtime, xterm.js is expected to provide the required terminal behavior.

### Sixel Compatibility

- Image and sixel support depend on addon/runtime compatibility.
- v1 should treat this as best-effort with graceful fallback.

### Renderer Scale

- Terminal page bundle size increased noticeably because xterm and addons are included in the route chunk.
- Future optimization can lazy-load more aggressively if startup or route performance becomes a problem.

## Verification Performed

- `cargo check --manifest-path multi_platform_core/Cargo.toml`
- `pnpm --dir multi_platform_core build:debug`
- `pnpm install`
- `pnpm --dir desktop exec tsc --noEmit`
- `pnpm --dir desktop exec vite build --config vite.renderer.config.ts`
- `node -e "const core=require('./multi_platform_core'); ..."` to verify `JsTerminalHost` export and profile listing

## Verification Notes

- Full desktop `eslint` is currently blocked by pre-existing repo issues outside the terminal work.
- Direct `vite.main.config.ts` and `vite.preload.config.ts` builds also fail due existing project config assumptions unrelated to this feature.
