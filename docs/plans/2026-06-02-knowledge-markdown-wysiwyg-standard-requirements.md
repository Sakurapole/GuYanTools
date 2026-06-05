# 知识库 Markdown 所见即所得标准化需求与实施计划

## 背景

当前知识库 Markdown 编辑器基于 CodeMirror 6 构建，已经支持源码编辑、分屏预览、虚拟化预览和一个轻量 WYSIWYG 装饰层。这个装饰层最初以单行正则为主，适合快速补齐标题、粗体、斜体等视觉效果，但不适合作为长期完整 Markdown WYSIWYG 架构。

本计划以 CommonMark 0.31.2 和 GitHub Flavored Markdown 为兼容基线：

- CommonMark Spec: https://spec.commonmark.org/
- GitHub Flavored Markdown Spec: https://github.github.com/gfm/
- CodeMirror 6 / Lezer parser reference: https://codemirror.net/docs/ref/

目标不是把 Markdown 变成私有富文本格式，而是在保留 `content_markdown` 为事实源的前提下，让用户在 WYSIWYG 模式中获得接近 Typora 的编辑体验，并继续满足十万行级文档的性能边界。

## 当前已完成能力

### 编辑模式

- 保留 Markdown 源码编辑模式。
- 保留分屏预览模式。
- 保留纯预览模式。
- 提供 WYSIWYG 模式入口。
- 在 WYSIWYG 中，光标所在行会显示原始 Markdown 语法，便于继续编辑。
- 在 WYSIWYG 中，光标位于多行代码块或多行公式块任意位置时，整块可恢复为可编辑状态。

### 当前 WYSIWYG 装饰覆盖

- ATX 标题 H1-H6。
- Setext 标题 H1-H2。
- 主题分隔线。
- 粗体、斜体、删除线。
- 行内代码。
- 链接、图片语法的可视化标记。
- 引用块。
- 有序列表、无序列表、任务列表。
- fenced code block。
- GFM 表格的基础行级可视化。
- 行内公式 `$...$`。
- 块级公式 `$$...$$`。

### 当前主题能力

- 预置系统、纸张、专注主题。
- 新增 GitHub 主题。
- 支持导入 CSS 文件作为自定义主题。
- 自定义主题 CSS 持久化到本地 `localStorage`。
- 自定义主题导入会移除 `@import`，并阻断明显危险的 `javascript:` URL 与 `expression()`。

### 当前解析树驱动状态

- `markdown_wysiwyg_tokens.ts` 已成为 WYSIWYG token 生成边界。
- `collectMarkdownWysiwygParserTokensFromState()` 已基于 CodeMirror / Lezer Markdown 解析树输出 parser-only token。
- `collectMarkdownWysiwygTokensFromState()` 已作为编辑器主入口，按 viewport 读取 `EditorState`，合并 parser token 与扩展语法 fallback。
- 编辑器已启用 `markdown({ base: markdownLanguage })`，让 GFM 表格、任务列表、删除线进入 CodeMirror 解析树。
- parser-tree 主路径已覆盖 ATX 标题、Setext 标题、主题分隔线、引用、列表、任务列表、缩进代码块、fenced code block、GFM 表格、粗体、斜体、删除线、行内代码、链接、图片和 autolink literal。
- 数学公式、Wiki link、Callout 和知识库资产链接仍作为项目扩展语法，由 extension-only fallback、parser link/image token 或预览增强路径兜底；Mermaid fenced block 挂在 parser-owned `FencedCode` 主路径上识别。

## 完整功能需求

### 1. CommonMark 块级语法

必须支持：

- 段落。
- ATX 标题与 Setext 标题。
- 主题分隔线。
- 缩进代码块。
- fenced code block，包含反引号与波浪线 fence。
- HTML block 的显示、折叠与安全预览策略。
- block quote，包含多层引用。
- 有序列表、无序列表、嵌套列表、松散列表、紧凑列表。
- 列表项内嵌段落、代码块、引用、表格、公式。

验收标准：

- 与 CommonMark 示例语义一致。
- 光标进入任意块时，该块的原始 Markdown 可编辑。
- 光标离开后，块恢复可视化样式。
- 不因为块跨越视口而丢失状态。

