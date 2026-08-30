# Remaining Stencil Components Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking. Complete and check each component task only after its tests and build gates pass.

**Goal:** 将首期之外仍由桌面 Legacy Vue 实现的通用控件，按组件逐项迁移到 Stencil，并保持现有 Vue API、主题、尺寸、浮层行为和个性化背景不变。

**Architecture:** `packages/ui-core` 提供 Shadow DOM `gt-*` custom elements，所有组件样式拆分为独立 CSS，通过 `--gt-*` variables 和 `::part()` 暴露定制出口。`packages/ui-vue` 提供 Vue 适配器，桌面端保留 `desktop/src/windows/main/components/ui/Ui*.vue` 路径作为兼容入口；浮层统一使用 core 的 body portal，页面不再复制 portal 内部 DOM 或 CSS。

**Tech Stack:** Electron、Vite、Vue 3、TypeScript、Stencil 4、Vitest、SCSS、pnpm workspace。

**Spec:** `docs/superpowers/specs/2026-07-24-unified-ui-component-library-design.md` and `docs/desktop/UI_COMPONENT_LIBRARY.md`

## Global Constraints

- 每个组件必须先写失败测试，再实现最小行为，测试通过后才能勾选该组件。
- 组件行为文件不得包含 `<style>`、内联固定样式或 SVG 之外的业务 CSS；样式必须位于对应 `.css` 文件。
- 桌面端只使用 Stencil host、公开 CSS variables 和 `::part()`；禁止依赖 Shadow DOM 内部 class。
- 保留现有 `Ui*.vue` 导入路径、`v-model`、事件、slots、原生属性和已使用的 exposed methods。
- 选择器、日期面板、菜单等浮层必须挂载到 `body`，使用 `position: fixed`，处理边缘翻转、scroll/resize 重算、点击外部关闭、Esc、焦点和 reduced-motion。
- 迁移完成一项后立即更新本文件对应 checkbox、对比页状态和相关文档；不得把多项合并为一个未验证的大批次。
- 不修改媒体裁剪器、业务专用编辑器和第三方 vendored 代码；复杂业务组件只有在公共 API 已抽取后再迁移。

## Baseline

- [x] 首期基础组件已完成：Button、IconButton、Card、Field、Input、Textarea、Checkbox、Radio、Switch、Tabs、EmptyState、StateCard、Dialog。
- [x] 首期浮层的对比页目录状态已将 Dialog 更新为“已对齐”。
- [x] Select 已完成 Stencil 组件、body portal、Vue/桌面兼容适配和对比页接入；Menu、日期/时间选择器、Range、Transfer、Tree、File、Color、Scrollbar 等仍待迁移。

## Component Tasks

### Task 1: Select

**Files:**
- Create: `packages/ui-core/src/components/gt-select/gt-select.tsx`
- Create: `packages/ui-core/src/components/gt-select/gt-select.css`
- Create: `packages/ui-core/src/components/gt-select/gt-select.spec.tsx`
- Modify: `packages/ui-vue/src/generated/stencil-proxies.ts`
- Modify: `desktop/src/windows/main/components/ui/UiSelect.vue`
- Modify: `desktop/src/windows/main/pages/UiMigrationComparison.vue`
- Test: `packages/ui-core/src/components/gt-select/gt-select.spec.tsx`

- [x] Step 1: 写失败测试，覆盖选中值、placeholder、禁用项、键盘上下/Enter/Escape、点击外部、body portal、边缘翻转和 `gt-change` detail。
- [x] Step 2: 运行 `pnpm --dir packages/ui-core exec vitest run src/components/gt-select/gt-select.spec.tsx`，确认因组件不存在而失败。
- [x] Step 3: 实现 `gt-select` 的 trigger、listbox portal、ARIA、键盘导航、公开 parts/variables 和独立 CSS；复用 `OverlayPortal` 的定位/字体变量传播能力。
- [x] Step 4: 生成 Vue proxy，保留 `UiSelectOption`、`modelValue`、`options`、`size`、`placeholder`、`animation` 及 focus/blur/change 事件。
- [x] Step 5: 运行组件测试、`pnpm --dir packages/ui-core run build`、桌面 typecheck 和 renderer build；将对比页 Select 双栏加入并标记“已对齐”。

