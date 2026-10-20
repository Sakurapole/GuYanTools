import { BrowserWindow, ipcMain, webContents } from 'electron';
import { pluginHost } from './index';
import { PluginContextGuard } from './context_guard';
import { toPluginThemeDescriptor } from './theme_bridge';
import { appConfigManager } from '../app-config/manager';
import { androidAdbService, androidScrcpyService } from '../android-tools';
import type { AndroidDeviceEvent, AndroidSessionEvent } from '@/contracts/android-tools';
import type { PluginPermission } from '@/contracts/plugin_host';
import type {
  ModelInferenceInput,
  ModelFileHandle,
  ModelEnvironmentCreateInput,
  ModelPackageChangeInput,
  ModelPackageManager,
} from '@/contracts/plugin_model';
import { toPluginApiErrorPayload, PluginApiError } from './plugin_api_error';

let registered = false;
const guard = new PluginContextGuard();

function getSenderPluginContext(senderId: number) {
  const context = pluginHost.getRuntimeContext(senderId);
  if (!context) {
    throw new PluginApiError('PLUGIN_NOT_FOUND', 'Plugin runtime context not found');
  }

  return context;
}

function broadcastPluginDevices(event: AndroidDeviceEvent) {
  for (const target of webContents.getAllWebContents()) {
    const context = pluginHost.getRuntimeContext(target.id);
    if (!context || !context.permissions.includes('android.devices.read') || target.isDestroyed())
      continue;
    target.send('plugin-runtime:android:devices:changed', event);
  }
}

function broadcastPluginSession(event: AndroidSessionEvent) {
  for (const target of webContents.getAllWebContents()) {
    const context = pluginHost.getRuntimeContext(target.id);
    if (
      !context ||
      context.pluginId !== event.session.ownerPluginId ||
      !context.permissions.includes('android.sessions.read') ||
      target.isDestroyed()
    )
      continue;
    target.send('plugin-runtime:android:sessions:event', event);
  }
}

type RuntimeHandler = (
  event: Electron.IpcMainInvokeEvent,
  ...args: any[]
) => Promise<unknown> | unknown;

const runtimeRoutes: Record<
  string,
  { permission?: PluginPermission | PluginPermission[]; handler: RuntimeHandler }
