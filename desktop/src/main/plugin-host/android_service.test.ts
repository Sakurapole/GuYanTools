import { describe, expect, it, vi } from 'vitest';
import type { AndroidDevice, AndroidSession } from '@/contracts/android-tools';
import type { PluginRuntimeContext } from '@/contracts/plugin_host';
import { AndroidHostService } from './android_service';

const device: AndroidDevice = {
  serial: 'usb-1',
  state: 'device',
  transport: 'adb-usb',
  usb: true,
  sdkLevel: 33,
};

function context(pluginId: string, permissions: PluginRuntimeContext['permissions'] = [
  'android.devices.read',
  'android.sessions.read',
  'android.sessions.control',
  'android.audio.playback',
  'android.otg.control',
  'android.fastboot.read',
  'android.fastboot.reboot',
]) {
  return {
    pluginId,
    trustLevel: 'sandboxed',
    runtime: 'worker',
    permissions,
  } satisfies PluginRuntimeContext;
}

function session(sessionId: string, ownerPluginId?: string): AndroidSession {
  return {
    sessionId,
    deviceSerial: device.serial,
    mode: 'mirror-control',
    keyboard: 'uhid',
    mouse: 'uhid',
    ownerPluginId,
    status: 'running',
    startedAt: new Date(0).toISOString(),
  };
}

function createService() {
  const sessions = [session('owned', 'plugin.one'), session('other', 'plugin.two'), session('host')];
  const sessionService = {
    startMirror: vi.fn(async (input: { deviceSerial: string }, ownerPluginId?: string) => ({
      ...session('created', ownerPluginId),
      deviceSerial: input.deviceSerial,
    })),
    startAudio: vi.fn(async (_input: { deviceSerial: string }, ownerPluginId?: string) => session('audio', ownerPluginId)),
    startOtg: vi.fn(async (_input: { deviceSerial: string }, ownerPluginId?: string) => session('otg', ownerPluginId)),
    listSessions: vi.fn(() => sessions.map(item => ({ ...item }))),
    stopSession: vi.fn(async (sessionId: string) => {
      const item = sessions.find(candidate => candidate.sessionId === sessionId);
      if (item) item.status = 'exited';
    }),
    stopSessionsForOwner: vi.fn(async (ownerPluginId: string) => {
      for (const item of sessions.filter(candidate => candidate.ownerPluginId === ownerPluginId)) item.status = 'exited';
    }),
    onSessionEvent: vi.fn<() => () => void>(() => () => undefined),
  };
  const devices = {
    listDevices: vi.fn(async () => [device]),
    onDevicesChanged: vi.fn<() => () => void>(() => () => undefined),
  };
  const fastboot = {
    listDevices: vi.fn(async () => []),
    getVars: vi.fn(async () => ({ product: 'test' })),
    reboot: vi.fn(async () => undefined),
  };
  return {
    service: new AndroidHostService({ devices, sessions: sessionService, fastboot }),
    devices,
    sessions: sessionService,
    fastboot,
  };
}

describe('AndroidHostService', () => {
  it('denies operations when the sender context has not declared the permission', async () => {
    const { service } = createService();

    await expect(service.listDevices(context('plugin.one', []))).rejects.toThrow('PLUGIN_PERMISSION_DENIED');
    await expect(service.startAudio(context('plugin.one', ['android.sessions.control']), { deviceSerial: device.serial })).rejects.toThrow('PLUGIN_PERMISSION_DENIED');
  });

  it('binds session ownership to sender context and rejects spoofed plugin ids', async () => {
    const { service, sessions } = createService();

    await expect(service.startMirror(context('plugin.one'), {
      deviceSerial: device.serial,
      pluginId: 'plugin.two',
    } as never)).rejects.toThrow('ANDROID_PAYLOAD_INVALID');

    await service.startMirror(context('plugin.one'), { deviceSerial: device.serial });

    expect(sessions.startMirror).toHaveBeenCalledWith({ deviceSerial: device.serial }, 'plugin.one');
  });

  it('only lists and stops sessions owned by the requesting plugin', async () => {
    const { service, sessions } = createService();

    await expect(service.listSessions(context('plugin.one'))).resolves.toEqual([expect.objectContaining({ sessionId: 'owned' })]);
    await expect(service.stop(context('plugin.one'), 'other')).rejects.toThrow('PLUGIN_OWNER_MISMATCH');
    await service.stop(context('plugin.one'), 'owned');
    expect(sessions.stopSession).toHaveBeenCalledWith('owned');
  });

  it('exposes only structured fastboot operations and rejects arbitrary arguments', async () => {
    const { service, fastboot } = createService();

    await service.getFastbootDevices(context('plugin.one'));
    await service.getFastbootVars(context('plugin.one'), 'usb-1', ['product']);
    await service.fastbootReboot(context('plugin.one'), 'usb-1', 'system');
    expect(fastboot.listDevices).toHaveBeenCalledOnce();
    expect(fastboot.getVars).toHaveBeenCalledWith('usb-1', ['product']);
    expect(fastboot.reboot).toHaveBeenCalledWith('usb-1', 'system');
    await expect(service.startMirror(context('plugin.one'), {
      deviceSerial: device.serial,
      argv: ['fastboot', 'flash', 'boot', 'evil.img'],
    } as never)).rejects.toThrow('ANDROID_PAYLOAD_INVALID');
  });

  it('cleans up all sessions for an owner when the plugin is disabled', async () => {
    const { service, sessions } = createService();

    await service.stopSessionsForOwner('plugin.one');
    expect(sessions.stopSessionsForOwner).toHaveBeenCalledWith('plugin.one');
  });
});
