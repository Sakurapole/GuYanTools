import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => 'C:/test-user-data' },
  BrowserWindow: class {},
}));

vi.mock('../app-config/manager', () => ({
  appConfigManager: {
    getCachedConfig: () => ({ plugins: { unloadAfterMinutes: 10 } }),
  },
}));

vi.mock('../../core/plugin_core/plugin_manager', () => ({ default: class {} }));
vi.mock('./plugin_registry', () => ({ PluginRegistry: class {} }));
vi.mock('./host_services', () => ({ HostServiceRegistry: class { bindMainWindow() {} } }));
vi.mock('./runtime_router', () => ({ PluginRuntimeRouter: class {} }));
vi.mock('./contribution_assembler', () => ({ PluginContributionAssembler: class {} }));
vi.mock('./lifecycle_manager', () => ({ PluginLifecycleManager: class {} }));
vi.mock('./manifest_resolver', () => ({ PluginManifestResolver: class {} }));
vi.mock('./permission_manager', () => ({ PluginPermissionManager: class {} }));
vi.mock('./marketplace_resolver', () => ({
  MarketplaceResolver: class {
    list(): unknown[] { return []; }
  },
}));
vi.mock('../../core/database', () => ({ dbManager: {} }));

import { PluginHost } from './index';

describe('plugin host installation progress', () => {
  it('reports a failed marketplace resolution to the renderer', async () => {
    const send = vi.fn();
    const host = new PluginHost();
    host.bindMainWindow({ webContents: { send } } as any);

    await expect(host.installFromMarketplace('missing-marketplace', 'guyantools.missing', [])).rejects.toThrow(
      'PLUGIN_MARKETPLACE_ENTRY_NOT_FOUND',
    );

    expect(send).toHaveBeenLastCalledWith('plugin-host:install-progress', {
      phase: 'failed',
      progress: 1,
      pluginId: 'guyantools.missing',
      error: 'PLUGIN_MARKETPLACE_ENTRY_NOT_FOUND: missing-marketplace/guyantools.missing',
    });
  });
});
