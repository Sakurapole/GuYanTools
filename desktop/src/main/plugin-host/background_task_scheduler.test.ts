import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContributes, PluginPermission } from '@/contracts/plugin_host';
import { PluginBackgroundTaskScheduler } from './background_task_scheduler';

const pluginId = 'guyantools.sync';
const commandId = `${pluginId}.run`;
const permissions: PluginPermission[] = ['background.run', 'commands.execute'];

function contributions(schedule = 'every:5m'): PluginContributes {
  return {
    commands: [{ id: commandId, title: 'Run sync' }],
    backgroundTasks: [{ id: commandId, title: 'Scheduled sync', schedule }],
  };
}

describe('PluginBackgroundTaskScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('invokes a declared command at its minute interval without running immediately', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const scheduler = new PluginBackgroundTaskScheduler(invoke);
    scheduler.register(pluginId, contributions(), permissions);

    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith(pluginId, commandId);
    scheduler.dispose();
  });

  it('skips overlapping ticks and resumes once the command settles', async () => {
    let resolveFirst!: () => void;
    const invoke = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveFirst = resolve;
    })).mockResolvedValue(undefined);
    const scheduler = new PluginBackgroundTaskScheduler(invoke);
    scheduler.register(pluginId, contributions('every:1m'), permissions);

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(invoke).toHaveBeenCalledOnce();
    resolveFirst();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('does not overlap an in-flight task across registration replacement', async () => {
    let resolveFirst!: () => void;
    const invoke = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveFirst = resolve;
    })).mockResolvedValue(undefined);
    const scheduler = new PluginBackgroundTaskScheduler(invoke);
    scheduler.register(pluginId, contributions('every:1m'), permissions);
    await vi.advanceTimersByTimeAsync(60_000);
    scheduler.register(pluginId, contributions('every:1m'), permissions);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).toHaveBeenCalledOnce();
    resolveFirst();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it('clears prior timers on replacement, unregister, and dispose', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const scheduler = new PluginBackgroundTaskScheduler(invoke);
    scheduler.register(pluginId, contributions('every:1m'), permissions);
    scheduler.register(pluginId, contributions('every:2m'), permissions);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).toHaveBeenCalledOnce();
    scheduler.unregister(pluginId);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(invoke).toHaveBeenCalledOnce();
    scheduler.register(pluginId, contributions('every:1m'), permissions);
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).toHaveBeenCalledOnce();
    expect(() => scheduler.register(pluginId, contributions(), permissions)).toThrow('DISPOSED');
  });

  it('requires approved background permission and a declared matching command', () => {
    const scheduler = new PluginBackgroundTaskScheduler(vi.fn());
    expect(() => scheduler.register(pluginId, contributions(), ['commands.execute']))
      .toThrow('BACKGROUND_PERMISSION_DENIED');
    expect(() => scheduler.register(pluginId, contributions(), ['background.run']))
      .toThrow('COMMAND_PERMISSION_DENIED');
    expect(() => scheduler.register(pluginId, { backgroundTasks: contributions().backgroundTasks }, permissions))
      .toThrow('BACKGROUND_COMMAND_UNDECLARED');
    scheduler.dispose();
  });

  it('rejects unsupported events, invalid intervals, and duplicate task IDs atomically', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const scheduler = new PluginBackgroundTaskScheduler(invoke);
    scheduler.register(pluginId, contributions('every:1m'), permissions);
    const bad = contributions('every:0m');
    expect(() => scheduler.register(pluginId, bad, permissions)).toThrow('BACKGROUND_SCHEDULE_INVALID');
    expect(() => scheduler.register(pluginId, contributions('*/5 * * * *'), permissions))
      .toThrow('BACKGROUND_SCHEDULE_INVALID');
    expect(() => scheduler.register(pluginId, {
      ...contributions(),
      backgroundTasks: [{ id: commandId, title: 'Event sync', event: 'workspace:changed' }],
    }, permissions)).toThrow('BACKGROUND_EVENT_UNSUPPORTED');
    expect(() => scheduler.register(pluginId, {
      ...contributions(),
      backgroundTasks: [
        { id: commandId, title: 'First', schedule: 'every:1m' },
        { id: commandId, title: 'Second', schedule: 'every:1m' },
      ],
    }, permissions)).toThrow('BACKGROUND_TASK_DUPLICATE');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(invoke).toHaveBeenCalledOnce();
    scheduler.dispose();
  });

  it('contains command failures and continues scheduling', async () => {
    const invoke = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const onError = vi.fn();
    const scheduler = new PluginBackgroundTaskScheduler(invoke, onError);
    scheduler.register(pluginId, contributions('every:1m'), permissions);
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(pluginId, commandId, expect.any(Error));
    scheduler.dispose();
  });
});
