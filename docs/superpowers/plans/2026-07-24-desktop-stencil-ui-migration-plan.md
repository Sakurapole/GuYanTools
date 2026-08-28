# Desktop Stencil UI Migration Implementation Plan

> **当前状态：暂停。** 桌面端已恢复迁移前的 Vue `Ui*.vue`、legacy `.ui-*` 选择器和原有样式；Stencil 组件库继续用于插件开发和独立消费。本文保留为未来分批迁移的历史计划，不能据此判断桌面迁移已完成。

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在不改变桌面端现有 Vue `Ui*` 调用方式、主题和个性化背景行为的前提下，将首批 15 个桌面控件切换为 `@guyantools/ui-vue` 对 Stencil `gt-*` custom elements 的兼容入口。

**Architecture:** 桌面端继续从 `@/windows/main/components/ui/Ui*.vue` 导入控件，迁移完成的本地文件只作为 API 兼容入口，视觉和交互实现由 `@guyantools/ui-core` 的 Shadow DOM 组件拥有。页面只能通过 `gt-*` host、稳定的 `::part()` 和 `--gt-*` variables 调整已迁移控件；主题文件是现有 `--ui-*` token 到公开 `--gt-*` token 的单向桥。Dialog、Drawer、Tooltip 的 portal 仍由 core 挂到 `body`，桌面端只传递公开 variables，不能针对 portal 内部 DOM 写选择器。

**Tech Stack:** Electron Forge、Vite、Vue 3、TypeScript、Stencil 4、`@guyantools/ui-core`、`@guyantools/ui-vue`、Vitest、SCSS、pnpm workspace。

---

## 迁移边界

- 本计划仅覆盖 `UiButton`、`UiIconButton`、`UiCard`、`UiField`、`UiInput`、`UiTextarea`、`UiCheckbox`、`UiRadio`、`UiSwitch`、`UiTabs`、`UiEmptyState`、`UiStateCard`、`UiTooltip`、`UiDialog`、`UiDrawer`。
- `UiMenu`、日期/时间选择器、Tree、File、Color、Transfer、Scrollbar、IconPicker、媒体裁剪及其 `.ui-*` 选择器继续使用 legacy 实现，不修改其 CSS token。
- 组件库不重新定义桌面页面背景，也不在 `body`、`#guyan-tools` 或页面容器写不透明背景；个性化 renderer 背景必须保持可见。
- 每个批次都先替换该批次的页面 selector，再替换本地 `Ui*.vue` DOM 实现。不得使用 `shadow: false`、`:deep(.ui-*)`、未公开 class 或复制 Stencil CSS 作为过渡方案。
- `UiInput.focus()`、`UiInput.select()`、`UiTextarea.focus()`、`UiTextarea.select()`、`UiTabs` 的 `UiTabItem` 类型、所有既有 slots、`v-model`、事件和 Dialog/Drawer 的兼容 props 必须保留。
- 当前工作树包含未提交的插件宿主和 SDK 修改。每次提交只能添加本计划明确列出的文件，不得使用 `git add .`、`git add desktop` 或 `desktop/tmp/`。

## 当前基线与完成条件

| 项目 | 当前状态 | 完成条件 |
| --- | --- | --- |
| 桌面控件实现 | 15 个 `desktop/src/windows/main/components/ui/Ui*.vue` 仍含 legacy DOM/CSS | 15 个文件均只转发至 `@guyantools/ui-vue`，不含 `<style>`、`.ui-*` 根结构或 `Teleport` |
| 页面样式 | 当前检索到 74 处首批 `.ui-*` / `:deep(.ui-*)` selector 行 | inventory 中所有首批条目状态为 `migrated`，没有已迁移组件的 legacy selector |
| 主题 | `theme.scss` 以 `--ui-*` 为主 | light/dark 同时输出每个使用中的 `--gt-*` variable，legacy token 保留给未迁移控件 |
| 浮层 | 旧桌面样式仍包含 `.ui-tooltip*` 与组件内部覆盖 | 页面只给 `gt-dialog`、`gt-drawer`、`gt-tooltip` host 设 variables；portal 内部由 core CSS 渲染 |
| 桌面依赖 | 已依赖 `@guyantools/ui-core`，尚未依赖 `@guyantools/ui-vue` | renderer 构建能解析 `@guyantools/ui-vue`，并把 `gt-*` 识别为 custom element |

