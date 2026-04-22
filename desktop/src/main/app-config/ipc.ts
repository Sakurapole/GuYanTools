import { ipcMain } from 'electron';
import type { AppConfigPatch } from '@/contracts/app_config';
import { appConfigManager } from './manager';

let registered = false;

export function registerAppConfigIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('app-config:get', async () => appConfigManager.getConfig());
  ipcMain.handle('app-config:update', async (_event, patch: AppConfigPatch) => appConfigManager.updateConfig(patch));
  ipcMain.handle('app-config:list-fonts', async (event) => appConfigManager.listLocalFonts(event.sender));

  registered = true;
}
