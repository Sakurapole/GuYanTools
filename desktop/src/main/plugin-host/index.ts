import path from 'path';
import { BrowserWindow } from 'electron';
import { PLUGIN_INSTALL_DIR } from '../constants/paths';
import PluginManager from '../../core/plugin_core/plugin_manager';
import { appConfigManager } from '../app-config/manager';
import type {
  InstalledPluginRecord,
  PluginHostSummary,
  PluginInstallProgress,
  PluginPermission,
  PluginPageDescriptor,
  PluginViewportBounds,
} from '@/contracts/plugin_host';
import { HostServiceRegistry } from './host_services';
import { PluginContributionAssembler } from './contribution_assembler';
import { PluginLifecycleManager } from './lifecycle_manager';
import type { GitPluginInstallInput } from './lifecycle_manager';
import { PluginManifestResolver } from './manifest_resolver';
import { PluginPermissionManager } from './permission_manager';
import { PluginRegistry } from './plugin_registry';
import { PluginRuntimeRouter } from './runtime_router';
import { MarketplaceResolver } from './marketplace_resolver';
import { dbManager } from '../../core/database';
import { JobService } from './services/job_service';
import { resolvePluginPreloadPath } from './preload_path';

const REGISTRY_FILE = path.join(PLUGIN_INSTALL_DIR, 'guyantools-plugin-registry.json');

export class PluginHost {
  private readonly pluginManager = new PluginManager({ baseDir: PLUGIN_INSTALL_DIR });
  private readonly registry = new PluginRegistry(REGISTRY_FILE);
  private readonly hostServices = new HostServiceRegistry(path.join(PLUGIN_INSTALL_DIR, 'data'));
  private readonly manifestResolver = new PluginManifestResolver();
  private readonly permissionManager = new PluginPermissionManager();
  private readonly contributionAssembler = new PluginContributionAssembler();
  private readonly lifecycleManager = new PluginLifecycleManager(
    this.registry,
    this.manifestResolver,
    this.permissionManager,
    this.pluginManager,
    PLUGIN_INSTALL_DIR,
  );
  private readonly runtimeRouter = new PluginRuntimeRouter(
    this.hostServices,
    resolvePluginPreloadPath(path.join(__dirname, '..', '..', '.vite', 'build')),
    () => appConfigManager.getCachedConfig().plugins.unloadAfterMinutes,
  );
  private readonly marketplaceResolver = new MarketplaceResolver(async (url, ref) => {
    const source = new URL(url);
    const githubMatch = source.hostname === 'github.com' && source.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
    const target = githubMatch
      ? `https://raw.githubusercontent.com/${githubMatch[1]}/${githubMatch[2].replace(/\.git$/, '')}/${encodeURIComponent(ref)}/catalog.json`
      : url;
    const response = await fetch(target);
    if (!response.ok) throw new Error(`PLUGIN_MARKETPLACE_FETCH_FAILED: ${response.status}`);
    return response.text();
  });
  private mainWindow: BrowserWindow | null = null;
  private initialized = false;

  async initialize() {
    if (this.initialized) {
      return;
    }

    await this.registry.initialize();
    const jobService = new JobService(dbManager.getDatabase() as any);
    for (const record of this.registry.list()) {
      await jobService.recoverRunning(record.manifest.id);
    }
    if (typeof (dbManager.getDatabase() as any).listPluginMarketplaces === 'function') {
      const cached = await (dbManager.getDatabase() as any).listPluginMarketplaces();
      const validCached = cached.flatMap((record: any) => {
        try {
          return [{
            marketplaceId: record.id,
            url: record.url,
            ref: record.refName ?? record.ref_name,
            catalog: JSON.parse(record.catalogJson ?? record.catalog_json),
            catalogSha256: record.catalogSha256 ?? record.catalog_sha256,
            refreshedAt: record.refreshedAt ?? record.refreshed_at,
            fromCache: true,
          }];
        } catch {
          return [];
        }
      });
      this.marketplaceResolver.hydrate(validCached);
    }
    this.initialized = true;
  }

  bindMainWindow(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.hostServices.bindMainWindow(mainWindow);
  }

  getRuntimeContext(webContentsId: number) {
    return this.runtimeRouter.getRuntimeContext(webContentsId);
  }

  getHostSummary(): PluginHostSummary {
    return {
      apiVersion: '1.0.0',
      pluginDirectory: PLUGIN_INSTALL_DIR,
      registryFile: REGISTRY_FILE,
      capabilities: this.hostServices.getCapabilitySummary(),
    };
  }

  listPlugins(): InstalledPluginRecord[] {
    return this.registry.list();
  }

  listPages(): PluginPageDescriptor[] {
    return this.contributionAssembler.listPages(this.registry.list());
  }

  async listPluginJobs(pluginId: string) {
    return (dbManager.getDatabase() as any).listPluginJobs(pluginId);
  }

  async installPluginFromPackage(packageName: string) {
    return this.lifecycleManager.installFromPackage(packageName);
  }

