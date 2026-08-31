import { spawn as nodeSpawn } from 'node:child_process';
import crypto from 'node:crypto';
import type { AndroidToolchainManager } from './toolchain';

export interface KeyboardReport { modifiers: number; keys: number[] }
export interface MouseReport { buttons: number; dx: number; dy: number; wheel: number }
export interface AndroidUhidSessionOptions {
  spawn?: (file: string, args: string[], options: { windowsHide: boolean; stdio: ['ignore', 'pipe', 'pipe'] }) => UhidChild;
}
interface UhidChild { stdin?: { write(data: string): boolean; end(): void }; stdout?: NodeJS.EventEmitter; stderr?: NodeJS.EventEmitter; on(event: string, listener: (...args: any[]) => void): UhidChild; kill(): boolean; }

export class AndroidUhidSession {
  private child: UhidChild | null = null;
  private serial = '';
  private readonly spawnProcess: NonNullable<AndroidUhidSessionOptions['spawn']>;
  private stderr = '';

  constructor(private readonly toolchain: AndroidToolchainManager, options: AndroidUhidSessionOptions = {}) {
    this.spawnProcess = options.spawn ?? ((file, args, spawnOptions) => nodeSpawn(file, args, spawnOptions) as unknown as UhidChild);
  }

  async start(deviceSerial: string): Promise<{ sessionId: string }> {
    if (this.child) throw new Error('ANDROID_UHID_START_FAILED');
    if (!/^[A-Za-z0-9._:-]+$/.test(deviceSerial)) throw new Error('ANDROID_UHID_START_FAILED');
    const servicePath = this.toolchain.getInputServicePath();
    const remotePath = `/data/local/tmp/guyantools-uhid-${crypto.randomUUID()}.bin`;
    try {
      await this.toolchain.executeAdb(['-s', deviceSerial, 'push', servicePath, remotePath]);
      const child = this.spawnProcess(this.toolchain.getToolPath('adb'), ['-s', deviceSerial, 'shell', remotePath], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;
      this.serial = deviceSerial;
      this.stderr = '';
      child.stderr?.on('data', (chunk: Buffer | string) => { this.stderr = `${this.stderr}${chunk}`.replace(/[\r\n]+/g, ' ').slice(-512); });
      child.on('close', () => { this.child = null; });
      child.on('error', () => { this.child = null; });
      return { sessionId: crypto.randomUUID() };
    } catch (error) {
      this.child?.kill();
      this.child = null;
      throw new Error(`ANDROID_UHID_START_FAILED: ${sanitizeError(error)}${this.stderr ? ` (${this.stderr})` : ''}`);
    }
  }

  sendKeyboardReport(report: KeyboardReport) { this.write({ type: 'keyboard', report }); }
  sendMouseReport(report: MouseReport) { this.write({ type: 'mouse', report }); }

  async stop() {
    const child = this.child;
    this.child = null;
    if (!child) return;
    child.stdin?.end();
    child.kill();
    if (this.serial) {
      try { await this.toolchain.executeAdb(['-s', this.serial, 'shell', 'rm', '-f', '/data/local/tmp/guyantools-uhid-*']); } catch { /* cleanup is best effort */ }
    }
    this.serial = '';
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
  if (value.type === 'mouse') return [value.report?.buttons, value.report?.dx, value.report?.dy, value.report?.wheel].every((item: unknown) => Number.isInteger(item));
  return false;
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 512);
}
