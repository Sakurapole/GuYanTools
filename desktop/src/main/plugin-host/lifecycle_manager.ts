import fs from 'fs-extra';
import path from 'path';
import type { InstalledPluginRecord, MarketplacePluginSummary, PluginInstallProgress, PluginPermission } from '@/contracts/plugin_host';
import PluginManager from '../../core/plugin_core/plugin_manager';
import { PluginManifestResolver } from './manifest_resolver';
import { PluginPermissionManager } from './permission_manager';
import { PluginRegistry } from './plugin_registry';
import { GitPluginInstaller } from './git_installer';
import { PluginPaths } from './plugin_paths';

function nowIso() {
  return new Date().toISOString();
}

export type PluginInstallProgressReporter = (progress: PluginInstallProgress) => void;

export interface GitPluginInstallInput {
  url: string;
  ref: string;
  refType: 'branch' | 'tag' | 'commit';
  expected?: Pick<MarketplacePluginSummary, 'id' | 'version' | 'resolvedCommit' | 'permissions' | 'capabilities'>;
  marketplaceId?: string;
  approvedPermissions?: PluginPermission[];
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function validateMarketplaceSummary(
  manifest: InstalledPluginRecord['manifest'],
  resolvedCommit: string,
  expected?: Pick<MarketplacePluginSummary, 'id' | 'version' | 'resolvedCommit' | 'permissions' | 'capabilities'>,
) {
  if (expected && (expected.id !== manifest.id || expected.version !== manifest.version || expected.resolvedCommit !== resolvedCommit)) {
    throw new Error('PLUGIN_CATALOG_MISMATCH: catalog summary does not match plugin manifest or commit');
  }
  if (expected?.permissions !== undefined && stableSerialize(expected.permissions) !== stableSerialize(manifest.permissions)) {
    throw new Error('PLUGIN_CATALOG_MISMATCH: catalog permission summary does not match plugin manifest');
  }
  if (expected?.capabilities !== undefined && stableSerialize(expected.capabilities) !== stableSerialize(manifest.capabilities)) {
    throw new Error('PLUGIN_CATALOG_MISMATCH: catalog capability summary does not match plugin manifest');
  }
}

export class PluginLifecycleManager {
  constructor(
    private readonly registry: PluginRegistry,
    private readonly manifestResolver: PluginManifestResolver,
    private readonly permissionManager: PluginPermissionManager,
    private readonly pluginManager: PluginManager,
    private readonly pluginBaseDir: string,
    private readonly pluginPaths = new PluginPaths(path.dirname(pluginBaseDir)),
    private readonly gitInstaller = new GitPluginInstaller(),
  ) {}

