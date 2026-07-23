# GuYanTools Plugin Platform Development Plan

## Implementation Status (2026-07-22)

- Host implementation branch: `codex/0.0.5-dev`.
- Plugin repository: <https://github.com/Sakurapole/guyantools-bilibili-media>.
- Marketplace repository: <https://github.com/Sakurapole/guyantools-plugin-marketplace>.
- Bilibili URL parsing, stream selection, metadata mapping, and media pipeline live in the plugin repository; the host only exposes generic network, direct-download, FileGrant, Job, and media-related permission gates.
- Marketplace catalog currently pins plugin `v0.2.0` commit `dcc51da68743e72046495d41671ee15f6bdb6257`.
- Verified locally: plugin-platform Vitest 36 tests, desktop TypeScript typecheck, lint (0 errors), `build:app`, Rust full suite (61 tests plus 3 doc-tests), marketplace local/remote catalog validation, and static host coupling checks.

### Checklist reconciliation

- Completed in the host: manifest/contracts, resolver and capability registry, migration and basic Job/FileGrant/marketplace CRUD, Git installer primitives, marketplace resolver, sandbox WebContentsView defaults, sender permission guard, typed plugin bridge, generic network/file/download/media services, plugin management page wiring, and static verification.
- Completed in external repositories: public GitHub repositories, sandboxed Bilibili plugin v0.2.0 with domain/pipeline/UI/worker fixture tests, marketplace catalog/schema/README, pinned remote-manifest validation CI, and release tag `v0.2.0`.
- Still pending: root-repository commit steps only; the worktree contains unrelated user changes, so no root commit is created implicitly.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 GuYanTools 当前的插件骨架落地为可审计的 Git 市场、sandboxed runtime、通用媒体宿主原语和 B 站示例插件，并保持 B 站解析/下载业务只存在于插件仓库。

**Architecture:** 主仓库只实现插件平台内核和站点无关的宿主服务。插件通过 `guyantools.plugin.json` 声明 `permissions` 与 `capabilities`，通过 typed SDK 调用受限网络、文件、直接 URL 下载、Job、FFmpeg、Tag 和 Preview API。B 站插件在独立 Git 仓库中实现 URL 解析、流选择、元数据编排和 UI；市场仓库只维护可审核索引。

**Tech Stack:** Electron 37, Vue 3, TypeScript, Pinia, Electron `WebContentsView`, Rust 2021, rusqlite, napi-rs, Git CLI, GitHub CLI (`gh`), Vitest。

---

## 0. 固定决策与仓库边界

主仓库、插件仓库和市场仓库的职责必须保持如下关系：

| 仓库 | 默认名称 | 内容 | 禁止内容 |
|---|---|---|---|
| 宿主 | `Sakurapole/GuYanTools` | manifest 校验、权限、Git 安装、市场同步、sandbox bridge、通用文件/网络/下载/Job/媒体服务、管理 UI | B 站 URL 解析、BV 规则、站点 Cookie 字段、站点签名算法 |
| 示例插件 | `Sakurapole/guyantools-bilibili-media` | B 站 resolver、流选择、元数据/歌词编排、插件 UI、插件 worker、插件 manifest | 任意 Node/Electron、任意命令、FFmpeg/下载器的自带实现 |
| 市场 | `Sakurapole/guyantools-plugin-marketplace` | `catalog.json`、schema、审核说明、插件版本和 commit 摘要 | 插件源码复制、宿主权限自动授权 |

`permissions` 是宿主原语请求；`capabilities` 是插件业务能力声明。宿主不得从 capability 名称推导站点逻辑或隐式提权。

### GitHub 仓库初始化

执行开发前先确认仓库名称和可见性。当前环境 `gh auth status` 已确认登录账号为 `Sakurapole`，以下命令默认创建公开仓库；若需要私有仓库，将两个 `--public` 改为 `--private`。

```powershell
$owner = 'Sakurapole'
$pluginRepo = "$owner/guyantools-bilibili-media"
$marketRepo = "$owner/guyantools-plugin-marketplace"

gh repo view $pluginRepo *> $null
if ($LASTEXITCODE -ne 0) {
  gh repo create $pluginRepo --public --description 'GuYanTools sandboxed Bilibili media plugin'
}

gh repo view $marketRepo *> $null
if ($LASTEXITCODE -ne 0) {
  gh repo create $marketRepo --public --description 'GuYanTools plugin marketplace catalog'
}
```

仓库创建后，分别在两个仓库初始化 `main` 分支、`README.md`、`LICENSE` 和 CI；仓库地址写回宿主市场 fixture，不能继续使用设计文档中的 `example.com`。

