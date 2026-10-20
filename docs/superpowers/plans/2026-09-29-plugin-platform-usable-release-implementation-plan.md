# 插件平台可用版本实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可安装、可授权、安全隔离、重启后可恢复且能在 Windows 发行包中实际使用的桌面端第三方插件系统。

**Architecture:** 第三方 UI/worker 统一进入 Electron sandboxed WebContentsView，主进程依据绑定的 runtime identity 仲裁权限和资源。PluginHost 统一管理启停事务、命令/capability 注册、贡献点和 Job；SDK、CLI、Vite 与 manifest 共用契约和发布验证。

**Tech Stack:** Electron Forge/Electron Builder、Vite、Vue 3、TypeScript、Vitest、`@guyantools/plugin-sdk`、仓库已有插件 CLI。

**Spec:** `docs/superpowers/specs/2026-09-29-plugin-platform-usable-release-design.md`。

## Global Constraints

- 桌面 v1 只发布 `schemaVersion: 1.1` 的第三方 `sandboxed` 插件，运行时为 `ui | worker | hybrid`。
- 第三方 JS 不进入 Node UtilityProcess；内置可信 worker 不作为第三方安全承诺。
- 保留既有模块边界、权限名和用户未提交改动；新 IPC 同步维护 `contracts -> preload -> main -> SDK`。
- 宿主提供平台中立原语，业务站点解析留在插件；`permissions` 与 `capabilities` 分开。
- 每个任务先写能在旧实现上失败的行为测试，再修复并复测；只记录实际执行过的命令结果。
- Windows 发行包必须完成真实 Electron 验收；macOS/Linux 只有对应验证后才能标记支持。

## 文件与责任映射

| 区域 | 主要文件 | 责任 |
| --- | --- | --- |
| 清单/安装 | `desktop/src/main/plugin-host/{manifest_resolver,lifecycle_manager,plugin_paths,git_installer,marketplace_resolver}.ts` | 校验、下载、原子激活、权限差异和回滚 |
| 运行时 | `desktop/src/main/plugin-host/{runtime_router,runtime_security,utility_worker_host,index}.ts`、`desktop/src/core/plugin_core/preload.plugin.ts` | sandbox、身份绑定、ready、generation、清理与恢复 |
| API | `desktop/src/contracts/plugin_host.ts`、`desktop/src/preload.ts`、`desktop/src/main/plugin-host/{ipc,host_services,command_router,capability_router}.ts`、`packages/plugin-sdk/src/{contracts,runtime}.ts` | 调用协议、权限、结构化错误与 SDK 一致性 |
| 贡献点/任务 | `desktop/src/main/plugin-host/{contribution_assembler,quota}.ts`、`services/job_service.ts`、`desktop/src/windows/main/pages/Plugins/`、现有 quick launch/菜单接入点 | 用户入口、调度、配额、状态展示 |
| 工具/发行 | `packages/plugin-{cli,vite}/`、`desktop/{forge.config.ts,package.json,scripts/build-electron-vite.mjs}` | 模板、构建、打包、发行包可运行性 |

顺序：任务 1 是契约基线；2-4 构成安全和生命周期门槛；5-7 补调用与用户入口；8-10 完成开发者和发行验收。每任务完成后用 `git diff --check` 检查本任务改动；不要将现有无关工作区文件纳入提交。计划中的接口名是目标契约，实施前与相邻任务保持一致。阶段提交可用 `feat(plugins): ...`、`fix(plugins): ...`、`test(plugins): ...`，提交前按仓库 commitlint 核对。

---

### Task 1：冻结支持矩阵和 manifest 预检（A1、A5、A6）

**Files:** Modify `desktop/src/contracts/plugin_host.ts`、`desktop/src/main/plugin-host/manifest_resolver.ts`、`packages/plugin-sdk/src/contracts.ts`、`packages/plugin-vite/src/manifest.ts`、`packages/plugin-cli/src/commands/validate.ts`; Test `desktop/src/main/plugin-host/manifest_resolver.test.ts`、`packages/plugin-vite/tests/build.test.ts`、`packages/plugin-cli/tests/pack.test.ts`。

**Interfaces:** `validateProductionManifest` 与宿主 resolver 对 schema、runtime、entry、contributes、permissions 和 capability ID 给出一致结论；导出显式 `PluginRuntimeProtocolVersion`，UI/worker SDK 方法表按渠道标明可用性。

