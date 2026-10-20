import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContributionsSummary } from '@/contracts/plugin_host';

const { notifyError } = vi.hoisted(() => ({ notifyError: vi.fn() }));
vi.mock('./useInAppNotification', () => ({ notifyError }));

import { usePluginAppMenu } from './usePluginAppMenu';

const summary: PluginContributionsSummary = {
  pages: [], widgets: [], commands: [], shortcuts: [], backgroundTasks: [],
  menus: [
    { pluginId: 'plugin.one', contribution: { id: 'app-entry', title: 'App action', target: 'app', commandId: 'app-run' } },
    { pluginId: 'plugin.one', contribution: { id: 'context-entry', title: 'Context action', target: 'context', commandId: 'context-run' } },
  ],
};

describe('plugin app menu', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    notifyError.mockClear();
  });

  it('lists app contributions and routes selection through the host', async () => {
    const executePluginCommand = vi.fn(async () => ({ accepted: true }));
    vi.stubGlobal('window', { pluginHostApi: { listContributions: async () => summary, executePluginCommand } });
    const menu = usePluginAppMenu();
    await menu.open();
    expect(menu.items.value.map((item) => item.contribution.title)).toEqual(['App action']);
    await menu.execute(menu.items.value[0]);
    expect(executePluginCommand).toHaveBeenCalledWith('plugin.one', 'app-run');
    expect(menu.visible.value).toBe(false);
  });

  it('removes stale actions on a subsequent open after plugin disable', async () => {
    const listContributions = vi.fn()
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce({ ...summary, menus: [] });
    vi.stubGlobal('window', { pluginHostApi: { listContributions, executePluginCommand: vi.fn() } });
    const menu = usePluginAppMenu();
    await menu.open();
    expect(menu.items.value).toHaveLength(1);
    menu.close();
    await menu.open();
    expect(menu.items.value).toEqual([]);
  });
});