## 1. 文件地图

### 宿主仓库 `GuYanTools`

- Modify: `desktop/src/contracts/plugin_host.ts`，统一 manifest、安装源、权限、capability、runtime context 和管理 UI 数据形状。
- Create: `desktop/src/contracts/plugin_media.ts`，定义 `NetworkRequest`、`DownloadSource`、`FileGrant`、`JobRecord`、`MediaProbe`、`MediaTags`、`PreviewGrant` 和 `PluginApiError`。
- Modify: `desktop/src/preload.ts`、`desktop/src/core/plugin_core/preload.plugin.ts`、`desktop/src/core/@types/plugin.d.ts`，同步宿主管理 API 和插件 SDK bridge。
- Modify: `desktop/src/main/plugin-host/manifest_resolver.ts`、`permission_manager.ts`、`plugin_registry.ts`、`lifecycle_manager.ts`、`runtime_router.ts`、`ipc.ts`、`index.ts`。
- Create: `desktop/src/main/plugin-host/git_installer.ts`、`marketplace_resolver.ts`、`plugin_paths.ts`、`capability_registry.ts`。
- Create: `desktop/src/main/plugin-host/services/network_service.ts`、`downloads_service.ts`、`file_grant_service.ts`、`job_service.ts`、`media_service.ts`、`secret_service.ts`。
- Modify: `desktop/src/windows/main/pages/Plugins/Plugins.vue`、`PluginRuntimePage.vue`；Create: `PluginMarketplacePanel.vue`、`PluginPermissionDialog.vue`、`PluginJobPanel.vue`。
- Create: `desktop/scripts/verify-plugin-platform.cjs` 和 `desktop/src/main/plugin-host/fixtures/` 下的本地 Git fixture。
- Modify: `desktop/package.json`、根目录 `package.json`，加入 Vitest 与插件平台验证脚本。
- Create: `multi_platform_core/migrations/031_add_plugin_platform.sql`；Modify: `multi_platform_core/src/db/migration.rs`、`src/models/plugin.rs`、`src/services/plugin_service.rs`、`src/services/mod.rs`、`src/models/mod.rs`、`src/bindings/napi.rs`。

### 示例插件仓库 `guyantools-bilibili-media`

- Create: `guyantools.plugin.json`、`package.json`、`src/ui/`、`src/worker/`、`src/domain/bilibili_url.ts`、`src/domain/bilibili_resolver.ts`、`src/domain/media_pipeline.ts`、`tests/`、`README.md`、`LICENSE`。

### 市场仓库 `guyantools-plugin-marketplace`

- Create: `catalog.json`、`schemas/catalog.schema.json`、`plugins/guyantools.bilibili-media.json`、`README.md`、`LICENSE`、`.github/workflows/validate-catalog.yml`。

## 2. Task 1：固化共享契约和 manifest v1

**Files:**

- Modify: `desktop/src/contracts/plugin_host.ts`
- Create: `desktop/src/contracts/plugin_media.ts`
- Modify: `desktop/src/core/@types/plugin.d.ts`
- Modify: `desktop/package.json`
- Test: `desktop/src/main/plugin-host/manifest_resolver.test.ts`

- [x] **Step 1: 添加失败测试，覆盖 manifest 必填字段和 capability 声明。**

测试至少包含以下输入和期望：

```ts
expect(() => validatePluginManifest({ id: 'bad id' })).toThrow('PLUGIN_MANIFEST_INVALID');
expect(() => validatePluginManifest({ trustLevel: 'trusted' })).toThrow('PLUGIN_TRUST_UNSUPPORTED');
expect(() => validatePluginManifest({ permissions: ['tools.downloader'] })).toThrow('PLUGIN_PERMISSION_UNKNOWN');
expect(() => validatePluginManifest({ capabilities: undefined })).toThrow('PLUGIN_CAPABILITIES_REQUIRED');
```

- [x] **Step 2: 运行 manifest 回归测试。**

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/manifest_resolver.test.ts
```

预期：失败，因为当前契约没有 `capabilities`、Git 安装源和媒体 API 类型。

- [x] **Step 3: 在 `plugin_host.ts` 中替换旧契约。**

新增类型必须至少包含：

```ts
export type PluginPermission =
  | 'network.fetch' | 'downloads.manage' | 'jobs.manage'
  | 'files.read' | 'files.write' | 'tools.ffmpeg'
  | 'media.preview' | 'media.transcode' | 'media.tag'
  | 'secrets.self' | 'system.dialog' | 'system.notifications'
  | 'storage.self' | 'ui.contribute' | 'observability.logs';

