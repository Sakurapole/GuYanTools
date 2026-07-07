# Quick Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GuYanTools desktop quick launcher that can be opened by a global shortcut, search internal tools and user data, and execute safe host actions from a focused floating window.

**Execution Status (2026-06-10):** Implemented in `desktop/src/main/quick-launch`, `desktop/src/windows/quick-launch`, app config, shortcuts, preload, Settings, Vite entry, verification script, and checklist. Verified with `pnpm --dir desktop run verify:quick-launch`, `pnpm --dir desktop run lint`, `pnpm --dir desktop run build:app`, plus a headless Chrome render check of the production `quick_launcher.html`.

**Architecture:** Implement a Flow Launcher style query pipeline in Electron main process, with a uTools style command contribution model for built-in features and existing plugins. The renderer window stays thin: it captures input, renders ranked results, and asks the main process to search or execute whitelisted actions. Providers are small main-process modules that can be tested independently and expanded from built-in app routes to terminal, SSH, FTP, Todo, Knowledge, plugin pages, and later OS apps or file search.

**Tech Stack:** Electron 37, Electron `globalShortcut`, `BrowserWindow`, Vite multi-entry renderer, Vue 3, TypeScript contracts, existing preload IPC pattern, existing app-config and shortcut services, Node built-ins, existing Rust/NAPI services exposed through current main hosts.

---

## Research Summary

Flow Launcher uses a query pipeline:

- Parse raw text into `Query`, `ActionKeyword`, and search terms.
- Select global plugins or action-keyword plugins.
- Run plugin queries concurrently.
- Cancel stale queries when input changes.
- Merge, score, and progressively update results.
- Execute result actions in the host process.
- Cache indexed programs and delegate file search to Windows Index or Everything.

uTools uses an Electron plugin model:

- `plugin.json` declares searchable commands.
- Features can match text, regex, files, images, URLs, and active-window content.
- `preload` exposes host APIs to plugin code.
- Plugin entry events receive the matched command and payload.

GuYanTools should combine these patterns:

- Use Flow's cancellation, provider registry, scoring, and index refresh model.
- Use uTools' declarative command contribution idea for existing plugin commands.
- Keep execution in the Electron main process, never in the renderer.
- Start with app-internal search before adding OS-wide app or file search.

Reference links:

- Flow Launcher repository: <https://github.com/Flow-Launcher/Flow.Launcher>
- Flow query builder: <https://github.com/Flow-Launcher/Flow.Launcher/blob/dev/Flow.Launcher.Core/Plugin/QueryBuilder.cs>
- Flow query execution: <https://github.com/Flow-Launcher/Flow.Launcher/blob/dev/Flow.Launcher/ViewModel/MainViewModel.cs>
- Flow program indexing: <https://github.com/Flow-Launcher/Flow.Launcher/blob/dev/Plugins/Flow.Launcher.Plugin.Program/Main.cs>
- Flow file search: <https://github.com/Flow-Launcher/Flow.Launcher/blob/dev/Plugins/Flow.Launcher.Plugin.Explorer/Search/SearchManager.cs>
- uTools plugin manifest: <https://www.u-tools.cn/docs/developer/information/plugin-json.html>
- uTools plugin events: <https://www.u-tools.cn/docs/developer/utools-api/events.html>
- uTools dynamic features: <https://www.u-tools.cn/docs/developer/api-reference/utools/features.html>
- Electron global shortcuts: <https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts>
- Electron BrowserWindow: <https://www.electronjs.org/docs/latest/api/browser-window>

## Product Scope

### MVP

The first release provides a reliable launcher for GuYanTools content:

- Global shortcut opens a floating quick launcher window.
- Input searches built-in routes, terminal profiles, SSH profiles, FTP profiles, Todo, Knowledge, plugin pages, and plugin commands.
- Results support keyboard navigation, mouse activation, empty state, loading state, and error state.
- Executing a result hides the launcher and performs a main-process whitelisted action.
- Settings page lets the user configure the launcher shortcut and enabled providers.
- Usage history boosts frequently used results.

### Explicit Non-Goals For MVP

- No full disk file index.
- No Everything integration.
- No new dependencies.
- No arbitrary shell command execution from renderer.
- No plugin runtime expansion beyond existing manifest commands and pages.
- No external production services.

### Phase 2 Extension Targets

- Windows Start Menu `.lnk` and UWP app indexing.
- Optional Windows Search or Everything provider.
- Clipboard content matching.
- Active-window content matching when platform support is designed.
- Dynamic plugin command registration modeled after uTools features.

## Current Repository Fit

Use these existing patterns:

- Main process initialization: `desktop/src/main/index.ts`
- Main window factory: `desktop/src/main/windows/main_window.ts`
- Shortcut registration service: `desktop/src/main/shortcuts/service.ts`
- Shortcut IPC and validation: `desktop/src/main/shortcuts/ipc.ts`
- Typed app config: `desktop/src/contracts/app_config.ts`
- Preload API exposure: `desktop/src/preload.ts`
- Plugin manifest commands/pages: `desktop/src/contracts/plugin_host.ts`
- Plugin host services: `desktop/src/main/plugin-host/host_services.ts`
- Vite multi-entry renderer: `desktop/vite.renderer.config.ts`
- Independent window examples:
  - `desktop/src/main/knowledge/quick_note_window.ts`
  - `desktop/src/main/multi-device-clipboard/window.ts`
  - `desktop/src/windows/clipboard/main.ts`
  - `desktop/src/windows/quick-note/main.ts`

## File Structure

### Create

- `desktop/src/contracts/quick_launch.ts`
  - Shared types for query, result, actions, provider ids, settings, and preload API.
- `desktop/src/main/quick-launch/types.ts`
  - Main-process provider interfaces and internal query session types.
- `desktop/src/main/quick-launch/matcher.ts`
  - Dependency-free fuzzy matcher and score helpers.
- `desktop/src/main/quick-launch/providers/internal_route_provider.ts`
  - Searches `APP_INTERNAL_FUNCTIONS` and opens app routes.
- `desktop/src/main/quick-launch/providers/terminal_provider.ts`
  - Searches terminal profiles and opens terminal route with a profile payload.
- `desktop/src/main/quick-launch/providers/ssh_provider.ts`
  - Searches SSH profiles and opens SSH-related terminal flow.
- `desktop/src/main/quick-launch/providers/ftp_provider.ts`
  - Searches FTP profiles and opens file transfer flow.
- `desktop/src/main/quick-launch/providers/todo_provider.ts`
  - Uses existing Todo search.
- `desktop/src/main/quick-launch/providers/knowledge_provider.ts`
  - Uses existing Knowledge search.
- `desktop/src/main/quick-launch/providers/plugin_provider.ts`
  - Searches plugin pages and plugin command contributions.
- `desktop/src/main/quick-launch/history_store.ts`
  - Stores usage counters in the existing settings table through `dbManager`.
- `desktop/src/main/quick-launch/service.ts`
  - Provider registry, query cancellation, result sorting, action dispatch.
- `desktop/src/main/quick-launch/window.ts`
  - Floating BrowserWindow lifecycle.
- `desktop/src/main/quick-launch/ipc.ts`
  - IPC handlers for search, execute, refresh, and close.
- `desktop/src/windows/quick-launch/main.ts`
  - Vue quick-launch entry.
- `desktop/src/windows/quick-launch/App.vue`
  - Launcher UI, keyboard handling, result list.
- `desktop/quick_launcher.html`
  - Vite HTML entry.
- `desktop/scripts/verify-quick-launch.cjs`
  - Static and pure-function regression checks without adding test dependencies.

### Modify

- `desktop/src/contracts/app_config.ts`
  - Add launcher feature config and `toggleQuickLaunch` system shortcut.
- `desktop/src/main/app-config/manager.ts`
  - Normalize and persist quick-launch config and shortcut.
- `desktop/src/main/shortcuts/service.ts`
  - Register launcher shortcut and include it in inspection/validation.
- `desktop/src/main/index.ts`
  - Register quick-launch IPC and initialize launcher services.
- `desktop/src/preload.ts`
  - Expose `window.quickLaunchApi`.
- `desktop/src/core/@types/index.d.ts`
  - Add `quickLaunchApi` to global window typing.
- `desktop/vite.renderer.config.ts`
  - Add `quick_launcher` entry.
- `desktop/package.json`
  - Add `verify:quick-launch` script.
- `desktop/src/windows/main/pages/Settings.vue`
  - Add launcher settings controls under Shortcuts or a Quick Launch subsection.

### Avoid

- Do not modify `multi_platform_core/vendor/`.
- Do not add a search dependency for MVP.
- Do not execute arbitrary commands from quick-launch actions.
- Do not store launcher state in renderer localStorage except transient UI preferences.

## Data Model

Use TypeScript contracts first. MVP does not need a Rust migration.

Usage history can be stored under a settings key:

- Key: `quick_launch.history`
- Value:

```json
{
  "items": {
    "internal-route:terminal": {
      "useCount": 8,
      "lastUsedAt": 1781100000000
    }
  }
}
```

This keeps MVP reversible. If usage history grows beyond simple counters, move it to a Rust migration later.

## Ranking Rules

Provider score formula:

```text
finalScore = matchScore + providerWeight + usageBoost + recencyBoost
```

