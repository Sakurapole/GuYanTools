# GuYanTools 插件系统优化方案

> 状态：**全部阶段已落地（含 Worker utilityProcess 双轨）**  
> 基线：manifest schema `1.1`、plugin API `1.0.0`、HOST `1.1.0` / policy `2`  
> 关联设计：`docs/superpowers/specs/2026-07-22-plugin-platform-sandboxed-media-design.md`、`2026-07-23-plugin-framework-ui-hmr-publish-design.md`  
> 说明：`PLUGIN_SYSTEM_ANALYSIS.md` 与 `PLUGIN_ARCHITECTURE_PLAN.md` 描述的是早期雏形阶段，以本文件为准。

## 实施状态

| 阶段 | 状态 | 关键交付 |
|---|---|---|
| Phase 1 安全基线 | 完成 | 权限三档矩阵、统一空 approved 安装门、可勾选权限对话框、SSRF、配额、取消自动全量授权 |
| Phase 2 贡献点闭环 | 完成 | 全量 ContributionAssembler、CommandRouter、CapabilityRouter、jobs.onEvent、结构化错误 |
| Phase 3 运行时/可观测 | 完成 | 声明式 IPC 路由表、PluginQuotaService、PluginAuditStore、DataService 去 DB 句柄 |
| Phase 3 追加 | 完成 | 连续启动失败自动禁用（阈值 3）、settings schema 校验、插件调试面板 |
| Phase 4 生态 | 完成 | Ed25519 签名链、catalog/package 验签策略、插件能力依赖、gt-progress/badge/log-view |
| Phase 4 追加 | 完成 | 签名状态 UI 徽章、Worker utilityProcess 双轨（JS worker 默认 utility） |

### 已落地的关键不变量

1. **安装永不自动批准权限**：`approvedPermissions` 缺省为 `[]`，用户在对话框逐项勾选后 `approvePermissions`。
2. **sandboxed 不可拿 builtin 权限**：`data.project.write` / `data.settings.write` 仅 trusted。
3. **网络默认拒内网**：loopback / RFC1918 / link-local / metadata 一律 `PLUGIN_NETWORK_PRIVATE_DENIED`。
4. **响应体硬顶 32MB，默认 8MB**；网络并发 4、日志 100/分、Job 并发 3。
5. **IPC 权限集中声明**：`ipc.ts` 路由表 `channel → permission(s) → handler`，错误统一包装为 `CODE: message`。
6. **贡献点全量可装配**：pages/widgets/commands/menus/shortcuts/backgroundTasks 均从 enabled 插件聚合。
7. **命令真路由**：`PluginCommandRouter` 校验命名空间与所有权，禁用时清理 handler。
8. **能力路由接入**：enable 注册 capabilities，disable/uninstall 注销；支持 host/mime/scheme/url 解析。
9. **连续启动失败 3 次自动禁用**：`PluginCrashPolicy` + 注册表 `consecutiveStartFailures`。
10. **settings schema**：manifest 可声明 `settings`，宿主校验并生成表单/读写接口。
11. **Ed25519 签名链**：package `signature.json` + catalog `signature`；策略 `enforce|warn|off`（环境变量 `GUYANTOOLS_PLUGIN_SIGNATURE_POLICY`，默认 warn）。
12. **插件能力依赖**：manifest `dependencies`，enable 时校验 provider 是否已注册。
13. **Worker 双轨**：manifest `workerRuntime: browser|utility`；`.js/.mjs/.cjs` worker 默认 utilityProcess，HTML worker 仍走 WebContentsView。

### 签名使用

```powershell
# 开发者：生成密钥并打包签名
$env:GUYANTOOLS_PLUGIN_SIGNING_KEY = Get-Content private.pem -Raw
pnpm run pack   # 产出 zip + signature.json + 含 signature 的 catalog-entry.json

# 宿主策略
$env:GUYANTOOLS_PLUGIN_SIGNATURE_POLICY = 'enforce'  # 或 warn / off

# Worker 运行时覆盖（可选）
$env:GUYANTOOLS_PLUGIN_WORKER_RUNTIME = 'utility'    # 强制全部 worker 走 utilityProcess
```

### 验证