export type PluginLifecycleState =
  | 'discovered' | 'installed' | 'resolved' | 'enabled'
  | 'disabled' | 'errored' | 'incompatible';

export type PluginInstallSource =
  | { type: 'git'; url: string; ref: string; refType: 'branch' | 'tag' | 'commit'; resolvedCommit: string }
  | { type: 'marketplace'; marketplaceId: string; pluginId: string; url: string; ref: string; resolvedCommit: string }
  | { type: 'local'; value: string }
  | { type: 'builtin'; value: string };

export interface PluginCapabilityDeclaration {
  id: string;
  kind: 'media-source' | 'metadata-provider' | 'transformer' | 'importer';
  operations: string[];
  match?: { hosts?: string[]; schemes?: string[]; mimeTypes?: string[] };
}

export interface PluginManifest {
  schemaVersion: '1.0';
  id: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  pluginApiVersion: string;
  hostVersionRange: string;
  trustLevel: 'sandboxed';
  runtime: 'ui' | 'worker' | 'hybrid';
  entry: { ui?: string; worker?: string };
  permissions: PluginPermission[];
  capabilities: PluginCapabilityDeclaration[];
  contributes: PluginContributes;
}

export interface ResolvedPluginEntryPaths {
  ui?: string;
  worker?: string;
}

export interface InstalledPluginRecord {
  manifest: PluginManifest;
  resolvedEntryPaths: ResolvedPluginEntryPaths;
  installSource: PluginInstallSource;
  approvedPermissions: PluginPermission[];
  status: PluginLifecycleState;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
}
```

`plugin_media.ts` 定义所有 host API 输入输出；业务字段不能包含 `bilibili`、`bv` 或站点专属 Cookie 名称。

- [x] **Step 4: 添加 Vitest 配置和 npm script。**

在 `desktop/package.json` 添加 `vitest` devDependency 和：

```json
"test:plugin-platform": "vitest run src/main/plugin-host --reporter=verbose"
```

- [ ] **Step 5: 运行测试并提交契约变更。**

```powershell
pnpm install
pnpm --dir desktop run test:plugin-platform
git add desktop/src/contracts desktop/src/core/@types/plugin.d.ts desktop/package.json pnpm-lock.yaml
git commit -m "feat(desktop): define sandboxed plugin platform contracts"
```

## 3. Task 2：manifest 解析、权限和 capability 校验

**Files:**

- Modify: `desktop/src/main/plugin-host/manifest_resolver.ts`
- Modify: `desktop/src/main/plugin-host/permission_manager.ts`
- Create: `desktop/src/main/plugin-host/capability_registry.ts`
- Modify: `desktop/src/main/plugin-host/lifecycle_manager.ts`
- Test: `desktop/src/main/plugin-host/manifest_resolver.test.ts`、`permission_manager.test.ts`

- [x] **Step 1: 先补 resolver/permission 的失败测试。**

测试必须验证：

1. 优先读取仓库根目录 `guyantools.plugin.json`。
2. `plugin.json` 只作为本地旧插件迁移输入，不允许市场安装继续使用。
3. `runtime=worker` 缺少 `entry.worker` 时失败；`runtime=ui` 缺少 `entry.ui` 时失败。
4. `trusted`、`host`、未知权限、重复 capability ID、非法 host/scheme 和非法 ID 全部失败。
5. `capabilities` 不会自动加入 `permissions`。

- [x] **Step 2: 实现 `PluginManifestResolver`。**

解析顺序固定为 `guyantools.plugin.json`、本地兼容的 `plugin.json`、最后才允许明确标记的 legacy package metadata。解析结果必须返回 `resolvedEntryPaths: { ui?: string; worker?: string }`，每个路径都经过 `path.resolve` 后检查仍位于插件代码目录；后续 runtime router 不再读取旧的单一 `resolvedEntryPath`。

- [x] **Step 3: 实现 `PluginPermissionManager` 和 `CapabilityRegistry`。**

权限管理器只检查 manifest 声明与宿主 allowlist；capability registry 只负责命名空间化、索引、去重和查找，不执行插件业务。

- [x] **Step 4: 在生命周期安装和启用两个阶段都调用同一套校验。**

安装失败不写入有效记录；启用时重新校验 manifest、host version、plugin API version 和已批准权限。市场摘要与仓库 manifest 不一致时返回 `PLUGIN_CATALOG_MISMATCH`。

- [x] **Step 5: 运行测试。**

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/manifest_resolver.test.ts src/main/plugin-host/permission_manager.test.ts
```

- [ ] **Step 6: 提交。**

```powershell
git add desktop/src/main/plugin-host
git commit -m "feat(desktop): validate plugin capabilities and permissions"
```

