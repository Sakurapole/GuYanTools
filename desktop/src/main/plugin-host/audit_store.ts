export interface PluginAuditEvent {
  pluginId: string;
  runtime: 'ui' | 'worker' | 'hybrid' | 'host';
  operation: string;
  result: 'allowed' | 'denied';
  at?: string;
}

export type PluginAuditPersist = (events: PluginAuditEvent[]) => Promise<void> | void;

/**
 * Buffers audit events and flushes them in batches to avoid slowing every IPC call.
 */
export class PluginAuditStore {
  private readonly buffer: PluginAuditEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly maxBufferSize = 200;
  private readonly flushIntervalMs = 2_000;
  private readonly recent: PluginAuditEvent[] = [];
  private readonly recentLimit = 200;

  constructor(private readonly persist?: PluginAuditPersist) {}

  record(event: PluginAuditEvent) {
    const normalized: PluginAuditEvent = { ...event, at: event.at ?? new Date().toISOString() };
    this.recent.push(normalized);
    if (this.recent.length > this.recentLimit) this.recent.shift();
    this.buffer.push(normalized);
    if (this.buffer.length >= this.maxBufferSize) {
      void this.flush();
      return;
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, this.flushIntervalMs);
      this.flushTimer.unref?.();
    }
  }

  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    if (!this.persist) return;
    try {
      await this.persist(batch);
    } catch (error) {
      console.error('[plugin-audit] flush failed', error);
    }
  }

  listRecent(pluginId?: string, limit = 100): PluginAuditEvent[] {
    const filtered = pluginId
      ? this.recent.filter((event) => event.pluginId === pluginId)
      : this.recent;
    return filtered.slice(-limit);
  }
}
