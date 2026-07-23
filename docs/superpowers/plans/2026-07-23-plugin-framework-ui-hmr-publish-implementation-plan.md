# GuYanTools Plugin Framework UI, HMR, and Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a cross-framework plugin development platform with Web Components, shared Design Tokens, Vue/React Vite templates, local Vite HMR, and one-command packaging and Marketplace publication.

**Architecture:** Keep the existing sandboxed plugin runtime and generic host primitives. Extract a versioned `@guyantools/plugin-ui` DOM contract, a standalone `@guyantools/plugin-sdk`, a framework-aware `@guyantools/plugin-vite` preset, and a `@guyantools/plugin-cli`; the host adds authenticated local DevSessions that make `PluginRuntimeRouter` load loopback Vite URLs only in explicit developer mode.

**Tech Stack:** pnpm workspaces, TypeScript, Vite, Vue 3 `defineCustomElement`, React templates, Electron 37 `WebContentsView`, Electron preload/contextBridge, Vitest, Git CLI, GitHub CLI (`gh`), CSS Custom Properties, Custom Elements, Shadow DOM.

---

## Execution Notes

- Work from the approved design at `docs/superpowers/specs/2026-07-23-plugin-framework-ui-hmr-publish-design.md`.
- The current worktree has unrelated uncommitted changes in plugin host and media files. Before each implementation task, read the current diff for any file listed by that task and preserve compatible user changes.
- Do not add generated `dist/`, `node_modules/`, `.vite/`, native binaries, or release archives to the root repository.
- Use one focused commit per task milestone. Do not mix host runtime changes with unrelated feature changes.
- Preserve the existing `sandbox`, `contextIsolation`, `nodeIntegration: false`, `webSecurity`, sender-context permission checks, and FileGrant boundaries in every runtime change.

## File Map

### New workspace packages

- Create `packages/plugin-ui/package.json`: public UI package metadata and exports.
- Create `packages/plugin-ui/src/tokens.css`: versioned `--gt-*` Design Tokens.
- Create `packages/plugin-ui/src/elements/`: portable Custom Elements and DOM event contracts.
- Create `packages/plugin-ui/src/register.ts`: idempotent element registration.
- Create `packages/plugin-ui/src/vue.ts`: Vue convenience registration and types.
- Create `packages/plugin-ui/src/react.ts`: React JSX/event type adapters.
- Create `packages/plugin-ui/tests/`: token, element, event, and theme tests.
- Create `packages/plugin-sdk/package.json`: runtime SDK metadata and exports.
- Create `packages/plugin-sdk/src/contracts.ts`: canonical public plugin contracts.
- Create `packages/plugin-sdk/src/runtime.ts`: typed `pluginAPI` facade and invoke mapping.
- Create `packages/plugin-sdk/tests/`: runtime mapping and contract tests.
- Create `packages/plugin-vite/package.json`: Vite preset metadata and framework peer dependencies.
- Create `packages/plugin-vite/src/config.ts`: `defineGuYanPluginConfig` implementation.
- Create `packages/plugin-vite/src/build.ts`: UI/Worker output and manifest copy helpers.
- Create `packages/plugin-vite/tests/`: Vue and React fixture build tests.
- Create `packages/plugin-cli/package.json`: CLI metadata and executable.
- Create `packages/plugin-cli/src/commands/`: `create`, `dev`, `validate`, `build`, `pack`, `publish` commands.
- Create `packages/plugin-cli/src/templates/vue/` and `packages/plugin-cli/src/templates/react/`: generated plugin projects.
- Create `packages/plugin-cli/tests/`: command, artifact, and publication dry-run tests.

### Host contract and runtime files

- Modify `pnpm-workspace.yaml` and root `package.json` to include `packages/*` and workspace verification scripts.
- Modify `desktop/src/contracts/plugin_host.ts` for manifest 1.1, UI contract, theme API, and DevSession types.
- Modify `desktop/src/core/@types/index.d.ts` and `desktop/src/core/@types/plugin.d.ts` for public plugin SDK declarations.
- Modify `desktop/src/core/plugin_core/sdk/index.ts` and `desktop/src/core/plugin_core/preload.plugin.ts` to use the standalone SDK facade.
- Modify `desktop/src/main/plugin-host/manifest_resolver.ts` and `permission_manager.ts` for schema/API compatibility.
- Create `desktop/src/main/plugin-host/dev_session.ts` and `dev_channel.ts` for session state and local authenticated transport.
- Modify `desktop/src/main/plugin-host/runtime_router.ts`, `runtime_security.ts`, `ipc.ts`, and `index.ts` for dev URL mounting.
- Modify `desktop/src/windows/main/pages/Plugins/Plugins.vue` and `PluginRuntimePage.vue` for developer-mode controls and status.
- Create `desktop/src/main/plugin-host/dev_session.test.ts`, `dev_channel.test.ts`, and runtime regression tests.

### Fixtures, scripts, and documentation

- Create `desktop/src/main/plugin-host/fixtures/vue-plugin/` and `react-plugin/` with minimal production manifests and built-entry test sources.
- Create `desktop/scripts/verify-plugin-framework.cjs` for clean-build, artifact, and runtime-contract checks.
- Modify `desktop/package.json` and root `package.json` with package build, fixture, HMR, and verification scripts.
- Create `packages/plugin-cli/README.md` and `packages/plugin-ui/README.md` with public APIs and release workflow.

