import { describe, expect, it } from 'vitest';
import { validateInputConfigPatch } from './ipc_guards';

describe('android input IPC validation', () => {
  it('accepts structured policy patches and validates serial ownership format', () => {
    expect(validateInputConfigPatch({ deviceSerial: 'R58M123', preserveWinKey: false })).toEqual({ deviceSerial: 'R58M123', preserveWinKey: false });
    expect(() => validateInputConfigPatch({ deviceSerial: '../adb' })).toThrow('ANDROID_DEVICE_NOT_FOUND');
  });

  it('rejects arbitrary payloads and non-boolean policies', () => {
    expect(() => validateInputConfigPatch(null)).toThrow('ANDROID_PAYLOAD_INVALID');
    expect(() => validateInputConfigPatch({ preserveAltTab: 'yes' })).toThrow('ANDROID_PAYLOAD_INVALID');
    expect(() => validateInputConfigPatch([])).toThrow('ANDROID_PAYLOAD_INVALID');
    expect(() => validateInputConfigPatch({ unexpected: true })).toThrow('ANDROID_PAYLOAD_INVALID');
    expect(() => validateInputConfigPatch({ androidWidth: 1.5 })).toThrow('ANDROID_PAYLOAD_INVALID');
  });
});
