# 插件平台可用版本设计规格（桌面端 v1）

> 状态：待实施。本文定义目标行为，不表示当前代码已经满足。基线为 2026-09-29 工作区源码；此前 `plugin-runtime-closure` 文档及其勾选项只能作为开发记录，不能替代本规格的发布验收。

## 1. 目标与边界

用户能从本地目录、Git 或市场目录安装第三方插件，明确批准权限，启用后使用页面、命令和已声明的业务能力；退出并重新启动应用后状态一致；禁用、升级、回滚、卸载和异常退出都能清理运行时资源。插件作者能用仓库内 SDK、Vite 和 CLI 创建、构建、校验、打包一个可在发行版中运行的插件。宿主提供平台中立的网络、文件授权、下载、Job、媒体等原语，站点解析与工作流留在插件内。

**发布范围**：Electron 桌面端，`trustLevel: sandboxed`，`runtime: ui | worker | hybrid`，manifest `schemaVersion: 1.1`。Windows 是必须通过的发行环境；macOS/Linux 使用相同源码和接口，但发行验收须在对应 CI/设备实际跑过后才宣称支持。Flutter 插件执行、任意 Node 原生模块、远程插件代码热加载、第三方 `trusted`/`host` 运行时不属于 v1。

**核心判断**：第三方 JS worker 不能在可直接访问 Node/Electron、宿主环境变量或文件系统的 UtilityProcess 中执行。v1 的第三方 worker 使用 `sandbox: true`、`nodeIntegration: false`、`contextIsolation: true` 的 Electron `WebContentsView`，通过受控 preload 和宿主路由访问能力。`utility` 仅可用于随应用发布且在宿主代码中显式登记的内置受信任 worker；第三方 manifest 即使声明 `workerRuntime: utility` 也必须被拒绝或迁移至浏览器 worker，绝不静默降级。该选择需要在真实 Electron 发行版验证 worker HTML 与 JS bundle 的加载。

## 2. 当前实现基线与待补缺口

| 范围 | 已有基础 | 发布前缺口 |
| --- | --- | --- |
| 清单/安装 | manifest、权限、Git/市场/本地安装、签名策略、版本路径 | 第三方 `utility` 可直达 Node；安装包和 CLI 产物需做端到端验收；权限变更与失败回滚需验证 |
| 运行时 | sandboxed UI/WebContentsView、preload、browser worker 分支、UtilityProcess 分支 | JS 默认走 UtilityProcess；bootstrap 缺失可静默执行原始 worker；启动未等待 ready/入口加载；Forge 路径未纳入 bootstrap |
| 生命周期 | enable/disable、崩溃计数、Job 恢复 | 重启未恢复 enabled 插件的 worker、命令和 capability；页面销毁可能清掉整个 hybrid 插件；旧 worker 退出可误删新 handle |
| 路由 | 命令路由、capability 声明和查找、SDK handler | capability invoke 生产路径未注册 handler；命令测试未覆盖真实宿主链路；SDK 通道在不同 runtime 不一致 |
| 宿主能力 | 权限矩阵、网络/文件/下载/媒体/密钥/Job 服务 | worker 通道不齐；暂停再运行的 Job 可绕过并发配额；真实命令 payload 被日志脱敏函数改写 |
| 贡献点 | pages/widgets/commands/menus/shortcuts/backgroundTasks 聚合 | 菜单、快捷键、后台任务仍缺可调用接入或应明确拒绝声明 |
| 验证 | Vitest、typecheck、桌面构建脚本 | 缺干净 Forge 包、真实 Electron 进程、安全越权、崩溃恢复与升级回滚的发布矩阵 |

基线代码证据见 `desktop/src/main/plugin-host/{runtime_router,utility_worker_host,utility_worker_entry,index,capability_router,contribution_assembler,services/job_service}.ts`、`desktop/forge.config.ts`、`packages/plugin-{sdk,cli,vite}/`。既有文档中“全部阶段落地”等表述应在实施时更正为按验收项逐项结论。

## 3. 契约与安全边界

### 3.1 清单、身份与安装

`manifest.id` 是全局稳定身份。所有 entry 必须解析到已校验的插件版本目录，禁止绝对路径、`..`、符号链接越界及安装后目录替换造成的逃逸；`file:`/自定义协议和开发期 localhost 路径仅按对应白名单加载。安装流程是 `获取候选 -> 校验内容/版本/清单/签名策略 -> 展示权限差异 -> 用户授权 -> 原子激活 -> 记录 resolved/disabled`。安装不自动启用，也不自动批准新增权限。更新先准备新版本，验证通过后切换；启动失败回滚到旧版本和旧授权，保留可解释的错误。卸载停 runtime、撤销临时授权、清理贡献点和版本记录；插件自有持久数据是否删除由明确的 UI 选项控制。

