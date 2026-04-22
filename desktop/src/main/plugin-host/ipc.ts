import { BrowserWindow, ipcMain } from 'electron';
import { pluginHost } from './index';

let registered = false;

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
  ipcMain.handle('plugin-host:install-package', async (_event, packageName: string) => pluginHost.installPluginFromPackage(packageName));
  ipcMain.handle('plugin-host:register-local', async (_event, inputPath: string) => pluginHost.registerLocalPlugin(inputPath));
  ipcMain.handle('plugin-host:enable', async (_event, pluginId: string) => pluginHost.enablePlugin(pluginId));
  ipcMain.handle('plugin-host:disable', async (_event, pluginId: string) => pluginHost.disablePlugin(pluginId));
  ipcMain.handle('plugin-host:mount-page', async (_event, pluginId: string, pageId: string, bounds) => pluginHost.mountPage(pluginId, pageId, bounds));
  ipcMain.handle('plugin-host:update-page-bounds', async (_event, bounds) => pluginHost.updateMountedPageBounds(bounds));
  ipcMain.handle('plugin-host:unmount-page', async (_event, pluginId?: string) => pluginHost.unmountPage(pluginId));

  ipcMain.handle('plugin-runtime:get-context', async (event) => getSenderPluginContext(event.sender.id));
  ipcMain.handle('plugin-runtime:workspace:get-current', async () => pluginHost.getHostServices().workspace.getCurrentWorkspace());
  ipcMain.handle('plugin-runtime:data:get-capabilities', async () => pluginHost.getHostServices().data.getCapabilities());
  ipcMain.handle('plugin-runtime:storage:get', async (event, key: string) => {
    const context = getSenderPluginContext(event.sender.id);
    return pluginHost.getPluginStorageValue(context.pluginId, key);
  });
  ipcMain.handle('plugin-runtime:storage:set', async (event, key: string, value: unknown) => {
    const context = getSenderPluginContext(event.sender.id);
    await pluginHost.setPluginStorageValue(context.pluginId, key, value);
  });
  ipcMain.handle('plugin-runtime:navigation:open-route', async (_event, route: string) => {
    pluginHost.getHostServices().navigation.openRoute(route);
  });
  ipcMain.handle('plugin-runtime:commands:execute', async (_event, commandId: string, payload?: unknown) => {
    return pluginHost.getHostServices().commands.execute(commandId, payload);
  });
  ipcMain.handle('plugin-runtime:ui:get-pages', async () => pluginHost.listPages());
  ipcMain.handle('plugin-runtime:system:get-capabilities', async () => pluginHost.getHostServices().system.getCapabilities());
  ipcMain.handle('plugin-runtime:system:show-notification', async (event, payload) => {
    const context = getSenderPluginContext(event.sender.id);
    if (!context.permissions.includes('system.notifications')) {
      throw new Error(`Plugin "${context.pluginId}" lacks permission "system.notifications"`);
    }
    await pluginHost.getHostServices().system.showNotification(payload);
  });
  ipcMain.handle('plugin-runtime:logger:info', async (_event, message: string, meta?: unknown) => {
    pluginHost.getHostServices().observability.info(message, meta);
  });
  ipcMain.handle('plugin-runtime:logger:error', async (_event, message: string, meta?: unknown) => {
    pluginHost.getHostServices().observability.error(message, meta);
  });

  ipcMain.on('plugin-host:navigate-complete', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      void pluginHost.unmountPage();
    }
  });

  registered = true;
}
