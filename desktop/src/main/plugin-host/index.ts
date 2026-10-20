import path from 'path';
import fs from 'fs-extra';
import { app, BrowserWindow, dialog, webContents } from 'electron';
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
import { UtilityWorkerHost } from './utility_worker_host';
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
import { assertPluginDependencies, orderPluginActivations } from './dependency_resolver';
import { verifyCatalogSignature } from './plugin_signature';
import { PluginBackgroundTaskScheduler } from './background_task_scheduler';
import { isLegacyBuiltinModelSource, ModelRuntimeService } from './services/model_runtime_service';
import type { JobRecord } from '@/contracts/plugin_media';

const REGISTRY_FILE = path.join(PLUGIN_INSTALL_DIR, 'guyantools-plugin-registry.json');

export function isBundledModelPluginRecord(
  record: InstalledPluginRecord | undefined,
  bundledRoot: string
): boolean {
  return Boolean(
    record?.manifest.id === 'guyantools.image-enhancement' &&
      isLegacyBuiltinModelSource(record, bundledRoot)
  );
}

export class PluginHost {
  private readonly pluginManager = new PluginManager({ baseDir: PLUGIN_INSTALL_DIR });
  private readonly registry = new PluginRegistry(REGISTRY_FILE);
  private readonly hostServices = new HostServiceRegistry(path.join(PLUGIN_INSTALL_DIR, 'data'));
  private readonly utilityWorkers = new UtilityWorkerHost(this.hostServices, () =>
    this.getJobService()
  );
  private readonly manifestResolver = new PluginManifestResolver();
  private readonly permissionManager = new PluginPermissionManager();
  private readonly contributionAssembler = new PluginContributionAssembler();
  private readonly devSessions = new PluginDevSessionManager();
  private readonly auditStore = new PluginAuditStore();
  private readonly crashPolicy = new PluginCrashPolicy();
  private readonly backgroundTasks = new PluginBackgroundTaskScheduler(
    (pluginId, commandId) => this.hostServices.commands.execute(pluginId, commandId),
    (pluginId, commandId, error) =>
      this.hostServices.observability.error(pluginId, `Background task failed: ${commandId}`, error)
  );
  private jobService: JobService | null = null;
  private readonly modelRuntime = new ModelRuntimeService(
    path.join(PLUGIN_INSTALL_DIR, 'model-runtime'),
    (pluginId) => this.registry.get(pluginId),
    () => this.getJobService(),
    async (kind) => {
      const result = await dialog.showOpenDialog({
        title:
          kind === 'input' ? '选择输入图片' : kind === 'weights' ? '选择模型权重' : '选择输出目录',
        properties: kind === 'output' ? ['openDirectory', 'createDirectory'] : ['openFile'],
        ...(kind === 'input'
          ? { filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] }
          : {}),
        ...(kind === 'weights' ? { filters: [{ name: 'PyTorch 权重', extensions: ['pth'] }] } : {}),
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    async () => {
      const result = await dialog.showOpenDialog({ title: '导入已有 .venv / Conda / uv 环境（只读）', properties: ['openDirectory'] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    }
  );
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
      void this.handleUnexpectedWorkerExit(pluginId);
    },
    this.utilityWorkers
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
  private readonly contributionListeners = new Set<() => void>();

  onContributionsChanged(listener: () => void) {
    this.contributionListeners.add(listener);
    return () => this.contributionListeners.delete(listener);
  }

  private notifyContributionsChanged() {
    for (const listener of this.contributionListeners) listener();
    this.mainWindow?.webContents.send('plugin-host:contributions-changed');
  }

  async dispose() {
    this.backgroundTasks.dispose();
    for (const record of this.registry.list())
      await this.modelRuntime.disposePlugin(record.manifest.id);
    await this.runtimeRouter.stopAll();
    this.devChannel.stop();
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    await this.registry.initialize();
    await this.registerBuiltinModelPlugin();
    this.jobService = this.getJobService();
    for (const record of this.registry.list()) {
      await this.jobService.recoverRunning(record.manifest.id);
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
    await this.restoreEnabledPlugins();
    this.initialized = true;
    await this.devChannel.start();
    appConfigManager.subscribe((config) =>
      this.runtimeRouter.broadcastTheme(toPluginThemeDescriptor(config.appearance.theme))
    );
  }

  private async registerBuiltinModelPlugin() {
    const root = this.getBuiltinModelRoot();
    const { manifest, resolvedEntryPaths } = await this.manifestResolver.resolveFromDirectory(root);
    const legacyRoot = app.isPackaged
      ? path.join(process.resourcesPath, 'model-plugins', 'real-cugan')
      : path.join(app.getAppPath(), 'resources', 'model-plugins', 'real-cugan');
    const legacy = this.registry.get('guyantools.real-cugan');
    const legacyIsBuiltin =
      legacy?.installSource.type === 'builtin' || isLegacyBuiltinModelSource(legacy, legacyRoot);
    const migrated = legacy && legacyIsBuiltin ? { ...legacy, manifest } : undefined;
    const previous = this.registry.get(manifest.id) ?? migrated;
    const previousPointsToBuiltinRoot = isLegacyBuiltinModelSource(previous, root);
    if (previous && previous.installSource.type !== 'builtin' && !previousPointsToBuiltinRoot)
      throw new Error(`MODEL_BUILTIN_ID_CONFLICT: ${manifest.id}`);
    const now = new Date().toISOString();
    await this.registry.upsert({
      manifest,
      resolvedEntryPaths,
      installSource: { type: 'builtin', value: root },
      enabled: previous?.enabled ?? false,
      status: previous?.status ?? 'resolved',
      approvedPermissions:
        previous?.approvedPermissions.filter((permission) =>
          manifest.permissions.includes(permission)
        ) ?? [],
      installedAt: previous?.installedAt ?? now,
      updatedAt: now,
    });
    if (legacy && legacyIsBuiltin && legacy.manifest.id !== manifest.id) {
      await this.registry.remove(legacy.manifest.id);
    }
  }

  private getBuiltinModelRoot() {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'model-plugins', 'image-enhancement')
      : path.join(app.getAppPath(), 'resources', 'model-plugins', 'image-enhancement');
  }

  getJobService() {
    if (!this.jobService) {
      this.jobService = new JobService(dbManager.getDatabase() as any, this.hostServices.quota);
    }
    return this.jobService;
  }

  /** 将 JobService 事件桥接到对应插件 webContents；需在数据库就绪后调用。 */
  private attachJobEventBridge(pluginId: string) {
    const jobService = this.getJobService();
    jobService.offPlugin(pluginId);
    jobService.onEvent(pluginId, (job) => this.broadcastJobEvent(pluginId, job));
  }

  private resetPluginRuntimeRegistrations(pluginId: string) {
    this.hostServices.resetPluginQuota(pluginId);
  }

  private async cleanupPluginRuntime(pluginId: string) {
    this.backgroundTasks.unregister(pluginId);
    await this.modelRuntime.disposePlugin(pluginId);
    await this.hostServices.android.stopSessionsForOwner(pluginId);
    await this.runtimeRouter.stopWorker(pluginId).catch((): void => undefined);
    if (this.mainWindow) {
      await this.runtimeRouter.unmountUiPage(this.mainWindow, pluginId);
    }
    this.resetPluginRuntimeRegistrations(pluginId);
    this.jobService?.offPlugin(pluginId);
  }

  private async handleUnexpectedWorkerExit(pluginId: string) {
    const record = this.registry.get(pluginId);
    await this.cleanupPluginRuntime(pluginId);
    if (record?.enabled && record.status === 'enabled') {
      const failure = this.crashPolicy.recordStartFailure(
        pluginId,
        new Error('PLUGIN_RUNTIME_EXITED')
      );
      await this.registry.updateStatus(pluginId, 'errored', false, failure.message);
      await this.registry.updateStartFailures(
        pluginId,
        failure.consecutiveFailures,
        failure.message
      );
    }
  }

  private async activateRuntime(record: InstalledPluginRecord) {
    const pluginId = record.manifest.id;
    assertPluginDependencies(record, this.hostServices.capabilities);
    this.hostServices.capabilities.register(pluginId, record.manifest.capabilities ?? []);
    for (const command of record.manifest.contributes.commands ?? []) {
      this.hostServices.commandRouter.register(pluginId, command.id, (payload) =>
        this.runtimeRouter.invokeCommand(pluginId, command.id, payload)
      );
    }
    this.attachJobEventBridge(pluginId);
    await this.runtimeRouter.startWorker(record);
    this.backgroundTasks.register(
      pluginId,
      record.manifest.contributes,
      record.approvedPermissions
    );
  }

  private async restoreEnabledPlugins() {
    const enabled = this.registry
      .list()
      .filter((record) => record.enabled && record.status === 'enabled');
    let ordered = enabled;
    try {
      ordered = orderPluginActivations(enabled);
    } catch (error) {
      this.hostServices.observability.error('Plugin activation order failed', error);
    }
    const pending = new Map(ordered.map((record) => [record.manifest.id, record]));
    let progressed = true;
    while (pending.size > 0 && progressed) {
      progressed = false;
      for (const [pluginId, record] of pending) {
        try {
          assertPluginDependencies(record, this.hostServices.capabilities);
        } catch {
          continue;
        }
        pending.delete(pluginId);
        progressed = true;
        try {
          this.permissionManager.validateManifest(record.manifest);
          this.permissionManager.validateCompatibility(record.manifest);
          this.permissionManager.validateApprovedPermissions(
            record.manifest,
            record.approvedPermissions
          );
          await this.activateRuntime(record);
          this.crashPolicy.recordStartSuccess(pluginId);
          await this.registry.updateStartFailures(pluginId, 0);
        } catch (error) {
          await this.cleanupPluginRuntime(pluginId);
          await this.registry.updateStatus(pluginId, 'errored', false, String(error));
        }
      }
    }
    for (const [pluginId] of pending) {
      await this.registry.updateStatus(
        pluginId,
        'errored',
        false,
        'PLUGIN_DEPENDENCY_MISSING_OR_CYCLE'
      );
    }
    this.notifyContributionsChanged();
  }

  getAuditStore() {
    return this.auditStore;
  }

  getCapabilityRouter() {
    return this.hostServices.capabilities;
  }

  async invokePluginCapability(
    requesterPluginId: string,
    input: { capabilityId: string; operation: string; payload?: unknown }
  ) {
    const candidate = this.hostServices.capabilities
      .list()
      .find(
        (item) =>
          item.qualifiedId === input.capabilityId ||
          (item.pluginId === requesterPluginId && item.id === input.capabilityId)
      );
    if (!candidate) throw new Error(`PLUGIN_CAPABILITY_NOT_FOUND: ${input.capabilityId}`);
    if (candidate.pluginId !== requesterPluginId) {
      const requester = this.registry.get(requesterPluginId);
      const declared = requester?.manifest.dependencies?.some(
        (dependency) =>
          dependency.capability === candidate.qualifiedId || dependency.capability === candidate.id
      );
      if (!declared) throw new Error('PLUGIN_CAPABILITY_DEPENDENCY_NOT_DECLARED');
    }
    return this.hostServices.capabilities.invoke(candidate.pluginId, {
      ...input,
      capabilityId: candidate.qualifiedId,
    });
  }

  getCommandRouter() {
    return this.hostServices.commandRouter;
  }

  async executePluginCommand(pluginId: string, commandId: string, payload?: unknown) {
    return this.hostServices.commands.executeHost(pluginId, commandId, payload);
  }

  registerPluginCommandRuntime(runtimeId: number, commandId: string) {
    const context = this.runtimeRouter.getRuntimeContext(runtimeId);
    const record = context && this.registry.get(context.pluginId);
    if (!record?.manifest.contributes.commands?.some((command) => command.id === commandId)) {
      throw new Error(`PLUGIN_COMMAND_NOT_DECLARED: ${commandId}`);
    }
    this.runtimeRouter.registerCommandRuntime(runtimeId, commandId);
  }

  registerPluginCapabilityRuntime(runtimeId: number, capabilityId: string) {
    const context = this.runtimeRouter.getRuntimeContext(runtimeId);
    const record = context && this.registry.get(context.pluginId);
    if (!record?.manifest.capabilities.some((capability) => capability.id === capabilityId)) {
      throw new Error(`PLUGIN_CAPABILITY_NOT_DECLARED: ${capabilityId}`);
    }
    this.runtimeRouter.registerCapabilityRuntime(runtimeId, capabilityId);
    this.hostServices.capabilities.registerInvokeHandler(context.pluginId, capabilityId, (input) =>
      this.runtimeRouter.invokeCapability(
        context.pluginId,
        capabilityId,
        input.operation,
        input.payload
      )
    );
  }

  resolvePluginCapabilityResult(
    runtimeId: number,
    result: Parameters<PluginRuntimeRouter['resolveCommandResult']>[1]
  ) {
    this.runtimeRouter.resolveCommandResult(runtimeId, result);
  }

  markPluginWorkerReady(runtimeId: number) {
    this.runtimeRouter.markWorkerReady(runtimeId);
  }

  resolvePluginCommandResult(
    runtimeId: number,
    result: Parameters<PluginRuntimeRouter['resolveCommandResult']>[1]
  ) {
    this.runtimeRouter.resolveCommandResult(runtimeId, result);
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
    const record = await this.lifecycleManager.registerLocalPlugin(inputPath, {
      approvedPermissions: approvedPermissions ?? [],
    });
    // The bundled model can be selected through the local-plugin picker during
    // development. Keep its execution trust equivalent to the startup builtin
    // registration, while leaving arbitrary local model plugins untrusted.
    const bundledRoot = this.getBuiltinModelRoot();
    if (isBundledModelPluginRecord(record, bundledRoot)) {
      return this.registry.upsert({
        ...record,
        installSource: { type: 'builtin', value: bundledRoot },
        localPath: undefined,
      });
    }
    return record;
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
    await this.cleanupPluginRuntime(pluginId);
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
      const record = this.registry.get(pluginId);
      if (!record) throw new Error(`Plugin ${pluginId} is not registered`);
      this.permissionManager.validateManifest(record.manifest);
      this.permissionManager.validateCompatibility(record.manifest);
      this.permissionManager.validateApprovedPermissions(
        record.manifest,
        record.approvedPermissions
      );
      await this.activateRuntime(record);
      const enabled = await this.lifecycleManager.enable(pluginId);
      this.notifyContributionsChanged();
      this.crashPolicy.recordStartSuccess(pluginId);
      await this.registry.updateStartFailures(pluginId, 0);
      return this.registry.get(pluginId) ?? enabled;
    } catch (error) {
      const tracker = this.crashPolicy.recordStartFailure(pluginId, error);
      const message = tracker.message;
      await this.cleanupPluginRuntime(pluginId);
      if (tracker.shouldAutoDisable) {
        await this.registry.updateStatus(pluginId, 'errored', false, message);
        await this.registry.updateStartFailures(pluginId, tracker.consecutiveFailures, message);
        throw new Error(`PLUGIN_AUTO_DISABLED: ${message}`);
      }
      await this.registry.updateStatus(pluginId, 'disabled', false, message);
      await this.registry.updateStartFailures(pluginId, tracker.consecutiveFailures, message);
      throw error;
    }
  }

  async disablePlugin(pluginId: string) {
    await this.cleanupPluginRuntime(pluginId);
    this.crashPolicy.reset(pluginId);
    await this.registry.updateStartFailures(pluginId, 0);
    const result = await this.lifecycleManager.disable(pluginId);
    this.notifyContributionsChanged();
    return result;
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
    this.runtimeRouter.broadcastJobEvent(pluginId, job);
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
  openDevTools(pluginId: string, pageId: string) {
    const record = this.registry.get(pluginId);
    if (!this.mainWindow || !record?.enabled || record.manifest.ui?.showDevToolsButton !== true) throw new Error('PLUGIN_DEVTOOLS_DISABLED');
    this.runtimeRouter.openMountedDevTools(this.mainWindow, pluginId, pageId);
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

  pickLocalPluginPath() {
    return this.hostServices.system.pickLocalPluginPath();
  }

  getModelRuntimeService() {
    return this.modelRuntime;
  }
}

export const pluginHost = new PluginHost();