## 4. Task 3：SQLite 持久化和 N-API 契约

**Files:**

- Create: `multi_platform_core/migrations/031_add_plugin_platform.sql`
- Modify: `multi_platform_core/src/db/migration.rs`
- Create: `multi_platform_core/src/models/plugin.rs`
- Create: `multi_platform_core/src/services/plugin_service.rs`
- Modify: `multi_platform_core/src/models/mod.rs`、`src/services/mod.rs`
- Modify: `multi_platform_core/src/bindings/napi.rs`
- Modify: `desktop/src/core/database.ts`
- Modify: `desktop/src/main/plugin-host/plugin_registry.ts`
- Test: `multi_platform_core/src/services/plugin_service.rs` 内 `#[cfg(test)]`、`multi_platform_core/src/db/migration.rs` 内迁移测试

- [x] **Step 1: 写 migration 回归测试。**

测试内存 SQLite 必须验证以下表和索引存在：`plugin_marketplaces`、`plugin_installations`、`plugin_jobs`、`plugin_file_grants`、`plugin_secrets`；重复执行 migration 不得报错。

- [x] **Step 2: 创建 `031_add_plugin_platform.sql`。**

字段至少包括：

```sql
CREATE TABLE plugin_marketplaces (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  ref TEXT NOT NULL,
  catalog_json TEXT NOT NULL,
  catalog_sha256 TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  refreshed_at TEXT NOT NULL
);

CREATE TABLE plugin_jobs (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  current_step TEXT,
  input_json TEXT NOT NULL,
  output_json TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_plugin_jobs_owner ON plugin_jobs(plugin_id, updated_at);
```

`plugin_installations` 保存 `resolved_commit`、来源、批准权限、capability 摘要、当前/上一个代码目录；grant 和 secret 表不能存放明文 secret。

- [x] **Step 3: 在 Rust model/service 中实现参数化 CRUD。**

所有写入通过 `Database::transaction` 或同等事务封装；Job 状态转换只允许 `queued -> running -> paused|completed|failed|cancelled`，重试生成新的 job ID 并保留父任务引用。

- [x] **Step 4: 暴露最小 N-API 方法并同步 TypeScript。**

至少增加 `listPluginJobs`、`upsertPluginJob`、`updatePluginJob`、`createFileGrant`、`revokeFileGrant` 和市场缓存读写方法。N-API 只传 JSON/基础类型，敏感字段在 Rust/宿主服务内部处理。

- [x] **Step 5: 运行 Rust 测试。**

```powershell
cargo test --manifest-path multi_platform_core/Cargo.toml migration
cargo test --manifest-path multi_platform_core/Cargo.toml plugin_service
```

- [ ] **Step 6: 提交。**

```powershell
git add multi_platform_core/migrations/031_add_plugin_platform.sql multi_platform_core/src desktop/src/core/database.ts desktop/src/main/plugin-host/plugin_registry.ts
git commit -m "feat(core): persist plugin platform jobs and grants"
```

## 5. Task 4：Git 安装、市场同步和原子更新

**Files:**

- Create: `desktop/src/main/plugin-host/plugin_paths.ts`
- Create: `desktop/src/main/plugin-host/git_installer.ts`
- Create: `desktop/src/main/plugin-host/marketplace_resolver.ts`
- Modify: `desktop/src/main/plugin-host/lifecycle_manager.ts`、`index.ts`、`ipc.ts`
- Modify: `desktop/src/preload.ts`、`desktop/src/contracts/plugin_host.ts`
- Test: `desktop/src/main/plugin-host/git_installer.test.ts`、`marketplace_resolver.test.ts`

- [x] **Step 1: 创建本地 Git fixture 和回归测试。**

fixture 必须包含一个 tag、一个 commit、有效 manifest 和无效 manifest。测试断言 clone/fetch 使用参数数组，未调用 shell 字符串；未解析到固定 commit 时安装失败。

- [x] **Step 2: 实现 `PluginPaths`。**

目录固定为：

```text
<userData>/guyantools-plugins/
  packages/<pluginId>/<resolvedCommit>/
  current/<pluginId>/
  data/<pluginId>/
  cache/<pluginId>/
  logs/<pluginId>/
```

临时目录使用 `fs.mkdtemp`；切换 current 使用同盘临时目录加 rename，失败时保留旧版本。

- [x] **Step 3: 实现 `GitPluginInstaller`。**

只接受 HTTPS URL，使用 `spawn('git', ['clone', '--depth', '1', url, tempDir])` 等参数数组；禁止 `shell: true`、安装脚本、SSH URL 和任意 checkout 路径。安装结果必须包含 `resolvedCommit` 和 SHA-256 摘要。