---

## Task 1: Add Workspace Boundaries and Manifest 1.1 Contracts

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `desktop/src/contracts/plugin_host.ts`
- Modify: `desktop/src/core/@types/index.d.ts`
- Modify: `desktop/src/core/@types/plugin.d.ts`
- Modify: `desktop/src/main/plugin-host/manifest_resolver.ts`
- Modify: `desktop/src/main/plugin-host/permission_manager.ts`
- Test: `desktop/src/main/plugin-host/manifest_resolver.test.ts`
- Test: `desktop/src/main/plugin-host/permission_manager.test.ts`

- [ ] **Step 1: Write failing manifest compatibility tests.**

Add tests for accepting existing schema `1.0`, accepting new schema `1.1` with `uiApiVersion` and `ui`, rejecting `uiApiVersion` without a compatible range, preserving `capabilities`/`permissions` separation, and rejecting a production manifest that contains a dev URL. Use concrete assertions:

Define this test-local helper before the assertions:

```ts
function validManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    schemaVersion: '1.1', id: 'example.plugin', name: 'example-plugin',
    displayName: 'Example Plugin', version: '1.0.0', description: '',
    pluginApiVersion: '1.0.0', hostVersionRange: '>=1.0.0',
    trustLevel: 'sandboxed', runtime: 'ui', entry: { ui: 'index.html' },
    permissions: [], capabilities: [], contributes: {}, ...overrides,
  };
}

const permissionManager = new PluginPermissionManager();
```

```ts
expect(() => validatePluginManifest(validManifest({ schemaVersion: '1.1', uiApiVersion: '1.0.0' }))).not.toThrow();
expect(() => permissionManager.validateCompatibility(validManifest({ uiApiVersion: '2.0.0' }))).toThrow('PLUGIN_UI_API_VERSION_UNSUPPORTED');
expect(() => validatePluginManifest(validManifest({ capabilities: [], permissions: [] }))).not.toThrow();
expect(() => validatePluginManifest({ ...validManifest(), dev: { uiUrl: 'http://127.0.0.1:5173' } })).toThrow('PLUGIN_MANIFEST_DEV_FIELD');
```

- [ ] **Step 2: Run the focused tests and verify the new contract fails.**

Run:

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/manifest_resolver.test.ts src/main/plugin-host/permission_manager.test.ts
```

Expected: FAIL because the current manifest type and resolver only recognize schema `1.0` and do not validate UI compatibility.

- [ ] **Step 3: Add canonical public contract types.**

Extend `PluginManifest` with `uiApiVersion?: string` and `ui?: { theme: 'guyantools'; components: string }`. Add:

```ts
export interface PluginThemeDescriptor {
  mode: 'light' | 'dark';
  tokensVersion: string;
}

export interface PluginDevSession {
  pluginId: string;
  rootPath: string;
  uiUrl: string;
  workerUrl?: string;
  host: '127.0.0.1';
  port: number;
  sessionToken: string;
  processId?: number;
  startedAt: string;
}
```

Keep `schemaVersion` as `'1.0' | '1.1'` during migration. Do not remove existing permissions, capabilities, contributions, or runtime kinds.

- [ ] **Step 4: Implement resolver and permission checks.**

Accept `1.0` and `1.1`, require `uiApiVersion` only when `ui` is present, validate `ui.theme === 'guyantools'`, and reject `dev`, `devServer`, `uiUrl`, or `workerUrl` fields in a production manifest. Use the existing `fail(code, message)` error convention. Keep host/API version checks independent from application version checks.

- [ ] **Step 5: Run tests, typecheck the affected package, and commit.**

Run:

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/manifest_resolver.test.ts src/main/plugin-host/permission_manager.test.ts
pnpm --dir desktop run typecheck
```

Expected: focused tests PASS and typecheck exits 0.

Commit:

```powershell
git add pnpm-workspace.yaml package.json desktop/src/contracts/plugin_host.ts desktop/src/core/@types desktop/src/main/plugin-host/manifest_resolver.ts desktop/src/main/plugin-host/permission_manager.ts desktop/src/main/plugin-host/*.test.ts
git commit -m "feat(plugins): add public UI and dev session contracts"
```

## Task 2: Extract the Cross-Framework UI Package

**Files:**
- Create: `packages/plugin-ui/package.json`
- Create: `packages/plugin-ui/tsconfig.json`
- Create: `packages/plugin-ui/vite.config.ts`
- Create: `packages/plugin-ui/src/tokens.css`
- Create: `packages/plugin-ui/src/elements/gt-button.ts`
- Create: `packages/plugin-ui/src/elements/gt-input.ts`
- Create: `packages/plugin-ui/src/elements/gt-card.ts`
- Create: `packages/plugin-ui/src/elements/gt-dialog.ts`
- Create: `packages/plugin-ui/src/register.ts`
- Create: `packages/plugin-ui/src/vue.ts`
- Create: `packages/plugin-ui/src/react.ts`
- Test: `packages/plugin-ui/tests/gt-elements.test.ts`
- Test: `packages/plugin-ui/tests/tokens.test.ts`

- [ ] **Step 1: Write failing DOM contract tests.**

