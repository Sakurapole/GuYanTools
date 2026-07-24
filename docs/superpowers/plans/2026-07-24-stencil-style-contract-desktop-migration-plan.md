# Stencil 样式契约与桌面端迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首期 15 个 `gt-*` 控件重构为样式文件分离、Shadow DOM 隔离且可由 `--gt-*`/`part` 定制的 Stencil 组件，并在不丢失桌面主题、图标和浮层样式的前提下分批让桌面端使用该组件库。

**Architecture:** `@guyantools/ui-core` 是唯一的视觉、交互与浮层 DOM 实现；每个组件的 TSX 只保留结构、属性、事件和行为，固定 CSS 放在相邻的独立 CSS 文件。`@guyantools/ui-vue` 只做 Vue API、slot、属性和事件的兼容转发，不再拥有视觉 CSS 或 Teleport；桌面页面只能通过 `gt-*` host、公开 `--gt-*` variables 和 `::part()` 改写组件外观。

**Tech Stack:** Stencil 4、Shadow DOM、CSS Custom Properties、CSS Shadow Parts、Vue 3、Vue Test Utils、Vitest、Vite、Electron、pnpm workspace。

---

## 不变约束

- 所有首期元素均使用 `shadow: true`。不得以 `shadow: false`、`:deep(.ui-*)` 或未公开内部 class 作为兼容手段。
- `packages/ui-core/src/components/**/*.tsx` 与 `packages/ui-core/src/utils/overlay-controller.ts` 中不得含有 `<style>`、CSS 模板字符串、`innerHTML` CSS 注入或负责固定视觉的 JSX `style` object。Tabs 的指示器位置可以由 DOM property 更新，但其固定视觉规则必须在 CSS 中。
- 固定视觉值只放在 `packages/ui-core/src/styles/` 或组件相邻的 `gt-*.css`。运行时仅可从 CSS variables 读取、写入或转发值。
- 每个组件都发布稳定的 props/events、`part` 和 component variables。页面样式只可选择 `gt-*`、`gt-*::part(...)`，或在 host 上设置 `--gt-*`。
- `UiDialog`、`UiDrawer`、`UiTooltip` 的 portal、焦点、Escape、mask、scroll/resize 和清理由 core 负责；Vue wrapper 禁止使用 `Teleport`。
- 保留当前桌面 `Ui*` 路径和 API。非首期组件（日期、时间、菜单、树、文件、颜色、Transfer、滚动条、图标选择器、媒体裁剪）继续使用 legacy 实现。
- 不触碰当前未提交的插件宿主、plugin SDK、临时目录或锁定文件以外的无关改动。

## 文件地图

- `packages/ui-core/src/styles/tokens.css`：仅定义共享 `--gt-*` token 和主题入口。
- `packages/ui-core/src/styles/themes/light.css`、`dark.css`：组件库默认 light/dark token 值，选择器同时支持 `:root[data-theme]` 与桌面现有 `.light`/`.dark`。
- `packages/ui-core/src/styles/overlay-layer.css`：body portal 固定层、mask、panel、tooltip 及 motion 的唯一来源。
- `packages/ui-core/src/components/gt-*/gt-*.tsx`：仅渲染结构、props、events、ref 和状态切换；通过 `styleUrl` 引入相邻 CSS。
- `packages/ui-core/src/components/gt-*/gt-*.css`：对应 Shadow DOM 组件的固定视觉和默认 component variables。
- `packages/ui-core/src/components/gt-*/gt-*.contract.ts`：该元素的公开 variables、parts、事件与可反射属性的机器可检验 metadata。
- `packages/ui-core/src/utils/overlay-controller.ts`：无样式字符串的 Stencil portal controller，并负责从触发 host 转发已登记的 `--gt-*` variables。
- `packages/ui-core/scripts/assert-style-contract.mjs`：阻止样式重新进入 TSX/overlay controller，并校验 component CSS、`styleUrl` 和 contract metadata 的完整性。
- `packages/ui-vue/src/components/Ui*.vue`：基于 Stencil elements 的轻量 Vue 兼容层；无 `<style>` 和无 `Teleport`。
- `desktop/scripts/inventory-stencil-ui-migration.mjs`：把 580 处当前 `.ui-*` / `:deep(.ui-*)` 依赖按首期组件、文件、行号、替代 `part`/variable 写入可审查 JSON。
- `desktop/scripts/assert-stencil-ui-migration.mjs`：每批阻止已迁移控件遗留 `.ui-*`、`:deep(.ui-*)` 或未公开选择器。
- `desktop/src/windows/main/assets/theme.scss`：迁移期继续维护 `--ui-*` legacy aliases，同时为 `--gt-*` component variables 提供 light/dark 值；页面不再向组件内部写 legacy variables。
- `desktop/src/windows/main/components/ui/Ui{Button,IconButton,Card,Field,Input,Textarea,Checkbox,Radio,Switch,Tabs,EmptyState,StateCard,Tooltip,Dialog,Drawer}.vue`：完成所在批次后变为 `@guyantools/ui-vue` 的兼容入口，而不是 local DOM/CSS 实现。

### Task 1: 建立样式目录、主题入口与静态契约检查

**Files:**
- Create: `packages/ui-core/src/styles/tokens.css`
- Create: `packages/ui-core/src/styles/themes/light.css`
- Create: `packages/ui-core/src/styles/themes/dark.css`
- Create: `packages/ui-core/src/styles/overlay-layer.css`
- Create: `packages/ui-core/scripts/assert-style-contract.mjs`
- Create: `packages/ui-core/src/components/style-contract.spec.ts`
- Modify: `packages/ui-core/stencil.config.ts`
- Modify: `packages/ui-core/src/global/gt-tokens.css`
- Modify: `packages/ui-core/src/tokens.css`
- Modify: `packages/ui-core/package.json`
- Test: `packages/ui-core/src/components/style-contract.spec.ts`

- [x] **Step 1: 先写失败的样式边界测试。**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'src');