`permissions` 表示对宿主原语的授权；`capabilities` 表示插件对外提供的业务功能，两者不能互相授予权限。`contributes` 声明宿主可见入口，不能凭声明获得命令、文件或网络访问。清单中未知权限、未知 runtime、未支持的贡献点或不兼容版本必须在安装/启用前给出明确错误；不得“展示了但点击无效”。

### 3.2 隔离运行与 IPC

第三方页面和 worker 均由宿主创建的 sandboxed `WebContentsView` 承载。插件代码仅拿到 SDK 暴露的 `pluginAPI`；不得获取 `require`、`process`、Electron、Node、原始 IPC、宿主数据库路径、宿主环境变量。主进程只根据其创建时绑定的 runtime identity 判定 `pluginId`、版本、授权和权限，绝不信任消息自报身份。每个调用校验通道 allowlist、payload schema/大小、权限、所属插件与运行时 generation，并设置超时和取消。外部导航、新窗口、下载及协议跳转默认拒绝，按宿主授权 API 的显式行为放行。

SDK 的 UI/worker 方法支持矩阵以 `desktop/src/contracts/plugin_host.ts` 与 `packages/plugin-sdk/src/contracts.ts` 为单一可检查契约：同一方法在两个 runtime 中行为和结构化错误相同；确有 UI 专属方法在 worker 中返回 `TOOL_UNAVAILABLE`。网络、文件 grant、下载、Job、媒体、密钥、Android 等现有声明项必须逐项标注并用契约测试验证。真实业务 payload 传递原值；脱敏只作用于审计/日志副本。

网络原语只允许 HTTP(S) 公网目标；校验域名解析后的地址，并在每次重定向重新校验协议、目标 IP 和凭据 origin，禁止 DNS 重绑定、私网/回环/链路本地访问及敏感请求头透传。默认超时 15 秒、上限 60 秒；默认响应 8 MiB、硬上限 32 MiB，超限应在流式读取时终止而不是先读完。保留现有每插件网络并发 4、每分钟 120 次、存储 5 MiB、Job 并发 3、每分钟日志 100 条的默认配额；超限返回 `QUOTA_EXCEEDED`，所有槽位在完成、取消、超时、崩溃时释放。调整这些数值需单独评估兼容性并更新设置/文档。

v1 不允许第三方 UtilityProcess。内置可信 worker 若继续使用该技术，必须显式硬编码登记、强制 bootstrap 存在、缩小环境变量集合、等待 ready/入口加载，并验证旧进程退出不能清理新进程；它不通过第三方权限模型作安全承诺。

### 3.3 状态机与恢复

持久状态沿用 `resolved / enabled / disabled / errored / incompatible`，运行中增加非持久的 `starting / ready / stopping` 和单调递增 `generation`。`enable` 先校验兼容性、授权、依赖和资源预算，再创建运行时；只有入口加载完成、SDK ready、注册声明的 handler 并通过健康握手后才将插件记为 enabled/ready。失败释放本次 generation 的 worker、页面、命令、capability、Job 订阅、定时器和配额，不污染下一次启动。

应用启动时读取已启用记录，按依赖顺序逐一恢复并重新注册运行时和贡献点。恢复失败保留可诊断状态并按崩溃策略停用；不得仍显示“已启用”却无法调用。页面关闭只释放该页面 runtime 的 handler、视图和订阅，hybrid 的 worker/插件级注册继续有效。任何异步退出回调必须比较 handle identity/generation 才能移除当前实例。关闭应用、禁用、卸载和版本切换采用同一幂等清理路径。运行中调用在禁用/切换时取消或以结构化错误结束。

### 3.4 命令、capability 与依赖

命令 ID 与 capability ID 均由 manifest 声明并以 `pluginId.` 限定；运行时只能登记自身声明的 ID。宿主调用采用 `{requestId, pluginId, generation, targetId, operation?, payload}`，有明确超时、大小限制和一次性应答。调用前检查提供者已 ready、依赖仍满足、对应权限和操作在清单中；调用后返回结果或 `PluginApiErrorPayload`。页面与 worker 同时实现命令时，manifest 中必须指定唯一 owner 或在安装时拒绝歧义。插件禁用后列表和路由同时失效。capability 匹配仅负责候选发现，选择与调用由宿主统一调度，站点 URL 解析等细节留在插件。

