# Desktop Design System Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the desktop renderer to one coherent design system so theme tokens, typography, spacing, overlays, and reusable UI components behave consistently across Home, Settings, WebView, Knowledge, FTP, Terminal, Todo, and shared chrome.

**Architecture:** Keep the existing Vue 3 + SCSS + CSS-variable architecture. First add guardrails and missing semantic aliases, then migrate page surfaces in small batches from page-private CSS and native controls toward `desktop/src/windows/main/components/ui/` components and documented `--ui-*` tokens.

**Tech Stack:** Electron Forge, Vite, Vue 3, TypeScript, Pinia, SCSS, CSS custom properties, Node.js validation scripts, existing desktop lint/build commands.

---

## 1. Migration Principles

- Preserve current behavior and layout unless a task explicitly changes visual structure.
- Do not add runtime dependencies.
- Prefer aliases and compatibility shims before deleting old tokens.
- Keep every migration batch independently buildable and reviewable.
- Move from "page-private style" to "documented system token/component" only when the replacement is already available or added in the same task.
- Use `docs/desktop/KnowledgeBase/development-plan.md` and `docs/desktop/KnowledgeBase/ui-design.md` as already-written evidence for Knowledge-specific constraints: Knowledge must consume shared UI components and must not grow a standalone `--color-*` design system.

## 2. File Structure

### Create

- `docs/desktop/DESIGN_SYSTEM.md`
  - Canonical desktop design-system reference.
  - Defines token layers, component usage rules, overlay levels, typography scale, and migration rules.
- `desktop/scripts/check-design-system.mjs`
  - Dependency-free Node script that scans renderer files for undefined CSS variables, forbidden standalone aliases, hardcoded z-index values, and native controls that should be reviewed.

### Modify

- `desktop/package.json`
  - Add `lint:design-system`.
- `desktop/src/windows/main/global.css`
  - Normalize global font aliases and base typography variables.
- `desktop/src/windows/main/assets/foundation.scss`
  - Add typography scale, z-index scale, and any missing foundation tokens.
- `desktop/src/windows/main/assets/theme.scss`
  - Add semantic aliases for status, primary, elevated surfaces, and shadows in both light and dark themes.
- `desktop/src/windows/main/App.vue`
  - Replace fallback-only popup titlebar token use with canonical tokens after aliases exist.
- `desktop/src/windows/main/components/ui/*.vue`
  - Adjust shared components only when a missing token needs one common consumer to prove the token shape.
- `desktop/src/windows/main/pages/Knowledge/**`
  - Remove standalone `--color-*` drift where possible and replace native controls with shared UI components.
- `desktop/src/windows/main/pages/Settings.vue`
  - Replace native checkboxes and search/input surfaces that duplicate existing UI components.
- `desktop/src/windows/main/pages/WebViewPage.vue`
  - Replace fallback aliases such as `--ui-primary-color` with canonical tokens or aliases added in Task 2.
- `desktop/src/windows/main/pages/Ftp/**`
  - Replace hardcoded overlay levels and isolated native form controls in dialog surfaces.
- `desktop/src/windows/main/pages/Terminal/**`
  - Replace hardcoded overlay levels and isolated dialog controls where shared components already match the interaction.
- `docs/README.md`
  - Link this migration plan and the final design-system reference.

### Tests and Validation

- `pnpm --dir desktop run lint:design-system`
- `pnpm --dir desktop run lint`
- `pnpm --dir desktop exec tsc --noEmit -p tsconfig.json`
- `pnpm --dir desktop run build:app`
- Manual theme pass on `/settings`, `/knowledge`, `/ftp`, `/terminal`, `/webview`, `/todo`, `/home`.

---

## 3. Task Plan

### Task 1: Add Design-System Guardrail Script

**Files:**
- Create: `desktop/scripts/check-design-system.mjs`
- Modify: `desktop/package.json`

- [ ] **Step 1: Create the checker script**

Create `desktop/scripts/check-design-system.mjs` with this content:

```js
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const scanRoot = join(root, 'src', 'windows', 'main');
const fileExts = new Set(['.vue', '.scss', '.css', '.ts']);

const allowedUndefinedVars = new Set([
  '--quick-note-accent',
  '--tag-color',
  '--widget-text-primary',
  '--widget-text-secondary',
  '--widget-text-muted',
]);

const discouragedAliasPrefixes = [
  '--color-',
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!['node_modules', 'dist', '.vite'].includes(entry)) walk(path, files);
      continue;
    }
    const ext = path.slice(path.lastIndexOf('.'));
    if (fileExts.has(ext)) files.push(path);
  }
  return files;
}

const files = walk(scanRoot);
const defined = new Map();
const used = new Map();
const nativeControlHits = [];
const zIndexHits = [];
const discouragedAliases = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(root, file).replace(/\\/g, '/');

  for (const match of text.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
    const name = match[1];
    if (!defined.has(name)) defined.set(name, []);
    defined.get(name).push(rel);
    if (discouragedAliasPrefixes.some((prefix) => name.startsWith(prefix))) {
      discouragedAliases.push(`${rel}: defines ${name}`);
    }
  }

  for (const match of text.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
    const name = match[1];
    if (!used.has(name)) used.set(name, []);
    used.get(name).push(rel);
  }

  for (const match of text.matchAll(/z-index:\s*(\d+)/g)) {
    const value = Number(match[1]);
    if (value >= 20) zIndexHits.push(`${rel}: z-index ${value}`);
  }

  if (!rel.includes('/components/ui/')) {
    for (const match of text.matchAll(/<(button|input|select|textarea)\b/g)) {
      nativeControlHits.push(`${rel}: native <${match[1]}>`);
    }
  }
}

const undefinedVars = [];
for (const [name, refs] of used.entries()) {
  if (!defined.has(name) && !allowedUndefinedVars.has(name)) {
    undefinedVars.push(`${name} used in ${[...new Set(refs)].join(', ')}`);
  }
}

const failures = [];
if (undefinedVars.length) {
  failures.push(['Undefined CSS variables', undefinedVars]);
}

const warnings = [];
if (discouragedAliases.length) warnings.push(['Discouraged standalone aliases', discouragedAliases]);
if (zIndexHits.length) warnings.push(['Numeric z-index values >= 20', zIndexHits]);
if (nativeControlHits.length) warnings.push(['Native controls outside components/ui', nativeControlHits]);

for (const [title, items] of warnings) {
  console.warn(`\n[design-system warning] ${title}`);
  for (const item of items.slice(0, 80)) console.warn(`- ${item}`);
  if (items.length > 80) console.warn(`- ... ${items.length - 80} more`);
}

if (failures.length) {
  for (const [title, items] of failures) {
    console.error(`\n[design-system error] ${title}`);
    for (const item of items) console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log('[design-system] no undefined CSS variables found');
```

- [ ] **Step 2: Add the package script**

Modify `desktop/package.json` scripts:

```json
{
  "lint:design-system": "node scripts/check-design-system.mjs"
}
```

Keep the existing scripts unchanged.

- [ ] **Step 3: Run the checker and record the baseline**

Run:

```bash
pnpm --dir desktop run lint:design-system
```

Expected for the first run: it may fail on undefined variables already identified in the audit. Copy the failing variable list into the commit body because Task 2 will fix those variables.

- [ ] **Step 4: Commit**

```bash
git add desktop/scripts/check-design-system.mjs desktop/package.json
git commit
```

Commit intent line:

```text
Add a design-system guardrail before token migration
```

Recommended trailers:

```text
Constraint: Keep the first guardrail dependency-free and renderer-only
Confidence: high
Scope-risk: narrow
Tested: pnpm --dir desktop run lint:design-system
```

### Task 2: Normalize Core Token Aliases

**Files:**
- Modify: `desktop/src/windows/main/global.css`
- Modify: `desktop/src/windows/main/assets/foundation.scss`
- Modify: `desktop/src/windows/main/assets/theme.scss`
- Modify: `desktop/src/windows/main/App.vue`
- Test: `desktop/scripts/check-design-system.mjs`

- [ ] **Step 1: Add global font aliases**

In `desktop/src/windows/main/global.css`, keep the existing `--app-font-sans` and `--app-font-mono`, then add canonical compatibility aliases:

```css
:root {
  --ui-font-family: var(--app-font-family, var(--app-font-sans));
  --ui-font-family-mono: var(--app-font-mono);
  --ui-font-mono: var(--app-font-mono);
  --font-mono: var(--app-font-mono);
}
```

- [ ] **Step 2: Add foundation scale tokens**

In `desktop/src/windows/main/assets/foundation.scss`, add these tokens inside `:root`:

