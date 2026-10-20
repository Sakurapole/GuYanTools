import type { PluginContributes, PluginPermission } from '@/contracts/plugin_host';
import { PluginApiError } from './plugin_api_error';

const MAX_TASKS_PER_PLUGIN = 16;
const MAX_INTERVAL_MINUTES = 24 * 60;

type ScheduledTask = {
  commandId: string;
  timer: ReturnType<typeof setInterval>;
  active: boolean;
};

/** Host-owned timer registry. Call register only after the plugin worker is ready. */
export class PluginBackgroundTaskScheduler {
  private readonly tasksByPlugin = new Map<string, ScheduledTask[]>();
  private readonly inFlightCommands = new Set<string>();
  private disposed = false;

  constructor(
    private readonly invoke: (pluginId: string, commandId: string) => Promise<unknown> | unknown,
    private readonly onError: (pluginId: string, commandId: string, error: unknown) => void = () => undefined
  ) {}

  register(
    pluginId: string,
    contributions: PluginContributes,
    approvedPermissions: PluginPermission[]
  ): void {
    if (this.disposed) throw new PluginApiError('INVALID_INPUT', 'BACKGROUND_SCHEDULER_DISPOSED');

    const declarations = contributions.backgroundTasks ?? [];
    if (declarations.length > MAX_TASKS_PER_PLUGIN) {
      throw new PluginApiError('QUOTA_EXCEEDED', 'BACKGROUND_TASK_QUOTA');
    }
    if (declarations.length > 0 && !approvedPermissions.includes('background.run')) {
      throw new PluginApiError('PERMISSION_DENIED', 'BACKGROUND_PERMISSION_DENIED');
    }
    if (declarations.length > 0 && !approvedPermissions.includes('commands.execute')) {
      throw new PluginApiError('PERMISSION_DENIED', 'BACKGROUND_COMMAND_PERMISSION_DENIED');
    }

    const commandIds = new Set((contributions.commands ?? []).map((command) => command.id));
    const taskIds = new Set<string>();
    const validated = declarations.map((task) => {
      if (!task.id.startsWith(`${pluginId}.`) || !commandIds.has(task.id)) {
        throw new PluginApiError('INVALID_INPUT', 'BACKGROUND_COMMAND_UNDECLARED');
      }
      if (taskIds.has(task.id)) {
        throw new PluginApiError('INVALID_INPUT', 'BACKGROUND_TASK_DUPLICATE');
      }
      taskIds.add(task.id);
      if (task.event !== undefined) {
        throw new PluginApiError('INVALID_INPUT', 'BACKGROUND_EVENT_UNSUPPORTED');
      }
      const match = /^every:([1-9]\d*)m$/.exec(task.schedule ?? '');
      const minutes = match ? Number(match[1]) : NaN;
      if (!Number.isSafeInteger(minutes) || minutes > MAX_INTERVAL_MINUTES) {
        throw new PluginApiError('INVALID_INPUT', 'BACKGROUND_SCHEDULE_INVALID');
      }
      return { commandId: task.id, intervalMs: minutes * 60_000 };
    });

    this.unregister(pluginId);
    const scheduled = validated.map(({ commandId, intervalMs }) => {
      const entry: ScheduledTask = {
        commandId,
        active: true,
        timer: setInterval(() => { void this.run(pluginId, entry); }, intervalMs),
      };
      entry.timer.unref?.();
      return entry;
    });
    if (scheduled.length > 0) this.tasksByPlugin.set(pluginId, scheduled);
  }

  unregister(pluginId: string): void {
    const entries = this.tasksByPlugin.get(pluginId);
    if (!entries) return;
    this.tasksByPlugin.delete(pluginId);
    for (const entry of entries) {
      entry.active = false;
      clearInterval(entry.timer);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pluginId of this.tasksByPlugin.keys()) this.unregister(pluginId);
  }

  private async run(pluginId: string, entry: ScheduledTask): Promise<void> {
    const key = `${pluginId}\0${entry.commandId}`;
    if (!entry.active || this.inFlightCommands.has(key)) return;
    this.inFlightCommands.add(key);
    try {
      await this.invoke(pluginId, entry.commandId);
    } catch (error) {
      if (entry.active) {
        try {
          this.onError(pluginId, entry.commandId, error);
        } catch {
          // A reporting failure must not create an unhandled timer rejection.
        }
      }
    } finally {
      this.inFlightCommands.delete(key);
    }
  }
}
