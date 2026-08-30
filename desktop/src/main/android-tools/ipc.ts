import { BrowserWindow, ipcMain } from 'electron';
import type { AndroidDeviceEvent, AndroidSessionEvent, AndroidToolchainDownloadProgress } from '@/contracts/android-tools';
import {
  androidAdbService,
  androidFastbootService,
  androidScrcpyService,
  androidToolchain,
  downloadAndroidToolchain,
  getAndroidToolchainDownloadStatus,
  onAndroidToolchainDownloadProgress,
} from './index';
import { validateDeviceSerial, validateFastbootVarNames, validateSessionId } from './ipc_guards';

let registered = false;
let stopDeviceBroadcast: (() => void) | undefined;
let stopSessionBroadcast: (() => void) | undefined;
let stopDownloadBroadcast: (() => void) | undefined;

function ensureDeviceBroadcast() {
  if (stopDeviceBroadcast) return;
  stopDeviceBroadcast = androidAdbService.onDevicesChanged((event: AndroidDeviceEvent) => broadcast('android:devices-changed', event));
}

async function requireToolchain() {
  const status = await androidToolchain.verify();
  if (status.available) return;
  throw new Error(status.errorCode ?? 'ANDROID_TOOL_UNAVAILABLE');
}

function broadcast(channel: string, payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ANDROID_PAYLOAD_INVALID');
  return value as Record<string, unknown>;
}

function readMode(value: unknown, fallback: 'uhid' | 'sdk') {
  if (value === undefined) return fallback;
  if (value !== 'uhid' && value !== 'sdk') throw new Error('ANDROID_PAYLOAD_INVALID');
  return value;
}

export function registerAndroidToolsIpcHandlers() {
  if (registered) return;

  ipcMain.handle('android:get-toolchain-status', async () => androidToolchain.verify());
  ipcMain.handle('android:get-toolchain-download-status', async () => getAndroidToolchainDownloadStatus());
  ipcMain.handle('android:download-toolchain', async () => downloadAndroidToolchain());
  ipcMain.handle('android:list-devices', async () => {
    await requireToolchain();
    ensureDeviceBroadcast();
    return androidAdbService.listDevices();
  });
  ipcMain.handle('android:list-sessions', async () => androidScrcpyService.listSessions());
  ipcMain.handle('android:start-mirror', async (_event, input: unknown) => {
    await requireToolchain();
    const payload = requireRecord(input);
    return androidScrcpyService.startMirror({
      deviceSerial: validateDeviceSerial(payload.deviceSerial),
      keyboard: readMode(payload.keyboard, 'uhid'),
      mouse: readMode(payload.mouse, 'uhid'),
    });
  });
  ipcMain.handle('android:start-audio', async (_event, input: unknown) => {
    await requireToolchain();
    const payload = requireRecord(input);
    if (payload.duplicateOnDevice !== undefined && typeof payload.duplicateOnDevice !== 'boolean') {
      throw new Error('ANDROID_PAYLOAD_INVALID');
    }
    return androidScrcpyService.startAudio({
      deviceSerial: validateDeviceSerial(payload.deviceSerial),
      duplicateOnDevice: payload.duplicateOnDevice as boolean | undefined,
    });
  });
  ipcMain.handle('android:start-otg', async (_event, input: unknown) => {
    await requireToolchain();
    const payload = requireRecord(input);
    if (payload.keyboard !== undefined && typeof payload.keyboard !== 'boolean') throw new Error('ANDROID_PAYLOAD_INVALID');
    if (payload.mouse !== undefined && typeof payload.mouse !== 'boolean') throw new Error('ANDROID_PAYLOAD_INVALID');
    return androidScrcpyService.startOtg({
      deviceSerial: validateDeviceSerial(payload.deviceSerial),
      keyboard: payload.keyboard as boolean | undefined,
      mouse: payload.mouse as boolean | undefined,
    });
  });
  ipcMain.handle('android:stop-session', async (_event, sessionId: unknown) => {
    await androidScrcpyService.stopSession(validateSessionId(sessionId));
  });
  ipcMain.handle('android:fastboot-list-devices', async () => {
    await requireToolchain();
    return androidFastbootService.listDevices();
  });
  ipcMain.handle('android:fastboot-get-vars', async (_event, serial: unknown, names: unknown) => {
    await requireToolchain();
    return androidFastbootService.getVars(validateDeviceSerial(serial), validateFastbootVarNames(names));
  });
  ipcMain.handle('android:fastboot-reboot', async (_event, serial: unknown, target: unknown) => {
    await requireToolchain();
    if (target !== undefined && target !== 'system' && target !== 'bootloader') {
      throw new Error('ANDROID_FASTBOOT_OPERATION_DENIED');
    }
    await androidFastbootService.reboot(validateDeviceSerial(serial), target as 'system' | 'bootloader' | undefined);
  });

  stopSessionBroadcast = androidScrcpyService.onSessionEvent((event: AndroidSessionEvent) => broadcast('android:session-event', event));
  stopDownloadBroadcast = onAndroidToolchainDownloadProgress((progress: AndroidToolchainDownloadProgress) => broadcast('android:toolchain-download-progress', progress));
  registered = true;
}

export function disposeAndroidToolsIpcHandlers() {
  stopDeviceBroadcast?.();
  stopSessionBroadcast?.();
  stopDownloadBroadcast?.();
  stopDeviceBroadcast = undefined;
  stopSessionBroadcast = undefined;
  stopDownloadBroadcast = undefined;
  registered = false;
}