```scss
  --ui-font-size-xs: 0.75rem;
  --ui-font-size-sm: 0.82rem;
  --ui-font-size-md: 0.9rem;
  --ui-font-size-lg: 1rem;
  --ui-font-size-xl: 1.125rem;
  --ui-font-size-display-sm: 1.375rem;
  --ui-font-size-display-md: 1.875rem;

  --ui-z-base: 0;
  --ui-z-raised: 1;
  --ui-z-sticky: 20;
  --ui-z-docked: 100;
  --ui-z-popover: 1000;
  --ui-z-topbar: 3000;
  --ui-z-modal: 9000;
  --ui-z-toast: 10000;
  --ui-z-critical: 10040;
```

Use these names because they match the current observed ranges: normal content, sticky toolbars, docked panels, popovers, topbar menus, dialogs, notifications, and select/date/time dropdowns.

- [ ] **Step 3: Add semantic aliases in both themes**

In both `.light` and `.dark` blocks of `desktop/src/windows/main/assets/theme.scss`, add canonical aliases near existing text/surface/status definitions.

For `.light`:

```scss
  --ui-primary-color: var(--primary-color);
  --ui-success-color: #059669;
  --ui-warning-color: #b45309;
  --ui-danger-color: var(--ui-state-error);
  --ui-text-warning: #b45309;
  --ui-state-success: #059669;
  --ui-state-warning: #b45309;
  --ui-state-error-rgb: 220 38 38;
  --ui-surface-elevated: var(--ui-surface-panel);
  --ui-panel-bg: var(--ui-surface-panel);
  --ui-surface-muted: var(--ui-surface-panel-muted);
  --ui-shadow-card: var(--ui-card-shadow);
  --ui-shadow-popover: var(--ui-shadow-lg);
```

For `.dark`:

```scss
  --ui-primary-color: var(--primary-color);
  --ui-success-color: #34d399;
  --ui-warning-color: #fbbf24;
  --ui-danger-color: var(--ui-state-error);
  --ui-text-warning: #fbbf24;
  --ui-state-success: #34d399;
  --ui-state-warning: #fbbf24;
  --ui-state-error-rgb: 239 68 68;
  --ui-surface-elevated: var(--ui-surface-panel);
  --ui-panel-bg: var(--ui-surface-panel);
  --ui-surface-muted: var(--ui-surface-panel-muted);
  --ui-shadow-card: var(--ui-card-shadow);
  --ui-shadow-popover: var(--ui-shadow-lg);
```

- [ ] **Step 4: Remove fallback dependency in App popup titlebar**

Change `desktop/src/windows/main/App.vue` popup titlebar styles from fallback-only usage to canonical tokens:

```scss
.popup-titlebar {
  background: var(--ui-surface-elevated);
  border-bottom: 1px solid var(--ui-border-subtle);
}
```

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --dir desktop run lint:design-system
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

Expected: no undefined CSS variable errors. Warnings about native controls and numeric z-index values may remain until later tasks.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/windows/main/global.css desktop/src/windows/main/assets/foundation.scss desktop/src/windows/main/assets/theme.scss desktop/src/windows/main/App.vue
git commit
```

Commit intent line:

```text
Stabilize desktop design tokens before page migrations
```

Recommended trailers:

```text
Constraint: Preserve existing page visuals through compatibility aliases
Rejected: Rename every existing token in one pass | too broad for review and too risky with current page-specific styles
Confidence: high
Scope-risk: moderate
Tested: pnpm --dir desktop run lint:design-system; pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

### Task 3: Document the Desktop Design System Contract

**Files:**
- Create: `docs/desktop/DESIGN_SYSTEM.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Create the design-system reference**

Create `docs/desktop/DESIGN_SYSTEM.md` with these sections:

```markdown
# 桌面端设计系统

## 1. 适用范围

本文件约束 `desktop/src/windows/main/` 下主窗口 renderer 的主题变量、通用 UI 组件、页面布局、浮层层级、字体字号和迁移规则。独立窗口可以复用本文件，但不得反向要求主窗口迁就独立窗口的局部样式。

## 2. Token 分层

