# GuYanTools 统一 UI 组件库设计

**状态：** 已确认，待实施

## 目标

将当前插件专用的 `@guyantools/plugin-ui` 扩展为主应用与插件共同使用的组件库。组件库必须让 Vue 主应用保留 idiomatic 的 `v-model`、slots、Teleport 和组合能力，同时让 Vue、React 及其他框架开发的插件使用稳定、无宿主依赖的 DOM 合同。

首期覆盖基础控件和布局反馈：Button、IconButton、Input、Textarea、Checkbox、Radio、Switch、Tabs、Card、Field、EmptyState、StateCard、Tooltip、Dialog、Drawer。

## 非目标

- 本期不迁移日期/时间选择器、菜单、树、文件输入、颜色选择器、Transfer、滚动条、图标选择器和媒体裁剪器。
- 本期不改变 Electron sandbox、preload、插件权限、运行时 IPC 或页面路由合同。
- 不把 Pinia、Vue Router、Electron、Node.js 或主应用业务逻辑发布给插件。
- 不移除现有 `Ui*` Vue 组件的公开 API；迁移期内保留兼容入口。

## 架构

```text
                 @guyantools/ui-core
       tokens + Custom Elements + DOM event contracts
                       |
          +------------+------------+
          |                         |
@guyantools/ui-vue          @guyantools/plugin-ui
Vue adapters for desktop    plugin compatibility facade
          |                         |
  desktop main window       Vue / React / other plugin UIs
```

### `@guyantools/ui-core`

这是唯一的视觉、交互和无障碍行为来源。包只依赖标准 DOM、Custom Elements、CustomEvent 与 CSS Custom Properties，输出：

- `tokens.css`：规范化的 `--gt-*` token。
- `registerGuYanElements()`：幂等注册所有 `gt-*` 元素。
- 基础元素及其属性、方法和 `gt-*` 事件类型。
- 可供 Vue/React 使用的 TypeScript DOM 类型；不输出 Vue 组件、Pinia、Router 或 Electron import。

每个元素都使用 Shadow DOM，继承 `--gt-*` token。所有可交互控件必须具备原生语义、键盘操作、禁用态和 `:focus-visible` 焦点环。

### `@guyantools/ui-vue`

这是主应用专用的 Vue 3 适配包，依赖 `@guyantools/ui-core`。它将当前 `Ui*` API 映射到 core 元素，不重复维护一套颜色、尺寸或交互状态：

- 输入类适配 `v-model` 到 core 的 value/property 与 `gt-input`、`gt-change` 事件。
- slot 型组件保留现有的 prefix、suffix、header、footer、actions 等 Vue slots。
- Dialog、Drawer、Tooltip 使用 Vue `Teleport` 与 composable 管理生命周期、焦点恢复、Esc、点击外部和 viewport 重算；可视层仍只消费 core token 与公共状态语义。
- `UiButton`、`UiInput` 等现有路径改为从此包 re-export 或 thin wrapper，使主应用页面可以按组件逐批迁移，调用点不必一次性重写。

### `@guyantools/plugin-ui`

该包保留为插件兼容包，改为转发 `@guyantools/ui-core` 的元素、token、Vue 注册函数和 React JSX 类型。现有插件继续使用 `@guyantools/plugin-ui`，新插件也可直接使用 `@guyantools/ui-core`。它不依赖 `@guyantools/ui-vue`。

## Token 策略

`--gt-*` 是新组件库唯一的公开 token 命名空间。它覆盖颜色、文字、边框、surface、控件高度、间距、圆角、阴影、focus ring、motion 与 z-index。

主应用主题仍维护 light/dark 两组值，但由 `theme.scss` 写入 `--gt-*`。迁移期保留 `--ui-* -> --gt-*` 的别名映射，保证未迁移页面视觉不回退。新 core 元素与新 Vue adapter 禁止新增 `--ui-*` 依赖。删除旧 token 只能在所有首期调用点完成迁移、视觉回归通过后单独执行。

## 首期组件合同

