# GuYanTools 统一 UI 组件库设计

**状态：** 已确认，采用 Stencil Shadow DOM 与样式契约实施

## 目标

将当前插件专用的 `@guyantools/plugin-ui` 扩展为主应用与插件共同使用的组件库。组件库必须让 Vue 主应用保留 idiomatic 的 `v-model`、slots 和组合能力，同时让 Vue、React 及其他框架开发的插件使用稳定、无宿主依赖的 DOM 合同。所有首期视觉控件最终必须由 Stencil 构建；组件的固定样式不得写入 TSX/TypeScript 文件。

首期覆盖基础控件和布局反馈：Button、IconButton、Input、Textarea、Checkbox、Radio、Switch、Tabs、Card、Field、EmptyState、StateCard、Tooltip、Dialog、Drawer。

## 非目标

- 本期不迁移日期/时间选择器、菜单、树、文件输入、颜色选择器、Transfer、滚动条、图标选择器和媒体裁剪器。
- 本期不改变 Electron sandbox、preload、插件权限、运行时 IPC 或页面路由合同。
- 不把 Pinia、Vue Router、Electron、Node.js 或主应用业务逻辑发布给插件。
- 不移除现有 `Ui*` Vue 组件的公开 API；迁移期内保留兼容入口。
- 不以 `shadow: false` 或继续依赖 `.ui-*` 内部选择器换取短期兼容；样式覆写必须通过公开 CSS Custom Properties 与 `part` 完成。

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
- `@stencil/vue-output-target` 生成的 Vue proxy，供 `@guyantools/ui-vue` 使用；`@stencil/react-output-target` 生成的 React proxy 进入 `@guyantools/plugin-ui` 的 `./react` 入口发布。core 本身不携带 React 运行时依赖。

每个元素使用 Shadow DOM，继承 `--gt-*` token。所有可交互控件必须具备原生语义、键盘操作、禁用态和 `:focus-visible` 焦点环。Stencil 组件不访问宿主 preload、IPC 或插件 runtime。

组件以 `@Component({ tag: 'gt-*', shadow: true, styleUrl: 'gt-*.css' })` 声明。公开状态通过强类型 `@Prop()` 表示：可被标记为 `reflect: true` 的原始值必须反射为 kebab-case HTML 属性；对象和数组仅作为 JavaScript property 传递。用户交互统一以 `@Event({ eventName: 'gt-*', bubbles: true, composed: true })` 派发稳定、可序列化的 `detail`，不得泄漏内部节点、Vue event emitter 或宿主对象。Input、Textarea 通过宿主元素兼容委托保留 `focus()` 与 `select()`：`focus` 是标准 `HTMLElement` 方法，不能声明为 Stencil `@Method()`，委托必须定位到内部原生控件。

### 样式文件边界

样式按 CSS 文件拆分并由 Stencil 打包，而不是在组件 TSX 中通过 `<style>`、模板字符串、`innerHTML` 或 style object 注入。目录约定如下：

```text
packages/ui-core/src/
  styles/
    tokens.css                 # --gt-* 全局 token 与主题入口
    themes/light.css
    themes/dark.css
    overlay-layer.css          # body portal layer 的独立样式
  components/gt-button/
    gt-button.tsx              # 结构、props、events only
    gt-button.css              # Shadow DOM 组件样式
    gt-button.contract.ts      # props、events、parts、CSS variable 类型/文档
```

`globalStyle` 只引入 token 与主题入口；每个 `gt-*` 通过 `styleUrl` 引入自己的 CSS。共享视觉值只允许来自 `--gt-*` variables，不能复制为 TSX 字符串。CI 增加静态检查：`src/components/**/*.tsx` 与 overlay controller 不得包含 `<style>`、CSS 选择器、固定颜色、间距、阴影或 `innerHTML` 样式字符串。

### 样式契约