| 层级 | 命名 | 职责 |
| --- | --- | --- |
| 基础 token | `--ui-radius-*`、`--ui-shadow-*`、`--ui-control-*`、`--ui-font-size-*`、`--ui-z-*` | 尺寸、圆角、阴影、动效、层级等不带业务语义的基础值 |
| 语义 token | `--ui-text-*`、`--ui-surface-*`、`--ui-border-*`、`--ui-state-*` | 主题相关语义颜色和状态 |
| 组件 token | `--ui-button-*`、`--ui-input-*`、`--ui-select-*`、`--ui-tabs-*`、`--ui-menu-*` | 通用 UI 组件私有但可主题化的变量 |
| 业务 token | `--todo-*`、`--home-*`、`--widget-*` | 有明确业务归属的页面级变量 |
| 兼容别名 | `--ui-primary-color`、`--ui-danger-color`、`--ui-font-mono` | 迁移期保留，新增代码优先使用语义 token |

## 3. 组件使用规则

- 操作按钮使用 `UiButton` 或 `UiIconButton`。
- 文本、数字、搜索输入优先使用 `UiInput`。
- 选择器使用 `UiSelect`。
- 复选框使用 `UiCheckbox`。
- 弹窗使用 `UiDialog`，抽屉使用 `UiDrawer`，菜单使用 `UiMenu`。
- 页面内确实需要原生 `input[type=file]`、`input[type=color]`、`input[type=range]` 时，应将其封装在页面私有类中，并使用 `--ui-*` token 控制外观。

## 4. 浮层层级

| Token | 用途 |
| --- | --- |
| `--ui-z-sticky` | 页面内 sticky toolbar 或局部浮动条 |
| `--ui-z-docked` | 页面 dock、搜索面板、传输队列 |
| `--ui-z-popover` | 非模态菜单、预览、轻量浮层 |
| `--ui-z-topbar` | 顶栏菜单和顶栏遮罩 |
| `--ui-z-modal` | 普通模态弹窗 |
| `--ui-z-toast` | 全局通知、Tab 预览 |
| `--ui-z-critical` | Select、日期、时间等必须压过普通弹窗内容的控件浮层 |

新增 `z-index` 不直接写数字；先选择上述 token。

## 5. 迁移规则

- 不再新增独立的 `--color-*` 体系。需要局部别名时，必须在页面根节点映射到 `--ui-*`。
- 不再新增未定义 fallback token。新增 token 必须同时进入 light/dark。
- 不在页面里复制通用按钮、输入框、选择器、复选框的基础样式。
- 字号使用 `rem` 或 `--ui-font-size-*`。仅图标、canvas、终端单元格等固定像素场景可以保留 `px`。
- 视觉迁移每次只处理一个页面或一个组件族，并跑 `lint:design-system`。
```

- [ ] **Step 2: Link it from the docs index**

Add this line under `docs/README.md` 的 `近期开发计划`:

```markdown
- [桌面端设计系统迁移计划](plans/desktop-design-system-migration-plan.md)
```

Add this line near desktop-related documents:

```markdown
- [桌面端设计系统](desktop/DESIGN_SYSTEM.md)
```

- [ ] **Step 3: Verify**

Run:

```bash
git diff --check docs/desktop/DESIGN_SYSTEM.md docs/README.md
```

Expected: no whitespace errors.

- [ ] **Step 4: Commit**

```bash
git add docs/desktop/DESIGN_SYSTEM.md docs/README.md
git commit
```

Commit intent line:

```text
Make the desktop design-system contract explicit
```

Recommended trailers:

```text
Constraint: Existing code already has mixed token generations, so the contract documents migration rules before large edits
Confidence: high
Scope-risk: narrow
Tested: git diff --check docs/desktop/DESIGN_SYSTEM.md docs/README.md
```

### Task 4: Migrate Knowledge Controls and Local Color Aliases

**Files:**
- Modify: `desktop/src/windows/main/pages/Knowledge/KnowledgePage.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeMarkdownEditor.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue`
- Test: `desktop/scripts/check-design-system.mjs`

- [ ] **Step 1: Replace search inputs with `UiInput`**

In `KnowledgePage.vue`, import `UiInput` and replace page search controls:

```vue
<UiInput v-model="searchQuery" type="search" size="sm" placeholder="搜索当前库" />
```

For quick note search:

```vue
<UiInput v-model="store.quickNoteSearch" type="search" size="sm" placeholder="搜索速记" />
```

- [ ] **Step 2: Keep file/color/range inputs native with scoped classes**

Do not replace:

```vue
<input type="file">
<input type="color">
<input type="range">
```

Document those as allowed native controls in `docs/desktop/DESIGN_SYSTEM.md` if they are not already listed.

- [ ] **Step 3: Replace repeated text/number inputs in Knowledge editors**

In `KnowledgeBlockEditor.vue` and `KnowledgeCanvasEditor.vue`, replace native text/number inputs with `UiInput` when they are not file/color/range controls.

Example canvas position field:

```vue
<UiInput
  :model-value="String(Math.round(selectedElement.x))"
  type="number"
  size="sm"
  @update:model-value="updateSelectedNumber('x', $event)"