```powershell
pnpm --dir desktop run test:plugin-platform   # 30 files / 113 tests passed
pnpm --dir packages/plugin-ui run test        # 4 files / 7 tests passed
pnpm --dir desktop run typecheck             # clean
pnpm --dir desktop run verify:plugin-platform # passed
```

---

## 1. 背景

当前插件系统骨架已经成立：

- 权限与能力分离（`permissions` vs `capabilities`）
- 沙箱基线（`sandbox` / `contextIsolation` / `webSecurity`）
- 插件身份绑定 `webContentsId`，不可伪造
- Git 分发：commit 固定、原子激活、可回滚
- 市场 catalog 与插件 manifest 一致性校验
- FileGrant 路径边界、safeStorage 密钥、跨框架 UI（Custom Elements）

但设计承诺与实现之间仍有断层，核心集中在三类：

1. **授权闭环不完整**：非市场安装路径静默全量授权；权限不能单项拒绝
2. **贡献点与能力路由未接线**：声明了 widgets/commands/shortcuts 等，装配器只做了 pages
3. **安全与可观测不足**：网络无 SSRF 防护、审计只打 console、安全回归几乎为空

本方案给出完整、可分阶段落地的优化路径。

---

## 2. 现状问题清单（带证据）

### 2.1 安全 / 权限

| ID | 问题 | 证据 |
|---|---|---|
| S1 | npm/local 安装自动批准全部权限 | `lifecycle_manager.ts`：`approvedPermissions: manifest.permissions` |
| S2 | 权限对话框只能全量确认 | `PluginPermissionDialog.vue`：无 checkbox、无风险说明 |
| S3 | sandboxed ≈ 全能力面 | `permission_manager.ts`：sandboxed 含 android/fastboot/files.write/ffmpeg/secrets |
| S4 | trusted 与 sandboxed 几乎无差别 | 仅多 `data.project.write` / `data.settings.write` |
| S5 | 无 SSRF 防护 | `network_service.ts` 不拦 loopback / RFC1918 / metadata |
| S6 | 网络响应体默认 512MB | `MAX_RESPONSE_BYTES = 512 * 1024 * 1024` |
| S7 | 旧 npm 路径仍有产品暴露 | `plugin_manager.ts`：字符串版本比较、可执行 npm lifecycle |
| S8 | 安全回归极薄 | `security_regression.test.ts` 仅 2 个用例 |
| S9 | `DataService.getDatabase()` 暴露原生 DB | `host_services.ts`（当前未给插件，但是脚枪） |

### 2.2 设计—实现断档

| ID | 设计承诺 | 实际状态 |
|---|---|---|
| G1 | contributes.widgets/commands/menus/shortcuts/backgroundTasks | 只有 pages 被装配 |
| G2 | CommandService 真正路由 | 只 log 并返回 `{accepted:true}` |
| G3 | CapabilityRegistry 按 host/scheme/mime 路由 | 有类有测，未接入 PluginHost |
| G4 | job.updated / download.progress 事件 | JobService.onEvent 存在，未暴露到 pluginAPI |
| G5 | 结构化 PluginApiError | 插件收到裸 Error 字符串 |
| G6 | 连续崩溃自动禁用 | 未实现 |
| G7 | 存储/网络/磁盘配额 | 未实现 |
| G8 | settings / activationEvents | manifest 无字段 |
| G9 | 权限变更重批 | 更新复用旧 approved，新增权限无 UI 提示 |

### 2.3 工程 / 可观测

| ID | 问题 |
|---|---|
| E1 | `ipc.ts` 巨型开关板，权限检查易漏 |
| E2 | 注册表整条 JSON 塞 SQLite，难查询审计 |
| E3 | Worker 用 WebContentsView 而非 UtilityProcess |
| E4 | 审计只有 console，无持久化 |
| E5 | JobService 在 ipc 中 ad-hoc `new`，事件订阅可能碎片化 |
| E6 | plugin-ui 控件面过窄 |
| E7 | 无插件签名 |

---

## 3. 目标与非目标

### 3.1 目标

1. 所有安装源统一走显式、可单项拒绝的权限批准
2. 权限按风险分层，sandboxed 默认最小集
3. 网络、文件、任务具备可执行的配额与边界
4. 声明的贡献点全部可装配、可路由、可卸载
5. capability 路由真正接入宿主主路径
6. 结构化错误 + 持久化审计 + 安全回归矩阵
7. 旧 npm 路径退出用户可见安装链路