- [ ] 写失败用例：未知贡献点、重复/跨插件 ID、`trusted`/`host`、第三方 `utility`、worker 指向裸 JS、entry 越界及 SDK 协议不兼容均拒绝；现有合法 1.1 清单继续通过。
- [ ] 跑 `pnpm --dir desktop run test:plugin-platform`、`pnpm --dir packages/plugin-vite exec vitest run`、`pnpm --dir packages/plugin-cli test`，确认至少新增用例在旧代码失败。
- [ ] 将校验规则复用或以共享数据生成，避免 CLI/宿主出现不同支持集；错误包含字段路径和稳定代码。同步修订模板清单和文档说明。
- [ ] 重跑以上测试与 `pnpm --dir desktop run typecheck`。退出标准：安装前即可识别不可执行的声明，所有支持项有明确宿主入口。

### Task 2：让第三方 worker 真正进入沙箱（A2、A9）

**Files:** Modify `desktop/src/main/plugin-host/{runtime_router,runtime_security,utility_worker_host}.ts`、`desktop/src/core/plugin_core/preload.plugin.ts`、`packages/plugin-vite/src/{config,build}.ts`、`packages/plugin-cli/src/templates/{vue,react}/src/worker.ts`、`desktop/forge.config.ts`; Test `desktop/src/main/plugin-host/{worker_runtime_kind,runtime_security,security_regression}.test.ts` 和一份真实 Electron fixture。

**Interfaces:** `resolveWorkerRuntimeKind(record)` 对第三方仅返回 `browser` 或抛稳定错误；打包产出 `dist/worker.html` 加可在沙箱加载的 JS；宿主 `startWorker(record)` 只加载通过路径校验的 HTML。内置 UtilityProcess 显式登记且 bootstrap 缺失即失败。

- [ ] 写失败测试：第三方 JS 默认值及显式 `utility` 均不能启动 Node 进程；真实 Electron fixture 中 `typeof require/process` 为 `undefined`，合法 SDK 调用成功，裸 JS entry 不会被当页面静默接受。
- [ ] 启动 sandboxed WebContentsView worker；在预加载层只暴露 typed `pluginAPI`，阻断导航、新窗口、原生下载和任意协议。Forge 构建包含所需 preload/worker 资源，内置 UtilityProcess 不再有 bootstrap fallback。
- [ ] 跑 focused Vitest、`pnpm --dir desktop run build:app` 和 Electron fixture。退出标准：恶意代码无法触达 Node/Electron/环境变量，开发模板在发行构建中可加载。

### Task 3：统一运行时身份、ready 和 generation（A3、A4）

**Files:** Modify `desktop/src/main/plugin-host/{runtime_router,index,utility_worker_host,crash_policy}.ts`、`desktop/src/contracts/plugin_host.ts`、`packages/plugin-sdk/src/runtime.ts`; Test `desktop/src/main/plugin-host/{runtime_router,index,runtime_guards}.test.ts`、Electron fixture。

**Interfaces:** `RuntimeHandle` 含 `pluginId/version/generation/runtimeId/ready`；`startWorker(record)` 在入口加载、SDK `ready` 和声明 handler 注册成功后才 resolve；`disposeRuntime(pluginId, generation)` 仅清理匹配代实例。

- [ ] 写失败用例：入口抛错、ready 超时、旧 worker 延迟 exit、页面关闭但 hybrid worker 仍活、启停过程中并发命令等待；断言无假成功和新代误删。
- [ ] 增加 ready 协议、超时/取消、代际比较和页面级/插件级清理。`enablePlugin` 只在 ready 后更新 enabled；旧代事件不得改写新代状态。
- [ ] 跑插件宿主测试及真实 Electron 异常退出 fixture。退出标准：状态与实际运行实例一致，所有 pending 请求有结果或结构化错误。

### Task 4：冷启动恢复与安装事务（A1、A3、A8）

**Files:** Modify `desktop/src/main/plugin-host/{index,lifecycle_manager,plugin_registry,plugin_paths,dependency_resolver}.ts`; Test `desktop/src/main/plugin-host/{index,git_installer,dependency_resolver}.test.ts` 和重启/回滚 Electron fixture。

**Interfaces:** `initialize()` 在数据/市场缓存初始化后对 enabled 记录按依赖序调用同一 `activate(record)`；`activate`/`deactivate` 幂等；`stage -> verify -> swap -> activate -> commit` 任一步失败回滚原版本与授权。