### 2. CommonMark 行内语法

必须支持：

- emphasis / strong emphasis。
- code span。
- links。
- images。
- autolinks。
- raw HTML inline 的安全显示。
- hard break / soft break。
- entity / backslash escape。

验收标准：

- 光标进入行内格式任意位置时，相关原始标记可编辑。
- 光标离开后，标记隐藏或弱化，内容保留视觉样式。
- 嵌套行内格式不互相吞噬。

### 3. GFM 扩展

必须支持：

- strikethrough。
- table。
- task list item。
- autolink literal。
- disallowed raw HTML 过滤策略。

表格的长期目标：

- WYSIWYG 模式中以真实表格网格呈现。
- 支持单元格选择、Tab/Enter 导航、增删行列、对齐设置。
- 原始 Markdown 表格仍作为保存格式。
- 光标进入表格时可以切换到结构化表格编辑状态。

### 4. 数学、图表和知识库扩展

项目扩展语法：

- 行内公式 `$...$`。
- 块级公式 `$$...$$`。
- Mermaid fenced block。
- Wiki link `[[Page]]`。
- Callout `> [!NOTE]` / `> [!WARNING]` 等。
- 知识库资产链接 `app://knowledge-assets/...`。

验收标准：

- 扩展语法不破坏 CommonMark/GFM 基线。
- 扩展块必须有明确的编辑态和预览态。
- 资产链接继续走既有安全打开路径。

## 完整非功能需求

### 性能

- 十万行 Markdown 文档可打开。
- WYSIWYG 装饰只处理可见视口和必要上下文。
- 跨行块状态查询不能在每次 selection change 时全量扫描十万行。
- 表格、公式、代码块等块级状态应复用分段索引或解析树缓存。
- 输入延迟目标：普通段落编辑 P95 小于 50ms。
- 滚动帧率目标：常规文档滚动不低于 45fps。

### 架构

- 长期实现应迁移到 parser-tree driven decoration。
- CodeMirror / Lezer Markdown 解析树应成为语法识别事实源。
- 单行正则只能作为短期兼容补丁或特定扩展语法补充。
- WYSIWYG 层不得改变 `content_markdown` 的事实源地位。
- 预览、保存、搜索快照仍通过现有 codec/store 边界接入。

### 安全

- 预览 HTML 继续走 sanitizer。
- 自定义主题 CSS 不允许 `@import`。
- 自定义主题 CSS 不允许明显危险 URL。
- 资产链接不得绕过 preload / knowledgeApi 白名单。

### 可访问性

- 表格、任务项、链接、图片、公式块需要保留键盘可达路径。
- 编辑态与预览态切换不能造成焦点丢失。
- 屏幕阅读器至少能读取原始 Markdown 内容。

### 可测试性

- 每类 Markdown 语法都有装饰 token 级单元断言。
- 每类块级语法都有 active-range 回归断言。
- 大文档必须保留性能门禁。
- 关键交互需要补 Playwright 或 Electron 冒烟测试。

## 分阶段实施计划

### V0：当前补丁稳定化

目标：

- 修复明显用户反馈问题。
- 保留当前轻量实现。
- 为后续迁移补足测试网。

内容：

- 完成代码块整块编辑态。
- 完成表格基础可视化。
- 完成行内公式与块级公式基础可视化。
- 完成 GitHub 主题与自定义 CSS 导入。
- 补充 `verify:knowledge-editor` 回归断言。

### V1：解析树驱动的 WYSIWYG 基础

状态：已完成。

目标：

- 用 CodeMirror / Lezer Markdown 解析树替代主路径正则识别。

内容：

- 建立 `markdown_wysiwyg_tokens.ts`，输入 `EditorState` 与 viewport，输出标准 token。
- token 类型覆盖 CommonMark 块级、行内、GFM 和项目扩展。
- 将现有正则逻辑降级为扩展语法 fallback。
- 建立 token snapshot 测试。

完成内容：