Default provider weights:

```ts
const QUICK_LAUNCH_PROVIDER_WEIGHTS = {
  internalRoute: 120,
  terminal: 105,
  ssh: 100,
  ftp: 95,
  todo: 80,
  knowledge: 80,
  plugin: 70,
} as const;
```

Matcher order:

- Exact normalized title match: 1000
- Title prefix: 900
- Word start or acronym match: 760
- Continuous substring: 680
- Ordered subsequence: 420 to 620
- Alias match: same categories, minus 40
- No match: excluded

History:

- `usageBoost = min(80, log2(useCount + 1) * 16)`
- `recencyBoost = 30` if used within 24 hours
- `recencyBoost = 16` if used within 7 days
- `recencyBoost = 6` if used within 30 days

## IPC Contract

IPC channels:

- `quick-launch:search`
- `quick-launch:execute`
- `quick-launch:refresh-index`
- `quick-launch:close`
- `quick-launch:show`

Renderer API:

```ts
export interface QuickLaunchApi {
  search: (input: QuickLaunchSearchInput) => Promise<QuickLaunchSearchResult>;
  execute: (input: QuickLaunchExecuteInput) => Promise<QuickLaunchExecuteResult>;
  refreshIndex: (input?: QuickLaunchRefreshInput) => Promise<QuickLaunchRefreshResult>;
  close: () => Promise<void>;
}
```

## Implementation Tasks

### Task 1: Add Shared Contract And Verification Harness

**Files:**

- Create: `desktop/src/contracts/quick_launch.ts`
- Modify: `desktop/src/core/@types/index.d.ts`
- Create: `desktop/scripts/verify-quick-launch.cjs`
- Modify: `desktop/package.json`

- [ ] **Step 1: Create the contract file**

Add `desktop/src/contracts/quick_launch.ts` with these exported types:

```ts
export type QuickLaunchProviderId =
  | 'internal-route'
  | 'terminal'
  | 'ssh'
  | 'ftp'
  | 'todo'
  | 'knowledge'
  | 'plugin';

export type QuickLaunchItemKind =
  | 'route'
  | 'terminal-profile'
  | 'ssh-profile'
  | 'ftp-profile'
  | 'todo'
  | 'knowledge'
  | 'plugin-page'
  | 'plugin-command'
  | 'action';

export type QuickLaunchAction =
  | { type: 'open-route'; route: string; tabTitle?: string; icon?: string }
  | { type: 'open-terminal-profile'; profileId: string }
  | { type: 'open-ssh-profile'; profileId: string }
  | { type: 'open-ftp-profile'; profileId: string }
  | { type: 'open-todo'; todoId: string }
  | { type: 'open-knowledge-node'; nodeId: string; nodeType?: string }
  | { type: 'plugin-command'; pluginId: string; commandId: string; payload?: unknown }
  | { type: 'copy-text'; text: string }
  | { type: 'open-path'; path: string }
  | { type: 'open-external'; url: string };

export interface QuickLaunchItem {
  id: string;
  providerId: QuickLaunchProviderId;
  kind: QuickLaunchItemKind;
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  score: number;
  keywords?: string[];
  highlights?: number[];
  action: QuickLaunchAction;
}

export interface QuickLaunchSearchInput {
  query: string;
  limit?: number;
  providerIds?: QuickLaunchProviderId[];
  sessionId?: string;
}

export interface QuickLaunchSearchResult {
  query: string;
  sessionId: string;
  items: QuickLaunchItem[];
  elapsedMs: number;
  partial: boolean;
  errors: Array<{ providerId: QuickLaunchProviderId; message: string }>;
}

export interface QuickLaunchExecuteInput {
  item: QuickLaunchItem;
}

export interface QuickLaunchExecuteResult {
  accepted: boolean;
  closeWindow: boolean;
  message?: string;
}

export interface QuickLaunchRefreshInput {
  providerIds?: QuickLaunchProviderId[];
}

export interface QuickLaunchRefreshResult {
  refreshedProviderIds: QuickLaunchProviderId[];
  elapsedMs: number;
}

export interface QuickLaunchFeatureConfig {
  enabled: boolean;
  maxResults: number;
  enabledProviders: QuickLaunchProviderId[];
  hideOnBlur: boolean;
}

export interface QuickLaunchApi {
  search: (input: QuickLaunchSearchInput) => Promise<QuickLaunchSearchResult>;
  execute: (input: QuickLaunchExecuteInput) => Promise<QuickLaunchExecuteResult>;
  refreshIndex: (input?: QuickLaunchRefreshInput) => Promise<QuickLaunchRefreshResult>;
  close: () => Promise<void>;
}
```

- [ ] **Step 2: Add global window typing**

In `desktop/src/core/@types/index.d.ts`, import `QuickLaunchApi` and add:

```ts
quickLaunchApi?: QuickLaunchApi;
```

inside the existing `Window` interface.

- [ ] **Step 3: Add static verification script**

Create `desktop/scripts/verify-quick-launch.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const contractPath = path.join(desktopRoot, 'src/contracts/quick_launch.ts');
const preloadPath = path.join(desktopRoot, 'src/preload.ts');
const appConfigPath = path.join(desktopRoot, 'src/contracts/app_config.ts');
const viteConfigPath = path.join(desktopRoot, 'vite.renderer.config.ts');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

assert.match(read(contractPath), /export interface QuickLaunchApi/);
assert.match(read(contractPath), /export type QuickLaunchAction/);
assert.match(read(preloadPath), /quickLaunchApi/);
assert.match(read(appConfigPath), /toggleQuickLaunch/);
assert.match(read(viteConfigPath), /quick_launcher/);

console.log('Quick launch static verification passed');
```

- [ ] **Step 4: Add package script**

In `desktop/package.json`, add:

```json
"verify:quick-launch": "node scripts/verify-quick-launch.cjs"
```

beside the existing verify scripts.

- [ ] **Step 5: Run initial verification**

Run:

```bash
pnpm --dir desktop run verify:quick-launch
```

Expected before later tasks are complete:

```text
AssertionError
```

This failure is intentional after Task 1 if preload, app config, and Vite entries are not wired yet.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/contracts/quick_launch.ts desktop/src/core/@types/index.d.ts desktop/scripts/verify-quick-launch.cjs desktop/package.json
git commit -m "feat(desktop): define quick launch contract"
```

Commit body should include:

```text
Constraint: No new dependency for quick launch MVP
Confidence: high
Scope-risk: narrow
Tested: pnpm --dir desktop run verify:quick-launch fails until integration tasks wire the contract
```

### Task 2: Add App Config And Shortcut Registration

**Files:**

- Modify: `desktop/src/contracts/app_config.ts`
- Modify: `desktop/src/main/app-config/manager.ts`
- Modify: `desktop/src/main/shortcuts/service.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/src/windows/main/pages/Settings.vue`

- [ ] **Step 1: Extend app config contracts**

In `desktop/src/contracts/app_config.ts`, import the feature config type:

```ts
import type { QuickLaunchFeatureConfig } from './quick_launch';
```

Add `toggleQuickLaunch` to `AppSystemShortcutsConfig`:

```ts
toggleQuickLaunch: string;
```

Add `quickLaunch` to `AppFeaturesConfig`:

```ts
quickLaunch: QuickLaunchFeatureConfig;
```

Add defaults in `createDefaultAppConfig()`:

```ts
quickLaunch: {
  enabled: true,
  maxResults: 12,
  enabledProviders: ['internal-route', 'terminal', 'ssh', 'ftp', 'todo', 'knowledge', 'plugin'],
  hideOnBlur: true,
},
```

Add shortcut default:

```ts
toggleQuickLaunch: 'Alt+Space',
```

- [ ] **Step 2: Normalize config in manager**

In `desktop/src/main/app-config/manager.ts`, add a helper:

```ts
function normalizeQuickLaunchFeature(value: unknown): QuickLaunchFeatureConfig {
  const defaults = createDefaultAppConfig().features.quickLaunch;
  const source = isRecord(value) ? value : {};
  const enabledProviders = normalizeStringList(source.enabledProviders)
    .filter((provider): provider is QuickLaunchProviderId =>
      ['internal-route', 'terminal', 'ssh', 'ftp', 'todo', 'knowledge', 'plugin'].includes(provider),
    );

  return {
    enabled: source.enabled !== false,
    maxResults: Math.max(3, Math.min(30, Math.round(normalizeNumber(source.maxResults, defaults.maxResults) ?? defaults.maxResults))),
    enabledProviders: enabledProviders.length ? enabledProviders : defaults.enabledProviders,
    hideOnBlur: source.hideOnBlur !== false,
  };
}
```

Use the manager's existing number-normalization helper name. If the local helper is named `normalizeAiNumber`, use a small local `normalizeQuickLaunchNumber` instead of changing unrelated AI helpers.

Wire it into the existing feature normalization:

```ts
quickLaunch: normalizeQuickLaunchFeature(value.quickLaunch),
```

Wire patch merging:

```ts
quickLaunch: {
  ...current.features.quickLaunch,
  ...(patch.features?.quickLaunch ?? {}),
},
```

Normalize `toggleQuickLaunch` beside other system shortcuts:

```ts
toggleQuickLaunch: normalizeShortcutValue(system.toggleQuickLaunch, defaults.system.toggleQuickLaunch),
```

- [ ] **Step 3: Register quick-launch shortcut**

In `desktop/src/main/shortcuts/service.ts`, extend `RegisteredShortcutField`:

```ts
| 'toggleQuickLaunchShortcut'
```

Add a class field:

```ts
private toggleQuickLaunchShortcut = '';
```

Add the action definition:

```ts
{ key: 'toggleQuickLaunch', field: 'toggleQuickLaunchShortcut', label: '快速启动' },
```

Extend `initialize()` signature:

```ts
toggleQuickLaunchWindow?: () => void,
```

Call `registerSimpleShortcut()` in `refresh()`:

```ts
const quickLaunchAccelerator = normalizeAccelerator(config.shortcuts.system.toggleQuickLaunch);
await this.registerSimpleShortcut(
  'toggleQuickLaunchShortcut',
  quickLaunchAccelerator,
  toggleQuickLaunchWindow,
  'quick launch toggle',
);
```

Update `registerSimpleShortcut()` field union to include `toggleQuickLaunchShortcut`.

Dispose the field in `dispose()`:

```ts
if (this.toggleQuickLaunchShortcut) {
  globalShortcut.unregister(this.toggleQuickLaunchShortcut);
  this.toggleQuickLaunchShortcut = '';
}
```

- [ ] **Step 4: Reserve initialization slot in main index**

In `desktop/src/main/index.ts`, later tasks will import `toggleQuickLaunchWindow`. For this task, add the parameter only after `window.ts` exists. If Task 2 is implemented before Task 4, keep this step until Task 4 to avoid a broken import.

- [ ] **Step 5: Add settings UI**

In `desktop/src/windows/main/pages/Settings.vue`, add a row in the shortcuts section:

```vue
<UiSettingRow title="快速启动" description="系统级快捷键，默认 Alt+Space 唤出快速启动窗口；如果被系统占用，请改成 Ctrl+Alt+Space 等组合。">
  <ShortcutRecorder
    :model-value="appConfigStore.config.shortcuts.system.toggleQuickLaunch"
    :default-value="defaultShortcuts.system.toggleQuickLaunch"
    @update:modelValue="updateSystemShortcut('toggleQuickLaunch', $event)"
  />