- [ ] 写失败用例：重启后命令/capability/worker 不可用、必需依赖缺失或循环、更新增加权限、激活失败后原版本无法继续运行、卸载后残留句柄。
- [ ] 将启用和恢复共享一条事务路径；先验证再切换，失败撤销本代资源并恢复旧版本。记录错误和可恢复状态，不删除用户数据。
- [ ] 跑 focused Vitest、两次真实 Electron 启动和更新/回滚 fixture。退出标准：冷启动与手工启用表现一致，升级失败不留下混合版本。

### Task 5：完成命令和 capability 的端到端调用（A5）

**Files:** Modify `desktop/src/main/plugin-host/{command_router,capability_router,runtime_router,index,ipc}.ts`、`desktop/src/contracts/plugin_host.ts`、`desktop/src/preload.ts`、`packages/plugin-sdk/src/{contracts,runtime}.ts`; Test `desktop/src/main/plugin-host/{command_router,capability_registry}.test.ts`、`packages/plugin-sdk/tests/runtime.test.ts`、Electron fixture。

**Interfaces:** `invokePluginHandler({ pluginId, generation, targetId, operation, payload, requestId })` 统一命令和 capability 桥；`registerInvokeHandler` 只在 runtime ready 后为 manifest 声明的 capability 登记；应答必须匹配 requestId/generation，超时与禁用返回 `PluginApiErrorPayload`。

- [ ] 写失败用例：经 `pluginHost.executePluginCommand` 和 `CapabilityRouter.invoke` 的生产路径实际返回插件结果；未声明、错误 owner、无 handler、禁用、调用超时均拒绝；页面和 worker 冲突被阻止。
- [ ] 连接宿主和 SDK 的 handler 注册/调用协议，校验操作名及 payload 大小，清理所有 pending 请求；依赖变化后立即阻断消费者。
- [ ] 跑路由/SDK 测试和实际 UI/worker 调用 fixture。退出标准：可发现的命令和 capability 都能调用，禁用后都不可调用。

### Task 6：补齐宿主 API 和 Job 配额（A6、A7）

**Files:** Modify `desktop/src/main/plugin-host/{ipc,host_services,quota}.ts`、`desktop/src/main/plugin-host/services/{job_service,network_service,file_grant_service,downloads_service,media_service,secret_service}.ts`、`packages/plugin-sdk/src/{contracts,runtime}.ts`; Test `desktop/src/main/plugin-host/{runtime_guards,security_regression}.test.ts`、`services/job_service.test.ts`、SDK 契约测试。

**Interfaces:** UI/worker 通过相同的 typed method dispatch 进入同一 host service；`JobService.transition(pluginId, jobId, nextStatus)` 对 `paused -> running` 先获取配额，失败保持 paused；日志记录 payload 副本，不修改传给 handler 的值。

- [ ] 写参数化失败测试覆盖 SDK 宣称的每个方法在 UI/worker 的成功、权限拒绝、owner 错误和结构化错误；添加暂停恢复并发上限、重复终态释放、异常退出、命令 payload 保真、DNS 重绑定、重定向私网和超大流式响应用例。
- [ ] 补全 worker 通道，集中权限和 owner 检查；修正 Job 槽位状态转换，统一事件订阅与清理；将脱敏移到日志副本。网络每跳校验解析地址和凭据 origin，在流式读到上限时中断；保留 spec 中的默认配额。
- [ ] 跑服务、SDK 测试和真实 Electron 权限矩阵 fixture。退出标准：没有“接口存在却在 worker 中不可用”的宣称，Job 并发限制在所有转换中成立。

### Task 7：将贡献点接入用户实际入口（A5）

**Files:** Modify `desktop/src/main/plugin-host/{contribution_assembler,index,ipc}.ts`、`desktop/src/main/shortcuts/service.ts`、`desktop/src/main/quick-launch/{service.ts,providers/plugin_provider.ts}`、`desktop/src/windows/main/{composables/useContextMenu.ts,components/ui/GlobalContextMenu.vue,components/CompArea/CompArea.vue,pages/Plugins/Plugins.vue}`；Create `desktop/src/main/plugin-host/{contribution_integration.test.ts,background_task_scheduler.ts}`。应用菜单若使用 Electron 原生菜单，在主进程既有创建入口挂载并由同一个注册表驱动；不要让 UI 自行执行插件命令。

**Interfaces:** 统一 `registerContributions(pluginId, generation, manifest)` / `unregisterContributions(pluginId, generation)`；菜单、快捷键、后台任务最终调用 Task 5 的命令路由；快捷键冲突返回稳定错误并可在管理页关闭该绑定。

