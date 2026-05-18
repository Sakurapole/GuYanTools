import { BrowserWindow, ipcMain } from 'electron';
import os from 'node:os';
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
  ipcMain.handle('app-config:list-network-interfaces', async () => listNetworkInterfaces());
  appConfigManager.subscribe((config) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('app-config:changed', config);
      }
    }
  });

  registered = true;
}

function listNetworkInterfaces() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, addresses]) => (addresses ?? []).map((address) => ({
      key: `${name}|${address.address}`,
      name,
      address: address.address,
      family: address.family,
      internal: address.internal,
      mac: address.mac,
      cidr: address.cidr,
    })))
    .filter((item) => item.family === 'IPv4')
    .sort((a, b) => Number(a.internal) - Number(b.internal) || a.name.localeCompare(b.name) || a.address.localeCompare(b.address));
}