### 3.2 非目标

- 不在本期开放 `trusted` / `host` 给第三方
- 不实现任意 shell / 任意 npm script / 任意原生模块
- 不做跨 Flutter 插件执行协议（继续仅桌面闭环）
- 不在本期完成插件市场签名链（预留接口，单独阶段）

---

## 4. 权限矩阵重划分

### 4.1 三档模型

```
默认档 (default)     → sandboxed 安装时默认勾选，可取消
需批准档 (elevated)  → sandboxed 默认不勾，必须用户显式勾选
仅内置档 (builtin)   → 仅 trusted/host 运行时可用，第三方拒绝
```

### 4.2 权限分档

| 权限 | 档位 | 说明 |
|---|---|---|
| `workspace.read` | default | 只读工作区摘要 |
| `storage.self` | default | 插件私有 KV（有配额） |
| `ui.contribute` | default | 注册页面/widget/命令 |
| `observability.logs` | default | 写插件日志（限速） |
| `network.fetch` | default* | 默认给，但受 SSRF/配额约束 |
| `navigation.open` | default | 打开宿主路由 |
| `system.notifications` | elevated | 通知（限速） |
| `system.dialog` | elevated | 文件/目录选择器 |
| `system.clipboard` | elevated | 剪贴板（读需用户手势） |
| `system.shortcuts` | elevated | 全局快捷键 |
| `files.read` | elevated | 用户授权目录读 |
| `files.write` | elevated | 用户授权目录写 |
| `downloads.manage` | elevated | 直链下载 |
| `jobs.manage` | elevated | 任务队列 |
| `media.preview` / `media.transcode` / `media.tag` | elevated | 媒体原语 |
| `tools.ffmpeg` | elevated | FFmpeg 结构化 API |
| `secrets.self` | elevated | 插件私有密钥 |
| `background.run` | elevated | 后台 worker |
| `commands.execute` | elevated | 执行插件命令 |
| `android.devices.read` | elevated | 设备列表 |
| `android.sessions.read` | elevated | 会话只读 |
| `android.sessions.control` | elevated | 镜像/音频/OTG 控制 |
| `android.audio.playback` | elevated | 音频播放 |
| `android.otg.control` | elevated | OTG 输入 |
| `android.fastboot.read` | elevated | fastboot 读 |
| `android.fastboot.reboot` | elevated | fastboot 重启（高风险） |
| `data.user.read` | elevated | 脱敏用户资料 |
| `data.project.read` | elevated | 项目摘要 |
| `data.settings.read` | elevated | 宿主设置读（key allowlist） |
| `data.project.write` | builtin | 禁止第三方 |
| `data.settings.write` | builtin | 禁止第三方 |

\* `network.fetch` 虽在 default，安装对话框仍展示；拒绝后网络 API 直接 `PERMISSION_DENIED`。

### 4.3 行为规则

1. `approvedPermissions` 缺省为 `[]`，启用前必须完成确认
2. 对话框逐项 checkbox；elevated 默认不勾
3. 权限描述使用中文映射表（见 §4.4）
4. 更新后 `approved ∩ newDeclared` 保留；新增 declared 项标为 pending，UI 提示补批
5. 未批的权限在 IPC 层直接拒绝，不静默降级

### 4.4 权限中文文案（对话框用）

| 权限 | 标题 | 说明 |
|---|---|---|
| `network.fetch` | 访问网络 | 允许插件发起受限制的 HTTP(S) 请求 |
| `files.write` | 写入文件 | 允许写入您选择的目录，范围受限 |
| `android.sessions.control` | 控制 Android 设备 | 允许启动镜像、音频或 OTG 会话 |
| `android.fastboot.reboot` | 重启设备到 fastboot | 可能使设备进入刷机模式，请谨慎授予 |
| `secrets.self` | 保存密钥 | 密钥加密保存在本机，不会明文导出 |
| `downloads.manage` | 管理下载 | 允许创建和控制下载任务 |

（完整表在实现时补全，放在 `permission_copy.ts`。）

---

## 5. 目标架构