</UiSettingRow>
```

Use the exact local component names and props already used by the nearby system shortcut rows.

- [ ] **Step 6: Run lint**

Run:

```bash
pnpm --dir desktop run lint
```

Expected:

```text
no ESLint errors in modified files
```

- [ ] **Step 7: Commit**

```bash
git add desktop/src/contracts/app_config.ts desktop/src/main/app-config/manager.ts desktop/src/main/shortcuts/service.ts desktop/src/windows/main/pages/Settings.vue
git commit -m "feat(desktop): add quick launch shortcut settings"
```

Commit body:

```text
Constraint: Alt+Space may be unavailable on some systems and must remain configurable
Confidence: high
Scope-risk: moderate
Tested: pnpm --dir desktop run lint
```

### Task 3: Implement Matcher And Provider Types

**Files:**

- Create: `desktop/src/main/quick-launch/types.ts`
- Create: `desktop/src/main/quick-launch/matcher.ts`
- Modify: `desktop/scripts/verify-quick-launch.cjs`

- [ ] **Step 1: Define provider interfaces**

Create `desktop/src/main/quick-launch/types.ts`:

```ts
import type {
  QuickLaunchItem,
  QuickLaunchProviderId,
  QuickLaunchSearchInput,
} from '@/contracts/quick_launch';

export interface QuickLaunchProviderContext {
  historyScore: (itemId: string) => number;
}

export interface QuickLaunchProvider {
  id: QuickLaunchProviderId;
  title: string;
  weight: number;
  search: (input: QuickLaunchSearchInput, context: QuickLaunchProviderContext) => Promise<QuickLaunchItem[]> | QuickLaunchItem[];
  refresh?: () => Promise<void> | void;
}

export interface MatchCandidate {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  keywords?: string[];
}

export interface MatchScore {
  matched: boolean;
  score: number;
  highlights: number[];
}
```

- [ ] **Step 2: Implement dependency-free matcher**

Create `desktop/src/main/quick-launch/matcher.ts`:

```ts
import type { MatchCandidate, MatchScore } from './types';

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function acronymOf(value: string) {
  return value
    .split(/[\s\-_/.:]+/g)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toLocaleLowerCase();
}

function subsequenceIndexes(query: string, target: string): number[] {
  const indexes: number[] = [];
  let cursor = 0;
  for (const char of query) {
    const foundAt = target.indexOf(char, cursor);
    if (foundAt < 0) return [];
    indexes.push(foundAt);
    cursor = foundAt + 1;
  }
  return indexes;
}

export function matchQuickLaunchCandidate(query: string, candidate: MatchCandidate): MatchScore {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return { matched: true, score: 100, highlights: [] };
  }

  const fields = [
    { value: candidate.title, penalty: 0 },
    { value: candidate.subtitle ?? '', penalty: 80 },
    { value: candidate.description ?? '', penalty: 120 },
    ...(candidate.keywords ?? []).map((value) => ({ value, penalty: 40 })),
  ].filter((field) => field.value.trim());

  let best: MatchScore = { matched: false, score: 0, highlights: [] };
  for (const field of fields) {
    const target = normalizeText(field.value);
    const exact = target === normalizedQuery;
    if (exact) {
      const score = 1000 - field.penalty;
      if (score > best.score) best = { matched: true, score, highlights: range(0, field.value.length) };
      continue;
    }

    if (target.startsWith(normalizedQuery)) {
      const score = 900 - field.penalty;
      if (score > best.score) best = { matched: true, score, highlights: range(0, normalizedQuery.length) };
      continue;
    }

    const acronym = acronymOf(field.value);
    if (acronym && acronym.startsWith(normalizedQuery)) {
      const score = 760 - field.penalty;
      if (score > best.score) best = { matched: true, score, highlights: [] };
      continue;
    }

    const containsAt = target.indexOf(normalizedQuery);
    if (containsAt >= 0) {
      const score = 680 - field.penalty - Math.min(80, containsAt);
      if (score > best.score) best = { matched: true, score, highlights: range(containsAt, normalizedQuery.length) };
      continue;
    }

    const indexes = subsequenceIndexes(normalizedQuery, target);
    if (indexes.length) {
      const span = indexes[indexes.length - 1] - indexes[0] + 1;
      const compactness = Math.max(0, 160 - span * 8);
      const score = 420 + compactness - field.penalty;
      if (score > best.score) best = { matched: true, score, highlights: indexes };
    }
  }

  return best;
}

function range(start: number, length: number) {
  return Array.from({ length }, (_item, index) => start + index);
}
```

- [ ] **Step 3: Add matcher checks to verification script**

Append to `desktop/scripts/verify-quick-launch.cjs`:

```js
const matcherPath = path.join(desktopRoot, 'src/main/quick-launch/matcher.ts');
const matcherSource = read(matcherPath);
assert.match(matcherSource, /matchQuickLaunchCandidate/);
assert.match(matcherSource, /subsequenceIndexes/);
```

- [ ] **Step 4: Run lint and verification**

Run:

```bash
pnpm --dir desktop run lint
pnpm --dir desktop run verify:quick-launch
```

Expected verification may still fail until Task 4 and Task 7 wire preload/app config/Vite.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/quick-launch/types.ts desktop/src/main/quick-launch/matcher.ts desktop/scripts/verify-quick-launch.cjs
git commit -m "feat(desktop): add quick launch matching core"
```

Commit body:

```text
Constraint: MVP avoids new fuzzy-search dependencies
Rejected: Add Fuse.js | unnecessary dependency for first launcher release
Confidence: medium
Scope-risk: narrow
Tested: pnpm --dir desktop run lint
```

### Task 4: Implement Main-Process Service, IPC, And Window

**Files:**

- Create: `desktop/src/main/quick-launch/history_store.ts`
- Create: `desktop/src/main/quick-launch/service.ts`
- Create: `desktop/src/main/quick-launch/window.ts`
- Create: `desktop/src/main/quick-launch/ipc.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/src/preload.ts`

- [ ] **Step 1: Implement usage history store**

Create `desktop/src/main/quick-launch/history_store.ts`:

```ts
import { dbManager } from '@/core/database';

const QUICK_LAUNCH_HISTORY_KEY = 'quick_launch.history';

interface QuickLaunchHistoryRecord {
  useCount: number;
  lastUsedAt: number;
}

interface QuickLaunchHistoryPayload {
  items: Record<string, QuickLaunchHistoryRecord>;
}

export class QuickLaunchHistoryStore {
  private cache: QuickLaunchHistoryPayload = { items: {} };
  private loaded = false;

  async load() {
    if (this.loaded) return;
    const db = dbManager.getDatabase();
    const raw = await db.getSetting(QUICK_LAUNCH_HISTORY_KEY).catch(() => null);
    this.cache = parseHistory(raw?.value);
    this.loaded = true;
  }

  async recordUse(itemId: string) {
    await this.load();
    const current = this.cache.items[itemId] ?? { useCount: 0, lastUsedAt: 0 };
    this.cache.items[itemId] = {
      useCount: current.useCount + 1,
      lastUsedAt: Date.now(),
    };
    await this.save();
  }

  score(itemId: string) {
    const record = this.cache.items[itemId];
    if (!record) return 0;
    const usageBoost = Math.min(80, Math.log2(record.useCount + 1) * 16);
    const ageMs = Date.now() - record.lastUsedAt;
    const dayMs = 24 * 60 * 60 * 1000;
    const recencyBoost = ageMs <= dayMs ? 30 : ageMs <= 7 * dayMs ? 16 : ageMs <= 30 * dayMs ? 6 : 0;
    return usageBoost + recencyBoost;
  }

  private async save() {
    const db = dbManager.getDatabase();
    await db.setSetting(QUICK_LAUNCH_HISTORY_KEY, JSON.stringify(this.cache), 'Quick launch usage history');
  }
}

function parseHistory(raw: string | null | undefined): QuickLaunchHistoryPayload {
  if (!raw) return { items: {} };
  try {
    const parsed = JSON.parse(raw) as QuickLaunchHistoryPayload;
    if (!parsed || typeof parsed !== 'object' || !parsed.items || typeof parsed.items !== 'object') {
      return { items: {} };
    }
    return { items: parsed.items };
  } catch {
    return { items: {} };
  }
}
```

If the database wrapper does not expose `getSetting` and `setSetting` with these names in TypeScript, use the actual setting methods already used by `appConfigManager` and keep this file's public interface unchanged.

- [ ] **Step 2: Implement service shell**

Create `desktop/src/main/quick-launch/service.ts`:

```ts
import { BrowserWindow, clipboard, shell } from 'electron';
import type {
  QuickLaunchExecuteInput,
  QuickLaunchExecuteResult,
  QuickLaunchItem,
  QuickLaunchProviderId,
  QuickLaunchRefreshInput,
  QuickLaunchRefreshResult,
  QuickLaunchSearchInput,
  QuickLaunchSearchResult,
} from '@/contracts/quick_launch';
import { appConfigManager } from '@/main/app-config/manager';
import { pluginHost } from '@/main/plugin-host';
import type { QuickLaunchProvider } from './types';
import { QuickLaunchHistoryStore } from './history_store';

type MainWindowGetter = () => BrowserWindow | null;

class QuickLaunchService {
  private providers = new Map<QuickLaunchProviderId, QuickLaunchProvider>();
  private history = new QuickLaunchHistoryStore();
  private lastSessionCounter = 0;
  private getMainWindow: MainWindowGetter = () => null;

  bindMainWindow(getMainWindow: MainWindowGetter) {
    this.getMainWindow = getMainWindow;
  }

  registerProvider(provider: QuickLaunchProvider) {
    this.providers.set(provider.id, provider);
  }

  async search(input: QuickLaunchSearchInput): Promise<QuickLaunchSearchResult> {
    const startedAt = Date.now();
    await this.history.load();
    const config = await appConfigManager.getConfig();
    const sessionId = input.sessionId || `ql-${Date.now()}-${++this.lastSessionCounter}`;
    const limit = Math.max(1, Math.min(30, input.limit ?? config.features.quickLaunch.maxResults));
    const enabledProviderIds = new Set(input.providerIds ?? config.features.quickLaunch.enabledProviders);
    const providers = [...this.providers.values()].filter((provider) => enabledProviderIds.has(provider.id));
    const errors: QuickLaunchSearchResult['errors'] = [];
    const batches = await Promise.all(providers.map(async (provider) => {
      try {
        return await provider.search(input, {
          historyScore: (itemId) => this.history.score(itemId),
        });
      } catch (error) {
        errors.push({
          providerId: provider.id,
          message: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    }));

    const items = batches
      .flat()
      .sort(sortItems)
      .slice(0, limit);

    return {
      query: input.query,
      sessionId,
      items,
      elapsedMs: Date.now() - startedAt,
      partial: false,
      errors,
    };
  }

  async execute(input: QuickLaunchExecuteInput): Promise<QuickLaunchExecuteResult> {
    await this.history.recordUse(input.item.id);
    const action = input.item.action;
    switch (action.type) {
      case 'open-route':
        await this.openRoute(action.route);
        return { accepted: true, closeWindow: true };
      case 'copy-text':
        clipboard.writeText(action.text);
        return { accepted: true, closeWindow: true };
      case 'open-path':
        await shell.openPath(action.path);
        return { accepted: true, closeWindow: true };
      case 'open-external':
        await shell.openExternal(action.url);
        return { accepted: true, closeWindow: true };
      case 'plugin-command':
        return pluginHost.getHostServices().commands.execute(action.commandId, action.payload)
          .then(() => ({ accepted: true, closeWindow: true }));
      case 'open-terminal-profile':
        await this.openRoute(`/terminal?profileId=${encodeURIComponent(action.profileId)}`);
        return { accepted: true, closeWindow: true };
      case 'open-ssh-profile':
        await this.openRoute(`/terminal?sshProfileId=${encodeURIComponent(action.profileId)}`);
        return { accepted: true, closeWindow: true };
      case 'open-ftp-profile':
        await this.openRoute(`/ftp?profileId=${encodeURIComponent(action.profileId)}`);
        return { accepted: true, closeWindow: true };
      case 'open-todo':
        await this.openRoute(`/todo?todoId=${encodeURIComponent(action.todoId)}`);
        return { accepted: true, closeWindow: true };
      case 'open-knowledge-node':
        await this.openRoute(`/knowledge?nodeId=${encodeURIComponent(action.nodeId)}`);
        return { accepted: true, closeWindow: true };
      default:
        return { accepted: false, closeWindow: false, message: 'Unsupported quick launch action' };
    }
  }

  async refreshIndex(input?: QuickLaunchRefreshInput): Promise<QuickLaunchRefreshResult> {
    const startedAt = Date.now();
    const ids = new Set(input?.providerIds ?? this.providers.keys());
    const refreshedProviderIds: QuickLaunchProviderId[] = [];
    for (const provider of this.providers.values()) {
      if (!ids.has(provider.id) || !provider.refresh) continue;
      await provider.refresh();
      refreshedProviderIds.push(provider.id);
    }
    return { refreshedProviderIds, elapsedMs: Date.now() - startedAt };
  }

  private async openRoute(route: string) {
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
    await win.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(`#${route.replace(/^#?\/?/, '/')}`)};`, true);
  }
}

function sortItems(left: QuickLaunchItem, right: QuickLaunchItem) {
  if (right.score !== left.score) return right.score - left.score;
  return left.title.localeCompare(right.title);
}

export const quickLaunchService = new QuickLaunchService();
```

After provider tasks are implemented, add provider imports and registration in this file or a small `providers/index.ts`.

- [ ] **Step 3: Implement window lifecycle**

Create `desktop/src/main/quick-launch/window.ts`:

```ts
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { waitForDevServer } from '@/main/windows/wait_for_dev_server';
import { appConfigManager } from '@/main/app-config/manager';
import { resolveWindowIconPath } from '@/main/windows/window_icon';

const WINDOW_WIDTH = 720;
const WINDOW_HEIGHT = 520;
const MARGIN = 24;

let quickLaunchWindow: BrowserWindow | null = null;

export async function showQuickLaunchWindow() {
  if (quickLaunchWindow && !quickLaunchWindow.isDestroyed()) {
    positionQuickLaunchWindow(quickLaunchWindow);
    quickLaunchWindow.show();
    quickLaunchWindow.focus();
    quickLaunchWindow.webContents.send('quick-launch:focus-input');
    return;
  }

  quickLaunchWindow = new BrowserWindow({
    ...getQuickLaunchBounds(),
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 520,
    minHeight: 360,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    title: '快速启动',
    icon: resolveWindowIconPath(),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  quickLaunchWindow.on('blur', async () => {
    const config = await appConfigManager.getConfig().catch(() => null);
    if (config?.features.quickLaunch.hideOnBlur !== false) {
      closeQuickLaunchWindow();
    }
  });

  quickLaunchWindow.on('closed', () => {
    quickLaunchWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/quick_launcher.html`;
    await waitForDevServer(url);
    await quickLaunchWindow.loadURL(url);
  } else {
    await quickLaunchWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/quick_launcher.html`));
  }

  quickLaunchWindow.show();
  quickLaunchWindow.focus();
}

export function toggleQuickLaunchWindow() {
  if (quickLaunchWindow && !quickLaunchWindow.isDestroyed() && quickLaunchWindow.isVisible()) {
    closeQuickLaunchWindow();
    return;
  }
  void showQuickLaunchWindow();
}

export function closeQuickLaunchWindow() {
  if (quickLaunchWindow && !quickLaunchWindow.isDestroyed()) {
    quickLaunchWindow.hide();
  }
}

function positionQuickLaunchWindow(win: BrowserWindow) {
  win.setBounds(getQuickLaunchBounds(), false);
}

function getQuickLaunchBounds(): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { workArea } = display;
  const width = Math.min(WINDOW_WIDTH, workArea.width - MARGIN * 2);
  const height = Math.min(WINDOW_HEIGHT, workArea.height - MARGIN * 2);
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + Math.max(MARGIN, workArea.height * 0.18)),
    width,
    height,
  };
}
```

- [ ] **Step 4: Register IPC handlers**

Create `desktop/src/main/quick-launch/ipc.ts`:

```ts
import { ipcMain } from 'electron';
import type {
  QuickLaunchExecuteInput,
  QuickLaunchRefreshInput,
  QuickLaunchSearchInput,
} from '@/contracts/quick_launch';
import { closeQuickLaunchWindow, showQuickLaunchWindow } from './window';
import { quickLaunchService } from './service';

