import { describe, expect, it } from 'vitest';
import { buildFastbootDevicesArgs, buildFastbootGetvarArgs, buildFastbootRebootArgs } from './fastboot_args';

describe('fastboot argument builders', () => {
  it('builds the device listing command', () => {
    expect(buildFastbootDevicesArgs()).toEqual(['devices', '-l']);
  });

  it('allows only the read-only bootloader variables', () => {
    expect(buildFastbootGetvarArgs('product')).toEqual(['getvar', 'product']);
    expect(buildFastbootGetvarArgs('current-slot')).toEqual(['getvar', 'current-slot']);
    expect(() => buildFastbootGetvarArgs('all')).toThrow('ANDROID_FASTBOOT_OPERATION_DENIED');
  });

  it('builds reboot commands without accepting arbitrary arguments', () => {
    expect(buildFastbootRebootArgs()).toEqual(['reboot']);
    expect(buildFastbootRebootArgs('bootloader')).toEqual(['reboot', 'bootloader']);
    expect(() => buildFastbootRebootArgs('recovery' as any)).toThrow('ANDROID_FASTBOOT_OPERATION_DENIED');
  });
});
