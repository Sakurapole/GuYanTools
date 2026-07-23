# GuYanTools 跨框架插件 UI、热加载与发布设计

日期：2026-07-23  
状态：已确认设计，待拆分实现计划

## 1. 背景

当前插件运行时已经支持 `ui`、`worker` 和 `hybrid` 三种运行模式。UI 插件通过 `WebContentsView` 挂载，插件通过受限的 `pluginAPI` 调用宿主提供的网络、文件、下载、Job、媒体和密钥原语。插件入口、权限、业务 capability 和贡献点由 `guyantools.plugin.json` 描述。

当前实现仍有三个开发体验缺口：

1. 通用 UI 组件位于主窗口 Vue 源码目录，插件无法以稳定包的形式复用。
2. 插件可以使用自己的页面入口，但没有 Vue、React 等框架的统一工程模板和构建预设。
3. 插件只能加载固定文件入口，开发时没有连接插件 Vite dev server 和 HMR 的流程。

本设计解决上述问题，同时保持插件与宿主的安全隔离和版本边界。

## 2. 目标

- 让 Vue、React、Svelte 和原生 JavaScript 插件都能使用同一套 GuYanTools UI 组件。
- 使用 Web Components 作为跨框架组件边界，避免插件直接依赖宿主 Vue 版本。
- 提取现有通用控件和主题变量，形成可版本化的插件 UI 包。
- 提供统一的插件 SDK、Vite 配置和 CLI。
- 开发时由插件自己的 Vite dev server 提供页面，并通过 HMR 更新 UI。
- 生产时只加载经过构建、校验和打包的静态插件产物。
- 支持一条命令完成校验、构建、打包、Git tag、GitHub Release 和 Marketplace 条目生成。
- 不改变现有的 `permissions`、`capabilities`、manifest 校验和 sandbox 安全模型。

## 3. 非目标

- 不允许市场插件取得 Node、Electron、数据库连接或任意子进程执行权限。
- 不把主窗口 Vue 组件路径作为公共插件 API。
- 不在插件 UI 包中暴露宿主 Pinia store、Vue Router 实例或内部 SCSS 文件。
- 不在第一阶段实现所有复杂宿主组件的跨框架版本。
- 不把开发服务器地址、源码路径、开发 token 写入正式插件注册表或发布产物。

## 4. 现有实现基线

### 4.1 Runtime

插件 manifest 和 runtime API 定义在 `desktop/src/contracts/plugin_host.ts`。宿主通过 `desktop/src/main/plugin-host/ipc.ts` 做权限检查后转发到 host service。`desktop/src/main/plugin-host/runtime_router.ts` 当前按文件路径挂载 UI 和 Worker，安全选项由 `runtime_security.ts` 提供。

当前安全基线必须保持：

- `sandbox: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- `webSecurity: true`
- 禁用 `webviewTag`

### 4.2 UI 组件

通用 Vue 组件当前位于 `desktop/src/windows/main/components/ui/`。组件包括按钮、输入框、选择器、Tabs、Card、Dialog、Drawer、Field、Switch、Checkbox、Tooltip 等，也包含依赖宿主行为的文件选择、树、图标和菜单组件。

这些组件需要按“可跨框架基础控件”和“宿主专用控件”拆分，而不是把整个目录直接发布给插件。

### 4.3 构建链

桌面端使用 Vite、Vue 3、Electron Forge 和 TypeScript。插件 preload 已经有独立构建入口 `desktop/vite.preload-plugin.config.ts`。新的插件工具链应复用现有 manifest 和 preload 合同，但不能让插件直接 import desktop 源码。

## 5. 方案比较

### 方案 A：Web Components + Design Tokens（采用）

公共组件以 Custom Elements 和 DOM 事件作为稳定边界，主题以 CSS Custom Properties 提供。Vue、React 和其他框架只负责渲染这些元素。

优点：

- 不绑定插件框架和宿主 Vue 版本。
- 同一组件可以被 Vue、React、Svelte 和原生 JavaScript 使用。
- Shadow DOM 和 Token 继承适合隔离插件样式。
- 后续可以替换组件内部实现，而不改变插件 API。

代价：

- 需要定义属性、属性类型、DOM property 和 CustomEvent 约定。
- React 需要一层类型和事件封装。
- 现有复杂 Vue 组件不能全部自动转换。

第一阶段允许使用 Vue 3 `defineCustomElement` 将可移植的现有 Vue 组件包装为 Custom Elements，以降低迁移成本。插件只依赖生成后的 DOM 契约，不依赖宿主 Vue。后续可以把组件内部逐步迁移到真正的框架无关实现，而不改变标签和事件接口。

### 方案 B：CSS Tokens + Vue/React 两套组件包

分别维护 `@guyantools/plugin-ui-vue` 和 `@guyantools/plugin-ui-react`。优点是框架体验更自然，初期复用现有 Vue 组件也更直接。缺点是组件实现和版本会分叉，Svelte、原生 JavaScript 等使用者还需要第三套 API，不符合统一跨框架边界。

### 方案 C：iframe 组件服务

插件只通过 iframe 加载官方组件页面，通过 postMessage 通信。隔离性强，但布局、表单、弹窗和主题同步成本高，插件无法自然地把组件嵌入自己的页面，不适合作为 GuYanTools 的主要 UI 方案。

## 6. 目标架构

```text
                  +---------------------------+
                  | @guyantools/plugin-cli    |
                  | create/dev/build/pack     |
                  | publish                   |
                  +-------------+-------------+
                                |
                  +-------------v-------------+
                  | @guyantools/plugin-vite  |
                  | Vue/React build preset   |
                  +-------------+-------------+
                                |
       +------------------------+------------------------+
       |                        |                        |
