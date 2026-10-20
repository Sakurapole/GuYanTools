# GuYanTools 统一 UI 组件库

> 适用版本：UI API `1.0.0`。组件实现基于 Stencil，插件与桌面主应用共用同一套 Custom Elements；桌面端保留 `Ui*.vue` 兼容入口。

## 包与职责

| 包 | 消费者 | 责任 |
| --- | --- | --- |
| `@guyantools/ui-core` | 插件前端运行时 | Stencil source、`gt-*` Custom Elements、tokens、DOM 事件、无障碍与 overlay 行为 |
| `@guyantools/ui-vue` | Vue 插件与桌面适配 | 生成 Vue proxy 输入和兼容 `Ui*` wrappers，保留 `v-model`、slots、Teleport、`focus/select` |
| `@guyantools/plugin-ui` | 插件 | 稳定 facade，发布 Custom Element loader、tokens、Vue 入口和 React proxies |

桌面主应用继续从 `desktop/src/windows/main/components/ui/Ui*.vue` 导入。已迁移控件的这些文件是 Stencil 兼容适配器，保留原有 props、事件和导入路径；页面级样式只通过公开 CSS variables、`::part()` 和全局 overlay layer 定制，不依赖 Shadow DOM 内部 class。

## 注册与使用

任意前端框架：

```ts
import '@guyantools/plugin-ui/tokens.css';
import { registerGuYanElements } from '@guyantools/plugin-ui';

registerGuYanElements();
```

Vue：

```ts
import { UiButton, UiInput, registerGuYanVueElements } from '@guyantools/plugin-ui/vue';

registerGuYanVueElements();
```

React：

```tsx
import { GtButton, GtInput, registerGuYanReactElements } from '@guyantools/plugin-ui/react';

registerGuYanReactElements();
```

注册函数幂等，所有入口最终注册同一套 Stencil Custom Elements。插件 UI 仍需自行导入 `@guyantools/plugin-ui/tokens.css`。

## 首期组件

- Action and feedback: `gt-button`、`gt-icon-button`、`gt-card`、`gt-field`、`gt-empty-state`、`gt-state-card`。
- Forms: `gt-input`、`gt-textarea`、`gt-checkbox`、`gt-radio`、`gt-switch`、`gt-tabs`。
- Selection and menus: `gt-select`、`gt-menu`、`gt-menu-item`、`gt-menu-divider`、`gt-disclosure`、`gt-popup-surface`。
- Date and time: `gt-date-picker`、`gt-time-picker`、`gt-date-time-picker`。
- Overlays: `gt-tooltip`、`gt-dialog`、`gt-drawer`；选择器和日期/时间面板也使用 body-level portal。

输入类元素通过 `gt-input` / `gt-change` 发出 `{ value }`，选择控件通过 `gt-change` 发出 `{ checked }` 或 `{ value }`。Dialog 和 Drawer 通过 `gt-open-change` 发出 `{ open, reason }`，其中 reason 为 `escape`、`mask` 或 `programmatic`。`gt-input` 和 `gt-textarea` 支持宿主 `focus()` 与 `select()`。

## Tokens 和浮层

只使用公开的 `--gt-*` CSS Custom Properties。组件通过 Shadow DOM 隔离内部样式并继承 tokens，不依赖 Electron、Node.js、Pinia、Router、preload 或插件 SDK。

Tooltip、Dialog、Drawer、Select、菜单和日期/时间选择器的 DOM 级定位、body portal、Esc、mask、焦点恢复与 teardown 由 core 负责。Vue compatibility wrapper 只为旧调用方保留 slot 传递和 `v-model` 事件映射，不接管浮层行为。

Select、Menu、DatePicker、TimePicker、DateTimePicker 和 floating PopupSurface 默认在点击浮层面板外部时关闭。需要在面板外点击后保持打开时，在 Vue 中使用 `:close-on-outside="false"`，或将 custom element 的 `closeOnOutside` 属性设为 `false`；该判定只把 `[part="panel"]` 视为浮层内部，portal 的全屏空白层仍属于外部区域。

## 迁移与边界

剩余 Legacy 范围包括 SliderField、树、文件输入、颜色选择器、Transfer、滚动条、图标选择器、个性化配置和媒体裁剪器。Range 已提供 `gt-range` 与 Vue adapter，并在开发对比页展示；其余控件后续迁移前，必须先以 `part`、CSS Custom Properties 和覆盖场景测试定义 Shadow DOM 样式契约；不得在插件中复制主应用 SCSS 或注册第二套同名 `gt-*` 元素。

验证入口：

```powershell
pnpm --dir packages/ui-core run test
pnpm --dir packages/ui-core run build
pnpm --dir packages/ui-vue run build
pnpm --dir packages/plugin-ui run build
pnpm run verify:plugin-framework
```

### 插件页交互约束

- Drawer 入场和退场均为 220ms。关闭请求先同步 `gt-open-change`，退场完成后 core 发出 `gt-after-close`，Vue 包装转发为 `afterClose`。业务使用独立的显示状态，在 `afterClose` 后再清空详情数据，防止退场时内容闪空。快速重新打开会取消待执行的销毁；组件卸载立即释放 portal、事件与计时器。减少动效偏好下直接关闭。
- 分段 Tabs 的底色和选中底色以 `#66CCFF` 混合主题面板色。内层圆角等于外层圆角减去 padding 和边框宽度，indicator 与 tab 共用该圆角。
- `gt-input` 聚焦使用 1px 内描边，颜色变化默认过渡 180ms；减少动效偏好下取消过渡。
- `gt-checkbox` 的隐藏原生 input 必须相对自身 label 定位，防止焦点自动滚动外层 `gt-scrollbar`，裁掉权限列表可视区。
- 插件页操作按钮使用 `UiButton` 的 `prefix` 图标插槽并保留文字；本地图标复用 SVG 组件，不依赖运行时网络图标请求。