```text
┌─────────────────────────────────────────────────────────────┐
│  Installer Gate（所有安装源统一入口）                          │
│  marketplace / git / local / builtin                         │
│  → 解析 manifest → 权限确认 UI → 写 approvedPermissions       │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Plugin Platform Kernel                                      │
│  Registry / ManifestResolver / PermissionManager             │
│  LifecycleManager / ContributionAssembler / CapabilityRouter │
└───────┬───────────────────────────────┬─────────────────────┘
        │                               │
┌───────▼────────┐             ┌────────▼─────────────────────┐
│ Runtime Router │             │ Host Service Registry         │
│ UI: WCV        │             │ Network(含SSRF) Files Jobs    │
│ Worker: UP*    │   IPC+Guard │ Media Secrets Android Audit   │
└───────┬────────┘ ──────────► └──────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────┐
│ pluginAPI (preload)  +  @guyantools/plugin-sdk              │
│ 结构化错误 / 事件订阅 / 权限上下文                           │
└────────────────────────────────────────────────────────────┘
```

\* Worker 迁 UtilityProcess 放在 Phase 3，不阻塞 Phase 1/2。

### 5.1 关键组件职责变化

| 组件 | 现状 | 目标 |
|---|---|---|
| `PluginLifecycleManager` | 各安装源各自写 approved | 统一 `InstallerGate`，强制过确认 |
| `PluginPermissionManager` | 两档几乎全开 | 三档矩阵 + 文案 + 风险标签 |
| `PluginContributionAssembler` | 仅 pages | 全量贡献点装配/卸载 |
| `CommandService` | log 假执行 | 真路由到 worker / 命令处理器 |
| `CapabilityRegistry` | 未接入 | 启用时注册，按 match 路由 |
| `ipc.ts` | 手写 permission | 声明式路由表 `channel → perm → handler` |
| `PluginContextGuard` | include 即过 | + 审计持久化 + 配额检查 |
| `NetworkService` | 协议/头限制 | + SSRF + 速率 + 硬顶响应体 |
| `JobService` | ad-hoc new | 单例注入，事件桥到 pluginAPI |
| `DataService` | 暴露 DB 句柄 | 删除 `getDatabase()` |

---

## 6. 分阶段实施

### Phase 1 — 安全基线收紧（优先做）

**目标：** 所有安装源统一授权；权限可单项拒绝；网络与旧路径风险关闭。

#### 1.1 统一安装授权门

**改动文件：**

| 文件 | 改动 |
|---|---|
| `permission_manager.ts` | 引入三档矩阵 `DEFAULT / ELEVATED / BUILTIN`；`getRiskTier(permission)` |
| `lifecycle_manager.ts` | `installFromPackage` / `registerLocalPlugin` / `installFromGit` 一律 `approvedPermissions: []` 或传入显式 approved |
| `index.ts` (PluginHost) | 所有 install API 等待 `approvedPermissions` 参数；缺省则返回 pending 记录（`status: 'resolved'`, enabled=false） |
| `ipc.ts` | install 相关 handler 强制要求 approved 数组 |
| `PluginPermissionDialog.vue` | checkbox + 风险标签 + 中文说明 + elevated 默认不勾 |
| `Plugins.vue` | 本地/npm 安装也弹权限对话框；安装后 pending 状态展示 |
| 新增 `permission_copy.ts` | 权限 → 标题/说明/风险文案映射 |

**流程：**

```text
安装请求
  → resolve manifest
  → validateManifest / validateCompatibility
  → 写 registry: status=resolved, enabled=false, approved=[]
  → UI 弹权限确认（或复用已批集合的 diff）
  → 用户勾选确认
  → validateApprovedPermissions
  → 写 approvedPermissions
  → 用户可 enable
```

**验收：**

- [ ] local/npm/git/marketplace 安装后 `approvedPermissions` 不自动等于 declared
- [ ] 未确认前 `enable` 失败并提示
- [ ] 对话框可单独取消 elevated 权限
- [ ] 单测覆盖：空 approved 安装、拒绝 elevated、enable 前校验

#### 1.2 权限矩阵落地

**改动文件：**

- `permission_manager.ts`：`SANDBOXED_ALLOWED` 拆成 default+elevated；`TRUSTED_ALLOWED` = 全部；builtin 仅 trusted
- `manifest_resolver.ts`：`VALID_PERMISSIONS` 与矩阵同源，避免两处列表漂移
- 测试：`permission_manager.test.ts` 扩展三档矩阵

