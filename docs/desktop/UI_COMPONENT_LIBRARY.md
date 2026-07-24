# GuYanTools 统一 UI 组件库

> 适用版本：UI API `1.0.0`。组件实现基于 Stencil，当前供 sandboxed 插件使用；桌面主应用保留既有 DOM 兼容层。

## 包与职责

| 包 | 消费者 | 责任 |
| --- | --- | --- |
| `@guyantools/ui-core` | 插件前端运行时 | Stencil source、`gt-*` Custom Elements、tokens、DOM 事件、无障碍与 overlay 行为 |
| `@guyantools/ui-vue` | Vue 插件 | 生成 Vue proxy 输入和兼容 `Ui*` wrappers，保留 `v-model`、slots、Teleport、`focus/select` |
| `@guyantools/plugin-ui` | 插件 | 稳定 facade，发布 Custom Element loader、tokens、Vue 入口和 React proxies |

桌面主应用继续使用 `desktop/src/windows/main/components/ui/Ui*.vue` 的本地 DOM 实现。它们暴露的 `.ui-card`、`.ui-icon-button`、`.ui-dialog` 等内部结构仍被页面级 SCSS 覆写，因此不能直接以 Shadow DOM Custom Elements 替换。

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
- Overlays: `gt-tooltip`、`gt-dialog`、`gt-drawer`。

输入类元素通过 `gt-input` / `gt-change` 发出 `{ value }`，选择控件通过 `gt-change` 发出 `{ checked }` 或 `{ value }`。Dialog 和 Drawer 通过 `gt-open-change` 发出 `{ open, reason }`，其中 reason 为 `escape`、`mask` 或 `programmatic`。`gt-input` 和 `gt-textarea` 支持宿主 `focus()` 与 `select()`。

## Tokens 和浮层

只使用公开的 `--gt-*` CSS Custom Properties。组件通过 Shadow DOM 隔离内部样式并继承 tokens，不依赖 Electron、Node.js、Pinia、Router、preload 或插件 SDK。

Tooltip、Dialog 和 Drawer 的 DOM 级定位、body portal、Esc、mask、Tab focus trap、焦点恢复与 teardown 由 core 负责。Vue compatibility wrapper 只为旧调用方保留 Teleport 结构、slot 传递和 `v-model` 事件映射，不接管浮层行为。

## 迁移与边界

本期不迁移桌面端的既有 `Ui*` 实现，也不迁移日期/时间选择器、菜单、树、文件输入、颜色选择器、Transfer、滚动条、图标选择器或媒体裁剪器。桌面端未来迁移前，必须先以 `part`、CSS Custom Properties 和覆盖场景测试定义 Shadow DOM 样式契约；不得在插件中复制主应用 SCSS 或注册第二套同名 `gt-*` 元素。

验证入口：

```powershell
pnpm --dir packages/ui-core run test
pnpm --dir packages/ui-core run build
pnpm --dir packages/ui-vue run build
pnpm --dir packages/plugin-ui run build
pnpm run verify:plugin-framework
```