- 已建立独立 token 模块，CodeMirror 装饰器仅保留 token 到 Decoration 的适配职责。
- 已建立 parser-only collector，用于验证 parser-tree 主路径不会被 fallback 掩盖。
- 已启用 GFM Markdown parser，GFM 表格、任务列表、删除线和 autolink literal 可由语法树识别。
- 已补充 `verify:knowledge-editor` token 级回归断言，覆盖 parser-only、state collector、active-range、extension-only fallback 和 parser-owned block 反例。
- 已将 fallback 收敛为扩展语法 fallback，避免数学公式、Wiki link、Callout 等项目扩展在 V1 阶段被错误纳入 CommonMark/GFM 解析树范围。
- 已为 Wiki link、Callout 和 Mermaid fenced block 建立独立 WYSIWYG token 与基础编辑器样式；Mermaid token 来自 parser-owned `FencedCode` 主路径，避免普通代码块中的 Mermaid 文本被 fallback 误装饰。
- 已建立磁盘 JSON token snapshot，用于固定 V1 关键 token 的顺序、范围和 class。
- 已移除 state collector 为判断 fence 状态从文档开头线性扫描到 viewport 的路径，并补充普通靠后 viewport 与长 fenced code block 内靠后 viewport 的性能断言。

### V2：块级结构化编辑

状态：V2.1 已完成。

目标：

- 让表格、代码块、公式块、Mermaid、Callout 不只是“行级着色”，而是具备结构化编辑体验。

内容：

- 表格 block widget。
- 公式 block widget。
- Mermaid block preview/edit toggle。
- Callout block 样式与类型切换。
- 块级 active-range 统一策略。

完成内容：

- 已扩展 `MarkdownWysiwygDecorationToken`，新增 `codeBlockWidget`、`tableBlockWidget`、`mathBlockWidget`、`mermaidBlockWidget`、`calloutBlockWidget` 五类块级 widget token。
- 普通 fenced code block 已具备独立代码块 widget，显示语言标签、源码预览和编辑入口；光标进入代码块任意位置时取消 widget，恢复原始 fenced code 编辑态。
- 表格 widget 已解析 header、body row 与 GFM alignment，并在 WYSIWYG 非激活状态以真实 `<table>` 网格呈现。
- 表格 widget 已提供增行、删行、增列、删列、左对齐、居中、右对齐操作入口，操作结果直接重写原始 Markdown 表格。
- 已引入 `katex`、`mermaid`、`mathjax` 依赖；当前默认公式渲染走 KaTeX，MathJax 作为后续完整 TeX 兼容路径的可用依赖保留。
- 公式块 widget 已解析 `$$...$$` 内容，并在非激活状态通过 KaTeX 输出真实排版 HTML；光标进入公式块任意位置时取消 widget，恢复原始 Markdown 编辑态。
- Mermaid widget 已从 parser-owned `FencedCode` 主路径识别 ` ```mermaid `，非激活状态通过 Mermaid 异步渲染 SVG；光标进入块内时取消 widget，恢复原始 fenced code 编辑态。
- 普通预览和虚拟分段预览已统一使用共享增强渲染入口：同步阶段生成 KaTeX HTML 与 Mermaid 容器，DOM 挂载后按可见块异步渲染 Mermaid SVG，避免阻塞大文档 Markdown 解析。
- Callout widget 已解析 `> [!TYPE] title`、类型、标题和正文，非激活状态以独立提示块呈现；光标进入块内时取消 widget，恢复原始引用语法。
- Callout widget 已提供类型选择控件，可在 NOTE、TIP、WARNING、DANGER 之间切换并写回原始 Markdown。
- Decoration 层已在存在块级 widget 时过滤同块内旧的行级 mark/replace decoration，避免块替换与内部 token 交叠。
- CodeMirror block widget 已改为 `StateField + EditorView.decorations.from(...)` 直连提供，避免 `ViewPlugin` 提供 block decoration 导致运行时崩溃。
- 已补充 `verify:knowledge-editor` V2 回归断言，覆盖非激活 widget 生成、widget 数据解析、active-range 抑制 widget 与 token snapshot 更新。

当前边界：

- V2.2 已完成真实渲染闭环；表格支持块级增删行列和全列对齐操作，但尚不是单元格内直接编辑器，也没有 Tab/Enter 单元格导航。
- Mermaid 已具备真实 SVG 渲染，但采用懒加载和可见块渲染策略；异常语法会显示错误态并保留源码入口。
- 数学公式已具备 KaTeX 真实排版；MathJax 已作为依赖进入工程，但当前不作为默认渲染器，避免与 KaTeX 同时承担同一公式路径造成包体和运行时重复。

### V3：完整 GFM 与知识库扩展

状态：已完成。

目标：

- 对齐 GFM 行为，并稳定项目扩展语法。

内容：

- GFM autolink literal 的打开、跳转和键盘交互。
- 任务列表交互勾选。
- Wiki link 自动补全和跳转。
- asset link 预览与打开。
- 嵌套列表和复杂表格边界修复。

完成内容：

- 预览渲染已支持任务列表交互标记，任务 marker 带 `data-knowledge-task-line` 与 checked 状态；鼠标点击、Enter 和 Space 均可写回原始 Markdown 的 `[ ]` / `[x]`。
- WYSIWYG 编辑态的任务 checkbox 已支持鼠标点击、Enter 和 Space 切换，直接替换对应 Markdown marker，不需要先退回纯编辑模式。
- Wiki link `[[Page]]` 与 `[[Page|Alias]]` 已在预览中渲染为 `app://knowledge-pages/title/...` 链接，并由 `KnowledgePage.vue` 按当前可见页面标题跳转。
- Wiki link 插入仍沿用当前页面建议菜单，支持基于知识库可见页面标题插入 `[[Title]]`。
- 知识库 asset 链接与图片预览已补充 `data-knowledge-asset-action` 钩子；预览点击可复用现有 asset 打开路径。
- segmented preview 已修复表格边界：普通列表行中的 `|` 不会继续吞进上一张表格，转义管道 `\|` 段落不会被误识别为表格行。
- segmented preview 已补充嵌套列表回归断言，保证缩进子项与后续同级项保持在同一个列表分段中。
- 已在 `verify:knowledge-editor` 中补充 V3 回归断言，覆盖任务交互 HTML、Wiki link HTML、预览键盘交互钩子、WYSIWYG checkbox 交互钩子、asset action 钩子、嵌套列表和复杂表格边界。

