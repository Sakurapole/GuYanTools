import fs from 'fs-extra';
import path from 'path';
import type { InstalledPluginRecord } from '@/contracts/plugin_host';
import PluginManager from '../../core/plugin_core/plugin_manager';
import { PluginManifestResolver } from './manifest_resolver';
import { PluginPermissionManager } from './permission_manager';
import { PluginRegistry } from './plugin_registry';

function nowIso() {
  return new Date().toISOString();
}

export class PluginLifecycleManager {
  constructor(
    private readonly registry: PluginRegistry,
    private readonly manifestResolver: PluginManifestResolver,
    private readonly permissionManager: PluginPermissionManager,
    private readonly pluginManager: PluginManager,
    private readonly pluginBaseDir: string,
  ) {}

  async installFromPackage(packageName: string): Promise<InstalledPluginRecord> {
    await this.pluginManager.install([packageName], { isDev: false });

    const packageDir = path.join(this.pluginBaseDir, 'node_modules', packageName);
    const { manifest, resolvedEntryPath } = await this.manifestResolver.resolveFromDirectory(packageDir);
    this.permissionManager.validateManifest(manifest);

    const record: InstalledPluginRecord = {
      manifest,
      enabled: false,
      status: 'resolved',
      installSource: { type: 'npm', value: packageName },
      resolvedEntryPath,
      packageName,
      installedAt: nowIso(),
      updatedAt: nowIso(),
    };

    return this.registry.upsert(record);
  }

  async registerLocalPlugin(inputPath: string): Promise<InstalledPluginRecord> {
    const normalizedPath = path.resolve(inputPath);
    if (!await fs.pathExists(normalizedPath)) {
      throw new Error(`Plugin path not found: ${normalizedPath}`);
    }

    const { manifest, resolvedEntryPath } = await this.manifestResolver.resolveFromPath(normalizedPath);
    this.permissionManager.validateManifest(manifest);

    const record: InstalledPluginRecord = {
      manifest,
      enabled: false,
      status: 'resolved',
      installSource: { type: 'local', value: normalizedPath },
      resolvedEntryPath,
      localPath: normalizedPath,
      installedAt: nowIso(),
      updatedAt: nowIso(),
    };

    return this.registry.upsert(record);
  }

  async enable(pluginId: string) {
    const current = this.registry.get(pluginId);
    if (!current) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }

    this.permissionManager.validateManifest(current.manifest);
    return this.registry.updateStatus(pluginId, 'enabled', true, undefined);
  }

  async disable(pluginId: string) {
    return this.registry.updateStatus(pluginId, 'disabled', false, undefined);
  }
}