Use Vitest with a DOM environment. Assert that registration is idempotent, attributes reflect to properties, and events use the public `gt-*` contract:

```ts
registerGuYanElements();
registerGuYanElements();
const button = document.createElement('gt-button');
button.setAttribute('variant', 'primary');
const received = vi.fn();
button.addEventListener('gt-click', received);
document.body.append(button);
button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
expect(received).toHaveBeenCalledOnce();
expect((button as HTMLElement).dataset.variant).toBe('primary');
```

Assert that `tokens.css` contains `--gt-color-background`, `--gt-color-surface`, `--gt-color-text`, `--gt-color-primary`, `--gt-control-height`, and both light/dark selectors.

- [ ] **Step 2: Run the UI tests to verify they fail.**

Run:

```powershell
pnpm --dir packages/plugin-ui exec vitest run tests/gt-elements.test.ts tests/tokens.test.ts
```

Expected: FAIL because the package and custom elements do not exist.

- [ ] **Step 3: Add the package and token exports.**

Create package exports so consumers can import:

```json
{
  "name": "@guyantools/plugin-ui",
  "exports": {
    "./tokens.css": "./dist/tokens.css",
    ".": "./dist/index.js",
    "./vue": "./dist/vue.js",
    "./react": "./dist/react.js"
  }
}
```

Extract semantic values from `desktop/src/windows/main/assets/cssvars.scss`, `theme.scss`, and `foundation.scss` into `tokens.css` using the stable `--gt-*` namespace. Do not copy host-only selectors or absolute asset paths.

- [ ] **Step 4: Implement the first Custom Elements.**

Use Vue 3 `defineCustomElement` as the migration bridge for portable controls. The public wrapper must expose DOM attributes/properties and dispatch `CustomEvent`s; it must not expose Vue emits, Pinia, router, Electron, or host paths. Implement the first four elements with the same interface:

```ts
export type GuYanButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface GuYanButtonClickDetail {
  disabled: boolean;
}
```

Add `gt-button`, `gt-input`, `gt-card`, and `gt-dialog`. Keep complex file/tree/menu controls out of this task.

- [ ] **Step 5: Add framework adapters and theme registration.**

`register.ts` must be safe to call more than once. `vue.ts` exports `registerGuYanVueElements()`. `react.ts` exports JSX intrinsic element declarations and event detail types without creating a React-specific component implementation. Custom Elements must inherit `--gt-*` tokens through Shadow DOM.

- [ ] **Step 6: Run UI package tests and build.**

Run:

```powershell
pnpm --dir packages/plugin-ui exec vitest run tests/gt-elements.test.ts tests/tokens.test.ts
pnpm --dir packages/plugin-ui run build
```

Expected: all tests PASS; `packages/plugin-ui/dist/tokens.css` and `dist/index.js` exist.

- [ ] **Step 7: Commit the UI package.**

```powershell
git add packages/plugin-ui
git commit -m "feat(plugins): publish cross-framework UI primitives"
```

## Task 3: Extract the Standalone Plugin SDK and Theme Bridge

**Files:**
- Create: `packages/plugin-sdk/package.json`
- Create: `packages/plugin-sdk/src/contracts.ts`
- Create: `packages/plugin-sdk/src/runtime.ts`
- Create: `packages/plugin-sdk/src/index.ts`
- Test: `packages/plugin-sdk/tests/runtime.test.ts`
- Modify: `desktop/src/contracts/plugin_host.ts`
- Modify: `desktop/src/core/plugin_core/sdk/index.ts`
- Modify: `desktop/src/core/plugin_core/preload.plugin.ts`
- Modify: `desktop/src/core/@types/index.d.ts`
- Test: `desktop/src/main/plugin-host/theme_bridge.test.ts`

- [ ] **Step 1: Write failing SDK invoke and theme tests.**

Test that every public SDK method maps to a named `plugin-runtime:*` channel and that theme subscriptions return a cleanup function. Use a fake invoke function:

```ts
const calls: Array<[string, ...unknown[]]> = [];
const api = createPluginApi((channel, ...args) => {
  calls.push([channel, ...args]);
  return Promise.resolve({ mode: 'dark', tokensVersion: '1.0.0' });
});
await api.ui.getTheme();
expect(calls[0][0]).toBe('plugin-runtime:ui:get-theme');
```

- [ ] **Step 2: Run tests and verify failure.**

```powershell
pnpm --dir packages/plugin-sdk exec vitest run tests/runtime.test.ts
```

Expected: FAIL because the SDK package and theme methods are absent.

- [ ] **Step 3: Make `packages/plugin-sdk` the public runtime facade.**

Move the type declarations currently duplicated in the desktop plugin SDK into `packages/plugin-sdk/src/contracts.ts`. Preserve the existing channel names and return shapes. Export `PluginRuntimeApi`, `PluginRuntimeContext`, `PluginManifest`, `PluginDevSession`, `PluginThemeDescriptor`, media types, and `createPluginApi`.

- [ ] **Step 4: Add theme runtime methods.**

Add to `PluginRuntimeApi.ui`:

```ts
getTheme: () => Promise<PluginThemeDescriptor>;
onThemeChanged: (listener: (theme: PluginThemeDescriptor) => void) => () => void;
```

