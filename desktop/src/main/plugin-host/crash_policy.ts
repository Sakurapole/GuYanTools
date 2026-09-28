export const PLUGIN_START_FAILURE_THRESHOLD = 3;

export interface PluginStartFailureTracker {
  consecutiveFailures: number;
  shouldAutoDisable: boolean;
  message: string;
}

/**
 * Tracks consecutive enable/start failures and auto-disables after a threshold.
 */
export class PluginCrashPolicy {
  private readonly failures = new Map<string, number>();

  recordStartSuccess(pluginId: string) {
    this.failures.delete(pluginId);
  }

  recordStartFailure(
    pluginId: string,
    error: unknown,
    threshold = PLUGIN_START_FAILURE_THRESHOLD
  ): PluginStartFailureTracker {
    const next = (this.failures.get(pluginId) ?? 0) + 1;
    this.failures.set(pluginId, next);
    const message = error instanceof Error ? error.message : String(error);
    return {
      consecutiveFailures: next,
      shouldAutoDisable: next >= threshold,
      message: `PLUGIN_START_FAILED (${next}/${threshold}): ${message}`,
    };
  }

  getConsecutiveFailures(pluginId: string) {
    return this.failures.get(pluginId) ?? 0;
  }

  reset(pluginId: string) {
    this.failures.delete(pluginId);
  }
}
