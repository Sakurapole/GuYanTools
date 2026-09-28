import path from 'path';
import fs from 'fs-extra';
import { BrowserWindow, webContents } from 'electron';
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
  PluginContributionsSummary,
  PluginAuditEvent,
  PluginPermissionCopy,
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
import { PluginDevSessionManager } from './dev_session';
import { LocalPluginDevChannel } from './dev_channel';
import { toPluginThemeDescriptor } from './theme_bridge';
import { PLUGIN_PERMISSION_META, getDefaultApprovedSuggestions } from './permission_matrix';
import { PluginAuditStore } from './audit_store';
import { PluginCrashPolicy } from './crash_policy';
import { assertPluginDependencies } from './dependency_resolver';
import { verifyCatalogSignature } from './plugin_signature';
import type { JobRecord } from '@/contracts/plugin_media';

const REGISTRY_FILE = path.join(PLUGIN_INSTALL_DIR, 'guyantools-plugin-registry.json');

export class PluginHost {
  private readonly pluginManager = new PluginManager({ baseDir: PLUGIN_INSTALL_DIR });
  private readonly registry = new PluginRegistry(REGISTRY_FILE);
  private readonly hostServices = new HostServiceRegistry(path.join(PLUGIN_INSTALL_DIR, 'data'));
  private readonly manifestResolver = new PluginManifestResolver();
  private readonly permissionManager = new PluginPermissionManager();
  private readonly contributionAssembler = new PluginContributionAssembler();
  private readonly devSessions = new PluginDevSessionManager();
  private readonly auditStore = new PluginAuditStore();
  private readonly crashPolicy = new PluginCrashPolicy();
  private jobService: JobService | null = null;
  private readonly lifecycleManager = new PluginLifecycleManager(
    this.registry,
    this.manifestResolver,
    this.permissionManager,
    this.pluginManager,
    PLUGIN_INSTALL_DIR,
    undefined,
    undefined,
    () =>
      (process.env.GUYANTOOLS_PLUGIN_SIGNATURE_POLICY as 'enforce' | 'warn' | 'off' | undefined) ??
      'warn'
  );
  private readonly runtimeRouter = new PluginRuntimeRouter(
    this.hostServices,
    resolvePluginPreloadPath(path.join(__dirname, '..', '..', '.vite', 'build')),
    () => appConfigManager.getCachedConfig().plugins.unloadAfterMinutes,
    this.devSessions,
    (pluginId) => {
      void this.hostServices.android.stopSessionsForOwner(pluginId);
      this.hostServices.resetPluginQuota(pluginId);
      this.jobService?.offPlugin(pluginId);
    }
  );
  private readonly devChannel = new LocalPluginDevChannel((session) => {
    this.runtimeRouter.connectDevSession(session);
  });
  private readonly marketplaceResolver = new MarketplaceResolver(async (url, ref) => {
    const source = new URL(url);
    const githubMatch =
      source.hostname === 'github.com' && source.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
    const target = githubMatch
      ? `https://raw.githubusercontent.com/${githubMatch[1]}/${githubMatch[2].replace(/\.git$/, '')}/${encodeURIComponent(ref)}/catalog.json`
      : url;
    const response = await fetch(target);
    if (!response.ok) throw new Error(`PLUGIN_MARKETPLACE_FETCH_FAILED: ${response.status}`);
    const raw = await response.text();
    try {
      const parsed = JSON.parse(raw) as {
        signature?: {
          algorithm: 'ed25519';
          publicKey: string;
          signature: string;
          signedAt: string;
        };
      } & Record<string, unknown>;
      if (parsed?.signature) {
        const { signature, ...body } = parsed;
        verifyCatalogSignature(JSON.stringify(body), signature);
      }
    } catch (error) {
      if (
        String(error).includes('PLUGIN_CATALOG_SIGNATURE_INVALID') ||
        String(error).includes('PLUGIN_SIGNATURE_')
      ) {
        throw error;
      }
    }
    return raw;
  });
  private mainWindow: BrowserWindow | null = null;
  private initialized = false;

