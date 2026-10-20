import { describe, expect, it, vi } from 'vitest';
import { syncRouteToBottomBar } from './route_tab_sync';

describe('route tab synchronization', () => {
  it('opens and activates a runtime tab for plugin routes', () => {
    const barStore = { openTab: vi.fn(), activateTabByUrl: vi.fn() };
    syncRouteToBottomBar(
      {
        fullPath: '/plugins/runtime/demo/main',
        meta: { pluginId: 'demo', pageId: 'main', title: 'Demo' },
      },
      barStore
    );
    expect(barStore.openTab).toHaveBeenCalledWith('/plugins/runtime/demo/main', 'Demo', 'plugins');
    expect(barStore.activateTabByUrl).not.toHaveBeenCalled();
  });

  it('opens a runtime tab from the canonical plugin path without route metadata', () => {
    const barStore = { openTab: vi.fn(), activateTabByUrl: vi.fn() };
    syncRouteToBottomBar(
      { fullPath: '/plugins/runtime/demo/main', meta: { title: '插件页面' } },
      barStore
    );
    expect(barStore.openTab).toHaveBeenCalledWith(
      '/plugins/runtime/demo/main',
      '插件页面',
      'plugins'
    );
  });

  it('activates fixed tabs for regular routes without creating runtime tabs', () => {
    const barStore = { openTab: vi.fn(), activateTabByUrl: vi.fn() };
    syncRouteToBottomBar({ fullPath: '/plugins', meta: { title: '插件' } }, barStore);
    expect(barStore.activateTabByUrl).toHaveBeenCalledWith('/plugins');
    expect(barStore.openTab).not.toHaveBeenCalled();
  });
});