- [x] **Step 4: 实现 `MarketplaceResolver`。**

拉取固定 ref 的 `catalog.json`，校验 schema、插件 ID、HTTPS repository、sandboxed trust level 和 commit/ref；网络失败使用最近一次有效缓存，并返回缓存时间。

- [x] **Step 5: 接入生命周期和 preload API。**

新增 `plugin-host:marketplaces:list`、`plugin-host:marketplaces:refresh`、`plugin-host:marketplaces:search`、`plugin-host:install-git`、`plugin-host:update`、`plugin-host:rollback`、`plugin-host:uninstall`。renderer 不接触本地 Git 路径和子进程。

- [x] **Step 6: 运行测试并检查命令调用。**

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/git_installer.test.ts src/main/plugin-host/marketplace_resolver.test.ts
```

- [ ] **Step 7: 提交。**

```powershell
git add desktop/src/main/plugin-host desktop/src/preload.ts desktop/src/contracts/plugin_host.ts
git commit -m "feat(desktop): install plugins from pinned git revisions"
```

## 6. Task 5：sandboxed runtime 和 typed SDK bridge

**Files:**

- Modify: `desktop/src/main/plugin-host/runtime_router.ts`
- Modify: `desktop/src/main/plugin-host/ipc.ts`、`host_services.ts`
- Modify: `desktop/src/core/plugin_core/preload.plugin.ts`
- Create: `desktop/src/core/plugin_core/sdk/` 下按命名空间拆分的 SDK facade
- Create: `desktop/src/main/plugin-host/context_guard.ts`
- Test: `desktop/src/main/plugin-host/runtime_security.test.ts`

- [x] **Step 1: 先写 sandbox 安全回归测试。**

测试必须断言第三方 UI 创建的 `WebContentsView` 固定为 `contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`、`webSecurity=true`、`webviewTag=false`；即使 manifest 伪造 trusted/host 也不能安装。

- [x] **Step 2: 修正 `runtime_router.ts`。**

身份只从 `webContentsId -> PluginRuntimeContext` 获取；不得接受 renderer 传入的 pluginId。为 worker runtime 创建隐藏 sandbox view，并在销毁时删除 context、取消事件和停止任务。

- [x] **Step 3: 实现 `ContextGuard`。**

每个 handler 按 `context.permissions` 校验权限、按 pluginId 限制 job/grant/secret 所有权，并把 `runtime`、方法名、结果码写入隔离日志。

- [x] **Step 4: 拆分 typed SDK facade。**

`preload.plugin.ts` 只通过 `contextBridge.exposeInMainWorld('pluginAPI', pluginAPI)` 暴露类型化对象；不暴露 `ipcRenderer`、Node、Electron、绝对路径或任意 host service 实例。

- [x] **Step 5: 运行安全测试和 TypeScript 检查。**

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/runtime_security.test.ts
pnpm --dir desktop run typecheck
```

- [ ] **Step 6: 提交。**

```powershell
git add desktop/src/main/plugin-host desktop/src/core/plugin_core desktop/src/contracts/plugin_host.ts
git commit -m "fix(desktop): enforce sandboxed plugin runtime boundaries"
```

## 7. Task 6：通用 Host API、FileGrant、JobService 和媒体原语

**Files:**

- Create: `desktop/src/main/plugin-host/services/network_service.ts`
- Create: `desktop/src/main/plugin-host/services/file_grant_service.ts`
- Create: `desktop/src/main/plugin-host/services/downloads_service.ts`
- Create: `desktop/src/main/plugin-host/services/job_service.ts`
- Create: `desktop/src/main/plugin-host/services/media_service.ts`
- Create: `desktop/src/main/plugin-host/services/secret_service.ts`
- Modify: `desktop/src/main/plugin-host/host_services.ts`、`ipc.ts`
- Modify: `desktop/src/contracts/plugin_media.ts`
- Test: 各 service 的 Vitest 单测和 `desktop/scripts/verify-plugin-platform.cjs`

- [x] **Step 1: 为通用原语写安全回归测试。**

覆盖：`network.fetch` 拒绝 `file:`/`data:`/`javascript:`、重定向越界和超大响应；FileGrant 拒绝插件越权和过期 token；downloads 只接受直接 HTTP(S) URL；Job 只能访问自身记录；FFmpeg 不接受任意 argv。

- [x] **Step 2: 实现 NetworkService。**

请求结构固定为 `{url, method, headers, body, responseType}`，执行协议、域名、重定向、超时、响应大小和敏感 header 校验。服务代码和错误码不得出现 B 站、BV 号或站点 Cookie 字段。