#### 1.3 网络硬化

**改动文件：**

- `network_service.ts`：
  - 默认拒绝私有地址（`isPrivateHost`：loopback、RFC1918、link-local、`169.254.169.254`）
  - `maxBytes` 硬顶降至 32MB；默认 8MB
  - 每插件并发上限（如 4）与简单令牌桶限速
  - 错误码：`PLUGIN_NETWORK_PRIVATE_DENIED` / `PLUGIN_NETWORK_QUOTA`
- `network_service.test.ts`：补 SSRF 用例

#### 1.4 退役旧 npm 安装路径

**改动文件：**

- `lifecycle_manager.ts`：`installFromPackage` 标记 deprecated，或仅 dev 模式可调
- `plugin_host.ts` contracts：`PluginHostApi.installPluginFromPackage` 标注 deprecated
- `Plugins.vue`：隐藏 npm 安装入口（或移到「高级/开发者」并带警告）
- `plugin_manager.ts`：短期保留但不接用户路径；中期删除

**验收：**

- [ ] 生产 UI 无法通过 npm 安装第三方插件
- [ ] 设计文档更新分发章节

#### 1.5 安全回归矩阵

**新增/扩展测试文件：**

- `security_regression.test.ts` 扩展：
  - 未声明权限 IPC 调用拒绝
  - 跨插件 job / grant / secret 访问拒绝
  - FileGrant 路径穿越（`../`、绝对路径、符号链接）
  - Network 私有地址、禁用协议、敏感头
  - DevSession 非 loopback / 错误 token
  - 日志脱敏（已有）
  - manifest 提权（sandboxed + host runtime）
  - marketplace catalog 权限不一致

**验证命令：**

```powershell
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
# 插件专项
pnpm run verify:plugin-framework
pnpm run verify:plugin-platform
```

---

### Phase 2 — 贡献点与能力路由闭环

**目标：** 声明的贡献点真正进入宿主；capability 可被发现与路由；Job 事件可达插件。

#### 2.1 全量 ContributionAssembler

**新增/改动：**

| 文件 | 内容 |
|---|---|
| `contribution_assembler.ts` | 扩展：`listWidgets` / `listCommands` / `listMenus` / `listShortcuts` / `listBackgroundTasks`；全部带 `pluginId` 命名空间 |
| `index.ts` | enable 时注册贡献；disable/uninstall 时卸载 |
| 主窗口菜单模块 | 接入 `menus` |
| 快捷键模块 | 接入 `shortcuts`（冲突检测 + 可撤销） |
| `quick-launch/providers/plugin_provider.ts` | 已用 commands，改为走统一 assembler |
| Home widget 系统 | 接入 `widgets`（target: home/sidebar/settings） |
| 调度器/事件总线 | 接入 `backgroundTasks`（schedule 或 event 触发） |

**命令真路由：**

```text
commands.execute(pluginId, commandId, payload)
  → 校验 commandId 前缀
  → 查注册表：该命令的 handler 在 UI 页还是 worker
  → 发送到对应 webContents / utility process
  → 等待插件 handler 返回（带超时）
  → 返回结构化结果或错误
```

- `CommandService` 改为持有 `CommandRouter`
- SDK 增加 `commands.register`（worker/UI 内注册 handler）
- 超时与错误映射为 `PLUGIN_COMMAND_TIMEOUT` / `PLUGIN_COMMAND_FAILED`

#### 2.2 Capability 路由接入

**改动：**

- `PluginHost.enablePlugin`：调用 `capabilityRegistry.register(pluginId, manifest.capabilities)`
- `disablePlugin` / `uninstall`：`unregister`
- 新增 `CapabilityRouter`：
  - `resolveByHost(url)` / `resolveByMime(mime)` / `resolveByScheme(scheme)`
  - 多命中时按市场优先级或用户默认 provider
- IPC：`plugin-runtime:capabilities:list` / `plugin-runtime:capabilities:invoke`
- 宿主媒体导入入口：粘贴 URL 时按 host 匹配到插件 capability

#### 2.3 Job / 下载事件暴露

**改动：**

- `ipc.ts`：注册 `plugin-runtime:jobs:on-event`（webContents 销毁时退订）
- `plugin-sdk/runtime.ts`：`jobs.onEvent(listener)`
- `JobService` 改为 HostServiceRegistry 持有的单例，避免 ad-hoc new
- 事件类型：`created | updated | progress | cancelled | failed | completed`
- 禁用插件时自动清理该 pluginId 的所有订阅