### Task 2: Menu、MenuItem、MenuDivider、Disclosure、PopupSurface

**Files:**
- Create: `packages/ui-core/src/components/gt-menu/gt-menu.tsx`, `gt-menu.css`
- Create: `packages/ui-core/src/components/gt-menu-item/gt-menu-item.tsx`, `gt-menu-item.css`
- Create: `packages/ui-core/src/components/gt-menu-divider/gt-menu-divider.tsx`, `gt-menu-divider.css`
- Create: `packages/ui-core/src/components/gt-disclosure/gt-disclosure.tsx`, `gt-disclosure.css`
- Modify: `desktop/src/windows/main/components/ui/UiMenu*.vue`, `UiDisclosure.vue`, `UiPopupSurface.vue`
- Test: corresponding Stencil specs and desktop compatibility tests

- [x] Step 1: 锁定 role/menuitem、disabled、submenu、keyboard roving focus、outside/Escape 和 slot 行为的失败测试。
- [x] Step 2: 实现 Stencil menu primitives 与独立 overlay CSS，禁止页面依赖内部 class。
- [x] Step 3: 替换 Vue adapters，保留现有菜单事件和 `UiPopupSurface` 兼容 props。
- [x] Step 4: 运行 targeted tests、ui-vue build、desktop typecheck/renderer build，完成后勾选本任务。

### Task 3: DatePicker、DateTimePicker、TimePicker

**Files:**
- Create: `packages/ui-core/src/components/gt-date-picker/`, `gt-date-time-picker/`, `gt-time-picker/`
- Modify: `desktop/src/windows/main/components/ui/UiDatePicker.vue`, `UiDateTimePicker.vue`, `UiTimePicker.vue`
- Test: component specs, date parsing/formatting and desktop compatibility tests

- [x] Step 1: 先覆盖日期边界、键盘导航、清除、禁用、时区无关格式化和 portal 翻转失败测试。
- [x] Step 2: 实现日历/时间面板及公开 parts/variables，复用 Select 的 portal positioning helper。
- [x] Step 3: 切换 Vue adapters，保持 `modelValue`、`clearable`、`min/max`、`format` 和现有事件。
- [x] Step 4: 完成 light/dark/自定义字体及背景验证后勾选本任务。

### Task 4: Range、SliderField

**Files:**
- Create: `packages/ui-core/src/components/gt-range/`, `gt-slider-field/`
- Modify: `desktop/src/windows/main/components/ui/UiRange.vue`, `UiSliderField.vue`
- Test: keyboard/pointer/value/step/formatting specs

- [x] Step 1: 添加滑块值范围、步长、Home/End/Arrow、垂直居中和 disabled 的失败测试。
- [x] Step 2: 实现原生 input[type=range] 与公开 track/fill/thumb parts 的 Stencil 组件。
- [ ] Step 3: 切换 adapters 并保留 `UiSliderField` 的 label/value slot 和 `v-model`。
- [ ] Step 4: 运行包测试和 renderer 构建后勾选本任务。

### Task 5: Scrollbar、PanelHeader、Toolbar、SettingRow、TagChip、Link

**Files:**
- Create: matching `packages/ui-core/src/components/gt-*.tsx/.css`
- Modify: `desktop/src/windows/main/components/ui/UiScrollbar.vue`, `UiPanelHeader.vue`, `UiToolbar.vue`, `UiSettingRow.vue`, `UiTagChip.vue`, `UiLink.vue`
- Test: geometry, slots, keyboard/focus and responsive layout specs

- [ ] Step 1: 锁定滚动区域尺寸、标题/副标题、工具栏 actions、设置行 label/control、chip/link states 的失败测试。
- [ ] Step 2: 实现独立 CSS 与 parts，不覆盖宿主背景，不引入额外全局滚动条样式。
- [ ] Step 3: 替换 Vue adapters，逐个运行 targeted tests 并勾选子项。
- [ ] Step 4: 完成 Settings、Terminal、FTP 页面构建回归后勾选本任务。

