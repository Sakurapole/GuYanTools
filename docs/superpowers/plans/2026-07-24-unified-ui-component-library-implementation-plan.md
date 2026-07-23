# Unified UI Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a shared UI component library that is consumed by both the Electron Vue application and sandboxed cross-framework plugins, without breaking existing `Ui*` or `@guyantools/plugin-ui` consumers.

**Architecture:** Create `@guyantools/ui-core` as the framework-free token and Custom Element layer, and `@guyantools/ui-vue` as the Vue 3 adapter layer. Convert `@guyantools/plugin-ui` into a compatibility facade over core, then replace the desktop's selected local `Ui*.vue` files with thin re-exports so existing call sites resolve to the shared library.

**Tech Stack:** pnpm workspaces, TypeScript, Vite library builds, Custom Elements, Shadow DOM, CSS Custom Properties, Vue 3, Vue Test Utils, Vitest, jsdom, SCSS, Electron/Vite.

---

## Implementation rules

- Preserve unrelated working-tree changes in `desktop/src/contracts`, `desktop/src/main`, `packages/plugin-sdk`, and untracked design files.
- `@guyantools/ui-core` must not import Vue, Electron, Node.js, Pinia, Router, `desktop/src`, or plugin runtime APIs.
- New public tokens use `--gt-*`; existing `--ui-*` variables remain aliases until a later dedicated removal migration.
- Maintain `@guyantools/plugin-ui` exports `.`, `./tokens.css`, `./vue`, and `./react` unchanged.
- Keep `desktop/src/windows/main/components/ui/Ui*.vue` paths available for all first-wave components. They become thin adapters/re-exports, not deleted imports.
- Preserve the current Vue compatibility contract rather than only matching component names: native attributes such as `type` and `title`, `UiInput`'s `focus()`/`select()` expose methods and `keydown` event, `UiTabs`'s exported `UiTabItem` type, default/named slots, and Dialog/Drawer `open`/`close` events plus documented popup props.
- Do not migrate date/time, menu, tree, file, color, transfer, scrollbar, icon picker, or media-crop components in this plan.

## File map

### New packages

- Create `packages/ui-core/package.json`, `tsconfig.json`, `vite.config.ts`, and `scripts/copy-tokens.mjs`: package metadata, ES module build, declaration output, and CSS publishing.
- Create `packages/ui-core/src/tokens.css`: canonical light/dark `--gt-*` tokens.
- Create `packages/ui-core/src/elements/base.ts`: shared element property reflection and `CustomEvent` helpers.
- Create `packages/ui-core/src/elements/`: `gt-button`, `gt-icon-button`, `gt-input`, `gt-textarea`, `gt-checkbox`, `gt-radio`, `gt-switch`, `gt-tabs`, `gt-card`, `gt-field`, `gt-empty-state`, `gt-state-card`, `gt-tooltip`, `gt-dialog`, `gt-drawer`.
- Create `packages/ui-core/src/register.ts`, `index.ts`, `vue.ts`, `react.ts`: public registration, DOM exports, Vue registration helper, and React JSX typings.
- Create `packages/ui-core/tests/elements.test.ts`, `forms.test.ts`, `feedback.test.ts`, `overlay.test.ts`, `tokens.test.ts`.
- Create `packages/ui-vue/package.json`, `tsconfig.json`, `vite.config.ts`, and `src/index.ts`: Vue library metadata and public exports.
- Create `packages/ui-vue/src/components/`: Vue adapters for the 15 core components.
- Create `packages/ui-vue/src/composables/useOverlayFocus.ts` and `useOverlayPosition.ts`: overlay focus/position lifecycle helpers.
- Create `packages/ui-vue/tests/forms.test.ts`, `feedback.test.ts`, `overlay.test.ts`, and `compatibility.test.ts`.

### Existing packages and desktop integration