## 文件地图

- `desktop/package.json`：增加 `@guyantools/ui-vue` workspace dependency。
- `desktop/vite.renderer.config.ts`：把 `gt-*` 识别为 custom element，保留现有 `webview` 规则。
- `desktop/src/windows/main/main.ts`：在挂载 Vue 应用前注册 Stencil elements，注册必须幂等。
- `desktop/src/windows/main/assets/theme.scss`：在现有 `.light`、`.dark` token 块中增加 `--gt-*` 主题桥，不删除 `--ui-*`。
- `desktop/src/windows/main/components/ui/Ui{Button,IconButton,Card,Field,Input,Textarea,Checkbox,Radio,Switch,Tabs,EmptyState,StateCard,Tooltip,Dialog,Drawer}.vue`：迁移后为共享 Vue adapter 的兼容入口。
- `desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts`：锁定兼容 API、adapter 所有权和禁止回退 legacy DOM 的测试。
- `desktop/scripts/inventory-stencil-ui-migration.mjs`：扫描 `desktop/src/windows/main`，生成有 component、文件、行号、legacy selector、替换策略、状态的 inventory。
- `desktop/scripts/assert-stencil-ui-migration.mjs`：按给定组件族拒绝遗留 selector，验证迁移状态与允许的公开替代方式。
- `desktop/scripts/stage-stencil-ui-migration.mjs`：只输出 inventory 批次中已审核且实际变更的文件，防止暂存用户的无关修改。
- `desktop/tests/fixtures/stencil-ui-selector-inventory.json`：受版本控制的 selector 基线；不使用已有且无关的 `desktop/tmp/`。
- `docs/desktop/UI_COMPONENT_LIBRARY.md`：迁移完成后的桌面组件库使用、样式契约和排除项文档。
- `docs/superpowers/plans/2026-07-24-stencil-style-contract-desktop-migration-plan.md`：将旧总计划的桌面任务标注为由本计划取代，避免两份 checklist 同时跟踪。

### Task 1: 建立桌面消费与迁移门禁基础

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/vite.renderer.config.ts`
- Modify: `desktop/src/windows/main/main.ts`
- Modify: `packages/ui-vue/src/index.ts`
- Modify: `packages/ui-vue/tests/compatibility.test.ts`
- Create: `desktop/scripts/inventory-stencil-ui-migration.mjs`
- Create: `desktop/scripts/assert-stencil-ui-migration.mjs`
- Create: `desktop/scripts/stage-stencil-ui-migration.mjs`
- Create: `desktop/tests/fixtures/stencil-ui-selector-inventory.json`
- Create: `desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts`
- Test: `desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts`

- [x] **Step 1: 为 custom element 编译与幂等注册写失败测试。**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readDesktop = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('desktop shared UI bootstrap', () => {
  it('treats gt-* as custom elements and registers the shared element set before mount', () => {
    expect(readDesktop('vite.renderer.config.ts')).toMatch(/tag\.startsWith\(['\"]gt-['\"]\)/);
    const main = readDesktop('src/windows/main/main.ts');
    expect(main).toContain("ensureGuYanElements()");
    expect(main.indexOf('ensureGuYanElements()')).toBeLessThan(main.indexOf("app.mount('#guyan-tools')"));
  });
});
```

- [x] **Step 2: 运行该测试，确认当前 renderer 尚未具备 desktop 注册路径。**

Run: `pnpm --dir desktop exec vitest run --config vite.renderer.config.ts src/windows/main/components/ui/stencil_ui_compatibility.test.ts`

Expected: FAIL because `vite.renderer.config.ts` only识别 `webview`，且 `main.ts` 没有注册共享 element。

- [x] **Step 3: 加入 `ui-vue` 依赖、Vite custom-element 规则和应用级注册。**

在 `packages/ui-vue/src/index.ts` 添加现有幂等注册器的具名导出，并在 `packages/ui-vue/tests/compatibility.test.ts` 断言该导出存在：

```ts
export { ensureGuYanElements } from './register';
```

在 `desktop/package.json` 的 `dependencies` 中加入：

```json
"@guyantools/ui-vue": "workspace:*"
```

把 renderer compiler option 改为保留既有 `webview` 行为的形式：

```ts
isCustomElement: (tag) => tag === 'webview' || tag.startsWith('gt-'),
```

