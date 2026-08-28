import { describe, expect, it } from 'vitest';
import { validateDeviceSerial, validateFastbootVarNames, validateSessionId } from './ipc_guards';

describe('android IPC payload guards', () => {
  it('accepts a serial from the device protocol and rejects command injection text', () => {
    expect(validateDeviceSerial('R58M1234567')).toBe('R58M1234567');
    expect(() => validateDeviceSerial('ABC\r\nadb shell rm -rf')).toThrow('ANDROID_DEVICE_NOT_FOUND');
    expect(() => validateDeviceSerial('')).toThrow('ANDROID_DEVICE_NOT_FOUND');
  });

  it('validates session ids without accepting arbitrary paths or command strings', () => {
    expect(validateSessionId('session-123')).toBe('session-123');
    expect(() => validateSessionId('../adb')).toThrow('ANDROID_SESSION_NOT_FOUND');
  });

  it('restricts fastboot variables to the read-only allowlist', () => {
    expect(validateFastbootVarNames(['product', 'current-slot'])).toEqual(['product', 'current-slot']);
    expect(() => validateFastbootVarNames(['all'])).toThrow('ANDROID_FASTBOOT_OPERATION_DENIED');
  });
});
