---
name: GuYanTools
description: 一个冷静、可扩展的桌面工作台，整合工具、终端、文件、知识库、Todo、AI 和插件。
colors:
  primary-cyan: "#66ccff"
  primary-blue: "#5c9ded"
  light-bg: "#f7fbff"
  light-surface: "#ffffff"
  light-surface-muted: "#f7fafe"
  light-ink: "#1e465a"
  dark-bg: "#101821"
  dark-surface: "#16222d"
  dark-surface-muted: "#1a2834"
  dark-ink: "#dcf0ff"
  danger: "#dc2626"
  success: "#059669"
  warning: "#b45309"
typography:
  display:
    fontFamily: "Geist Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 780
    lineHeight: 1.2
    letterSpacing: "0"
  headline:
    fontFamily: "Geist Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "0"
  title:
    fontFamily: "Geist Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
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
    fontWeight: 650
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
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "9px 16px"
    height: "42px"
  button-secondary:
    backgroundColor: "#f4f8fc"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.sm}"
    padding: "9px 16px"
    height: "42px"
  input-default:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
    height: "42px"
  card-default:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: GuYanTools

## 1. Overview / 概览

**Creative North Star: “Lucid Workbench / 清透工作台”**

GuYanTools 首先是产品界面，而不是品牌展示页。它是一个面向重复工作的桌面工作台：视觉设计必须服务任务流、状态表达和长期使用。现有系统使用 Geist 字体、语义化 `--ui-*` token、明暗双主题、青蓝色重点色、克制圆角，以及 `desktop/src/windows/main/components/ui/` 下的 Vue 通用组件。

整体气质应当清晰、冷静、像仪器一样可靠。界面可以有轻微的透光感和层级深度，但不能牺牲终端、文件传输、Todo、知识库、AI 对话和插件配置这些高密度任务的可信度。工作流需要密度时可以密集；装饰不能替代层级。

本系统明确拒绝 SaaS hero 套路、泛 AI 紫色渐变、随意私有 token、一次性控件和为了“高级感”而增加的装饰。新增 UI 应先继承现有组件语言，再考虑新的视觉结构。

**Key Characteristics / 关键特征：**
- 青蓝色重点色只用于主操作、选中、焦点和激活状态。
- 明暗主题通过语义 token 支撑，而不是页面私有色板。
- 产品界面使用紧凑、固定的 rem 字号，不使用营销式流体大标题。
- 面板以色调层级、克制边框和可预期的 hover/focus 状态建立结构。
- 菜单、选择器、日期时间面板等浮层应通过 body 级 fixed 定位避免被裁切。

## 2. Colors / 颜色

调色板是克制的产品型配色：冷静表面、蓝色倾向的可读文字，以及一个青蓝主重点色。

### Primary

- **Lucid Cyan / 清透青蓝**（`--primary-color`, `#66ccff`）：用于激活指示、tabs、复选/单选选中、hover tint、焦点相关强调和工作台身份感。
- **Action Blue / 操作蓝**（`--ui-button-primary-bg`, light `#5c9ded` / dark `#3f8fca`）：用于主按钮填充，强调操作清晰性而非装饰。

### Neutral

- **Light Workspace / 浅色工作台底色**（`--background-color`, `#f7fbff`）：浅色主题应用地板。
- **Light Panel / 浅色面板**（`--ui-surface-panel`, `#ffffff`）：默认卡片、弹窗、输入框和高密度工作表面。
- **Light Ink / 浅色主文字**（`--ui-text-primary`）：浅色表面上的主文字。
- **Dark Workspace / 深色工作台底色**（`--background-color`, `#101821`）：深色主题应用地板。
- **Dark Panel / 深色面板**（`--ui-surface-panel`, `#16222d`）：深色主题默认卡片、弹窗、输入框和高密度工作表面。
- **Dark Ink / 深色主文字**（`--ui-text-primary`, `#dcf0ff` 系列）：深色表面上的主文字。

### Tertiary

- **Danger Red / 危险红**（`--ui-state-error`, light `#dc2626` / dark `#ff9c9c`）：用于破坏性操作、校验错误和失败状态。
- **Success Green / 成功绿**（`--ui-state-success`, light `#059669` / dark `#34d399`）：用于完成、成功和健康状态。
- **Warning Amber / 警告琥珀**（`--ui-state-warning`, light `#b45309` / dark `#fbbf24`）：用于警告、冲突和可恢复风险。

### Named Rules

**The Semantic Token Rule / 语义 Token 规则。** 功能页面必须用 `--ui-*` token 表达文字、表面、边框、状态色、焦点环和控件。除迁移桥接外，不新增页面局部 `--color-*` 体系。

**The Accent Rarity Rule / 重点色稀缺规则。** 青蓝色只用于状态和操作。不要把主重点色当作页面装饰或非激活 chrome 使用。

## 3. Typography / 字体

**Display Font:** Geist Variable，回退到系统 sans。
**Body Font:** Geist Variable，回退到系统 sans。
**Label/Mono Font:** Geist Mono Variable，用于代码、终端相关信息和等宽场景。

**Character / 气质：** 字体系统应紧凑、产品化、精确可读。它不承担杂志式或戏剧化表达。

### Hierarchy

- **Display**（780, `1.875rem`, 1.2）：仅用于主要页面标题和工作区标题。
- **Headline**（750, `1.125rem`, 1.3）：用于区块标题和紧凑面板标题。
- **Title**（700, `1rem`, 1.35）：用于组件标题、弹窗标题、当前工具名。
- **Body**（400, `0.9rem`, 1.5）：用于标准产品说明、设置描述和正文。
- **Label**（650, `0.75rem`, 1.35, letter spacing `0`）：用于元信息、小控件、工具栏文字和辅助说明。