#### 2.4 结构化错误

**新增：**

```ts
// contracts/plugin_host.ts 或 plugin_media.ts
export interface PluginApiErrorPayload {
  code: PluginApiErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
}
```

- `ipc.ts` 统一 catch → 包装为 `{ ok: false, error: payload }` 或 reject 带 code
- SDK 统一 `PluginApiError` 类
- 错误码对齐设计文档：`PERMISSION_DENIED` / `INVALID_INPUT` / `QUOTA_EXCEEDED` / `PLUGIN_DISABLED` 等
- 禁止在 message/details 中泄露绝对路径与密钥（复用 `redactPluginLogMeta`）

#### 2.5 权限更新重批

**改动：**

- `lifecycle.update` / `installFromMarketplace`：对比 oldDeclared vs newDeclared
- 若 `newDeclared - oldDeclared` 非空 → 返回 pending 状态 + diff
- UI 显示「新增权限需确认」对话框
- 未确认前保持 disabled 或仅允许旧权限集运行（推荐前者，行为更简单）

**验收：**

- [ ] 声明 shortcut 的插件启用后快捷键生效，禁用后释放
- [ ] 命令面板可执行插件命令并收到结果
- [ ] 粘贴匹配 host 的 URL 能路由到对应插件
- [ ] `jobs.onEvent` 能收到进度
- [ ] 权限错误返回结构化 code

---

### Phase 3 — 运行时、配额与可观测

**目标：** 降低 worker 成本；补齐配额；审计可查；IPC 可维护。

#### 3.1 Worker 迁 UtilityProcess

**改动：**

- `runtime_router.ts`：
  - UI 仍用 `WebContentsView`
  - worker 改为 `utilityProcess.fork(workerEntry)`
  - 通过 MessagePort / Electron IPC 桥 pluginAPI
- `runtime_security.ts`：worker 不再需要 browser webPreferences
- 权限上下文：`utilityProcess` 用 `pluginId` 显式注册（无 webContentsId），IPC 侧改为 process 身份校验
- 保留 WebContents worker 作为 fallback（旧插件），manifest 可声明 `workerRuntime: 'utility' | 'browser'`

**收益：** 内存下降、无完整 Chromium、更接近「后台扩展」语义。

#### 3.2 声明式 IPC 路由

**新增 `ipc_router.ts`：**

```ts
const runtimeRoutes = {
  'plugin-runtime:network:fetch': {
    permission: 'network.fetch',
    handler: (ctx, input) => host.network.fetch(input, ctx.pluginId),
  },
  // ...
};
```

- `ipc.ts` 只负责注册表 + 全局 guard + 错误包装
- 新增 API 必须写进表，漏 permission 字段类型报错

#### 3.3 配额

| 资源 | 默认 | 错误码 |
|---|---|---|
| storage.self 总量 | 5MB / 插件 | `PLUGIN_STORAGE_QUOTA` |
| network 并发 | 4 | `PLUGIN_NETWORK_CONCURRENT` |
| network 响应体 | 8MB（硬顶 32MB） | `PLUGIN_NETWORK_RESPONSE_TOO_LARGE` |
| job 并发 | 3 / 插件 | `PLUGIN_JOB_QUOTA` |
| logs 速率 | 100 条/分钟 | `PLUGIN_LOG_RATE` |
| FileGrant 单文件 | grant.maxBytes | 已有 |
| FileGrant 过期 | 24h（可续） | 已有 |

#### 3.4 审计持久化

**新增：**

- SQLite 表 `plugin_audit_events`：`id, plugin_id, runtime, operation, result, created_at, meta_json`
- `PluginContextGuard` 的 audit 回调写入 DB（批量 flush，避免每 IPC 一次 fs）
- 管理 UI：插件详情页展示最近 N 条允许/拒绝
- 敏感 meta 过 `redactPluginLogMeta`

#### 3.5 注册表结构化

**新增迁移：**

- 不再整包 JSON blob；列：`plugin_id, name, version, trust_level, runtime, status, enabled, install_source_json, permissions_json, approved_permissions_json, capabilities_json, package_sha256, local_path, error, installed_at, updated_at`
- 兼容读取旧 blob 一次迁移
- 支持按 permission / status / source 查询

