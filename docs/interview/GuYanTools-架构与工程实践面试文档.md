# GuYanTools 架构与工程实践面试文档

> 用途：将简历中的技术描述还原为可被代码、目录和测试追问的面试叙事。回答时应以“问题—设计—关键取舍—代码证据—结果/边界”为主线，避免只罗列技术名词。

## 一、项目一句话介绍

GuYanTools 是一个基于 Electron + Vue 3 + TypeScript 的跨平台桌面工具平台。桌面端负责窗口编排、用户交互和权限边界；Rust 核心库负责 PTY、SSH、FTP/SFTP、SQLite 持久化、知识库、Todo 与同步等高可靠能力；插件平台通过 Manifest、权限、能力、运行时路由和生命周期管理，把第三方业务逻辑放进沙箱，同时向插件提供站点无关的网络、文件、下载、Job、媒体和密钥能力；Stencil 组件库则为内置页面和插件 UI 提供跨框架组件。

面试中的核心定位：我做的不只是功能页面，而是把“桌面壳—类型化 IPC—原生核心—可扩展插件—跨框架 UI”拆成可演进的边界。

## 二、90 秒自我介绍版本

我负责 GuYanTools 的桌面端架构和跨端能力建设。首先，我把 Electron 主进程、Preload、Renderer 和多窗口入口分开，Renderer 不直接接触 Node、Electron 或数据库，所有能力都通过 contracts 定义的类型化 IPC 暴露。其次，我用 Rust 和 SQLite 承担终端 PTY、SSH、FTP/SFTP、知识库、Todo 及同步服务，通过 napi-rs 给 Electron 提供异步 API 和事件流。再次，我设计了插件平台：Manifest 描述入口、权限和业务能力，安装器支持 Git/市场来源，运行时根据插件身份、窗口和 trust level 路由调用，并在每次宿主能力调用前做权限检查。最后，我用 Stencil 生成 Web Components，并输出 Vue、React 适配层，使内置应用和插件共享同一套 token、组件行为和可访问性约束。我的设计重点是最小权限、可测试边界和站点业务与宿主原语解耦。

## 三、整体架构与数据流

```text
Renderer / Vue 页面 / 多窗口
        │  仅访问 window.xxxApi（类型来自 contracts）
Preload（contextBridge 白名单 + ipcRenderer.invoke/on）
        │  domain:action IPC 通道
主进程 Main（按领域注册 ipc handlers、窗口管理、权限/生命周期）
        ├── Plugin Host（manifest、安装、路由、权限、宿主服务）
        ├── Window Managers（main、terminal、quick-launch、notification、screenshot、workspace 等）
        └── napi-rs
             │
Rust Core（Service + Database + migrations）
        ├── terminal / PTY
        ├── ssh / port-forward / known-hosts
        ├── ftp / SFTP / transfer queue
        ├── knowledge / todo / sync services
        └── SQLite（事务、迁移、索引）
```

一次典型调用为：`TerminalPage.vue` 调用 `window.terminalApi.createSession`，Preload 转成 `terminal:create-session`，主进程 handler 校验输入并调用 `JsTerminalHost.createSession`，Rust 创建 PTY、启动 shell 并通过事件 sink 推送输出；Renderer 只消费 `TerminalEventEnvelope`，不接触进程句柄或文件描述符。

## 四、简历要点与代码证据