  async installFromPackage(packageName: string): Promise<InstalledPluginRecord> {
    await this.pluginManager.install([packageName], { isDev: false });

    const packageDir = path.join(this.pluginBaseDir, 'node_modules', packageName);
    const { manifest, resolvedEntryPaths } = await this.manifestResolver.resolveFromDirectory(packageDir);
    this.permissionManager.validateManifest(manifest);
    this.permissionManager.validateCompatibility(manifest);

    const record: InstalledPluginRecord = {
      manifest,
      enabled: false,
      status: 'resolved',
      installSource: { type: 'npm', value: packageName },
      resolvedEntryPaths,
      approvedPermissions: manifest.permissions,
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

    const { manifest, resolvedEntryPaths } = await this.manifestResolver.resolveFromPath(normalizedPath);
    this.permissionManager.validateManifest(manifest);
    this.permissionManager.validateCompatibility(manifest);

    const record: InstalledPluginRecord = {
      manifest,
      enabled: false,
      status: 'resolved',
      installSource: { type: 'local', value: normalizedPath },
      resolvedEntryPaths,
      approvedPermissions: manifest.permissions,
      localPath: normalizedPath,
      installedAt: nowIso(),
      updatedAt: nowIso(),
    };

    return this.registry.upsert(record);
  }

  async installFromGit(
    input: GitPluginInstallInput,
    reportProgress?: PluginInstallProgressReporter,
  ): Promise<InstalledPluginRecord> {
    const tempDir = await this.pluginPaths.createTemp('guyantools-plugin-git-');
    try {
      reportProgress?.({ phase: 'cloning', progress: 0.2 });
      const result = await this.gitInstaller.install({ url: input.url, ref: input.ref, refType: input.refType, destination: tempDir });
      reportProgress?.({ phase: 'validating', progress: 0.5 });
      const { manifest } = await this.manifestResolver.resolveFromDirectory(tempDir);
      this.permissionManager.validateManifest(manifest);
      this.permissionManager.validateCompatibility(manifest);
      validateMarketplaceSummary(manifest, result.resolvedCommit, input.expected);
      const approvedPermissions = input.approvedPermissions ?? manifest.permissions;
      this.permissionManager.validateApprovedPermissions(manifest, approvedPermissions);
      const versionPath = this.pluginPaths.packageVersion(manifest.id, result.resolvedCommit);
      await fs.ensureDir(path.dirname(versionPath));
      if (!(await fs.pathExists(versionPath))) {
        await fs.copy(tempDir, versionPath, { dereference: true });
      }
      reportProgress?.({ phase: 'activating', progress: 0.75, pluginId: manifest.id });
      const activated = await this.pluginPaths.activate(manifest.id, versionPath);
      const activatedManifest = await this.manifestResolver.resolveFromDirectory(activated.destination);
      const timestamp = nowIso();
      reportProgress?.({ phase: 'registering', progress: 0.9, pluginId: manifest.id });
      const record = await this.registry.upsert({
        manifest: activatedManifest.manifest,
        enabled: false,
        status: 'resolved',
        installSource: input.marketplaceId
          ? { type: 'marketplace', marketplaceId: input.marketplaceId, pluginId: manifest.id, url: input.url, ref: input.ref, refType: input.refType, resolvedCommit: result.resolvedCommit }
          : { type: 'git', url: input.url, ref: input.ref, refType: input.refType, resolvedCommit: result.resolvedCommit },
        resolvedEntryPaths: activatedManifest.resolvedEntryPaths,
        approvedPermissions,
        packageSha256: result.packageSha256,
        installedAt: timestamp,
        updatedAt: timestamp,
      });
      reportProgress?.({ phase: 'completed', progress: 1, pluginId: manifest.id });
      return record;
    } finally {
      await fs.remove(tempDir);
    }
  }

  async update(pluginId: string, reportProgress?: PluginInstallProgressReporter) {
    const current = this.registry.get(pluginId);
    if (!current || current.installSource.type !== 'git' || !current.installSource.url || !current.installSource.ref || !current.installSource.refType) {
      throw new Error(`Plugin ${pluginId} is not a Git installation`);
    }
    return this.installFromGit({ url: current.installSource.url, ref: current.installSource.ref, refType: current.installSource.refType }, reportProgress);
  }

  async rollback(pluginId: string) {
    const current = this.registry.get(pluginId);
    if (!current) throw new Error(`Plugin ${pluginId} is not registered`);
    const previousPath = `${this.pluginPaths.currentPath(pluginId)}.previous`;
    if (!(await fs.pathExists(previousPath))) throw new Error(`Plugin ${pluginId} has no previous version`);
    const activated = await this.pluginPaths.activate(pluginId, previousPath);
    const resolved = await this.manifestResolver.resolveFromDirectory(activated.destination);
    return this.registry.upsert({ ...current, manifest: resolved.manifest, resolvedEntryPaths: resolved.resolvedEntryPaths, status: 'disabled', enabled: false });
  }

  async uninstall(pluginId: string) {
    await this.disable(pluginId);
    await this.pluginPaths.remove(pluginId);
    await this.registry.remove(pluginId);
  }

  async enable(pluginId: string) {
    const current = this.registry.get(pluginId);
    if (!current) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }

    this.permissionManager.validateManifest(current.manifest);
    this.permissionManager.validateCompatibility(current.manifest);
    this.permissionManager.validateApprovedPermissions(current.manifest, current.approvedPermissions);
    return this.registry.updateStatus(pluginId, 'enabled', true, undefined);
  }

  async disable(pluginId: string) {
    return this.registry.updateStatus(pluginId, 'disabled', false, undefined);
  }
}