- Modify `packages/plugin-ui/package.json`, `src/index.ts`, `src/register.ts`, `src/vue.ts`, `src/react.ts`, `src/tokens.css`, and package tests: re-export core while retaining all public plugin paths.
- Modify `desktop/package.json`: add workspace `@guyantools/ui-core` and `@guyantools/ui-vue`; add `@vue/test-utils` and `jsdom` test dependencies.
- Modify `desktop/src/windows/main/assets/theme.scss`: set canonical `--gt-*` values for light/dark and alias legacy `--ui-*` variables to those values.
- Modify `desktop/src/windows/main/App.vue`: import the UI core token stylesheet once before local theme rules.
- Modify these desktop compatibility entries: `UiButton.vue`, `UiIconButton.vue`, `UiInput.vue`, `UiTextarea.vue`, `UiCheckbox.vue`, `UiRadio.vue`, `UiSwitch.vue`, `UiTabs.vue`, `UiCard.vue`, `UiField.vue`, `UiEmptyState.vue`, `UiStateCard.vue`, `UiTooltip.vue`, `UiDialog.vue`, `UiDrawer.vue`.
- Create `desktop/src/windows/main/components/ui/ui_library_compatibility.test.ts`: verifies every preserved local entry resolves to a Vue-library export and retains its documented public props/events.
- Modify `desktop/scripts/verify-plugin-framework.cjs` and root `package.json`: build/test the new packages before plugin fixtures.
- Create `docs/desktop/UI_COMPONENT_LIBRARY.md` and update `docs/desktop/PLUGIN_SYSTEM_CAPABILITIES.md`: document consumer imports, tokens, compatibility policy, and excluded components.

## Task 1: Establish packages and token compatibility

**Files:**
- Create: `packages/ui-core/package.json`, `packages/ui-core/tsconfig.json`, `packages/ui-core/vite.config.ts`, `packages/ui-core/scripts/copy-tokens.mjs`, `packages/ui-core/src/tokens.css`, `packages/ui-core/src/index.ts`
- Create: `packages/ui-core/tests/tokens.test.ts`
- Modify: `desktop/package.json`, `desktop/src/windows/main/assets/theme.scss`, `desktop/src/windows/main/App.vue`, `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing core token contract test.**

Create `packages/ui-core/tests/tokens.test.ts` and assert the yet-to-exist file exports semantic tokens in both themes:

```ts
expect(tokens).toContain('--gt-color-background');
expect(tokens).toContain('--gt-color-surface');
expect(tokens).toContain('--gt-color-text');
expect(tokens).toContain('--gt-control-height-md');
expect(tokens).toContain('--gt-z-overlay');
expect(tokens).toContain(':root[data-theme="dark"]');
```

- [ ] **Step 2: Run the token test and verify it fails.**

Run: `pnpm --dir packages/ui-core exec vitest run tests/tokens.test.ts`

Expected: FAIL because `packages/ui-core` and `tokens.css` do not exist.

- [ ] **Step 3: Create the core package and canonical tokens.**

Create an ES-module package named `@guyantools/ui-core` with exports for `.`, `./tokens.css`, `./vue`, and `./react`. Define scripts `build: vite build && tsc --emitDeclarationOnly --outDir dist && node scripts/copy-tokens.mjs`, `typecheck: tsc --noEmit`, and `test: vitest run`. Port the existing plugin token values into `tokens.css`; add semantic spacing, z-index, motion and overlay tokens. Define both `:root` and `:root[data-theme="dark"]`, without importing desktop SCSS.

Create `theme.scss` mappings in this direction:

```scss
.light {
  --gt-color-background: #f7fbff;
  --gt-color-surface: #ffffff;
  --gt-color-primary: #5c9ded;
  --ui-surface-base: var(--gt-color-background);
  --ui-surface-panel: var(--gt-color-surface);
  --ui-button-primary-bg: var(--gt-color-primary);
}
```

Repeat the mapping in `.dark`. Import `@guyantools/ui-core/tokens.css` once in `App.vue` before `theme.scss`.

- [ ] **Step 4: Install package metadata and make the token test pass.**

Run:

```powershell
pnpm install
pnpm --dir packages/ui-core exec vitest run tests/tokens.test.ts
pnpm --dir packages/ui-core run build
```

Expected: test PASS; `packages/ui-core/dist/tokens.css` and declaration files exist.

- [ ] **Step 5: Commit the package boundary.**

```powershell
git add packages/ui-core desktop/package.json desktop/src/windows/main/assets/theme.scss desktop/src/windows/main/App.vue pnpm-lock.yaml
git commit -m "feat(ui): add shared core tokens"
```

## Task 2: Implement core action and feedback elements

**Files:**
- Create: `packages/ui-core/src/elements/base.ts`, `gt-button.ts`, `gt-icon-button.ts`, `gt-card.ts`, `gt-field.ts`, `gt-empty-state.ts`, `gt-state-card.ts`, `packages/ui-core/src/register.ts`
- Modify: `packages/ui-core/src/index.ts`, `packages/ui-core/src/vue.ts`, `packages/ui-core/src/react.ts`
- Test: `packages/ui-core/tests/elements.test.ts`, `packages/ui-core/tests/feedback.test.ts`

- [ ] **Step 1: Write failing DOM-contract tests.**

Add tests that use `registerGuYanElements()` twice, then assert:

```ts
const button = document.createElement('gt-button');
button.setAttribute('variant', 'primary');
button.addEventListener('gt-click', received);
document.body.append(button);
button.shadowRoot!.querySelector('button')!.click();
expect(received).toHaveBeenCalledWith(expect.objectContaining({ detail: { disabled: false } }));