Implement `onThemeChanged` with a preload event subscription that removes the exact listener on cleanup. Keep `window.pluginAPI` typed from the package instead of a second incomplete declaration.

- [ ] **Step 5: Re-export the SDK from the desktop bridge.**

Make `desktop/src/core/plugin_core/sdk/index.ts` re-export the package implementation, and keep `preload.plugin.ts` responsible only for `ipcRenderer.invoke` plus the context bridge. Do not expose `ipcRenderer` itself to plugin pages.

- [ ] **Step 6: Run SDK and desktop tests.**

```powershell
pnpm --dir packages/plugin-sdk exec vitest run tests/runtime.test.ts
pnpm --dir desktop exec vitest run src/main/plugin-host/theme_bridge.test.ts
pnpm --dir desktop run typecheck
```

Expected: all focused tests PASS and typecheck exits 0.

- [ ] **Step 7: Commit the SDK bridge.**

```powershell
git add packages/plugin-sdk desktop/src/contracts/plugin_host.ts desktop/src/core/plugin_core/sdk desktop/src/core/plugin_core/preload.plugin.ts desktop/src/core/@types desktop/src/main/plugin-host/theme_bridge.test.ts
git commit -m "feat(plugins): expose standalone runtime SDK"
```

## Task 4: Build the Vite Preset and Vue/React Templates

**Files:**
- Create: `packages/plugin-vite/package.json`
- Create: `packages/plugin-vite/src/config.ts`
- Create: `packages/plugin-vite/src/build.ts`
- Create: `packages/plugin-vite/src/manifest.ts`
- Test: `packages/plugin-vite/tests/build.test.ts`
- Create: `packages/plugin-cli/src/templates/vue/`
- Create: `packages/plugin-cli/src/templates/react/`
- Create: `packages/plugin-cli/src/templates/shared/guyantools.plugin.json`
- Create: `packages/plugin-cli/src/templates/shared/README.md`

- [ ] **Step 1: Write fixture build tests.**

Create one Vue and one React fixture in the test temporary directory. Assert that the preset emits `dist/index.html`, `dist/assets/*`, `dist/worker.js`, and a copied manifest whose entry paths are `dist/index.html` and `dist/worker.js`.

Define the test helper as `async function buildFixture(framework: 'vue' | 'react'): Promise<{ exitCode: number; outDir: string }>`; it must create the fixture in a temporary directory, invoke the preset build, and return the output directory.

```ts
const result = await buildFixture('react');
expect(result.exitCode).toBe(0);
expect(await fs.pathExists(path.join(result.outDir, 'index.html'))).toBe(true);
expect(await fs.pathExists(path.join(result.outDir, 'worker.js'))).toBe(true);
expect((await fs.readJson(path.join(result.outDir, 'guyantools.plugin.json'))).entry.ui).toBe('dist/index.html');
```

- [ ] **Step 2: Run the build tests and verify failure.**

```powershell
pnpm --dir packages/plugin-vite exec vitest run tests/build.test.ts
```

Expected: FAIL because no preset or fixture builder exists.

- [ ] **Step 3: Implement `defineGuYanPluginConfig`.**

The config must accept:

```ts
export interface GuYanPluginViteOptions {
  framework: 'vue' | 'react';
  uiEntry: string;
  workerEntry?: string;
  manifestPath?: string;
}
```

Use `@vitejs/plugin-vue` for Vue and `@vitejs/plugin-react` for React. Use `base: './'` for production, `host: '127.0.0.1'` for development, and emit the worker as a stable `worker.js` entry. Do not add Electron or Node polyfills to plugin bundles.

- [ ] **Step 4: Implement manifest copy and output validation.**

Copy only the production manifest into `dist/guyantools.plugin.json`. Reject manifests containing `dev`, `devServer`, `uiUrl`, or `workerUrl`; reject output entries that escape `dist`; and fail the build if `uiEntry` or `workerEntry` is missing from the final output.

- [ ] **Step 5: Add Vue and React templates.**

The generated templates must import `pluginAPI` from `@guyantools/plugin-sdk`, register `@guyantools/plugin-ui`, and render a page with one `gt-card`, one `gt-input`, and one `gt-button`. The React template must include a `JSX.IntrinsicElements` type import from `@guyantools/plugin-ui/react`.

- [ ] **Step 6: Run both fixture builds and typecheck.**

```powershell
pnpm --dir packages/plugin-vite exec vitest run tests/build.test.ts
pnpm --dir packages/plugin-vite run build
pnpm --dir packages/plugin-cli run typecheck
```

Expected: Vue and React fixture builds PASS; the preset package emits declarations; CLI template types pass.

- [ ] **Step 7: Commit the Vite preset and templates.**

```powershell
git add packages/plugin-vite packages/plugin-cli/src/templates
git commit -m "feat(plugins): add Vue and React Vite templates"
```

## Task 5: Add Authenticated Local DevSessions

**Files:**
- Create: `desktop/src/main/plugin-host/dev_session.ts`
- Create: `desktop/src/main/plugin-host/dev_channel.ts`
- Test: `desktop/src/main/plugin-host/dev_session.test.ts`
- Test: `desktop/src/main/plugin-host/dev_channel.test.ts`
- Modify: `desktop/src/contracts/plugin_host.ts`
- Modify: `desktop/src/main/plugin-host/runtime_security.ts`
- Modify: `desktop/src/main/plugin-host/index.ts`

