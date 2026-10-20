import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registered, executePluginCommand, listPlugins, configState } = vi.hoisted(() => ({
  registered: new Map<string, () => void>(),
  executePluginCommand: vi.fn(async () => ({ accepted: true })),
  listPlugins: vi.fn(),
  configState: {
    config: { shortcuts: { system: { toggleQuickLaunch: 'Control+Space' } } },
    listener: undefined as undefined | ((config: unknown, patch: unknown) => void),
  },
}));

vi.mock('electron', () => ({
  BrowserWindow: class {},
  globalShortcut: {
    register: (accelerator: string, action: () => void) => {
      if (registered.has(accelerator)) return false;
      registered.set(accelerator, action);
      return true;
    },
    unregister: (accelerator: string) => { registered.delete(accelerator); },
    isRegistered: (accelerator: string) => registered.has(accelerator),
  },
}));
vi.mock('@/main/plugin-host', () => ({
  pluginHost: {
    listPlugins,
    listContributions: () => ({ shortcuts: [shortcut('plugin.one', 'run-shortcut', 'Control+Alt+P')] }),
    executePluginCommand,
  },
}));
vi.mock('@/main/app-config/manager', () => ({
  appConfigManager: {
    getConfig: async () => configState.config,
    subscribe: (listener: (config: unknown, patch: unknown) => void) => {
      configState.listener = listener;
      return () => { configState.listener = undefined; };
    },
  },
}));

import { ShortcutService } from './service';

const shortcut = (pluginId: string, id: string, accelerator: string) => ({
  pluginId,
  contribution: { id, accelerator, commandId: 'run' },
});

describe('plugin shortcut registrations', () => {
  let shortcutService: ShortcutService;
  beforeEach(() => {
    shortcutService = new ShortcutService();
    registered.clear();
    configState.config.shortcuts.system.toggleQuickLaunch = 'Control+Space';
    executePluginCommand.mockClear();
    listPlugins.mockReturnValue([
      {
        manifest: { id: 'plugin.one', contributes: { commands: [{ id: 'run' }] } },
        enabled: true,
        status: 'enabled',
        approvedPermissions: ['system.shortcuts'],
      },
    ]);
  });

  it('registers an approved shortcut and removes it when contributions disappear', async () => {
    const results = await shortcutService.syncPluginShortcuts([
      shortcut('plugin.one', 'run-shortcut', 'Control+Alt+P'),
    ]);
    expect(results[0].status).toBe('registered');
    registered.get('CommandOrControl+Alt+P')?.();
    expect(executePluginCommand).toHaveBeenCalledWith('plugin.one', 'run');

    await shortcutService.syncPluginShortcuts([]);
    expect(registered.has('CommandOrControl+Alt+P')).toBe(false);
  });

  it('reports app and plugin accelerator conflicts without replacing the existing action', async () => {
    const results = await shortcutService.syncPluginShortcuts([
      shortcut('plugin.one', 'app-conflict', 'Control+Space'),
      shortcut('plugin.one', 'first', 'Control+Alt+P'),
      shortcut('plugin.one', 'duplicate', 'Control+Alt+P'),
    ]);
    expect(results.map((result) => result.status)).toEqual(['conflict', 'registered', 'conflict']);
    expect(registered.has('Control+Space')).toBe(false);
    expect(registered.size).toBe(1);
  });

  it('refuses registration when the plugin lacks the shortcut permission', async () => {
    listPlugins.mockReturnValue([
      {
        manifest: { id: 'plugin.one', contributes: { commands: [{ id: 'run' }] } },
        enabled: true,
        status: 'enabled',
        approvedPermissions: [],
      },
    ]);
    const results = await shortcutService.syncPluginShortcuts([
      shortcut('plugin.one', 'run-shortcut', 'Control+Alt+P'),
    ]);
    expect(results[0].status).toBe('permission-denied');
    expect(registered.size).toBe(0);
  });

  it('gives a newly configured app shortcut priority over an existing plugin binding', async () => {
    const toggleQuickLaunch = vi.fn();
    await shortcutService.initialize(() => null, undefined, undefined, undefined, toggleQuickLaunch);
    await shortcutService.syncPluginShortcuts([
      shortcut('plugin.one', 'run-shortcut', 'Control+Alt+P'),
    ]);
    configState.config.shortcuts.system.toggleQuickLaunch = 'Control+Alt+P';
    configState.listener?.(configState.config, { shortcuts: {} });

    await vi.waitFor(() => {
      registered.get('CommandOrControl+Alt+P')?.();
      expect(toggleQuickLaunch).toHaveBeenCalled();
    });
    expect(executePluginCommand).not.toHaveBeenCalled();
    shortcutService.dispose();
  });
});