  async initialize() {
    if (this.initialized) {
      return;
    }

    await this.registry.initialize();
    this.jobService = this.getJobService();
    for (const record of this.registry.list()) {
      await this.jobService.recoverRunning(record.manifest.id);
      this.attachJobEventBridge(record.manifest.id);
    }
    if (typeof (dbManager.getDatabase() as any).listPluginMarketplaces === 'function') {
      const cached = await (dbManager.getDatabase() as any).listPluginMarketplaces();
      const validCached = cached.flatMap((record: any) => {
        try {
          return [
            {
              marketplaceId: record.id,
              url: record.url,
              ref: record.refName ?? record.ref_name,
              catalog: JSON.parse(record.catalogJson ?? record.catalog_json),
              catalogSha256: record.catalogSha256 ?? record.catalog_sha256,
              refreshedAt: record.refreshedAt ?? record.refreshed_at,
              fromCache: true,
            },
          ];
        } catch {
          return [];
        }
      });
      this.marketplaceResolver.hydrate(validCached);
    }
    this.initialized = true;
    await this.devChannel.start();
    appConfigManager.subscribe((config) =>
      this.runtimeRouter.broadcastTheme(toPluginThemeDescriptor(config.appearance.theme))
    );
  }

  getJobService() {
    if (!this.jobService) {
      this.jobService = new JobService(dbManager.getDatabase() as any);
    }
    return this.jobService;
  }

  /** 将 JobService 事件桥接到对应插件 webContents；需在数据库就绪后调用。 */
  private attachJobEventBridge(pluginId: string) {
    const jobService = this.getJobService();
    jobService.offPlugin(pluginId);
    jobService.onEvent(pluginId, (job) => this.broadcastJobEvent(pluginId, job));
  }

  getAuditStore() {
    return this.auditStore;
  }

  getCapabilityRouter() {
    return this.hostServices.capabilities;
  }

  getCommandRouter() {
    return this.hostServices.commandRouter;
  }

  getQuotaService() {
    return this.hostServices.quota;
  }

  bindMainWindow(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.hostServices.bindMainWindow(mainWindow);
    if (typeof (mainWindow as unknown as { once?: unknown }).once === 'function') {
      mainWindow.once('closed', () => void this.devChannel.stop());
    }
  }

  getRuntimeContext(webContentsId: number) {
    return this.runtimeRouter.getRuntimeContext(webContentsId);
  }

