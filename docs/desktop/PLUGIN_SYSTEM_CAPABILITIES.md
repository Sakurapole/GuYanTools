# GuYanTools 插件系统能力与开发指南

> 适用版本：插件 API `1.0.0`、UI API `1.0.0`、manifest schema `1.1`。

GuYanTools 插件运行在受限的 Electron WebContentsView 中。插件可以使用 Vue 3 或 React 构建 UI，通过 Web Components 和 typed SDK 调用宿主能力；插件不能直接访问 Electron、Node.js、数据库或宿主源代码。

## 1. 能力总览

| 范围 | 当前能力 |
| --- | --- |
| UI 框架 | Vue 3、React；任意能使用标准 Custom Elements 的前端框架也可接入 |
| 共享 UI | Stencil `@guyantools/ui-core`、Vue 兼容包 `@guyantools/ui-vue`，以及插件 facade `@guyantools/plugin-ui` |
| 主题 | 读取 light/dark 主题描述，订阅主题变更 |
| 页面 | 通过 `contributes.pages` 注册插件页面；由宿主路由加载 sandboxed UI |
| Worker | `ui`、`worker`、`hybrid` runtime；生产包可有稳定的 `worker.js` |
| 数据与文件 | 插件私有存储、受时限/目录约束的 FileGrant、目录选择、读取和写入 |
| 网络与下载 | 受权限控制的 HTTP(S) 请求、重定向控制、直链下载到 FileGrant |
| 任务与媒体 | 插件任务队列、媒体探测、转码、预览代理、媒体标签写入 |
| 其他宿主能力 | 导航、命令分发、通知、日志、插件私有 secrets |
| 本地开发 | 插件自有 Vite Server、127.0.0.1 DevSession、热更新、桌面端连接/重连/停止 |
| 交付 | 校验、构建、zip 打包、SHA-256、GitHub Release、Marketplace PR 或 direct 更新 |

## 2. 快速开始

```powershell
pnpm create guyantools-plugin demo-media --framework vue
cd demo-media
pnpm install
pnpm run dev
```

React 项目：

```powershell
pnpm create guyantools-plugin demo-media --framework react
```

模板项目包含 `guyantools.plugin.json`、Vite UI 入口、可选 Worker 入口，以及以下命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm run dev` | 启动插件本地 Vite Server 并连接本地 DevSession |
| `pnpm run validate` | 校验生产 manifest 和入口路径 |
| `pnpm run build` | 构建 `dist/index.html` 与可选 `dist/worker.js` |
| `pnpm run pack` | 构建 zip、计算 SHA-256，并生成 `catalog-entry.json` |
| `pnpm run publish -- --dry-run` | 预览 tag、Release 和 Marketplace 更新命令 |

## 3. Manifest

生产 manifest 文件名固定为 `guyantools.plugin.json`。`permissions` 表示宿主 API 授权；`capabilities` 描述插件自身向用户和 Marketplace 声明的业务能力。两者不能互相替代，也不会互相隐式授权。

```json
{
  "schemaVersion": "1.1",
  "id": "example.media-tool",
  "name": "example-media-tool",
  "displayName": "Example Media Tool",
  "version": "0.1.0",
  "description": "A GuYanTools media plugin.",
  "pluginApiVersion": "1.0.0",
  "uiApiVersion": "1.0.0",
  "hostVersionRange": ">=1.0.0",
  "trustLevel": "sandboxed",
  "runtime": "hybrid",
  "ui": {
    "theme": "guyantools",
    "components": "@guyantools/plugin-ui"
  },
  "entry": {
    "ui": "dist/index.html",
    "worker": "dist/worker.js"
  },
  "permissions": ["ui.contribute", "storage.self", "observability.logs"],
  "capabilities": [
    {
      "id": "example.media-tool.transform",
      "kind": "transformer",
      "operations": ["convert"],
      "match": { "mimeTypes": ["video/*"] }
    }
  ],
  "contributes": {
    "pages": [{ "id": "main", "title": "Media Tool", "routePath": "/" }]
  }
}
```

### 字段约束

- `schemaVersion` 支持 `1.0` 和 `1.1`；新项目使用 `1.1`。
- `ui` 存在时必须同时提供兼容的 `uiApiVersion`，且 `ui.theme` 必须为 `guyantools`。
- `runtime` 可为 `ui`、`worker`、`hybrid` 或 `host`；`sandboxed` 插件不能使用 `host`。
- UI runtime 必须提供 `entry.ui`，Worker runtime 必须提供 `entry.worker`。入口必须是插件目录内的相对常规文件。
- `capabilities.kind` 目前支持 `media-source`、`metadata-provider`、`transformer`、`importer`。
- `contributes.pages` 是当前稳定的页面接入方式。manifest 也定义 widgets、commands、menus、shortcuts、backgroundTasks 字段；它们应仅在对应宿主入口已接入时使用，不能假设所有声明都会自动渲染或调度。

生产 manifest 禁止出现 `dev`、`devServer`、`uiUrl`、`workerUrl`、session token、绝对入口路径和 `node_modules`。

## 4. Vue、React 与共享 UI

UI 包使用稳定的 DOM 合同，因此不绑定框架实现。纯 Custom Element 或任意框架项目使用插件 facade：

```ts
import '@guyantools/plugin-ui/tokens.css';
import { registerGuYanElements } from '@guyantools/plugin-ui';