| Core 元素 | Vue 适配组件 | 关键合同 |
| --- | --- | --- |
| `gt-button` | `UiButton` | `variant`、`size`、`disabled`、`active`、`block`；`gt-click` |
| `gt-icon-button` | `UiIconButton` | `variant`、`size`、`shape`、`label`、`aria-label`；固定图标尺寸 |
| `gt-input` | `UiInput` | `value`、input type、prefix/suffix、number stepper；`gt-input`、`gt-change` |
| `gt-textarea` | `UiTextarea` | `value`、rows、resize、maxlength；`gt-input`、`gt-change` |
| `gt-checkbox` | `UiCheckbox` | `checked`、`indeterminate`、label；`gt-change` |
| `gt-radio` | `UiRadio` | `checked`、`value`、name、label；`gt-change` |
| `gt-switch` | `UiSwitch` | `checked`、`disabled`、`aria-label`；`gt-change` |
| `gt-tabs` | `UiTabs` | `value`、items、line/segmented、disabled item；`gt-change` |
| `gt-card` | `UiCard` | variant、padding、radius、hoverable |
| `gt-field` | `UiField` | label、hint、error、required、horizontal/vertical layout |
| `gt-empty-state` | `UiEmptyState` | icon slot、title、description、actions slot |
| `gt-state-card` | `UiStateCard` | loading/empty/error/info、icon/actions slots |
| `gt-tooltip` | `UiTooltip` | content、placement、delay、disabled；body-level overlay |
| `gt-dialog` | `UiDialog` | open、modal、closeOnMask、closeOnEsc；header/footer slots |
| `gt-drawer` | `UiDrawer` | open、left/right、width、overlay、closeOnMask、closeOnEsc |

Core 属性采用 DOM 语义和 kebab-case attribute 映射；Vue adapter 保留当前 camelCase props 与 `update:modelValue`。事件 detail 只传递稳定业务值，不暴露 Vue event emitter 或宿主对象。

## 浮层与无障碍

Tooltip、Dialog、Drawer 采用统一 overlay primitive：渲染到 `body`、固定定位、由触发器 `getBoundingClientRect()` 计算位置、在 scroll/resize 时重算、空间不足时翻转，并在关闭时清理订阅。Dialog/Drawer 需要：

- `role="dialog"` 或等效语义、`aria-modal`、关联 label。
- 初始焦点、Tab focus trap、Esc 关闭、关闭后的触发器焦点恢复。
- 当 `persistent` 或 `closeOnMask=false` 时拒绝 backdrop 关闭但保留显式关闭路径。

Core 负责 DOM 级的最小行为；Vue adapter 负责主应用的 Teleport、生命周期和复杂 slot 内容。插件可直接使用 core overlay，不获得任何宿主级权限。

## 迁移策略

1. 创建 `ui-core` 与 `ui-vue` workspace 包，先导出 token 和不影响现有消费方的 core 组件。
2. 将现有 `plugin-ui` 改为兼容 facade，先保证旧插件的四个组件和构建不变。
3. 按风险从低到高迁移主应用：视觉容器与反馈组件，再迁移基础输入，最后迁移 Tabs 和 overlays。
4. 每迁移一个组件，保留同名 `desktop/src/windows/main/components/ui/Ui*.vue` 的薄入口，减少页面级大面积 diff。
5. 使用静态扫描确保新主应用代码不再直接引用旧 token 或复制相同控件样式；未列入首期的复杂组件保持原状。

## 验收与测试

- `ui-core`：在 jsdom 下验证注册幂等、属性/属性值反射、键盘与鼠标事件、禁用态、ARIA 状态、token 存在和 dark/light 选择器。
- `ui-vue`：在 Vue 测试环境下验证 `v-model`、slots、事件转发、Teleport、焦点恢复、Esc/backdrop 关闭和卸载清理。
- `plugin-ui`：验证所有旧导入路径、Vue 注册函数、React JSX 类型和现有插件 fixture 构建仍然可用。
- `desktop`：对迁移组件运行目标页面测试、renderer typecheck、app build；使用可重复的截图或 DOM 审查验证 light/dark 两种主题。
- 全仓：运行 `pnpm run verify:plugin-framework`、`pnpm --dir desktop run typecheck`、`pnpm --dir desktop run lint`、`pnpm --dir desktop run build:app` 和 `git diff --check`。

## 兼容与发布

- `@guyantools/ui-core`、`@guyantools/ui-vue` 和 `@guyantools/plugin-ui` 独立版本化，但首期同时以 `1.0.0` 发布。
- 现有 `@guyantools/plugin-ui` export path（`.`, `./tokens.css`, `./vue`, `./react`）不得移除。
- 破坏性属性或事件修改只允许通过新的 major 版本或新增元素完成；禁止静默改变已发布插件的事件 detail。