| 简历表述 | 可核对代码 | 面试应强调 |
|---|---|---|
| 主进程、Preload、Renderer、多窗口拆分 | `desktop/src/main/index.ts`、`desktop/src/preload.ts`、`desktop/src/windows/*` | 每个窗口有独立入口；主进程集中注册领域 IPC，避免窗口间共享状态泄漏 |
| 类型化 IPC 契约 | `desktop/src/contracts/*.ts`、`desktop/src/preload.ts`、`desktop/src/main/*/ipc.ts` | 通道采用 `domain:action`；请求、响应、事件 envelope 共享类型 |
| Rust + SQLite 核心服务 | `multi_platform_core/src/services/*`、`src/db/*`、`migrations/001~033` | Service 返回 `DbResult<T>`；结构变更先迁移再同步 model/service/binding |
| PTY、SSH、FTP/SFTP | `src/terminal/mod.rs`、`src/ssh/*`、`src/ftp/*`、`Cargo.toml` | `portable-pty`、`russh`、`russh-sftp`、`suppaftp`；传输任务有进度、重试和恢复状态 |
| napi-rs 暴露 Electron | `multi_platform_core/src/bindings/napi.rs`、`index.d.ts` | `JsTerminalHost`、`JsDatabase` 和大量领域方法；异步运行时使用 Tokio |
| 插件 Manifest/权限/能力/生命周期 | `desktop/src/main/plugin-host/{manifest_resolver,permission_manager,capability_registry,lifecycle_manager}.ts` | 权限是“能调用什么”，能力是“业务声明什么”；两者不能混为一谈 |
| Git 安装、市场、更新回滚 | `git_installer.ts`、`marketplace_resolver.ts`、`plugin_registry.ts`、`migrations/031_add_plugin_platform.sql` | 记录 source、commit、hash、当前/上一版本路径，支持失败回滚 |
| 宿主通用能力 | `host_services.ts`、`services/{network,files,downloads,job,media,secret}_service.ts` | API 站点无关；插件自己实现站点解析，宿主只负责安全原语 |
| Stencil 跨框架组件 | `packages/ui-core/stencil.config.ts`、`packages/ui-vue`、`packages/plugin-ui` | 输出 custom-elements、Vue proxies、React wrappers；插件可复用 token 和组件 |

## 五、重点专题一：Electron 分层与类型化 IPC

### 5.1 为什么要拆分

Electron 的 Renderer 默认拥有较高风险面。若页面直接调用 Node/Electron，会导致任意页面脚本都可能触达文件、进程或凭据。项目采用“Renderer 无权限、Preload 白名单、Main 执行特权、Rust 承担核心逻辑”的分层：

1. `contracts` 先定义输入、输出和事件类型。
2. Preload 通过 `contextBridge.exposeInMainWorld` 暴露窄 API，不暴露原始 `ipcRenderer` 能力给业务页面。
3. Main 按领域注册 `ipcMain.handle`，做参数校验、窗口来源检查和服务编排。
4. Renderer 使用 Pinia/store/composable 消费 API 与事件，不保存原生句柄。

### 5.2 多窗口设计

主窗口之外，仓库有 terminal、quick-launch、quick-note、notification、screenshot、workspace-window、ai-canvas-preview 等独立入口。每个窗口有自己的 `main.ts` 和 App，窗口管理器在主进程负责创建、显示、复用、销毁和边界同步。这样可以让全局快捷启动、截图标注、终端分离窗口拥有不同尺寸、生命周期和权限，而不把主窗口 store 泄漏过去。

### 5.3 高频追问与回答

**问：为什么不用 `ipcRenderer.send` 到处发？**

答：请求/响应使用 `invoke/handle`，错误能沿 Promise 返回且类型更清晰；持续输出使用命名事件和 unsubscribe。通道和 payload 在 contracts 中集中定义，便于审查和重构。

**问：类型化是否等于运行时安全？**

答：不等于。TypeScript 只约束编译期，因此 Main 仍需对文件路径、枚举、大小、来源窗口和权限做运行时校验。插件运行时另有 `context_guard` 和 `permission_manager` 做调用前检查。

## 六、重点专题二：Rust 核心与 SQLite

### 6.1 Service 分层

Rust 采用 `models → migrations → services → bindings` 顺序。数据库访问集中经过 `Database::with_connection` 或事务；业务服务返回统一 `DbResult<T>`，把 SQLite 错误转换为可跨语言传递的错误。迁移从 `001_init.sql` 到 `033_cleanup...sql` 顺序执行，插件平台的数据表包括安装、市场、Job、文件授权和密钥。

### 6.2 终端 PTY

创建终端时，Rust 根据 profile 解析 shell 和参数，规范化 cwd，调用 `portable_pty` 创建 master/slave，启动子进程，保存 session descriptor，并把 reader/writer 与会话生命周期绑定。输入、resize、kill、attach 和 detached view 均通过 `JsTerminalHost` 暴露；输出以事件 sink 推送，避免 Renderer 轮询。

### 6.3 SSH 与 FTP/SFTP

SSH 模块覆盖 profile、known hosts、密钥/证书、端口转发和会话事件；FTP 模块覆盖连接、目录操作、上传下载、目录归档、并发队列、进度、失败重试和恢复状态。协议实现留在 Rust，Renderer 只处理可展示的条目和任务状态。

### 6.4 知识库、Todo、同步

