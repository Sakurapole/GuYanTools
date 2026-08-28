import { AndroidToolchainManager } from './toolchain';
import { AdbDeviceService } from './adb_service';
import { ScrcpySessionService } from './scrcpy_service';
import { FastbootService } from './fastboot_service';

export const androidToolchain = new AndroidToolchainManager();
export const androidAdbService = new AdbDeviceService(androidToolchain);
export const androidScrcpyService = new ScrcpySessionService(androidToolchain, androidAdbService);
export const androidFastbootService = new FastbootService(androidToolchain);

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