必需依赖缺失时不启动；可选依赖缺失只影响对应调用。提供者被停用或升级时，消费者调用立即得到稳定错误；恢复后按依赖拓扑重建。循环依赖、重复 ID 和 provider 冲突在启用前拒绝。

### 3.5 贡献点、Job 与用户体验

v1 入口包括页面、widget、命令、应用/上下文菜单、快捷键和后台任务。每种贡献都须有实际宿主挂载点和移除路径。菜单绑定命令；快捷键先检测冲突并在插件管理页允许用户覆盖/禁用；后台任务由宿主调度，只有 `background.run` 已批准且 worker ready 时执行，停用时取消。对无法跨平台可靠实现的贡献点，必须在清单校验时拒绝该平台上的声明，不能仅显示计数。

JobService 由宿主单例持有，UI/worker 共用事件和并发配额。`paused -> running`、retry 和恢复路径先重新取得槽位；终态、取消、插件停用及异常退出准确释放一次。任务记录及事件按 pluginId 隔离。插件管理页展示安装来源、版本、授权差异、运行状态/错误、Job、调试信息；越权、依赖缺失、签名/安装失败、运行时崩溃和回滚结果均有可操作中文提示。插件不可静默打开宿主外部链接、文件路径或全局快捷键。

## 4. 发布验收矩阵

| 编号 | 必须在发行候选中验证的场景 | 通过条件 |
| --- | --- | --- |
| A1 | CLI 模板 build/validate/pack，本地/Git/市场安装 | 同一产物入口可加载，权限需明确批准，更新权限差异可见 |
| A2 | 恶意 JS 尝试 `require/process/fs`、原始 IPC、跨插件 ID、路径/URL 越界 | 均失败且宿主无敏感泄漏；合法 SDK 调用仍可用 |
| A3 | 冷启动、页面切换、hybrid 后台运行、退出重启 | enabled 插件及路由恢复；关页面不杀 worker |
| A4 | worker 入口异常/延迟 ready/崩溃重启、旧实例迟到回调 | 无假成功、悬挂请求或新实例误清理 |
| A5 | 命令、capability、依赖、菜单、快捷键、后台任务 | 用户入口真正调用到插件，禁用后均不可用；冲突可解释 |
| A6 | UI/worker 全部宣称支持的 SDK 方法 | 权限允许时成功；拒绝时统一结构化错误；日志不修改实际 payload |
| A7 | Job 创建、暂停恢复、retry、异常退出、重启 | 并发上限从不突破，资源最终释放，事件不串插件 |
| A8 | 更新、授权增加、失败回滚、卸载 | 活动版本和授权一致，无旧路由/进程/临时 grant 泄漏 |
| A9 | 干净依赖安装、Forge 启动/打包、Electron Builder Windows 安装包 | worker 与 preload 均进入包内，安装后离线运行 A1-A8 代表路径 |

单元测试只能证明各模块逻辑。A2-A4、A9 必须运行真实 Electron 进程和包内资源，记录命令、版本、系统、结果及失败日志。发布清单中逐项标记“通过/未通过/未运行”，不得把 TypeScript 构建或文档检查写成运行时通过。`git diff --check`、`pnpm --dir desktop run lint`、`typecheck`、`test:plugin-platform`、`build:app` 是基础门禁，按涉及范围补 CLI/SDK/Vite 测试。

## 5. 兼容与迁移

- 保留当前 manifest 1.1 字段和现有权限名；引入明确的运行时协议版本，SDK 与宿主不兼容时阻止启用。
- 现有第三方 `workerRuntime: utility` 不再执行。迁移器或安装提示要求重建为 browser worker 入口；不能自动给它 Node 权限。现有纯 JS `dist/worker.js` 模板需改为可在沙箱页面加载的 worker HTML/bundle。
- 旧 enabled 记录在首次启动时经过重新校验及 ready 恢复；失败写入诊断状态，不丢失安装记录和用户数据。
- 对此前只聚合未接入的贡献点，v1 要么完成宿主接入，要么拒绝发布该贡献类型；文档和 UI 需与实际支持集同步。

## 6. 交付定义

所有 A1-A9 有可复现证据，安全边界测试通过，清单/SDK/CLI/宿主版本契约一致，用户可以安装并稳定使用一个含 UI、worker、命令、capability、菜单、快捷键、后台任务和受控文件/网络/Job 能力的示例插件，才称“可用版本”。任何被平台暂不支持的能力应从支持表及模板中去除并在校验时拒绝，不能以部分可发现代替可用。
