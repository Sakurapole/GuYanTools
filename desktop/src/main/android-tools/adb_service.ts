import { execFile as nodeExecFile, spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import type { AndroidDevice, AndroidDeviceEvent } from '@/contracts/android-tools';
import { parseAdbDevices } from './adb_parser';
import type { AndroidToolchainManager } from './toolchain';

const execFile = promisify(nodeExecFile);

type Execute = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

interface TrackerProcess {
  stdout: EventEmitter;
  stderr?: EventEmitter;
  on: (event: string, listener: (...args: any[]) => void) => TrackerProcess;
  kill: () => boolean | void;
}

interface AdbDeviceServiceOptions {
  execute?: Execute;
  spawn?: (file: string, args: string[], options: { windowsHide: boolean; stdio: ['ignore', 'pipe', 'pipe'] }) => TrackerProcess;
}

function sameDevices(left: AndroidDevice[], right: AndroidDevice[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class AdbDeviceService {
  private readonly toolchain: AndroidToolchainManager;
  private readonly executeCommand: Execute;
  private readonly spawnTracker: NonNullable<AdbDeviceServiceOptions['spawn']>;
  private readonly emitter = new EventEmitter();
  private devices: AndroidDevice[] = [];
  private tracker: TrackerProcess | null = null;
  private trackBuffer = '';
  private disposed = false;

  constructor(toolchain: AndroidToolchainManager, options: AdbDeviceServiceOptions = {}) {
    this.toolchain = toolchain;
    this.executeCommand = options.execute ?? (async args => {
      const result = await execFile(this.toolchain.getToolPath('adb'), args, {
        windowsHide: true,
        maxBuffer: 512 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    });
    this.spawnTracker = options.spawn ?? ((file, args, spawnOptions) => nodeSpawn(file, args, spawnOptions));
  }

  async initialize() {
    if (this.disposed) throw new Error('ANDROID_SERVICE_DISPOSED');
    await this.executeCommand(['start-server']);
  }

  async listDevices() {
    if (this.disposed) throw new Error('ANDROID_SERVICE_DISPOSED');
    const result = await this.executeCommand(['devices', '-l']);
    const next = parseAdbDevices(result.stdout);
    this.setDevices(next);
    return next;
  }

  getDevice(serial: string) {
    return this.devices.find(device => device.serial === serial) ?? null;
  }

  onDevicesChanged(listener: (event: AndroidDeviceEvent) => void) {
    this.emitter.on('devices-changed', listener);
    this.startTracking();
    return () => this.emitter.off('devices-changed', listener);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.tracker?.kill();
    this.tracker = null;
    this.trackBuffer = '';
    this.emitter.removeAllListeners();
  }

  private startTracking() {
    if (this.tracker || this.disposed) return;
    this.tracker = this.spawnTracker(this.toolchain.getToolPath('adb'), ['track-devices'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.tracker.stdout.on('data', (chunk: Buffer | string) => this.consumeTrackData(chunk.toString()));
    this.tracker.on('close', () => {
      this.tracker = null;
      this.trackBuffer = '';
    });
    this.tracker.on('error', () => {
      this.tracker = null;
      this.trackBuffer = '';
    });
  }

  private consumeTrackData(data: string) {
    this.trackBuffer += data;
    while (this.trackBuffer.length > 0) {
      const lengthPrefix = this.trackBuffer.match(/^([0-9a-fA-F]{4})/);
      if (lengthPrefix) {
        const frameLength = Number.parseInt(lengthPrefix[1], 16);
        if (this.trackBuffer.length < 4 + frameLength) return;
        const frame = this.trackBuffer.slice(4, 4 + frameLength);
        this.trackBuffer = this.trackBuffer.slice(4 + frameLength);
        this.emitSnapshot(frame);
        continue;
      }

      const frame = this.trackBuffer;
      this.trackBuffer = '';
      this.emitSnapshot(frame);
    }
  }

  private emitSnapshot(output: string) {
    const next = parseAdbDevices(output);
    this.setDevices(next);
  }

  private setDevices(next: AndroidDevice[]) {
    if (sameDevices(this.devices, next)) return;
    this.devices = next;
    const event: AndroidDeviceEvent = { devices: next, timestamp: new Date().toISOString() };
    this.emitter.emit('devices-changed', event);
  }
}