registerGuYanElements();
```

Vue 插件可从 `@guyantools/plugin-ui/vue` 导入 `UiButton`、`UiInput` 等兼容组件并调用 `registerGuYanVueElements()`；React 插件从 `@guyantools/plugin-ui/react` 导入生成的 `GtButton`、`GtInput` 等 React proxy 并调用 `registerGuYanReactElements()`。这两个注册函数都委托给同一个幂等 Stencil loader。当前公开元素为：

| 元素 | 用途 |
| --- | --- |
| `gt-button` | 按钮；`variant` 支持 `primary`、`secondary`、`ghost`、`danger`；点击事件为 `gt-click` |
| `gt-input` | 文本输入；输入事件为 `gt-input`，detail 包含 `value` |
| `gt-card`、`gt-field` | 内容容器与表单字段；支持 `muted`、`elevated`、label、hint、error |
| `gt-textarea`、`gt-checkbox`、`gt-radio`、`gt-switch`、`gt-tabs` | 多行输入、选择和标签页；通过 `gt-input` 或 `gt-change` 返回稳定 detail |
| `gt-empty-state`、`gt-state-card` | 空态、加载、错误和信息反馈；支持命名 icon/actions slots |
| `gt-tooltip`、`gt-dialog`、`gt-drawer` | body-level 浮层；以 `open` 控制状态，Dialog/Drawer 用 `gt-open-change` 通知关闭原因 |
| `gt-select`、`gt-menu`、`gt-menu-item`、`gt-menu-divider`、`gt-disclosure`、`gt-popup-surface` | 下拉选择、菜单项、分组分隔、折叠和通用浮层；面板通过共享 overlay layer 渲染到 body |
| `gt-date-picker`、`gt-time-picker`、`gt-date-time-picker` | 日期、时间和组合选择；支持清除、分钟步长、SQL/时间戳格式与 body-level 日历/时间面板 |

使用 `--gt-*` token 而不是复制宿主 SCSS。Token 同时包含浅色和深色主题，组件在 Shadow DOM 中继承这些变量。元素实现、键盘无障碍、焦点管理和浮层清理由 Stencil core 负责；Vue wrappers 仅保留 `v-model`、slots、Teleport 与 `focus/select` 等 Vue 调用契约。

## 5. Runtime SDK

宿主 preload 将 `pluginAPI` 注入插件页面的 `window`。`@guyantools/plugin-sdk` 提供 `PluginRuntimeApi` 类型和 `createPluginApi` 工厂；插件业务代码使用注入的 `window.pluginAPI`：

```ts
import type { PluginRuntimeApi } from '@guyantools/plugin-sdk';

declare global {
  interface Window {
    pluginAPI: PluginRuntimeApi;
  }
}