let registered = false;

export function registerQuickLaunchIpcHandlers() {
  if (registered) return;

  ipcMain.handle('quick-launch:search', async (_event, input: QuickLaunchSearchInput) =>
    quickLaunchService.search(input));

  ipcMain.handle('quick-launch:execute', async (_event, input: QuickLaunchExecuteInput) =>
    quickLaunchService.execute(input));

  ipcMain.handle('quick-launch:refresh-index', async (_event, input?: QuickLaunchRefreshInput) =>
    quickLaunchService.refreshIndex(input));

  ipcMain.handle('quick-launch:close', async () => {
    closeQuickLaunchWindow();
  });

  ipcMain.handle('quick-launch:show', async () => {
    await showQuickLaunchWindow();
  });

  registered = true;
}
```

- [ ] **Step 5: Wire main index**

In `desktop/src/main/index.ts`, import:

```ts
import { registerQuickLaunchIpcHandlers } from './quick-launch/ipc';
import { quickLaunchService } from './quick-launch/service';
import { toggleQuickLaunchWindow } from './quick-launch/window';
```

Call IPC registration near other registrations:

```ts
registerQuickLaunchIpcHandlers();
```

Before `shortcutService.initialize(...)`, bind the main window getter:

```ts
quickLaunchService.bindMainWindow(() => {
  try {
    return this.mainWindowCreator.getWindow();
  } catch {
    return null;
  }
});
```

Pass `toggleQuickLaunchWindow` to `shortcutService.initialize(...)` after the existing quick-note callbacks.

- [ ] **Step 6: Expose preload API**

In `desktop/src/preload.ts`, import `QuickLaunchApi` and add:

```ts
const quickLaunchApi: QuickLaunchApi = {
  search: (input) => ipcRenderer.invoke('quick-launch:search', input),
  execute: (input) => ipcRenderer.invoke('quick-launch:execute', input),
  refreshIndex: (input) => ipcRenderer.invoke('quick-launch:refresh-index', input),
  close: () => ipcRenderer.invoke('quick-launch:close'),
};

contextBridge.exposeInMainWorld('quickLaunchApi', quickLaunchApi);
```

- [ ] **Step 7: Run verification**

Run:

```bash
pnpm --dir desktop run verify:quick-launch
pnpm --dir desktop run lint
```

Expected after this task and Task 2:

```text
Quick launch static verification passed
```

- [ ] **Step 8: Commit**

```bash
git add desktop/src/main/quick-launch desktop/src/main/index.ts desktop/src/preload.ts
git commit -m "feat(desktop): add quick launch host window"
```

Commit body:

```text
Constraint: Renderer cannot execute quick-launch actions directly
Rejected: Put launcher inside main window route | slower to summon and harder to focus globally
Confidence: medium
Scope-risk: moderate
Tested: pnpm --dir desktop run verify:quick-launch; pnpm --dir desktop run lint
```

### Task 5: Add Internal Route Provider

**Files:**

- Create: `desktop/src/main/quick-launch/providers/internal_route_provider.ts`
- Modify: `desktop/src/main/quick-launch/service.ts`

- [ ] **Step 1: Implement provider**

Create `desktop/src/main/quick-launch/providers/internal_route_provider.ts`:

```ts
import { APP_INTERNAL_FUNCTIONS } from '@/contracts/app_config';
import type { QuickLaunchItem } from '@/contracts/quick_launch';
import { matchQuickLaunchCandidate } from '../matcher';
import type { QuickLaunchProvider } from '../types';

const WEIGHT = 120;

export const internalRouteQuickLaunchProvider: QuickLaunchProvider = {
  id: 'internal-route',
  title: '内置页面',
  weight: WEIGHT,
  search(input, context) {
    const query = input.query.trim();
    return APP_INTERNAL_FUNCTIONS
      .filter((item) => !item.devOnly || process.env.NODE_ENV === 'development')
      .map((route): QuickLaunchItem | null => {
        const id = `internal-route:${route.id}`;
        const match = matchQuickLaunchCandidate(query, {
          id,
          title: route.label,
          subtitle: route.route,
          description: route.description,
          keywords: [route.id, route.icon],
        });
        if (!match.matched) return null;
        return {
          id,
          providerId: 'internal-route',
          kind: 'route',
          title: route.label,
          subtitle: route.description,
          icon: route.icon,
          score: match.score + WEIGHT + context.historyScore(id),
          highlights: match.highlights,
          keywords: [route.id, route.route],
          action: {
            type: 'open-route',
            route: route.route,
            tabTitle: route.label,
            icon: route.icon,
          },
        };
      })
      .filter((item): item is QuickLaunchItem => Boolean(item));
  },
};
```

- [ ] **Step 2: Register provider**

In `desktop/src/main/quick-launch/service.ts`, import:

```ts
import { internalRouteQuickLaunchProvider } from './providers/internal_route_provider';
```

Add a constructor to `QuickLaunchService`:

```ts
constructor() {
  this.registerProvider(internalRouteQuickLaunchProvider);
}
```

- [ ] **Step 3: Smoke check via dev app**

Run:

```bash
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
```

Expected:

```text
build completes without TypeScript errors
```

- [ ] **Step 4: Commit**

```bash
git add desktop/src/main/quick-launch/providers/internal_route_provider.ts desktop/src/main/quick-launch/service.ts
git commit -m "feat(desktop): search internal routes from quick launch"
```

Commit body:

```text
Confidence: high
Scope-risk: narrow
Tested: pnpm --dir desktop run lint; pnpm --dir desktop run build:app
```

### Task 6: Add Quick Launcher Renderer

**Files:**

- Create: `desktop/quick_launcher.html`
- Create: `desktop/src/windows/quick-launch/main.ts`
- Create: `desktop/src/windows/quick-launch/App.vue`
- Modify: `desktop/vite.renderer.config.ts`

- [ ] **Step 1: Add HTML entry**

Create `desktop/quick_launcher.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>快速启动</title>
  </head>
  <body>
    <div id="quick-launch-app"></div>
    <script type="module" src="/src/windows/quick-launch/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Add Vue entry**

Create `desktop/src/windows/quick-launch/main.ts`:

```ts
import '@fontsource-variable/geist';
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#quick-launch-app');
```

- [ ] **Step 3: Add renderer component**

Create `desktop/src/windows/quick-launch/App.vue`:

```vue
<template>
  <main class="quick-launch">
    <section class="quick-launch__panel">
      <label class="quick-launch__search" aria-label="快速启动搜索">
        <span class="quick-launch__icon">⌕</span>
        <input
          ref="inputRef"
          v-model="query"
          class="quick-launch__input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="搜索工具、连接、任务、知识库"
          @keydown.down.prevent="moveSelection(1)"
          @keydown.up.prevent="moveSelection(-1)"
          @keydown.enter.prevent="executeSelected"
          @keydown.esc.prevent="close"
        />
      </label>

      <div class="quick-launch__status">
        <span>{{ statusText }}</span>
      </div>

      <ol class="quick-launch__results">
        <li
          v-for="(item, index) in items"
          :key="item.id"
          class="quick-launch__item"
          :class="{ 'quick-launch__item--active': index === selectedIndex }"
          @mouseenter="selectedIndex = index"
          @mousedown.prevent="execute(item)"
        >
          <span class="quick-launch__item-icon">{{ iconText(item.icon) }}</span>
          <span class="quick-launch__item-main">
            <strong>{{ item.title }}</strong>
            <small>{{ item.subtitle || item.description }}</small>
          </span>
          <span class="quick-launch__kind">{{ kindLabel(item.kind) }}</span>
        </li>
      </ol>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { QuickLaunchItem } from '@/contracts/quick_launch';

const query = ref('');
const items = ref<QuickLaunchItem[]>([]);
const loading = ref(false);
const selectedIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let sessionCounter = 0;

const statusText = computed(() => {
  if (loading.value) return '搜索中';
  if (!items.value.length) return query.value.trim() ? '没有匹配结果' : '输入关键词开始';
  return `${items.value.length} 个结果`;
});

watch(query, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void search();
  }, 80);
});

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('beforeunload', () => {
    window.removeEventListener('keydown', handleGlobalKeydown);
  });
  void nextTick(() => inputRef.value?.focus());
  void search();
});

async function search() {
  if (!window.quickLaunchApi) return;
  const sessionId = `renderer-${Date.now()}-${++sessionCounter}`;
  loading.value = true;
  try {
    const result = await window.quickLaunchApi.search({
      query: query.value,
      sessionId,
    });
    items.value = result.items;
    selectedIndex.value = Math.min(selectedIndex.value, Math.max(0, result.items.length - 1));
  } finally {
    loading.value = false;
  }
}

function moveSelection(delta: number) {
  if (!items.value.length) return;
  selectedIndex.value = (selectedIndex.value + delta + items.value.length) % items.value.length;
}

function executeSelected() {
  const item = items.value[selectedIndex.value];
  if (item) void execute(item);
}

async function execute(item: QuickLaunchItem) {
  if (!window.quickLaunchApi) return;
  const result = await window.quickLaunchApi.execute({ item });
  if (result.closeWindow) {
    await window.quickLaunchApi.close();
  }
}

async function close() {
  await window.quickLaunchApi?.close();
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    void window.quickLaunchApi?.refreshIndex();
    void search();
  }
}

function iconText(icon?: string) {
  return icon?.slice(0, 2).toUpperCase() || 'GT';
}

function kindLabel(kind: QuickLaunchItem['kind']) {
  const labels: Record<QuickLaunchItem['kind'], string> = {
    route: '页面',
    'terminal-profile': '终端',
    'ssh-profile': 'SSH',
    'ftp-profile': 'FTP',
    todo: '任务',
    knowledge: '知识',
    'plugin-page': '插件页',
    'plugin-command': '插件命令',
    action: '动作',
  };
  return labels[kind];
}
</script>

<style scoped>
:global(body) {
  margin: 0;
  overflow: hidden;
  font-family: "Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
  background: transparent;
}

.quick-launch {
  width: 100vw;
  height: 100vh;
  display: grid;
  place-items: stretch;
  color: #172033;
}

.quick-launch__panel {
  margin: 10px;
  border: 1px solid rgba(23, 32, 51, 0.12);
  background: rgba(250, 252, 255, 0.94);
  box-shadow: 0 18px 48px rgba(21, 30, 52, 0.22);
  backdrop-filter: blur(22px);
  display: grid;
  grid-template-rows: 64px 28px 1fr;
  overflow: hidden;
}

.quick-launch__search {
  display: grid;
  grid-template-columns: 42px 1fr;
  align-items: center;
  padding: 10px 18px;
  border-bottom: 1px solid rgba(23, 32, 51, 0.1);
}

.quick-launch__icon {
  font-size: 24px;
  color: #3b6f7f;
}

.quick-launch__input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  font-size: 22px;
  color: #172033;
}

.quick-launch__status {
  display: flex;
  align-items: center;
  padding: 0 18px;
  color: #657184;
  font-size: 12px;
  border-bottom: 1px solid rgba(23, 32, 51, 0.08);
}

.quick-launch__results {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow: hidden auto;
}

.quick-launch__item {
  height: 54px;
  display: grid;
  grid-template-columns: 38px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 0 10px;
  border-radius: 6px;
  cursor: default;
}

.quick-launch__item--active {
  background: #e8f1f4;
}

.quick-launch__item-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: #dbe9ed;
  color: #245766;
  font-size: 11px;
  font-weight: 700;
}

.quick-launch__item-main {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.quick-launch__item-main strong,
.quick-launch__item-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-launch__item-main strong {
  font-size: 14px;
}

.quick-launch__item-main small {
  color: #657184;
  font-size: 12px;
}

.quick-launch__kind {
  color: #657184;
  font-size: 12px;
}
</style>
```

- [ ] **Step 4: Add Vite input**

In `desktop/vite.renderer.config.ts`, add:

```ts
quick_launcher: path.resolve(__dirname, 'quick_launcher.html'),
```

inside `rollupOptions.input`.

- [ ] **Step 5: Run verification**

Run:

```bash
pnpm --dir desktop run verify:quick-launch
pnpm --dir desktop run build:app
```

Expected:

```text
Quick launch static verification passed
```

and renderer build includes `quick_launcher.html`.

- [ ] **Step 6: Commit**

```bash
git add desktop/quick_launcher.html desktop/src/windows/quick-launch desktop/vite.renderer.config.ts
git commit -m "feat(desktop): add quick launch renderer"
```

Commit body:

```text
Constraint: Launcher UI must stay keyboard-first and lightweight
Confidence: medium
Scope-risk: moderate
Tested: pnpm --dir desktop run verify:quick-launch; pnpm --dir desktop run build:app
```

### Task 7: Add Built-In Data Providers

**Files:**

- Create: `desktop/src/main/quick-launch/providers/terminal_provider.ts`
- Create: `desktop/src/main/quick-launch/providers/ssh_provider.ts`
- Create: `desktop/src/main/quick-launch/providers/ftp_provider.ts`
- Create: `desktop/src/main/quick-launch/providers/todo_provider.ts`
- Create: `desktop/src/main/quick-launch/providers/knowledge_provider.ts`
- Modify: `desktop/src/main/quick-launch/service.ts`

- [ ] **Step 1: Add terminal provider**

Create `desktop/src/main/quick-launch/providers/terminal_provider.ts`:

```ts
import { appConfigManager } from '@/main/app-config/manager';
import { terminalHost } from '@/main/terminal/host';
import type { QuickLaunchItem } from '@/contracts/quick_launch';
import { matchQuickLaunchCandidate } from '../matcher';
import type { QuickLaunchProvider } from '../types';

const WEIGHT = 105;

export const terminalQuickLaunchProvider: QuickLaunchProvider = {
  id: 'terminal',
  title: '终端配置',
  weight: WEIGHT,
  async search(input, context) {
    const config = await appConfigManager.getConfig();
    const systemProfiles = terminalHost.listProfiles();
    const profiles = [
      ...systemProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        command: profile.command,
        source: 'system',
      })),
      ...config.features.terminal.localProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        command: profile.command,
        source: 'local',
      })),
    ];

    return profiles
      .map((profile): QuickLaunchItem | null => {
        const id = `terminal:${profile.id}`;
        const match = matchQuickLaunchCandidate(input.query, {
          id,
          title: profile.name,
          subtitle: profile.command,
          keywords: [profile.id, profile.source],
        });
        if (!match.matched) return null;
        return {
          id,
          providerId: 'terminal',
          kind: 'terminal-profile',
          title: profile.name,
          subtitle: profile.command || '终端配置',
          icon: 'terminal',
          score: match.score + WEIGHT + context.historyScore(id),
          highlights: match.highlights,
          action: { type: 'open-terminal-profile', profileId: profile.id },
        };
      })
      .filter((item): item is QuickLaunchItem => Boolean(item));
  },
};
```

Use the actual exported terminal host instance name. If `terminalHost` is not exported, add a narrow exported getter from `desktop/src/main/terminal/host.ts` rather than importing a private symbol.

- [ ] **Step 2: Add SSH provider**

Create `desktop/src/main/quick-launch/providers/ssh_provider.ts`:

```ts
import { sshHost } from '@/main/ssh/host';
import type { QuickLaunchItem } from '@/contracts/quick_launch';
import { matchQuickLaunchCandidate } from '../matcher';
import type { QuickLaunchProvider } from '../types';

const WEIGHT = 100;

export const sshQuickLaunchProvider: QuickLaunchProvider = {
  id: 'ssh',
  title: 'SSH 连接',
  weight: WEIGHT,
  async search(input, context) {
    const profiles = await sshHost.listProfiles();
    return profiles
      .map((profile): QuickLaunchItem | null => {
        const id = `ssh:${profile.id}`;
        const match = matchQuickLaunchCandidate(input.query, {
          id,
          title: profile.name,
          subtitle: `${profile.username}@${profile.host}:${profile.port}`,
          keywords: [profile.host, profile.username, profile.id],
        });
        if (!match.matched) return null;
        return {
          id,
          providerId: 'ssh',
          kind: 'ssh-profile',
          title: profile.name,
          subtitle: `${profile.username}@${profile.host}:${profile.port}`,
          icon: 'ssh',
          score: match.score + WEIGHT + context.historyScore(id),
          highlights: match.highlights,
          action: { type: 'open-ssh-profile', profileId: profile.id },
        };
      })
      .filter((item): item is QuickLaunchItem => Boolean(item));
  },
};
```

Use the actual SSH profile field names from `desktop/src/contracts/ssh.ts`. If the label field is `label` rather than `name`, normalize to `title: profile.label`.

- [ ] **Step 3: Add FTP provider**

Create `desktop/src/main/quick-launch/providers/ftp_provider.ts`:

```ts
import { ftpHost } from '@/main/ftp/host';
import type { QuickLaunchItem } from '@/contracts/quick_launch';
import { matchQuickLaunchCandidate } from '../matcher';
import type { QuickLaunchProvider } from '../types';

const WEIGHT = 95;

export const ftpQuickLaunchProvider: QuickLaunchProvider = {
  id: 'ftp',
  title: '文件传输连接',
  weight: WEIGHT,
  async search(input, context) {
    const profiles = await ftpHost.listProfiles();
    return profiles
      .map((profile): QuickLaunchItem | null => {
        const title = profile.label || profile.host;
        const id = `ftp:${profile.id}`;
        const match = matchQuickLaunchCandidate(input.query, {
          id,
          title,
          subtitle: `${profile.protocol}://${profile.host}:${profile.port}`,
          keywords: [profile.host, profile.username, profile.protocol, profile.id],
        });
        if (!match.matched) return null;
        return {
          id,
          providerId: 'ftp',
          kind: 'ftp-profile',
          title,
          subtitle: `${profile.protocol}://${profile.host}:${profile.port}`,
          icon: 'ftp',
          score: match.score + WEIGHT + context.historyScore(id),
          highlights: match.highlights,
          action: { type: 'open-ftp-profile', profileId: profile.id },
        };
      })
      .filter((item): item is QuickLaunchItem => Boolean(item));
  },
};
```

Use the exact `FtpProfile` field names from `desktop/src/contracts/ftp.ts`.

- [ ] **Step 4: Add Todo provider**

Create `desktop/src/main/quick-launch/providers/todo_provider.ts`:

```ts
import { dbManager } from '@/core/database';
import type { QuickLaunchItem } from '@/contracts/quick_launch';
import { matchQuickLaunchCandidate } from '../matcher';
import type { QuickLaunchProvider } from '../types';