- [ ] **Step 1: Write failing DevSession validation tests.**

Cover valid loopback UI/Worker URLs, rejection of remote hosts, rejection of non-HTTP(S) URLs, plugin ID mismatch, expired tokens, and duplicate session replacement.

Define `type DevSessionTestOverrides = Partial<Omit<PluginDevSession, 'host'>> & { host?: string }` and `function validSession(overrides: DevSessionTestOverrides = {}): PluginDevSession` with a valid `example.plugin` ID, `127.0.0.1` host, port `5173`, loopback UI URL, random-looking token, and current `startedAt`. Cast the merged fixture to `PluginDevSession` only after passing it through the runtime validator so invalid-host tests remain type-safe.

```ts
expect(() => validateDevSession(validSession())).not.toThrow();
expect(() => validateDevSession(validSession({ uiUrl: 'https://example.com' }))).toThrow('PLUGIN_DEV_ORIGIN_DENIED');
expect(() => validateDevSession(validSession({ host: '192.168.1.2' }))).toThrow('PLUGIN_DEV_ORIGIN_DENIED');
```

- [ ] **Step 2: Run the tests and verify failure.**

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/dev_session.test.ts src/main/plugin-host/dev_channel.test.ts
```

Expected: FAIL because DevSession state and transport do not exist.

- [ ] **Step 3: Implement the in-memory DevSession manager.**

Provide methods with these signatures:

```ts
class PluginDevSessionManager {
  connect(session: PluginDevSession): PluginDevSession;
  get(pluginId: string): PluginDevSession | null;
  list(): PluginDevSession[];
  disconnect(pluginId: string): void;
  disconnectAll(): void;
}
```

Export `validateDevSession(input: unknown): asserts input is PluginDevSession` beside the manager. It must validate the session shape before the manager stores it.

Store sessions in memory only. Validate the root path, plugin ID, loopback URLs, port range, token length, and started-at timestamp before inserting. Connecting a second session for the same plugin must disconnect the first one.

- [ ] **Step 4: Implement the local authenticated channel.**

Expose a transport-independent interface:

```ts
interface PluginDevChannel {
  start(): Promise<{ address: string; token: string }>;
  accept(input: { token: string; session: PluginDevSession }): Promise<PluginDevSession>;
  stop(): Promise<void>;
}
```

Use a Windows named pipe first and a loopback HTTP fallback only when the named pipe cannot be created. Never bind `0.0.0.0`. The token comparison must be constant-time and the channel must stop on app shutdown.

- [ ] **Step 5: Preserve runtime security for dev URLs.**

Add a dedicated `isAllowedPluginDevUrl(url)` helper. Keep the existing sandbox preferences unchanged; only the URL allowlist changes for a validated, active session. Reject a dev URL when no active session exists, even if it is loopback.

- [ ] **Step 6: Run security tests and commit.**

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/dev_session.test.ts src/main/plugin-host/dev_channel.test.ts src/main/plugin-host/runtime_security.test.ts
pnpm --dir desktop run typecheck
```

Expected: all tests PASS and typecheck exits 0.

```powershell
git add desktop/src/main/plugin-host/dev_session.ts desktop/src/main/plugin-host/dev_channel.ts desktop/src/main/plugin-host/dev_session.test.ts desktop/src/main/plugin-host/dev_channel.test.ts desktop/src/main/plugin-host/runtime_security.ts desktop/src/main/plugin-host/index.ts desktop/src/contracts/plugin_host.ts
git commit -m "feat(plugins): add authenticated local dev sessions"
```

## Task 6: Mount Vite URLs and Synchronize Plugin Theme

**Files:**
- Modify: `desktop/src/main/plugin-host/runtime_router.ts`
- Modify: `desktop/src/main/plugin-host/ipc.ts`
- Modify: `desktop/src/main/plugin-host/index.ts`
- Modify: `desktop/src/main/plugin-host/host_services.ts`
- Modify: `desktop/src/windows/main/pages/Plugins/PluginRuntimePage.vue`
- Test: `desktop/src/main/plugin-host/runtime_router.test.ts`
- Test: `desktop/src/main/plugin-host/theme_bridge.test.ts`

- [ ] **Step 1: Write failing router tests.**

Assert that a production record loads its resolved file entry, an active DevSession loads `uiUrl`, a missing session falls back to the file entry, and a Worker uses `workerUrl` only while the session is active. Assert that `sandbox`, `contextIsolation`, `nodeIntegration: false`, and `webSecurity` remain unchanged.

