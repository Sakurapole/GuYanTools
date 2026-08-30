import { app, utilityProcess, type UtilityProcess } from 'electron';
import path from 'node:path';
import type { SyncEvent } from '@/contracts/sync';

type WorkerResponse = {
  id?: number;
  result?: unknown;
  error?: string;
  event?: SyncEvent;
};
type PendingCall = { resolve: (value: unknown) => void; reject: (error: Error) => void };

class SyncWorkerClient {
  private process: UtilityProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingCall>();
  private readonly listeners = new Set<(event: SyncEvent) => void>();
  private startup: Promise<void> | null = null;

  subscribe(listener: (event: SyncEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async call<T>(method: string, ...args: unknown[]): Promise<T> {
    await this.ensureStarted();
    const worker = this.process;
    if (!worker) throw new Error('同步 utility process 未启动');
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage({ id, method, args });
    });
  }

  dispose() {
    for (const pending of this.pending.values()) pending.reject(new Error('同步 utility process 已退出'));
    this.pending.clear();
    this.process?.kill();
    this.process = null;
    this.startup = null;
  }

  private async ensureStarted() {
    if (this.process) return;
    if (this.startup) return this.startup;
    this.startup = new Promise<void>((resolve, reject) => {
      const workerPath = path.join(__dirname, 'sync-worker.js');
      const worker = utilityProcess.fork(workerPath, [], {
        serviceName: 'GuYanTools Sync',
        env: {
          ...process.env,
          GUYANTOOLS_USER_DATA: app.getPath('userData'),
          GUYANTOOLS_DB_PATH: path.join(app.getPath('userData'), 'guyantools.db'),
          GUYANTOOLS_APP_VERSION: app.getVersion(),
        },
      });
      this.process = worker;
      worker.on('message', (message: WorkerResponse) => this.handleMessage(message));
      worker.once('spawn', () => resolve());
      worker.once('exit', (code) => {
        const error = new Error(`同步 utility process 已退出 (${code ?? 'unknown'})`);
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        this.process = null;
        this.startup = null;
        if (!this.process) reject(error);
      });
      worker.once('error', reject);
    });
    try {
      await this.startup;
    } finally {
      this.startup = null;
    }
  }

  private handleMessage(message: WorkerResponse) {
    if (message.event) {
      for (const listener of this.listeners) listener(message.event);
      return;
    }
    if (typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  }
}

export const syncWorkerClient = new SyncWorkerClient();
