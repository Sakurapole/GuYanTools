/**
 * Compatibility facade kept for integrations that imported the old scheduler.
 * Synchronization is now manual-only and strictly user initiated through sync IPC; this class
 * deliberately contains no timers, startup hooks, or configuration watchers.
 */
export class SyncScheduler {
  async start(): Promise<void> {
    return;
  }

  stop(): void {
    return;
  }
}

export const syncScheduler = new SyncScheduler();