每个组件同时发布三类稳定契约：语义 props/events、可覆写的 component variables 和 `part` 名称。全局 token 只定义颜色、字体、间距、半径、阴影、motion 和层级；组件变量定义可被局部页面覆写的视觉值，例如 `--gt-button-background`、`--gt-icon-button-size`、`--gt-card-shadow`、`--gt-input-border-color`、`--gt-dialog-width`。组件内部节点必须标记稳定 `part`，首期至少包含：

| 组件 | 必需 `part` |
| --- | --- |
| Button / IconButton | `base`、`icon`、`label` |
| Input / Textarea | `base`、`control`、`prefix`、`suffix`、`stepper` |
| Card / Field / StateCard | `base`、`header`、`body`、`footer`、`label`、`hint`、`error` |
| Tabs | `base`、`tab`、`indicator` |
| Dialog / Drawer / Tooltip | `layer`、`mask`、`panel`、`header`、`body`、`footer` |

桌面页面只允许定位 `gt-*` host、设置 `--gt-*` component variables 或使用 `::part()`；禁止新增 `.ui-*`、`:deep(.ui-*)` 或依赖未公开内部 class 的规则。

### `@guyantools/ui-vue`

这是 Vue 3 适配包，依赖 `@guyantools/ui-core` 和由 Stencil 生成的 Vue proxies。它不是第二套组件实现，而是将当前 `Ui*` API 映射到 Stencil 元素的兼容边界：

- 生成 proxy 负责 Custom Element 注册、属性传递、事件类型和 Vue renderer 互操作；手写薄 wrapper 只处理既有 `v-model`、`update:modelValue`、legacy expose method 和兼容类型。
- 输入类适配 `v-model` 到 core 的 value/property 与 `gt-input`、`gt-change` 事件。
- slot 型组件保留现有的 prefix、suffix、header、footer、actions 等 Vue slots。
- Dialog、Drawer、Tooltip 的 body portal、键盘、ARIA、焦点 trap 与清理由 Stencil core 负责；Vue wrapper 禁止再创建 Teleport。wrapper 使用 `inheritAttrs: false`，显式把 `class`、`style`、ARIA attributes 和 listeners 转发到 `gt-*` host，避免 Teleport-root attribute warning。
- `UiButton`、`UiInput` 等现有路径改为从此包 re-export 或 thin wrapper，使主应用页面可以按组件逐批迁移，调用点不必一次性重写。

### `@guyantools/plugin-ui`

该包保留为插件兼容包，转发 Stencil core 的 loader、Custom Elements、token、Vue 注册函数和由 Stencil 生成的 React 适配入口。现有插件继续使用 `@guyantools/plugin-ui`，新插件也可直接使用 `@guyantools/ui-core` 的 Custom Element 入口。它不依赖 `@guyantools/ui-vue`，也不会把桌面专属兼容 wrapper 发布给第三方插件。

## Token 策略

`--gt-*` 是新组件库唯一的公开 token 命名空间。它覆盖颜色、文字、边框、surface、控件高度、间距、圆角、阴影、focus ring、motion 与 z-index。

主应用主题仍维护 light/dark 两组值，但由 `theme.scss` 写入 `--gt-*`。迁移期保留 `--ui-* -> --gt-*` 的别名映射，保证未迁移页面视觉不回退。新 core 元素与新 Vue adapter 禁止新增 `--ui-*` 依赖。删除旧 token 只能在所有首期调用点完成迁移、视觉回归通过后单独执行。

body portal 不从 host 自动继承局部 CSS variables。overlay layer 在打开时读取 host 的已注册全局与 component `--gt-*` values，并复制到 portal host；同时订阅 theme/class/style 变化，在关闭时取消订阅。这样个性化主题、局部 Dialog 宽度和颜色覆写在 portal 后仍然一致。

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

