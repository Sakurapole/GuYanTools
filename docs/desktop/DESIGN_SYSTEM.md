# 桌面端设计系统契约

本文档约束 `desktop/src/windows/main/` 主窗口设计系统。视觉实现应优先复用主题 token、基础 SCSS 和 `components/ui/` 通用组件；业务页面不再新增独立颜色、字体、阴影、圆角和层级体系。

## 适用范围

- 主题入口：`desktop/src/windows/main/assets/theme.scss`
- 基础 token：`desktop/src/windows/main/assets/foundation.scss`
- 全局字体别名：`desktop/src/windows/main/global.css`
- 通用组件：`desktop/src/windows/main/components/ui/`
- 迁移检查：`desktop/scripts/check-design-system.mjs`

## Token 分层

### Foundation

`foundation.scss` 只放跨主题稳定的结构 token，例如字体族、字号阶梯、圆角、阴影、间距和 z-index 层级。新增基础 token 时必须满足至少一个条件：

- 被两个以上页面或组件复用。
- 是设计系统基础能力，例如通用字号、浮层层级、焦点环。
- 是旧变量迁移所需的短期兼容别名。

当前关键层级 token：

- `--ui-z-base`
- `--ui-z-raised`
- `--ui-z-sticky`
- `--ui-z-sidebar`
- `--ui-z-floating`
- `--ui-z-overlay`
- `--ui-z-overlay-strong`
- `--ui-z-docked`
- `--ui-z-toolbar`
- `--ui-z-popover`
- `--ui-z-dialog`
- `--ui-z-modal`
- `--ui-z-topbar`
- `--ui-z-secure-modal`
- `--ui-z-toast`
- `--ui-z-picker`
- `--ui-z-critical`

### Theme

`theme.scss` 负责 light/dark 两套语义 token 的真实取值。业务页面应使用 `--ui-*` 语义变量，不直接硬编码主题色。

常用语义族：

- 文本：`--ui-text-primary`、`--ui-text-secondary`、`--ui-text-muted`、`--ui-text-subtle`
- 表面：`--ui-surface-base`、`--ui-surface-panel`、`--ui-surface-elevated`、`--ui-surface-dialog`
- 边框：`--ui-border-subtle`、`--ui-border-accent`、`--ui-border-accent-soft`
- 状态：`--ui-state-error`、`--ui-state-success`、`--ui-state-warning`
- 控件：`--ui-button-*`、`--ui-input-*`、`--ui-select-*`、`--ui-checkbox-*`

## 组件规则

- 按钮、输入框、选择器、日期时间选择器、复选框等基础控件优先使用 `components/ui/`。
- 页面内确需保留原生控件时，应只作为迁移过渡，并确保样式引用 `--ui-*` token。
- 弹出菜单、日期时间选择器、下拉面板等浮层使用 `Teleport to="body"`、`position: fixed` 和 z-index token。
- 新增业务页面不允许再定义新的 `--color-*` 局部体系；历史页面迁移时可保留局部桥接变量，但必须列入迁移计划并逐步删除。

## 样式约束

- 不新增硬编码 `z-index` 数字；使用 `--ui-z-*`。
- 不新增独立字体族；使用 `--app-font-family`、`--ui-font-family` 或 monospace 别名。
- 不新增页面私有阴影、圆角和状态色，除非它们明确是业务内容数据本身。
- 不在业务页面重复造通用控件样式；优先扩展或复用 `components/ui/`。

## 检查命令

```powershell
pnpm --dir desktop run lint:design-system
```

该命令当前执行三类检查：

- 未定义 CSS 变量：失败项，必须修复。
- `--color-*` 独立别名：警告项，按迁移计划消化。
- 大数字 z-index 与页面原生控件：警告项，按迁移计划分批消化。

## 迁移原则

1. 先补 token，再迁移调用点。
2. 先迁移高频页面和新增页面，再处理低频历史页面。
3. 一次只消化一种债务类型，例如控件、z-index、颜色别名或排版。
4. 每批迁移后至少运行 `lint:design-system`；涉及 Vue/TS 的批次再运行桌面端类型检查或构建。