const state = document.createElement('gt-state-card');
state.setAttribute('state', 'error');
expect(state.shadowRoot!.querySelector('[role="status"]')?.textContent).toContain('Error');
```

Also assert `gt-icon-button` has an accessible name, `gt-card` exposes its variant, `gt-field` links label/error text to the slotted control, and empty-state/state-card slots remain visible.

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `pnpm --dir packages/ui-core exec vitest run tests/elements.test.ts tests/feedback.test.ts`

Expected: FAIL because the listed elements are not registered.

- [ ] **Step 3: Implement the elements with stable event types.**

Use a shared base class with these event payloads:

```ts
export interface ClickDetail { disabled: boolean; }
export interface StateChangeDetail { state: 'loading' | 'empty' | 'error' | 'info'; }
```

Implement `gt-button` and `gt-icon-button` using native `<button>`, `disabled`, `aria-label`, `variant`, `size`, `active`, and prefix/suffix slots. Implement visual-only feedback elements using named slots, semantic `role="status"` for `gt-state-card`, and only `--gt-*` styles. Register every element idempotently and publish matching React intrinsic element types.

- [ ] **Step 4: Run core action/feedback tests and build.**

Run:

```powershell
pnpm --dir packages/ui-core exec vitest run tests/elements.test.ts tests/feedback.test.ts
pnpm --dir packages/ui-core run build
```

Expected: all tests PASS; the built package contains action and feedback declarations.

- [ ] **Step 5: Commit action and feedback elements.**

```powershell
git add packages/ui-core
git commit -m "feat(ui): add core action and feedback elements"
```

## Task 3: Implement core form and selection elements

**Files:**
- Create: `packages/ui-core/src/elements/gt-input.ts`, `gt-textarea.ts`, `gt-checkbox.ts`, `gt-radio.ts`, `gt-switch.ts`, `gt-tabs.ts`
- Modify: `packages/ui-core/src/register.ts`, `index.ts`, `react.ts`
- Test: `packages/ui-core/tests/forms.test.ts`

- [ ] **Step 1: Write failing form interaction tests.**

Cover input reflection, numeric stepping, checkbox indeterminate state, radio keyboard selection, switch state, and tabs:

```ts
input.value = 'after';
native.dispatchEvent(new Event('input', { bubbles: true }));
expect(input.getAttribute('value')).toBe('after');
expect(detail).toEqual({ value: 'after' });

checkbox.indeterminate = true;
expect(native.indeterminate).toBe(true);
native.click();
expect(changeDetail).toEqual({ checked: true, indeterminate: false });

