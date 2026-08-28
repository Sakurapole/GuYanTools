import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { ScrcpySessionService } from './scrcpy_service';

function createChild(pid = 1234) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

function createService(device = { serial: 'ABC', state: 'device', transport: 'adb-usb', usb: true, sdkLevel: 33 }) {
  const child = createChild();
  const spawn = vi.fn(() => child as any);
  const devices = { getDevice: vi.fn(() => device) };
  const toolchain = { getToolPath: vi.fn(() => 'C:/tools/scrcpy.exe') };
  const service = new ScrcpySessionService(toolchain as any, devices as any, { spawn });
  return { child, spawn, devices, toolchain, service };
}

describe('ScrcpySessionService', () => {
  it('starts a mirror session with explicit device and input modes', async () => {
    const { service, spawn } = createService();

    const session = await service.startMirror({ deviceSerial: 'ABC' });

    expect(spawn).toHaveBeenCalledWith('C:/tools/scrcpy.exe', [
      '--serial=ABC', '--keyboard=uhid', '--mouse=uhid',
    ], expect.objectContaining({ shell: false, windowsHide: true }));
    expect(session).toMatchObject({
      deviceSerial: 'ABC', mode: 'mirror-control', keyboard: 'uhid', mouse: 'uhid', status: 'running', pid: 1234,
    });
  });

  it('starts an audio-only session and rejects unsupported duplication', async () => {
    const { service } = createService({ serial: 'ABC', state: 'device', transport: 'adb-usb', usb: true, sdkLevel: 32 });

    await expect(service.startAudio({ deviceSerial: 'ABC' })).resolves.toMatchObject({ mode: 'audio-only' });
    await expect(service.startAudio({ deviceSerial: 'ABC', duplicateOnDevice: true }))
      .rejects.toThrow('ANDROID_AUDIO_UNSUPPORTED');
  });

  it('stops a session and emits a lifecycle event', async () => {
    const { service, child } = createService();
    const events: unknown[] = [];
    service.onSessionEvent(event => events.push(event));
    const session = await service.startMirror({ deviceSerial: 'ABC' });

    await service.stopSession(session.sessionId);

    expect(child.kill).toHaveBeenCalled();
    expect(service.listSessions()[0]).toMatchObject({ sessionId: session.sessionId, status: 'exited' });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'created' }),
      expect.objectContaining({ type: 'started' }),
      expect.objectContaining({ type: 'stopped' }),
    ]));
  });

  it('retries a failed UHID launch once with SDK input', async () => {
    const first = createChild(100);
    const second = createChild(200);
    const spawn = vi.fn()
      .mockReturnValueOnce(first as any)
      .mockReturnValueOnce(second as any);
    const service = new ScrcpySessionService(
      { getToolPath: () => 'C:/tools/scrcpy.exe' } as any,
      { getDevice: () => ({ serial: 'ABC', state: 'device', transport: 'adb-usb', usb: true, sdkLevel: 33 }) } as any,
      { spawn },
    );
    const sessionPromise = service.startMirror({ deviceSerial: 'ABC' });
    first.emit('close', 1);
    const session = await sessionPromise;

    expect(spawn).toHaveBeenNthCalledWith(2, 'C:/tools/scrcpy.exe', [
      '--serial=ABC', '--keyboard=sdk', '--mouse=sdk',
    ], expect.anything());
    expect(session).toMatchObject({ keyboard: 'uhid', mouse: 'uhid', pid: 100, status: 'running' });
    expect(service.listSessions()[0]).toMatchObject({ keyboard: 'sdk', mouse: 'sdk', pid: 200, status: 'running' });
  });

  it('requires an online device and USB transport for OTG', async () => {
    const offline = createService({ serial: 'ABC', state: 'offline', transport: 'adb-usb', usb: true });
    await expect(offline.service.startMirror({ deviceSerial: 'ABC' })).rejects.toThrow('ANDROID_DEVICE_OFFLINE');

    const tcp = createService({ serial: 'ABC', state: 'device', transport: 'adb-tcpip', usb: false });
    await expect(tcp.service.startOtg({ deviceSerial: 'ABC' })).rejects.toThrow('ANDROID_USB_CONFLICT');
  });
});