+------v------+          +------v------+          +------v------+
| Vue plugin  |          | React plugin|          | Other plugin|
| own runtime |          | own runtime |          | DOM runtime |
+------+------+          +------+------+          +------+------+ 
       \                        |                        /
        +-----------------------v-----------------------+
        | @guyantools/plugin-ui                        |
        | Custom Elements + tokens.css + theme bridge  |
        +-----------------------+----------------------+
                                |
                     +----------v----------+
                     | Plugin WebContents  |
                     | preload pluginAPI   |
                     +----------+----------+
                                |
                     +----------v----------+
                     | GuYanTools Host     |
                     | IPC + permissions   |
                     +---------------------+
```

新增包建议放在根 workspace 的 `packages/` 下：

```text
packages/
  plugin-ui/
  plugin-sdk/
  plugin-vite/
  plugin-cli/
```

根 `pnpm-workspace.yaml` 需要将 `packages/*` 纳入 workspace。桌面端和 `multi_platform_core` 继续保持现有包边界。

## 7. `@guyantools/plugin-ui`

### 7.1 公共出口

```text
@guyantools/plugin-ui/tokens.css
@guyantools/plugin-ui/components.js
@guyantools/plugin-ui/theme.js
@guyantools/plugin-ui/vue
@guyantools/plugin-ui/react
```

`components.js` 注册带 `gt-` 前缀的 Custom Elements。组件事件统一使用 `gt-*` 命名，避免与宿主或浏览器事件冲突。

第一批组件：

- `gt-button`
- `gt-icon-button`
- `gt-input`
- `gt-textarea`
- `gt-select`
- `gt-checkbox`
- `gt-radio`
- `gt-switch`
- `gt-tabs`
- `gt-card`
- `gt-field`
- `gt-dialog`
- `gt-drawer`
- `gt-empty-state`
- `gt-tag`
- `gt-tooltip`

组件接口示例：

```html
<gt-button variant="primary" size="sm">保存</gt-button>
<gt-input placeholder="搜索" value="demo"></gt-input>
<gt-dialog open></gt-dialog>
```

组件应优先使用标准 DOM property 传递对象和数组，HTML attribute 只承载字符串、数字和布尔值。事件携带结构化 `event.detail`，不依赖 Vue emit 或 React synthetic event。

### 7.2 Design Tokens

Token 使用 `--gt-*` 前缀，至少覆盖：

- 背景、表面、文本、弱文本、边框、主色、状态色；
- 字体族、字号、字重、行高；
- 间距、控件高度、圆角、阴影和动效时长；
- light/dark 主题和高对比度状态。

Token CSS 必须是独立文件，插件可以单独 import，不需要引入组件 JavaScript。组件使用 Shadow DOM 时，Token 从宿主元素继承到 Shadow Root。

### 7.3 宿主组件迁移策略

现有 Vue 页面先不整体重写。迁移分三类：

1. 可移植基础控件：抽取为 Custom Element，并由现有 Vue 组件包装或替换。
2. 可移植复杂控件：先保留 Vue 实现，定义跨框架接口后再迁移。
3. 宿主专用控件：继续留在桌面端，不进入插件 UI 包。

这样可以先发布稳定的插件 UI 包，不阻塞主窗口现有页面。

## 8. `@guyantools/plugin-sdk`

SDK 从当前 desktop 内部 SDK 抽取独立类型包，包含：

- `PluginRuntimeApi` 和 `PluginRuntimeContext`；
- manifest、permission、capability 和 contribution 类型；
- `pluginAPI` 全局类型声明；
- UI 主题读取与变化订阅；
- Job、FileGrant、Network、Media 和 Secret 类型；
- 版本兼容检查辅助函数。

插件代码只使用：

```ts
import { pluginAPI } from '@guyantools/plugin-sdk';
```

不能从插件中 import `desktop/src`、Electron、Node、主进程 service 或宿主 Pinia store。

新增 UI 主题 API：

```ts
pluginAPI.ui.getTheme(): Promise<{
  mode: 'light' | 'dark';
  tokensVersion: string;
}>;

pluginAPI.ui.onThemeChanged(
  listener: (theme: { mode: 'light' | 'dark'; tokensVersion: string }) => void,
): () => void;
```

## 9. `@guyantools/plugin-vite`

插件 Vite 预设统一处理框架、入口、资源路径和产物目录：

```ts
import { defineGuYanPluginConfig } from '@guyantools/plugin-vite';

export default defineGuYanPluginConfig({
  framework: 'react',
  uiEntry: 'src/ui/main.tsx',
  workerEntry: 'src/worker/index.ts',
});
```

预设负责：

- Vue/React 插件编译器配置；
- 开发服务器固定监听 `127.0.0.1`；
- 开发环境 HMR 和生产环境 `base: './'`；
- UI、Worker 和静态资源输出；
- manifest 复制和入口路径检查；
- source map、资源哈希和产物清单；
- 禁止把开发 URL 写入生产 manifest；
- 统一的 `dist/index.html`、`dist/worker.js` 输出。

生产目录：

```text
dist/
  index.html
  assets/
  worker.js
  guyantools.plugin.json
```

## 10. 插件 CLI

### 10.1 命令

```bash
guyantools-plugin create <name> --framework vue|react
guyantools-plugin dev
guyantools-plugin validate
guyantools-plugin build
guyantools-plugin pack
guyantools-plugin publish
```

### 10.2 创建模板

模板生成：

```text
guyantools.plugin.json
package.json
vite.config.ts
src/ui/
src/worker/
tests/
README.md
LICENSE
```

模板中的 `package.json` 应提供：

```json
{
  "scripts": {
    "dev": "guyantools-plugin dev",
    "build": "guyantools-plugin build",
    "validate": "guyantools-plugin validate",
    "pack": "guyantools-plugin pack",
    "publish": "guyantools-plugin publish"
  }
}
```

### 10.3 校验

`validate` 必须检查：

- manifest schema、ID、版本、入口和 capabilities；
- hostVersionRange、pluginApiVersion 和 uiApiVersion；
- 权限与 capability 分离声明；
- 所有 entry 位于插件目录内；
- 所有贡献点 ID 唯一；
- 生产 manifest 不含 dev 配置；
- 插件代码没有 import desktop 私有路径；
- 构建后产物入口存在且可加载。

## 11. Vite HMR 开发模式

### 11.1 开发流程

```text
guyantools-plugin dev
  -> 启动插件自己的 Vite dev server
  -> 监听 127.0.0.1 随机端口
  -> 创建临时 DevSession
  -> 连接已运行的 GuYanTools
  -> PluginRuntimeRouter 加载 dev URL
  -> Vite HMR 更新 UI
```

开发会话结构：

```ts
interface PluginDevSession {
  pluginId: string;
  rootPath: string;
  uiUrl: string;
  workerUrl?: string;
  host: '127.0.0.1';
  port: number;
  sessionToken: string;
  processId?: number;
  startedAt: string;
}
```

### 11.2 连接协议

CLI 和桌面端通过本地认证通道交换 DevSession。首选 Windows named pipe，其他平台使用 Unix domain socket；无法使用本地 socket 时才回退到 loopback HTTP。

通道要求：

- 每次会话生成随机 token；
- token 只保存在内存和临时 session 文件中；
- session 必须绑定插件 ID 和真实目录；
- UI/Worker URL 必须是 `127.0.0.1`；
- 远程 HTTP、局域网地址和 Marketplace 插件不能进入 dev session；
- dev session 不写入正式插件 registry；
- 用户在插件管理页明确开启开发模式后才能连接。

### 11.3 Runtime 改造

`PluginRuntimeRouter` 增加 dev session 分支：

```text
生产 UI     -> file:///.../dist/index.html
开发 UI     -> http://127.0.0.1:<port>/index.html
生产 Worker -> file:///.../dist/worker.js
开发 Worker -> http://127.0.0.1:<port>/worker.html
```

无论加载来源，均继续使用插件 preload 和 sandbox webPreferences。开发模式只允许启用 DevTools 和 source map，不放宽 Node、Electron 或任意 IPC 权限。

### 11.4 HMR 与失败恢复

- UI 优先使用 Vite 原生 HMR；
- HMR websocket 断开时自动重连；
- HMR 更新失败时回退整页刷新；
- Vite server 重启时保留插件记录并重新 attach；
- Worker 第一阶段采用变更后重启，避免旧逻辑继续运行；
- 页面显示本地开发状态、连接状态和最后一次错误；
- 停止开发会话时关闭 dev server、Worker 和挂载的 WebContentsView。

## 12. Manifest 设计

生产 manifest 扩展为 `schemaVersion: "1.1"`，增加 UI 合同信息，但不记录开发地址：

```json
{
  "schemaVersion": "1.1",
  "id": "example.media-tool",
  "name": "example-media-tool",
  "displayName": "媒体工具",
  "version": "1.0.0",
  "pluginApiVersion": "1.0.0",
  "uiApiVersion": "1.0.0",
  "ui": {
    "theme": "guyantools",
    "components": "@guyantools/plugin-ui"
  },
  "runtime": "hybrid",
  "entry": {
    "ui": "dist/index.html",
    "worker": "dist/worker.js"
  },
  "permissions": ["network.fetch", "storage.self", "jobs.manage"],
  "capabilities": [],
  "contributes": {
    "pages": [{ "id": "main", "title": "媒体工具" }]
  }
}
```

开发配置使用临时的 `guyantools.plugin.dev.json` 或内存 DevSession，不进入发布包：

```json
{
  "pluginId": "example.media-tool",
  "uiUrl": "http://127.0.0.1:5173/index.html",
  "workerUrl": "http://127.0.0.1:5173/worker.html",
  "sessionToken": "generated-at-runtime"
}
```

Marketplace catalog 继续只记录仓库、ref、resolved commit、版本、权限和 capability 摘要。catalog 与真实 manifest 不一致时安装失败。

## 13. 一键构建、打包与发布

### 13.1 本地发布流程

```text
validate
  -> build
  -> test
  -> pack
  -> sha256
  -> git tag
  -> GitHub Release
  -> catalog-entry.json
  -> push 或创建 Marketplace PR
```

`pack` 输出：

```text
dist/releases/example.media-tool-1.0.0.zip
dist/releases/example.media-tool-1.0.0.sha256
dist/releases/catalog-entry.json
```

发布包只包含：

- `dist/` 构建产物；
- `guyantools.plugin.json`；
- README、LICENSE 和必要的静态资源。

不包含 `node_modules`、源码缓存、开发配置、session token 和本地路径。

### 13.2 Marketplace 发布

发布配置建议位于插件仓库的 `.guyantools/publish.json`：

```json
{
  "repository": "https://github.com/example/example-media-tool.git",
  "marketplace": "sakurapole",
  "catalogMode": "pull-request",
  "releaseAsset": true
}
```

`publish` 使用 GitHub token 或 GitHub CLI 完成 release 和 catalog 更新。官方 Marketplace 默认使用 pull request，个人 Marketplace 可以直接提交到自己的 catalog 仓库。没有仓库写权限时，CLI 必须明确报错，不能假装发布成功。

### 13.3 CI

插件仓库的 CI 必须至少执行：

- `pnpm install --frozen-lockfile`；
- `guyantools-plugin validate`；
- `guyantools-plugin build`；
- 单元测试和 Vue/React fixture 构建；
- 产物 manifest 校验；
- zip 和 SHA-256 生成；
- tag 与 Marketplace catalog 摘要一致性检查。

## 14. 宿主改造边界

需要修改的宿主模块：

- `desktop/src/contracts/plugin_host.ts`：manifest 1.1、UI theme API、DevSession、host API；
- `desktop/src/core/plugin_core/sdk/`：SDK facade 和主题事件；
- `desktop/src/core/plugin_core/preload.plugin.ts`：保持安全的 runtime bridge；
- `desktop/src/main/plugin-host/runtime_router.ts`：file URL / dev URL 双模式；
- `desktop/src/main/plugin-host/ipc.ts`：dev session、主题同步和状态通知；
- `desktop/src/main/plugin-host/runtime_security.ts`：loopback dev origin 校验；
- `desktop/src/main/plugin-host/manifest_resolver.ts`：manifest 1.1 和 UI 合同校验；
- `desktop/src/main/plugin-host/lifecycle_manager.ts`：dev session 不进入正式安装生命周期；
- `desktop/src/windows/main/pages/Plugins/Plugins.vue`：开发模式开关、连接状态和停止操作。

不需要修改的边界：

- plugin capability 的业务语义仍由插件实现；
- 网络、文件、下载、Job 和媒体服务继续保持站点无关；
- 插件权限仍由 manifest、approvedPermissions 和 sender context 三者共同约束；
- Marketplace 安装继续使用真实仓库 manifest 二次校验。

## 15. 测试与验收标准

### 15.1 UI 包

- Vue 页面可以加载全部第一批 `gt-*` 元素；
- React 页面可以加载同一批元素并接收 `CustomEvent.detail`；
- 组件不依赖宿主路由、Pinia 或 Electron；
- light/dark 主题切换后 Token 和组件视觉状态同步；
- 组件前缀、事件名和 Token 名称不会与宿主冲突。

### 15.2 构建与运行时

- Vue fixture 和 React fixture 都能生成有效 `dist/index.html`；
- 生产产物可以被现有 PluginRuntimeRouter 挂载；
- Worker fixture 能在 hybrid 插件中启动和停止；
- manifest 中的 entry 路径只指向插件目录内文件；
- 插件不能 import desktop 私有源码或 Node/Electron API。

### 15.3 热加载

- `guyantools-plugin dev` 能启动 Vite server 并连接运行中的 GuYanTools；
- 修改 Vue/React UI 源码后，插件页面在不重新安装的情况下更新；
- dev server 重启后可以自动重连；
- 非 loopback URL、错误 token、错误 pluginId 和非开发模式连接全部拒绝；
- 停止开发后没有残留 Worker、端口或 WebContentsView。

### 15.4 发布

- `validate -> build -> pack` 在干净环境完成；
- 发布包不含 dev 配置、session token、node_modules 和绝对路径；
- Git tag、release asset、manifest 版本和 catalog 摘要一致；
- Marketplace 安装后仍能通过现有权限确认和 manifest 二次校验；
- 发布权限不足、构建失败或 catalog 更新失败时返回失败状态，不产生半成功记录。

## 16. 实施阶段

### 阶段 1：UI 包和 Token

建立 `@guyantools/plugin-ui`，提取 Token，完成第一批基础控件和 Vue/React fixture。

### 阶段 2：SDK 和 Vite 预设

建立 `@guyantools/plugin-sdk`、`@guyantools/plugin-vite` 和 Vue/React 插件模板，完成生产构建产物与 manifest 1.1。

### 阶段 3：Vite HMR

增加 DevSession、本地认证通道、runtime dev URL、UI HMR、Worker 变更重启和 Plugins 页面开发状态。

### 阶段 4：CLI 发布

实现 validate、build、pack、publish，接入 GitHub Release 和 Marketplace catalog PR。

### 阶段 5：复杂组件与贡献点

根据真实插件需求迁移复杂组件，并继续实现 widgets、menus、shortcuts 和 backgroundTasks 的宿主装配。

## 17. 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| 现有 Vue 组件依赖宿主状态 | 第一批只迁移纯 UI 控件，复杂控件保留宿主实现 |
| React 对 CustomEvent 类型支持较弱 | 提供 `@guyantools/plugin-ui/react` 类型包装 |
| 组件包升级导致插件页面变化 | `uiApiVersion`、Token 版本和语义化版本约束 |
| dev server 被滥用访问远程资源 | 只允许 loopback、随机 token 和显式开发模式 |
| HMR 后 Worker 使用旧代码 | 第一阶段 Worker 变更后强制重启 |
| Marketplace 发布部分失败 | 发布流程分阶段记录，任何一步失败都返回失败状态并保留可重试信息 |
| Shadow DOM 与宿主主题不一致 | Token 继承加 `ui.getTheme/onThemeChanged` 双重同步 |

## 18. 结论

采用 Web Components + Design Tokens 作为插件 UI 的稳定边界，插件框架由 Vue、React 等项目自行选择；采用插件自带 Vite dev server 与 GuYanTools DevSession 连接实现开发 HMR；采用统一 CLI 完成构建、打包、GitHub Release 和 Marketplace catalog 更新。

该架构复用现有 UI 资产，但不把宿主 Vue 源码、状态和内部 API 变成插件依赖；生产环境保持静态、安全和可校验，开发环境提供接近普通 Vite 项目的热更新体验。