tabs.value = 'details';
expect(tabs.getAttribute('value')).toBe('details');
```

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `pnpm --dir packages/ui-core exec vitest run tests/forms.test.ts`

Expected: FAIL because the form elements and property accessors do not exist.

- [ ] **Step 3: Implement native form-backed elements.**

Use real `<input>`, `<textarea>`, `<button role="switch">`, and `<button role="tab">` controls inside each Shadow Root. Export these details:

```ts
export interface ValueChangeDetail { value: string; }
export interface CheckedChangeDetail { checked: boolean; indeterminate?: boolean; }
export interface TabChangeDetail { value: string; }
```

Reflect `value`, `checked`, `indeterminate`, `disabled`, `readonly`, `size`, `min`, `max`, `step`, and `items` through typed properties. `gt-tabs` must ignore disabled items and update its indicator after ResizeObserver/resize changes. Number stepping must clamp to min/max.

- [ ] **Step 4: Verify forms and the package build.**

Run:

```powershell
pnpm --dir packages/ui-core exec vitest run tests/forms.test.ts
pnpm --dir packages/ui-core run build
```

Expected: form tests PASS and `dist/index.d.ts` exposes all detail types.

- [ ] **Step 5: Commit the form family.**

```powershell
git add packages/ui-core
git commit -m "feat(ui): add core form elements"
```

## Task 4: Implement core overlay elements and accessibility behavior

**Files:**
- Create: `packages/ui-core/src/elements/overlay.ts`, `gt-tooltip.ts`, `gt-dialog.ts`, `gt-drawer.ts`
- Modify: `packages/ui-core/src/register.ts`, `index.ts`, `react.ts`
- Test: `packages/ui-core/tests/overlay.test.ts`

- [ ] **Step 1: Write failing overlay tests.**

Test opening/closing and cleanup independently of Vue:

```ts
dialog.open = true;
expect(document.body.querySelector('[data-gt-overlay="dialog"]')).not.toBeNull();
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
expect(closeDetail).toEqual({ open: false, reason: 'escape' });
expect(document.body.querySelector('[data-gt-overlay="dialog"]')).toBeNull();
```

Add a tooltip placement test with mocked trigger and viewport rectangles. Assert a right placement flips to left when it would overflow, and that `disconnectedCallback` removes scroll/resize listeners.

- [ ] **Step 2: Run the overlay test and verify failure.**

Run: `pnpm --dir packages/ui-core exec vitest run tests/overlay.test.ts`

Expected: FAIL because overlay elements and their body-level portal do not exist.

- [ ] **Step 3: Implement the shared overlay primitive.**

Create a framework-free controller that appends the overlay container to `document.body`, uses fixed positioning, subscribes to capture-phase scroll plus resize, and returns a cleanup function. Implement:

```ts
export type OverlayCloseReason = 'escape' | 'mask' | 'programmatic';
export interface OpenChangeDetail { open: boolean; reason: OverlayCloseReason; }
```

`gt-dialog` traps Tab focus while open, restores the trigger focus on close, sets `role="dialog"`/`aria-modal="true"`, and honours `close-on-mask`, `close-on-esc`, and `persistent`. `gt-drawer` shares that behavior with `position="left|right"`; `gt-tooltip` renders `role="tooltip"`, waits for `delay`, and never captures focus.

- [ ] **Step 4: Verify overlays and full core tests.**

Run:

```powershell
pnpm --dir packages/ui-core exec vitest run
pnpm --dir packages/ui-core run build
```

Expected: all core tests PASS and no overlay remains in `document.body` after test cleanup.

- [ ] **Step 5: Commit the overlay primitive.**

```powershell
git add packages/ui-core
git commit -m "feat(ui): add accessible core overlays"
```

## Task 5: Create the Vue adapter library

**Files:**
- Create: `packages/ui-vue/package.json`, `tsconfig.json`, `vite.config.ts`, `src/index.ts`
- Create: `packages/ui-vue/src/components/UiButton.vue`, `UiIconButton.vue`, `UiInput.vue`, `UiTextarea.vue`, `UiCheckbox.vue`, `UiRadio.vue`, `UiSwitch.vue`, `UiTabs.vue`, `UiCard.vue`, `UiField.vue`, `UiEmptyState.vue`, `UiStateCard.vue`, `UiTooltip.vue`, `UiDialog.vue`, `UiDrawer.vue`
- Create: `packages/ui-vue/src/composables/useOverlayFocus.ts`, `useOverlayPosition.ts`
- Create: `packages/ui-vue/tests/forms.test.ts`, `feedback.test.ts`, `overlay.test.ts`, `compatibility.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing Vue adapter tests.**

Use `@vue/test-utils` and assert the desktop-facing APIs remain Vue-native:

```ts
const wrapper = mount(UiInput, { props: { modelValue: 'before' } });
await wrapper.find('gt-input').trigger('gt-input', { detail: { value: 'after' } });
expect(wrapper.emitted('update:modelValue')).toEqual([['after']]);

const dialog = mount(UiDialog, { props: { modelValue: true }, attachTo: document.body });
expect(document.body.querySelector('[data-gt-overlay="dialog"]')).not.toBeNull();
await dialog.unmount();
expect(document.body.querySelector('[data-gt-overlay="dialog"]')).toBeNull();
```

