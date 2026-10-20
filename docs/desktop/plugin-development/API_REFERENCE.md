# API 与组件参考

插件使用 `@guyantools/plugin-sdk` 的 `PluginRuntimeApi` 类型描述 `window.pluginAPI`。实际能力取决于 manifest 声明和用户批准的权限。第三方页面与 Worker 都通过 preload 白名单进入主进程；插件不能直接访问 Node/Electron。

## 运行时与状态

`getContext()` 返回插件 ID、当前页面 ID、运行时和已批准权限。Worker 使用 `lifecycle.ready()` 完成启动握手；由 CLI/Vite 生成的 `worker-bootstrap.js` 已负责调用。`storage.get(key)` 与 `storage.set(key, value)` 只读写当前插件的私有状态。

```ts
const context = await window.pluginAPI.getContext();
const previous = await window.pluginAPI.storage.get('greetingCount');
await window.pluginAPI.storage.set('greetingCount', Number(previous ?? 0) + 1);
```

## 命令与能力

`commands.register(id, handler)` 登记当前 runtime 的处理器；`commands.execute(id, payload)` 从页面调用已声明的命令。`capabilities.register(id, handler)` 登记 manifest 中声明的业务能力；`capabilities.list()`、`resolveByUrl(url)` 和 `invoke({ capabilityId, operation, payload })` 用于发现与调用。跨插件调用需要在消费方 manifest 中声明依赖。

```ts
const { result } = await window.pluginAPI.commands.execute(
  'guyantools.hello-plugin.greet',
  { count: 1 }
);
```

## 宿主原语

| 范围 | 主要方法 | 所需权限 |
| --- | --- | --- |
| 工作区 | `workspace.getCurrent()` | `workspace.read` |
| 私有状态 | `storage.get/set()` | `storage.self` |
| 命令 | `commands.execute/register()` | `commands.execute` |
| 网络 | `network.fetch()` | `network.fetch` |
| 文件授权 | `files.createDataGrant/pickDirectoryGrant/read/write/revoke()` | `files.read`、`files.write` 等 |
| 下载 | `downloads.direct()` | `downloads.manage` |
| Job | `jobs.create/list/get/update/cancel/retry/onEvent()` | `jobs.manage` |
| 媒体 | `media.probe/transcode/preview/writeTags()` | 对应媒体权限 |
| 密钥 | `secrets.get/set/delete()` | `secrets.self` |
| 日志 | `logger.info/error()` | `observability.logs` |

网络只允许经过宿主检查的公网 HTTP(S) 请求；FileGrant 绑定插件、目录、访问模式和有效期。Job 并发、网络响应大小和日志速率均受宿主配额限制。

## 页面与组件库

插件页面可以使用 Vue 3、React 或原生 Custom Elements。当前仓库示例使用已完成构建验证的 `@guyantools/ui-vue` 组件包装和 `@guyantools/ui-core` 主题 token：

```ts
import { createApp } from 'vue';
import { ensureGuYanElements } from '@guyantools/ui-vue';
import '@guyantools/ui-core/tokens.css';
import App from './App.vue';

ensureGuYanElements();
createApp(App).mount('#app');
```

页面组件通过 `@guyantools/ui-vue` 导入 `UiCard`、`UiButton` 等包装组件。manifest 的 `ui.components` 字段声明插件采用的组件体系；示例保留平台约定的 `@guyantools/plugin-ui` 标识，实际 UI 入口使用同一套底层元素的 `ui-vue` 包。组件通过 `--gt-*` 主题变量适配应用浅色/深色主题。请使用组件公开的属性、事件与 slot；Shadow DOM 内部样式不要依赖宿主页面的私有 class。

## 错误与限制

SDK 调用失败会携带稳定错误码，如 `PERMISSION_DENIED`、`QUOTA_EXCEEDED`、`INVALID_INPUT` 和 `TOOL_UNAVAILABLE`。给用户展示可理解的操作结果，日志中不要输出密钥或完整凭据。v1 只验证 Windows 桌面端；Flutter 插件执行、第三方 Node 原生模块和第三方 UtilityProcess 不属于当前支持范围。
