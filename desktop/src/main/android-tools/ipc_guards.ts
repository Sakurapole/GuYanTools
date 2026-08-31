import { isAllowedFastbootGetvar } from './fastboot_args';
import type { AndroidInputConfig } from '@/contracts/android-tools';

export function validateDeviceSerial(value: unknown) {
  if (typeof value !== 'string') throw new Error('ANDROID_DEVICE_NOT_FOUND');
  const serial = value.trim();
  if (!serial || serial.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(serial)) {
    throw new Error('ANDROID_DEVICE_NOT_FOUND');
  }
  return serial;
}

export function validateInputConfigPatch(value: unknown): Partial<AndroidInputConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ANDROID_PAYLOAD_INVALID');
  const patch = { ...(value as Record<string, unknown>) };
  const allowed = new Set(['deviceSerial', 'placement', 'androidWidth', 'androidHeight', 'edgeDelayMs', 'edgeThresholdPx', 'toggleShortcut', 'preserveWinKey', 'preserveAltTab', 'preserveVolumeKeys']);
  if (Object.keys(patch).some(key => !allowed.has(key))) throw new Error('ANDROID_PAYLOAD_INVALID');
  if (patch.deviceSerial !== undefined) patch.deviceSerial = validateDeviceSerial(patch.deviceSerial);
  if (patch.placement !== undefined && !['left', 'right', 'top', 'bottom'].includes(String(patch.placement))) throw new Error('ANDROID_PAYLOAD_INVALID');
  for (const key of ['androidWidth', 'androidHeight', 'edgeDelayMs', 'edgeThresholdPx']) {
    if (patch[key] !== undefined && (!Number.isInteger(patch[key]) || Number(patch[key]) < 0 || Number(patch[key]) > 16384)) throw new Error('ANDROID_PAYLOAD_INVALID');
  }
  if (patch.toggleShortcut !== undefined && (typeof patch.toggleShortcut !== 'string' || patch.toggleShortcut.length > 64 || !/^[A-Za-z0-9+ ]+$/.test(patch.toggleShortcut))) throw new Error('ANDROID_PAYLOAD_INVALID');
  for (const key of ['preserveWinKey', 'preserveAltTab', 'preserveVolumeKeys']) {
    if (patch[key] !== undefined && typeof patch[key] !== 'boolean') throw new Error('ANDROID_PAYLOAD_INVALID');
  }
  return patch as Partial<AndroidInputConfig>;
}

export function validateSessionId(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error('ANDROID_SESSION_NOT_FOUND');
  }
  return value;
}

export function validateFastbootVarNames(value: unknown) {
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error('ANDROID_FASTBOOT_OPERATION_DENIED');
  }
  const names = Array.from(new Set(value.map(name => {
    if (typeof name !== 'string' || !isAllowedFastbootGetvar(name)) {
      throw new Error('ANDROID_FASTBOOT_OPERATION_DENIED');
    }
    return name.trim();
  })));
  return names;
}

