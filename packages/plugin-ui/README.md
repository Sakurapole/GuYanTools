# @guyantools/plugin-ui

GuYanTools 插件使用的跨框架 Custom Elements 和 `--gt-*` Design Tokens。

```ts
import '@guyantools/plugin-ui/tokens.css';
import { registerGuYanElements } from '@guyantools/plugin-ui';

registerGuYanElements();
```

公开元素包括 `gt-button`、`gt-input`、`gt-card` 和 `gt-dialog`。Vue 插件可调用 `registerGuYanVueElements()`；React 插件引入 `@guyantools/plugin-ui/react` 获取 JSX intrinsic 类型。元素只依赖 DOM 属性、CustomEvent 和 CSS token，不依赖 Electron 或宿主 store。
