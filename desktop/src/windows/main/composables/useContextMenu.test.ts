import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContributionsSummary } from '@/contracts/plugin_host';

vi.mock('./useInAppNotification', () => ({ notifyError: vi.fn() }));

import { useContextMenu } from './useContextMenu';

const summary: PluginContributionsSummary = {
  pages: [], widgets: [], commands: [], shortcuts: [], backgroundTasks: [],
  menus: [
    { pluginId: 'plugin.one', contribution: { id: 'context-entry', title: 'Run plugin', target: 'context', commandId: 'run' } },
    { pluginId: 'plugin.one', contribution: { id: 'app-entry', title: 'App action', target: 'app', commandId: 'app-run' } },
  ],
};

describe('global context menu plugin contributions', () => {
  beforeEach(() => {
    useContextMenu().close();
    vi.unstubAllGlobals();
  });

  it('adds context contributions and dispatches through the plugin host API', async () => {
    const executePluginCommand = vi.fn(async () => ({ accepted: true }));
    vi.stubGlobal('window', { pluginHostApi: { listContributions: async () => summary, executePluginCommand } });
    const menu = useContextMenu();
    menu.open(20, 30, [{ id: 'built-in', label: 'Built in' }]);
    await vi.waitFor(() => expect(menu.items.value).toHaveLength(2));
    expect(menu.items.value[0].id).toBe('built-in');
    const pluginEntry = menu.items.value[1].children?.[0];
    expect(pluginEntry?.label).toBe('Run plugin');
    pluginEntry?.action?.();
    expect(executePluginCommand).toHaveBeenCalledWith('plugin.one', 'run');
  });

  it('does not append a stale response after the menu closes', async () => {
    let resolveContributions!: (value: typeof summary) => void;
    vi.stubGlobal('window', {
      pluginHostApi: {
        listContributions: () => new Promise<typeof summary>((resolve) => { resolveContributions = resolve; }),
        executePluginCommand: vi.fn(),
      },
    });
    const menu = useContextMenu();
    menu.open(20, 30, [{ id: 'built-in', label: 'Built in' }]);
    menu.close();
    resolveContributions(summary);
    await Promise.resolve();
    expect(menu.items.value).toEqual([]);
    expect(menu.visible.value).toBe(false);
  });
});