/>
```

Add this helper if the component expects DOM input events:

```ts
function updateSelectedNumberFromValue(key: 'x' | 'y' | 'width' | 'height', value: string) {
  updateSelectedNumber(key, value);
}
```

- [ ] **Step 4: Collapse `--color-*` aliases to a documented bridge**

Keep only this root bridge in `KnowledgePage.vue` until all child editors are migrated:

```scss
.knowledge-page {
  --color-bg: var(--background-color);
  --color-text: var(--ui-text-primary);
  --color-text-secondary: var(--ui-text-muted);
  --color-primary: var(--primary-color);
  --color-border: var(--ui-border-subtle);
  --color-warning: var(--ui-warning-color);
}
```

Remove additional local `--color-*` definitions from child components unless they are explicitly page data, such as `--quick-note-accent` or `--tag-color`.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --dir desktop run lint:design-system
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

Expected: no undefined token errors. Native-control warnings for file/color/range inputs may remain and should be listed as allowed in the checker allowlist or documented as warnings.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/windows/main/pages/Knowledge/KnowledgePage.vue desktop/src/windows/main/pages/Knowledge/components/KnowledgeMarkdownEditor.vue desktop/src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue desktop/src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue docs/desktop/DESIGN_SYSTEM.md
git commit
```

Commit intent line:

```text
Bring Knowledge controls under the shared desktop UI system
```

Recommended trailers:

```text
Constraint: Knowledge docs already require shared UI components and forbid a standalone color system
Rejected: Rewrite Knowledge layout at the same time | control migration is enough risk for one batch
Confidence: medium
Scope-risk: moderate
Tested: pnpm --dir desktop run lint:design-system; pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

### Task 5: Migrate Settings and WebView Native Controls

**Files:**
- Modify: `desktop/src/windows/main/pages/Settings.vue`
- Modify: `desktop/src/windows/main/pages/WebViewPage.vue`
- Test: `desktop/scripts/check-design-system.mjs`

- [ ] **Step 1: Import `UiCheckbox` in Settings**

Add:

```ts
import UiCheckbox from '../components/ui/UiCheckbox.vue';
```

- [ ] **Step 2: Replace boolean settings checkboxes**

Replace native setting checkboxes such as:

```vue
<input v-model="ftpLinkNavigationEnabled" type="checkbox" />
```

with:

```vue
<UiCheckbox v-model="ftpLinkNavigationEnabled" size="sm">
  启用 FTP 链接跳转
</UiCheckbox>
```

Use the existing visible label text from the surrounding setting item. Do not invent new setting names.

- [ ] **Step 3: Replace WebView script toggles**

In `WebViewPage.vue`, import `UiCheckbox` and replace:

```vue
<input type="checkbox" :checked="script.enabled" @change="toggleScript(script)" />
```

with:

```vue
<UiCheckbox
  size="sm"
  :model-value="script.enabled"
  @update:model-value="toggleScript(script)"
>
  启用
</UiCheckbox>
```

If `toggleScript` expects the raw event, change it to accept the script object and target boolean:

```ts
function toggleScript(script: WebScript, enabled = !script.enabled) {
  webviewStore.updateScript(script.id, { enabled });
}
```

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --dir desktop run lint:design-system
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

Expected: Settings and WebView no longer report ordinary boolean checkbox warnings, except permission multi-select checkboxes that are intentionally compact and will be migrated in a later batch if needed.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/windows/main/pages/Settings.vue desktop/src/windows/main/pages/WebViewPage.vue
git commit
```

Commit intent line:

```text
Align Settings and WebView boolean controls with shared UI
```

Recommended trailers:

```text
Constraint: Keep settings behavior unchanged while replacing only control surfaces
Confidence: medium
Scope-risk: moderate
Tested: pnpm --dir desktop run lint:design-system; pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

### Task 6: Replace Numeric z-index Values with Layer Tokens

**Files:**
- Modify: `desktop/src/windows/main/components/AppNotificationHost.vue`
- Modify: `desktop/src/windows/main/components/bottombar/TabPreview.vue`
- Modify: `desktop/src/windows/main/components/topbar/topbar.scss`
- Modify: `desktop/src/windows/main/pages/Ftp/FtpPage.scss`
- Modify: `desktop/src/windows/main/pages/Terminal/TerminalPage.vue`
- Modify: `desktop/src/windows/main/pages/Todo/components/ReminderPicker.vue`
- Modify: `desktop/src/windows/main/pages/Todo/components/RepeatPicker.vue`
- Test: `desktop/scripts/check-design-system.mjs`

- [ ] **Step 1: Replace notification and preview layers**

Use:

```scss
z-index: var(--ui-z-toast);
```

for global notifications and tab previews.

- [ ] **Step 2: Replace topbar menu layers**

Use:

```scss
z-index: var(--ui-z-topbar);
```

for topbar menus and:

```scss
z-index: calc(var(--ui-z-topbar) - 1);
```

for topbar masks.

- [ ] **Step 3: Replace page popover and modal layers**

Use:

```scss
z-index: var(--ui-z-popover);
```

for page-local floating panels and:

```scss
z-index: var(--ui-z-modal);
```

for page modal overlays that are not already rendered through `UiDialog`.

- [ ] **Step 4: Keep critical control dropdowns on the critical layer**

Use:

```scss
z-index: var(--ui-z-critical);
```

for select/date/time/repeat/reminder dropdowns that must float above pane clipping and ordinary modals.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --dir desktop run lint:design-system
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

Expected: numeric z-index warnings should be reduced to local values below `20` used for internal stacking contexts.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/windows/main/components/AppNotificationHost.vue desktop/src/windows/main/components/bottombar/TabPreview.vue desktop/src/windows/main/components/topbar/topbar.scss desktop/src/windows/main/pages/Ftp/FtpPage.scss desktop/src/windows/main/pages/Terminal/TerminalPage.vue desktop/src/windows/main/pages/Todo/components/ReminderPicker.vue desktop/src/windows/main/pages/Todo/components/RepeatPicker.vue
git commit
```

Commit intent line:

```text
Replace desktop overlay magic numbers with layer tokens
```

Recommended trailers:

```text
Constraint: Preserve existing overlay ordering while making layer choices named
Confidence: medium
Scope-risk: moderate
Tested: pnpm --dir desktop run lint:design-system; pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

### Task 7: Normalize Typography on High-Churn Pages

**Files:**
- Modify: `desktop/src/windows/main/pages/Settings.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/KnowledgePage.vue`
- Modify: `desktop/src/windows/main/pages/Ftp/FtpPage.scss`
- Modify: `desktop/src/windows/main/pages/Terminal/TerminalPage.vue`
- Modify: `desktop/src/windows/main/pages/WebViewPage.vue`
- Test: manual Settings font-size behavior

- [ ] **Step 1: Replace ordinary text pixel sizes**

For ordinary UI labels and body text, map common fixed sizes to tokens:

```scss
font-size: var(--ui-font-size-xs); // replaces 11px/12px captions when compact
font-size: var(--ui-font-size-sm); // replaces 13px controls and metadata
font-size: var(--ui-font-size-md); // replaces 14px normal body/control text
font-size: var(--ui-font-size-lg); // replaces 15px/16px prominent text
```

Do not replace canvas geometry, terminal emulator cell metrics, icon-only sizing, or media crop handles in this task.

- [ ] **Step 2: Replace mono font aliases**

Replace:

```scss
font-family: Consolas, "Cascadia Mono", monospace;
font-family: 'Courier New', monospace;
font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace);
```

with:

```scss
font-family: var(--ui-font-family-mono);
```

- [ ] **Step 3: Verify base font-size scaling**

Run:

```bash
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
```

Manual check:

1. Start the desktop app.
2. Open Settings.
3. Change base font size from `16` to `18`.
4. Confirm shared controls and migrated page text scale together.
5. Open Knowledge, FTP, Terminal, and WebView.
6. Confirm terminal content itself remains governed by terminal settings, not by the generic UI typography migration.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/windows/main/pages/Settings.vue desktop/src/windows/main/pages/Knowledge/KnowledgePage.vue desktop/src/windows/main/pages/Ftp/FtpPage.scss desktop/src/windows/main/pages/Terminal/TerminalPage.vue desktop/src/windows/main/pages/WebViewPage.vue
git commit
```

