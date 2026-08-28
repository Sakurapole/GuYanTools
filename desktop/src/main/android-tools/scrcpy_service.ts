import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { AndroidDevice, AndroidSession, AndroidSessionEvent } from '@/contracts/android-tools';
import type { AdbDeviceService } from './adb_service';
import type { AndroidToolchainManager } from './toolchain';
import { buildAudioArgs, buildMirrorArgs, buildOtgArgs } from './scrcpy_args';

interface ScrcpyChild {
  pid?: number;
  stdout: EventEmitter;
  stderr: EventEmitter;
  on: (event: string, listener: (...args: any[]) => void) => ScrcpyChild;
  kill: (signal?: NodeJS.Signals | number) => boolean;
}

interface ScrcpySessionServiceOptions {
  spawn?: (file: string, args: string[], options: {
    shell: false;
    windowsHide: boolean;
    detached: boolean;
    stdio: ['ignore', 'pipe', 'pipe'];
  }) => ScrcpyChild;
}

type SessionInput = { deviceSerial: string };

function assertDevice(device: AndroidDevice | null): asserts device is AndroidDevice {
  if (!device) throw new Error('ANDROID_DEVICE_NOT_FOUND');
  if (device.state === 'unauthorized') throw new Error('ANDROID_DEVICE_UNAUTHORIZED');
  if (device.state === 'offline') throw new Error('ANDROID_DEVICE_OFFLINE');
  if (device.state !== 'device') throw new Error('ANDROID_DEVICE_NOT_FOUND');
}

export class ScrcpySessionService {
  private readonly toolchain: AndroidToolchainManager;
  private readonly devices: AdbDeviceService;
  private readonly spawnProcess: NonNullable<ScrcpySessionServiceOptions['spawn']>;
  private readonly sessions = new Map<string, AndroidSession>();
  private readonly children = new Map<string, ScrcpyChild>();
  private readonly fallbackUsed = new Set<string>();
  private readonly emitter = new EventEmitter();

  constructor(toolchain: AndroidToolchainManager, devices: AdbDeviceService, options: ScrcpySessionServiceOptions = {}) {
    this.toolchain = toolchain;
    this.devices = devices;
    this.spawnProcess = options.spawn ?? ((file, args, spawnOptions) => nodeSpawn(file, args, spawnOptions));
  }

  async startMirror(
    input: SessionInput & { keyboard?: 'uhid' | 'sdk'; mouse?: 'uhid' | 'sdk' },
    ownerPluginId?: string,
  ) {
    const device = this.devices.getDevice(input.deviceSerial);
    assertDevice(device);
    const args = buildMirrorArgs(input);
    return this.startProcess({
      deviceSerial: device.serial,
      mode: 'mirror-control',
      keyboard: input.keyboard ?? 'uhid',
      mouse: input.mouse ?? 'uhid',
      args,
      ownerPluginId,
      allowUhidFallback: (input.keyboard ?? 'uhid') === 'uhid' && (input.mouse ?? 'uhid') === 'uhid',
    });
  }

  async startAudio(input: SessionInput & { duplicateOnDevice?: boolean }, ownerPluginId?: string) {
    const device = this.devices.getDevice(input.deviceSerial);
    assertDevice(device);
    if (device.sdkLevel !== undefined && device.sdkLevel < 30) {
      throw new Error('ANDROID_AUDIO_UNSUPPORTED');
    }
    const args = buildAudioArgs({ deviceSerial: device.serial, sdkLevel: device.sdkLevel, duplicateOnDevice: input.duplicateOnDevice });
    return this.startProcess({
      deviceSerial: device.serial,
      mode: 'audio-only',
      keyboard: 'disabled',
      mouse: 'disabled',
      args,
      ownerPluginId,
      allowUhidFallback: false,
    });
  }

