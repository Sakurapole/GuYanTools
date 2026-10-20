---
name: GuYanTools
description: 一个冷静、可扩展的桌面工作台，整合工具、终端、文件、知识库、Todo、AI 和插件。
colors:
  primary-cyan: "#66CCFF"
  action-hover-sky: "#8ad9ff"
  action-ink: "#1e465a"
  light-bg: "#f7fbff"
  light-surface: "#ffffff"
  light-surface-muted: "#f7fafe"
  light-ink: "#1e465ae6"
  light-input: "#ffffffeb"
  light-secondary-button: "#f4f8fc"
  dark-bg: "#101821"
  dark-surface: "#182532"
  dark-surface-muted: "#14202b"
  dark-ink: "#dcf0ffeb"
  dark-input: "#14232deb"
  dark-secondary-button: "#1b2a36"
  inverse-light: "#ffffff"
  inverse-dark: "#f5fbff"
  danger-light: "#dc2626"
  danger-dark: "#ff9c9c"
  success-light: "#059669"
  success-dark: "#34d399"
  warning-light: "#b45309"
  warning-dark: "#fbbf24"
typography:
  display:
    fontFamily: "Geist Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  headline:
    fontFamily: "Geist Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0"
  title:
    fontFamily: "Geist Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "Geist Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Geist Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
rounded:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "24px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary-light:
    backgroundColor: "{colors.primary-cyan}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "42px"
  button-primary-dark:
    backgroundColor: "{colors.primary-cyan}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "42px"
  button-secondary-light:
    backgroundColor: "{colors.light-secondary-button}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "42px"
  button-secondary-dark:
    backgroundColor: "{colors.dark-secondary-button}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "42px"
  input-light:
    backgroundColor: "{colors.light-input}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
    height: "42px"
  input-dark:
    backgroundColor: "{colors.dark-input}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
    height: "42px"
  card-light:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: GuYanTools

## 1. Overview / 概览

**Creative North Star: “Lucid Workbench / 清透工作台”**

本文件描述当前桌面主窗口与共享 `gt-*` 控件的视觉语言；不把移动端 Flutter 布局当作同一套像素规范。GuYanTools 是面向重复工作的桌面工作台，视觉设计服务任务流、状态表达和长期使用。主窗口使用 `foundation.scss` 的结构 token、`theme.scss` 的明暗主题语义 token，以及 `desktop/src/windows/main/components/ui/` 的兼容入口；多数基础控件由 `@guyantools/ui-core` 的 Stencil Custom Elements 实现，经 `@guyantools/ui-vue` 包装给 Vue 使用。

整体气质应当清晰、冷静、像仪器一样可靠。界面可以有轻微的透光感和层级深度，但不能牺牲终端、文件传输、Todo、知识库、AI 对话和插件配置这些高密度任务的可信度。工作流需要密度时可以密集；装饰不能替代层级。

本系统明确拒绝 SaaS hero 套路、泛 AI 紫色渐变、随意私有 token、一次性控件和为了“高级感”而增加的装饰。新增 UI 应先继承现有组件语言，再考虑新的视觉结构。

**Key Characteristics / 关键特征：**
- 青蓝色重点色只用于主操作、选中、焦点和激活状态。
- 明暗主题通过语义 token 支撑，而不是页面私有色板。
- 产品界面使用紧凑的 rem 字号阶梯；用户可在设置中改变基础字号和字体族。
- 面板以色调层级、克制边框和可预期的 hover/focus 状态建立结构。
- 菜单、选择器、日期时间面板等浮层应通过 body 级 fixed 定位避免被裁切。

## 2. Colors / 颜色

调色板是克制的产品型配色：冷静表面、蓝色倾向的文字，以及青蓝色状态强调。前言里的 8 位十六进制色值保留了 CSS `rgba()` 的透明度；渲染结果仍取决于下层表面。

### Primary