Commit intent line:

```text
Make desktop page typography respect the configured base size
```

Recommended trailers:

```text
Constraint: Terminal cell sizing and canvas geometry remain fixed-pixel where that is the product behavior
Confidence: medium
Scope-risk: broad
Tested: pnpm --dir desktop exec tsc --noEmit -p tsconfig.json; pnpm --dir desktop run build:app; manual base font-size pass on Settings, Knowledge, FTP, Terminal, WebView
```

### Task 8: Final Visual Regression Pass and Cleanup

**Files:**
- Modify only files touched by failed verification.
- Do not start new migrations in this task.

- [ ] **Step 1: Run full desktop verification**

Run:

```bash
pnpm --dir desktop run lint:design-system
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
```

Expected:

- `lint:design-system` has no undefined token errors.
- ESLint has no new violations in changed files.
- TypeScript passes.
- Desktop build passes.

- [ ] **Step 2: Manual theme and overlay matrix**

Check these surfaces in light and dark themes:

| Surface | Check |
| --- | --- |
| Home | widget cards, widget editor, context menu, custom backgrounds |
| Settings | tabs, search, checkboxes, selects, WebView/plugin sections |
| Knowledge | toolbar, tree, markdown/block/canvas editors, quick notes, inspector |
| FTP | config sidebar, browser panels, transfer queue, schedule dialogs |
| Terminal | sidebar, toolbar, search panel, SSH dialogs, password prompt |
| WebView | toolbar, keep-alive hints, script drawer, safety screen |
| Todo | reminder/repeat pickers, sidebar, detail pane, background text contrast |

- [ ] **Step 3: Update the design-system document with confirmed exceptions**

If manual checks find controls that must remain native, add them to `docs/desktop/DESIGN_SYSTEM.md` under "Allowed native controls" with exact reasons. Valid examples:

```markdown
- `input[type=file]`: required for OS file picker access.
- `input[type=color]`: required for native color picker in personalization tools.
- `input[type=range]`: used for visual sliders where `UiInput` would reduce interaction quality.
```

- [ ] **Step 4: Commit**

```bash
git add docs/desktop/DESIGN_SYSTEM.md desktop/src/windows/main
git commit
```

Commit intent line:

```text
Finish the first desktop design-system migration pass
```

Recommended trailers:

```text
Constraint: Final pass is limited to fixes discovered by verification, not new visual redesign
Confidence: high
Scope-risk: moderate
Tested: pnpm --dir desktop run lint:design-system; pnpm --dir desktop run lint; pnpm --dir desktop exec tsc --noEmit -p tsconfig.json; pnpm --dir desktop run build:app; manual light/dark pass across Home, Settings, Knowledge, FTP, Terminal, WebView, Todo
```

---

## 4. Release and Rollback Notes

- This migration should be shipped as multiple commits, not one large commit.
- Tasks 1-3 are infrastructure and documentation; they are safe to merge before page migrations.
- Tasks 4-7 can be paused independently if a page migration exposes unrelated regressions.
- Rollback path is cleanest at commit boundaries:
  - Revert Task 7 if typography scaling causes density issues.
  - Revert Task 6 if overlay ordering changes unexpectedly.
  - Revert Task 4 or 5 if a page-specific control behavior changes.
  - Keep Task 1-3 unless the checker itself blocks unrelated work.

## 5. Completion Criteria

- `docs/desktop/DESIGN_SYSTEM.md` exists and is linked from `docs/README.md`.
- `pnpm --dir desktop run lint:design-system` exists and passes with no undefined token errors.
- Missing aliases identified in the audit are defined in canonical token files.
- New code has a named z-index layer instead of numeric overlay magic numbers.
- Knowledge no longer grows a standalone `--color-*` system beyond the documented compatibility bridge.
- Settings and WebView ordinary boolean controls use `UiCheckbox`.
- Migrated UI text respects the configured base font size.
- Manual light/dark checks are completed for Home, Settings, Knowledge, FTP, Terminal, WebView, and Todo.
