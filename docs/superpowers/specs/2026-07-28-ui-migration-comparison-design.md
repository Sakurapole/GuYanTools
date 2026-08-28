# UI Migration Comparison Page Design

## Goal

在开发模式中提供 `#/devtools/ui-migration` 页面，让组件迁移工作可以在同一主题、同一 props 和同一页面上下文中并排比较 Vue legacy 与 Stencil 版本。

## Scope

- 仅在 `import.meta.env.DEV` 下注册路由，并在“设置 > 底栏默认标签”提供“组件对比”入口；不加入生产导航。
- 左侧为可选择的基础、表单、反馈组件目录。
- 右侧固定为两个等宽预览面：`Vue Legacy` 与 `Stencil`。
- 首批展示 Button、IconButton、Card、Field、Input、Textarea、Checkbox、Radio、Switch、Tabs、EmptyState、StateCard。
- 首批 12 个组件均已完成 Legacy 与 Stencil 的逐项核对，统一标记为“已对齐”。
- 不在本页面迁移任何业务页面的组件入口，不比较 Dialog、Drawer、Tooltip 等 portal 组件。

## Architecture

页面直接引用桌面 local `Ui*.vue` 作为 legacy 一侧，并直接渲染 `gt-*` Custom Elements 作为 Stencil 一侧。页面 mounted 时仅注册 Stencil elements；Vite 全局把 `gt-*` 识别为 custom elements，但其他桌面页面不会开始使用它们。

每个组件定义一个示例元数据条目和对应的双栏模板分支。表单类示例使用页面本地状态分别驱动两侧，避免改变全局 store 或业务数据。

## Acceptance Criteria

- 开发模式能访问 `#/devtools/ui-migration`，生产路由表不包含该路径。
- 开发模式的“设置 > 底栏默认标签”可配置“组件对比”，新配置默认将其固定显示；生产环境不显示该项。
- 选择任一首批组件后，右侧显示对应的 legacy 与 Stencil 示例，不存在 Vue custom-element warning。
- 组件目录、对齐状态和主题继承可见，窄窗口时双栏纵向排列。
- `UiStateCard` 继续使用与 Stencil 共用的 `--gt-state-card-*` 变量。
