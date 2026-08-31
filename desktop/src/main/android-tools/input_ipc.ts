import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as nativeCore from '@guyantools/core';
import type { AndroidInputConfig } from '@/contracts/android-tools';
import { appConfigManager } from '../app-config/manager';
import { androidAdbService, androidToolchain } from './index';
import { AndroidInputRouter, type InputRouterDependencies, type WindowsInputBridge } from './input_router';
import { AndroidUhidSession } from './android_uhid_service';
import { validateInputConfigPatch } from './ipc_guards';

type NativeInputCore = {
  windowsInputStart?: (options: string, callback: (event: unknown) => void) => void;
  windowsInputStop?: () => void;
  windowsInputGetCursor?: () => number[];
  windowsInputSetCursor?: (x: number, y: number) => void;
  windowsInputSetBlocked?: (blocked: boolean) => void;
};
const nativeInput = nativeCore as unknown as NativeInputCore;
const nativeBridge: WindowsInputBridge = {
  start: listener => {
    if (process.platform !== 'win32' || !nativeInput.windowsInputStart) throw new Error('ANDROID_INPUT_BRIDGE_UNAVAILABLE');
    nativeInput.windowsInputStart(JSON.stringify({}), event => listener(event as any));
  },
  stop: () => nativeInput.windowsInputStop?.(),
  getCursor: () => {
    const [x = 0, y = 0] = nativeInput.windowsInputGetCursor?.() ?? [];
    return { x, y };
  },
  setCursor: (x, y) => nativeInput.windowsInputSetCursor?.(x, y),
  setBlocked: blocked => nativeInput.windowsInputSetBlocked?.(blocked),
};
const routerDependencies: InputRouterDependencies = { bridge: nativeBridge, uhid: new AndroidUhidSession(androidToolchain) };
const router = new AndroidInputRouter(routerDependencies);
let registered = false;
let active = false;

function broadcast(status: unknown) {
  for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('android:input-status', status);
}

export function registerAndroidInputIpcHandlers() {
  if (registered) return;
  const updateScreenSize = () => { routerDependencies.screen = screen.getPrimaryDisplay().workAreaSize; };
  if (app.isReady()) updateScreenSize();
  else app.once('ready', updateScreenSize);
  router.onStatus(broadcast);
  ipcMain.handle('android:get-input-config', () => appConfigManager.getCachedConfig().androidInput);
  ipcMain.handle('android:update-input-config', async (_event, value: unknown) => {
    const patch = validateInputConfigPatch(value);
    if (patch.deviceSerial !== undefined) {
      const device = androidAdbService.getDevice(patch.deviceSerial);
      if (!device || device.state !== 'device') throw new Error('ANDROID_DEVICE_NOT_FOUND');
    }
    const config = await appConfigManager.updateConfig({ androidInput: patch });
    return config.androidInput;
  });
  ipcMain.handle('android:get-input-status', () => router.status());
  ipcMain.handle('android:start-input-sharing', async () => {
    if (active) throw new Error('ANDROID_INPUT_ALREADY_RUNNING');
    const config = appConfigManager.getCachedConfig().androidInput;
    const device = androidAdbService.getDevice(config.deviceSerial);
    if (!device || device.state !== 'device') throw new Error('ANDROID_DEVICE_NOT_FOUND');
    const status = await router.start(config);
    active = true;
    return status;
  });
  ipcMain.handle('android:stop-input-sharing', async (_event, reason?: unknown) => {
    await router.stop(typeof reason === 'string' ? reason : 'user');
    active = false;
  });
  ipcMain.handle('android:toggle-input-sharing', () => router.toggle());
  registered = true;
}

export async function disposeAndroidInput() { await router.stop('shutdown'); active = false; }