在 `main.ts` 导入并在 `createApp(App)` 之前调用：

```ts
import { ensureGuYanElements } from '@guyantools/ui-vue';

ensureGuYanElements();
const app = createApp(App);
```

desktop 不得复制 `defineCustomElements` 逻辑；唯一注册入口是 `@guyantools/ui-vue` 的 `ensureGuYanElements()`。

- [x] **Step 4: 编写并运行 inventory 与 batch gate 的单元测试。**

脚本以这份数据模型写入 `desktop/tests/fixtures/stencil-ui-selector-inventory.json`：

```ts
type InventoryEntry = {
  component: 'button' | 'icon-button' | 'card' | 'field' | 'input' | 'textarea' | 'checkbox' | 'radio' | 'switch' | 'tabs' | 'empty-state' | 'state-card' | 'tooltip' | 'dialog' | 'drawer';
  file: string;
  line: number;
  selector: string;
  replacement: 'host' | 'variable' | 'part' | 'remove';
  status: 'pending' | 'migrated';
};
```

`inventory-stencil-ui-migration.mjs --write` 只扫描 `.vue`、`.scss`、`.ts`，忽略 `node_modules`、`.vite`、`dist`、`desktop/tmp`，并以稳定的路径、行号、selector 排序覆盖 fixture。`assert-stencil-ui-migration.mjs button icon-button` 必须：

```js
if (entry.status === 'migrated' && legacySelectorStillExists(entry)) {
  throw new Error(`Legacy selector remains: ${entry.component} ${entry.file}:${entry.line}`);
}
if (entry.status === 'migrated' && !hasPublicReplacement(entry.file)) {
  throw new Error(`No public Stencil replacement: ${entry.file}`);
}
```

`hasPublicReplacement` 仅接受 `gt-<component>`、`--gt-`、`::part(`；`remove` 条目无需替代。为每个脚本用临时 fixture 写一条 pending 和一条 migrated 记录，断言 pending 不报错、migrated legacy selector 报错、迁移后的 `gt-button::part(label)` 通过。

- [x] **Step 5: 增加受控暂存脚本并生成初始清单。**

`stage-stencil-ui-migration.mjs <component...>` 从 inventory 取 `status: 'migrated'` 的相对文件，只保留同时出现在 `git diff --name-only -z` 的路径，向 PowerShell 输出逐行的相对文件名。脚本内部以 NUL 解析 Git 输出，避免空格路径被拆分：

```powershell
$files = @(node desktop/scripts/stage-stencil-ui-migration.mjs button icon-button)
if ($LASTEXITCODE -ne 0 -or -not $files) { throw 'No reviewed migration files to stage.' }
$files | ForEach-Object { git add -- $_ }
```

执行 `node desktop/scripts/inventory-stencil-ui-migration.mjs --write`，审查该 JSON 后提交它。不要让脚本执行 `git add`，也不要把 `desktop/tmp/` 写入或加入 Git。

- [x] **Step 6: 运行基础验证并提交。**

Run:

```powershell
pnpm --dir desktop exec vitest run --config vite.renderer.config.ts src/windows/main/components/ui/stencil_ui_compatibility.test.ts
node desktop/scripts/inventory-stencil-ui-migration.mjs --check
pnpm --dir desktop run typecheck
```

Expected: PASS；fixture 是当前 selector 基线，尚未声明任何条目 `migrated`。

Commit only the files in this task:

```powershell
git add desktop/package.json desktop/vite.renderer.config.ts desktop/src/windows/main/main.ts desktop/scripts/inventory-stencil-ui-migration.mjs desktop/scripts/assert-stencil-ui-migration.mjs desktop/scripts/stage-stencil-ui-migration.mjs desktop/tests/fixtures/stencil-ui-selector-inventory.json desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts packages/ui-vue/src/index.ts packages/ui-vue/tests/compatibility.test.ts
git commit -m "test(desktop): add shared UI migration gates"
```

### Task 2: 建立保留透明背景的主题变量桥

**Files:**
- Modify: `desktop/src/windows/main/assets/theme.scss`
- Modify: `desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts`
- Test: `desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts`

- [x] **Step 1: 添加 light、dark、背景保护的失败测试。**

