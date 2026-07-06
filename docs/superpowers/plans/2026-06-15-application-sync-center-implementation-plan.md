# Application Sync Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GuYanTools sync center that can synchronize application configuration, knowledge-base data, and AI settings through both WebDAV-first personal cloud sync and a later self-hosted sync backend.

**Architecture:** The app remains local-first. The renderer uses a sync center UI, preload exposes typed sync IPC, the main process owns provider orchestration and secret handling, and `multi_platform_core` owns durable sync metadata, object state, outbox, conflict cache, and domain export/import services. WebDAV uses client-side merge with per-device remote files; the self-hosted backend uses server revisions, cursors, operations, and assets.

**Tech Stack:** Electron 37, Vue 3, TypeScript, Pinia setup stores, Electron IPC, Rust `multi_platform_core` with SQLite migrations/services/N-API bindings, WebDAV over `fetch`, optional Rust `sync_server` with `axum`, PostgreSQL, Redis, S3-compatible object storage, existing `AppConfigManager`, knowledge services, AI contracts, and docs/plans sync backend design.

---

## Source Documents And Decisions

- Existing backend plan: `docs/plans/multi-device-sync-backend-development-plan.md`
- App config contract: `desktop/src/contracts/app_config.ts`
- App config manager: `desktop/src/main/app-config/manager.ts`
- Existing knowledge contract: `desktop/src/contracts/knowledge.ts`
- Existing AI contract: `desktop/src/contracts/ai.ts`
- Existing multi-device clipboard surface: `desktop/src/contracts/multi_device_clipboard.ts`
- Existing desktop settings page: `desktop/src/windows/main/pages/Settings.vue`
- Existing preload boundary: `desktop/src/preload.ts`
- Existing main process entry: `desktop/src/main/index.ts`
- Existing Rust migration pattern: `multi_platform_core/migrations/`
- Existing Rust N-API binding: `multi_platform_core/src/bindings/napi.rs`

Technical decisions:

1. Treat sync as an application-wide capability, not as a clipboard-only feature.
2. Keep local data authoritative for offline operation.
3. Present user-facing sync as multiple selectable configuration profiles, but store underlying data as `collection + objectId` objects for conflict handling.
4. Every synced object has a stable `objectId`, `ownerDeviceId`, `schemaVersion`, `baseRev`, `localRev`, `remoteRev`, `payloadHash`, and `updatedAt`.
5. WebDAV is the first implementation provider for personal sync, with Jianguoyun as the first preset.
6. WebDAV writes are per-device to avoid last-writer overwriting another device's manifest.
7. The self-hosted backend follows the existing Rust sync backend plan and can reuse the same local sync metadata and mapper layer.
8. Secrets are excluded by default. AI API keys, provider tokens, FTP/SSH passwords, and plugin secrets require explicit encrypted-secret support in a later phase.
9. Knowledge-base sync uses stable IDs and names. Names help users understand conflicts; names are not identity.
10. AI sync includes assistant/provider/model metadata and excludes API keys until encrypted sync is implemented.

## User-Facing Product Model

The sync center exposes these ideas:

| Concept | Meaning |
| --- | --- |
| Local profile | The current device's editable app configuration profile. |
| Remote profile | A configuration profile uploaded by another device or by this device earlier. |
| Active profile | The profile currently applied to the local app. |
| Default profile policy | Which profile to apply on startup: last used, local, or a selected remote profile. |
| Collection | A sync domain such as `app.profile`, `app.appearance`, `knowledge.page`, or `ai.assistant`. |
| Conflict | A case where local and remote changed the same object from the same base revision. |
| Provider | WebDAV or self-hosted backend. |

The user can:

- Open Sync Center from Settings.
- Configure Jianguoyun WebDAV or a custom WebDAV provider.
- Later configure self-hosted sync backend URL/account/device.
- See remote profiles by device name and updated time.
- Upload the local profile as a new remote profile.
- Pull a remote profile and keep it as a local selectable profile.
- Apply a profile immediately.
- Set a default profile for future starts.
- Enable or disable sync per collection.
- Resolve conflicts by using local, using remote, keeping both, or manually merging when supported.

## Data Classification

| Level | Collections | Default | Notes |
| --- | --- | --- | --- |
| L1 low-risk config | `app.profile`, `app.appearance`, `app.bottom_bar`, `app.settings_tabs`, `app.shortcuts` | Enabled | Shortcuts must be platform-scoped. |
| L2 app feature config | `app.features.terminal`, `app.features.clipboard`, `app.features.knowledge`, `app.features.ai` | Enabled except local paths | Device-local paths are excluded or platform-scoped. |
| L3 knowledge metadata | `knowledge.library`, `knowledge.space`, `knowledge.folder`, `knowledge.tag`, `knowledge.link` | Optional | Requires explicit sync enablement. |
| L4 knowledge content/assets | `knowledge.page`, `knowledge.asset` | Optional | Assets are uploaded separately. |
| L5 AI metadata | `ai.assistant`, `ai.provider`, `ai.model_config`, `ai.mcp_server_metadata` | Optional | API keys and env secrets are excluded. |
| L6 high-risk config | `app.plugins.config`, `web.security`, `web.script`, `ai.secret`, `plugin.secret` | Disabled | Requires per-domain opt-in and encrypted-secret support for secrets. |

## Remote Layouts

### WebDAV Remote Layout

Use this root for Jianguoyun and custom WebDAV:

```text
GuYanTools/Sync/
├── meta.json
├── devices/
│   └── <device_id>/
│       ├── device.json
│       ├── profiles/
│       │   └── <profile_id>.json
│       ├── objects/
│       │   └── <collection>/
│       │       └── <object_id>.json
│       ├── outbox/
│       │   └── <op_id>.json
│       └── tombstones/
│           └── <collection>/
│               └── <object_id>.json
└── assets/
    └── <sha256-prefix>/
        └── <sha256>.<ext>
```

Rules:

- Each device only writes under `devices/<device_id>/`.
- Any device can read all device directories.
- Assets are content-addressed and deduplicated by hash.
- Client-side merge builds the effective remote view.
- WebDAV does not provide authoritative revision assignment; local sync metadata tracks observed remote hashes.

### Self-Hosted Backend Layout

The backend is the authority for revisions and cursors:

```text
users
devices
sync_profiles
sync_objects
sync_ops
sync_cursors
sync_conflicts
assets
encrypted_secrets
```

The local client mapper should be provider-agnostic:

```ts
interface SyncProvider {
  testConnection(): Promise<SyncConnectionResult>;
  bootstrap(input: SyncBootstrapInput): Promise<SyncBootstrapResult>;
  pull(input: SyncPullInput): Promise<SyncPullResult>;
  push(input: SyncPushInput): Promise<SyncPushResult>;
  uploadAsset(input: SyncAssetUploadInput): Promise<SyncAssetUploadResult>;
  downloadAsset(input: SyncAssetDownloadInput): Promise<Buffer>;
}
```

## Cross-Phase File Map

### Contracts

- Create: `desktop/src/contracts/sync.ts`
  - Renderer-safe sync profile, provider, collection, status, conflict, and IPC types.
- Modify: `desktop/src/contracts/app_config.ts`
  - Add `features.syncCenter` after the sync center contract exists.
  - Keep secrets out of renderer-facing config.
- Modify: `desktop/src/contracts/knowledge.ts`
  - Add export/import payload types only if existing service types are insufficient.
- Modify: `desktop/src/contracts/ai.ts`
  - Add sync-safe AI metadata projection types if needed.

### Main Process

- Create: `desktop/src/main/sync/ipc.ts`
- Create: `desktop/src/main/sync/sync_service.ts`
- Create: `desktop/src/main/sync/sync_scheduler.ts`
- Create: `desktop/src/main/sync/providers/webdav_provider.ts`
- Create: `desktop/src/main/sync/providers/sync_server_provider.ts`
- Create: `desktop/src/main/sync/providers/provider_types.ts`
- Create: `desktop/src/main/sync/mappers/app_config_mapper.ts`
- Create: `desktop/src/main/sync/mappers/knowledge_mapper.ts`
- Create: `desktop/src/main/sync/mappers/ai_mapper.ts`
- Create: `desktop/src/main/sync/conflict_resolver.ts`
- Create: `desktop/src/main/sync/secret_store.ts`
- Modify: `desktop/src/main/index.ts`
  - Register sync IPC and initialize scheduler.
- Modify: `desktop/src/preload.ts`
  - Expose `window.syncApi`.

### Renderer

- Create: `desktop/src/windows/main/stores/sync_store.ts`
- Create: `desktop/src/windows/main/pages/Settings/components/SyncCenterPanel.vue`
- Create: `desktop/src/windows/main/pages/Settings/components/SyncProfileList.vue`
- Create: `desktop/src/windows/main/pages/Settings/components/SyncProviderSettings.vue`
- Create: `desktop/src/windows/main/pages/Settings/components/SyncConflictList.vue`
- Modify: `desktop/src/windows/main/pages/Settings.vue`
  - Add Sync Center tab or section using existing Settings patterns.
- Modify: `desktop/src/windows/main/vite-env.d.ts`
  - Add `syncApi` global type.

### Rust Core

- Create: `multi_platform_core/migrations/0XX_add_sync_metadata.sql`
- Create: `multi_platform_core/src/models/sync.rs`
- Create: `multi_platform_core/src/services/sync_service.rs`
- Modify: `multi_platform_core/src/models/mod.rs`
- Modify: `multi_platform_core/src/services/mod.rs`
- Modify: `multi_platform_core/src/bindings/napi.rs`
- Later create: `sync_server/` crate for the self-hosted backend.

### Verification

- Create: `desktop/scripts/verify-sync-center.cjs`
- Create: `desktop/scripts/verify-sync-webdav-provider.cjs`
- Create: `desktop/scripts/verify-sync-mappers.cjs`
- Modify: `desktop/package.json`
  - Add `verify:sync-center`, `verify:sync-webdav`, and `verify:sync-mappers`.

## Shared Contracts

Introduce these in `desktop/src/contracts/sync.ts` before implementation:

```ts
export type SyncProviderKind = 'webdav' | 'sync-server';
export type SyncCollectionKind =
  | 'app.profile'
  | 'app.appearance'
  | 'app.bottom_bar'
  | 'app.shortcuts'
  | 'app.features'
  | 'knowledge.library'
  | 'knowledge.space'
  | 'knowledge.folder'
  | 'knowledge.page'
  | 'knowledge.asset'
  | 'knowledge.tag'
  | 'knowledge.link'
  | 'ai.assistant'
  | 'ai.provider'
  | 'ai.model_config';

export type SyncStatus =
  | 'disabled'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'conflict'
  | 'device_revoked';

export type SyncConflictResolution = 'use-local' | 'use-remote' | 'keep-both' | 'manual';

export interface SyncDeviceIdentity {
  deviceId: string;
  deviceName: string;
  platform: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';
  appVersion: string;
  createdAt: number;
}

export interface SyncProfileSummary {
  profileId: string;
  profileName: string;
  ownerDeviceId: string;
  ownerDeviceName: string;
  schemaVersion: number;
  appVersion: string;
  payloadHash: string;
  updatedAt: number;
  isLocal: boolean;
  isActive: boolean;
  isDefault: boolean;
}

export interface SyncObjectEnvelope<TPayload = unknown> {
  collection: SyncCollectionKind;
  objectId: string;
  ownerDeviceId: string;
  schemaVersion: number;
  baseRev?: string;
  localRev?: string;
  remoteRev?: string;
  payloadHash: string;
  payload: TPayload;
  deleted: boolean;
  updatedAt: number;
}

export interface SyncConflictSummary {
  conflictId: string;
  collection: SyncCollectionKind;
  objectId: string;
  title: string;
  localDeviceName: string;
  remoteDeviceName: string;
  localUpdatedAt: number;
  remoteUpdatedAt: number;
  status: 'pending' | 'resolved';
}

export interface SyncCenterState {
  enabled: boolean;
  providerKind: SyncProviderKind;
  status: SyncStatus;
  lastSuccessAt?: number;
  lastError?: string;
  pendingCount: number;
  conflictCount: number;
  activeProfileId: string;
  defaultProfileId: string;
}
```

## Phase 0: Plan Hygiene And Reversible Setup

### Task 0.1: Remove Earlier Clipboard-Only Drafts If Present