> = {
  'plugin-runtime:models:list-python': {
    permission: 'models.execute',
    handler: (event) =>
      pluginHost
        .getModelRuntimeService()
        .listPython(getSenderPluginContext(event.sender.id).pluginId),
  },
  'plugin-runtime:models:install-miniforge': {
    permission: 'models.execute',
    handler: (event) =>
      pluginHost
        .getModelRuntimeService()
        .installMiniforge(getSenderPluginContext(event.sender.id).pluginId),
  },
  'plugin-runtime:models:create-environment': {
    permission: 'models.execute',
    handler: (event, baseId: string) =>
      pluginHost
        .getModelRuntimeService()
        .createEnvironment(getSenderPluginContext(event.sender.id).pluginId, baseId),
  },
  'plugin-runtime:models:check-dependencies': {
    permission: 'models.execute',
    handler: (event, device: 'cpu' | 'cuda') =>
      pluginHost
        .getModelRuntimeService()
        .checkDependencies(getSenderPluginContext(event.sender.id).pluginId, device),
  },
  'plugin-runtime:models:install-dependencies': {
    permission: 'models.execute',
    handler: (event, device: 'cpu' | 'cuda', profileId?: string) =>
      pluginHost
        .getModelRuntimeService()
        .installDependencies(getSenderPluginContext(event.sender.id).pluginId, device, profileId),
  },
  'plugin-runtime:models:environments:list': {
    permission: 'models.execute',
    handler: (event) =>
      pluginHost
        .getModelRuntimeService()
        .environments.getEnvironmentSnapshot(getSenderPluginContext(event.sender.id).pluginId),
  },
  'plugin-runtime:models:environments:import': {
    permission: 'models.execute',
    handler: (event) =>
      pluginHost
        .getModelRuntimeService()
        .environments.importEnvironment(getSenderPluginContext(event.sender.id).pluginId),
  },
  'plugin-runtime:models:environments:create': {
    permission: 'models.execute',
    handler: (event, input: ModelEnvironmentCreateInput) =>
      pluginHost
        .getModelRuntimeService()
        .environments.createManagedEnvironment(
          getSenderPluginContext(event.sender.id).pluginId,
          input
        ),
  },
  'plugin-runtime:models:environments:select': {
    permission: 'models.execute',
    handler: (event, id: string) =>
      pluginHost
        .getModelRuntimeService()
        .environments.selectEnvironment(getSenderPluginContext(event.sender.id).pluginId, id),
  },
  'plugin-runtime:models:environments:clear-active': {
    permission: 'models.execute',
    handler: (event) =>
      pluginHost
        .getModelRuntimeService()
        .environments.clearActiveEnvironment(getSenderPluginContext(event.sender.id).pluginId),
  },
  'plugin-runtime:models:environments:remove': {
    permission: 'models.execute',
    handler: (event, id: string) =>
      pluginHost
        .getModelRuntimeService()
        .environments.removeEnvironment(getSenderPluginContext(event.sender.id).pluginId, id),
  },
  'plugin-runtime:models:packages:list': {
    permission: 'models.execute',
    handler: (event, id: string, manager: ModelPackageManager) =>
      pluginHost
        .getModelRuntimeService()
        .environments.listPackages(getSenderPluginContext(event.sender.id).pluginId, id, manager),
  },
  'plugin-runtime:models:packages:change': {
    permission: 'models.execute',
    handler: (event, input: ModelPackageChangeInput) =>
      pluginHost
        .getModelRuntimeService()
        .environments.changePackages(getSenderPluginContext(event.sender.id).pluginId, input),
  },
  'plugin-runtime:models:packages:check': {
    permission: 'models.execute',
    handler: (event, id: string, manager: ModelPackageManager) =>
      pluginHost
        .getModelRuntimeService()
        .environments.checkPackages(getSenderPluginContext(event.sender.id).pluginId, id, manager),
  },
  'plugin-runtime:models:packages:export': {
    permission: 'models.execute',
    handler: (event, id: string, manager: ModelPackageManager) =>
      pluginHost
        .getModelRuntimeService()
        .environments.exportPackages(getSenderPluginContext(event.sender.id).pluginId, id, manager),
  },
  'plugin-runtime:models:inspect': {
    permission: 'models.execute',
    handler: (event, id?: string) =>
      pluginHost
        .getModelRuntimeService()
        .environments.inspectRuntime(getSenderPluginContext(event.sender.id).pluginId, id),
  },
  'plugin-runtime:models:profiles': {
    permission: 'models.execute',
    handler: (event) =>
      pluginHost
        .getModelRuntimeService()
        .environments.getDependencyProfiles(getSenderPluginContext(event.sender.id).pluginId),
  },
  'plugin-runtime:models:pick-file': {
    permission: 'models.execute',
    handler: (event, kind: ModelFileHandle['kind']) =>
      pluginHost
        .getModelRuntimeService()
        .pickFile(getSenderPluginContext(event.sender.id).pluginId, kind),
  },
  'plugin-runtime:models:start-inference': {
    permission: 'models.execute',
    handler: (event, input: ModelInferenceInput) =>
      pluginHost
        .getModelRuntimeService()
        .startInference(getSenderPluginContext(event.sender.id).pluginId, input),
  },
  'plugin-runtime:models:cancel': {
    permission: 'models.execute',
    handler: (event, jobId: string) =>
      pluginHost
        .getModelRuntimeService()
        .cancel(getSenderPluginContext(event.sender.id).pluginId, jobId),
  },
  'plugin-runtime:get-context': {
    handler: (event) => getSenderPluginContext(event.sender.id),
  },
  'plugin-runtime:worker:ready': {
    handler: (event) => pluginHost.markPluginWorkerReady(event.sender.id),
  },
  'plugin-runtime:workspace:get-current': {
    permission: 'workspace.read',
    handler: () => pluginHost.getHostServices().workspace.getCurrentWorkspace(),
  },
  'plugin-runtime:data:get-capabilities': {
    permission: 'data.user.read',
    handler: () => pluginHost.getHostServices().data.getCapabilities(),
  },
  'plugin-runtime:storage:get': {
    permission: 'storage.self',
    handler: (event, key: string) =>
      pluginHost.getPluginStorageValue(getSenderPluginContext(event.sender.id).pluginId, key),
  },
  'plugin-runtime:storage:set': {
    permission: 'storage.self',
    handler: async (event, key: string, value: unknown) => {
      await pluginHost.setPluginStorageValue(
        getSenderPluginContext(event.sender.id).pluginId,
        key,
        value
      );
    },
  },
  'plugin-runtime:navigation:open-route': {
    permission: 'navigation.open',
    handler: (event, route: string) => {
      pluginHost.getHostServices().navigation.openRoute(route);
    },
  },
  'plugin-runtime:commands:execute': {
    permission: 'commands.execute',
    handler: (event, commandId: string, payload?: unknown) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getHostServices().commands.execute(context.pluginId, commandId, payload);
    },
  },
  'plugin-runtime:commands:register': {
    permission: 'commands.execute',
    handler: (event, commandId: string) => {
      pluginHost.registerPluginCommandRuntime(event.sender.id, commandId);
    },
  },
  'plugin-runtime:commands:respond': {
    permission: 'commands.execute',
    handler: (event, requestId: string, result) => {
      pluginHost.resolvePluginCommandResult(event.sender.id, { requestId, ...result });
    },
  },
  'plugin-runtime:ui:get-pages': {
    permission: 'ui.contribute',
    handler: () => pluginHost.listPages(),
  },
  'plugin-runtime:ui:get-theme': {
    handler: (event) => {
      getSenderPluginContext(event.sender.id);
      return toPluginThemeDescriptor(appConfigManager.getCachedConfig().appearance.theme);
    },
  },
  'plugin-runtime:system:get-capabilities': {
    permission: 'system.notifications',
    handler: () => pluginHost.getHostServices().system.getCapabilities(),
  },
  'plugin-runtime:system:show-notification': {
    permission: 'system.notifications',
    handler: async (event, payload) => {
      await pluginHost.getHostServices().system.showNotification(payload);
    },
  },
  'plugin-runtime:system:open-external': {
    permission: 'navigation.open',
    handler: (_event, url: string) => pluginHost.getHostServices().system.openExternal(url),
  },
  'plugin-runtime:logger:info': {
    permission: 'observability.logs',
    handler: (event, message: string, meta?: unknown) => {
      const context = getSenderPluginContext(event.sender.id);
      if (!pluginHost.getQuotaService().allowLog(context.pluginId)) {
        throw new PluginApiError('QUOTA_EXCEEDED', 'PLUGIN_LOG_QUOTA');
      }
      pluginHost.getHostServices().observability.info(context.pluginId, message, meta);
    },
  },
  'plugin-runtime:logger:error': {
    permission: 'observability.logs',
    handler: (event, message: string, meta?: unknown) => {
      const context = getSenderPluginContext(event.sender.id);
      if (!pluginHost.getQuotaService().allowLog(context.pluginId)) {
        throw new PluginApiError('QUOTA_EXCEEDED', 'PLUGIN_LOG_QUOTA');
      }
      pluginHost.getHostServices().observability.error(context.pluginId, message, meta);
    },
  },
  'plugin-runtime:network:fetch': {
    permission: 'network.fetch',
    handler: (event, input) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getHostServices().network.fetch(input, context.pluginId);
    },
  },
  'plugin-runtime:files:create-data-grant': {
    handler: (event, accessMode) => {
      const context = getSenderPluginContext(event.sender.id);
      guard.requirePermission(context, accessMode === 'read' ? 'files.read' : 'files.write');
      return pluginHost.getHostServices().createPluginDataGrant(context.pluginId, accessMode);
    },
  },
  'plugin-runtime:files:pick-directory-grant': {
    permission: ['system.dialog', 'files.write'],
    handler: (event) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getHostServices().pickPluginDirectoryGrant(context.pluginId);
    },
  },
  'plugin-runtime:files:revoke': {
    permission: 'files.write',
    handler: async (event, grantId: string) => {
      const context = getSenderPluginContext(event.sender.id);
      await pluginHost.getHostServices().revokePluginDataGrant(context.pluginId, grantId);
    },
  },
  'plugin-runtime:files:read': {
    permission: 'files.read',
    handler: async (event, grantId: string, targetPath: string) => {
      const context = getSenderPluginContext(event.sender.id);
      const data = await pluginHost
        .getHostServices()
        .files.read(context.pluginId, grantId, targetPath);
      return data.toString('base64');
    },
  },
  'plugin-runtime:files:write': {
    permission: 'files.write',
    handler: async (event, grantId: string, targetPath: string, bytesBase64: string) => {
      const context = getSenderPluginContext(event.sender.id);
      await pluginHost
        .getHostServices()
        .files.write(context.pluginId, grantId, targetPath, Buffer.from(bytesBase64, 'base64'));
    },
  },
  'plugin-runtime:downloads:direct': {
    permission: 'downloads.manage',
    handler: (event, input) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getHostServices().downloads.download(context.pluginId, input);
    },
  },
  'plugin-runtime:jobs:create': {
    permission: 'jobs.manage',
    handler: (event, kind: string, input: unknown, parentJobId?: string) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getJobService().create(context.pluginId, kind, input, parentJobId);
    },
  },
  'plugin-runtime:jobs:list': {
    permission: 'jobs.manage',
    handler: (event) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getJobService().list(context.pluginId);
    },
  },
  'plugin-runtime:jobs:get': {
    permission: 'jobs.manage',
    handler: (event, id: string) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getJobService().get(context.pluginId, id);
    },
  },
  'plugin-runtime:jobs:update': {
    permission: 'jobs.manage',
    handler: (event, id: string, input: unknown) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getJobService().update(context.pluginId, id, input);
    },
  },
  'plugin-runtime:jobs:cancel': {
    permission: 'jobs.manage',
    handler: (event, id: string) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getJobService().cancel(context.pluginId, id);
    },
  },
  'plugin-runtime:jobs:retry': {
    permission: 'jobs.manage',
    handler: (event, sourceId: string) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getJobService().retry(context.pluginId, sourceId);
    },
  },
  'plugin-runtime:capabilities:list': {
    permission: 'ui.contribute',
    handler: (event) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getCapabilityRouter().list(context.pluginId);
    },
  },
  'plugin-runtime:capabilities:resolve-by-url': {
    permission: 'ui.contribute',
    handler: (event, url: string) => {
      getSenderPluginContext(event.sender.id);
      return pluginHost.getCapabilityRouter().findByUrl(url);
    },
  },
  'plugin-runtime:capabilities:invoke': {
    permission: 'commands.execute',
    handler: (event, input: { capabilityId: string; operation: string; payload?: unknown }) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.invokePluginCapability(context.pluginId, input);
    },
  },
  'plugin-runtime:capabilities:register': {
    handler: (event, capabilityId: string) =>
      pluginHost.registerPluginCapabilityRuntime(event.sender.id, capabilityId),
  },
  'plugin-runtime:capabilities:respond': {
    handler: (event, requestId: string, result) =>
      pluginHost.resolvePluginCapabilityResult(event.sender.id, { requestId, ...result }),
  },
  'plugin-runtime:media:probe': {
    permission: 'media.preview',
    handler: (event, grantId: string, targetPath: string) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getHostServices().media.probe(context.pluginId, grantId, targetPath);
    },
  },
  'plugin-runtime:media:transcode': {
    permission: 'media.transcode',
    handler: (event, input) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost
        .getHostServices()
        .media.transcode(
          context.pluginId,
          input.inputGrantId,
          input.inputPath,
          input.outputGrantId,
          input.outputPath,
          input.options
        );
    },
  },
  'plugin-runtime:media:preview': {
    permission: 'media.preview',
    handler: (
      event,
      url: string,
      mimeType?: string,
      headers?: Record<string, string>,
      credential?: import('@/contracts/plugin_media').PluginCredentialReference
    ) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost
        .getHostServices()
        .media.createPreview(context.pluginId, url, mimeType, headers, credential);
    },
  },
  'plugin-runtime:media:write-tags': {
    permission: 'media.tag',
    handler: (event, grantId: string, targetPath: string, tags) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost
        .getHostServices()
        .media.writeTags(context.pluginId, grantId, targetPath, tags);
    },
  },
  'plugin-runtime:secrets:get': {
    permission: 'secrets.self',
    handler: (event, key: string) => {
      const context = getSenderPluginContext(event.sender.id);
      return pluginHost.getHostServices().secrets.get(context.pluginId, key);
    },
  },
  'plugin-runtime:secrets:set': {
    permission: 'secrets.self',
    handler: async (event, key: string, value: string) => {
      const context = getSenderPluginContext(event.sender.id);
      await pluginHost.getHostServices().secrets.set(context.pluginId, key, value);
    },
  },
  'plugin-runtime:secrets:delete': {
    permission: 'secrets.self',
    handler: async (event, key: string) => {
      const context = getSenderPluginContext(event.sender.id);
      await pluginHost.getHostServices().secrets.delete(context.pluginId, key);
    },
  },
  'plugin-runtime:android:devices:list': {
    handler: (event) =>
      pluginHost.getHostServices().android.listDevices(getSenderPluginContext(event.sender.id)),
  },
  'plugin-runtime:android:sessions:list': {
    handler: (event) =>
      pluginHost.getHostServices().android.listSessions(getSenderPluginContext(event.sender.id)),
  },
  'plugin-runtime:android:sessions:start-mirror': {
    handler: (event, input: unknown) =>
      pluginHost
        .getHostServices()
        .android.startMirror(getSenderPluginContext(event.sender.id), input as never),
  },
  'plugin-runtime:android:sessions:start-audio': {
    handler: (event, input: unknown) =>
      pluginHost
        .getHostServices()
        .android.startAudio(getSenderPluginContext(event.sender.id), input as never),
  },
  'plugin-runtime:android:sessions:start-otg': {
    handler: (event, input: unknown) =>
      pluginHost
        .getHostServices()
        .android.startOtg(getSenderPluginContext(event.sender.id), input as never),
  },
  'plugin-runtime:android:sessions:stop': {
    handler: async (event, sessionId: unknown) => {
      await pluginHost
        .getHostServices()
        .android.stop(getSenderPluginContext(event.sender.id), sessionId as string);
    },
  },
  'plugin-runtime:android:fastboot:list': {
    handler: (event) =>
      pluginHost
        .getHostServices()
        .android.getFastbootDevices(getSenderPluginContext(event.sender.id)),
  },
  'plugin-runtime:android:fastboot:get-vars': {
    handler: (event, serial: unknown, names: unknown) =>
      pluginHost
        .getHostServices()
        .android.getFastbootVars(
          getSenderPluginContext(event.sender.id),
          serial as string,
          names as string[]
        ),
  },
  'plugin-runtime:android:fastboot:reboot': {
    handler: async (event, serial: unknown, target: unknown) => {
      await pluginHost
        .getHostServices()
        .android.fastbootReboot(
          getSenderPluginContext(event.sender.id),
          serial as string,
          target as 'system' | 'bootloader' | undefined
        );
    },
  },
};