```ts
it('maps desktop theme values to public gt variables without painting renderer backgrounds', () => {
  const theme = readDesktop('src/windows/main/assets/theme.scss');
  for (const variable of ['--gt-button-background', '--gt-input-background', '--gt-tabs-indicator-color', '--gt-dialog-width', '--gt-drawer-width', '--gt-overlay-z-index']) {
    expect(theme).toContain(variable);
  }
  const global = readDesktop('src/windows/main/global.css');
  expect(global).not.toMatch(/body\s*\{[^}]*background\s*:/s);
  expect(global).not.toMatch(/#guyan-tools\s*\{[^}]*background\s*:/s);
});
```

- [x] **Step 2: 在 `.light` 与 `.dark` token 块中建立一对一桥接。**

保留所有现有 `--ui-*` 定义；在每个主题块新增下列形式的桥接，实际变量必须覆盖 15 个 contract 文件声明的全部 variables：

```scss
--gt-button-background: var(--ui-button-secondary-bg);
--gt-button-border-color: var(--ui-button-secondary-border);
--gt-button-color: var(--ui-button-secondary-text);
--gt-icon-button-background: var(--ui-icon-button-secondary-bg);
--gt-input-background: var(--ui-input-bg);
--gt-input-border-color: var(--ui-input-border);
--gt-input-color: var(--ui-input-text);
--gt-textarea-background: var(--ui-input-bg);
--gt-tabs-indicator-color: var(--ui-tabs-active-indicator);
--gt-dialog-width: 560px;
--gt-drawer-width: 400px;
--gt-overlay-z-index: var(--ui-z-toast);
```

对检查、单选、开关、状态卡、tooltip、field 的颜色也使用对应 `--ui-*` token。不能把 token 写死为新的色值；不能新增 root/body 背景、滤镜或 blend mode。

- [x] **Step 3: 为 portal 变量继承加回归断言。**

在测试中读取 `packages/ui-core/src/utils/overlay-controller.ts`，断言它在挂入 `body` 时继续执行已登记 `--gt-*` variables 的复制。桌面侧只允许：

```scss
.ssh-profile-editor gt-dialog { --gt-dialog-width: 680px; }
.plugin-detail gt-drawer { --gt-drawer-width: 420px; }
```

不允许新增 `body .gt-overlay-*`、`.ui-dialog__*` 或 `:deep()` portal 内部选择器。

- [x] **Step 4: 运行主题验证并提交。**

Run:

```powershell
pnpm --dir desktop exec vitest run --config vite.renderer.config.ts src/windows/main/components/ui/stencil_ui_compatibility.test.ts
pnpm --dir desktop run typecheck
git diff --check
```

Expected: PASS。

```powershell
git add desktop/src/windows/main/assets/theme.scss desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts
git commit -m "refactor(desktop): bridge themes to Stencil UI tokens"
```

### Task 3: 迁移动作与布局控件

**Files:**
- Modify: inventory 中 `button`、`icon-button`、`card`、`field` 的每一个页面或 SCSS 条目
- Modify: `desktop/src/windows/main/components/ui/UiButton.vue`
- Modify: `desktop/src/windows/main/components/ui/UiIconButton.vue`
- Modify: `desktop/src/windows/main/components/ui/UiCard.vue`
- Modify: `desktop/src/windows/main/components/ui/UiField.vue`
- Modify: `desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts`

- [x] **Step 1: 锁定四个 adapter 的 API 与禁止 legacy DOM 的失败测试。**

```ts
for (const file of ['UiButton.vue', 'UiIconButton.vue', 'UiCard.vue', 'UiField.vue']) {
  it(`${file} delegates visual ownership to ui-vue`, () => {
    const source = readDesktop(`src/windows/main/components/ui/${file}`);
    expect(source).toContain("@guyantools/ui-vue");
    expect(source).not.toMatch(/<style|ui-(button|icon-button|card|field)(?:__|--|[\"'])/);
  });
}
```

- [x] **Step 2: 逐条转换 batch A inventory selector。**

将 `.ui-button`、`.ui-icon-button`、`.ui-card`、`.ui-field` host 选择器改为对应的 `gt-*` host；将子元素规则改为 contract 的 part；将颜色、边框、尺寸改为 host variable。例如：