Test Button prefix/suffix and forwarded `type`/`title` attributes; Input prefix/suffix, `keydown`, and exposed `focus()`/`select()`; Field hint/error slots; EmptyState default action slot; StateCard action slot; Checkbox/Radio/Switch `change`; Tabs `change` and exported `UiTabItem`; and Dialog/Drawer `update:modelValue`, `open`, and `close` forwarding. Include Dialog `width`, `maxWidth`, `persistent`, `closeOnMask`, and `closeOnEsc`, plus Drawer `position`, `teleported`, `teleportTo`, `fixed`, and `overlay`, because these are used by existing desktop call sites.

- [ ] **Step 2: Run adapter tests and verify failure.**

Run: `pnpm --dir packages/ui-vue exec vitest run tests/forms.test.ts tests/feedback.test.ts tests/overlay.test.ts tests/compatibility.test.ts`

Expected: FAIL because `@guyantools/ui-vue` does not exist.

- [ ] **Step 3: Implement Vue wrappers and overlay composables.**

Declare `@guyantools/ui-core` and `vue` dependencies, `@vue/test-utils` and `jsdom` dev dependencies, and `build`, `typecheck`, and `test` scripts. Configure the package Vue compiler with `isCustomElement: tag => tag.startsWith('gt-')` so adapters compile native custom elements rather than unresolved Vue components. Each wrapper calls `registerGuYanElements()` once and maps Vue props/slots/events to a `gt-*` element. Preserve exact first-wave Vue API conventions:

```ts
const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();
```

The overlay composables own Vue lifecycle cleanup and invoke core `open` properties; do not import Electron APIs. Adapters must forward undeclared native attributes to their interactive child where existing components did so, retain named/default slot names, and expose the `UiInput` `focus()`/`select()` methods through `defineExpose`. Export every component and the public `UiTabItem` type from `src/index.ts`.

- [ ] **Step 4: Run Vue adapter tests, typecheck, and build.**

Run:

```powershell
pnpm --dir packages/ui-vue exec vitest run
pnpm --dir packages/ui-vue run typecheck
pnpm --dir packages/ui-vue run build
```

Expected: all adapter tests PASS and `dist/index.d.ts` exports the 15 Vue components.

- [ ] **Step 5: Commit the Vue adapter layer.**

```powershell
git add packages/ui-vue pnpm-lock.yaml
git commit -m "feat(ui): add Vue component adapters"
```

## Task 6: Convert plugin UI into a compatibility facade

**Files:**
- Modify: `packages/plugin-ui/package.json`, `src/index.ts`, `src/register.ts`, `src/vue.ts`, `src/react.ts`, `src/tokens.css`, `vite.config.ts`
- Modify: `packages/plugin-ui/tests/gt-elements.test.ts`, `tokens.test.ts`
- Test: `packages/plugin-ui/tests/compatibility.test.ts`

- [ ] **Step 1: Write failing plugin compatibility tests.**

Create a test proving old imports resolve to the exact core registrations:

```ts
import { registerGuYanElements as pluginRegister } from '../src';
import { registerGuYanElements as coreRegister } from '@guyantools/ui-core';

pluginRegister();
coreRegister();
expect(customElements.get('gt-button')).toBeDefined();
expect(customElements.get('gt-drawer')).toBeDefined();
```

Also import `../src/vue`, `../src/react`, and `../src/tokens.css`; assert old `gt-button/input/card/dialog` contracts remain unchanged.

- [ ] **Step 2: Run compatibility tests and verify failure.**

Run: `pnpm --dir packages/plugin-ui exec vitest run tests/compatibility.test.ts`

Expected: FAIL because the plugin package does not yet depend on or re-export core.

- [ ] **Step 3: Re-export core without changing plugin paths.**

Replace local element exports with explicit core re-exports, retain aliases for existing exported types, and make `tokens.css` import or copy core tokens. Add `@guyantools/ui-core: workspace:*` to dependencies. Keep existing Vite entry names `index.js`, `vue.js`, and `react.js` so plugin templates do not change.

- [ ] **Step 4: Run plugin package tests and fixtures.**