  connectDevSession(session: import('@/contracts/plugin_host').PluginDevSession) {
    return this.runtimeRouter.connectDevSession(session);
  }
  async connectDevSessionFromFile(rootPath: string) {
    const source = (await fs.readJSON(path.join(rootPath, '.guyantools', 'plugin.dev.json'))) as {
      pluginId: string;
      uiUrl: string;
      workerUrl?: string;
      sessionToken: string;
    };
    const url = new URL(source.uiUrl);
    const session = {
      ...source,
      rootPath: path.resolve(rootPath),
      host: '127.0.0.1' as const,
      port: Number(url.port),
      startedAt: new Date().toISOString(),
    };
    return this.runtimeRouter.connectDevSession(session);
  }
  disconnectDevSession(pluginId: string) {
    this.runtimeRouter.disconnectDevSession(pluginId);
  }
  listDevSessions() {
    return this.runtimeRouter.listDevSessions();
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

  listContributions(): PluginContributionsSummary {
    return this.contributionAssembler.listAll(this.registry.list());
  }

  listAuditEvents(pluginId?: string): PluginAuditEvent[] {
    return this.auditStore.listRecent(pluginId);
  }

  getPermissionCopy(): PluginPermissionCopy[] {
    return PLUGIN_PERMISSION_META.map((meta) => ({
      permission: meta.permission,
      title: meta.title,
      description: meta.description,
      tier: meta.tier,
    }));
  }

  getDefaultApprovedPermissions(declared: PluginPermission[]): PluginPermission[] {
    return getDefaultApprovedSuggestions(declared);
  }

  async listPluginJobs(pluginId: string) {
    return (dbManager.getDatabase() as any).listPluginJobs(pluginId);
  }

  async installPluginFromPackage(packageName: string, approvedPermissions?: PluginPermission[]) {
    return this.lifecycleManager.installFromPackage(packageName, {
      approvedPermissions: approvedPermissions ?? [],
    });
  }

  async registerLocalPlugin(inputPath: string, approvedPermissions?: PluginPermission[]) {
    return this.lifecycleManager.registerLocalPlugin(inputPath, {
      approvedPermissions: approvedPermissions ?? [],
    });
  }

  async approvePermissions(pluginId: string, approvedPermissions: PluginPermission[]) {
    return this.lifecycleManager.approvePermissions(pluginId, approvedPermissions);
  }

  async installFromGit(input: GitPluginInstallInput) {
    try {
      return await this.lifecycleManager.installFromGit(
        {
          ...input,
          approvedPermissions: input.approvedPermissions ?? [],
        },
        (progress) => this.publishInstallProgress(progress)
      );
    } catch (error) {
      this.publishInstallProgress({
        phase: 'failed',
        progress: 1,
        error: error instanceof Error ? error.message : 'Plugin installation failed',
      });
      throw error;
    }
  }

  async installFromMarketplace(
    marketplaceId: string,
    pluginId: string,
    approvedPermissions: PluginPermission[]
  ) {
    this.publishInstallProgress({ phase: 'resolving-marketplace', progress: 0.05, pluginId });
    const entry = this.marketplaceResolver
      .list()
      .find((marketplace) => marketplace.marketplaceId === marketplaceId)
      ?.catalog.plugins.find((plugin) => plugin.id === pluginId);
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

  async updatePlugin(pluginId: string, approvedPermissions?: PluginPermission[]) {
    const current = this.registry.get(pluginId);
    if (!current) throw new Error(`Plugin ${pluginId} is not registered`);
    if (current.installSource.type === 'marketplace') {
      const marketplaceId = current.installSource.marketplaceId;
      if (!marketplaceId) throw new Error(`Plugin ${pluginId} has no marketplace source`);
      return this.installFromMarketplace(
        marketplaceId,
        pluginId,
        approvedPermissions ?? current.approvedPermissions
      );
    }
    try {
      return await this.lifecycleManager.update(
        pluginId,
        (progress) => this.publishInstallProgress(progress),
        approvedPermissions
      );
    } catch (error) {
      this.publishInstallProgress({
        phase: 'failed',
        progress: 1,
        pluginId,
        error: error instanceof Error ? error.message : 'Plugin update failed',
      });
      throw error;
    }
  }

  async rollbackPlugin(pluginId: string) {
    return this.lifecycleManager.rollback(pluginId);
  }

  async uninstallPlugin(pluginId: string) {
    await this.hostServices.android.stopSessionsForOwner(pluginId);
    this.hostServices.resetPluginQuota(pluginId);
    return this.lifecycleManager.uninstall(pluginId);
  }

  listMarketplaces() {
    return this.marketplaceResolver.list();
  }

  refreshMarketplace(input: { id: string; url: string; ref: string }) {
    return this.marketplaceResolver.refresh(input).then(async (record) => {
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
    try {
      const record = await this.lifecycleManager.enable(pluginId);
      // Capability deps are checked against currently registered providers.
      assertPluginDependencies(record, this.hostServices.capabilities);
      this.hostServices.capabilities.register(pluginId, record.manifest.capabilities ?? []);
      this.attachJobEventBridge(pluginId);
      await this.runtimeRouter.startWorker(record);
      this.crashPolicy.recordStartSuccess(pluginId);
      await this.registry.updateStartFailures(pluginId, 0);
      return this.registry.get(pluginId) ?? record;
    } catch (error) {
      const tracker = this.crashPolicy.recordStartFailure(pluginId, error);
      const message = tracker.message;
      if (tracker.shouldAutoDisable) {
        this.hostServices.resetPluginQuota(pluginId);
        await this.runtimeRouter.stopWorker(pluginId).catch(() => undefined as void);
        await this.registry.updateStatus(pluginId, 'errored', false, message);
        await this.registry.updateStartFailures(pluginId, tracker.consecutiveFailures, message);
        throw new Error(`PLUGIN_AUTO_DISABLED: ${message}`);
      }
      await this.registry.updateStartFailures(pluginId, tracker.consecutiveFailures, message);
      throw error;
    }
  }

  async disablePlugin(pluginId: string) {
    await this.hostServices.android.stopSessionsForOwner(pluginId);
    await this.runtimeRouter.stopWorker(pluginId);
    if (this.mainWindow) {
      await this.runtimeRouter.unmountUiPage(this.mainWindow, pluginId);
    }
    this.hostServices.resetPluginQuota(pluginId);
    this.crashPolicy.reset(pluginId);
    await this.registry.updateStartFailures(pluginId, 0);
    return this.lifecycleManager.disable(pluginId);
  }

  getPluginDebugInfo(pluginId: string) {
    const record = this.registry.get(pluginId);
    if (!record) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }
    return {
      record,
      audit: this.auditStore.listRecent(pluginId, 50),
      contributions: {
        pages: this.contributionAssembler.listPages([record]),
        widgets: this.contributionAssembler.listWidgets([record]),
        commands: this.contributionAssembler.listCommands([record]),
        menus: this.contributionAssembler.listMenus([record]),
        shortcuts: this.contributionAssembler.listShortcuts([record]),
        backgroundTasks: this.contributionAssembler.listBackgroundTasks([record]),
      },
      capabilities: this.hostServices.capabilities.list(pluginId),
      consecutiveStartFailures:
        record.consecutiveStartFailures ?? this.crashPolicy.getConsecutiveFailures(pluginId),
    };
  }

  async getPluginSettings(pluginId: string): Promise<Record<string, unknown>> {
    const record = this.registry.get(pluginId);
    if (!record) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }
    const schema = record.manifest.settings ?? {};
    const values: Record<string, unknown> = {};
    for (const [key, definition] of Object.entries(schema)) {
      const stored = await this.hostServices.storage.getPluginState(pluginId, `settings.${key}`);
      values[key] = stored === null || stored === undefined ? definition.default : stored;
    }
    return values;
  }

  async setPluginSetting(pluginId: string, key: string, value: unknown) {
    const record = this.registry.get(pluginId);
    if (!record) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }
    const definition = record.manifest.settings?.[key];
    if (!definition) {
      throw new Error(`PLUGIN_SETTING_UNKNOWN: ${key}`);
    }
    if (definition.type === 'boolean' && typeof value !== 'boolean') {
      throw new Error('PLUGIN_SETTING_INVALID');
    }
    if (definition.type === 'number' && typeof value !== 'number') {
      throw new Error('PLUGIN_SETTING_INVALID');
    }
    if (definition.type === 'string' && typeof value !== 'string') {
      throw new Error('PLUGIN_SETTING_INVALID');
    }
    if (definition.type === 'select') {
      const allowed = (definition.options ?? []).map((option) => option.value);
      if (!allowed.includes(value as string | number)) {
        throw new Error('PLUGIN_SETTING_INVALID');
      }
    }
    await this.hostServices.storage.setPluginState(pluginId, `settings.${key}`, value);
  }

  broadcastJobEvent(pluginId: string, job: JobRecord) {
    for (const target of webContents.getAllWebContents()) {
      const context = this.runtimeRouter.getRuntimeContext(target.id);
      if (!context || context.pluginId !== pluginId || target.isDestroyed()) continue;
      target.send('plugin-runtime:jobs:event', job);
    }
  }

  async mountPage(pluginId: string, pageId: string, bounds: PluginViewportBounds) {
    if (!this.mainWindow) {
      throw new Error('Main window is not bound to plugin host');
    }

    const record = this.registry.get(pluginId);
    if (!record) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }
    if (record.status === 'errored' && (record.consecutiveStartFailures ?? 0) >= 3) {
      throw new Error(`PLUGIN_AUTO_DISABLED: ${record.error ?? 'too many start failures'}`);
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