### Named Rules

**The Fixed Scale Rule / 固定字号规则。** 产品 UI 使用固定 rem 阶梯。应用面板、侧栏、表单、表格和工具栏不要使用流体 `clamp()` 标题字号。

**The No Display Label Rule / 标签不使用展示字体规则。** 按钮、标签、输入框、tabs 和数据类文本永远不使用 display 字体。

## 4. Elevation / 层级

GuYanTools 使用色调层级、克制边框和环境阴影的混合体系。卡片和面板可以有适度阴影，但每个阴影都必须支持层级、交互或浮层关系。弹出菜单、对话框和选择器可以使用更强阴影，因为它们确实位于任务表面之上。

### Shadow Vocabulary

- **Panel Low**（`--ui-shadow-sm`, `0 6px 14px rgba(0,0,0,0.08)`）：小型浮起控件和轻微 hover 反馈。
- **Panel Medium**（`--ui-shadow-md`, `0 10px 24px rgba(0,0,0,0.12)`）：卡片、面板和默认 elevated surface。
- **Panel High**（`--ui-shadow-lg`, `0 14px 30px rgba(0,0,0,0.16)`）：hover elevation 和较大的浮层。
- **Popover**（`--ui-shadow-popover`，基于 `--ui-shadow-lg`）：菜单、选择器、日期面板和 body 级浮层。

### Named Rules

**The One Elevation Reason Rule / 层级必须有理由规则。** 每个阴影都必须表达层级、可 hover、拖拽态或浮层。纯装饰阴影应删除。

**The Border Or Shadow Rule / 边框和阴影二选一规则。** 静态卡片不要同时使用装饰性 1px 边框和大范围柔和阴影。选择一种清晰的容器表达方式。

## 5. Components / 组件

### Buttons

- **Shape / 形状：** 紧凑柔和矩形（`--ui-radius-sm`, 10px），默认不使用大胶囊。
- **Primary / 主按钮：** 操作蓝背景、反色文字、42px 默认高度、9px x 16px 默认内边距、克制操作阴影。
- **Hover / Focus：** hover 可改变填充/表面色并轻微上移 1px；focus 使用 `--ui-focus-ring`。
- **Secondary / Ghost / Danger：** secondary 使用中性面板填充；ghost 在 hover/active 前保持透明；danger 使用语义红色 token。

### Cards / Containers

- **Corner Style / 圆角：** 默认中等圆角（`--ui-radius-md`, 14px），大面板可使用 `--ui-radius-lg`（18px）。
- **Background / 背景：** 使用 `--ui-card-bg`、`--ui-surface-bg` 或 `--ui-surface-bg-muted`。
- **Shadow Strategy / 阴影策略：** 默认使用面板阴影；更强阴影只用于交互 hover 或浮层。
- **Border / 边框：** 可选 `--ui-border-subtle`；区块分割仅在层级需要时使用 token 化 1px 边框。
- **Internal Padding / 内边距：** 通过 `--ui-card-padding-*` 使用 12px、16px 或 20px。

### Inputs / Fields

- **Style / 样式：** token 化边框、token 化输入背景、10px 圆角、固定控件高度。
- **Focus / 焦点：** 边框切换到 `--ui-input-focus-border` 并添加 `--ui-focus-ring`。
- **Error / Disabled：** 使用语义状态色和 disabled 背景/文字 token；placeholder 也必须可读。

### Navigation

- **Style / 样式：** 顶栏、侧栏、底部 tabs、路由动效和插件路由都应保持在主应用壳层的视觉语言内。
- **States / 状态：** 当前路由和选中 tabs 使用重点色 tint，不给非激活状态使用高饱和重点色。
- **Responsive Treatment / 响应式：** 侧栏应通过结构折叠处理紧凑布局；不要靠 viewport 缩放字体解决空间问题。

### Signature Component: Personalization Surfaces / 标志性组件：个性化表面

背景和小组件个性化是产品能力，不是装饰。选择器必须按真实目标尺寸预览，借助文字颜色变量保证对比度，并通过 body 级 fixed 浮层避免被滚动容器裁切。

## 6. Do's and Don'ts / 该做与不该做

### Do:

- **Do** 优先复用 `components/ui/` 基础组件，而不是在页面内重造局部控件。
- **Do** 每个可复用视觉决策都使用 `--ui-*` 语义 token。
- **Do** 保持桌面工作流高密度但可扫读，使用固定控件高度和稳定面板尺寸。
- **Do** 保留键盘焦点、禁用、加载、空状态和错误状态。
- **Do** 菜单、日期时间选择器、下拉面板使用 `Teleport to="body"` 加 fixed 定位。

### Don't:

- **Don't** 把应用页面做成 SaaS 落地页、hero 指标模板或重复装饰卡片网格。
- **Don't** 引入泛 AI 紫色渐变、渐变文字、侧边彩条边框或装饰性玻璃拟态。
- **Don't** 创建随意 z-index、页面私有阴影系统、页面私有圆角体系或本地硬编码状态色。
- **Don't** 交付文字溢出、被裁切菜单、无 tooltip 的歧义图标，或 hover 时会改变布局尺寸的控件。
- **Don't** 默认用模态框解决问题；能用 inline、drawer、popover 或渐进披露时，就让用户留在当前工作流里。
