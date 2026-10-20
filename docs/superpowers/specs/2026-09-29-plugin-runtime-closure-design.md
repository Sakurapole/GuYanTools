# Plugin Runtime Closure Design

> 状态：已确认，进入实现阶段

## 1. 目标

补齐插件平台第一阶段的运行时闭环：插件声明的命令和 capability 必须在启用、禁用、卸载、启动失败和重启恢复路径中保持一致；JobService 必须由宿主统一持有，保证 UI runtime 与 Utility Worker 使用同一事件流和配额状态；插件收到的错误继续使用结构化 `PluginApiErrorPayload`。JS Utility Worker 由宿主 bootstrap 注入同一份 SDK，通过 MessagePort 完成宿主调用、Job 事件和命令 request/response。

## 2. 范围

### 2.1 本阶段实现

1. `contributes.commands` 在插件启用时注册为宿主可执行路由，命令执行转发给插件 runtime，插件禁用或卸载后路由失效。
2. Capability 声明在插件启用时注册；启用前校验必需依赖；禁用、卸载和启动失败清理时注销。
3. `JobService` 在 `PluginHost` 中只创建一个实例。所有 renderer IPC 和 Utility Worker 都使用它；Job 事件订阅与插件 runtime 生命周期绑定。
4. Job 并发配额在任务完成、取消、失败和 runtime 销毁时释放，避免插件重启后永久占用槽位。
5. 命令路由、依赖阻断、Capability 生命周期、Job 事件桥接和配额释放补充单元测试。

### 2.2 明确不在本阶段

- 菜单、全局快捷键和后台任务接入 Electron 调度器。
- 开放第三方 `trusted` / `host` runtime。
- 重构现有 IPC 文件或替换 WebContentsView/UtilityProcess 架构。

## 3. 现状与问题

- `PluginContributionAssembler` 已能读取 commands，但没有把命令贡献注册到 `PluginCommandRouter`。
- `CommandService.executeHost()` 当前只记录日志并返回 `{ accepted: true }`，没有可执行的宿主命令路由。
- `CapabilityRouter` 和依赖解析器已存在，但启用顺序先校验依赖再注册自身 capability；同时缺少稳定的生命周期清理验证。
- `PluginHost` 持有单例 `JobService`，而 `UtilityWorkerHost` 在 `jobs:create` 分支重新 `new JobService`，事件订阅和状态不一致。
- `PluginQuotaService.tryAcquireJobSlot()` 的槽位需要由统一 JobService 在终态释放；runtime 销毁也必须释放剩余槽位。

## 4. 设计

### 4.1 命令贡献路由

插件启用时，宿主为每条 `manifest.contributes.commands` 注册 namespaced command ID。路由 handler 向已注册该命令的活动 runtime 发送 `plugin-runtime:command:invoke`，并等待 runtime 返回结果；没有活动 runtime 时抛出 `PLUGIN_RUNTIME_UNAVAILABLE`。命令执行者仍必须拥有 `commands.execute` 权限，command ID 必须以插件 ID 加点号开头。

插件 SDK 的 `commands.register(commandId, handler)` 在当前 runtime 保存本地 handler。宿主收到 `command:result` 后结束请求；请求带唯一 ID 和 10 秒超时，结果与错误均通过结构化 payload 返回。

为保持现有 API 兼容，`commands.register()` 只登记本地 runtime handler，不再把 `{ __register: true }` 当作一次普通命令执行。

Utility Worker 使用宿主打包的 `plugin-worker.js` bootstrap。bootstrap 在 UtilityProcess 中创建 `pluginAPI`，把 worker entry 作为模块加载；SDK invoke 与 event/command 消息复用宿主建立的 MessagePort。

### 4.2 Capability 生命周期

启用流程顺序固定为：读取记录 -> 校验权限/状态 -> 校验外部依赖 -> 注册自身 capability -> 绑定 Job 事件 -> 启动 worker。任一步失败都注销本插件已注册的 capability、命令和 Job 订阅。

禁用、卸载、启动失败自动禁用和 runtime 销毁都调用同一个清理入口；清理入口必须幂等。

### 4.3 JobService 与配额

`PluginHost.getJobService()` 是唯一构造点。`UtilityWorkerHost` 接收宿主提供的 `JobService` 和配额回调，不再动态导入并实例化数据库服务。

每次 `jobs.create` 成功获得一个 slot，并把 job ID 记录到插件维度；当 Job 状态进入 `completed`、`failed`、`cancelled` 或 `paused` 时释放对应 slot。插件停止时释放该插件所有记录的 slot。重复释放必须无副作用。

### 4.4 错误与安全边界

- 跨插件命令、未声明 capability、未满足依赖和无活动 runtime 均抛出 `PluginApiError`。
- UI IPC 和 Utility Worker 使用相同的错误转换函数。
- 不允许命令 handler 访问原始 Electron、Node 或数据库对象。

## 5. 验收标准

1. 启用带 command contribution 的插件后，命令列表可执行；插件返回值能回到调用方。
2. 插件禁用后，原 command ID 返回 `PLUGIN_COMMAND_NOT_FOUND` 或 `PLUGIN_RUNTIME_UNAVAILABLE`，不能继续执行旧 handler。
3. 必需 capability 缺失时插件不会启动；提供者禁用后消费者再次启动会被阻断。
4. UI runtime 和 Utility Worker 创建的 Job 都能通过同一个 `onEvent` 收到更新。
5. Job 进入终态、插件禁用或 worker 异常退出后，配额槽位可再次获取。
6. `pnpm --dir desktop run test:plugin-platform` 与 `pnpm --dir desktop run typecheck` 通过。

## 6. 风险与回滚

- 现有插件未实现 `commands.onInvoke` 时，命令执行会返回结构化 runtime unavailable 错误，不影响页面加载和其他宿主 API。
- Job 终态字段由现有数据库更新接口提供；若历史记录缺少状态，清理按插件记录表兜底，不修改历史数据。
- 所有变更局限于插件宿主、SDK 合同和测试，不修改插件安装格式或数据库迁移。
