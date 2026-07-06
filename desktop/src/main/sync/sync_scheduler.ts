import { syncService } from './sync_service';

const STARTUP_DELAY_MS = 8_000;
const DEFAULT_INTERVAL_MS = 90_000;
const CHANGE_DEBOUNCE_MS = 4_000;
const MAX_BACKOFF_MS = 10 * 60_000;

class SyncScheduler {
  private started = false;
  private interval: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private running = false;
  private failureCount = 0;
  private backoffUntil = 0;

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    await syncService.initialize({
      requestAutoSync: () => this.requestSoon(),
    });
    this.startupTimer = setTimeout(() => {
      void this.run('startup');
    }, STARTUP_DELAY_MS);
    this.interval = setInterval(() => {
      void this.run('interval');
    }, DEFAULT_INTERVAL_MS);
  }

  stop(): void {
    this.started = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  requestSoon(): void {
    if (!this.started) {
      return;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.run('change');
    }, CHANGE_DEBOUNCE_MS);
  }

  private async run(reason: 'startup' | 'interval' | 'change'): Promise<void> {
    if (!this.started || this.running || Date.now() < this.backoffUntil) {
      return;
    }
    this.running = true;
    try {
      await syncService.syncNow();
      this.failureCount = 0;
      this.backoffUntil = 0;
    } catch (error) {
      this.failureCount += 1;
      const backoff = Math.min(2 ** Math.min(this.failureCount, 6) * 5_000, MAX_BACKOFF_MS);
      this.backoffUntil = Date.now() + backoff;
      console.warn(`[sync] ${reason} sync failed, backing off ${backoff}ms`, error);
    } finally {
      this.running = false;
    }
  }
}

export const syncScheduler = new SyncScheduler();