**Files:**
- Inspect: `desktop/src/contracts/app_config.ts`
- Inspect: `desktop/src/main/app-config/manager.ts`
- Inspect: `desktop/src/main/multi-device-clipboard/webdav_sync.ts`
- Inspect: `desktop/scripts/verify-multi-device-clipboard-webdav.cjs`

- [ ] **Step 1: Confirm no clipboard-only WebDAV draft remains**

Run:

```bash
git status --short
rg -n "MultiDeviceClipboardSyncMode|cloudSync|webdav_sync|verify-multi-device-clipboard-webdav" desktop/src desktop/scripts
```

Expected:

```text
No search results for clipboard-only sync draft identifiers.
```

- [ ] **Step 2: If the draft files exist, remove only those files**

Use `apply_patch` to delete only:

```text
desktop/src/main/multi-device-clipboard/webdav_sync.ts
desktop/scripts/verify-multi-device-clipboard-webdav.cjs
```

- [ ] **Step 3: If AppConfig contains clipboard-only sync fields, remove only those fields**

Remove only these draft identifiers:

```text
syncMode
cloudSync
MultiDeviceClipboardSyncMode
MultiDeviceClipboardWebDavProvider
MultiDeviceClipboardCloudSyncConfig
```

Do not remove existing `multiDeviceClipboard.enabled`, `deviceName`, `maxSyncBytes`, `historyLimit`, or `networkInterfacePriority`.

### Task 0.2: Create The Sync Plan Verifier

**Files:**
- Create: `desktop/scripts/verify-sync-center.cjs`
- Modify: `desktop/package.json`

- [ ] **Step 1: Add verifier script**

Create `desktop/scripts/verify-sync-center.cjs`:

```js
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'src/contracts/sync.ts',
  'src/main/sync/ipc.ts',
  'src/main/sync/sync_service.ts',
  'src/main/sync/providers/provider_types.ts',
  'src/main/sync/providers/webdav_provider.ts',
  'src/main/sync/mappers/app_config_mapper.ts',
  'src/windows/main/stores/sync_store.ts',
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error('Missing sync center files:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

console.log('Sync center file surface exists.');
```

- [ ] **Step 2: Register script**

In `desktop/package.json`, add:

```json
"verify:sync-center": "node scripts/verify-sync-center.cjs"
```

- [ ] **Step 3: Run and confirm RED**

Run:

```bash
pnpm --dir desktop run verify:sync-center
```

Expected:

```text
Missing sync center files:
```

## Phase 1: Core Sync Metadata

### Task 1.1: Add Sync Metadata Migration

**Files:**
- Create: `multi_platform_core/migrations/0XX_add_sync_metadata.sql`
- Modify migration registry only if current migration loader requires explicit registration.

- [ ] **Step 1: Pick the next migration number**

Run:

```bash
Get-ChildItem multi_platform_core/migrations | Sort-Object Name | Select-Object -Last 5 Name
```

Expected: identify the next sequential `0XX` number.

- [ ] **Step 2: Create migration**

Create the next migration with:

```sql
CREATE TABLE IF NOT EXISTS sync_devices (
  device_id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  app_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_profiles (
  profile_id TEXT PRIMARY KEY,
  profile_name TEXT NOT NULL,
  owner_device_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  is_local INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_object_state (
  collection TEXT NOT NULL,
  object_id TEXT NOT NULL,
  owner_device_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  base_rev TEXT,
  local_rev TEXT,
  remote_rev TEXT,
  payload_hash TEXT NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (collection, object_id)
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  op_id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  object_id TEXT NOT NULL,
  op_kind TEXT NOT NULL,
  base_rev TEXT,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  conflict_id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  object_id TEXT NOT NULL,
  title TEXT NOT NULL,
  local_payload_json TEXT NOT NULL,
  remote_payload_json TEXT NOT NULL,
  base_payload_json TEXT,
  local_updated_at INTEGER NOT NULL,
  remote_updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS sync_provider_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_status
  ON sync_outbox(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status
  ON sync_conflicts(status, created_at);
```

- [ ] **Step 3: Run Rust migration-backed tests**

Run:

```bash
cargo test --manifest-path multi_platform_core/Cargo.toml sync
```

Expected initially: fail until `sync_service` exists.

### Task 1.2: Add Rust Sync Models And Service

**Files:**
- Create: `multi_platform_core/src/models/sync.rs`
- Create: `multi_platform_core/src/services/sync_service.rs`
- Modify: `multi_platform_core/src/models/mod.rs`
- Modify: `multi_platform_core/src/services/mod.rs`

- [ ] **Step 1: Add models**

Create `multi_platform_core/src/models/sync.rs`:

```rust
use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProfile {
    pub profile_id: String,
    pub profile_name: String,
    pub owner_device_id: String,
    pub schema_version: i64,
    pub app_version: String,
    pub payload_hash: String,
    pub is_local: bool,
    pub is_active: bool,
    pub is_default: bool,
    pub payload_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub conflict_id: String,
    pub collection: String,
    pub object_id: String,
    pub title: String,
    pub local_payload_json: String,
    pub remote_payload_json: String,
    pub base_payload_json: Option<String>,
    pub local_updated_at: i64,
    pub remote_updated_at: i64,
    pub status: String,
    pub created_at: i64,
    pub resolved_at: Option<i64>,
}
```

- [ ] **Step 2: Add service skeleton with tests**

Create `multi_platform_core/src/services/sync_service.rs` with service methods:

```rust
pub struct SyncService;

impl SyncService {
    pub fn list_profiles(db: &Database) -> DbResult<Vec<SyncProfile>> { /* query rows */ }
    pub fn upsert_profile(db: &Database, profile: SyncProfile) -> DbResult<SyncProfile> { /* upsert row */ }
    pub fn set_active_profile(db: &Database, profile_id: &str) -> DbResult<()> { /* transaction */ }
    pub fn list_conflicts(db: &Database) -> DbResult<Vec<SyncConflict>> { /* query pending */ }
}
```

Add tests:

```rust
#[test]
fn upserts_and_selects_active_profile() {
    let db = Database::new_in_memory().unwrap();
    let first = sample_profile("profile-a", true);
    let second = sample_profile("profile-b", false);
    SyncService::upsert_profile(&db, first).unwrap();
    SyncService::upsert_profile(&db, second).unwrap();
    SyncService::set_active_profile(&db, "profile-b").unwrap();
    let profiles = SyncService::list_profiles(&db).unwrap();
    assert!(profiles.iter().any(|p| p.profile_id == "profile-b" && p.is_active));
    assert!(profiles.iter().all(|p| p.profile_id == "profile-b" || !p.is_active));
}
```

- [ ] **Step 3: Export modules**

Add:

```rust
pub mod sync;
pub mod sync_service;
```

to the existing `models/mod.rs` and `services/mod.rs` pattern.

- [ ] **Step 4: Run tests**

Run:

```bash
cargo test --manifest-path multi_platform_core/Cargo.toml sync
```

Expected: pass.

## Phase 2: Desktop Sync Contract And IPC

### Task 2.1: Add Renderer-Safe Sync Contract

**Files:**
- Create: `desktop/src/contracts/sync.ts`
- Modify: `desktop/src/windows/main/vite-env.d.ts`

- [ ] **Step 1: Add contract**

Create `desktop/src/contracts/sync.ts` using the shared contract definitions from this plan. Include `SyncApi`:

```ts
export interface SyncApi {
  getState: () => Promise<SyncCenterState>;
  listProfiles: () => Promise<SyncProfileSummary[]>;
  listConflicts: () => Promise<SyncConflictSummary[]>;
  testConnection: () => Promise<SyncConnectionResult>;
  syncNow: () => Promise<SyncRunSummary>;
  applyProfile: (profileId: string) => Promise<void>;
  setDefaultProfile: (profileId: string) => Promise<void>;
  resolveConflict: (conflictId: string, resolution: SyncConflictResolution) => Promise<void>;
  onEvent: (listener: (event: SyncEvent) => void) => () => void;
}
```

Add these support types:

```ts
export interface SyncConnectionResult {
  ok: boolean;
  message: string;
}

export interface SyncRunSummary {
  pushed: number;
  pulled: number;
  conflicts: number;
  skipped: number;
  startedAt: number;
  finishedAt: number;
}

export type SyncEvent =
  | { type: 'state-changed'; state: SyncCenterState }
  | { type: 'profiles-changed' }
  | { type: 'conflicts-changed' }
  | { type: 'sync-finished'; summary: SyncRunSummary };
```

- [ ] **Step 2: Add global type**

In `desktop/src/windows/main/vite-env.d.ts`, add:

```ts
interface Window {
  syncApi?: import('@/contracts/sync').SyncApi;
}
```

### Task 2.2: Add Main IPC And Preload API

**Files:**
- Create: `desktop/src/main/sync/ipc.ts`
- Create: `desktop/src/main/sync/sync_service.ts`
- Modify: `desktop/src/preload.ts`
- Modify: `desktop/src/main/index.ts`

- [ ] **Step 1: Create sync service placeholder**

Create `desktop/src/main/sync/sync_service.ts`:

```ts
import type {
  SyncCenterState,
  SyncConflictResolution,
  SyncConflictSummary,
  SyncConnectionResult,
  SyncProfileSummary,
  SyncRunSummary,
} from '@/contracts/sync';

class SyncService {
  async getState(): Promise<SyncCenterState> {
    return {
      enabled: false,
      providerKind: 'webdav',
      status: 'disabled',
      pendingCount: 0,
      conflictCount: 0,
      activeProfileId: '',
      defaultProfileId: '',
    };
  }

  async listProfiles(): Promise<SyncProfileSummary[]> {
    return [];
  }

  async listConflicts(): Promise<SyncConflictSummary[]> {
    return [];
  }

  async testConnection(): Promise<SyncConnectionResult> {
    return { ok: false, message: '同步尚未配置' };
  }

  async syncNow(): Promise<SyncRunSummary> {
    const now = Date.now();
    return { pushed: 0, pulled: 0, conflicts: 0, skipped: 0, startedAt: now, finishedAt: now };
  }

  async applyProfile(_profileId: string): Promise<void> {}
  async setDefaultProfile(_profileId: string): Promise<void> {}
  async resolveConflict(_conflictId: string, _resolution: SyncConflictResolution): Promise<void> {}
}

export const syncService = new SyncService();
```

- [ ] **Step 2: Register IPC handlers**

Create `desktop/src/main/sync/ipc.ts`:

```ts
import { ipcMain } from 'electron';
import { syncService } from './sync_service';
import type { SyncConflictResolution } from '@/contracts/sync';

let registered = false;

export function registerSyncIpcHandlers() {
  if (registered) return;
  ipcMain.handle('sync:get-state', () => syncService.getState());
  ipcMain.handle('sync:list-profiles', () => syncService.listProfiles());
  ipcMain.handle('sync:list-conflicts', () => syncService.listConflicts());
  ipcMain.handle('sync:test-connection', () => syncService.testConnection());
  ipcMain.handle('sync:sync-now', () => syncService.syncNow());
  ipcMain.handle('sync:apply-profile', (_event, profileId: string) => syncService.applyProfile(profileId));
  ipcMain.handle('sync:set-default-profile', (_event, profileId: string) => syncService.setDefaultProfile(profileId));
  ipcMain.handle('sync:resolve-conflict', (_event, conflictId: string, resolution: SyncConflictResolution) =>
    syncService.resolveConflict(conflictId, resolution));
  registered = true;
}
```

- [ ] **Step 3: Expose preload API**

In `desktop/src/preload.ts`, add a `syncApi` object:

```ts
const syncApi: import('@/contracts/sync').SyncApi = {
  getState: () => ipcRenderer.invoke('sync:get-state'),
  listProfiles: () => ipcRenderer.invoke('sync:list-profiles'),
  listConflicts: () => ipcRenderer.invoke('sync:list-conflicts'),
  testConnection: () => ipcRenderer.invoke('sync:test-connection'),
  syncNow: () => ipcRenderer.invoke('sync:sync-now'),
  applyProfile: (profileId) => ipcRenderer.invoke('sync:apply-profile', profileId),
  setDefaultProfile: (profileId) => ipcRenderer.invoke('sync:set-default-profile', profileId),
  resolveConflict: (conflictId, resolution) => ipcRenderer.invoke('sync:resolve-conflict', conflictId, resolution),
  onEvent: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: import('@/contracts/sync').SyncEvent) => listener(payload);
    ipcRenderer.on('sync:event', wrappedListener);
    return () => ipcRenderer.removeListener('sync:event', wrappedListener);
  },
};
contextBridge.exposeInMainWorld('syncApi', syncApi);
```

