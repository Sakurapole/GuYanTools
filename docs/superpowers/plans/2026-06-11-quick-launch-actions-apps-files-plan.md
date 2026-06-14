# Quick Launch Actions, Apps, And Everything File Search Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Track progress by updating the checkboxes in this file as work lands.

**Goal:** Close the QuickLaunch phase-2 gap: selecting a result must perform the intended operation, QuickLaunch must search locally installed Windows apps/shortcuts, and QuickLaunch must search local files through Everything/ES.

**Scope Date:** 2026-06-11

**Current Baseline:** The MVP already has a floating Electron launcher, typed IPC, provider registry, usage-history boosting, Settings provider toggles, and providers for internal routes, terminal, SSH, FTP, Todo, Knowledge, and plugins. The current defect is that several actions only navigate to a page with stale query names and do not trigger the target page's existing open/connect/select logic.

**Primary Surfaces:**

- `desktop/src/contracts/quick_launch.ts`
- `desktop/src/main/quick-launch/service.ts`
- `desktop/src/main/quick-launch/providers/*`
- `desktop/src/main/app-config/manager.ts`
- `desktop/src/contracts/app_config.ts`
- `desktop/src/windows/main/pages/Settings.vue`
- `desktop/src/windows/main/pages/Terminal/TerminalPage.vue`
- `desktop/src/windows/main/pages/Ftp/FtpPage.vue`
- `desktop/src/windows/main/pages/Todo/TodoApp.vue`
- `desktop/src/windows/main/pages/Knowledge/KnowledgePage.vue`
- `desktop/scripts/verify-quick-launch.cjs`

---

## Evidence And Design Notes

### Flow Launcher / uTools-Inspired Shape

- Keep Flow Launcher's provider pipeline: search providers run independently, results are scored/merged in the host, and stale provider failures are isolated.
- Keep uTools' safe host-action principle: renderer never runs arbitrary OS commands; it sends a typed result to main, and main executes only whitelisted actions.
- Add OS app/file providers as first-class providers instead of mixing them into internal route search.

### Existing GuYanTools Behavior To Reuse

- Terminal page already handles `openTerminalRequestId`, `openLocalProfileId`, `connectSshProfileId`, and `cwd`.
- FTP page already has `connectProfile`, `processPendingProfileOpenRequest`, and workspace pane creation logic, but its pending request is renderer-only. Add a route query bridge instead of calling Pinia from main.
- Todo store already supports `switchView` and `selectTodo`.
- Knowledge store already supports `initialize` and `selectNode`.

### Everything Integration Boundary

- Everything GUI command line can set a UI search with `Everything.exe -s`, but it does not return paths to QuickLaunch.
- ES is the official Everything command line interface for returning search results. It requires Everything installed and running and supports `es.exe [options] [search text]`, `-n`/`-max-results`, `-p`/`-match-path`, `-size`, `-dm`, `-no-header`, and error code 8 when the Everything IPC window is unavailable.
- Implement `es.exe` detection with safe fallbacks:
  - `EVERYTHING_ES_PATH`
  - `es.exe` on `PATH`
  - common Everything install directories
  - common Scoop app directories
- If `es.exe` is missing or Everything is not running, the provider returns one helpful result that opens the official download/help page. It must not throw into the whole search response.

Reference links:

- Everything ES CLI: <https://www.voidtools.com/support/everything/command_line_interface/>
- Everything command line options: <https://www.voidtools.com/support/everything/command_line_options/>

---

## Requirements

### R1. Real Profile Execution

- Selecting a local terminal profile creates or focuses a local terminal session for that profile.
- Selecting an SSH profile opens the terminal page and connects/focuses that SSH profile through the existing SSH workflow.
- Selecting an FTP/SFTP profile opens the FTP page and connects/focuses a remote workspace for that profile.
- Selecting a Todo result opens Todo and selects that task.
- Selecting a Knowledge result opens Knowledge and selects the target node where available.
- Every route-triggered operation must include a unique request id so repeated selection of the same result still re-runs.

### R2. Local App And Shortcut Search

- Add provider id `app`.
- Index Windows Start Menu shortcuts from:
  - `%APPDATA%\Microsoft\Windows\Start Menu\Programs`
  - `%ProgramData%\Microsoft\Windows\Start Menu\Programs`
  - current user's Desktop
  - public Desktop
- Include `.lnk`, `.url`, and `.appref-ms`.
- Include executable entries from `PATH` only when they look launchable and can be deduplicated by path.
- Filter common uninstall/helper noise from ranking, but do not destructively ignore all nonstandard names.
- Execute app results with Electron `shell.openPath(path)` for shortcuts/exes and `shell.openExternal(url)` for `.url` targets when a URL can be read safely.

