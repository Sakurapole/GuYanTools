import { AndroidToolchainManager } from './toolchain';
import { AdbDeviceService } from './adb_service';
import { ScrcpySessionService } from './scrcpy_service';
import { FastbootService } from './fastboot_service';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ANDROID_TOOLCHAIN_DOWNLOAD_DIR } from '../constants/paths';
import { downloadAndInstallAndroidToolchain } from './downloader';
import type { AndroidToolchainDownloadProgress } from '@/contracts/android-tools';

const downloadEmitter = new EventEmitter();
let downloadProgress: AndroidToolchainDownloadProgress = { phase: 'idle', percent: 0 };
let downloadPromise: Promise<unknown> | null = null;
let configuredToolchainPath = '';
let persistConfiguredToolchainPath: ((nextPath: string) => Promise<void>) | undefined;

function getConfiguredToolchainPath() {
  return configuredToolchainPath || undefined;
}

function getManagedToolchainPath() {
  return path.join(ANDROID_TOOLCHAIN_DOWNLOAD_DIR, `${process.platform}-${process.arch}`);
}

export const androidToolchain = new AndroidToolchainManager({
  getConfiguredRootPath: getConfiguredToolchainPath,
  getManagedRootPath: getManagedToolchainPath,
});
export const androidAdbService = new AdbDeviceService(androidToolchain);
export const androidScrcpyService = new ScrcpySessionService(androidToolchain, androidAdbService);
export const androidFastbootService = new FastbootService(androidToolchain);

export function setAndroidToolchainConfiguredPath(nextPath: string | undefined) {
  configuredToolchainPath = nextPath?.trim() ?? '';
}

export function setAndroidToolchainPathPersistence(handler: (nextPath: string) => Promise<void>) {
  persistConfiguredToolchainPath = handler;
}

let initialized = false;

export async function initializeAndroidTools() {
  if (initialized) return androidToolchain.verify();
  const status = await androidToolchain.verify();
  if (!status.available) return status;
  await androidAdbService.initialize();
  await androidAdbService.listDevices();
  initialized = true;
  return status;
}

export async function disposeAndroidTools() {
  await androidScrcpyService.dispose();
  androidAdbService.dispose();
  initialized = false;
}

export function getAndroidToolchainDownloadStatus() {
  return { ...downloadProgress };
}

export function onAndroidToolchainDownloadProgress(listener: (progress: AndroidToolchainDownloadProgress) => void) {
  downloadEmitter.on('progress', listener);
  return () => downloadEmitter.off('progress', listener);
}

export async function downloadAndroidToolchain() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('ANDROID_PLATFORM_UNSUPPORTED');
  if (downloadPromise) return downloadPromise.then(() => androidToolchain.verify());
  if (androidScrcpyService.listSessions().some(session => ['starting', 'running', 'stopping'].includes(session.status))) {
    throw new Error('ANDROID_TOOLCHAIN_BUSY');
  }

  const destination = getManagedToolchainPath();
  downloadProgress = { phase: 'downloading', percent: 0 };
  downloadEmitter.emit('progress', downloadProgress);
  downloadPromise = downloadAndInstallAndroidToolchain(destination, progress => {
    downloadProgress = { ...progress };
    downloadEmitter.emit('progress', downloadProgress);
  }).catch(error => {
    downloadProgress = {
      phase: 'failed',
      percent: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
    downloadEmitter.emit('progress', downloadProgress);
    throw error;
  }).finally(() => {
    downloadPromise = null;
  });
  await downloadPromise;

  // A successful download explicitly selects the application-managed copy.
  // Keep a user's configured path intact when downloading or persistence
  // fails, so an unsuccessful update cannot take away a working toolchain.
  if (persistConfiguredToolchainPath) {
    await persistConfiguredToolchainPath('');
  }
  setAndroidToolchainConfiguredPath('');
  return androidToolchain.verify();
}