- [ ] **Step 4: Register in main index**

In `desktop/src/main/index.ts`, import and call:

```ts
import { registerSyncIpcHandlers } from './sync/ipc';

registerSyncIpcHandlers();
```

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --dir desktop run verify:sync-center
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

Expected: sync surface exists and TypeScript passes after all required files exist.

## Phase 3: AppConfig Profile Sync

### Task 3.1: Add AppConfig Mapper

**Files:**
- Create: `desktop/src/main/sync/mappers/app_config_mapper.ts`
- Create: `desktop/scripts/verify-sync-mappers.cjs`
- Modify: `desktop/package.json`

- [ ] **Step 1: Add mapper verifier**

Create `desktop/scripts/verify-sync-mappers.cjs`:

```js
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mapper = path.join(root, 'src/main/sync/mappers/app_config_mapper.ts');
const source = fs.readFileSync(mapper, 'utf8');

const required = [
  'export function exportAppConfigSyncObjects',
  'export function applyAppConfigSyncObjects',
  'sanitizeAppConfigForSync',
  'app.shortcuts',
  'app.features',
];

const missing = required.filter((token) => !source.includes(token));
if (missing.length > 0) {
  console.error(`Missing mapper tokens: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Sync mapper surface verified.');
```

Register:

```json
"verify:sync-mappers": "node scripts/verify-sync-mappers.cjs"
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --dir desktop run verify:sync-mappers
```

Expected: fails because mapper does not exist.

- [ ] **Step 3: Implement mapper**

Create `desktop/src/main/sync/mappers/app_config_mapper.ts`:

```ts
import { createHash } from 'node:crypto';
import type { AppConfig, AppConfigPatch } from '@/contracts/app_config';
import type { SyncObjectEnvelope } from '@/contracts/sync';

export function exportAppConfigSyncObjects(config: AppConfig, ownerDeviceId: string): SyncObjectEnvelope[] {
  const sanitized = sanitizeAppConfigForSync(config);
  const now = Date.now();
  return [
    createObject('app.appearance', 'default', ownerDeviceId, sanitized.appearance, now),
    createObject('app.bottom_bar', 'default', ownerDeviceId, sanitized.bottomBar, now),
    createObject('app.shortcuts', currentPlatformKey(), ownerDeviceId, sanitized.shortcuts, now),
    createObject('app.features', 'safe-default', ownerDeviceId, sanitized.features, now),
  ];
}

export function applyAppConfigSyncObjects(current: AppConfig, objects: SyncObjectEnvelope[]): AppConfigPatch {
  const patch: AppConfigPatch = {};
  for (const object of objects) {
    if (object.collection === 'app.appearance') patch.appearance = object.payload as AppConfigPatch['appearance'];
    if (object.collection === 'app.bottom_bar') patch.bottomBar = object.payload as AppConfigPatch['bottomBar'];
    if (object.collection === 'app.shortcuts') patch.shortcuts = object.payload as AppConfigPatch['shortcuts'];
    if (object.collection === 'app.features') patch.features = object.payload as AppConfigPatch['features'];
  }
  void current;
  return patch;
}

export function sanitizeAppConfigForSync(config: AppConfig): Pick<AppConfig, 'appearance' | 'bottomBar' | 'shortcuts' | 'features'> {
  return {
    appearance: config.appearance,
    bottomBar: config.bottomBar,
    shortcuts: config.shortcuts,
    features: {
      settings: config.features.settings,
      terminal: {
        ...config.features.terminal,
        defaultCwd: '',
        localProfiles: config.features.terminal.localProfiles.map((profile) => ({ ...profile, cwd: '' })),
      },
      multiDeviceClipboard: config.features.multiDeviceClipboard,
      knowledge: {
        ...config.features.knowledge,
        customAssetDirectory: '',
        libreOfficePath: '',
      },
      quickLaunch: {
        ...config.features.quickLaunch,
        everythingEsPath: '',
      },
      aiAgent: {
        ...config.features.aiAgent,
        providers: config.features.aiAgent.providers.map((provider) => ({
          ...provider,
          apiKey: undefined,
          apiKeyRef: provider.apiKeyRef ? 'redacted' : undefined,
        })),
      },
    },
  };
}

function createObject(collection: SyncObjectEnvelope['collection'], objectId: string, ownerDeviceId: string, payload: unknown, updatedAt: number): SyncObjectEnvelope {
  const body = JSON.stringify(payload);
  return {
    collection,
    objectId,
    ownerDeviceId,
    schemaVersion: 1,
    payloadHash: createHash('sha256').update(body).digest('hex'),
    payload,
    deleted: false,
    updatedAt,
  };
}

