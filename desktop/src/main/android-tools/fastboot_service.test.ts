import { describe, expect, it, vi } from 'vitest';
import { FastbootService } from './fastboot_service';

function createService(responses: Array<{ stdout: string; stderr: string }>) {
  const execute = vi.fn(async (_args: string[]) => responses.shift() ?? { stdout: '', stderr: '' });
  const toolchain = { getToolPath: vi.fn(() => 'C:/tools/fastboot.exe') };
  return { execute, service: new FastbootService(toolchain as any, { execute }) };
}

describe('FastbootService', () => {
  it('lists bootloader devices from fastboot output', async () => {
    const { service } = createService([{ stdout: 'ABC\tfastboot\nDEF\tfastboot usb:1-2\n', stderr: '' }]);

    await expect(service.listDevices()).resolves.toEqual([
      { serial: 'ABC', state: 'bootloader', transport: 'fastboot-usb', usb: true },
      { serial: 'DEF', state: 'bootloader', transport: 'fastboot-usb', usb: true },
    ]);
  });

  it('reads allowlisted variables from fastboot stderr', async () => {
    const { service, execute } = createService([
      { stdout: 'ABC\tfastboot\n', stderr: '' },
      { stdout: '', stderr: '(bootloader) product: Pixel 8\n(bootloader) current-slot: a\nFinished. Total time: 0.001s\n' },
      { stdout: '', stderr: '(bootloader) secure: yes\nFinished. Total time: 0.001s\n' },
    ]);

    await expect(service.getVars('ABC', ['product', 'current-slot', 'secure'])).resolves.toEqual({
      product: 'Pixel 8', 'current-slot': 'a', secure: 'yes',
    });
    expect(execute).toHaveBeenNthCalledWith(2, ['getvar', 'product']);
  });

  it('rejects variables and reboot requests when the serial is not in bootloader mode', async () => {
    const { service } = createService([{ stdout: '', stderr: '' }]);

    await expect(service.getVars('missing', ['product'])).rejects.toThrow('ANDROID_FASTBOOT_REQUIRED');
    await expect(service.reboot('missing', 'bootloader')).rejects.toThrow('ANDROID_FASTBOOT_REQUIRED');
  });

  it('reboots a selected bootloader device with a fixed command', async () => {
    const { service, execute } = createService([
      { stdout: 'ABC\tfastboot\n', stderr: '' },
      { stdout: '', stderr: 'Finished. Total time: 0.1s\n' },
    ]);

    await service.reboot('ABC', 'bootloader');

    expect(execute).toHaveBeenNthCalledWith(2, ['reboot', 'bootloader']);
  });
});