- **Lucid Cyan / 清透青蓝**（`--primary-color`）：用于激活指示、tabs、复选/单选选中、hover tint 和焦点相关强调。
- **Action Cyan / 主操作青蓝**（`--gt-color-primary-action` → `--ui-button-primary-bg`）：明暗主题的主按钮都以 `primary-cyan` 为填充，hover 向 `action-hover-sky` 提亮。小字使用不透明的 `action-ink`，以保留品牌色并满足文字对比度。

### Neutral

- **Light Workspace / 浅色工作台底色**（`--background-color`）：浅色主题应用底色。
- **Light Panel / 浅色面板**（`--ui-surface-panel`）：默认卡片和弹窗表面；输入框另用半透明 `--ui-input-bg`。
- **Light Ink / 浅色主文字**（`--ui-text-primary`）：在浅色表面上使用带透明度的深蓝文字。
- **Dark Workspace / 深色工作台底色**（`--background-color`）：深色主题应用底色；共享控件的独立 `--gt-color-background` 比它略浅。
- **Dark Panel / 深色面板**（`--ui-surface-panel`）：默认卡片和弹窗表面；`--ui-surface-panel-muted` 使用更深的底色。
- **Dark Ink / 深色主文字**（`--ui-text-primary`）：在深色表面上使用带透明度的浅蓝文字。

### Tertiary

- **Danger Red / 危险红**（`--ui-state-error`）：用于破坏性操作、校验错误和失败状态；明暗值分别见前言。
- **Success Green / 成功绿**（`--ui-state-success`）：用于完成、成功和健康状态。
- **Warning Amber / 警告琥珀**（`--ui-state-warning`）：用于警告、冲突和可恢复风险。

### Named Rules

**The Semantic Token Rule / 语义 Token 规则。** 功能页面必须用 `--ui-*` token 表达文字、表面、边框、状态色、焦点环和控件。除迁移桥接外，不新增页面局部 `--color-*` 体系。

**The Accent Rarity Rule / 重点色稀缺规则。** 青蓝色只用于状态和操作。不要把主重点色当作页面装饰或非激活 chrome 使用。

## 3. Typography / 字体

**Display / Body Font:** 默认 `Geist Variable`，回退到系统 sans；用户选择的本地字体通过 `--app-font-family` 覆盖默认栈。
**Code / Mono Font:** 默认等宽栈为 `ui-monospace`、`Cascadia Mono`、Consolas；代码字体也可在设置中独立选择。

**Character / 气质：** 字体系统应紧凑、产品化、精确可读。它不承担杂志式或戏剧化表达。

### Hierarchy

- **Display**（`--ui-font-size-display-md`）：用于少量主要页面标题；较紧凑标题可用 `--ui-font-size-display-sm`。
- **Headline**（`--ui-font-size-xl`）：用于区块标题和紧凑面板标题。
- **Title**（`--ui-font-size-lg`）：用于组件标题、弹窗标题和当前工具名。
- **Body**（`--ui-font-size-md`）：用于标准产品说明、设置描述和正文。
- **Label**（`--ui-font-size-xs` / `--ui-font-size-sm`）：用于元信息、工具栏文字和辅助说明。各角色的字重按具体组件决定，不把前言的代表值视为全局强制样式。

### Named Rules

**The Relative Scale Rule / 相对字号规则。** 产品 UI 使用 `--ui-font-size-*` 的 rem 阶梯，不在业务页面硬编码另一套字号；运行时根字号由 `appearance.baseFontSize` 设置，默认 16px。应用面板、侧栏、表单、表格和工具栏不要使用营销式 `clamp()` 标题。

**The No Display Label Rule / 标签不使用展示字体规则。** 按钮、标签、输入框、tabs 和数据类文本永远不使用 display 字体。

## 4. Elevation / 层级

GuYanTools 使用色调层级、克制边框和环境阴影的混合体系。卡片和面板可以有适度阴影，但每个阴影都必须支持层级、交互或浮层关系。弹出菜单、对话框和选择器可以使用更强阴影，因为它们确实位于任务表面之上。