#### 3.6 崩溃自动禁用

- 记录连续启动失败次数
- 阈值（如 3）→ `status: 'errored'`, `enabled: false`，UI 提示

#### 3.7 删除 DB 脚枪

- 删除 `DataService.getDatabase()`
- 全局搜索确认无调用

**验收：**

- [ ] worker 插件内存明显下降（对比 WCV）
- [ ] 新增 IPC 必须在路由表声明 permission
- [ ] 超配额返回对应错误码
- [ ] 审计可在 UI 查询
- [ ] 连续崩溃 3 次自动禁用

---

### Phase 4 — 生态与 DX

**目标：** 签名、组件库、调试面板、settings、插件间能力。

#### 4.1 插件签名（预留落地）

1. catalog 签名：官方市场 `catalog.json` + detached signature
2. 插件 artifact：pack 时对 dist 计算 SHA-256，发布时附签名
3. 安装时校验；失败显示警告，第三方未签名市场默认降权

#### 4.2 plugin-ui 扩展

优先补齐媒体/任务类插件需要的组件：

- Tabs、Table/DataTable、ProgressBar、Select、Form、EmptyState、Badge、LogView、FileDropZone

#### 4.3 插件调试面板

插件详情页增加 Debug 区：

- 当前权限与 approved 对比
- 最近 IPC（channel、result、耗时）
- Job 列表
- FileGrant 列表（可撤销）
- 最近错误与崩溃栈
- 控制台（已有 console-message，增强过滤）

#### 4.4 settings schema

- Manifest 增加 `settings?: Record<string, PluginSettingSchema>`
- 插件设置页由宿主根据 schema 生成表单
- 读写走 `storage.self` 或专用 `settings` 命名空间

#### 4.5 插件间能力消费

- 消费方 manifest：`dependencies: [{ capability: 'xxx', optional?: bool }]`
- 宿主仲裁 provider
- 未满足依赖时禁用并提示

#### 4.6 多插件页并排（按需）

- 当前 `mountedByWindowId` 每窗口一视图
- 若产品需要分屏：改为 `mountedViewsByWindowId: Map<pageKey, view>` + 布局管理

---

## 7. 兼容性与迁移

| 变更 | 兼容策略 |
|---|---|
| 权限矩阵收紧 | 已装插件启动时校验 approved ⊆ 新 allowed；失效项标 `incompatible` 并提示重批 |
| approved 默认空 | 仅影响新安装；旧记录保留，但 UI 标记「旧授权策略」 |
| npm 路径废弃 | 已装 npm 插件可继续运行到卸载；不可再新装 |
| 注册表结构化 | 启动时检测旧 JSON blob 自动迁移（已有 legacy 迁移模式可复用） |
| Worker UtilityProcess | manifest 未声明则走旧 WCV；新模板默认 utility |
| 结构化错误 | SDK 同步升级；旧插件仍可读 message 字符串 |
| Capability 接入 | 旧插件 capabilities=[] 不受影响 |
| plugin API version | Phase 1–2 保持 1.0.0；错误码与事件属 additive。Worker 迁移与 settings 升 `1.1.0` |

**版本策略：**

- additive（新权限文案、新事件、新错误码）：不升 major
- breaking（权限默认值变空、矩阵收紧）：host 兼容窗口 + UI 迁移提示；`PLUGIN_API_VERSION` 仍可 1.0.0，靠 `hostVersionRange` 约束
- 若需强制重批：`HOST_VERSION` 升 `1.1.0`，旧 range `>=1.0.0` 仍满足，但运行时检测 policyVersion

---

## 8. 文件级改动总表