  async startOtg(input: SessionInput & { keyboard?: boolean; mouse?: boolean }, ownerPluginId?: string) {
    const device = this.devices.getDevice(input.deviceSerial);
    assertDevice(device);
    if (device.usb !== true || device.transport !== 'adb-usb') {
      throw new Error('ANDROID_USB_CONFLICT');
    }
    return this.startProcess({
      deviceSerial: device.serial,
      mode: 'otg',
      keyboard: input.keyboard === false ? 'disabled' : 'aoa',
      mouse: input.mouse === false ? 'disabled' : 'aoa',
      args: buildOtgArgs(input),
      ownerPluginId,
      allowUhidFallback: false,
    });
  }

  listSessions() {
    return Array.from(this.sessions.values()).map(session => ({ ...session }));
  }

  onSessionEvent(listener: (event: AndroidSessionEvent) => void) {
    this.emitter.on('session', listener);
    return () => this.emitter.off('session', listener);
  }

  async stopSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('ANDROID_SESSION_NOT_FOUND');
    if (session.status === 'exited' || session.status === 'failed') return;
    session.status = 'stopping';
    this.emit('stopped', session);
    this.children.get(sessionId)?.kill();
    this.children.delete(sessionId);
    session.status = 'exited';
    this.emit('exited', session);
  }

  async stopSessionsForOwner(ownerPluginId: string) {
    const owned = this.listSessions().filter(session => session.ownerPluginId === ownerPluginId);
    await Promise.all(owned.map(session => this.stopSession(session.sessionId)));
  }

  async dispose() {
    await Promise.all(this.listSessions().map(session => this.stopSession(session.sessionId)));
    this.emitter.removeAllListeners();
  }

  private async startProcess(input: {
    deviceSerial: string;
    mode: AndroidSession['mode'];
    keyboard: AndroidSession['keyboard'];
    mouse: AndroidSession['mouse'];
    args: string[];
    ownerPluginId?: string;
    allowUhidFallback: boolean;
  }) {
    const session: AndroidSession = {
      sessionId: crypto.randomUUID(),
      deviceSerial: input.deviceSerial,
      mode: input.mode,
      keyboard: input.keyboard,
      mouse: input.mouse,
      ownerPluginId: input.ownerPluginId,
      status: 'starting',
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(session.sessionId, session);
    this.emit('created', session);
    this.spawnForSession(session, input.args, input.allowUhidFallback);
    session.status = 'running';
    this.emit('started', session);
    return { ...session };
  }

  private spawnForSession(session: AndroidSession, args: string[], allowUhidFallback: boolean) {
    const child = this.spawnProcess(this.toolchain.getToolPath('scrcpy'), args, {
      shell: false,
      windowsHide: true,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.children.set(session.sessionId, child);
    session.pid = child.pid;
    child.stdout.on('data', () => undefined);
    child.stderr.on('data', () => undefined);
    child.on('error', (error: Error) => this.handleExit(session, 1, error.message, allowUhidFallback));
    child.on('close', (code: number | null) => this.handleExit(session, code ?? 1, undefined, allowUhidFallback));
  }

  private handleExit(session: AndroidSession, code: number, message: string | undefined, allowUhidFallback: boolean) {
    if (!this.sessions.has(session.sessionId) || session.status === 'exited') return;
    this.children.delete(session.sessionId);
    if (code !== 0 && allowUhidFallback && !this.fallbackUsed.has(session.sessionId)) {
      this.fallbackUsed.add(session.sessionId);
      session.keyboard = 'sdk';
      session.mouse = 'sdk';
      this.spawnForSession(session, buildMirrorArgs({ deviceSerial: session.deviceSerial, keyboard: 'sdk', mouse: 'sdk' }), false);
      session.status = 'running';
      this.emit('started', session);
      return;
    }

    session.status = code === 0 ? 'exited' : 'failed';
    session.errorCode = code === 0 ? undefined : 'ANDROID_SESSION_EXITED';
    session.errorMessage = message;
    this.emit(code === 0 ? 'exited' : 'failed', session);
  }

  private emit(type: AndroidSessionEvent['type'], session: AndroidSession) {
    this.emitter.emit('session', {
      type,
      session: { ...session },
      timestamp: new Date().toISOString(),
    } satisfies AndroidSessionEvent);
  }
}