- [ ] **Step 2: Run the router tests and verify failure.**

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/runtime_router.test.ts
```

Expected: FAIL because the router currently accepts only resolved file paths.

- [ ] **Step 3: Add DevSession-aware URL selection.**

Add a router dependency on `PluginDevSessionManager`. Select URLs with this rule:

```ts
const session = devSessions.get(record.manifest.id);
const uiUrl = session?.uiUrl ?? `file://${record.resolvedEntryPaths.ui}`;
const workerUrl = session?.workerUrl ?? `file://${record.resolvedEntryPaths.worker}`;
```

Before loading the URL, validate it against the active session and reject if the URL no longer matches the stored token/session origin. Keep page and worker runtime contexts bound to the registered plugin ID and approved permissions.

- [ ] **Step 4: Add theme IPC and event forwarding.**

Add `plugin-runtime:ui:get-theme` and `plugin-runtime:ui:theme-changed` channels. The main process obtains the current app theme from `appConfigManager`, returns `{ mode, tokensVersion }`, and broadcasts only to WebContents instances whose runtime context belongs to a mounted plugin. Add cleanup when the WebContents is destroyed.

- [ ] **Step 5: Add developer status to the runtime page.**

`PluginRuntimePage.vue` must show a compact local-development status only when the route has an active DevSession. It must display reconnecting/disconnected/error states without changing the plugin surface bounds. On unmount, stop observing bounds and unmount the page as today.

- [ ] **Step 6: Run router, theme, and desktop checks.**

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/runtime_router.test.ts src/main/plugin-host/theme_bridge.test.ts
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
```

Expected: all focused tests PASS and the desktop app build exits 0.

- [ ] **Step 7: Commit runtime mounting and theme synchronization.**

```powershell
git add desktop/src/main/plugin-host/runtime_router.ts desktop/src/main/plugin-host/ipc.ts desktop/src/main/plugin-host/index.ts desktop/src/main/plugin-host/host_services.ts desktop/src/windows/main/pages/Plugins/PluginRuntimePage.vue desktop/src/main/plugin-host/runtime_router.test.ts desktop/src/main/plugin-host/theme_bridge.test.ts
git commit -m "feat(plugins): mount local Vite runtime and sync theme"
```

## Task 7: Add Plugin CLI Commands and Dev Server Attach

**Files:**
- Create: `packages/plugin-cli/src/index.ts`
- Create: `packages/plugin-cli/src/commands/create.ts`
- Create: `packages/plugin-cli/src/commands/dev.ts`
- Create: `packages/plugin-cli/src/commands/validate.ts`
- Create: `packages/plugin-cli/src/commands/build.ts`
- Create: `packages/plugin-cli/src/commands/pack.ts`
- Create: `packages/plugin-cli/src/commands/publish.ts`
- Create: `packages/plugin-cli/src/session_file.ts`
- Test: `packages/plugin-cli/tests/create.test.ts`
- Test: `packages/plugin-cli/tests/dev.test.ts`
- Test: `packages/plugin-cli/tests/pack.test.ts`
- Modify: `packages/plugin-vite/src/config.ts`

- [ ] **Step 1: Write failing CLI tests.**

Test that `create --framework vue` and `create --framework react` produce the correct entry files and manifest; `validate` returns a nonzero result for a missing entry; `pack` excludes `node_modules`, `.guyantools/plugin.dev.json`, and source maps when production packaging is configured; and `dev` writes a session file with only loopback URLs.

Define `async function runCli(args: string[], options: { cwd: string }): Promise<{ exitCode: number; stdout: string; stderr: string }>` as the test harness around the CLI executable.

```ts
const result = await runCli(['create', 'demo', '--framework', 'react'], { cwd: tempDir });
expect(result.exitCode).toBe(0);
expect(await fs.pathExists(path.join(tempDir, 'demo', 'src/ui/main.tsx'))).toBe(true);
expect((await fs.readJson(path.join(tempDir, 'demo', 'guyantools.plugin.json'))).runtime).toBe('hybrid');
```

- [ ] **Step 2: Run CLI tests and verify failure.**

```powershell
pnpm --dir packages/plugin-cli exec vitest run tests/create.test.ts tests/dev.test.ts tests/pack.test.ts
```

Expected: FAIL because the executable and command modules do not exist.

- [ ] **Step 3: Implement `create`, `validate`, and `build`.**

Use a small argument parser with explicit commands and options. `create` copies the selected template and replaces the plugin ID/name. `validate` calls the SDK manifest validator and Vite output checks. `build` calls `@guyantools/plugin-vite` and prints the absolute `dist` directory plus a machine-readable JSON result.

- [ ] **Step 4: Implement `dev`.**

Spawn the plugin's own Vite dev server with `shell: false`, `cwd` set to the plugin root, and `--host 127.0.0.1`. Parse the server's actual port from its startup output, generate a cryptographically random session token, write `.guyantools/plugin.dev.json` with restrictive file permissions, and send the session through the local DevChannel. Stop the child process and delete the session file on SIGINT, SIGTERM, or command failure.

The generated session file must have this exact public shape:

```json
{
  "pluginId": "example.media-tool",
  "uiUrl": "http://127.0.0.1:5173/index.html",
  "workerUrl": "http://127.0.0.1:5173/worker.html",
  "sessionToken": "runtime-generated"
}
```

- [ ] **Step 5: Implement `pack`.**

Run `validate` and `build`, copy only `dist/`, the production manifest, README, and LICENSE into a temporary staging directory, create a reproducible zip, calculate SHA-256, and emit `catalog-entry.json`. Fail before writing a release archive if any dev field, absolute path, `node_modules`, or session token is present.

- [ ] **Step 6: Run CLI tests, typecheck, and a clean package build.**

```powershell
pnpm --dir packages/plugin-cli exec vitest run tests/create.test.ts tests/dev.test.ts tests/pack.test.ts
pnpm --dir packages/plugin-cli run typecheck
pnpm --dir packages/plugin-cli run build
```

