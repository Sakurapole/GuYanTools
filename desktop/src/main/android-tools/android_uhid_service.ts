import { spawn as nodeSpawn } from 'node:child_process';
import crypto from 'node:crypto';
import type { AndroidToolchainManager } from './toolchain';

export interface KeyboardReport { modifiers: number; keys: number[] }
export interface MouseReport { buttons: number; dx: number; dy: number; wheel: number }
export interface AndroidUhidSessionOptions {
  spawn?: (file: string, args: string[], options: { windowsHide: boolean; stdio: ['pipe', 'pipe', 'pipe'] }) => UhidChild;
}
interface UhidChild { stdin?: { write(data: string): boolean; end(): void }; stdout?: NodeJS.EventEmitter; stderr?: NodeJS.EventEmitter; on(event: string, listener: (...args: any[]) => void): UhidChild; kill(): boolean; }

export class AndroidUhidSession {
  private child: UhidChild | null = null;
  private serial = '';
  private remotePath = '';
  private readonly spawnProcess: NonNullable<AndroidUhidSessionOptions['spawn']>;
  private stderr = '';
  private readonly disconnectListeners = new Set<() => void>();

  onDisconnected(listener: () => void) { this.disconnectListeners.add(listener); return () => this.disconnectListeners.delete(listener); }

  constructor(private readonly toolchain: AndroidToolchainManager, options: AndroidUhidSessionOptions = {}) {
    this.spawnProcess = options.spawn ?? ((file, args, spawnOptions) => nodeSpawn(file, args, spawnOptions) as unknown as UhidChild);
  }

  async start(deviceSerial: string): Promise<{ sessionId: string }> {
    if (this.child) throw new Error('ANDROID_UHID_START_FAILED');
    if (!/^[A-Za-z0-9._:-]+$/.test(deviceSerial)) throw new Error('ANDROID_UHID_START_FAILED');
    const servicePath = this.toolchain.getInputServicePath();
    const remotePath = `/data/local/tmp/guyantools-uhid-${crypto.randomUUID()}.bin`;
    let pushed = false;
    try {
      await this.toolchain.executeAdb(['-s', deviceSerial, 'push', servicePath, remotePath]);
      pushed = true;
      await this.toolchain.executeAdb(['-s', deviceSerial, 'shell', 'chmod', '700', remotePath]);
      const child = this.spawnProcess(this.toolchain.getToolPath('adb'), ['-s', deviceSerial, 'shell', remotePath], {
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.child = child;
      this.serial = deviceSerial;
      this.remotePath = remotePath;
      this.stderr = '';
      child.stderr?.on('data', (chunk: Buffer | string) => { this.stderr = `${this.stderr}${chunk}`.replace(/[\r\n]+/g, ' ').slice(-512); });
      const ready = await this.waitForReady(child);
      if (!ready) throw new Error(this.stderr || 'ANDROID_UHID_START_FAILED');
      child.on('close', () => {
        if (this.child !== child) return;
        this.child = null;
        for (const listener of this.disconnectListeners) listener();
      });
      child.on('error', () => {
        if (this.child !== child) return;
        this.child = null;
        for (const listener of this.disconnectListeners) listener();
      });
      return { sessionId: crypto.randomUUID() };
    } catch (error) {
      this.child?.kill();
      this.child = null;
      if (pushed) {
        try { await this.toolchain.executeAdb(['-s', deviceSerial, 'shell', 'rm', '-f', remotePath]); } catch { /* best effort */ }
      }
      throw new Error(`ANDROID_UHID_START_FAILED: ${sanitizeError(error)}${this.stderr ? ` (${this.stderr})` : ''}`);
    }
  }

  private waitForReady(child: UhidChild): Promise<boolean> {
    if (!child.stdout) return Promise.resolve(true);
    return new Promise(resolve => {
      let buffer = '';
      let settled = false;
      const finish = (value: boolean) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => finish(false), 5000);
      child.stdout?.on('data', (chunk: Buffer | string) => {
        buffer += chunk.toString();
        if (buffer.split(/\r?\n/).some(line => line.trim() === 'READY')) finish(true);
      });
      child.on('close', () => finish(false));
      child.on('error', () => finish(false));
    });
  }

  sendKeyboardReport(report: KeyboardReport) { this.write({ type: 'keyboard', report }); }
  sendMouseReport(report: MouseReport) { this.write({ type: 'mouse', report }); }

  async stop() {
    const child = this.child;
    this.child = null;
    child?.stdin?.end();
    child?.kill();
    if (this.serial) {
      try { await this.toolchain.executeAdb(['-s', this.serial, 'shell', 'rm', '-f', this.remotePath]); } catch { /* cleanup is best effort */ }
    }
    this.serial = '';
    this.remotePath = '';
  }

  private write(message: unknown) {
    if (!this.child?.stdin) throw new Error('ANDROID_UHID_DISCONNECTED');
    const payload = JSON.stringify(message);
    if (payload.length > 4096 || !isValidReport(message) || !this.child.stdin.write(`${payload}\n`)) throw new Error('ANDROID_UHID_PROTOCOL_ERROR');
  }
}

function isValidReport(message: unknown) {
  if (!message || typeof message !== 'object') return false;
  const value = message as { type?: unknown; report?: any };
  if (value.type === 'keyboard') return Number.isInteger(value.report?.modifiers) && Array.isArray(value.report?.keys) && value.report.keys.length <= 6 && value.report.keys.every((key: unknown) => Number.isInteger(key) && Number(key) >= 0 && Number(key) <= 255);
  if (value.type === 'mouse') return Number.isInteger(value.report?.buttons) && Number(value.report.buttons) >= 0 && Number(value.report.buttons) <= 31
    && [value.report?.dx, value.report?.dy, value.report?.wheel].every((item: unknown) => Number.isInteger(item) && Number(item) >= -127 && Number(item) <= 127);
  return false;
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 512);
}