```scss
/* .settings-save.ui-button -> gt-button host */
.settings-save gt-button { --gt-button-background: var(--ui-button-primary-bg); }
.settings-save gt-button::part(label) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }

/* .script-panel :deep(.ui-card__body) -> public part */
.script-panel gt-card::part(body) { padding: var(--gt-space-lg); }

/* .settings-field :deep(.ui-field__label) -> public part */
.settings-field gt-field::part(label) { font-size: 0.82rem; }
```

对于 inventory 的每条记录，把 `replacement` 更新为 `host`、`part`、`variable` 或 `remove`，并把 `status` 设为 `migrated`。本批次不得保留任何 `.ui-button*`、`.ui-icon-button*`、`.ui-card*`、`.ui-field*` selector。

- [x] **Step 3: 将四个本地实现收敛为兼容入口。**

当且仅当该控件的 batch gate 通过后，用具名 re-export 保留原文件路径：

```vue
<script lang="ts">
export { UiButton as default } from '@guyantools/ui-vue';
</script>
```

`UiIconButton`、`UiCard`、`UiField` 使用其同名导出。若某个本地 prop 名称与共享 adapter 不同，只保留最薄的一层 props/events 转发；不得重新生成 button/card DOM 或写 scoped CSS。

- [x] **Step 4: 运行 batch gate、构建与三个主题截图。**

Run:

```powershell
node desktop/scripts/assert-stencil-ui-migration.mjs button icon-button card field
pnpm --dir desktop exec vitest run --config vite.renderer.config.ts src/windows/main/components/ui/stencil_ui_compatibility.test.ts
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
```

在 Settings 与 Plugins 页面分别截取 `.light`、`.dark`、一套已启用个性化背景的状态。验收：图标颜色/尺寸正常，长文本在 button label 内截断，focus ring 可见，背景不被控件库覆盖，控制台无 `Extraneous non-props attributes` 警告。

- [x] **Step 5: 受控暂存并提交 batch A。**

```powershell
$files = node desktop/scripts/stage-stencil-ui-migration.mjs button icon-button card field
$files | ForEach-Object { git add -- $_ }
git add desktop/src/windows/main/components/ui/UiButton.vue desktop/src/windows/main/components/ui/UiIconButton.vue desktop/src/windows/main/components/ui/UiCard.vue desktop/src/windows/main/components/ui/UiField.vue desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts desktop/tests/fixtures/stencil-ui-selector-inventory.json
git commit -m "refactor(desktop): adopt shared action UI components"
```

### Task 4: 迁移表单、Tabs 与反馈控件

**Files:**
- Modify: inventory 中 `input`、`textarea`、`checkbox`、`radio`、`switch`、`tabs`、`empty-state`、`state-card` 的每一个条目
- Modify: `desktop/src/windows/main/components/ui/UiInput.vue`
- Modify: `desktop/src/windows/main/components/ui/UiTextarea.vue`
- Modify: `desktop/src/windows/main/components/ui/UiCheckbox.vue`
- Modify: `desktop/src/windows/main/components/ui/UiRadio.vue`
- Modify: `desktop/src/windows/main/components/ui/UiSwitch.vue`
- Modify: `desktop/src/windows/main/components/ui/UiTabs.vue`
- Modify: `desktop/src/windows/main/components/ui/UiEmptyState.vue`
- Modify: `desktop/src/windows/main/components/ui/UiStateCard.vue`
- Modify: `desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts`

- [x] **Step 1: 写行为兼容测试。**

```ts
it('preserves form delegates and UiTabs type exports', () => {
  const input = readDesktop('src/windows/main/components/ui/UiInput.vue');
  const textarea = readDesktop('src/windows/main/components/ui/UiTextarea.vue');
  const tabs = readDesktop('src/windows/main/components/ui/UiTabs.vue');
  expect(input).toContain('@guyantools/ui-vue');
  expect(textarea).toContain('@guyantools/ui-vue');
  expect(tabs).toContain('UiTabItem');
  expect(input).not.toContain('ui-input-number-controls');
  expect(textarea).not.toContain('<style');
});
```

通过 Vue Test Utils 挂载 `UiInput`、`UiTextarea`、`UiTabs`，断言 `focus/select` 可调用，`update:modelValue`、`change`、`keydown` 继续发射，tabs 的 `v-model` 与 `change` 继续同步。

- [x] **Step 2: 按公开契约迁移所有第二批 selector。**

采用以下转换边界：