| 阶段 | 文件 | 动作 |
|---|---|---|
| P1 | `permission_manager.ts` | 三档矩阵 |
| P1 | `manifest_resolver.ts` | 与矩阵同源校验 |
| P1 | `lifecycle_manager.ts` | 统一 approved 门 |
| P1 | `index.ts` | install API 签名 |
| P1 | `ipc.ts` | install 强制 approved |
| P1 | `PluginPermissionDialog.vue` | 可勾选 + 文案 |
| P1 | `Plugins.vue` | 全源安装走对话框 |
| P1 | 新增 `permission_copy.ts` | 中文案 |
| P1 | `network_service.ts` | SSRF + 配额 |
| P1 | `host_services.ts` | 删 getDatabase |
| P1 | `security_regression.test.ts` | 扩矩阵 |
| P2 | `contribution_assembler.ts` | 全量贡献点 |
| P2 | 新增 `command_router.ts` | 命令真路由 |
| P2 | 新增 `capability_router.ts` | 能力路由 |
| P2 | `capability_registry.ts` | 接入 enable/disable |
| P2 | `job_service.ts` + ipc/sdk | onEvent |
| P2 | contracts + sdk | PluginApiError |
| P2 | lifecycle + UI | 权限 diff 重批 |
| P3 | `runtime_router.ts` | UtilityProcess worker |
| P3 | 新增 `ipc_router.ts` | 声明式路由 |
| P3 | 新增 `quota.ts` | 配额集中 |
| P3 | 新增 migration | audit 表 + 注册表列 |
| P3 | `context_guard.ts` | 审计落库 |
| P4 | plugin-cli pack | 签名 |
| P4 | plugin-ui | 组件扩展 |
| P4 | Plugins 调试 UI | Debug 面板 |
| P4 | contracts | settings schema |

---

## 9. 验收总览

### Phase 1 Done

- 任意安装源都不会静默全量授权
- 权限可单项拒绝；elevated 默认不勾
- sandboxed 不含 builtin 权限
- 网络拒绝私有地址；响应体有硬顶
- 用户 UI 路径无法 npm 安装
- 安全回归覆盖路径穿越、跨插件、SSRF、提权

### Phase 2 Done

- widgets/commands/menus/shortcuts/backgroundTasks 全部可装配与卸载
- 命令执行有真实 handler 与超时
- capability 按 host/mime 可路由
- 插件可订阅 job 事件
- 权限错误为结构化 code
- 更新新增权限需重批

### Phase 3 Done

- worker 默认 utilityProcess
- IPC 路由表强制声明 permission
- 配额生效且有稳定错误码
- 审计可查询
- 连续崩溃自动禁用
- 注册表可按权限/状态查询

### Phase 4 Done

- 签名校验链路可用
- plugin-ui 覆盖媒体插件主路径
- 调试面板可定位权限/IPC/job 问题
- settings 与插件依赖可选落地

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 权限收紧导致存量插件不可用 | 用户升级后插件失效 | 启动检测 + 迁移向导；分 policyVersion 灰度 |
| UtilityProcess 迁移破坏旧 worker | worker 插件不启动 | manifest 双轨；默认 browser，新模板 utility |
| 命令路由引入竞态 | 启用/禁用时 handler 残留 | enable/disable 统一清理；命令带 plugin 生命周期检查 |
| 审计写入拖慢 IPC | 性能 | 批量 flush；异步队列；拒绝路径也采样 |
| 矩阵两处列表漂移 | 权限校验不一致 | 单一 `permission_matrix.ts` 源，resolver/manager/UI 共用 |
| 市场插件依赖旧 auto-approve | 开发者不适应 | CLI validate 提示；模板文档更新；dev 模式可显式 full-approve |

---

## 11. 建议执行顺序

```text
Week 1-2   Phase 1.1–1.3  统一授权 + 矩阵 + SSRF
Week 2-3   Phase 1.4–1.5  废 npm + 安全回归
Week 3-5   Phase 2.1–2.3  贡献点 + capability + job 事件
Week 5-6   Phase 2.4–2.5  错误码 + 权限重批
Week 6-8   Phase 3.1–3.2  UtilityProcess + IPC 路由表
Week 8-10  Phase 3.3–3.6  配额 + 审计 + 注册表 + 崩溃禁用
之后        Phase 4 按产品优先级拉取
```

每阶段合并前跑：

```powershell
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
pnpm run verify:plugin-framework
pnpm run verify:plugin-platform
cargo test --manifest-path multi_platform_core/Cargo.toml
```

---

## 12. 一句话结论

**先收紧授权闭环（P1），再闭合贡献点与能力路由（P2），然后改运行时与可观测（P3），最后做签名与生态（P4）。**  
骨架已经对，当前最高杠杆不是加 API，而是让「声明的权限与贡献点」真正被强制执行、可被用户控制、可被审计。
