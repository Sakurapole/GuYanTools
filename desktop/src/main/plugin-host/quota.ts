export interface QuotaDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
}

export interface PluginQuotaLimits {
  networkConcurrency: number;
  networkResponseBytes: number;
  networkRequestsPerMinute: number;
  storageBytes: number;
  jobConcurrency: number;
  logsPerMinute: number;
}

export const DEFAULT_PLUGIN_QUOTA_LIMITS: PluginQuotaLimits = {
  networkConcurrency: 4,
  networkResponseBytes: 8 * 1024 * 1024,
  networkRequestsPerMinute: 120,
  storageBytes: 5 * 1024 * 1024,
  jobConcurrency: 3,
  logsPerMinute: 100,
};

/** Absolute ceiling even if a plugin requests a larger response budget. */
export const NETWORK_RESPONSE_HARD_CAP_BYTES = 32 * 1024 * 1024;

type WindowCounter = { windowStart: number; count: number };

export class PluginQuotaService {
  private readonly limits: PluginQuotaLimits;
  private readonly networkInFlight = new Map<string, number>();
  private readonly networkWindows = new Map<string, WindowCounter>();
  private readonly logWindows = new Map<string, WindowCounter>();
  private readonly jobCounts = new Map<string, number>();

  constructor(limits: Partial<PluginQuotaLimits> = {}) {
    this.limits = { ...DEFAULT_PLUGIN_QUOTA_LIMITS, ...limits };
  }

  getLimits(): PluginQuotaLimits {
    return { ...this.limits };
  }

  clampNetworkResponseBytes(requested?: number): number {
    const fallback = this.limits.networkResponseBytes;
    const value = typeof requested === 'number' && requested > 0 ? requested : fallback;
    return Math.min(value, NETWORK_RESPONSE_HARD_CAP_BYTES);
  }

  async acquireNetworkSlot(pluginId: string): Promise<QuotaDecision> {
    if (!this.hitWindow(this.networkWindows, pluginId, this.limits.networkRequestsPerMinute, Date.now())) {
      return { allowed: false, remaining: 0, limit: this.limits.networkRequestsPerMinute };
    }
    const current = this.networkInFlight.get(pluginId) ?? 0;
    if (current >= this.limits.networkConcurrency) {
      return { allowed: false, remaining: 0, limit: this.limits.networkConcurrency };
    }
    this.networkInFlight.set(pluginId, current + 1);
    return { allowed: true, remaining: this.limits.networkConcurrency - current - 1, limit: this.limits.networkConcurrency };
  }

  releaseNetworkSlot(pluginId: string) {
    const current = this.networkInFlight.get(pluginId) ?? 0;
    if (current <= 1) this.networkInFlight.delete(pluginId);
    else this.networkInFlight.set(pluginId, current - 1);
  }

  allowLog(pluginId: string, now = Date.now()): boolean {
    return this.hitWindow(this.logWindows, pluginId, this.limits.logsPerMinute, now);
  }

  tryAcquireJobSlot(pluginId: string): boolean {
    const current = this.jobCounts.get(pluginId) ?? 0;
    if (current >= this.limits.jobConcurrency) return false;
    this.jobCounts.set(pluginId, current + 1);
    return true;
  }

  releaseJobSlot(pluginId: string) {
    const current = this.jobCounts.get(pluginId) ?? 0;
    if (current <= 1) this.jobCounts.delete(pluginId);
    else this.jobCounts.set(pluginId, current - 1);
  }

  resetPlugin(pluginId: string) {
    this.networkInFlight.delete(pluginId);
    this.networkWindows.delete(pluginId);
    this.logWindows.delete(pluginId);
    this.jobCounts.delete(pluginId);
  }

  private hitWindow(map: Map<string, WindowCounter>, key: string, limit: number, now: number): boolean {
    const entry = map.get(key);
    if (!entry || now - entry.windowStart >= 60_000) {
      map.set(key, { windowStart: now, count: 1 });
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count += 1;
    return true;
  }
}