当前边界：

- V3 已完成 GFM 与知识库扩展的主路径交互，但仍不是完整块编辑器式的 Notion 数据模型；当前写回仍以 Markdown 文本为唯一真源。
- Wiki link 跳转按当前可见页面标题精确匹配，大小写不敏感；同名页面目前命中第一个可见匹配项，后续如需强一致应引入 page-id 形式的 Wiki link。
- asset 预览与打开复用现有知识库 asset API；未在 V3 中新增独立资产详情浮层。

### V4：性能与大文档专项

目标：

- 把完整 WYSIWYG 推到十万行级别可用。

内容：

- 分段索引缓存。
- viewport-aware token cache。
- 解析树增量复用。
- selection-change 低成本路径。
- 大文档 benchmark 与性能回归脚本。

### V5：主题生态

目标：

- 让主题能力稳定开放给用户。

内容：

- GitHub 主题完善。
- Typora-like 主题变量规范。
- CSS 文件导入、导出、重置。
- 主题作用域检查。
- 主题预览面板。

## 当前风险

- 当前 V2.2 已完成块级结构化编辑与 Mermaid/KaTeX 真实渲染闭环，但仍不是完整 Typora/Notion 级富文本编辑器。
- 表格目前支持块级网格预览、增删行列和全列对齐，不是完整单元格内编辑器。
- V3 已完成任务列表、Wiki link、asset link、嵌套列表和复杂表格边界主路径；剩余知识库扩展风险主要是同名 Wiki 页面消歧和资产详情浮层。
- 数学公式默认使用 KaTeX；MathJax 依赖已引入但尚未接入为可切换渲染引擎。
- Mermaid 已使用懒加载真实渲染；主要剩余风险是复杂图表包体、首次渲染耗时和异常图表的错误提示质量。
- 自定义 CSS 已限定到 `.knowledge-markdown-editor--theme-custom` 作用域；剩余风险是主题预览、高级 CSS 兼容和更完整的主题变量规范。
- `KnowledgeMarkdownEditor.vue` 已开始把 token 与主题逻辑外移，但结构化 block widget、公式渲染、Mermaid 预览等 V2/V3 内容继续增加时仍需持续拆分。
