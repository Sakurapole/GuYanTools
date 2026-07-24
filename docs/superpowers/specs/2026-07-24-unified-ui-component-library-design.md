# GuYanTools 统一 UI 组件库设计

**状态：** 已确认，改用 Stencil 实施

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
        Stencil source + Custom Elements + DOM contracts
                       |
          +------------+------------+
          |                         |
@guyantools/ui-vue          @guyantools/plugin-ui
generated Vue proxies +      plugin compatibility facade
legacy Vue adapters          (core / Vue / React entrypoints)
          |                         |
  desktop main window       Vue / React / other plugin UIs
```

### `@guyantools/ui-core`

这是唯一的视觉、交互和无障碍行为来源，使用 Stencil 编译。组件源码只依赖标准 DOM、Custom Elements、CustomEvent 与 CSS Custom Properties；不引入 Electron、Node.js、Pinia、Router 或业务 API。Stencil 输出：

- `tokens.css`：规范化的 `--gt-*` token。
- `dist/custom-elements/`：按需注册的 `gt-*` Stencil Custom Elements 与 TypeScript DOM 类型。
- `dist/loader/` 与 `defineCustomElements()`：插件可显式、幂等地注册完整组件集。
- 组件 metadata、属性、方法、`gt-*` 事件类型和 Stencil 自动生成的自定义元素声明。
- `@stencil/vue-output-target` 与 `@stencil/react-output-target` 生成的适配产物；Vue 产物供 `@guyantools/ui-vue` 使用，React 产物作为 core 的 `./react` 入口发布。

每个元素使用 Shadow DOM（确有 light DOM slot 互操作要求时明确标记例外），继承 `--gt-*` token。所有可交互控件必须具备原生语义、键盘操作、禁用态和 `:focus-visible` 焦点环。Stencil 组件不访问宿主 preload、IPC 或插件 runtime。

组件以 `@Component({ tag: 'gt-*', shadow: true })` 声明。公开状态通过强类型 `@Prop()` 表示：可被标记为 `reflect: true` 的原始值必须反射为 kebab-case HTML 属性；对象和数组仅作为 JavaScript property 传递。用户交互统一以 `@Event({ eventName: 'gt-*', bubbles: true, composed: true })` 派发稳定、可序列化的 `detail`，不得泄漏内部节点、Vue event emitter 或宿主对象。仅 Input、Textarea 暴露异步的 `@Method() focus()` 与 `select()`，用于保留现有 Vue expose 合同。

### `@guyantools/ui-vue`

这是主应用专用的 Vue 3 适配包，依赖 `@guyantools/ui-core` 和由 Stencil 生成的 Vue proxies。它不是第二套组件实现，而是将当前 `Ui*` API 映射到 Stencil 元素的兼容边界：

- 生成 proxy 负责 Custom Element 注册、属性传递、事件类型和 Vue renderer 互操作；手写薄 wrapper 只处理既有 `v-model`、`update:modelValue`、legacy expose method 和兼容类型。
- 输入类适配 `v-model` 到 core 的 value/property 与 `gt-input`、`gt-change` 事件。
- slot 型组件保留现有的 prefix、suffix、header、footer、actions 等 Vue slots。
- Dialog、Drawer、Tooltip 的宿主通过 Vue `Teleport` 置于 `body`；Stencil core 负责公共 overlay DOM、键盘和 ARIA，Vue composable 只管理 Vue 生命周期、焦点恢复与 `update:modelValue` 映射。
- `UiButton`、`UiInput` 等现有路径改为从此包 re-export 或 thin wrapper，使主应用页面可以按组件逐批迁移，调用点不必一次性重写。

### `@guyantools/plugin-ui`

该包保留为插件兼容包，转发 Stencil core 的 loader、Custom Elements、token、Vue 注册函数和 React 适配入口。现有插件继续使用 `@guyantools/plugin-ui`，新插件也可直接使用 `@guyantools/ui-core`。它不依赖 `@guyantools/ui-vue`，也不会把桌面专属兼容 wrapper 发布给第三方插件。

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

Stencil `@Prop()`/`@Event()` 采用 DOM 语义和 kebab-case attribute 映射；Vue adapter 保留当前 camelCase props 与 `update:modelValue`。事件 detail 只传递稳定业务值，不暴露 Vue event emitter 或宿主对象。

## 浮层与无障碍

Tooltip、Dialog、Drawer 采用统一 overlay primitive：渲染到 `body`、固定定位、由触发器 `getBoundingClientRect()` 计算位置、在 scroll/resize 时重算、空间不足时翻转，并在关闭时清理订阅。Dialog/Drawer 需要：

- `role="dialog"` 或等效语义、`aria-modal`、关联 label。
- 初始焦点、Tab focus trap、Esc 关闭、关闭后的触发器焦点恢复。
- 当 `persistent` 或 `closeOnMask=false` 时拒绝 backdrop 关闭但保留显式关闭路径。

Stencil core 负责 DOM 级 overlay、无障碍和清理；Vue adapter 负责主应用的 Teleport、生命周期和复杂 slot 内容。插件可直接使用 core overlay，不获得任何宿主级权限。

## 迁移策略

1. 将已开始的手写 `ui-core` 实现迁移为 Stencil workspace：token 继续作为公开 CSS，组件与事件合同改由 `@Component`、`@Prop`、`@Event` 声明。
2. 用 Stencil Vue/React output target 生成框架适配产物；`ui-vue` 仅在 Vue proxy 外保留小型 legacy wrapper，避免主应用一次性改写 `v-model`、slots、`UiTabItem` 和 expose methods。
3. 将现有 `plugin-ui` 改为 Stencil core 兼容 facade，保证现有组件、四个 export path 和构建不变。
4. 按风险从低到高迁移主应用：视觉容器与反馈组件，再迁移基础输入，最后迁移 Tabs 和 overlays；每个组件保留同名 `desktop/src/windows/main/components/ui/Ui*.vue` 薄入口。
5. 使用静态扫描确保新主应用代码不再直接引用旧 token 或复制相同控件样式；未列入首期的复杂组件保持原状。

## 验收与测试

- `ui-core`：用 `stencil test --spec` 验证生成组件的注册、属性/属性值反射、键盘与鼠标事件、禁用态、ARIA 状态、token 存在和 dark/light 选择器；构建后验证 `dist/custom-elements`、loader、Vue/React 适配产物和类型输出。
- `ui-vue`：在 Vue 测试环境下验证 Stencil proxy 注册、legacy `v-model`、slots、事件转发、Teleport、焦点恢复、Esc/backdrop 关闭和卸载清理。
- `plugin-ui`：验证所有旧导入路径、Vue 注册函数、React JSX 类型和现有插件 fixture 构建仍然可用。
- `desktop`：对迁移组件运行目标页面测试、renderer typecheck、app build；使用可重复的截图或 DOM 审查验证 light/dark 两种主题。
- 全仓：运行 `pnpm run verify:plugin-framework`、`pnpm --dir desktop run typecheck`、`pnpm --dir desktop run lint`、`pnpm --dir desktop run build:app` 和 `git diff --check`。

## 兼容与发布

- `@guyantools/ui-core`、`@guyantools/ui-vue` 和 `@guyantools/plugin-ui` 独立版本化，但首期同时以 `1.0.0` 发布。Stencil 的 compiler、loader 和 generated proxy 均为 `ui-core` 的实现细节，不成为插件的宿主能力。
- 现有 `@guyantools/plugin-ui` export path（`.`, `./tokens.css`, `./vue`, `./react`）不得移除。
- 破坏性属性或事件修改只允许通过新的 major 版本或新增元素完成；禁止静默改变已发布插件的事件 detail。