```scss
.todo-search gt-input { --gt-input-background: var(--todo-panel-bg); }
.todo-search gt-input::part(control) { min-width: 0; }
.plugin-tabs gt-tabs::part(indicator) { background: var(--ui-tabs-active-indicator); }
.plugin-tabs gt-tabs { --gt-tabs-indicator-color: var(--ui-tabs-active-indicator); }
.permission-option gt-checkbox::part(label) { color: var(--ui-text-secondary); }
```

数字输入的步进按钮、Input prefix/suffix、Textarea resize、checkbox indeterminate、radio `name/value`、switch ARIA label、EmptyState/StateCard 图标与 action slots 都必须通过现有 `ui-vue` adapter 实现。若共享 adapter 缺少任一当前桌面 API，先在 `packages/ui-vue` 补 API 转发和对应测试，再改 desktop；不要在 desktop 恢复 legacy DOM。

- [x] **Step 3: 用 adapter 收敛八个本地文件。**

`UiInput.vue`、`UiTextarea.vue` 使用共享 adapter 的 `defineExpose`；`UiTabs.vue` 必须继续导出：

```ts
export type { UiTabItem } from '@guyantools/ui-vue';
export { UiTabs as default } from '@guyantools/ui-vue';
```

其余六个文件使用具名 default re-export，保留 attributes、named slots 和所有当前事件。

- [x] **Step 4: 执行第二批验证与视觉回归。**

Run:

```powershell
node desktop/scripts/assert-stencil-ui-migration.mjs input textarea checkbox radio switch tabs empty-state state-card
pnpm --dir desktop exec vitest run --config vite.renderer.config.ts src/windows/main/components/ui/stencil_ui_compatibility.test.ts
pnpm --dir packages/ui-vue exec vitest run
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
```

在 Todo、Terminal、FTP、AI composer 页面检查 light/dark/个性化背景。验收：文字与 placeholder 可读，prefix/suffix 图标未丢失，tab indicator 与 disabled 状态正确，check/radio/switch 有可见状态差异，state-card action 可操作。

- [x] **Step 5: 受控暂存并提交 batch B。**

```powershell
$files = node desktop/scripts/stage-stencil-ui-migration.mjs input textarea checkbox radio switch tabs empty-state state-card
$files | ForEach-Object { git add -- $_ }
git add desktop/src/windows/main/components/ui/UiInput.vue desktop/src/windows/main/components/ui/UiTextarea.vue desktop/src/windows/main/components/ui/UiCheckbox.vue desktop/src/windows/main/components/ui/UiRadio.vue desktop/src/windows/main/components/ui/UiSwitch.vue desktop/src/windows/main/components/ui/UiTabs.vue desktop/src/windows/main/components/ui/UiEmptyState.vue desktop/src/windows/main/components/ui/UiStateCard.vue desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts desktop/tests/fixtures/stencil-ui-selector-inventory.json
git commit -m "refactor(desktop): adopt shared form UI components"
```

### Task 5: 迁移 Stencil-owned tooltip、dialog 与 drawer

**Files:**
- Modify: inventory 中 `tooltip`、`dialog`、`drawer` 的每一个条目
- Modify: `desktop/src/windows/main/components/ui/UiTooltip.vue`
- Modify: `desktop/src/windows/main/components/ui/UiDialog.vue`
- Modify: `desktop/src/windows/main/components/ui/UiDrawer.vue`
- Modify: `desktop/src/windows/main/assets/tooltip.scss`
- Modify: `desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts`

- [x] **Step 1: 写浮层 ownership 和兼容 props 的失败测试。**

```ts
for (const file of ['UiTooltip.vue', 'UiDialog.vue', 'UiDrawer.vue']) {
  it(`${file} delegates portal ownership to Stencil`, () => {
    const source = readDesktop(`src/windows/main/components/ui/${file}`);
    expect(source).toContain('@guyantools/ui-vue');
    expect(source).not.toContain('<Teleport');
    expect(source).not.toMatch(/ui-(tooltip|dialog|drawer)(?:__|--|[\"'])/);
  });
}
```

通过 Vue Test Utils 断言 `modelValue` 改变仍产生 `open`/`close`，Dialog 继续支持 `width`、`maxWidth`、`closeOnMask`、`closeOnEsc`、`persistent`，Drawer 继续支持 `width`、`position`、`overlay`、`teleported`、`teleportTo`、`fixed` 兼容 props。后四个 placement props 只转发或作为 no-op 兼容值，不能启动第二个 Vue portal。

