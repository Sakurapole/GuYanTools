# 桌面端插件架构分层方案

## 背景与目标

当前桌面端已经有插件目录、npm 安装思路、插件 preload 和 `WebContentsView` 页面装载雏形，但还没有形成一套真正可扩展、可治理、可演进的插件平台。

本方案的目标不是一次性做完完整生态，而是先建立稳定架构骨架，让应用本身的功能继续开发，同时把通用能力沉淀为未来插件 API 的来源。

核心目标：

- 先内聚宿主能力，再开放插件 API
- 支持页面、命令、菜单、快捷键、后台任务等全量系统插件贡献
- 采用双轨插件模型：第三方受限、内部高权限
- 让插件通过宿主注册和白名单 API 扩展，而不是直接操作 Electron / Node / 数据库

## 分层架构

### L0. 宿主基础层

包括：

- Electron 主进程与窗口管理
- preload 桥接
- Rust core 与数据库
- 应用配置、日志和用户数据目录

这一层不直接对插件公开，只作为宿主内部基础设施。

### L1. 宿主能力层

宿主能力统一按能力域组织，不再新增页面专用、零散的 IPC：

- `workspace`
- `data`
- `storage`
- `navigation`
- `commands`
- `ui`
- `system`
- `observability`

这层先服务应用自身，再作为插件 API 的唯一来源。

### L2. 插件平台内核

内核组件固定为：

- `PluginRegistry`
- `PluginManifestResolver`
- `PluginPermissionManager`
- `PluginLifecycleManager`
- `PluginContributionAssembler`
- `PluginRuntimeRouter`

职责：

- 插件发现与索引
- manifest 解析与兼容校验
- 权限判定
- 启用、禁用、安装、卸载
- 将贡献点组装到宿主
- 将运行请求分发到正确运行时

### L3. 运行时层

运行时按职责拆分，不共用单一模型：

- `ui-runtime`：插件页面
- `worker-runtime`：后台任务和命令实现
- `host-runtime`：仅内部 trusted 插件可用的宿主侧扩展

### L4. 贡献层

v1 支持的贡献点：

- `pages`
- `widgets`
- `commands`
- `menus`
- `shortcuts`
- `backgroundTasks`

所有贡献都由宿主注册，插件只提供声明和处理逻辑。

### L5. 插件 SDK 层

SDK 作为唯一公开接入层：

- `@guyantools/plugin-sdk`
- `@guyantools/plugin-sdk-internal`

对外按命名空间暴露：

- `workspace`
- `data`
- `storage`
- `navigation`
- `commands`
- `ui`
- `system`
- `logger`

## 双轨模型

### `sandboxed` 第三方插件

- 只允许 `ui-runtime` 和 `worker-runtime`
- 默认关闭 `nodeIntegration`
- 不允许自带原生模块
- 不允许直接访问数据库、Node、Electron 原语
- 只能通过宿主白名单 API 获取能力

### `trusted` 内部插件

- 允许 `host-runtime`
- 可使用更高权限能力
- 可携带原生能力
- 仍必须走宿主注册、权限和生命周期框架

## Manifest 草案

顶层字段：

- `id`
- `name`
- `version`
- `displayName`
- `description`
- `pluginApiVersion`
- `hostVersionRange`
- `trustLevel`
- `runtime`
- `entry`
- `permissions`
- `contributes`

约束：

- `trustLevel`: `sandboxed | trusted`
- `runtime`: `ui | worker | hybrid | host`

## 运行时模型

统一流程：

1. 插件被发现并进入注册表
2. manifest 被解析和校验
3. 权限和兼容性通过后进入 `resolved`
4. 启用后由贡献组装器注册入口
5. 宿主触发入口时，运行时路由器分发到对应 runtime
6. 插件通过 SDK 调宿主 API
7. 错误、崩溃和超时进入统一状态管理

## 生命周期状态机

固定状态：

- `discovered`
- `installed`
- `resolved`
- `enabled`
- `disabled`
- `errored`
- `incompatible`

## 实施阶段

### Phase 1. 宿主能力内聚

- 保留现有页面能力链路
- 新增宿主内部 service/registry 层
- 新能力不再直接暴露页面定制 IPC

### Phase 2. 插件平台内核

- 建立插件注册表、manifest 解析、权限与生命周期管理
- 保留旧 `plugin_manager` 作为安装分发适配层

### Phase 3. 公共接口

- 固化 manifest
- 固化插件 API 命名空间
- 建立共享类型定义

### Phase 4. 贡献接入

- 路由支持动态插件页面
- 首页和侧边栏支持宿主注册表驱动入口
- 命令、菜单、快捷键、后台任务进入统一贡献模型

### Phase 5. 运行时与权限

- 插件 preload 改为正式 SDK bridge
- 第三方插件按受限沙箱运行
- 内部插件按 trusted 级运行

### Phase 6. 管理 UI 与安装流

- 已安装插件列表
- 启用 / 禁用
- 版本、状态、权限和错误展示
- npm / 本地 / 内部插件接入入口

## 验收标准

- 宿主现有首页布局功能在 service 化后行为不变
- 插件平台可在无插件模式下正常启动
- 第三方页面插件可注册页面与入口，但不能直接访问 Node
- 第三方后台插件可注册命令和任务，但不能加载原生模块
- 内部 trusted 插件可注册宿主侧扩展
- 插件错误、禁用、兼容性状态可被管理 UI 反映

## 与现有分析文档关系

本方案建立在 [PLUGIN_SYSTEM_ANALYSIS.md](./PLUGIN_SYSTEM_ANALYSIS.md) 的结论之上。

分析文档负责回答“当前实现到了哪里、缺了什么”，本方案负责回答“后续应该怎么分层、怎么落地”。