知识库包含 library/space/tree/page、快速笔记、资源、全文检索、索引 Job、标签、链接图和 embedding 候选；Todo 有列表、步骤、提醒、My Day、搜索和排序；同步服务有 profile、outbox、object state、conflict 和 resolved 状态。跨设备一致性依靠迁移、事务和同步元数据，而不是在 Vue 页面临时拼装。

### 6.5 高频追问

**问：为什么核心用 Rust 而不是全部 TypeScript？**

答：PTY、SSH、文件传输、并发取消和跨平台资源释放更适合强类型、明确所有权的实现；SQLite 事务和错误边界也集中在核心层。TypeScript 保留在交互编排和 UI，减少跨进程 payload 复杂度。

**问：如何避免迁移漏同步？**

答：把 migration、Rust model/service、napi 方法和 TypeScript contract 作为一个变更单元；在同一 PR 中检查迁移注册、绑定生成声明和目标端调用，并运行 Rust tests、桌面 typecheck 与针对性 Vitest。

## 七、重点专题三：沙箱插件平台

### 7.1 Manifest、权限、能力

Manifest 至少描述插件 id、版本、入口（UI/worker）、页面、trust level、`permissions` 和业务 `capabilities`。权限示例：`network.fetch`、`downloads.manage`、`jobs.manage`、`tools.ffmpeg`、`secrets.self`；能力示例可以是某站点解析、媒体处理器或工具类型。

关键原则：权限决定宿主是否允许调用，能力描述插件提供的业务功能。比如 B 站解析逻辑属于插件，插件在 Manifest 声明业务能力；宿主只提供受限网络、下载、文件授权和媒体原语，不内置 B 站规则。

### 7.2 安装与生命周期

Git/市场安装流程为：解析来源 → 拉取并锁定 commit → 校验 Manifest → 展示权限 → 用户批准 → 写入安装记录 → 构建/解析入口 → 注册页面与能力 → 启动 runtime。更新保留 `previous_path`，失败时回滚；禁用、启用、卸载、开发会话连接都经过 lifecycle manager，避免残留 worker、页面或 Job。

### 7.3 运行时路由与安全

每次 runtime 调用都携带插件上下文：`pluginId/pageId/trustLevel/runtime/permissions`。Router 先解析调用方身份，再由 guard 检查权限，最后调用 host service。文件访问不是直接给绝对路径，而是创建带 root、accessMode、过期时间、大小上限和 revoked 标记的 `FileGrant`；密钥按插件隔离存储；网络 credential 限制 allowed origins。

### 7.4 高频追问

**问：沙箱能否阻止恶意插件？**

答：目标是最小权限和可审计边界，而不是声称绝对安全。Renderer/worker 不直接拿 Node；宿主能力逐次检查权限、插件身份和授权 grant；安装记录来源、hash、批准权限和状态。真正的 OS 级隔离仍取决于 Electron sandbox、进程模型和发布环境，需要单独做安全评估。

**问：为什么不把所有业务做进 Plugin Host？**

答：那会让平台耦合站点、更新频繁且权限面扩大。Host 只做稳定原语，业务规则在插件中声明和迭代，平台可以独立演进。

## 八、重点专题四：通用宿主能力

SDK 的 `PluginRuntimeApi` 将能力分成 workspace/data/storage/navigation/commands/ui/system/logger/network/files/downloads/jobs/media/android/secrets。当前面试重点可放在五类：

- 网络：请求方法、headers、body、响应类型、超时、最大字节数、重定向和受限 credential。
- 文件：用户选择目录后生成 grant；读写必须带 grantId 和相对目标路径，可撤销、过期和限额。
- 下载与 Job：下载复用 network/files；Job 有 parent、status、progress、currentStep、error、cancel/retry，可恢复和展示。
- 媒体：probe、transcode、preview、writeTags；FFmpeg/FFprobe 作为能力实现细节，不让插件直接启动任意进程。
- 密钥：`secrets.self` 只允许访问当前插件命名空间，底层保存密文，不把凭据写入日志或 Manifest。

## 九、重点专题五：Stencil 组件库

`packages/ui-core/stencil.config.ts` 同时输出 custom elements、Vue proxies 和 React wrappers。`ui-vue` 面向桌面内置 Vue 页面，`plugin-ui` 面向插件；两者共享 tokens 和组件契约。组件通过属性、事件、slot 和 `::part` 形成稳定边界，避免 Vue 包装层依赖 Shadow DOM 内部实现。面试可举 `gt-field`、反馈组件、菜单/弹层和表单控件为例，说明可访问性、主题 token 和跨框架一致性。