  async registerLocalPlugin(inputPath: string) {
    return this.lifecycleManager.registerLocalPlugin(inputPath);
  }

  async installFromGit(input: GitPluginInstallInput) {
    try {
      return await this.lifecycleManager.installFromGit(input, progress => this.publishInstallProgress(progress));
    } catch (error) {
      this.publishInstallProgress({
        phase: 'failed',
        progress: 1,
        error: error instanceof Error ? error.message : 'Plugin installation failed',
      });
      throw error;
    }
  }

  async installFromMarketplace(marketplaceId: string, pluginId: string, approvedPermissions: PluginPermission[]) {
    this.publishInstallProgress({ phase: 'resolving-marketplace', progress: 0.05, pluginId });
    const entry = this.marketplaceResolver.list()
      .find(marketplace => marketplace.marketplaceId === marketplaceId)?.catalog.plugins
      .find(plugin => plugin.id === pluginId);
    if (!entry) {
      const error = new Error(`PLUGIN_MARKETPLACE_ENTRY_NOT_FOUND: ${marketplaceId}/${pluginId}`);
      this.publishInstallProgress({ phase: 'failed', progress: 1, pluginId, error: error.message });
      throw error;
    }
    return this.installFromGit({
      url: entry.repository,
      ref: entry.ref,
      refType: entry.refType,
      expected: entry,
      marketplaceId,
      approvedPermissions,
    });
  }

  private publishInstallProgress(progress: PluginInstallProgress) {
    this.mainWindow?.webContents.send('plugin-host:install-progress', progress);
  }

  async updatePlugin(pluginId: string) {
    const current = this.registry.get(pluginId);
    if (!current) throw new Error(`Plugin ${pluginId} is not registered`);
    if (current.installSource.type === 'marketplace') {
      const marketplaceId = current.installSource.marketplaceId;
      if (!marketplaceId) throw new Error(`Plugin ${pluginId} has no marketplace source`);
      return this.installFromMarketplace(marketplaceId, pluginId, current.approvedPermissions);
    }
    try {
      return await this.lifecycleManager.update(pluginId, progress => this.publishInstallProgress(progress));
    } catch (error) {
      this.publishInstallProgress({ phase: 'failed', progress: 1, pluginId, error: error instanceof Error ? error.message : 'Plugin update failed' });
      throw error;
    }
  }

  async rollbackPlugin(pluginId: string) {
    return this.lifecycleManager.rollback(pluginId);
  }

  async uninstallPlugin(pluginId: string) {
    return this.lifecycleManager.uninstall(pluginId);
  }

  listMarketplaces() {
    return this.marketplaceResolver.list();
  }

  refreshMarketplace(input: { id: string; url: string; ref: string }) {
    return this.marketplaceResolver.refresh(input).then(async record => {
      const db = dbManager.getDatabase() as any;
      if (typeof db.upsertPluginMarketplace === 'function') {
        await db.upsertPluginMarketplace({
          id: record.marketplaceId,
          url: record.url,
          refName: record.ref,
          catalogJson: JSON.stringify(record.catalog),
          catalogSha256: record.catalogSha256,
          enabled: true,
        });
      }
      return record;
    });
  }

  searchMarketplace(query: string) {
    return this.marketplaceResolver.search(query);
  }

  async enablePlugin(pluginId: string) {
    const record = await this.lifecycleManager.enable(pluginId);
    await this.runtimeRouter.startWorker(record);
    return record;
  }

  async disablePlugin(pluginId: string) {
    await this.runtimeRouter.stopWorker(pluginId);
    if (this.mainWindow) {
      await this.runtimeRouter.unmountUiPage(this.mainWindow, pluginId);
    }

    return this.lifecycleManager.disable(pluginId);
  }

  async mountPage(pluginId: string, pageId: string, bounds: PluginViewportBounds) {
    if (!this.mainWindow) {
      throw new Error('Main window is not bound to plugin host');
    }

    const record = this.registry.get(pluginId);
    if (!record) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }

    await this.runtimeRouter.mountUiPage(this.mainWindow, record, pageId, bounds);
  }

  async updateMountedPageBounds(bounds: PluginViewportBounds) {
    if (!this.mainWindow) {
      return;
    }

    await this.runtimeRouter.updateMountedBounds(this.mainWindow, bounds);
  }

  async unmountPage(pluginId?: string) {
    if (!this.mainWindow) {
      return;
    }

    await this.runtimeRouter.unmountUiPage(this.mainWindow, pluginId);
  }

  async getPluginStorageValue(pluginId: string, key: string) {
    return this.hostServices.storage.getPluginState(pluginId, key);
  }

  async setPluginStorageValue(pluginId: string, key: string, value: unknown) {
    await this.hostServices.storage.setPluginState(pluginId, key, value);
  }

  getHostServices() {
    return this.hostServices;
  }
}

export const pluginHost = new PluginHost();