- [x] **Step 2: 替换 overlay 的桌面样式入口。**

将页面局部宽度/层级意图转为 host variables：

```scss
.ssh-profile-editor gt-dialog { --gt-dialog-width: 680px; }
.ftp-sidebar gt-drawer { --gt-drawer-width: 420px; }
.plugin-runtime gt-dialog { --gt-overlay-z-index: var(--ui-z-toast); }
```

`tooltip.scss` 只保留非组件的全局触发器布局规则；删除 `.ui-tooltip`、`.ui-tooltip__content`、`.ui-tooltip__arrow` 和它们的方向规则。不得添加 `body > .gt-*`、portal class 或遮罩 DOM 选择器。

- [x] **Step 3: 收敛三个本地 adapter。**

优先直接 re-export。若 desktop 传入的 legacy props 超出共享 adapter，创建只负责 props/events 映射的 wrapper，并保持以下结构：

```vue
<script setup lang="ts">
import { UiDialog as SharedUiDialog } from '@guyantools/ui-vue';
</script>

<template><SharedUiDialog v-bind="$attrs"><slot /></SharedUiDialog></template>
```

该 wrapper 不得包含 `<style>`、`Teleport`、定位计算、焦点陷阱或 body 操作。

- [x] **Step 4: 验证 portal、主题变量与交互。**

Run:

```powershell
node desktop/scripts/assert-stencil-ui-migration.mjs tooltip dialog drawer
pnpm --dir packages/ui-vue exec vitest run tests/overlay.test.ts
pnpm --dir desktop exec vitest run --config vite.renderer.config.ts src/windows/main/components/ui/stencil_ui_compatibility.test.ts
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
```

在 Settings、SSH、FTP、Plugins 页面使用 light/dark/个性化背景逐项验证：mask/panel 对比正确，header/footer divider 存在，Escape 与 mask close 规则正确，焦点回到触发器，tooltip 在视口边缘翻转，局部 width variable 已传播到 body portal，控制台没有属性警告。

- [x] **Step 5: 受控暂存并提交 batch C。**

```powershell
$files = node desktop/scripts/stage-stencil-ui-migration.mjs tooltip dialog drawer
$files | ForEach-Object { git add -- $_ }
git add desktop/src/windows/main/components/ui/UiTooltip.vue desktop/src/windows/main/components/ui/UiDialog.vue desktop/src/windows/main/components/ui/UiDrawer.vue desktop/src/windows/main/assets/tooltip.scss desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts desktop/tests/fixtures/stencil-ui-selector-inventory.json
git commit -m "refactor(desktop): adopt shared overlay UI components"
```

### Task 6: 冻结桌面契约、更新文档并完成验证

**Files:**
- Modify: `desktop/scripts/assert-stencil-ui-migration.mjs`
- Modify: `desktop/tests/fixtures/stencil-ui-selector-inventory.json`
- Modify: `desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts`
- Create: `docs/desktop/UI_COMPONENT_LIBRARY.md`
- Modify: `docs/superpowers/plans/2026-07-24-stencil-style-contract-desktop-migration-plan.md`

- [x] **Step 1: 添加最终静态门禁。**

在 `assert-stencil-ui-migration.mjs` 固定首批数组，并要求每一个本地入口只有共享实现：

```js
const firstWave = ['UiButton.vue', 'UiIconButton.vue', 'UiCard.vue', 'UiField.vue', 'UiInput.vue', 'UiTextarea.vue', 'UiCheckbox.vue', 'UiRadio.vue', 'UiSwitch.vue', 'UiTabs.vue', 'UiEmptyState.vue', 'UiStateCard.vue', 'UiTooltip.vue', 'UiDialog.vue', 'UiDrawer.vue'];
for (const file of firstWave) {
  const source = readFileSync(join(uiDirectory, file), 'utf8');
  if (!source.includes('@guyantools/ui-vue')) throw new Error(`Shared adapter missing: ${file}`);
  if (/<style|<Teleport|\.ui-(button|icon-button|card|field|input|textarea|checkbox|radio|switch|tabs|empty-state|state-card|tooltip|dialog|drawer)/.test(source)) {
    throw new Error(`Legacy first-wave implementation remains: ${file}`);
  }
}
```