Tooltip、Dialog、Drawer 采用由 Stencil 实现的私有 overlay layer：渲染到 `body`、固定定位、由触发器 `getBoundingClientRect()` 计算位置、在 scroll/resize 时重算、空间不足时翻转，并在关闭时清理订阅。layer 使用独立 `overlay-layer.css`，不得通过 `innerHTML` 注入样式。Dialog/Drawer 需要：

- `role="dialog"` 或等效语义、`aria-modal`、关联 label。
- 初始焦点、Tab focus trap、Esc 关闭、关闭后的触发器焦点恢复。
- 当 `persistent` 或 `closeOnMask=false` 时拒绝 backdrop 关闭但保留显式关闭路径。

Stencil core 负责 DOM 级 overlay、无障碍和清理；Vue adapter 只负责值与事件映射。插件可直接使用 core overlay，不获得任何宿主级权限。

## 迁移策略

1. 将已开始的手写 `ui-core` 实现迁移为 Stencil workspace：token 继续作为公开 CSS，组件与事件合同改由 `@Component`、`@Prop`、`@Event` 声明。
2. 用 Stencil Vue/React output target 生成框架适配产物；`ui-vue` 仅在 Vue proxy 外保留小型 legacy wrapper，避免主应用一次性改写 `v-model`、slots、`UiTabItem` 和 expose methods。
3. 将现有 `plugin-ui` 改为 Stencil core 兼容 facade，保证现有组件、四个 export path 和构建不变。
4. 先将现有 15 个 Stencil 组件的内联样式全部拆到独立 CSS 文件，并实现 `part`、component variables 和 overlay portal style bridge；在此之前禁止桌面端直接替换组件。
5. 对当前约 534 处 `.ui-*` / `:deep(.ui-*)` 选择器建立清单。按 Button/IconButton/Card/Field、输入与选择、Tabs、overlay 的顺序，把每一处改为 host variable 或 `::part()`；每批通过浅色、深色和个性化背景的视觉回归后，才把对应 `desktop/.../Ui*.vue` 改为 generated proxy wrapper。
6. 每批迁移保留同名 `Ui*` 路径和公开 API，完成该批全部页面覆写后再删除其 legacy DOM/CSS；未列入首期的复杂组件保持原状。

## 验收与测试

- `ui-core`：用 `@stencil/vitest` 验证生成组件的注册、属性/属性值反射、键盘与鼠标事件、禁用态、ARIA 状态、token 存在和 dark/light 选择器；构建后验证 `dist/custom-elements`、loader、Vue/React 适配产物和类型输出。
- `ui-vue`：在 Vue 测试环境下验证 Stencil proxy 注册、legacy `v-model`、slots、事件与 attributes 转发，以及 Stencil overlay 的 Esc/backdrop 关闭和卸载清理。
- `plugin-ui`：验证所有旧导入路径、Vue 注册函数、React JSX 类型和现有插件 fixture 构建仍然可用。
- `desktop`：每一批运行目标页面测试、renderer typecheck、app build；使用可重复截图验证 light/dark、个性化背景和 hover/focus 状态。测试必须断言无 Vue extraneous attributes warning、无未公开 `.ui-*` selector，并验证 `::part()` 与 component variables 的覆盖结果。
- 全仓：运行 `pnpm run verify:plugin-framework`、`pnpm --dir desktop run typecheck`、`pnpm --dir desktop run lint`、`pnpm --dir desktop run build:app` 和 `git diff --check`。

## 兼容与发布

- `@guyantools/ui-core`、`@guyantools/ui-vue` 和 `@guyantools/plugin-ui` 独立版本化，但首期同时以 `1.0.0` 发布。Stencil 的 compiler、loader 和 generated proxy 均为 `ui-core` 的实现细节，不成为插件的宿主能力。
- 现有 `@guyantools/plugin-ui` export path（`.`, `./tokens.css`, `./vue`, `./react`）不得移除。
- 破坏性属性或事件修改只允许通过新的 major 版本或新增元素完成；禁止静默改变已发布插件的事件 detail。