- [ ] 写失败测试：页面/widget/命令/菜单/快捷键/后台任务逐一能触发插件；禁用、升级、崩溃后入口被移除；重复快捷键、缺权限和 headless worker 不 ready 给出用户可见结果。
- [ ] 使用现有菜单、quick launch、页面和 UI 组件接入；后台任务由宿主计时/事件调度，窗口关闭/停用取消。平台上不能可靠实现的入口在 Task 1 清单校验中拒绝。
- [ ] 跑 focused Vitest、桌面 lint/typecheck，并手动走插件管理页。退出标准：每种保留的贡献类型都有真实调用和清理路径。

### Task 8：开发者工具与安装体验闭环（A1、A8）

**Files:** Modify `packages/plugin-cli/src/commands/{create,build,validate,pack}.ts`、`packages/plugin-vite/src/{build,manifest}.ts`、`desktop/src/windows/main/pages/Plugins/{Plugins.vue,PluginDebugPanel.vue}`、`desktop/src/main/plugin-host/{lifecycle_manager,marketplace_resolver}.ts`; Test 对应 CLI/Vite/宿主测试。

**Interfaces:** `create -> build -> validate -> pack` 产出与宿主 resolver 一致的 manifest/entry；管理页明确显示来源、版本、授权差异、签名/回滚/运行错误；市场摘要与真实 manifest 不符时拒绝安装。

- [ ] 写失败集成测试：从模板创建到 pack 再由宿主安装；缺入口、篡改哈希、权限增加、错误版本范围和失败回滚有确定结果。
- [ ] 修复工具链路径和产物布局；让 UI 在授权前展示权限差异，安装/更新/回滚进度与最终状态只采信宿主事件。
- [ ] 跑 CLI/Vite tests、桌面 lint/typecheck 和真实安装流程。退出标准：无需手工改包即可安装并启用模板插件。

### Task 9：真实 Electron 安全与发行验收（A1-A9）

**Files:** Create `desktop/test/plugin-platform/` 下的 fixture、进程测试驱动和恶意插件样例；Modify `desktop/package.json`、`desktop/forge.config.ts` 或 builder 配置中实际缺失的资源声明；Create `docs/superpowers/verification/2026-09-29-plugin-platform-usable-release.md`。

**Interfaces:** 测试驱动启动/退出真实 Electron，独立用户数据目录，记录插件状态和 IPC 结果；测试程序能在 Forge 干净启动和 Windows 安装包上复用。

- [ ] 先让测试在当前实现失败：恶意 Node/路径/跨插件访问、ready 失败、旧实例退出、冷启动、capability 调用、Job 暂停恢复、升级回滚和包内 worker 资源。
- [ ] 修复真实进程揭露的缺陷；在干净依赖目录构建 Forge 和 Windows 安装包，确认 `plugin-worker`/preload/模板资源存在且离线运行。
- [ ] 记录命令、系统、版本、通过/失败/未运行和可复现日志。退出标准：A1-A9 全部通过；若某平台未测，仅标记未验证而不宣称发布支持。

### Task 10：文档、版本契约与发布门禁（A1-A9）

**Files:** Modify `docs/desktop/{PLUGIN_SYSTEM_OPTIMIZATION,PLUGIN_SYSTEM_CAPABILITIES}.md`、`packages/plugin-cli/README.md`、必要的 SDK 文档和模板 README；Modify CI/package scripts 中的插件发布 gate。

- [ ] 逐条把 spec 的 A1-A9 映射到 Task 9 证据；更正旧文档的“已完成”声明，标出当前支持矩阵、第三方 sandbox 限制、迁移和平台验证范围。
- [ ] 执行 `pnpm --dir desktop run lint`、`pnpm --dir desktop run typecheck`、`pnpm --dir desktop run test:plugin-platform`、`pnpm --dir desktop run build:app`、CLI/SDK/Vite 测试、真实进程及 Windows 包验收、`git diff --check`；失败时修复并重跑对应门禁。
- [ ] 按功能边界审查 diff 和提交，排除 `.node`、`target/`、`node_modules/`、构建产物及临时日志。退出标准：发布记录逐项有证据，无“编译通过即平台可用”的推断。

## 计划自检与停止条件

任务 1 覆盖清单/契约，2 覆盖隔离，3-4 覆盖生命周期与恢复，5 覆盖路由，6 覆盖宿主 API/配额，7 覆盖贡献点，8 覆盖工具/安装，9-10 覆盖真实发行验收与文档。只有 Task 9 的真实进程及包内验收通过，才能将本文的目标状态改为“已实现”。若发现现有第三方插件依赖 Node，按迁移要求拒绝其 v1 启用并记录兼容差异，不放宽安全边界。
