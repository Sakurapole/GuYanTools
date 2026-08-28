import { isAllowedFastbootGetvar } from './fastboot_args';

export function validateDeviceSerial(value: unknown) {
  if (typeof value !== 'string') throw new Error('ANDROID_DEVICE_NOT_FOUND');
  const serial = value.trim();
  if (!serial || serial.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(serial)) {
    throw new Error('ANDROID_DEVICE_NOT_FOUND');
  }
  return serial;
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