describe('Stencil style contract', () => {
  it('loads tokens through the Stencil global stylesheet', () => {
    expect(readFileSync(join(root, 'global/gt-tokens.css'), 'utf8'))
      .toContain("@import '../styles/tokens.css'");
  });

  it('keeps fixed styles out of component behavior files', () => {
    const source = readFileSync(join(root, 'components/gt-button/gt-button.tsx'), 'utf8');
    expect(source).not.toMatch(/<style|innerHTML|:host\\s*\\{|background\s*:/);
    expect(source).toContain("styleUrl: 'gt-button.css'");
  });
});
```

- [x] **Step 2: 运行测试，确认它因旧内联样式而失败。**

Run: `pnpm --dir packages/ui-core exec vitest run src/components/style-contract.spec.ts`

Expected: FAIL because `src/styles/tokens.css` does not exist and `gt-button.tsx` still renders `<style>`.

- [x] **Step 3: 创建 token 与主题入口，保持桌面主题选择器可用。**

```css
/* packages/ui-core/src/styles/tokens.css */
@import './themes/light.css';
@import './themes/dark.css';

/* Component CSS may override these values on a gt-* host. */
:root,
:host {
  --gt-font-family: Inter, "Segoe UI", sans-serif;
  --gt-space-xs: 4px;
  --gt-space-sm: 8px;
  --gt-space-md: 12px;
  --gt-space-lg: 16px;
  --gt-space-xl: 24px;
  --gt-motion-fast: 140ms;
  --gt-motion-normal: 180ms;
  --gt-motion-ease: ease;
  --gt-z-overlay: 1000;
  --gt-z-tooltip: 1100;
}
```

```css
/* packages/ui-core/src/styles/themes/light.css */
:root,
:root.light,
:host,
:host(.light),
:host([data-theme="light"]) {
  --gt-color-background: #f7fbff;
  --gt-color-surface: #ffffff;
  --gt-color-surface-muted: #f7fafe;
  --gt-color-text: rgba(30, 70, 90, 0.9);
  --gt-color-primary: #5c9ded;
  --gt-color-border: rgba(15, 23, 42, 0.08);
}

/* packages/ui-core/src/styles/themes/dark.css */
:root.dark,
:root[data-theme="dark"],
:host(.dark),
:host([data-theme="dark"]) {
  --gt-color-background: #101923;
  --gt-color-surface: #182532;
  --gt-color-surface-muted: #14202b;
  --gt-color-text: rgba(220, 240, 255, 0.92);
  --gt-color-primary: #3f8fca;
  --gt-color-border: rgba(255, 255, 255, 0.08);
}
```

Make `src/global/gt-tokens.css` import `../styles/tokens.css`; leave `src/tokens.css` as the package-compatible re-export. Add `src/styles/overlay-layer.css` now, with only the body portal selectors and no component-local selectors. Keep `globalStyle: 'src/global/gt-tokens.css'` in `stencil.config.ts`.

- [x] **Step 4: 添加可独立运行的静态检查。**

```js
// packages/ui-core/scripts/assert-style-contract.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const componentsRoot = new URL('../src/components/', import.meta.url);
const forbidden = /<style|innerHTML|`[^`]*(?:\\:host|background\\s*:|box-shadow\\s*:)[^`]*`/;

for (const name of readdirSync(componentsRoot)) {
  if (!name.startsWith('gt-')) continue;
  const dir = new URL(`${name}/`, componentsRoot);
  const tsx = new URL(`${name}.tsx`, dir);
  const css = new URL(`${name}.css`, dir);
  const contract = new URL(`${name}.contract.ts`, dir);
  if (!existsSync(tsx) || !existsSync(css) || !existsSync(contract)) throw new Error(`Missing style contract for ${name}`);
  const source = readFileSync(tsx, 'utf8');
  if (!source.includes(`styleUrl: '${name}.css'`) || forbidden.test(source)) throw new Error(`Inline style contract violation: ${name}`);
}

const overlay = readFileSync(new URL('../src/utils/overlay-controller.ts', import.meta.url), 'utf8');
if (/innerHTML|<style/.test(overlay)) throw new Error('Overlay controller injects CSS');
```

Add `"verify:style-contract": "node scripts/assert-style-contract.mjs"` to `packages/ui-core/package.json`.

- [x] **Step 5: 运行测试与静态检查，确认基础契约通过。**

Run:

```powershell
pnpm --dir packages/ui-core exec vitest run src/components/style-contract.spec.ts
pnpm --dir packages/ui-core run verify:style-contract
pnpm --dir packages/ui-core run build
```

Expected: PASS; build emits `dist/tokens.css` that imports the compiled default token stylesheet.

- [ ] **Step 6: 提交基础样式边界。**

```powershell
git add packages/ui-core/package.json packages/ui-core/stencil.config.ts packages/ui-core/src/styles packages/ui-core/src/global/gt-tokens.css packages/ui-core/src/tokens.css packages/ui-core/scripts/assert-style-contract.mjs packages/ui-core/src/components/style-contract.spec.ts
git commit -m "refactor(ui): establish Stencil style contract"
```

### Task 2: 迁移动作与反馈组件的 CSS、parts 与 variables

**Files:**
- Create: `packages/ui-core/src/components/gt-button/gt-button.css`, `gt-button.contract.ts`
- Create: `packages/ui-core/src/components/gt-icon-button/gt-icon-button.css`, `gt-icon-button.contract.ts`
- Create: `packages/ui-core/src/components/gt-card/gt-card.css`, `gt-card.contract.ts`
- Create: `packages/ui-core/src/components/gt-field/gt-field.css`, `gt-field.contract.ts`
- Create: `packages/ui-core/src/components/gt-empty-state/gt-empty-state.css`, `gt-empty-state.contract.ts`
- Create: `packages/ui-core/src/components/gt-state-card/gt-state-card.css`, `gt-state-card.contract.ts`
- Modify: corresponding six `gt-*.tsx` files
- Modify: `packages/ui-core/src/components/action-feedback.spec.tsx`
- Test: `packages/ui-core/src/components/action-feedback.spec.tsx`

- [ ] **Step 1: 增加失败的 public part/variable 测试。**

```tsx
it('exposes the documented customization points', async () => {
  const { root } = await render(<gt-button>Save</gt-button>);
  expect(root.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
  expect(root.shadowRoot?.querySelector('[part="label"]')).not.toBeNull();
  expect(root.shadowRoot?.querySelector('[part="icon"]')).not.toBeNull();
  expect(readFileSync(new URL('./gt-button/gt-button.contract.ts', import.meta.url), 'utf8'))
    .toContain("'--gt-button-background'");
});
```

Repeat the structural assertions for `gt-icon-button`, `gt-card`, `gt-field`, `gt-empty-state`, and `gt-state-card`; Card/Field/StateCard must expose `base`, `header`, `body`, `footer`, `label`, `hint`, and `error` when the corresponding node exists.

- [ ] **Step 2: 运行测试，确认现有 Shadow DOM 没有公开这些出口。**

Run: `pnpm --dir packages/ui-core exec vitest run src/components/action-feedback.spec.tsx`

Expected: FAIL because the TSX has no `part` attributes and no contract files.

- [ ] **Step 3: 逐个拆出 CSS，并给结构节点标注稳定 parts。**

```tsx
@Component({ tag: 'gt-button', shadow: true, styleUrl: 'gt-button.css' })
export class GtButton {
  render() {
    return <Host>
      <button part="base" disabled={this.disabled} type={this.type} onClick={this.handleClick}>
        <span part="icon"><slot name="prefix" /></span>
        <span part="label"><slot /></span>
        <span part="icon"><slot name="suffix" /></span>
      </button>
    </Host>;
  }
}
```

```css
/* packages/ui-core/src/components/gt-button/gt-button.css */
:host {
  --gt-button-background: var(--gt-color-surface-muted);
  --gt-button-border-color: var(--gt-color-border);
  --gt-button-color: var(--gt-color-text);
  --gt-button-shadow: none;
  display: inline-block;
  font-family: var(--gt-font-family);
}

[part="base"] {
  min-height: var(--gt-control-height-md);
  border: 1px solid var(--gt-button-border-color);
  border-radius: var(--gt-radius-sm);
  background: var(--gt-button-background);
  color: var(--gt-button-color);
  box-shadow: var(--gt-button-shadow);
}
```

For every component, move the exact existing selector behavior to the CSS file before improving it. The contract files export a literal metadata object, for example:

```ts
export const gtButtonStyleContract = {
  tag: 'gt-button',
  parts: ['base', 'icon', 'label'],
  variables: ['--gt-button-background', '--gt-button-border-color', '--gt-button-color', '--gt-button-shadow'],
} as const;
```

Use equivalent literal contracts for the other five controls. Preserve existing disabled, hover, active, focus-visible, compact, interactive, slot, label association and state behavior.

- [ ] **Step 4: 运行组件测试、静态检查和构建。**

Run:

```powershell
pnpm --dir packages/ui-core exec vitest run src/components/action-feedback.spec.tsx
pnpm --dir packages/ui-core run verify:style-contract
pnpm --dir packages/ui-core run build
```

Expected: PASS; the six TSX files contain no `<style>`, and their CSS is packaged with their custom elements.

- [ ] **Step 5: 提交动作与反馈组件。**

```powershell
git add packages/ui-core/src/components/gt-button packages/ui-core/src/components/gt-icon-button packages/ui-core/src/components/gt-card packages/ui-core/src/components/gt-field packages/ui-core/src/components/gt-empty-state packages/ui-core/src/components/gt-state-card packages/ui-core/src/components/action-feedback.spec.tsx
git commit -m "refactor(ui): externalize action component styles"
```

### Task 3: 迁移输入、选择与 Tabs 的 CSS、parts 与 variables

**Files:**
- Create: `packages/ui-core/src/components/gt-input/gt-input.css`, `gt-input.contract.ts`
- Create: `packages/ui-core/src/components/gt-textarea/gt-textarea.css`, `gt-textarea.contract.ts`
- Create: `packages/ui-core/src/components/gt-checkbox/gt-checkbox.css`, `gt-checkbox.contract.ts`
- Create: `packages/ui-core/src/components/gt-radio/gt-radio.css`, `gt-radio.contract.ts`
- Create: `packages/ui-core/src/components/gt-switch/gt-switch.css`, `gt-switch.contract.ts`
- Create: `packages/ui-core/src/components/gt-tabs/gt-tabs.css`, `gt-tabs.contract.ts`
- Modify: corresponding six `gt-*.tsx` files
- Modify: `packages/ui-core/src/components/forms.spec.tsx`
- Test: `packages/ui-core/src/components/forms.spec.tsx`

- [ ] **Step 1: 添加失败的行为与样式出口测试。**

```tsx
it('keeps input customization points and native delegates', async () => {
  const { root } = await render(<gt-input value="value" />);
  expect(root.shadowRoot?.querySelector('[part="base"]')).not.toBeNull();
  expect(root.shadowRoot?.querySelector('[part="control"]')).toBeInstanceOf(HTMLInputElement);
  expect(root.shadowRoot?.querySelector('[part="prefix"]')).not.toBeNull();
  expect(root.shadowRoot?.querySelector('[part="suffix"]')).not.toBeNull();
  expect(typeof (root as unknown as { focus: unknown }).focus).toBe('function');
});

it('does not put fixed tab styles in TypeScript', () => {
  const source = readFileSync(new URL('./gt-tabs/gt-tabs.tsx', import.meta.url), 'utf8');
  expect(source).not.toContain('style={indicatorStyle}');
  expect(source).toContain("styleUrl: 'gt-tabs.css'");
});
```

Assert `gt-textarea` has `base`/`control`, Checkbox/Radio/Switch expose `base`/`control`/`label`, and Tabs has `base`/`tab`/`indicator`.

- [ ] **Step 2: 运行测试，确认旧组件不满足新出口。**

Run: `pnpm --dir packages/ui-core exec vitest run src/components/forms.spec.tsx`

Expected: FAIL because the current elements have no documented parts and Tabs stores presentation data in JSX.

- [ ] **Step 3: 以 CSS 变量替代 TSX 内联视觉状态。**

```tsx
@Component({ tag: 'gt-tabs', shadow: true, styleUrl: 'gt-tabs.css' })
export class GtTabs {
  private readonly indicator = (index: number) => ({ '--gt-tabs-active-index': String(index) });

  render() {
    const activeIndex = Math.max(0, this.items.findIndex((item) => item.value === this.value));
    return <Host style={this.indicator(activeIndex)}>
      <div part="base" role="tablist">
        {this.items.map((item) => <button part="tab" role="tab" /* existing semantics */>{item.label}</button>)}
        <span part="indicator" />
      </div>
    </Host>;
  }
}
```

The host custom property above is state, not fixed styling. In `gt-tabs.css`, calculate the indicator from `--gt-tabs-active-index` and `--gt-tabs-item-count`; set the item count from the same restricted state mechanism or a reflected data attribute. Put all sizes, colors, transitions, borders and layout in CSS.

For `gt-input`, retain the HTML-compatible `focus()` and `select()` delegates on the host without declaring the standard `focus` method as `@Method()`. Preserve numeric stepper behavior and attach `part="stepper"` to each step control. Keep `resize` as an attribute/property on Textarea and use `[resize="..."]` selectors in CSS rather than an interpolated CSS value.

- [ ] **Step 4: 运行 forms 测试、样式检查和构建。**

Run:

```powershell
pnpm --dir packages/ui-core exec vitest run src/components/forms.spec.tsx
pnpm --dir packages/ui-core run verify:style-contract
pnpm --dir packages/ui-core run build
```

Expected: PASS; all fixed form-control CSS exists only in six `gt-*.css` files.

- [ ] **Step 5: 提交输入与选择组件。**

```powershell
git add packages/ui-core/src/components/gt-input packages/ui-core/src/components/gt-textarea packages/ui-core/src/components/gt-checkbox packages/ui-core/src/components/gt-radio packages/ui-core/src/components/gt-switch packages/ui-core/src/components/gt-tabs packages/ui-core/src/components/forms.spec.tsx
git commit -m "refactor(ui): externalize form component styles"
```

### Task 4: 让 Stencil 以独立 CSS 拥有 body 浮层和变量桥

**Files:**
- Create: `packages/ui-core/src/components/gt-dialog/gt-dialog.css`, `gt-dialog.contract.ts`
- Create: `packages/ui-core/src/components/gt-drawer/gt-drawer.css`, `gt-drawer.contract.ts`
- Create: `packages/ui-core/src/components/gt-tooltip/gt-tooltip.css`, `gt-tooltip.contract.ts`
- Modify: `packages/ui-core/src/components/gt-dialog/gt-dialog.tsx`
- Modify: `packages/ui-core/src/components/gt-drawer/gt-drawer.tsx`
- Modify: `packages/ui-core/src/components/gt-tooltip/gt-tooltip.tsx`
- Modify: `packages/ui-core/src/utils/overlay-controller.ts`
- Modify: `packages/ui-core/src/styles/overlay-layer.css`
- Modify: `packages/ui-core/src/components/overlays.spec.tsx`
- Test: `packages/ui-core/src/components/overlays.spec.tsx`

- [ ] **Step 1: 添加失败的 portal 样式与变量转发测试。**

```tsx
it('forwards host component variables into the body portal', async () => {
  const { root } = await render(<gt-dialog open style={{ '--gt-dialog-width': '42rem' }}>Content</gt-dialog>);
  const portal = document.body.querySelector<HTMLElement>('[data-gt-overlay="dialog"]');
  expect(portal?.style.getPropertyValue('--gt-dialog-width')).toBe('42rem');
  expect(portal?.querySelector('[part="panel"]')).not.toBeNull();
});

it('does not inject CSS while building an overlay portal', () => {
  const source = readFileSync(new URL('../utils/overlay-controller.ts', import.meta.url), 'utf8');
  expect(source).not.toMatch(/innerHTML|<style/);
  expect(source).toContain('overlay-layer.css');
});
```

Also assert `layer`, `mask`, `panel`, `header`, `body`, and `footer` parts; retain Escape, focus trap, mask policy, close focus restoration, scroll/resize placement and portal cleanup tests.

- [ ] **Step 2: 运行 overlay 测试，确认当前 portal 不会复制 variables 且仍注入 CSS。**

Run: `pnpm --dir packages/ui-core exec vitest run src/components/overlays.spec.tsx`

Expected: FAIL because the current controller creates markup with an `innerHTML` style string.

- [ ] **Step 3: 使用 DOM API 创建 portal，并使用单独样式表与变量同步。**

```ts
const GT_PORTAL_VARIABLES = [
  '--gt-color-background', '--gt-color-surface', '--gt-color-text', '--gt-color-border',
  '--gt-dialog-width', '--gt-drawer-width', '--gt-overlay-z-index', '--gt-tooltip-background',
] as const;

function copyPortalVariables(source: HTMLElement, target: HTMLElement): void {
  const computed = getComputedStyle(source);
  for (const name of GT_PORTAL_VARIABLES) target.style.setProperty(name, computed.getPropertyValue(name));
}

function createPortalElement(type: OverlayType): HTMLElement {
  const layer = document.createElement('div');
  layer.dataset.gtOverlay = type;
  layer.setAttribute('part', 'layer');
  // append mask and panel with createElement/textContent/append; never innerHTML
  return layer;
}
```

Register an `overlayStyle` `<link>` or adopted stylesheet once from the compiled `overlay-layer.css`; it must be released only when the final active portal is destroyed. Observe the source host `class` and `style` attributes with `MutationObserver`; on change and before positioning, re-copy the registered variables. The controller must disconnect its observer and window listeners in `destroy()`.

Each overlay component uses `styleUrl`, declares its contract and provides semantic slot containers so header/body/footer are owned by core. `gt-dialog` and `gt-drawer` own the panel layout and assign `part` to all containers. Vue content is projected into the core-created containers; it is not wrapped in a Vue-owned styled section.

- [ ] **Step 4: 运行 overlay 测试、静态检查和构建。**

Run:

```powershell
pnpm --dir packages/ui-core exec vitest run src/components/overlays.spec.tsx
pnpm --dir packages/ui-core run verify:style-contract
pnpm --dir packages/ui-core run build
```

Expected: PASS; closing the final overlay removes its portal, listeners and observer, while a local width/theme variable continues to affect the body portal.

- [ ] **Step 5: 提交 Stencil 浮层实现。**

```powershell
git add packages/ui-core/src/components/gt-dialog packages/ui-core/src/components/gt-drawer packages/ui-core/src/components/gt-tooltip packages/ui-core/src/utils/overlay-controller.ts packages/ui-core/src/styles/overlay-layer.css packages/ui-core/src/components/overlays.spec.tsx
git commit -m "refactor(ui): move overlay styles into Stencil core"
```

### Task 5: 把 Vue wrapper 缩减为无样式、无 Teleport 的兼容层

**Files:**
- Modify: all 15 files in `packages/ui-vue/src/components/`
- Remove: `packages/ui-vue/src/composables/useOverlayFocus.ts`
- Remove: `packages/ui-vue/src/composables/useOverlayPosition.ts`
- Create: `packages/ui-vue/src/composables/useForwardedAttrs.ts`
- Modify: `packages/ui-vue/tests/compatibility.test.ts`
- Modify: `packages/ui-vue/tests/feedback.test.ts`
- Modify: `packages/ui-vue/tests/forms.test.ts`
- Modify: `packages/ui-vue/tests/overlay.test.ts`
- Test: `packages/ui-vue/tests/*.test.ts`

- [ ] **Step 1: 添加失败的 wrapper 边界测试。**

```ts
it('forwards root attributes to the custom-element host without Vue warnings', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const wrapper = mount(UiDialog, { props: { modelValue: true }, attrs: { class: 'dialog-owner', 'aria-describedby': 'help' } });
  await nextTick();
  const host = wrapper.find('gt-dialog');
  expect(host.classes()).toContain('dialog-owner');
  expect(host.attributes('aria-describedby')).toBe('help');
  expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Extraneous non-props attributes'));
  warn.mockRestore();
});

it('does not create a Vue teleport for an open drawer', () => {
  const source = readFileSync(new URL('../src/components/UiDrawer.vue', import.meta.url), 'utf8');
  expect(source).not.toContain('<Teleport');
  expect(source).not.toContain('<style');
});
```

- [ ] **Step 2: 运行 tests，确认 overlay wrappers 仍有 Vue Teleport 和 scoped CSS。**

Run: `pnpm --dir packages/ui-vue exec vitest run tests/compatibility.test.ts tests/overlay.test.ts`

Expected: FAIL because `UiDialog.vue` and `UiDrawer.vue` contain `<Teleport>` and local `<style scoped>`.

- [ ] **Step 3: 使用显式 attribute 转发和 core slots 重写 wrappers。**

```ts
// packages/ui-vue/src/composables/useForwardedAttrs.ts
import { computed, useAttrs } from 'vue';

export function useForwardedAttrs() {
  const attrs = useAttrs();
  return computed(() => ({
    ...attrs,
    class: attrs.class,
    style: attrs.style,
    'aria-label': attrs['aria-label'],
    'aria-labelledby': attrs['aria-labelledby'],
    'aria-describedby': attrs['aria-describedby'],
  }));
}
```

```vue
<script setup lang="ts">
defineOptions({ inheritAttrs: false });
const forwardedAttrs = useForwardedAttrs();
</script>

<template>
  <gt-dialog
    :open="modelValue"
    :close-on-mask="closeOnMask"
    :close-on-esc="closeOnEsc"
    :persistent="persistent"
    v-bind="forwardedAttrs"
    @gt-open-change="change"
  >
    <template v-if="$slots.header"><slot name="header" slot="header" /></template>
    <slot />
    <template v-if="$slots.footer"><slot name="footer" slot="footer" /></template>
  </gt-dialog>
</template>
```

Apply this pattern to all 15 wrappers. Retain `v-model`, legacy props/events, input `focus()`/`select()` expose, native keyboard/focus/blur forwarding, prefix/suffix/header/footer/actions slots and `UiTabItem` export. Translate legacy width and z-index props into CSS variables on the `gt-dialog`/`gt-drawer` host, for example `style: { '--gt-dialog-width': normalizeSize(width), '--gt-overlay-z-index': String(zIndex) }`; do not style internal descendants. Remove both overlay composables after all imports are gone.

- [ ] **Step 4: 运行全部 Vue wrapper 测试、typecheck 和 build。**

Run:

```powershell
pnpm --dir packages/ui-vue exec vitest run
pnpm --dir packages/ui-vue run typecheck
pnpm --dir packages/ui-vue run build
```

Expected: PASS; no wrapper has `<style`, `Teleport`, `useOverlayFocus`, or `useOverlayPosition`.

- [ ] **Step 5: 提交 Vue 兼容层收敛。**

```powershell
git add packages/ui-vue/src packages/ui-vue/tests
git rm packages/ui-vue/src/composables/useOverlayFocus.ts packages/ui-vue/src/composables/useOverlayPosition.ts
git commit -m "refactor(ui): make Vue adapters presentation-free"
```

### Task 6: 完成 plugin-ui facade，并验证 Vue/React 插件仍可消费 core

**Files:**
- Modify: `packages/plugin-ui/package.json`
- Modify: `packages/plugin-ui/src/index.ts`
- Modify: `packages/plugin-ui/src/register.ts`
- Modify: `packages/plugin-ui/src/vue.ts`
- Modify: `packages/plugin-ui/src/react.ts`
- Modify: `packages/plugin-ui/src/tokens.css`
- Create: `packages/plugin-ui/tests/stencil-style-contract.test.ts`
- Modify: `desktop/scripts/verify-plugin-framework.cjs`
- Test: `packages/plugin-ui/tests/stencil-style-contract.test.ts`

- [ ] **Step 1: 写失败的 plugin facade 导入测试。**

```ts
import { registerGuYanElements } from '../src';
import { describe, expect, it } from 'vitest';

describe('plugin UI Stencil facade', () => {
  it('preserves stable entrypoints and exposes the core elements', async () => {
    registerGuYanElements();
    expect(customElements.get('gt-button')).toBeDefined();
    expect(customElements.get('gt-dialog')).toBeDefined();
    await expect(import('../src/vue')).resolves.toBeDefined();
    await expect(import('../src/react')).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试，确认旧 package 未证明样式契约链路。**

Run: `pnpm --dir packages/plugin-ui exec vitest run tests/stencil-style-contract.test.ts`

Expected: FAIL until package exports are sourced exclusively from `@guyantools/ui-core` generated products.

- [ ] **Step 3: 保持入口不变地转发 core。**

```ts
// packages/plugin-ui/src/index.ts
export { defineCustomElements as registerGuYanElements } from '@guyantools/ui-core/loader';
export type { Components } from '@guyantools/ui-core';
```

Keep the package paths `.`, `./tokens.css`, `./vue`, `./react`; do not import `@guyantools/ui-vue` into plugin-ui. Add `@guyantools/ui-core: workspace:*` as its runtime dependency and ensure `tokens.css` imports the core public stylesheet. Update the aggregate verifier so ui-core style contract and plugin facade tests run before fixture builds.

- [ ] **Step 4: 运行 plugin tests 与两种 fixture 构建。**

Run:

```powershell
pnpm --dir packages/plugin-ui exec vitest run
pnpm --dir packages/plugin-ui run build
pnpm run verify:plugin-framework
```

Expected: PASS; Vue and React fixture output remains browser-resolvable and contains registered `gt-card`/`gt-button` elements.

- [ ] **Step 5: 提交 plugin facade 验证。**

```powershell
git add packages/plugin-ui desktop/scripts/verify-plugin-framework.cjs pnpm-lock.yaml
git commit -m "refactor(plugins): publish Stencil UI style contract"
```

### Task 7: 建立桌面 selector inventory、主题映射与批次门禁

**Files:**
- Create: `desktop/scripts/inventory-stencil-ui-migration.mjs`
- Create: `desktop/scripts/assert-stencil-ui-migration.mjs`
- Create: `desktop/tmp/stencil-ui-migration-stage-files.txt`
- Create: `desktop/src/windows/main/components/ui/stencil_style_compatibility.test.ts`
- Modify: `desktop/src/windows/main/assets/theme.scss`
- Modify: `desktop/package.json`
- Modify: `desktop/scripts/verify-plugin-framework.cjs`
- Test: `desktop/src/windows/main/components/ui/stencil_style_compatibility.test.ts`

- [ ] **Step 1: 写失败的桌面迁移门禁。**

```ts
it('does not let migrated controls rely on legacy internal selector names', () => {
  const source = readFileSync(resolve('src/windows/main/pages/Settings.vue'), 'utf8');
  expect(source).not.toMatch(/:deep\\(\\.ui-(button|input|dialog)\\b|\\.ui-(button|input|dialog)__?/);
  expect(source).toMatch(/gt-(button|input|dialog)|::part\\(/);
});
```

The initial test must intentionally target a file selected by the inventory that contains one of the old selectors, so it fails before the first migration batch.

- [ ] **Step 2: 生成并审查当前 selector 清单。**

```js
// desktop/scripts/inventory-stencil-ui-migration.mjs
const components = ['button', 'icon-button', 'card', 'field', 'input', 'textarea', 'checkbox', 'radio', 'switch', 'tabs', 'empty-state', 'state-card', 'tooltip', 'dialog', 'drawer'];
const pattern = new RegExp(`(?:\\.ui-(${components.join('|')})(?:__|--|\\b)|:deep\\(\\.ui-(${components.join('|')})(?:__|--|\\b))`, 'g');
// Recursively scan desktop/src/windows/main for .vue and .scss files.
// Emit desktop/tmp/stencil-ui-selector-inventory.json with component, file, line, selector and migration status.
```

Run: `node desktop/scripts/inventory-stencil-ui-migration.mjs`

Expected: a committed JSON inventory records the current baseline (about 580 matching lines at plan creation) and groups every match into the three migration batches below.

- [ ] **Step 3: 对齐桌面主题，但保留 legacy aliases。**

```scss
// desktop/src/windows/main/assets/theme.scss, within .light and .dark
--gt-button-background: var(--ui-button-secondary-bg);
--gt-button-border-color: var(--ui-button-secondary-border);
--gt-icon-button-size: var(--ui-control-height-md);
--gt-input-background: var(--ui-input-bg);
--gt-input-border-color: var(--ui-input-border);
--gt-dialog-width: 560px;
--gt-drawer-width: 400px;
--gt-overlay-z-index: var(--ui-z-toast);
```

Keep each existing `--ui-*` definition until the final removal task. Component CSS reads the `--gt-*` names only; `theme.scss` is the one-way migration bridge from current desktop visual values to the new public contract.

- [ ] **Step 4: 实现按批次校验脚本。**

```js
// Usage: node scripts/assert-stencil-ui-migration.mjs button icon-button card field
const completed = new Set(process.argv.slice(2));
for (const entry of inventory.entries) {
  if (!completed.has(entry.component)) continue;
  if (/\\.ui-(button|icon-button|card|field)(?:__|--|\\b)|:deep\\(\\.ui-/.test(readFileSync(entry.file, 'utf8'))) {
    throw new Error(`Legacy selector remains for ${entry.component}: ${entry.file}:${entry.line}`);
  }
}
```

The script must permit names belonging only to excluded components and must validate the replacement uses an allowed `gt-*` host, `--gt-*`, or `::part()` token in the same source file. On a successful batch it writes only the reviewed source paths for that batch to `desktop/tmp/stencil-ui-migration-stage-files.txt`; never derive a stage list from all dirty files.

- [ ] **Step 5: 运行 inventory、门禁、renderer typecheck。**

Run:

```powershell
node desktop/scripts/inventory-stencil-ui-migration.mjs
pnpm --dir desktop exec vitest run src/windows/main/components/ui/stencil_style_compatibility.test.ts
pnpm --dir desktop run typecheck
```

Expected: the targeted test and batch gate are red before their corresponding migration; typecheck stays PASS because no desktop component implementation has changed yet.

- [ ] **Step 6: 提交 inventory 与主题桥。**

```powershell
git add desktop/scripts/inventory-stencil-ui-migration.mjs desktop/scripts/assert-stencil-ui-migration.mjs desktop/tmp/stencil-ui-selector-inventory.json desktop/src/windows/main/assets/theme.scss desktop/src/windows/main/components/ui/stencil_style_compatibility.test.ts desktop/package.json desktop/scripts/verify-plugin-framework.cjs
git commit -m "test(desktop): inventory legacy UI style selectors"
```

### Task 8: 迁移 Button、IconButton、Card 与 Field 的桌面样式和实现

**Files:**
- Modify: every `button`, `icon-button`, `card`, and `field` entry listed in `desktop/tmp/stencil-ui-selector-inventory.json`
- Modify: `desktop/src/windows/main/components/ui/UiButton.vue`
- Modify: `desktop/src/windows/main/components/ui/UiIconButton.vue`
- Modify: `desktop/src/windows/main/components/ui/UiCard.vue`
- Modify: `desktop/src/windows/main/components/ui/UiField.vue`
- Modify: `desktop/src/windows/main/components/ui/stencil_style_compatibility.test.ts`
- Test: `desktop/src/windows/main/components/ui/stencil_style_compatibility.test.ts`

- [ ] **Step 1: 为第一个批次补充失败的 compatibility/override 测试。**

```ts
it('uses a shared button host and permits page overrides only through the public contract', () => {
  const source = readFileSync(resolve('src/windows/main/components/ui/UiButton.vue'), 'utf8');
  expect(source).toContain("from '@guyantools/ui-vue'");
  expect(source).not.toContain('.ui-button');
  expect(readFileSync(resolve('src/windows/main/pages/Settings.vue'), 'utf8'))
    .toMatch(/gt-button(?:\\s|::part\\()|--gt-button-/);
});
```

- [ ] **Step 2: 运行测试和 batch gate，确认它们在旧 local DOM 下失败。**

Run:

```powershell
pnpm --dir desktop exec vitest run src/windows/main/components/ui/stencil_style_compatibility.test.ts
node desktop/scripts/assert-stencil-ui-migration.mjs button icon-button card field
```

Expected: FAIL because current pages and four local implementations still target `.ui-*` internals.

- [ ] **Step 3: 依据 inventory 逐条迁移页面规则，再切换四个兼容入口。**

For every inventory entry in this batch, preserve the declared visual intent with one of these exact forms:

```scss
/* former .ui-button--compact / .ui-button__label rule */
.settings-save-action gt-button {
  --gt-button-background: var(--ui-button-primary-bg);
  --gt-button-border-color: var(--ui-button-primary-border);
}
.settings-save-action gt-button::part(label) { overflow: hidden; text-overflow: ellipsis; }

/* former .ui-card__body rule */
.settings-section gt-card::part(body) { padding: var(--gt-space-lg); }
```

Do not copy styles into `Ui*.vue`. Once all matching page selectors pass the script, replace each local component with a preserving adapter re-export, using a wrapper only for props that differ from `@guyantools/ui-vue`:

```vue
<script lang="ts">
export { UiButton as default } from '@guyantools/ui-vue';
</script>
```

Maintain `type`, `title`, slots and exposed API exactly. Do not convert selectors belonging to excluded components.

- [ ] **Step 4: 运行第一个批次验证和三主题截图。**

Run:

```powershell
node desktop/scripts/assert-stencil-ui-migration.mjs button icon-button card field
pnpm --dir desktop exec vitest run src/windows/main/components/ui/stencil_style_compatibility.test.ts
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
```

Capture Settings and Plugins pages in `.light`, `.dark` and one personalized background configuration. Verify visible icons retain their size/color, long button labels truncate inside `part="label"`, focus rings remain visible and no Vue extraneous-attributes warning is emitted.

- [ ] **Step 5: 提交第一个桌面批次。**

```powershell
git add --pathspec-from-file=desktop/tmp/stencil-ui-migration-stage-files.txt
git add desktop/src/windows/main/components/ui/UiButton.vue desktop/src/windows/main/components/ui/UiIconButton.vue desktop/src/windows/main/components/ui/UiCard.vue desktop/src/windows/main/components/ui/UiField.vue desktop/tmp/stencil-ui-selector-inventory.json
git commit -m "refactor(desktop): adopt shared action UI components"
```

### Task 9: 迁移 Input、Textarea、Checkbox、Radio、Switch、Tabs、EmptyState 与 StateCard

**Files:**
- Modify: every `input`, `textarea`, `checkbox`, `radio`, `switch`, `tabs`, `empty-state`, and `state-card` entry listed in `desktop/tmp/stencil-ui-selector-inventory.json`
- Modify: eight matching files in `desktop/src/windows/main/components/ui/`
- Modify: `desktop/src/windows/main/components/ui/stencil_style_compatibility.test.ts`
- Test: `desktop/src/windows/main/components/ui/stencil_style_compatibility.test.ts`

- [ ] **Step 1: 添加第二批失败的 Vue API 与 part override 测试。**

```ts
it('keeps input delegates and maps tabs through the shared library', () => {
  const input = readFileSync(resolve('src/windows/main/components/ui/UiInput.vue'), 'utf8');
  const tabs = readFileSync(resolve('src/windows/main/components/ui/UiTabs.vue'), 'utf8');
  expect(input).toContain("from '@guyantools/ui-vue'");
  expect(input).not.toContain('.ui-input');
  expect(tabs).toContain("from '@guyantools/ui-vue'");
  expect(tabs).toContain('UiTabItem');
});
```

- [ ] **Step 2: 运行测试和 batch gate，确认 legacy selectors 被检出。**

Run:

```powershell
pnpm --dir desktop exec vitest run src/windows/main/components/ui/stencil_style_compatibility.test.ts
node desktop/scripts/assert-stencil-ui-migration.mjs input textarea checkbox radio switch tabs empty-state state-card
```

Expected: FAIL until all entries in the inventory batch are converted.

- [ ] **Step 3: 将每个内部选择器映射到公开出口，并切换兼容入口。**

```scss
/* former .ui-input__control and .ui-tabs__active-indicator rules */
.todo-search gt-input { --gt-input-background: var(--todo-panel-bg); }
.todo-search gt-input::part(control) { font-size: var(--gt-font-size-md); }
.plugin-tabs gt-tabs::part(indicator) { background: var(--gt-color-primary); }
```

Preserve `UiInput.focus()/select()`, `keydown`, number-step controls, `UiTextarea` `resize`, checkbox indeterminate transition, radio name/value, switch ARIA label, `UiTabs` `v-model`, `change`, label slot and `UiTabItem` export. EmptyState/StateCard retain icon/actions slots. Convert all batch selector rules from the inventory before re-exporting the matching shared wrappers; do not leave a local scoped `<style>` for a migrated control.

- [ ] **Step 4: 运行批次验证和视觉回归。**

Run:

```powershell
node desktop/scripts/assert-stencil-ui-migration.mjs input textarea checkbox radio switch tabs empty-state state-card
pnpm --dir desktop exec vitest run src/windows/main/components/ui/stencil_style_compatibility.test.ts
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
```

Capture Todo, Terminal, FTP and AI composer surfaces in light/dark/personalized themes. Verify input text, prefix/suffix icons, tab indicator, disabled states, check/radio/switch controls and state-card actions match the legacy visual hierarchy.

- [ ] **Step 5: 提交第二个桌面批次。**

```powershell
git add --pathspec-from-file=desktop/tmp/stencil-ui-migration-stage-files.txt
git add desktop/src/windows/main/components/ui/UiInput.vue desktop/src/windows/main/components/ui/UiTextarea.vue desktop/src/windows/main/components/ui/UiCheckbox.vue desktop/src/windows/main/components/ui/UiRadio.vue desktop/src/windows/main/components/ui/UiSwitch.vue desktop/src/windows/main/components/ui/UiTabs.vue desktop/src/windows/main/components/ui/UiEmptyState.vue desktop/src/windows/main/components/ui/UiStateCard.vue desktop/tmp/stencil-ui-selector-inventory.json
git commit -m "refactor(desktop): adopt shared form UI components"
```

### Task 10: 迁移 Tooltip、Dialog 与 Drawer，移除 Vue 浮层所有权

**Files:**
- Modify: every `tooltip`, `dialog`, and `drawer` entry listed in `desktop/tmp/stencil-ui-selector-inventory.json`
- Modify: `desktop/src/windows/main/components/ui/UiTooltip.vue`
- Modify: `desktop/src/windows/main/components/ui/UiDialog.vue`
- Modify: `desktop/src/windows/main/components/ui/UiDrawer.vue`
- Modify: `desktop/src/windows/main/assets/tooltip.scss`
- Modify: `desktop/src/windows/main/components/ui/stencil_style_compatibility.test.ts`
- Test: `desktop/src/windows/main/components/ui/stencil_style_compatibility.test.ts`

- [ ] **Step 1: 添加失败的浮层 ownership 和 visual contract 测试。**

```ts
it('leaves portal ownership to Stencil core and keeps public overlay overrides', () => {
  for (const name of ['UiDialog.vue', 'UiDrawer.vue', 'UiTooltip.vue']) {
    const source = readFileSync(resolve(`src/windows/main/components/ui/${name}`), 'utf8');
    expect(source).toContain("from '@guyantools/ui-vue'");
    expect(source).not.toContain('<Teleport');
    expect(source).not.toMatch(/ui-(dialog|drawer|tooltip)__/);
  }
  const page = readFileSync(resolve('src/windows/main/pages/Settings.vue'), 'utf8');
  expect(page).toMatch(/--gt-dialog-width|gt-dialog::part\\(panel\\)/);
});
```

- [ ] **Step 2: 运行测试和 batch gate，确认旧 Vue portal 和 selectors 被检出。**

Run:

```powershell
pnpm --dir desktop exec vitest run src/windows/main/components/ui/stencil_style_compatibility.test.ts
node desktop/scripts/assert-stencil-ui-migration.mjs tooltip dialog drawer
```

Expected: FAIL because legacy Dialog/Drawer use `UiPopupSurface` and Tooltip owns its local controller/CSS.

- [ ] **Step 3: 迁移层级、宽度和局部主题值到 host variables/parts。**

```scss
/* former .ui-dialog-shell / .ui-drawer__header rules */
.ssh-profile-editor gt-dialog { --gt-dialog-width: 680px; }
.ssh-profile-editor gt-dialog::part(header) { border-bottom-color: var(--gt-color-border); }
.ftp-sidebar gt-drawer { --gt-drawer-width: 420px; }
.ftp-sidebar gt-drawer::part(body) { overflow: auto; }
```

Replace the three local entries only after all respective selectors are migrated. Preserve existing `modelValue`, `open`/`close`, `closeOnMask`, `closeOnEsc`, `persistent`, width, position, `overlay`, `teleported` and `teleportTo` APIs as no-op compatibility props where core now owns placement. Do not maintain a second target portal. Replace the remaining `tooltip.scss` component-internal rules with host or `::part(panel)` rules; leave unrelated global tooltip APIs intact.

- [ ] **Step 4: 运行交互测试、build 和桌面截图回归。**

Run:

```powershell
node desktop/scripts/assert-stencil-ui-migration.mjs tooltip dialog drawer
pnpm --dir packages/ui-vue exec vitest run tests/overlay.test.ts
pnpm --dir desktop exec vitest run src/windows/main/components/ui/stencil_style_compatibility.test.ts
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
```

Capture Settings, SSH profile, FTP and plugin dialogs in all three themes. Verify portal mask/panel contrast, header/footer dividers, contained icon sizing, Escape/mask behavior, focus restoration, viewport flip/reposition and local `--gt-dialog-width` propagation. Console must contain no `Extraneous non-props attributes` warning.

- [ ] **Step 5: 提交浮层桌面批次。**

```powershell
git add --pathspec-from-file=desktop/tmp/stencil-ui-migration-stage-files.txt
git add desktop/src/windows/main/components/ui/UiTooltip.vue desktop/src/windows/main/components/ui/UiDialog.vue desktop/src/windows/main/components/ui/UiDrawer.vue desktop/src/windows/main/assets/tooltip.scss desktop/tmp/stencil-ui-selector-inventory.json
git commit -m "refactor(desktop): adopt shared overlay UI components"
```

### Task 11: 删除已迁移 legacy 实现、冻结契约并完成全量验证

**Files:**
- Modify: `desktop/src/windows/main/components/ui/Ui*.vue` for all 15 first-wave compatibility entries
- Modify: `desktop/tmp/stencil-ui-selector-inventory.json`
- Modify: `desktop/scripts/assert-stencil-ui-migration.mjs`
- Modify: `desktop/scripts/verify-plugin-framework.cjs`
- Create: `docs/desktop/UI_COMPONENT_LIBRARY.md`
- Modify: `docs/desktop/PLUGIN_SYSTEM_CAPABILITIES.md`
- Modify: `docs/superpowers/specs/2026-07-24-unified-ui-component-library-design.md`
- Test: `packages/ui-core/src/components/style-contract.spec.ts`

- [ ] **Step 1: 添加最终失败门禁，证明 15 个已迁移路径无 legacy 实现。**

```js
const firstWave = ['UiButton.vue', 'UiIconButton.vue', 'UiInput.vue', 'UiTextarea.vue', 'UiCheckbox.vue', 'UiRadio.vue', 'UiSwitch.vue', 'UiTabs.vue', 'UiCard.vue', 'UiField.vue', 'UiEmptyState.vue', 'UiStateCard.vue', 'UiTooltip.vue', 'UiDialog.vue', 'UiDrawer.vue'];
for (const file of firstWave) {
  const source = readFileSync(join(uiDirectory, file), 'utf8');
  if (/<style|class=["'][^"']*ui-/.test(source)) throw new Error(`Legacy first-wave implementation remains: ${file}`);
  if (!source.includes("@guyantools/ui-vue")) throw new Error(`Shared adapter missing: ${file}`);
}
```

- [ ] **Step 2: 运行门禁，确认它能在任一遗留 scoped CSS/legacy class 上失败。**

Run: `node desktop/scripts/assert-stencil-ui-migration.mjs button icon-button card field input textarea checkbox radio switch tabs empty-state state-card tooltip dialog drawer`

Expected: FAIL until the final compatibility entry and inventory status are fully normalized.

- [ ] **Step 3: 完成兼容入口收敛与使用文档。**

Mark every first-wave inventory entry as `migrated`; remove only their now-unused local helpers/CSS. Do not remove excluded components or `--ui-*` aliases used by them. Add `docs/desktop/UI_COMPONENT_LIBRARY.md` containing:

```md
## Desktop Vue
import { UiButton, UiDialog } from '@guyantools/ui-vue'

## Plugin custom elements
import { registerGuYanElements } from '@guyantools/plugin-ui'
import '@guyantools/plugin-ui/tokens.css'

## Supported customization
gt-dialog { --gt-dialog-width: 42rem; }
gt-dialog::part(panel) { max-height: calc(100vh - 2rem); }
```

Document all 15 components, their public variables and parts, the `.light`/`.dark` theme bridge, body portal variable forwarding, plugin Vue/React entrypoints, and explicitly excluded controls. Link this document from `docs/desktop/PLUGIN_SYSTEM_CAPABILITIES.md`. Update the design status and verification commands to match the implementation.

- [ ] **Step 4: 执行全量验证矩阵。**

Run:

```powershell
pnpm --dir packages/ui-core run verify:style-contract
pnpm --dir packages/ui-core exec vitest run
pnpm --dir packages/ui-core run build
pnpm --dir packages/ui-vue exec vitest run
pnpm --dir packages/ui-vue run typecheck
pnpm --dir packages/ui-vue run build
pnpm --dir packages/plugin-ui exec vitest run
pnpm run verify:plugin-framework
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
pnpm --dir desktop run test:plugin-platform
git diff --check
```

Expected: all commands exit `0`. Complete desktop screenshots for light, dark and personalized backgrounds without blank controls, missing icons, overflowed text, raw unstyled portal panels or Vue attribute warnings. Builds and screenshots validate renderer output; they do not substitute for an installed production Electron smoke test.

- [ ] **Step 5: 提交契约冻结、文档和验证更新。**

```powershell
git add --pathspec-from-file=desktop/tmp/stencil-ui-migration-stage-files.txt
git add desktop/scripts/assert-stencil-ui-migration.mjs desktop/scripts/verify-plugin-framework.cjs desktop/tmp/stencil-ui-selector-inventory.json docs/desktop/UI_COMPONENT_LIBRARY.md docs/desktop/PLUGIN_SYSTEM_CAPABILITIES.md docs/superpowers/specs/2026-07-24-unified-ui-component-library-design.md
git commit -m "docs(ui): complete Stencil shared component migration"
```

## 覆盖自检

| 已确认要求 | 对应任务 |
| --- | --- |
| 全部首期控件为 Stencil Shadow DOM | 2、3、4 |
| 固定样式不在 TypeScript/TSX | 1、2、3、4 |
| tokens、light、dark、overlay 与组件 CSS 拆分 | 1、2、3、4 |
| variables 与 `part` 是唯一公开样式出口 | 2、3、4、7、8、9、10 |
| portal 由 Stencil 负责并转发局部 theme/width | 4、5、10 |
| Vue wrapper 无 CSS/Teleport 并转发 attrs | 5 |
| plugin Vue/React 入口与旧路径兼容 | 6 |
| 桌面先去除 `.ui-*` 依赖再替换组件 | 7、8、9、10 |
| 主题、图标和个性化背景不丢失 | 7、8、9、10、11 |
| 文档、构建、测试与静态门禁 | 1、6、7、11 |

## 计划自检

- 已逐段覆盖已确认设计中的样式文件边界、Shadow DOM、公开样式契约、Stencil-owned portal、Vue compatibility、plugin facade、桌面分批迁移和验证要求。
- 已为每个实现任务安排失败测试、失败运行、最小实现、通过运行和独立提交；不存在待补充实现步骤。
- 契约名称在所有任务中保持一致：`--gt-*`、`part`、`styleUrl`、`registerGuYanElements`、`assert-style-contract.mjs`、`assert-stencil-ui-migration.mjs`。