Run:

```powershell
pnpm --dir packages/plugin-ui exec vitest run
pnpm --dir packages/plugin-ui run build
pnpm --dir packages/plugin-vite exec vitest run tests/build.test.ts
```

Expected: all existing and compatibility tests PASS; Vue and React plugin fixtures still emit `dist/index.html` and `dist/worker.js`.

- [ ] **Step 5: Commit plugin compatibility.**

```powershell
git add packages/plugin-ui
git commit -m "refactor(ui): route plugin UI through core library"
```

## Task 7: Connect the desktop to the shared Vue library

**Files:**
- Modify: `desktop/package.json`, `desktop/vite.renderer.config.ts`, `pnpm-lock.yaml`
- Modify: the 15 first-wave files under `desktop/src/windows/main/components/ui/`
- Create: `desktop/src/windows/main/components/ui/ui_library_compatibility.test.ts`

- [ ] **Step 1: Write failing desktop compatibility tests.**

Mount preserved local entries and assert they delegate to library elements without changing the public call shape:

```ts
const button = mount(UiButton, { props: { variant: 'primary', disabled: true }, slots: { default: 'Save' } });
expect(button.find('gt-button').attributes('variant')).toBe('primary');
expect(button.find('gt-button').attributes('disabled')).toBeDefined();

const input = mount(UiInput, { props: { modelValue: 'one' } });
await input.find('gt-input').trigger('gt-input', { detail: { value: 'two' } });
expect(input.emitted('update:modelValue')).toEqual([['two']]);
```

Repeat at least one assertion each for Checkbox, Tabs, Field, StateCard, Tooltip, Dialog, and Drawer. Add compile-time assertions that `UiTabItem` remains a named export from the preserved `UiTabs.vue` entry, and runtime assertions that `UiInput` exposes `focus()` and `select()`, `UiButton` forwards `type`, and Dialog/Drawer continue emitting `open`/`close`.

- [ ] **Step 2: Run the desktop test and verify failure.**

Run: `pnpm --dir desktop exec vitest run src/windows/main/components/ui/ui_library_compatibility.test.ts`

Expected: FAIL because desktop has no `@guyantools/ui-vue` dependency and local entries still own their old implementations.

- [ ] **Step 3: Replace first-wave local implementations with thin library entries.**

Add `@guyantools/ui-core` and `@guyantools/ui-vue` as workspace dependencies. Configure Vite to avoid bundling duplicate Vue. For each first-wave local file, re-export the matching adapter as its default export:

```ts
// desktop/src/windows/main/components/ui/UiButton.vue
<script lang="ts">
export { UiButton as default } from '@guyantools/ui-vue';
</script>
```

Use a wrapper SFC rather than a pure re-export only where a legacy prop, event, slot, native attribute, or exposed method needs explicit compatibility mapping. In particular, preserve `UiInput`'s `focus()`/`select()` and `keydown`, re-export `UiTabItem` from `UiTabs.vue`, keep EmptyState's default slot, and preserve Dialog/Drawer popup props and `open`/`close` events. Do not change page imports in this task; the preserved paths make all existing desktop call sites consume the new package.

- [ ] **Step 4: Run focused compatibility, renderer typecheck, and app build.**

Run:

```powershell
pnpm --dir desktop exec vitest run src/windows/main/components/ui/ui_library_compatibility.test.ts
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
```

Expected: test PASS; all current component imports compile unchanged; Electron renderer build succeeds.

- [ ] **Step 5: Commit desktop adoption.**

```powershell
git add desktop/package.json desktop/vite.renderer.config.ts desktop/src/windows/main/components/ui pnpm-lock.yaml
git commit -m "refactor(desktop): consume shared Vue UI library"
```

## Task 8: Migrate representative app consumers to direct library imports

**Files:**
- Modify: `desktop/src/windows/main/App.vue`, `components/AppNotificationHost.vue`, `components/topbar/topbar.vue`, `pages/Plugins/Plugins.vue`, `pages/Settings.vue`
- Create: `desktop/scripts/verify-shared-ui-library.cjs`
- Test: `desktop/scripts/verify-shared-ui-library.cjs`

- [ ] **Step 1: Write a failing shared-library verification script.**

