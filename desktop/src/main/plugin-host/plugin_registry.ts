import fs from 'fs-extra';
import { dbManager } from '../../core/database';
import type {
  InstalledPluginRecord,
  PluginLifecycleState,
  PluginManifest,
} from '@/contracts/plugin_host';

type LegacyPluginInfo = {
  type?: 'ui' | 'system';
  name?: string;
  pluginName?: string;
  description?: string;
  main?: string;
  version?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function toCompatibleManifest(legacy: LegacyPluginInfo): PluginManifest | null {
  if (!legacy.name || !legacy.main) {
    return null;
  }

  return {
    id: legacy.name,
    name: legacy.name,
    version: legacy.version ?? '0.0.0',
    displayName: legacy.pluginName ?? legacy.name,
    description: legacy.description ?? '',
    pluginApiVersion: '1.0.0',
    hostVersionRange: '>=1.0.0',
    trustLevel: 'sandboxed',
    runtime: legacy.type === 'system' ? 'worker' : 'ui',
    entry: legacy.main,
    permissions: ['workspace.read', 'storage.self'],
    contributes: {},
  };
}

function isInstalledPluginRecord(value: unknown): value is InstalledPluginRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as InstalledPluginRecord;
  return Boolean(record.manifest?.id && record.manifest?.entry && record.status);
}

/** 将 InstalledPluginRecord 序列化为 JSON 字符串供 NAPI 使用 */
function serializeRecord(record: InstalledPluginRecord): string {
  return JSON.stringify({
    manifest: record.manifest,
    enabled: record.enabled,
    status: record.status,
    installSource: record.installSource,
    resolvedEntryPath: record.resolvedEntryPath,
    packageName: record.packageName ?? null,
    localPath: record.localPath ?? null,
    error: record.error ?? null,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
  });
}

/** 将 NAPI 返回的 JSON 字符串反序列化为 InstalledPluginRecord */
function deserializeRecord(json: string): InstalledPluginRecord | null {
  try {
    const parsed = JSON.parse(json);
    if (!isInstalledPluginRecord(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export class PluginRegistry {
  /** 内存缓存：保持与 SQLite 同步 */
  private records = new Map<string, InstalledPluginRecord>();

  constructor(
    /** 仅用于旧版 JSON 注册表的迁移 */
    private readonly legacyRegistryFile: string,
  ) {}

  async initialize() {
    const db = dbManager.getDatabase();

    // 1. 从 SQLite 加载现有记录
    const rows: string[] = await db.listInstalledPlugins();
    this.records.clear();
    for (const json of rows) {
      const record = deserializeRecord(json);
      if (record) {
        this.records.set(record.manifest.id, record);
      }
    }

    // 2. 如果 SQLite 里没有记录，则尝试从旧 JSON 文件迁移
    if (this.records.size === 0 && await fs.pathExists(this.legacyRegistryFile)) {
      console.log('[PluginRegistry] 检测到旧版 JSON 注册表，正在迁移到 SQLite...');
      await this.migrateLegacyFile();
    }
  }

  /** 将旧 JSON 文件里的记录迁入 SQLite，然后重命名旧文件作为备份 */
  private async migrateLegacyFile() {
    try {
      const payload = await fs.readJSON(this.legacyRegistryFile);
      if (!Array.isArray(payload)) {
        return;
      }

      const timestamp = nowIso();
      for (const entry of payload) {
        let record: InstalledPluginRecord | null = null;
        if (isInstalledPluginRecord(entry)) {
          record = entry;
        } else {
          const manifest = toCompatibleManifest(entry as LegacyPluginInfo);
          if (manifest) {
            record = {
              manifest,
              enabled: false,
              status: 'discovered',
              installSource: { type: 'local', value: manifest.name },
              resolvedEntryPath: manifest.entry,
              installedAt: timestamp,
              updatedAt: timestamp,
            };
          }
        }

        if (record) {
          await this.persistRecord(record);
          this.records.set(record.manifest.id, record);
        }
      }

      // 备份旧文件
      const backupPath = this.legacyRegistryFile + '.bak';
      await fs.rename(this.legacyRegistryFile, backupPath);
      console.log(`[PluginRegistry] 迁移完成，旧文件已备份至 ${backupPath}`);
    } catch (err) {
      console.error('[PluginRegistry] 迁移旧版注册表失败:', err);
    }
  }

  private async persistRecord(record: InstalledPluginRecord) {
    const db = dbManager.getDatabase();
    await db.upsertPlugin(serializeRecord(record));
  }

  list() {
    return Array.from(this.records.values()).sort((a, b) =>
      a.manifest.displayName.localeCompare(b.manifest.displayName),
    );
  }

  get(pluginId: string) {
    return this.records.get(pluginId);
  }

  async upsert(record: InstalledPluginRecord) {
    const next: InstalledPluginRecord = { ...record, updatedAt: nowIso() };
    this.records.set(next.manifest.id, next);
    await this.persistRecord(next);
    return next;
  }

  async updateStatus(
    pluginId: string,
    status: PluginLifecycleState,
    enabled?: boolean,
    error?: string,
  ) {
    const current = this.records.get(pluginId);
    if (!current) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }

    const next: InstalledPluginRecord = {
      ...current,
      status,
      enabled: typeof enabled === 'boolean' ? enabled : current.enabled,
      error,
      updatedAt: nowIso(),
    };

    this.records.set(pluginId, next);
    await this.persistRecord(next);
    return next;
  }

  async remove(pluginId: string) {
    this.records.delete(pluginId);
    const db = dbManager.getDatabase();
    await db.removePlugin(pluginId);
  }
}
