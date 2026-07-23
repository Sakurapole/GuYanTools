import { BrowserWindow, ipcMain } from 'electron';
import { pluginHost } from './index';
import { PluginContextGuard } from './context_guard';
import { dbManager } from '../../core/database';
import { JobService } from './services/job_service';

let registered = false;
const guard = new PluginContextGuard();
function getJobService() {
  return new JobService(dbManager.getDatabase() as any);
}

function getSenderPluginContext(senderId: number) {
  const context = pluginHost.getRuntimeContext(senderId);
  if (!context) {
    throw new Error('Plugin runtime context not found');
  }

  return context;
}

export function registerPluginHostIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  if (registered) {
    return;
  }

  ipcMain.handle('plugin-host:get-summary', async () => pluginHost.getHostSummary());
  ipcMain.handle('plugin-host:list-plugins', async () => pluginHost.listPlugins());
  ipcMain.handle('plugin-host:list-pages', async () => pluginHost.listPages());
  ipcMain.handle('plugin-host:list-jobs', async (_event, pluginId: string) => pluginHost.listPluginJobs(pluginId));
  ipcMain.handle('plugin-host:install-package', async (_event, packageName: string) => pluginHost.installPluginFromPackage(packageName));
  ipcMain.handle('plugin-host:register-local', async (_event, inputPath: string) => pluginHost.registerLocalPlugin(inputPath));
  ipcMain.handle('plugin-host:install-git', async (_event, input) => pluginHost.installFromGit(input));
  ipcMain.handle('plugin-host:install-marketplace', async (_event, marketplaceId: string, pluginId: string, approvedPermissions) => pluginHost.installFromMarketplace(marketplaceId, pluginId, approvedPermissions));
  ipcMain.handle('plugin-host:update', async (_event, pluginId: string) => pluginHost.updatePlugin(pluginId));
  ipcMain.handle('plugin-host:rollback', async (_event, pluginId: string) => pluginHost.rollbackPlugin(pluginId));
  ipcMain.handle('plugin-host:uninstall', async (_event, pluginId: string) => pluginHost.uninstallPlugin(pluginId));
  ipcMain.handle('plugin-host:marketplaces:list', async () => pluginHost.listMarketplaces());
  ipcMain.handle('plugin-host:marketplaces:refresh', async (_event, input) => pluginHost.refreshMarketplace(input));
  ipcMain.handle('plugin-host:marketplaces:search', async (_event, query: string) => pluginHost.searchMarketplace(query));
  ipcMain.handle('plugin-host:enable', async (_event, pluginId: string) => pluginHost.enablePlugin(pluginId));
  ipcMain.handle('plugin-host:disable', async (_event, pluginId: string) => pluginHost.disablePlugin(pluginId));
  ipcMain.handle('plugin-host:mount-page', async (_event, pluginId: string, pageId: string, bounds) => pluginHost.mountPage(pluginId, pageId, bounds));
  ipcMain.handle('plugin-host:update-page-bounds', async (_event, bounds) => pluginHost.updateMountedPageBounds(bounds));
  ipcMain.handle('plugin-host:unmount-page', async (_event, pluginId?: string) => pluginHost.unmountPage(pluginId));

  ipcMain.handle('plugin-runtime:get-context', async (event) => getSenderPluginContext(event.sender.id));
  ipcMain.handle('plugin-runtime:workspace:get-current', async (event) => {
    guard.requirePermission(getSenderPluginContext(event.sender.id), 'workspace.read');
    return pluginHost.getHostServices().workspace.getCurrentWorkspace();
  });
  ipcMain.handle('plugin-runtime:data:get-capabilities', async (event) => {
    guard.requirePermission(getSenderPluginContext(event.sender.id), 'data.user.read');
    return pluginHost.getHostServices().data.getCapabilities();
  });
  ipcMain.handle('plugin-runtime:storage:get', async (event, key: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'storage.self');
    return pluginHost.getPluginStorageValue(context.pluginId, key);
  });
  ipcMain.handle('plugin-runtime:storage:set', async (event, key: string, value: unknown) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'storage.self');
    await pluginHost.setPluginStorageValue(context.pluginId, key, value);
  });
  ipcMain.handle('plugin-runtime:navigation:open-route', async (event, route: string) => {
    guard.requirePermission(getSenderPluginContext(event.sender.id), 'navigation.open');
    pluginHost.getHostServices().navigation.openRoute(route);
  });
  ipcMain.handle('plugin-runtime:commands:execute', async (event, commandId: string, payload?: unknown) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'commands.execute');
    return pluginHost.getHostServices().commands.execute(context.pluginId, commandId, payload);
  });
  ipcMain.handle('plugin-runtime:ui:get-pages', async (event) => {
    guard.requirePermission(getSenderPluginContext(event.sender.id), 'ui.contribute');
    return pluginHost.listPages();
  });
  ipcMain.handle('plugin-runtime:system:get-capabilities', async (event) => {
    guard.requirePermission(getSenderPluginContext(event.sender.id), 'system.notifications');
    return pluginHost.getHostServices().system.getCapabilities();
  });
  ipcMain.handle('plugin-runtime:system:show-notification', async (event, payload) => {
    const context = getSenderPluginContext(event.sender.id);
    if (!context.permissions.includes('system.notifications')) {
      throw new Error(`Plugin "${context.pluginId}" lacks permission "system.notifications"`);
    }
    await pluginHost.getHostServices().system.showNotification(payload);
  });
  ipcMain.handle('plugin-runtime:logger:info', async (event, message: string, meta?: unknown) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'observability.logs');
    pluginHost.getHostServices().observability.info(context.pluginId, message, meta);
  });
  ipcMain.handle('plugin-runtime:logger:error', async (event, message: string, meta?: unknown) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'observability.logs');
    pluginHost.getHostServices().observability.error(context.pluginId, message, meta);
  });
  ipcMain.handle('plugin-runtime:network:fetch', async (event, input) => {
    guard.requirePermission(getSenderPluginContext(event.sender.id), 'network.fetch');
    return pluginHost.getHostServices().network.fetch(input);
  });
  ipcMain.handle('plugin-runtime:files:create-data-grant', async (event, accessMode) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, accessMode === 'read' ? 'files.read' : 'files.write');
    return pluginHost.getHostServices().createPluginDataGrant(context.pluginId, accessMode);
  });
  ipcMain.handle('plugin-runtime:files:revoke', async (event, grantId: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'files.write');
    await pluginHost.getHostServices().revokePluginDataGrant(context.pluginId, grantId);
  });
  ipcMain.handle('plugin-runtime:files:read', async (event, grantId: string, targetPath: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'files.read');
    const data = await pluginHost.getHostServices().files.read(context.pluginId, grantId, targetPath);
    return data.toString('base64');
  });
  ipcMain.handle('plugin-runtime:files:write', async (event, grantId: string, targetPath: string, bytesBase64: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'files.write');
    await pluginHost.getHostServices().files.write(context.pluginId, grantId, targetPath, Buffer.from(bytesBase64, 'base64'));
  });
  ipcMain.handle('plugin-runtime:downloads:direct', async (event, input) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'downloads.manage');
    return pluginHost.getHostServices().downloads.download(context.pluginId, input);
  });
  ipcMain.handle('plugin-runtime:jobs:create', async (event, kind: string, input: unknown, parentJobId?: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'jobs.manage');
    return getJobService().create(context.pluginId, kind, input, parentJobId);
  });
  ipcMain.handle('plugin-runtime:jobs:list', async (event) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'jobs.manage');
    return getJobService().list(context.pluginId);
  });
  ipcMain.handle('plugin-runtime:jobs:get', async (event, id: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'jobs.manage');
    return getJobService().get(context.pluginId, id);
  });
  ipcMain.handle('plugin-runtime:jobs:update', async (event, id: string, input: unknown) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'jobs.manage');
    return getJobService().update(context.pluginId, id, input);
  });
  ipcMain.handle('plugin-runtime:jobs:cancel', async (event, id: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'jobs.manage');
    return getJobService().cancel(context.pluginId, id);
  });
  ipcMain.handle('plugin-runtime:jobs:retry', async (event, sourceId: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'jobs.manage');
    return getJobService().retry(context.pluginId, sourceId);
  });
  ipcMain.handle('plugin-runtime:media:probe', async (event, grantId: string, targetPath: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'media.preview');
    return pluginHost.getHostServices().media.probe(context.pluginId, grantId, targetPath);
  });
  ipcMain.handle('plugin-runtime:media:transcode', async (event, input) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'media.transcode');
    return pluginHost.getHostServices().media.transcode(context.pluginId, input.inputGrantId, input.inputPath, input.outputGrantId, input.outputPath, input.options);
  });
  ipcMain.handle('plugin-runtime:media:preview', async (event, url: string, mimeType?: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'media.preview');
    return pluginHost.getHostServices().media.createPreview(context.pluginId, url, mimeType);
  });
  ipcMain.handle('plugin-runtime:media:write-tags', async (event, grantId: string, targetPath: string, tags) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'media.tag');
    return pluginHost.getHostServices().media.writeTags(context.pluginId, grantId, targetPath, tags);
  });
  ipcMain.handle('plugin-runtime:secrets:get', async (event, key: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'secrets.self');
    return pluginHost.getHostServices().secrets.get(context.pluginId, key);
  });
  ipcMain.handle('plugin-runtime:secrets:set', async (event, key: string, value: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'secrets.self');
    await pluginHost.getHostServices().secrets.set(context.pluginId, key, value);
  });
  ipcMain.handle('plugin-runtime:secrets:delete', async (event, key: string) => {
    const context = getSenderPluginContext(event.sender.id);
    guard.requirePermission(context, 'secrets.self');
    await pluginHost.getHostServices().secrets.delete(context.pluginId, key);
  });

  ipcMain.on('plugin-host:navigate-complete', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      void pluginHost.unmountPage();
    }
  });

  registered = true;
}
