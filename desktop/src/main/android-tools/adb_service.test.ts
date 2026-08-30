import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { AdbDeviceService } from './adb_service';

function createToolchain() {
  return {
    getToolPath: vi.fn(() => 'C:/tools/adb.exe'),
  } as any;
}

function createTracker() {
  const tracker = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
  tracker.stdout = new EventEmitter();
  tracker.stderr = new EventEmitter();
  tracker.kill = vi.fn();
  return tracker;
}

describe('AdbDeviceService', () => {
  it('starts the adb server and returns the current device snapshot', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({
        stdout: 'List of devices attached\nABC\tdevice usb:1-1 model:Pixel_8\n',
        stderr: '',
      });
    const service = new AdbDeviceService(createToolchain(), { execute });

    await service.initialize();

    expect(execute).toHaveBeenNthCalledWith(1, ['start-server']);
    await expect(service.listDevices()).resolves.toEqual([
      { serial: 'ABC', state: 'device', transport: 'adb-usb', model: 'Pixel 8', usb: true },
    ]);
  });

  it('retries device enumeration while adb is still warming up', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'List of devices attached\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'List of devices attached\nABC\tdevice usb:1-1 model:Pixel_8\n', stderr: '' });
    const service = new AdbDeviceService(createToolchain(), { execute });

    await service.initialize();
    await expect(service.listDevices()).resolves.toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('emits changed snapshots from track-devices and stops tracking on dispose', async () => {
    const tracker = createTracker();
    const execute = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const service = new AdbDeviceService(createToolchain(), {
      execute,
      spawn: vi.fn(() => tracker as any),
    });
    const listener = vi.fn();

    service.onDevicesChanged(listener);
    tracker.stdout.emit('data', Buffer.from('List of devices attached\nXYZ\tunauthorized usb:2-1\n'));
    await Promise.resolve();

    expect(listener).toHaveBeenCalledWith({
      devices: [{ serial: 'XYZ', state: 'unauthorized', transport: 'adb-usb', usb: true }],
      timestamp: expect.any(String),
    });

    service.dispose();
    expect(tracker.kill).toHaveBeenCalled();
  });

  it('removes listeners without stopping a tracker used by other consumers', () => {
    const tracker = createTracker();
    const service = new AdbDeviceService(createToolchain(), {
      execute: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      spawn: vi.fn(() => tracker as any),
    });
    const unsubscribe = service.onDevicesChanged(() => undefined);

    unsubscribe();

    expect(tracker.kill).not.toHaveBeenCalled();
    service.dispose();
  });
});