const context = await window.pluginAPI.getContext();
const theme = await window.pluginAPI.ui.getTheme();
const stopListening = window.pluginAPI.ui.onThemeChanged(nextTheme => {
  document.documentElement.dataset.theme = nextTheme.mode;
});
```

| SDK 范畴 | 方法/能力 |
| --- | --- |
| 上下文 | `getContext`、`workspace.getCurrent`、`data.getCapabilities` |
| 本地状态 | `storage.get/set`，按插件 ID 隔离 |
| UI 与导航 | `ui.getPages`、`ui.getTheme`、`ui.onThemeChanged`、`navigation.openRoute` |
| 命令与系统 | `commands.execute`、`system.getCapabilities`、`system.showNotification` |
| 可观测性 | `logger.info/error`，敏感字段会被宿主脱敏 |
| 网络 | `network.fetch`，只允许 HTTP(S)，可配置超时、最大响应和重定向 |
| 文件 | `files.createDataGrant`、`pickDirectoryGrant`、`read/write/revoke` |
| 下载与任务 | `downloads.direct`，以及 `jobs.create/list/get/update/cancel/retry` |
| 媒体 | `media.probe/transcode/preview/writeTags` |
| 密钥 | `secrets.get/set/delete`，按插件隔离 |

文件 API 必须先获得 FileGrant。grant 绑定插件、目录、访问模式、最大字节数和有效期；不能借由相对路径逃逸到授权目录外。

## 6. 权限模型

所有能力都必须在 manifest 的 `permissions` 中声明，并在 Marketplace 安装时由用户批准。sandboxed 插件可申请以下权限：

| 分类 | 权限 |
| --- | --- |
| 工作区与数据 | `workspace.read`、`data.user.read`、`data.project.read`、`data.settings.read` |
| 私有状态与 UI | `storage.self`、`navigation.open`、`ui.contribute`、`commands.execute` |
| 系统交互 | `system.dialog`、`system.clipboard`、`system.notifications`、`system.shortcuts`、`background.run` |
| 网络与文件 | `network.fetch`、`downloads.manage`、`jobs.manage`、`files.read`、`files.write` |
| 媒体与工具 | `tools.ffmpeg`、`media.preview`、`media.transcode`、`media.tag` |
| 安全与日志 | `secrets.self`、`observability.logs` |

`trusted` 插件在上述基础上才可申请 `data.project.write` 和 `data.settings.write`。权限声明不等于绕过运行时校验：调用仍按 sender、插件归属、grant 和 manifest 权限逐项验证。

## 7. 本地热加载开发

`pnpm run dev` 启动插件自己的 Vite Server，固定监听 `127.0.0.1`。CLI 识别 Vite 实际端口后创建：

```text
.guyantools/plugin.dev.json
```

其中包含插件 ID、loopback UI/Worker URL 和随机 session token。桌面端的 DevChannel 首选 Windows named pipe，必要时回退到带 token 校验的 loopback HTTP；只接受活动 DevSession 的 `127.0.0.1:<port>` URL。停止 CLI、连接失败或窗口关闭会清理 session，运行时回退到已安装插件的静态入口。

在桌面端“插件”页面的已安装插件区域选择本地 checkout 后，可连接、重连或停止 DevSession。Marketplace 记录不会自动被当作本地开发目录。

## 8. 构建、打包与发布

`build` 使用 `@guyantools/plugin-vite`：生产 base 为相对路径，输出 `dist/index.html`、可选 `dist/worker.js`、assets 和复制后的生产 manifest。构建会拒绝开发字段、越界路径和缺失入口。

`pack` 会再次校验并构建，将 `dist/`、manifest、可选 README/LICENSE 写入 zip，输出 SHA-256 与 `catalog-entry.json`。不要提交该 zip、`dist/`、`.vite/` 或 `node_modules`。

发布配置示例：

```json
{
  "repository": "https://github.com/example/example-media-tool",
  "marketplace": "sakurapole",
  "catalogMode": "pull-request",
  "releaseAsset": true,
  "catalogRepository": "Sakurapole/guyantools-plugin-marketplace",
  "catalogBranch": "main"
}
```

流程如下：

1. 先运行 `pnpm run publish -- --dry-run` 检查 tag、Release 和 catalog 命令。
2. 真实发布要求 `GH_TOKEN`，或有效的 `gh auth status` 登录会话。
3. CLI 创建本地 tag、推送 tag，并以打包 zip 创建 GitHub Release。
4. `pull-request` 模式克隆目录仓库，只替换当前插件 ID 对应 entry，创建分支、提交、推送并发起 PR。
5. `direct` 模式还必须设置 `allowDirectPublish: true`，并且 `gh api` 返回目录仓库的 push 权限；随后才提交目标分支。

传入 `--no-push` 时，CLI 只创建本地 tag 和 zip，不创建 Release、不提交 Marketplace，也不创建 PR。

## 9. 安全边界与不支持事项

- 第三方插件保持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`webSecurity: true`。
- 插件不能运行任意 shell 命令，不能直接访问宿主数据库、Electron API、Node 模块或其他插件数据。
- 宿主只提供通用原语。站点专用 URL 解析、下载策略、媒体规则和业务匹配必须实现于插件自己的 UI/Worker。
- Marketplace 条目必须使用 HTTPS 仓库、固定 ref 和 `resolvedCommit`；安装时会与真实 manifest 的 ID、版本、权限和 capabilities 比对。
- Vite 热加载 URL 只在显式本地 DevSession 内有效，生产 manifest 不能携带开发 URL。

## 10. 验收清单

发布前至少确认：

```powershell
pnpm run validate
pnpm run build
pnpm run pack
pnpm run publish -- --dry-run
```

并检查 manifest 权限最小化、`capabilities` 与实际功能一致、UI 不包含 Electron/Node 直接访问、文件操作都使用 FileGrant，以及生产包没有开发 session 信息。
