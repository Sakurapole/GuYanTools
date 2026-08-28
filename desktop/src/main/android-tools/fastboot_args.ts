const ALLOWED_GETVARS = new Set([
  'product',
  'unlocked',
  'current-slot',
  'slot-count',
  'slot-successful',
  'slot-unbootable',
  'secure',
  'version',
  'serialno',
]);

export type FastbootRebootTarget = 'system' | 'bootloader';

export function buildFastbootDevicesArgs() {
  return ['devices', '-l'];
}

export function buildFastbootGetvarArgs(name: string) {
  const normalized = name.trim();
  if (!ALLOWED_GETVARS.has(normalized)) {
    throw new Error('ANDROID_FASTBOOT_OPERATION_DENIED');
  }
  return ['getvar', normalized];
}

export function buildFastbootRebootArgs(target?: FastbootRebootTarget) {
  if (target === undefined || target === 'system') return ['reboot'];
  if (target === 'bootloader') return ['reboot', 'bootloader'];
  throw new Error('ANDROID_FASTBOOT_OPERATION_DENIED');
}

export function isAllowedFastbootGetvar(name: string) {
  return ALLOWED_GETVARS.has(name.trim());
}

