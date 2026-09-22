import { describe, expect, it } from 'vitest';
import { PluginCrashPolicy, PLUGIN_START_FAILURE_THRESHOLD } from './crash_policy';

describe('PluginCrashPolicy', () => {
  it('auto-disables after consecutive start failures reach the threshold', () => {
    const policy = new PluginCrashPolicy();
    let tracker = policy.recordStartFailure('guyantools.demo', new Error('load failed'));
    expect(tracker.consecutiveFailures).toBe(1);
    expect(tracker.shouldAutoDisable).toBe(false);

    tracker = policy.recordStartFailure('guyantools.demo', new Error('load failed'));
    expect(tracker.consecutiveFailures).toBe(2);
    expect(tracker.shouldAutoDisable).toBe(false);

    tracker = policy.recordStartFailure('guyantools.demo', new Error('load failed'));
    expect(tracker.consecutiveFailures).toBe(PLUGIN_START_FAILURE_THRESHOLD);
    expect(tracker.shouldAutoDisable).toBe(true);
    expect(tracker.message).toContain('PLUGIN_START_FAILED');
  });

  it('resets the counter after a successful start', () => {
    const policy = new PluginCrashPolicy();
    policy.recordStartFailure('guyantools.demo', new Error('boom'));
    policy.recordStartSuccess('guyantools.demo');
    expect(policy.getConsecutiveFailures('guyantools.demo')).toBe(0);
    expect(policy.recordStartFailure('guyantools.demo', new Error('boom')).consecutiveFailures).toBe(1);
  });
});