The script must scan the five representative consumers and fail unless each imports at least one first-wave component directly from `@guyantools/ui-vue`; it must also reject a duplicated first-wave root selector such as `.ui-button`, `.ui-input`, `.ui-dialog`, `.ui-tabs`, or `.ui-switch`.

```js
assert(source.includes("from '@guyantools/ui-vue'"));
assert(!/\.ui-button\s*\{/.test(source));
```

- [ ] **Step 2: Run the script and verify failure.**

Run: `node desktop/scripts/verify-shared-ui-library.cjs`

Expected: FAIL because no representative consumer imports `@guyantools/ui-vue` directly yet.

- [ ] **Step 3: Normalize representative consumers.**

Replace the selected first-wave component imports in the five files with named imports from `@guyantools/ui-vue`, for example `import { UiIconButton } from '@guyantools/ui-vue';`. Remove only duplicated first-wave component root styles from the five files, and leave page-specific layout styles intact. Do not alter behavior, translations, stores, IPC, or unrelated UI components.

- [ ] **Step 4: Run shared-library verification and relevant desktop tests.**

Run:

```powershell
node desktop/scripts/verify-shared-ui-library.cjs
pnpm --dir desktop exec vitest run src/windows/main/components/ui/ui_library_compatibility.test.ts
pnpm --dir desktop run typecheck
```

Expected: verification exits 0; every representative consumer imports the shared Vue package and no source duplicates first-wave control implementation styles.

- [ ] **Step 5: Commit consumer normalization.**

```powershell
git add desktop/src/windows/main/App.vue desktop/src/windows/main/components desktop/src/windows/main/pages desktop/scripts/verify-shared-ui-library.cjs
git commit -m "refactor(desktop): standardize shared UI consumers"
```

## Task 9: Update verification and documentation

**Files:**
- Modify: `desktop/scripts/verify-plugin-framework.cjs`, `package.json`, `docs/desktop/PLUGIN_SYSTEM_CAPABILITIES.md`
- Create: `docs/desktop/UI_COMPONENT_LIBRARY.md`

- [ ] **Step 1: Extend aggregate verification with shared-package commands.**

Extend `verify-plugin-framework.cjs` to require these commands before fixture builds:

```js
run('pnpm', ['--dir', 'packages/ui-core', 'run', 'build']);
run('pnpm', ['--dir', 'packages/ui-core', 'exec', 'vitest', 'run']);
run('pnpm', ['--dir', 'packages/ui-vue', 'run', 'build']);
run('pnpm', ['--dir', 'packages/ui-vue', 'exec', 'vitest', 'run']);
```

- [ ] **Step 2: Run the aggregate verifier and verify the new commands execute.**

Run: `pnpm run verify:plugin-framework`

Expected: PASS after Tasks 1-8; output includes the `ui-core` and `ui-vue` builds and test suites before plugin fixture builds.

- [ ] **Step 3: Document consumption and compatibility.**

Write `docs/desktop/UI_COMPONENT_LIBRARY.md` with import examples for Vue desktop code and Vue/React plugins, the first-wave component matrix, token ownership, overlay behavior, legacy `Ui*`/plugin-ui compatibility, and the explicit excluded-component list. Add a link from `PLUGIN_SYSTEM_CAPABILITIES.md`.

- [ ] **Step 4: Run the final validation matrix.**

Run from repository root:

```powershell
pnpm run verify:plugin-framework
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
pnpm --dir desktop run test:plugin-platform
git diff --check
```

Expected: all commands exit 0. Existing ESLint `fs-extra` warnings may remain, but no lint errors are permitted.

- [ ] **Step 5: Commit documentation and verification.**

```powershell
git add desktop/scripts/verify-plugin-framework.cjs package.json docs/desktop
git commit -m "docs(ui): document shared component library"
```

## Plan coverage

| Design requirement | Tasks |
| --- | --- |
| Framework-free core library and public tokens | 1-4 |
| First-wave action, form, feedback, and overlay components | 2-4 |
| Vue-native main application API | 5 and 7 |
| Plugin compatibility and cross-framework imports | 6 |
| `--gt-*` canonical tokens with legacy mappings | 1 and 7 |
| Accessible overlays and predictable teleport behavior | 4 and 5 |
| Main application consumes the component library | 7 and 8 |
| No migration of excluded complex components | all tasks enforce scope |
| Build, regression, and documentation coverage | 9 |