## 十、行为题：用 STAR 讲三个故事

### 故事 A：把 Electron 权限收口

- **S**：功能越来越多，直接在 Renderer 使用 Electron 会扩大攻击面且难以维护。
- **T**：建立可审计、可演进的跨进程边界。
- **A**：按领域拆 contracts、Preload API、Main handlers；多窗口独立入口；事件统一 unsubscribe；敏感能力留在 Main/Rust。
- **R**：新增终端、同步、插件等领域时可以沿固定链路接入，Renderer 不需要知道底层实现。

### 故事 B：插件平台解耦

- **S**：站点业务变化快，若写进宿主会造成高耦合和权限膨胀。
- **T**：允许第三方扩展，同时保持最小权限。
- **A**：分离 permissions/capabilities；实现 Git/市场安装、批准权限、运行时身份、FileGrant、Job 和回滚；站点解析放插件。
- **R**：宿主能力可以复用，插件可独立发布；安全策略和生命周期有统一入口。

### 故事 C：原生能力跨端暴露

- **S**：PTY、SSH、传输和 SQLite 在 JS 层容易出现资源释放和并发问题。
- **T**：把高风险、高并发能力放到可控核心层。
- **A**：Rust service + migration + napi binding；事件 sink 推送；错误统一映射；为传输任务增加恢复和重试。
- **R**：桌面层只消费稳定 DTO/事件，核心能力可为 Flutter 绑定预留复用空间。

## 十一、面试官可能继续追问的清单

1. 如果 IPC payload 版本不兼容，如何做版本化和灰度？
2. 如何验证 `event.sender` 确实来自目标窗口，而不是伪造页面？
3. 插件 worker 崩溃时，哪些 Job、页面和 grant 必须回收？
4. Git 安装如何防止分支漂移、供应链篡改和路径穿越？
5. FileGrant 如何防止 `../`、符号链接和超大文件写入？
6. 下载断点续传、取消和重试如何与 SQLite 状态保持一致？
7. SSH known-hosts 变更时如何处理信任提示？
8. SQLite 写冲突和同步 conflict 如何向用户解释并恢复？
9. 为什么选择 Stencil 而不是直接维护 Vue/React 两套组件？
10. 哪些内容已经有自动化测试，哪些仍需要真实桌面/网络环境验证？

回答这些问题时，优先引用具体文件、数据结构和失败路径；如果代码只完成了接口或测试桩，应明确说“已设计/已覆盖边界，但尚未证明生产运行时行为”。

## 十二、验证与成果表达模板

可使用以下表述，避免夸大：

> 我用桌面 typecheck/build、插件平台针对性 Vitest、`git diff --check` 和 Rust tests 验证了编译、契约及核心逻辑；这些检查不能替代真实 Electron 多窗口、远程 SSH/FTP、第三方插件和不同操作系统上的运行时回归，因此现场会把“自动化已验证”和“需要环境验证”分开说明。

建议准备的证据：

- `pnpm --dir desktop run lint`
- `pnpm --dir desktop run build:app`
- `cargo test --manifest-path multi_platform_core/Cargo.toml`
- 插件 SDK/Vite/UI 的 Vitest
- 真实 PTY、SSH host key、FTP 断点续传、插件安装回滚和多窗口关闭场景的录屏或日志

## 十三、最后的反问问题

1. 团队目前更关注桌面安全边界、跨平台原生能力，还是插件生态增长？
2. 插件平台未来是否需要签名、审核和权限分级策略？
3. Rust 核心是否计划继续服务 Flutter/移动端，还是以 Electron 为主？
4. 组件库的版本兼容和 breaking change 由谁负责？
5. 对这类桌面应用，团队如何定义真实运行时回归和可观测性指标？

## 十四、面试前检查表

- 能在 1 分钟内画出 Renderer → Preload → Main → napi → Rust/SQLite。
- 能解释一个 IPC 请求和一个事件流的完整生命周期。
- 能说清 permissions 与 capabilities 的区别，并举一个插件例子。
- 能说明 FileGrant、secret namespace、Job cancel/retry 的安全边界。
- 能指出至少 5 个真实代码路径，而不是只背技术栈。
- 能诚实区分“代码已实现”“有测试覆盖”“需要真实环境复验”。