该脚本还必须拒绝 fixture 中任何首批 `pending` 条目。

- [x] **Step 2: 编写桌面组件库文档。**

`docs/desktop/UI_COMPONENT_LIBRARY.md` 必须含有这四段实际可用内容：

```md
## Vue 调用
import UiButton from '@/windows/main/components/ui/UiButton.vue'

## 局部样式
.settings-save gt-button { --gt-button-background: var(--ui-button-primary-bg); }
.settings-save gt-button::part(label) { min-width: 0; }

## Portal 控件
.ssh-editor gt-dialog { --gt-dialog-width: 680px; }

## 不支持的覆盖方式
不要使用 :deep(.ui-button__label)、.ui-dialog__panel 或 body portal 内部 class。
```

列出 15 个控件对应的 `gt-*`、public parts、public variables、可用 slots/事件和保留 API；说明 `.light`/`.dark` bridge、个性化背景约束、portal variable forwarding、插件侧的 `@guyantools/plugin-ui` Vue/React 入口，以及本计划排除的 legacy 控件。

- [x] **Step 3: 将总计划的桌面部分替换为本计划链接。**

在 `2026-07-24-stencil-style-contract-desktop-migration-plan.md` 的 Task 7 前加入：

```md
> 桌面端迁移已拆分到 `docs/superpowers/plans/2026-07-24-desktop-stencil-ui-migration-plan.md`。
> 本文的 Task 7-11 不再执行；以独立计划的 inventory、batch gate 和验收矩阵为准。
```

不要修改已完成的 Task 1-6 勾选状态。

- [x] **Step 4: 执行最终验证矩阵。**

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
node desktop/scripts/inventory-stencil-ui-migration.mjs --check
node desktop/scripts/assert-stencil-ui-migration.mjs button icon-button card field input textarea checkbox radio switch tabs empty-state state-card tooltip dialog drawer
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
pnpm --dir desktop run test:plugin-platform
git diff --check
```

Expected: all commands exit `0`。桌面截图矩阵覆盖 Settings、Plugins、Todo、Terminal、FTP、AI、SSH 的 light/dark/个性化背景状态；没有空白控件、丢失图标、溢出文本、无样式 portal 或 Vue attribute warning。构建和截图验证 renderer 输出，但不替代已安装生产 Electron 的人工 smoke test。

- [x] **Step 5: 受控暂存文档和终态门禁后提交。**

```powershell
git add desktop/scripts/assert-stencil-ui-migration.mjs desktop/tests/fixtures/stencil-ui-selector-inventory.json desktop/src/windows/main/components/ui/stencil_ui_compatibility.test.ts docs/desktop/UI_COMPONENT_LIBRARY.md docs/superpowers/plans/2026-07-24-stencil-style-contract-desktop-migration-plan.md docs/superpowers/plans/2026-07-24-desktop-stencil-ui-migration-plan.md
git commit -m "docs(ui): define desktop Stencil migration completion"
```

## 验收映射

| 需求 | 对应任务 |
| --- | --- |
| 不丢失桌面样式和图标 | 2、3、4、5 的三主题截图与视觉断言 |
| 不改变现有桌面 Vue 调用路径和核心 API | 3、4、5 的 compatibility tests 与 adapter 收敛 |
| Stencil 是唯一视觉与 portal 所有者 | 1、3、4、5、6 的静态门禁 |
| 样式只经 variables / parts / host | 1 的 batch gate，3-5 的逐条 inventory 迁移 |
| 透明/个性化 renderer 背景保持 | 2 的 root 背景保护测试和三主题截图 |
| 当前用户未提交改动不会被暂存 | 1 的受控 stage 脚本及每批次明确 `git add` |
| 完整构建、测试、插件框架回归 | 6 的最终验证矩阵 |

## 计划自检

- 桌面迁移与已完成的 core/plugin 工作分离，执行顺序是 foundation、主题桥、动作布局、表单反馈、浮层、终态冻结。
- 不使用 `desktop/tmp/` 保存 inventory 或暂存清单，避免与现有用户未跟踪目录冲突。
- 任何 batch 的 legacy selector 都必须先清零再换本地实现，避免“组件已换、样式仍指向旧 DOM”造成桌面端无样式或图标丢失。
- portal custom properties 以 host 转发为主；页面不依赖不能跨越 body portal 的普通 `gt-dialog::part(...)` 选择器。