function currentPlatformKey() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'linux') return 'linux';
  return 'unknown';
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm --dir desktop run verify:sync-mappers
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
```

Expected: pass.

### Task 3.2: Implement Profile List And Apply Flow

**Files:**
- Modify: `desktop/src/main/sync/sync_service.ts`
- Modify: `desktop/src/main/app-config/manager.ts` only if a public apply helper is required.

- [ ] **Step 1: Load local and remote profile summaries**

`syncService.listProfiles()` should return:

```ts
[
  {
    profileId,
    profileName,
    ownerDeviceId,
    ownerDeviceName,
    schemaVersion,
    appVersion,
    payloadHash,
    updatedAt,
    isLocal,
    isActive,
    isDefault,
  }
]
```

- [ ] **Step 2: Apply profile**

`applyProfile(profileId)` should:

1. Read profile payload from `sync_profiles`.
2. Convert payload to `AppConfigPatch`.
3. Call `appConfigManager.updateConfig(patch)`.
4. Mark the profile active in sync metadata.
5. Emit `sync:event` profiles/state changes.

- [ ] **Step 3: Default profile**

`setDefaultProfile(profileId)` should only update metadata. It should not immediately apply the profile.

## Phase 4: WebDAV Provider

### Task 4.1: Add Provider Types And WebDAV Path Utilities

**Files:**
- Create: `desktop/src/main/sync/providers/provider_types.ts`
- Create: `desktop/src/main/sync/providers/webdav_provider.ts`
- Create: `desktop/scripts/verify-sync-webdav-provider.cjs`
- Modify: `desktop/package.json`

- [ ] **Step 1: Create WebDAV verifier**

Create `desktop/scripts/verify-sync-webdav-provider.cjs`:

```js
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/main/sync/providers/webdav_provider.ts');
const source = fs.readFileSync(file, 'utf8');
const required = [
  'class WebDavSyncProvider',
  'normalizeWebDavEndpoint',
  'createWebDavBasicAuthHeader',
  'devices/',
  'objects/',
  'assets/',
  'MKCOL',
  'PROPFIND',
];
const missing = required.filter((token) => !source.includes(token));
if (missing.length > 0) {
  console.error(`Missing WebDAV provider tokens: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('WebDAV provider surface verified.');
```

Register:

```json
"verify:sync-webdav": "node scripts/verify-sync-webdav-provider.cjs"
```

- [ ] **Step 2: Add provider interface**

Create `desktop/src/main/sync/providers/provider_types.ts`:

```ts
import type { SyncObjectEnvelope, SyncProfileSummary } from '@/contracts/sync';

export interface SyncPullResult {
  profiles: SyncProfileSummary[];
  objects: SyncObjectEnvelope[];
  deletedObjects: SyncObjectEnvelope[];
}

export interface SyncPushInput {
  deviceId: string;
  profiles: SyncObjectEnvelope[];
  objects: SyncObjectEnvelope[];
  tombstones: SyncObjectEnvelope[];
}

export interface SyncProvider {
  testConnection(): Promise<{ ok: boolean; message: string }>;
  pull(): Promise<SyncPullResult>;
  push(input: SyncPushInput): Promise<{ pushed: number }>;
  uploadAsset(key: string, bytes: Buffer, mimeType?: string): Promise<void>;
  downloadAsset(key: string): Promise<Buffer | null>;
}
```

- [ ] **Step 3: Implement path utilities**

`webdav_provider.ts` must include:

```ts
export function normalizeWebDavEndpoint(value: string): string { /* http/https and trailing slash */ }
export function createWebDavBasicAuthHeader(username: string, password: string): string { /* Basic base64 */ }
export function createDeviceRoot(deviceId: string): string { return `devices/${encodeURIComponent(deviceId)}`; }
```

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --dir desktop run verify:sync-webdav
```

Expected: pass after implementation.

### Task 4.2: Implement Jianguoyun Preset And Secret Storage

**Files:**
- Create: `desktop/src/main/sync/secret_store.ts`
- Modify: `desktop/src/contracts/sync.ts`
- Modify: `desktop/src/main/sync/providers/webdav_provider.ts`

- [x] **Step 1: Secret store**

Create `desktop/src/main/sync/secret_store.ts`:

```ts
import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function saveSyncSecret(key: string, value: string) {
  const file = secretPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(value).toString('base64')
    : Buffer.from(value, 'utf8').toString('base64');
  await writeFile(file, payload, 'utf8');
}

export async function readSyncSecret(key: string) {
  const file = secretPath(key);
  const raw = await readFile(file, 'utf8').catch(() => '');
  if (!raw) return '';
  const bytes = Buffer.from(raw, 'base64');
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.decryptString(bytes)
    : bytes.toString('utf8');
}

function secretPath(key: string) {
  const safeKey = key.replace(/[^\w.-]+/g, '_');
  return path.join(app.getPath('userData'), 'sync-secrets', `${safeKey}.secret`);
}
```

- [x] **Step 2: Jianguoyun preset**

Use:

```text
endpoint: https://dav.jianguoyun.com/dav/
auth: Basic username + third-party app password
remoteRoot: GuYanTools/Sync
```

Renderer config stores only username and non-secret options. Password is passed to main process once and stored through `secret_store.ts`.

### Task 4.3: WebDAV Pull/Push Semantics

**Files:**
- Modify: `desktop/src/main/sync/providers/webdav_provider.ts`
- Modify: `desktop/src/main/sync/sync_service.ts`

- [ ] **Step 1: Pull**

`pull()` should:

1. `PROPFIND GuYanTools/Sync/devices/`
2. Read each `device.json`.
3. Read each device `profiles/*.json`.
4. Read changed `objects/<collection>/<object_id>.json`.
5. Read tombstones.
6. Return normalized envelopes.

- [ ] **Step 2: Push**

`push()` should write only current device files:

```text
devices/<device_id>/device.json
devices/<device_id>/profiles/<profile_id>.json
devices/<device_id>/objects/<collection>/<object_id>.json
devices/<device_id>/tombstones/<collection>/<object_id>.json
```

- [ ] **Step 3: Conflict detection**

Conflict if:

```text
local baseRev exists
remote payloadHash changed since baseRev
local dirty = true
```

Do not overwrite remote. Write a local `sync_conflicts` row.

## Phase 5: Sync Center UI

### Task 5.1: Add Pinia Store

**Files:**
- Create: `desktop/src/windows/main/stores/sync_store.ts`

- [ ] **Step 1: Store state**

Create setup store:

```ts
export const useSyncStore = defineStore('sync', () => {
  const state = ref<SyncCenterState | null>(null);
  const profiles = ref<SyncProfileSummary[]>([]);
  const conflicts = ref<SyncConflictSummary[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function refresh() { /* call syncApi state/profiles/conflicts */ }
  async function syncNow() { /* call syncApi.syncNow then refresh */ }
  async function applyProfile(profileId: string) { /* call syncApi.applyProfile then refresh */ }
  async function setDefaultProfile(profileId: string) { /* call syncApi.setDefaultProfile then refresh */ }
  async function resolveConflict(conflictId: string, resolution: SyncConflictResolution) { /* call API then refresh */ }

  return { state, profiles, conflicts, loading, error, refresh, syncNow, applyProfile, setDefaultProfile, resolveConflict };
});
```

### Task 5.2: Build Settings Sync Center Panel

**Files:**
- Create: `desktop/src/windows/main/pages/Settings/components/SyncCenterPanel.vue`
- Create: `desktop/src/windows/main/pages/Settings/components/SyncProfileList.vue`
- Create: `desktop/src/windows/main/pages/Settings/components/SyncProviderSettings.vue`
- Create: `desktop/src/windows/main/pages/Settings/components/SyncConflictList.vue`
- Modify: `desktop/src/windows/main/pages/Settings.vue`

- [x] **Step 1: Provider settings**

Fields:

```text
Provider: Jianguoyun WebDAV | Custom WebDAV | Self-hosted backend
WebDAV endpoint
Username
Third-party app password
Remote root
Test connection
```

Self-hosted backend fields are disabled until Phase 9.

- [x] **Step 2: Profile list**

Render:

```text
Profile name
Owner device
Updated at
Active badge
Default badge
Apply button
Set default button
```

- [x] **Step 3: Conflict list**

Render:

```text
Object title
Collection label
Local updated time
Remote updated time
Use local
Use remote
Keep both
Manual merge if supported
```

- [x] **Step 4: Manual smoke check**

Run:

```bash
pnpm --dir desktop run build:renderer
```

Expected: renderer build passes.

## Phase 6: Scheduler And Sync Algorithm

### Task 6.1: Add Scheduler

**Files:**
- Create: `desktop/src/main/sync/sync_scheduler.ts`
- Modify: `desktop/src/main/sync/sync_service.ts`
- Modify: `desktop/src/main/index.ts`

- [ ] **Step 1: Scheduler behavior**

Implement:

```text
start on app ready
run once at startup after app config loads
run every 30-120 seconds based on config
debounce user-triggered config changes by 3-5 seconds
skip if another sync is running
exponential backoff after provider/network failure
```

- [ ] **Step 2: Sync algorithm**

`syncNow()` executes:

```text
load local sync state
provider.pull()
compare remote objects with local object state
apply non-conflicting remote objects
write conflicts for conflicting objects
export local dirty objects
provider.push()
mark pushed objects clean
emit summary
```

### Task 6.2: Add AppConfig Change Capture

**Files:**
- Modify: `desktop/src/main/app-config/manager.ts`
- Modify: `desktop/src/main/sync/sync_service.ts`

- [ ] **Step 1: Subscribe to config changes**

Use existing `appConfigManager.subscribe()` in `sync_service.ts`.

- [ ] **Step 2: Create dirty sync objects**

When `AppConfigManager.updateConfig()` succeeds:

```text
export AppConfig sync objects
compare hash with sync_object_state
write changed objects to sync_outbox
schedule sync
```

Do not create sync operations while applying a remote profile. Use a scoped suppression flag:

```ts
await syncService.runWithoutCapturingLocalChanges(async () => {
  await appConfigManager.updateConfig(patch);
});
```

## Phase 7: Knowledge Sync

### Task 7.1: Add Knowledge Mapper

**Files:**
- Create: `desktop/src/main/sync/mappers/knowledge_mapper.ts`
- Modify knowledge service only if export/import methods are missing.

- [ ] **Step 1: Export collections**

Map:

```text
knowledge.library -> library id/name/settings
knowledge.space -> space id/library id/name
knowledge.folder -> folder id/parent id/name/order
knowledge.page -> page id/pageType/title/contentMarkdown/contentJson/contentText/parent
knowledge.asset -> asset id/hash/mime/byteSize/originalName
knowledge.tag -> tag id/name/color
knowledge.link -> source/target references
```

- [ ] **Step 2: Identity rule**

Use ID as identity. Use name/title only for display and conflict text.

- [ ] **Step 3: Same-name conflict**

If remote and local have same name but different ID:

```text
keep both
append owner device label in conflict UI only if the user chooses to inspect
do not auto-merge
```

### Task 7.2: Knowledge Asset Sync

**Files:**
- Modify: `desktop/src/main/sync/providers/webdav_provider.ts`
- Modify: `desktop/src/main/sync/mappers/knowledge_mapper.ts`

- [ ] **Step 1: Upload assets by hash**

Remote key:

```text
assets/<first-two-hash-chars>/<sha256>.<ext>
```

- [ ] **Step 2: Download on demand**

Pull `knowledge.asset` metadata first. Download bytes only when:

```text
page references the asset
user opens asset
preview generation needs it
```

- [ ] **Step 3: Apply remote pages through knowledge service**

Do not write knowledge tables directly from sync code. Use existing service/import functions or add explicit import/apply methods.

## Phase 8: AI Sync

### Task 8.1: Add AI Mapper

**Files:**
- Create: `desktop/src/main/sync/mappers/ai_mapper.ts`
- Modify: `desktop/src/main/ai/` only if service export/import methods are missing.

- [ ] **Step 1: Export safe AI metadata**

Map:

```text
ai.assistant
ai.provider
ai.model_config
```

Include:

```text
assistant name, emoji, systemPrompt, knowledgeMode, model refs
provider kind, name, baseUrl, enabled
model id, displayName, providerModelId, capabilities
research allowed/blocked domains
```

- [ ] **Step 2: Exclude secrets**

Never export:

```text
apiKey
apiKeyRef actual value
MCP env vars containing token/key/secret/password
local file attachment cache
chat temporary attachment paths
```

- [ ] **Step 3: Preserve missing provider behavior**

If an assistant references a provider/model that does not exist locally:

```text
import the provider metadata as disabled
mark assistant as needs configuration
do not silently switch to another model
```

### Task 8.2: Encrypted Secret Placeholder

**Files:**
- Create: `desktop/src/main/sync/secret_sync_policy.ts`
- Modify: `desktop/src/contracts/sync.ts`

- [x] **Step 1: Add explicit policy**

Define:

```ts
export type SecretSyncMode = 'disabled' | 'encrypted';
```

V1 behavior:

```text
disabled only
renderer shows "密钥同步将在端到端加密阶段开放"
```

- [x] **Step 2: Add tests/verifier guard**

`verify-sync-mappers.cjs` should fail if AI mapper includes `apiKey` in exported payload.

## Phase 9: Self-Hosted Backend

### Task 9.1: Scaffold Backend Crate

**Files:**
- Create: `sync_server/Cargo.toml`
- Create: `sync_server/src/main.rs`
- Create: `sync_server/src/config.rs`
- Create: `sync_server/src/routes/mod.rs`
- Create: `sync_server/migrations/001_initial.sql`

- [x] **Step 1: Create crate**

Use:

```toml
[package]
name = "guyantools-sync-server"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", features = ["runtime-tokio-rustls", "postgres", "uuid", "json", "chrono"] }
uuid = { version = "1", features = ["v4", "serde"] }
tracing = "0.1"
tracing-subscriber = "0.3"
```

- [x] **Step 2: Implement health endpoints**

Routes:

```text
GET /healthz
GET /readyz
GET /version
```

### Task 9.2: Implement Backend Sync APIs

**Files:**
- Create: `sync_server/src/auth/`
- Create: `sync_server/src/devices/`
- Create: `sync_server/src/sync/`
- Create: `sync_server/src/assets/`

- [x] **Step 1: Implement auth/device APIs**

Routes:

```text
POST /v1/auth/register
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/devices/register
POST /v1/devices/{device_id}/revoke
```

- [x] **Step 2: Implement sync APIs**

Routes:

```text
POST /v1/sync/bootstrap
POST /v1/sync/push
GET /v1/sync/pull?since=<seq>&limit=<n>&collections=<csv>
POST /v1/sync/ack
GET /v1/sync/conflicts
POST /v1/sync/conflicts/{id}/resolve
```

- [x] **Step 3: Implement idempotency**

Unique key:

```text
user_id + device_id + op_id
```

Duplicate accepted op returns the original `seq` and `serverRev`.

All-conflict pushes are also idempotent and cursor-safe:

```text
accepted = 0
conflicts contains the rejected objects
seq and serverRev point to the current observed server object revision, not 0 or a temporary revision
retrying the same opId returns the same conflict response
```

The backend rejects unsupported collection names before writing sync objects:

```text
collection must be one of sync_collections()
invalid objects or tombstones return HTTP 400
unknown collections are covered by smoke-local.ps1
```

### Task 9.3: Add Desktop Sync Server Provider

**Files:**
- Modify: `desktop/src/main/sync/providers/sync_server_provider.ts`
- Modify: `desktop/src/main/sync/sync_service.ts`
- Modify: `desktop/src/windows/main/pages/Settings/components/SyncProviderSettings.vue`

- [x] **Step 1: Implement provider**

`sync_server_provider.ts` uses:

```text
Authorization: Bearer <accessToken>
X-GuYanTools-Device-Token: <deviceToken>
```

Access token, refresh token, and device token are main-process-only secrets:

```text
loginSyncServer obtains tokens from the backend
provider_config_store writes tokens through secret_store.ts
SyncProviderConfig returned to renderer exposes only hasAccessToken / hasRefreshToken / hasDeviceToken
Settings.vue does not show or accept manual token fields
```

Self-hosted backend URLs preserve the configured base path:

```text
https://sync.example.com/ -> https://sync.example.com/v1/...
https://example.com/guyantools-sync/ -> https://example.com/guyantools-sync/v1/...
login/register/device binding/refresh/assets use the same URL builder as push/pull
```

- [x] **Step 2: Reuse mapper and conflict logic**

No domain mapper should know whether the provider is WebDAV or sync-server.

## Phase 10: Verification And Release Gates

### Task 10.1: Full Desktop Verification

Run:

```bash
pnpm --dir desktop run verify:sync-center
pnpm --dir desktop run verify:sync-webdav
pnpm --dir desktop run verify:sync-mappers
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml sync
git diff --check
```

Expected:

```text
All commands exit 0.
```

### Task 10.2: Manual End-To-End Checks

Use two separate Electron user data directories.

- [ ] **Scenario 1: First WebDAV sync**

```text
Device A: configure Jianguoyun WebDAV
Device A: click sync now
Remote: contains devices/<deviceA>/profiles
Device B: configure same WebDAV
Device B: sees Device A profile
Device B: pulls and applies Device A profile
```

- [ ] **Scenario 2: Profile choice**

```text
Device A and Device B each upload one profile
Both profiles appear in Sync Center
Applying B profile on A changes app config
Setting B profile as default survives restart
```

- [ ] **Scenario 3: AppConfig conflict**

```text
Device A changes theme offline
Device B changes theme offline
Both sync
Conflict appears
Use local resolves and uploads chosen value
```

- [ ] **Scenario 4: Knowledge sync**

```text
Device A creates library "Research" and page "Note"
Device B pulls library and page
Device B creates another local library with same name but different ID
Sync keeps both libraries
```

- [ ] **Scenario 5: AI sync**

```text
Device A creates assistant and provider metadata
Device B pulls assistant/provider metadata
Provider has no API key on B
Assistant is marked as needs configuration
No API key appears in remote JSON
```

## Commit Slicing

Recommended commits:

1. `docs(sync): plan application-wide sync center`
2. `feat(sync): add sync metadata tables and service`
3. `feat(sync): expose sync center IPC and renderer store`
4. `feat(sync): add app config profile synchronization`
5. `feat(sync): add WebDAV provider with Jianguoyun preset`
6. `feat(sync): add sync center settings UI`
7. `feat(sync): add startup and interval sync scheduler`
8. `feat(sync): add knowledge-base synchronization`
9. `feat(sync): add AI metadata synchronization`
10. `feat(sync): scaffold self-hosted sync backend`

## Self-Review

Spec coverage:

- The plan covers local profile plus multiple remote profiles, unique profile IDs, owner device IDs, profile selection, active/default profile behavior, first sync upload, remote profile pull, startup sync, interval sync, pull-before-push conflict handling, knowledge sync by ID and name, and AI sync.
- The plan separates WebDAV and self-hosted backend implementation while sharing local metadata and mapper layers.
- The plan expands the earlier clipboard-only discussion into application-wide config, knowledge, AI, assets, secrets, conflicts, and verification.

Placeholder wording scan:

- Migration number uses `0XX` only where the next number must be selected from the current repository state during implementation.
- Tasks specify concrete behavior and commands rather than unresolved placeholder wording.

Type consistency:

- `SyncProvider`, `SyncObjectEnvelope`, `SyncProfileSummary`, `SyncConflictSummary`, and `SyncApi` are introduced before later tasks use them.
- Collection names are consistent across contracts, mappers, and verification.