- [x] **Step 3: 实现 FileGrantService 和 DownloadsService。**

FileGrant 绑定 pluginId、用途、读写模式、根目录、过期时间和最大文件大小；下载服务接收 `DownloadSource[]`，负责断点、重试、限速、校验和取消，不负责 URL 解析。

- [x] **Step 4: 实现 JobService。**

JobService 提供 `create/get/list/cancel/retry/onEvent`，持久化每个状态变更，应用重启把 running 任务恢复为 paused。pipeline 步骤只存结构化输入，不执行插件传来的命令字符串。

- [x] **Step 5: 实现 MediaService 和 SecretService。**

MediaService 只接受 FileGrant 和结构化 `TranscodeOptions`，封装 FFmpeg/FFprobe、Tag 原子替换和 Preview token；SecretService 使用 Electron `safeStorage`，日志和错误自动脱敏。

- [x] **Step 6: 接入 IPC 并执行服务测试。**

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/services --reporter=verbose
pnpm --dir desktop run verify:plugin-platform
```

- [ ] **Step 7: 提交。**

```powershell
git add desktop/src/main/plugin-host/services desktop/src/main/plugin-host/host_services.ts desktop/src/main/plugin-host/ipc.ts desktop/src/contracts/plugin_media.ts desktop/scripts/verify-plugin-platform.cjs
git commit -m "feat(desktop): expose generic sandbox media host APIs"
```

## 8. Task 7：插件管理 UI 和市场工作流

**Files:**

- Modify: `desktop/src/windows/main/pages/Plugins/Plugins.vue`
- Modify: `desktop/src/windows/main/pages/Plugins/PluginRuntimePage.vue`
- Create: `desktop/src/windows/main/pages/Plugins/PluginMarketplacePanel.vue`
- Create: `desktop/src/windows/main/pages/Plugins/PluginPermissionDialog.vue`
- Create: `desktop/src/windows/main/pages/Plugins/PluginJobPanel.vue`
- Modify: `desktop/src/windows/main/i18n/zh.ts`、`en.ts`

- [x] **Step 1: 为市场、权限和 capability 状态写 UI 验收脚本。**

`verify-plugin-platform.cjs` 必须检查组件引用了来源、版本、commit、权限、已批准权限、capability、状态和安装错误字段。

- [x] **Step 2: 实现市场列表和刷新。**

显示 marketplace ID、更新时间、缓存状态、插件版本、commit、host version range、permissions 和 capabilities；网络失败显示上次有效缓存时间。

- [x] **Step 3: 实现安装确认对话框。**

安装前按权限逐项确认；capability 只作为业务能力说明，不显示为可授权的宿主权限。市场摘要和真实 manifest 不一致时禁止确认安装。

- [x] **Step 4: 实现已安装插件状态和 Job 面板。**

展示 `installed/resolved/enabled/disabled/errored/incompatible` 和 transient 安装状态，支持 enable/disable/update/rollback/uninstall；任务面板只显示当前插件自己的 Job。

- [x] **Step 5: 运行前端检查。**

```powershell
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
```

- [ ] **Step 6: 提交。**

```powershell
git add desktop/src/windows/main/pages/Plugins desktop/src/windows/main/i18n
git commit -m "feat(ui): manage plugin marketplaces and capabilities"
```

## 9. Task 8：初始化 B 站插件仓库

**Repository:** `Sakurapole/guyantools-bilibili-media`

- [x] **Step 1: 创建 manifest 和构建入口。**

`guyantools.plugin.json` 必须声明：

```json
{
  "schemaVersion": "1.0",
  "id": "guyantools.bilibili-media",
  "name": "bilibili-media",
  "displayName": "Bilibili Media",
  "version": "0.1.0",
  "pluginApiVersion": "1.0.0",
  "hostVersionRange": ">=1.0.0",
  "trustLevel": "sandboxed",
  "runtime": "hybrid",
  "entry": { "ui": "dist/index.html", "worker": "dist/worker.js" },
  "permissions": ["network.fetch", "downloads.manage", "jobs.manage", "tools.ffmpeg", "media.tag", "media.preview", "system.dialog"],
  "capabilities": [{
    "id": "guyantools.bilibili-media.source",
    "kind": "media-source",
    "operations": ["resolve", "download"],
    "match": { "hosts": ["bilibili.com", "b23.tv"] }
  }],
  "contributes": { "pages": [{ "id": "media", "title": "Bilibili Media" }] }
}
```

- [x] **Step 2: 实现插件域逻辑。**

`src/domain/bilibili_url.ts` 只解析 URL/BV 号格式；`bilibili_resolver.ts` 通过 SDK `network.fetch` 调用 B 站接口并返回插件本地 `ResolvedBilibiliMedia`；`media_pipeline.ts` 把直接资源映射到 `downloads.create`、`tools.ffmpeg`、`media.writeTags` 和 `media.preview`。

- [x] **Step 3: 实现 UI/worker 通信。**

UI 只提交 URL、质量、输出目录 grant 和 Tag 选项；worker 负责 resolver 和 pipeline 编排。插件不得 import `electron`、`node:*` 或启动子进程。

- [x] **Step 4: 添加 fixture 测试。**

测试覆盖 URL 解析、无授权响应、多个音视频资源选择、取消/重试、Tag round-trip 和非 B 站 URL 拒绝。所有网络响应使用 fixture，不把真实 Cookie 写入仓库。

- [x] **Step 5: 构建并推送插件仓库。**

```powershell
pnpm install
pnpm run build
pnpm test
git add guyantools.plugin.json package.json src tests README.md LICENSE
git commit -m "feat: add sandboxed bilibili media plugin"
git push -u origin main
```

## 10. Task 9：初始化插件市场仓库

**Repository:** `Sakurapole/guyantools-plugin-marketplace`

- [x] **Step 1: 创建 catalog schema 和索引。**

`catalog.json` 的 B 站条目必须包含真实仓库 URL、固定 tag、`resolvedCommit`、manifest path、host/API 兼容范围、权限摘要和 capability 摘要。市场摘要不作为安全授权来源。

- [x] **Step 2: 添加 catalog 校验脚本和 CI。**

CI 必须拒绝：非 HTTPS Git URL、缺少固定 ref/commit、`trusted`、未知权限、manifest/capability ID 与插件不一致、重复 plugin ID 和无效 semver。

- [x] **Step 3: 添加审核文档。**

README 明确：第三方插件运行在 sandboxed runtime；站点解析属于插件；不得提交 Cookie、token、构建产物中的宿主绝对路径或任意命令脚本。

- [x] **Step 4: 推送并记录市场地址。**

```powershell
git add catalog.json schemas plugins README.md LICENSE .github
git commit -m "feat: publish GuYanTools plugin marketplace catalog"
git push -u origin main
```

## 11. Task 10：端到端、安全回归和发布门禁

**Files:**

- Modify: `desktop/scripts/verify-plugin-platform.cjs`
- Create: `desktop/src/main/plugin-host/integration/` 下的 local Git fixture tests
- Modify: `desktop/package.json`、根目录 `package.json`
- Verify: `docs/superpowers/specs/2026-07-22-plugin-platform-sandboxed-media-design.md`

- [x] **Step 1: 添加本地 Git 安装集成测试。**

测试从 fixture 仓库安装固定 commit，校验 manifest、权限确认、capability 注册、启用、挂载、更新、回滚和卸载；使用第二个非 B 站 media-source fixture 证明宿主没有站点分支。

- [x] **Step 2: 添加安全回归。**

逐项验证 Node 访问、任意文件、跨插件 grant/job、`file:`/`data:`/`javascript:` URL、任意命令、未声明权限、伪造 pluginId 和日志敏感字段全部失败或脱敏。

- [x] **Step 3: 添加统一命令。**

```json
"verify:plugin-platform": "node scripts/verify-plugin-platform.cjs",
"test:plugin-platform": "vitest run src/main/plugin-host --reporter=verbose"
```

- [x] **Step 4: 执行完整验证。**

```powershell
pnpm --dir desktop run test:plugin-platform
pnpm --dir desktop run verify:plugin-platform
pnpm --dir desktop run lint
pnpm --dir desktop run typecheck
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml
```

预期：所有命令退出码为 0；集成测试报告安装、sandbox IPC、Job 隔离、FileGrant 边界和 B 站插件 pipeline fixture 全部通过。

- [x] **Step 5: 发布前做静态站点耦合检查。**

```powershell
rg -n "bilibili|BV[0-9A-Za-z]+|SESSDATA|tools\.downloader\.resolve|spawn\(|exec\(" desktop/src/main/plugin-host multi_platform_core/src
```

宿主平台目录中不得出现 B 站解析字段或站点专属分支；允许出现通用 `spawn('git', args)` 和工具服务的固定进程调用，但不得出现插件传入的任意命令参数。

- [ ] **Step 6: 提交主仓库文档和实现。**

```powershell
git add docs/superpowers/plans/2026-07-22-plugin-platform-sandboxed-media-development-plan.md
git commit -m "docs: add plugin platform development plan"
```

## 12. 2026-07-22 发布包与安装进度纠偏

该纠偏保持插件平台的职责边界：宿主不执行第三方 `install` 或 `build` 脚本；插件仓库必须在固定 Git revision 中提交 manifest 声明的运行时入口。安装进度仅由宿主生命周期阶段产生，插件不能提交或影响进度值。

- [x] **Step 1: 复现并定位 Git 安装入口缺失。**

确认 `guyantools.plugin.json` 声明 `dist/index.html` 和 `dist/worker.js`，但插件仓库此前 `.gitignore` 排除了 `dist/`，所以固定 revision 克隆后 manifest resolver 正确拒绝安装。

- [x] **Step 2: 发布包含预构建入口的插件版本。**

插件仓库新增 Git 跟踪发布包测试，提交 `dist/`，发布并推送 `v0.2.1`（commit `ddff733c84ceec395a3c3ed4224454aadd5569c9`）；市场目录同步固定 `version`、`ref` 和 `resolvedCommit`，并通过本地与远程校验。

- [x] **Step 3: 实现宿主控制的安装阶段进度。**

新增 `PluginInstallProgress`，Git 安装按 `cloning -> validating -> activating -> registering -> completed` 报告；市场解析和失败也报告。主进程以 `plugin-host:install-progress` 转发，preload 暴露可清理的订阅 API，插件页面显示阶段、百分比和失败原因。

- [x] **Step 4: 补齐安装可审查信息与回归测试。**

市场卡片显示固定 commit，已安装项显示 manifest 请求权限、已批准权限和 capability 数量。生命周期集成测试覆盖阶段顺序，host 测试覆盖市场条目缺失的失败事件；`test:plugin-platform`（43 tests）、`verify:plugin-platform` 和 TypeScript 检查均通过。

- [x] **Step 5: 收紧发布包边界和更新安全。**

分支/标签 Git fetch 使用明确的 heads/tags ref；manifest 入口拒绝符号链接并要求普通文件；市场权限/capability 摘要使用稳定结构化比较；市场来源更新重新经过市场摘要、固定 commit 和已批准权限校验，普通 Git 更新继续报告安装阶段。

- [x] **Step 6: 修复市场安装 renderer 回归。**

安装确认弹窗改为页面单一元素根节点，消除路由过渡和运行时指令作用于 Fragment 的 Vue 警告；新增 `serializeApprovedPermissions` 将 Vue 响应式权限数组转换为 structured-clone 可传输的普通数组，避免 `An object could not be cloned`。回归测试、`test:plugin-platform`（43 tests）、`verify:plugin-platform`、`typecheck`、`build:app`、`lint`（0 errors）和 `git diff --check` 均通过。

- [x] **Step 7: 修复首页插件页面入口。**

统一插件页面 canonical 路径为 `/plugins/runtime/<plugin>/<page>`，首页组件打开时优先使用宿主返回的 `routePath` 并补注册动态路由，修复旧 `/plugin/...` 路径导致的空白/无法跳转。安装仍保持“安装后显式启用”的安全边界；启用插件后，其页面才会出现在首页快捷组件的插件页面选项中。新增路由和自定义路径回归测试，相关测试、类型检查和 renderer 构建通过。

- [x] **Step 8: 修复插件运行页挂载身份。**

动态路由使用具体静态 `routePath` 注册，插件与页面 ID 位于 route meta 而非 `route.params`；运行页改为优先读取 meta 并兼容 params，避免挂载时传入空 ID 导致 `Plugin is not registered`。新增运行页身份回归测试，插件平台测试（43 tests）、类型检查和 renderer 构建通过。

## 13. 完成标准

开发完成必须同时满足：

1. `guyantools.plugin.json` 是市场插件唯一运行时 manifest，且 `capabilities` 与 `permissions` 分离校验。
2. 宿主没有 B 站解析、BV 号识别、站点 Cookie 字段或站点下载适配器。
3. Git 安装记录保存固定 commit、摘要和回滚版本；市场失败可使用最近有效缓存。
4. sandboxed UI/worker 无 Node/Electron/任意命令/任意路径访问，IPC 身份来自 sender context。
5. Job、FileGrant、Preview、Secret 和媒体 Tag 在应用重启、取消、失败和卸载路径上可恢复或清理。
6. B 站插件可独立构建、声明 capability、解析授权 URL、调用通用宿主原语并完成下载/抽取/Tag/预览。
7. 两个 GitHub 仓库的 `main` 分支、README、LICENSE、CI 和真实 catalog 地址已写入市场配置。
8. 第 11 节全部验证命令通过，且没有未解释的宿主改动或未提交的协议漂移。