const WEIGHT = 80;

export const todoQuickLaunchProvider: QuickLaunchProvider = {
  id: 'todo',
  title: '待办',
  weight: WEIGHT,
  async search(input, context) {
    const query = input.query.trim();
    if (!query) return [];
    const todos = await dbManager.getDatabase().searchTodos(query);
    return todos.map((todo): QuickLaunchItem => {
      const id = `todo:${todo.id}`;
      const match = matchQuickLaunchCandidate(query, {
        id,
        title: todo.title,
        subtitle: todo.note ?? '',
        keywords: [todo.listId, todo.id],
      });
      return {
        id,
        providerId: 'todo',
        kind: 'todo',
        title: todo.title,
        subtitle: todo.note || '待办任务',
        icon: 'todo',
        score: Math.max(match.score, 500) + WEIGHT + context.historyScore(id),
        highlights: match.highlights,
        action: { type: 'open-todo', todoId: todo.id },
      };
    });
  },
};
```

- [ ] **Step 5: Add Knowledge provider**

Create `desktop/src/main/quick-launch/providers/knowledge_provider.ts`:

```ts
import { dbManager } from '@/core/database';
import type { KnowledgeSearchPayload } from '@/contracts/knowledge';
import type { QuickLaunchItem } from '@/contracts/quick_launch';
import type { QuickLaunchProvider } from '../types';

const WEIGHT = 80;

export const knowledgeQuickLaunchProvider: QuickLaunchProvider = {
  id: 'knowledge',
  title: '知识库',
  weight: WEIGHT,
  async search(input, context) {
    const query = input.query.trim();
    if (!query) return [];
    const payload: KnowledgeSearchPayload = {
      query,
      limit: Math.min(8, input.limit ?? 8),
    };
    const results = await dbManager.getDatabase().searchKnowledge(payload);
    return results.map((result): QuickLaunchItem => {
      const sourceId = result.nodeId || result.sourceId;
      const id = `knowledge:${sourceId}`;
      return {
        id,
        providerId: 'knowledge',
        kind: 'knowledge',
        title: result.title,
        subtitle: result.snippet || result.path || '知识库结果',
        icon: 'knowledge',
        score: Math.round((result.score ?? 0) * 100) + WEIGHT + context.historyScore(id),
        action: { type: 'open-knowledge-node', nodeId: sourceId, nodeType: result.nodeType },
      };
    });
  },
};
```

Use actual `KnowledgeSearchResult` fields from `desktop/src/contracts/knowledge.ts`; keep the action shape unchanged.

- [ ] **Step 6: Register providers**

In `desktop/src/main/quick-launch/service.ts`, import and register all providers in the constructor:

```ts
this.registerProvider(terminalQuickLaunchProvider);
this.registerProvider(sshQuickLaunchProvider);
this.registerProvider(ftpQuickLaunchProvider);
this.registerProvider(todoQuickLaunchProvider);
this.registerProvider(knowledgeQuickLaunchProvider);
```

- [ ] **Step 7: Run verification**

Run:

```bash
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
```

Expected:

```text
build completes without TypeScript errors
```

- [ ] **Step 8: Commit**

```bash
git add desktop/src/main/quick-launch/providers desktop/src/main/quick-launch/service.ts
git commit -m "feat(desktop): search app data in quick launch"
```

Commit body:

```text
Constraint: Reuse existing host and database APIs before adding new storage
Confidence: medium
Scope-risk: moderate
Tested: pnpm --dir desktop run lint; pnpm --dir desktop run build:app
```

### Task 8: Add Plugin Provider

**Files:**

- Create: `desktop/src/main/quick-launch/providers/plugin_provider.ts`
- Modify: `desktop/src/main/quick-launch/service.ts`
- Modify: `desktop/src/main/plugin-host/host_services.ts`

- [ ] **Step 1: Make plugin command execution real enough for launcher**

In `desktop/src/main/plugin-host/host_services.ts`, update `CommandService.execute()` so it resolves known command contributions:

```ts
async execute(commandId: string, payload?: unknown) {
  console.log('[plugin-command]', commandId, payload);
  return { accepted: true };
}
```

Keep the method returning `{ accepted: true }` for MVP, but ensure future work has a single execution seam. Do not make renderer invoke plugin command internals directly.

- [ ] **Step 2: Implement plugin provider**

Create `desktop/src/main/quick-launch/providers/plugin_provider.ts`:

```ts
import { pluginHost } from '@/main/plugin-host';
import type { QuickLaunchItem } from '@/contracts/quick_launch';
import { matchQuickLaunchCandidate } from '../matcher';
import type { QuickLaunchProvider } from '../types';

const WEIGHT = 70;

export const pluginQuickLaunchProvider: QuickLaunchProvider = {
  id: 'plugin',
  title: '插件',
  weight: WEIGHT,
  search(input, context) {
    const pages = pluginHost.listPages();
    const plugins = pluginHost.listPlugins().filter((record) => record.enabled);
    const pageItems = pages
      .map((page): QuickLaunchItem | null => {
        const id = `plugin-page:${page.pluginId}:${page.pageId}`;
        const match = matchQuickLaunchCandidate(input.query, {
          id,
          title: page.title,
          subtitle: page.description,
          keywords: [page.pluginId, page.pageId],
        });
        if (!match.matched) return null;
        return {
          id,
          providerId: 'plugin',
          kind: 'plugin-page',
          title: page.title,
          subtitle: page.description || page.routePath,
          icon: page.icon || 'plugins',
          score: match.score + WEIGHT + context.historyScore(id),
          highlights: match.highlights,
          action: {
            type: 'open-route',
            route: page.routePath,
            tabTitle: page.title,
            icon: page.icon,
          },
        };
      })
      .filter((item): item is QuickLaunchItem => Boolean(item));

    const commandItems = plugins.flatMap((record) =>
      (record.manifest.contributes.commands ?? []).map((command): QuickLaunchItem | null => {
        const id = `plugin-command:${record.manifest.id}:${command.id}`;
        const commandId = `${record.manifest.id}.${command.id}`;
        const match = matchQuickLaunchCandidate(input.query, {
          id,
          title: command.title,
          subtitle: command.description,
          keywords: [record.manifest.displayName, record.manifest.name, command.id],
        });
        if (!match.matched) return null;
        return {
          id,
          providerId: 'plugin',
          kind: 'plugin-command',
          title: command.title,
          subtitle: command.description || record.manifest.displayName,
          icon: 'plugins',
          score: match.score + WEIGHT + context.historyScore(id),
          highlights: match.highlights,
          action: {
            type: 'plugin-command',
            pluginId: record.manifest.id,
            commandId,
          },
        };
      }).filter((item): item is QuickLaunchItem => Boolean(item)),
    );

    return pageItems.concat(commandItems);
  },
};
```

- [ ] **Step 3: Register plugin provider**

In `desktop/src/main/quick-launch/service.ts`, register:

```ts
this.registerProvider(pluginQuickLaunchProvider);
```

- [ ] **Step 4: Run verification**

Run:

```bash
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
```

Expected:

```text
build completes without TypeScript errors
```

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/quick-launch/providers/plugin_provider.ts desktop/src/main/quick-launch/service.ts desktop/src/main/plugin-host/host_services.ts
git commit -m "feat(plugins): expose plugin contributions to quick launch"
```

Commit body:

```text
Constraint: Plugin actions remain mediated by host service permissions
Confidence: medium
Scope-risk: moderate
Tested: pnpm --dir desktop run lint; pnpm --dir desktop run build:app
```

### Task 9: Harden Query Freshness And Renderer States

**Files:**

- Modify: `desktop/src/windows/quick-launch/App.vue`
- Modify: `desktop/src/main/quick-launch/service.ts`

- [ ] **Step 1: Ignore stale renderer responses**

In `App.vue`, add:

```ts
let activeSessionId = '';
```

Update `search()`:

```ts
const sessionId = `renderer-${Date.now()}-${++sessionCounter}`;
activeSessionId = sessionId;
loading.value = true;
try {
  const result = await window.quickLaunchApi.search({
    query: query.value,
    sessionId,
  });
  if (result.sessionId !== activeSessionId) return;
  items.value = result.items;
  selectedIndex.value = Math.min(selectedIndex.value, Math.max(0, result.items.length - 1));
} finally {
  if (sessionId === activeSessionId) loading.value = false;
}
```

- [ ] **Step 2: Guard empty and disabled states**

In `service.ts`, before provider execution:

```ts
if (!config.features.quickLaunch.enabled) {
  return {
    query: input.query,
    sessionId,
    items: [],
    elapsedMs: Date.now() - startedAt,
    partial: false,
    errors: [],
  };
}
```

- [ ] **Step 3: Add visible provider errors**

In `App.vue`, add an `errors` ref:

```ts
const errors = ref<string[]>([]);
```

After search:

```ts
errors.value = result.errors.map((error) => `${error.providerId}: ${error.message}`);
```

Render the first error in status text only when there are no results:

```ts
if (!items.value.length && errors.value.length) return errors.value[0];
```

- [ ] **Step 4: Run verification**

Run:

```bash
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
```

Expected:

```text
build completes without TypeScript errors
```

- [ ] **Step 5: Commit**

```bash
git add desktop/src/windows/quick-launch/App.vue desktop/src/main/quick-launch/service.ts
git commit -m "fix(desktop): ignore stale quick launch results"
```

Commit body:

```text
Constraint: Slow providers must not overwrite newer query results
Confidence: high
Scope-risk: narrow
Tested: pnpm --dir desktop run lint; pnpm --dir desktop run build:app
```

### Task 10: Final Settings Polish And Manual QA

**Files:**

- Modify: `desktop/src/windows/main/pages/Settings.vue`
- Modify: `desktop/scripts/verify-quick-launch.cjs`
- Modify: `docs/desktop/VERIFICATION_CHECKLIST.md`

- [ ] **Step 1: Add provider settings controls**

In `Settings.vue`, add a compact provider checklist using existing UI checkbox components:

```vue
<UiSettingRow title="快速启动搜索源" description="控制快速启动会搜索哪些本地数据。">
  <div class="settings-shortcut-providers">
    <UiCheckbox
      v-for="provider in quickLaunchProviderOptions"
      :key="provider.id"
      :model-value="appConfigStore.config.features.quickLaunch.enabledProviders.includes(provider.id)"
      @update:modelValue="toggleQuickLaunchProvider(provider.id, $event)"
    >
      {{ provider.label }}
    </UiCheckbox>
  </div>
</UiSettingRow>
```

Add script data:

```ts
const quickLaunchProviderOptions = [
  { id: 'internal-route', label: '内置页面' },
  { id: 'terminal', label: '终端配置' },
  { id: 'ssh', label: 'SSH' },
  { id: 'ftp', label: 'FTP' },
  { id: 'todo', label: '待办' },
  { id: 'knowledge', label: '知识库' },
  { id: 'plugin', label: '插件' },
] as const;
```

Add updater:

```ts
async function toggleQuickLaunchProvider(providerId: QuickLaunchProviderId, enabled: boolean) {
  const current = appConfigStore.config.features.quickLaunch.enabledProviders;
  const next = enabled
    ? [...new Set([...current, providerId])]
    : current.filter((item) => item !== providerId);
  await appConfigStore.updateConfig({
    features: {
      quickLaunch: {
        enabledProviders: next.length ? next : ['internal-route'],
      },
    },
  });
}
```

- [ ] **Step 2: Extend static verification**

In `desktop/scripts/verify-quick-launch.cjs`, assert settings UI:

```js
const settingsPath = path.join(desktopRoot, 'src/windows/main/pages/Settings.vue');
assert.match(read(settingsPath), /toggleQuickLaunch/);
assert.match(read(settingsPath), /quickLaunchProviderOptions/);
```

- [ ] **Step 3: Update verification checklist**

Append to `docs/desktop/VERIFICATION_CHECKLIST.md`:

```markdown
## Quick Launch

- Global shortcut can be configured and inspected in Settings.
- Quick launch opens centered on the active display.
- Esc hides the window.
- Arrow keys move selection without changing layout.
- Enter executes the selected item and hides the window.
- Internal pages, terminal profiles, SSH profiles, FTP profiles, Todo, Knowledge, and plugin contributions appear when enabled.
- Disabled providers do not appear in search results.
- Slow searches do not overwrite newer search results.
- `pnpm --dir desktop run verify:quick-launch` passes.
- `pnpm --dir desktop run build:app` passes.
```

- [ ] **Step 4: Run full desktop verification**

Run:

```bash
pnpm --dir desktop run verify:quick-launch
pnpm --dir desktop run lint
pnpm --dir desktop run build:app
```

Expected:

```text
Quick launch static verification passed
desktop lint passes
desktop build completes
```

- [ ] **Step 5: Manual QA**

Run:

```bash
pnpm run desktop:start
```

Manual checks:

- Press configured shortcut.
- Type `终端`, press Enter, confirm main window opens terminal.
- Type `设置`, press Enter, confirm settings route opens.
- Type an existing SSH profile host, press Enter, confirm terminal route receives `sshProfileId`.
- Type an existing FTP profile label, press Enter, confirm FTP route receives `profileId`.
- Type a Todo title, press Enter, confirm Todo route receives `todoId`.
- Type a Knowledge page title, press Enter, confirm Knowledge route receives `nodeId`.
- Disable `todo` provider in Settings, search the same Todo title, confirm Todo result disappears.
- Press Esc, confirm launcher hides.
- Trigger shortcut twice, confirm second trigger hides or reopens predictably.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/windows/main/pages/Settings.vue desktop/scripts/verify-quick-launch.cjs docs/desktop/VERIFICATION_CHECKLIST.md
git commit -m "docs(desktop): add quick launch verification path"
```

Commit body:

```text
Confidence: high
Scope-risk: narrow
Tested: pnpm --dir desktop run verify:quick-launch; pnpm --dir desktop run lint; pnpm --dir desktop run build:app; manual quick launch route checks
```

## Phase 2 Plan: OS App And File Search

Implement Phase 2 only after the MVP is stable.

### System App Provider

Create:

- `desktop/src/main/quick-launch/providers/system_app_provider.ts`
- `desktop/src/main/quick-launch/system_app_indexer.ts`

Windows first:

- Scan `%APPDATA%\Microsoft\Windows\Start Menu\Programs`
- Scan `%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs`
- Parse `.lnk` metadata using PowerShell only if needed.
- Add UWP app discovery later through a platform adapter.

Avoid:

- Blocking startup on app indexing.
- Indexing arbitrary disk paths.
- Elevation prompts in MVP.

### File Search Provider

Preferred order:

1. Windows Search provider through platform API if available and reliable.
2. Optional Everything provider only when Everything is installed and user enables it.
3. Small scoped project-directory search for GuYanTools-owned files.

Everything provider must:

- Detect service availability.
- Show a clear unavailable result instead of throwing.
- Never install Everything silently.
- Respect max result limits.

## Security Rules

- Renderer never receives Node integration.
- Renderer only sends selected `QuickLaunchItem` back through `quick-launch:execute`.
- Main process validates action type.
- No `exec`, `spawn`, or shell command action in MVP.
- `open-path` is allowed only for paths returned by trusted providers.
- Plugin commands run through `pluginHost.getHostServices().commands.execute`.
- Future plugin dynamic commands must declare permissions in manifest before appearing in launcher results.

## Accessibility And UX Rules

- First focus always lands in the search input.
- Esc hides the launcher.
- Arrow Up and Arrow Down wrap within visible results.
- Enter executes selected result.
- Ctrl+R refreshes provider indexes.
- Results have fixed row height to avoid layout shift.
- Text truncates with ellipsis instead of overflowing.
- No instructional marketing copy inside the launcher.
- Empty state is one concise line.
- Provider badges use short labels: 页面, 终端, SSH, FTP, 任务, 知识, 插件页, 插件命令.

## Verification Matrix

| Area | Command or Check | Required Result |
| --- | --- | --- |
| Contracts | `pnpm --dir desktop run verify:quick-launch` | Static checks pass |
| TypeScript and lint | `pnpm --dir desktop run lint` | No new lint errors |
| Build | `pnpm --dir desktop run build:app` | Main, preload, renderer build |
| Runtime | `pnpm run desktop:start` | Launcher opens and executes routes |
| Shortcut conflict | Settings shortcut inspection | Conflict shown if `Alt+Space` unavailable |
| Stale query | Type fast into launcher | Latest query remains visible |
| Provider disable | Disable a provider | Provider results disappear |
| Security | Try unsupported action in devtools | Main process returns unsupported action |

## Rollback Plan

If the feature causes instability:

1. Disable `features.quickLaunch.enabled` in app config normalization default.
2. Unregister `toggleQuickLaunch` from `ShortcutService`.
3. Leave contracts and provider files in place for later repair.
4. Remove `quick_launcher` from Vite input only if renderer build is broken.

This keeps user data and existing shortcuts intact.

## Completion Criteria

The implementation is complete when:

- `Alt+Space` or configured shortcut opens the quick launcher.
- The launcher searches all MVP providers.
- Enter executes selected results through main-process actions.
- Esc and blur hide the launcher according to settings.
- Provider settings persist.
- Usage history influences ranking.
- `pnpm --dir desktop run verify:quick-launch` passes.
- `pnpm --dir desktop run lint` passes.
- `pnpm --dir desktop run build:app` passes.
- Manual QA checklist passes on Windows.

## Plan Self-Review

- Spec coverage: Flow-style query cancellation, uTools-style contributions, Electron windowing, shortcuts, providers, settings, security, and verification are each assigned to tasks.
- Placeholder scan: No unresolved placeholder steps remain; Phase 2 is explicitly out of MVP scope and has bounded follow-up tasks.
- Type consistency: Contract names used in provider, service, preload, and renderer tasks match `QuickLaunch*` exported types.
- Scope check: MVP is a single coherent subsystem. OS app and file indexing are separated into Phase 2 to keep the first implementation shippable.