Expected: all tests PASS, the CLI executable builds, and a generated Vue/React fixture can be packed without development files.

- [ ] **Step 7: Commit the CLI and dev attach flow.**

```powershell
git add packages/plugin-cli packages/plugin-vite/src/config.ts
git commit -m "feat(plugins): add plugin development and packaging CLI"
```

## Task 8: Implement Release and Marketplace Publication

**Files:**
- Modify: `packages/plugin-cli/src/commands/publish.ts`
- Create: `packages/plugin-cli/src/publish/github_release.ts`
- Create: `packages/plugin-cli/src/publish/catalog_entry.ts`
- Create: `packages/plugin-cli/src/publish/publish_config.ts`
- Test: `packages/plugin-cli/tests/publish.test.ts`
- Modify: `desktop/src/main/plugin-host/marketplace_resolver.ts` only if catalog output needs a new optional field
- Test: `desktop/src/main/plugin-host/marketplace_resolver.test.ts` only if catalog output changes

- [ ] **Step 1: Write publish dry-run tests.**

Mock Git and GitHub CLI invocations. Assert that a valid package produces a tag, release asset, SHA-256, and catalog entry with `id`, `version`, `repository`, `ref`, `refType`, `resolvedCommit`, `permissions`, and `capabilities`. Assert that missing credentials or a catalog mismatch returns a failure without reporting success.

Define `function validPublishConfig(): PublishConfig` in the test fixture with a temporary plugin repository, `sakurapole` Marketplace ID, `pull-request` catalog mode, and `releaseAsset: true`. Import the command implementation as `publish(options: { config: PublishConfig; dryRun?: boolean }): Promise<PublishResult>` and pass `dryRun: true` outside the config object.

```ts
const result = await publish({ dryRun: true, config: validPublishConfig() });
expect(result.catalogEntry.refType).toBe('tag');
expect(result.commands.some(command => command.includes('gh release create'))).toBe(true);
```

- [ ] **Step 2: Run the publish tests and verify failure.**

```powershell
pnpm --dir packages/plugin-cli exec vitest run tests/publish.test.ts
```

Expected: FAIL because release and catalog generators do not exist.

- [ ] **Step 3: Implement config and artifact generation.**

Read `.guyantools/publish.json`, require a repository URL and Marketplace ID, derive the tag from the manifest version, and generate a catalog entry that exactly matches the built manifest. Do not derive permissions or capabilities from a CLI argument; read them from the validated manifest.

Export these command contracts from `packages/plugin-cli/src/publish/publish_config.ts`:

```ts
export interface PublishConfig {
  repository: string;
  marketplace: string;
  catalogMode: 'pull-request' | 'direct';
  releaseAsset: boolean;
}

export interface PublishResult {
  tag: string;
  releaseAssetPath: string;
  catalogEntry: MarketplacePluginSummary;
  commands: string[];
}
```

- [ ] **Step 4: Implement GitHub Release execution.**

Use `git tag` and `gh release create` through `spawn` with `shell: false`. Support `--dry-run`, `--no-push`, and `--catalog-mode pull-request|direct`. Capture stdout/stderr and return structured errors. Require `GH_TOKEN` or an authenticated `gh` session before a non-dry-run operation.

- [ ] **Step 5: Implement Marketplace update behavior.**

For `pull-request`, clone or fetch the configured catalog repository, update only the plugin entry, run catalog schema validation, create a branch, commit, push, and open a PR. For `direct`, require an explicit repository write permission and update the catalog on the configured branch. Never alter unrelated catalog entries.

- [ ] **Step 6: Run publication checks.**

```powershell
pnpm --dir packages/plugin-cli exec vitest run tests/publish.test.ts
pnpm --dir desktop exec vitest run src/main/plugin-host/marketplace_resolver.test.ts
pnpm --dir packages/plugin-cli run typecheck
```

Expected: dry-run and failure-path tests PASS; the existing Marketplace resolver regression suite remains green.

- [ ] **Step 7: Commit publication support.**

```powershell
git add packages/plugin-cli/src/commands/publish.ts packages/plugin-cli/src/publish packages/plugin-cli/tests/publish.test.ts desktop/src/main/plugin-host/marketplace_resolver.ts desktop/src/main/plugin-host/marketplace_resolver.test.ts
git commit -m "feat(plugins): add release and marketplace publishing"
```

## Task 9: Add Host Developer Controls and End-to-End Fixtures

**Files:**
- Modify: `desktop/src/windows/main/pages/Plugins/Plugins.vue`
- Modify: `desktop/src/windows/main/pages/Plugins/PluginRuntimePage.vue`
- Modify: `desktop/src/preload.ts` only if management APIs need a new typed method
- Modify: `desktop/src/contracts/plugin_host.ts`
- Create: `desktop/src/windows/main/pages/Plugins/plugin_dev_session.ts`
- Test: `desktop/src/windows/main/pages/Plugins/plugin_dev_session.test.ts`
- Create: `desktop/src/main/plugin-host/fixtures/vue-plugin/`
- Create: `desktop/src/main/plugin-host/fixtures/react-plugin/`
- Create: `desktop/scripts/verify-plugin-framework.cjs`
- Modify: `desktop/package.json`
- Modify: `package.json`

- [ ] **Step 1: Write pure UI state tests.**