### Task 6: TransferBox、Tree、TreeNodeItem

**Files:**
- Create: matching Stencil components and CSS
- Modify: `desktop/src/windows/main/components/ui/UiTransferBox.vue`, `UiTree.vue`, `UiTreeNodeItem.vue`
- Test: selection, expansion, drag/drop or keyboard ordering, virtualization boundary tests

- [ ] Step 1: 添加层级选择、展开收起、批量移动、禁用节点和 ARIA tree semantics 的失败测试。
- [ ] Step 2: 实现受控 props/events 和公开 parts；保留大数据量下的最小 DOM 约束。
- [ ] Step 3: 替换 adapters，验证 Knowledge、Settings 页面并勾选本任务。

### Task 7: FileIcon、FileInput、SuggestInput、ColorPicker

**Files:**
- Create: matching Stencil components and CSS
- Modify: `desktop/src/windows/main/components/ui/UiFileIcon.vue`, `UiFileInput.vue`, `UiSuggestInput.vue`, `UiColorPicker.vue`
- Test: file selection contract, suggestion keyboard behavior, color parsing and accessibility specs

- [ ] Step 1: 覆盖 file input change/cancel、suggestion filter/Enter/Escape、color formats and alpha 的失败测试。
- [ ] Step 2: 实现组件与 CSS，文件选择仍通过现有 preload/host API，Stencil 不直接访问 Node/Electron。
- [ ] Step 3: 替换 adapters，运行 Settings/Plugins/FTP targeted tests 后勾选本任务。

### Task 8: PersonalizationConfig、复杂业务控件收尾

**Files:**
- Review: `desktop/src/windows/main/components/ui/UiPersonalizationConfig.vue`, `IconPicker.vue`, media cropper components
- Create/Modify: only after extracting a host-neutral public contract
- Test: explicit compatibility tests before any migration

- [ ] Step 1: 盘点宿主 API、文件系统/媒体依赖和现有 slots，确认哪些部分可抽成通用 Stencil primitives。
- [ ] Step 2: 对可迁移部分先写设计和失败测试；不可迁移部分保留 Legacy 并记录原因。
- [ ] Step 3: 完成可迁移项后更新组件库文档和排除清单，勾选本任务。

### Task 9: 对比页、状态清单和文档收尾

**Files:**
- Modify: `desktop/src/windows/main/pages/UiMigrationComparison.vue`
- Modify: `desktop/src/windows/main/pages/UiMigrationComparison.test.ts`
- Modify: `docs/desktop/UI_COMPONENT_LIBRARY.md`
- Modify: `docs/desktop/PLUGIN_SYSTEM_CAPABILITIES.md`
- Modify: this plan

- [x] Step 1: 对比页覆盖当前桌面 UI 组件全集；已迁移组件显示 Legacy/Stencil 双栏，未迁移组件明确标记 Legacy 保留并提供迁移占位。
- [ ] Step 2: 文档记录每个组件的 props/events/parts/variables、Vue/React/custom-element 用法和剩余 Legacy 排除项。
- [ ] Step 3: 运行全量验证矩阵：UI Core/Vue tests、desktop lint/typecheck/build、`git diff --check`。
- [ ] Step 4: 仅在所有组件任务已勾选且验证通过后勾选收尾任务。

## Verification Matrix

每项组件任务至少运行：

```powershell
pnpm --dir packages/ui-core exec vitest run <targeted-spec>
pnpm --dir packages/ui-core run build
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:renderer
git diff --check
```

最终运行：

```powershell
pnpm --dir packages/ui-core test
pnpm --dir packages/ui-vue exec vitest run
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
```

构建和测试不替代真实 Electron 截图；每项浮层组件仍需在开发对比页实际打开检查 portal、字体、动画、焦点和边缘定位。