export function registerPluginHostIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  if (registered) {
    return;
  }

  ipcMain.handle('plugin-host:get-summary', async () => pluginHost.getHostSummary());
  ipcMain.handle('plugin-host:list-plugins', async () => pluginHost.listPlugins());
  ipcMain.handle('plugin-host:list-pages', async () => pluginHost.listPages());
  ipcMain.handle('plugin-host:list-contributions', async () => pluginHost.listContributions());
  ipcMain.handle('plugin-host:list-audit-events', async (_event, pluginId?: string) =>
    pluginHost.listAuditEvents(pluginId)
  );
  ipcMain.handle('plugin-host:get-plugin-debug-info', async (_event, pluginId: string) =>
    pluginHost.getPluginDebugInfo(pluginId)
  );
  ipcMain.handle('plugin-host:get-plugin-settings', async (_event, pluginId: string) =>
    pluginHost.getPluginSettings(pluginId)
  );
  ipcMain.handle(
    'plugin-host:set-plugin-setting',
    async (_event, pluginId: string, key: string, value: unknown) =>
      pluginHost.setPluginSetting(pluginId, key, value)
  );
  ipcMain.handle('plugin-host:get-permission-copy', async () => pluginHost.getPermissionCopy());
  ipcMain.handle('plugin-host:list-jobs', async (_event, pluginId: string) =>
    pluginHost.listPluginJobs(pluginId)
  );
  ipcMain.handle(
    'plugin-host:execute-command',
    async (_event, pluginId: string, commandId: string, payload?: unknown) =>
      pluginHost.executePluginCommand(pluginId, commandId, payload)
  );
  ipcMain.handle(
    'plugin-host:install-package',
    async (_event, packageName: string, approvedPermissions?: PluginPermission[]) =>
      pluginHost.installPluginFromPackage(packageName, approvedPermissions)
  );
  ipcMain.handle(
    'plugin-host:register-local',
    async (_event, inputPath: string, approvedPermissions?: PluginPermission[]) =>
      pluginHost.registerLocalPlugin(inputPath, approvedPermissions)
  );
  ipcMain.handle('plugin-host:pick-local-path', () => pluginHost.pickLocalPluginPath());
  ipcMain.handle(
    'plugin-host:approve-permissions',
    async (_event, pluginId: string, approvedPermissions: PluginPermission[]) =>
      pluginHost.approvePermissions(pluginId, approvedPermissions)
  );
  ipcMain.handle('plugin-host:install-git', async (_event, input) =>
    pluginHost.installFromGit(input)
  );
  ipcMain.handle(
    'plugin-host:install-marketplace',
    async (_event, marketplaceId: string, pluginId: string, approvedPermissions) =>
      pluginHost.installFromMarketplace(marketplaceId, pluginId, approvedPermissions)
  );
  ipcMain.handle(
    'plugin-host:update',
    async (_event, pluginId: string, approvedPermissions?: PluginPermission[]) =>
      pluginHost.updatePlugin(pluginId, approvedPermissions)
  );
  ipcMain.handle('plugin-host:rollback', async (_event, pluginId: string) =>
    pluginHost.rollbackPlugin(pluginId)
  );
  ipcMain.handle('plugin-host:uninstall', async (_event, pluginId: string) =>
    pluginHost.uninstallPlugin(pluginId)
  );
  ipcMain.handle('plugin-host:dev-sessions:list', async () => pluginHost.listDevSessions());
  ipcMain.handle('plugin-host:dev-sessions:connect', async (_event, session) =>
    pluginHost.connectDevSession(session)
  );
  ipcMain.handle('plugin-host:dev-sessions:connect-file', async (_event, rootPath: string) =>
    pluginHost.connectDevSessionFromFile(rootPath)
  );
  ipcMain.handle('plugin-host:dev-sessions:disconnect', async (_event, pluginId: string) =>
    pluginHost.disconnectDevSession(pluginId)
  );
  ipcMain.handle('plugin-host:marketplaces:list', async () => pluginHost.listMarketplaces());
  ipcMain.handle('plugin-host:marketplaces:refresh', async (_event, input) =>
    pluginHost.refreshMarketplace(input)
  );
  ipcMain.handle('plugin-host:marketplaces:search', async (_event, query: string) =>
    pluginHost.searchMarketplace(query)
  );
  ipcMain.handle('plugin-host:enable', async (_event, pluginId: string) =>
    pluginHost.enablePlugin(pluginId)
  );
  ipcMain.handle('plugin-host:disable', async (_event, pluginId: string) =>
    pluginHost.disablePlugin(pluginId)
  );
  ipcMain.handle(
    'plugin-host:mount-page',
    async (_event, pluginId: string, pageId: string, bounds) =>
      pluginHost.mountPage(pluginId, pageId, bounds)
  );
  ipcMain.handle('plugin-host:update-page-bounds', async (_event, bounds) =>
    pluginHost.updateMountedPageBounds(bounds)
  );
  ipcMain.handle('plugin-host:unmount-page', async (_event, pluginId?: string) =>
    pluginHost.unmountPage(pluginId)
  );
  ipcMain.handle('plugin-host:open-devtools', (event, pluginId: string, pageId: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || event.sender.id !== mainWindow.webContents.id)
      throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_DEVTOOLS_HOST_ONLY');
    return pluginHost.openDevTools(pluginId, pageId);
  });

  for (const [channel, route] of Object.entries(runtimeRoutes)) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        const context = getSenderPluginContext(event.sender.id);
        if (route.permission) {
          const permissions = Array.isArray(route.permission)
            ? route.permission
            : [route.permission];
          for (const permission of permissions) {
            guard.requirePermission(context, permission);
          }
        }
        return await route.handler(event, ...args);
      } catch (error) {
        const payload = toPluginApiErrorPayload(error);
        throw new Error(`${payload.code}: ${payload.message}`);
      }
    });
  }

  // Job event bridging requires the database and installed-plugin registry;
  // it is attached later in pluginHost.initialize() after dbManager.initialize().
  androidAdbService.onDevicesChanged(broadcastPluginDevices);
  androidScrcpyService.onSessionEvent(broadcastPluginSession);

  ipcMain.on('plugin-host:navigate-complete', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      void pluginHost.unmountPage().catch((error) => {
        pluginHost.getHostServices().observability.error('Plugin page cleanup failed', error);
      });
    }
  });

  registered = true;
}