### Shadow Vocabulary

- **Panel Low**（`--ui-shadow-sm`, `0 6px 14px rgba(0,0,0,0.08)`）：小型浮起控件和轻微 hover 反馈。
- **Panel Medium**（`--ui-shadow-md`, `0 10px 24px rgba(0,0,0,0.12)`）：卡片、面板和默认 elevated surface。
- **Panel High**（`--ui-shadow-lg`, `0 14px 30px rgba(0,0,0,0.16)`）：hover elevation 和较大的浮层。
- **Popover**（`--ui-shadow-popover`，浅色主题映射到 `--ui-shadow-lg`；深色主题也映射到该基础阴影）：菜单、选择器、日期面板和 body 级浮层。具体 `gt-*` 浮层还会使用自己的主题化阴影。

### Named Rules

**The One Elevation Reason Rule / 层级必须有理由规则。** 每个阴影都必须表达层级、可 hover、拖拽态或浮层。纯装饰阴影应删除。

**The Quiet Surface Rule / 克制表面规则。** 当前 `gt-card` 默认可同时使用细边框与轻阴影；两者只能共同表达容器边界和层级，不要叠加更粗的彩色描边或更大的装饰性投影。

## 5. Components / 组件

### Buttons

- **实现与形状：** 桌面 `UiButton` 是 `@guyantools/ui-vue` 到 `gt-button` 的兼容入口。`gt-button` 默认 `secondary`、`md`，使用 `--ui-radius-sm`；默认高 `--ui-control-height-md`，左右内边距为 `--ui-control-padding-x-lg`，内层按钮没有额外内边距。小号和大号使用 `--ui-control-height-sm/lg`。
- **Primary / 主按钮：** `--ui-button-primary-bg` 使用 `#66CCFF`，`--ui-button-primary-text` 使用深蓝文字，搭配同色系细边框和小范围操作阴影；hover 使用浅天蓝填充。
- **Hover / Focus：** hover 可换主题化填充并上移 1px，active 回到原位；仅键盘 `focus-visible` 显示 `--ui-focus-ring`，disabled 降低不透明度并停止上移动效。
- **Secondary / Ghost / Danger：** secondary 使用主题化中性填充；ghost 在 hover/active 前透明；danger 使用 `--ui-button-danger-*`，不得拿主蓝色表示破坏性操作。
- **文字对比度：** 默认 `#66CCFF` 与深蓝文字约为 5.60:1，hover 浅天蓝与深蓝文字约为 6.47:1；明暗主题均采用这组配色。新增主按钮变体仍需按实际前景、背景重新测量，普通文字至少达到 4.5:1。

### Cards / Containers

- **Corner Style / 圆角：** 默认中等圆角（`--ui-radius-md`, 14px），大面板可使用 `--ui-radius-lg`（18px）。
- **Background / 背景：** 使用 `--ui-card-bg`、`--ui-surface-bg` 或 `--ui-surface-bg-muted`。
- **Shadow Strategy / 阴影策略：** `gt-card` 默认使用 `--ui-card-shadow`，hoverable/interactive 在 hover 时改用 `--ui-card-shadow-hover` 并上移 1px。
- **Border / 边框：** Vue 包装的 `bordered` 默认开启，使用 `--ui-card-border`；无边框变体由组件属性控制，不靠页面覆盖内部样式。
- **Internal Padding / 内边距：** 通过 `--ui-card-padding-*` 使用 12px、16px 或 20px。

### Inputs / Fields

- **Style / 样式：** `UiInput` 包装 `gt-input`；明暗主题的 `--ui-input-bg` 都带透明度。外壳为 `--ui-radius-sm`，默认高 `--ui-control-height-md`；内部输入左右内边距取共享控件的 `--gt-control-padding-x-md`。
- **Focus / 焦点：** 输入壳使用 1px 内描边，聚焦时切换到 `--ui-input-focus-border`；颜色默认过渡 180ms，减少动效偏好下取消过渡。
- **Error / Disabled：** disabled/readonly 使用 `--ui-input-disabled-*`；校验错误同时给出文案，不能只改边框色。placeholder 使用 `--ui-input-placeholder`，需按实际背景检查对比度。
- **Slots / 插槽：** prefix、suffix 各进同名槽；若无内容，不渲染占位槽。通过公开 `::part(...)` 与 CSS variables 调整 Stencil 内部，避免依赖 Shadow DOM 私有 class。

