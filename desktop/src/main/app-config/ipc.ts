import { BrowserWindow, ipcMain } from 'electron';
import os from 'node:os';
import type { AppConfig, AppConfigPatch, AppSettingsTabId } from '@/contracts/app_config';
import type { AiProviderConfig } from '@/contracts/ai';
import { createDefaultAppConfig, createDefaultSettingsTabPersonalization } from '@/contracts/app_config';
import { appConfigManager } from './manager';

let registered = false;

export function registerAppConfigIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('app-config:get', async () => sanitizeConfigForRenderer(await appConfigManager.getConfig()));
  ipcMain.handle('app-config:update', async (_event, patch: AppConfigPatch) => sanitizeConfigForRenderer(await appConfigManager.updateConfig(patch)));
  ipcMain.handle('app-config:list-fonts', async (event) => appConfigManager.listLocalFonts(event.sender));
  ipcMain.handle('app-config:list-network-interfaces', async () => listNetworkInterfaces());
  appConfigManager.subscribe((config) => {
    const safeConfig = sanitizeConfigForRenderer(config);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('app-config:changed', safeConfig);
      }
    }
  });

  registered = true;
}

function sanitizeConfigForRenderer(config: AppConfig): AppConfig {
  return {
    ...config,
    features: {
      ...config.features,
      settings: {
        ...config.features.settings,
        tabs: sanitizeSettingsTabs(config.features.settings.tabs),
      },
      aiAgent: {
        ...config.features.aiAgent,
        research: {
          ...config.features.aiAgent.research,
          webSearchApiKey: undefined,
        },
        providers: config.features.aiAgent.providers.map((provider: AiProviderConfig) => ({
          ...provider,
          apiKey: undefined as string | undefined,
        })),
      },
    },
  };
}

function sanitizeSettingsTabs(tabs: AppConfig['features']['settings']['tabs']) {
  const tabIds = Object.keys(createDefaultAppConfig().features.settings.tabs) as AppSettingsTabId[];
  const result = {} as Record<AppSettingsTabId, ReturnType<typeof createDefaultSettingsTabPersonalization>>;
  for (const tabId of tabIds) {
    result[tabId] = tabs[tabId] ?? createDefaultSettingsTabPersonalization();
  }

  return result;
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