### R3. Everything File Search

- Add provider id `file`.
- Only run file search for non-empty queries.
- Query ES with bounded result count and timeout.
- Parse output into file/folder results with title, parent path, detail metadata when available, and an `open-path` action.
- Provide a secondary `show-in-folder` action type only if the UI later supports alternate actions; for this pass the primary action opens the file/folder.
- ES missing, Everything not running, timeout, or malformed output must be reported as provider-local empty/helpful results, not a launcher crash.

### R4. Config, Settings, And Safety

- Include `app` and `file` in config normalization and Settings toggles.
- Keep all OS interaction in Electron main process.
- No new package dependency.
- No renderer-side filesystem, child-process, database, or shell access.
- Provider failures remain isolated in `QuickLaunchService.search`.

### R5. Verification

- Extend `desktop/scripts/verify-quick-launch.cjs` to assert new provider/action markers and route handlers.
- Run:
  - `pnpm --dir desktop run verify:quick-launch`
  - `pnpm --dir desktop run lint`
  - `pnpm --dir desktop run build:app`
- Run a lightweight environment probe for Start Menu shortcuts and ES detection.

---

## Implementation Tasks

- [x] T1. Update contracts with provider ids and whitelisted actions.
  - Add `app` and `file` to `QuickLaunchProviderId`.
  - Add `open-app` only if app launch needs a distinct action; otherwise reuse `open-path`/`open-external`.
  - Add `show-path-in-folder` for file reveal support if needed.

- [x] T2. Fix action-to-route execution for existing profile/content providers.
  - Emit `openTerminalRequestId` and `openLocalProfileId` for terminal profiles.
  - Emit `openTerminalRequestId` and `connectSshProfileId` for SSH profiles.
  - Emit `openFtpRequestId` and `openFtpProfileId` for FTP profiles.
  - Keep `todoId`/`nodeId` query names, but add actual page watchers that consume them.

- [x] T3. Add route consumers to pages.
  - Terminal: use the existing `handleTerminalOpenRequestFromRoute` path; only align QuickLaunch query names unless legacy compatibility is needed.
  - FTP: add `handleFtpOpenRequestFromRoute` that reuses the existing profile connection logic.
  - Todo: import `useRoute`; after list and todos load, select the queried todo once per request id.
  - Knowledge: import `useRoute`; after initialization, call `store.selectNode(nodeId)` once per request id.

- [x] T4. Implement Windows app provider.
  - Create an indexer that scans shortcut roots and PATH directories in main process.
  - Deduplicate by normalized path/URL.
  - Score title, folder/category, path, and extension.
  - Cache the index with a short TTL and support `refreshIndex`.

- [x] T5. Implement Everything provider.
  - Create an ES client that detects `es.exe`, executes it with `execFile`, bounded timeout, and UTF-8 parsing.
  - Use flags that are stable across ES 1.4: `-n`, `-p`, `-size`, `-dm`, `-no-header` when supported by the chosen output format.
  - Treat ES exit code 8 as "Everything not running".
  - Convert results into `QuickLaunchResult` with `open-path`.

- [x] T6. Wire providers into service and config.
  - Add app/file providers to provider map.
  - Add app/file to default `enabledProviders` and normalizer allowlist.
  - Add Settings labels.
  - Ensure `refreshIndex` invokes provider refresh hooks when available.

- [x] T7. Verification and cleanup.
  - Extend marker verifier.
  - Run the required verification commands.
  - Update this plan's checkbox status and record verification evidence.

---

## Acceptance Criteria

- QuickLaunch search can return app and file results when providers are enabled.
- Clicking a terminal profile creates a terminal session for that profile instead of only showing `/terminal`.
- Clicking an SSH profile starts/focuses an SSH connection flow instead of only showing `/terminal`.
- Clicking an FTP/SFTP profile starts/focuses an FTP workspace instead of only showing `/ftp`.
- Clicking Todo/Knowledge results selects the concrete item after navigation.
- Missing ES/Everything never breaks unrelated providers.
- Build, lint, and QuickLaunch verifier pass.

---

## Verification Evidence

- `pnpm --dir desktop run verify:quick-launch` passed on 2026-06-11.
- Environment probe found 265 local shortcut entries across Start Menu/Desktop roots.
- Environment probe found `Everything.exe` at `D:\Softwares\scoop\shims\everything.exe` and no `es.exe`; the file provider therefore exercises the implemented missing-ES fallback on this machine.
- `pnpm --dir desktop run lint` passed on 2026-06-11.
- `pnpm --dir desktop run build:app` passed on 2026-06-11. Vite reported existing large chunk warnings only.