### Navigation

- **Style / 样式：** 顶栏、侧栏、底部 tabs、路由动效和插件路由都应保持在主应用壳层的视觉语言内。
- **States / 状态：** 当前路由和选中 tabs 使用重点色 tint；`gt-tabs` 还提供 line 与 segmented 两种模式，选中态使用 `--ui-tabs-active-*`，分段控件底色与选中底色都以 `#66CCFF` 混合主题面板色，内层圆角由外层圆角减去 padding 与边框宽度推导。
- **Responsive Treatment / 响应式：** 侧栏应通过结构折叠处理紧凑布局；不要靠 viewport 缩放字体解决空间问题。

### Menus / Popovers / 浮层

共享 `gt-select`、`gt-menu`、日期/时间选择器、Dialog 和 Drawer 的 body portal、定位、Esc、点击外部关闭、焦点恢复和释放由 Stencil core 负责。页面自定义浮层若不使用这些控件，使用 `Teleport to="body"`、fixed 定位与 `--ui-z-*` 层级，并处理边缘翻转和窗口滚动；不要让浮层被局部滚动容器裁切。主窗口通过 `--ui-*` 语义 token 设定外观，插件独立界面则显式导入 `@guyantools/plugin-ui/tokens.css` 并使用公开 `--gt-*` token。

### Signature Component: Personalization Surfaces / 标志性组件：个性化表面

背景和小组件个性化是产品能力，不是装饰。选择器必须按真实目标尺寸预览，借助文字颜色变量保证对比度；弹出的面板遵循上面的浮层规则。动效只表达状态变化，尊重 `prefers-reduced-motion`。

## 6. Do's and Don'ts / 该做与不该做

### Do:

- **Do** 桌面优先复用 `components/ui/` 的 `Ui*` 包装；插件前端复用公开 `gt-*` 控件。
- **Do** 主窗口颜色、表面、控件和状态优先使用 `--ui-*` 语义 token；插件使用公开 `--gt-*` token。
- **Do** 保持桌面工作流高密度但可扫读，使用 `--ui-control-height-*` 与稳定面板尺寸，并尊重用户配置的基础字号。
- **Do** 保留键盘焦点、禁用、加载、空状态和错误状态。
- **Do** 对新增文字和状态组合测量明暗主题对比度；普通文字目标至少 4.5:1。
- **Do** 复用 Stencil 自带的 body portal；页面自定义菜单、日期时间选择器和下拉面板使用 `Teleport to="body"` 加 fixed 定位。

### Don't:

- **Don't** 把应用页面做成 SaaS 落地页、hero 指标模板或重复装饰卡片网格。
- **Don't** 引入泛 AI 紫色渐变、渐变文字、侧边彩条边框或装饰性玻璃拟态。
- **Don't** 创建随意 z-index、页面私有阴影系统、页面私有圆角体系或本地硬编码状态色。
- **Don't** 用深蓝替代 `#66CCFF` 作为主按钮填充，也不要在明亮青蓝填充上使用白色小字；错误、警告和完成状态不能只靠颜色区分。
- **Don't** 交付文字溢出、被裁切菜单、无 tooltip 的歧义图标，或 hover 时会改变布局尺寸的控件。
- **Don't** 默认用模态框解决问题；能用 inline、drawer、popover 或渐进披露时，就让用户留在当前工作流里。
- **Don't** 绕过 `gt-*` 的公开 `::part(...)`、slot 与 CSS variables 去修改 Shadow DOM 私有结构；不要重新发明标准桌面交互。