Test the developer control state transitions `disconnected -> connecting -> connected -> reconnecting -> disconnected`, and ensure an installed Marketplace plugin cannot be marked as a local DevSession. Keep these tests independent of Vue mounting.

- [ ] **Step 2: Implement the host developer controls.**

Add explicit local-plugin actions to the Installed tab: connect local dev session, show connected port/status, reconnect, and stop. Do not show developer controls for Marketplace records unless the user selects a separate local checkout. Keep installed/Marketplace workflows separate.

- [ ] **Step 3: Add Vue and React host fixtures.**

Each fixture must have a valid manifest, one page contribution, one Worker entry, one `gt-card`, one `gt-button`, and one runtime API call. The fixtures must be small enough for `verify-plugin-framework.cjs` to build repeatedly.

- [ ] **Step 4: Implement the verification script.**

`verify-plugin-framework.cjs` must run the following checks and exit nonzero on the first failure:

```powershell
pnpm --dir packages/plugin-ui run build
pnpm --dir packages/plugin-sdk run build
pnpm --dir packages/plugin-vite run build
pnpm --dir packages/plugin-cli run build
pnpm --dir packages/plugin-cli exec vitest run tests/create.test.ts tests/dev.test.ts tests/pack.test.ts tests/publish.test.ts
pnpm --dir desktop exec vitest run src/main/plugin-host src/windows/main/pages/Plugins/plugin_dev_session.test.ts
```

Then inspect both fixture `dist/` directories for production manifest, static UI entry, Worker entry, absence of dev fields, absence of absolute paths, and valid `gt-*` imports.

- [ ] **Step 5: Run end-to-end verification.**

```powershell
pnpm run verify:plugin-framework
pnpm --dir desktop run typecheck
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
git diff --check
```

Expected: all package, host, fixture, typecheck, lint, and app build checks PASS. A full Electron startup is not claimed unless a real startup smoke test captures the window and plugin page.

- [ ] **Step 6: Commit host controls and fixtures.**

```powershell
git add desktop/src/windows/main/pages/Plugins desktop/src/contracts/plugin_host.ts desktop/src/main/plugin-host/fixtures desktop/scripts/verify-plugin-framework.cjs desktop/package.json package.json
git commit -m "test(plugins): verify framework templates and local HMR"
```

## Task 10: Documentation, Final Regression, and Handoff

**Files:**
- Modify: `packages/plugin-ui/README.md`
- Modify: `packages/plugin-cli/README.md`
- Create: `docs/desktop/PLUGIN_DEVELOPMENT.md`
- Modify: `README.md` only if the repository needs a top-level plugin developer entry point
- Test: `desktop/scripts/verify-plugin-framework.cjs`

- [ ] **Step 1: Document the developer workflow.**

Document the exact flow:

```powershell
pnpm create guyantools-plugin demo --framework vue
cd demo
pnpm install
pnpm run dev
pnpm run validate
pnpm run build
pnpm run pack
pnpm run publish -- --dry-run
```

Document that production plugins must not contain dev URLs, Node/Electron imports, arbitrary command execution, or undeclared permissions.

- [ ] **Step 2: Run the complete validation matrix.**

```powershell
pnpm install
pnpm run verify:plugin-framework
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
pnpm --dir desktop run test:plugin-platform
cargo test --manifest-path multi_platform_core/Cargo.toml
git diff --check
```

Expected: all commands exit 0. If Rust or native build is blocked by an unrelated environment issue, record the exact blocker and do not claim full verification.

- [ ] **Step 3: Review the final diff for boundaries.**

Confirm that no plugin host service contains site-specific parsing, no package imports `desktop/src`, no release artifact is staged, and all existing user changes outside the plan remain untouched.

- [ ] **Step 4: Commit documentation and final verification updates.**

```powershell
git add packages/plugin-ui/README.md packages/plugin-cli/README.md docs/desktop/PLUGIN_DEVELOPMENT.md desktop/scripts/verify-plugin-framework.cjs
git commit -m "docs(plugins): document framework development workflow"
```

If the top-level `README.md` is updated, stage it in a separate reviewed commit so unrelated user edits cannot be included accidentally.

## Spec Coverage Checklist

| Design requirement | Implemented by |
| --- | --- |
| Cross-framework Web Components | Tasks 2 and 9 |
| Shared Design Tokens and theme changes | Tasks 2, 3, and 6 |
| Vue and React templates | Tasks 4 and 9 |
| Standalone typed SDK | Task 3 |
| Plugin-owned Vite dev server | Tasks 4, 7, and 9 |
| Authenticated loopback HMR | Tasks 5, 6, and 7 |
| Production static output | Tasks 4, 7, and 8 |
| One-command pack/publish | Tasks 7 and 8 |
| Marketplace catalog consistency | Task 8 |
| Sandbox and permission boundary | Tasks 1, 5, 6, and 10 |
| Documentation and acceptance evidence | Task 10 |

## Final Verification Commands

Run from the repository root after all tasks:

```powershell
pnpm install
pnpm run verify:plugin-framework
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
pnpm --dir desktop run test:plugin-platform
cargo test --manifest-path multi_platform_core/Cargo.toml
git diff --check
```

The completion report must list each command, its result, and any verification boundary. Do not state that desktop startup or live HMR was verified unless a real Electron process loaded a fixture and the change was observed.
