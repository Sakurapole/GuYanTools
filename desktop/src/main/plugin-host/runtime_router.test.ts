import { describe, expect, it, vi } from 'vitest';
import { resolvePluginRuntimeUrl, PluginRuntimeRouter } from './runtime_router';
import type { InstalledPluginRecord } from '@/contracts/plugin_host';

const record = {
  manifest: { id: 'example.plugin' },
  resolvedEntryPaths: {
    ui: 'C:/plugins/example/index.html',
    worker: 'C:/plugins/example/worker.html',
  },
} as InstalledPluginRecord;
const session = {
  pluginId: 'example.plugin',
  rootPath: 'C:/plugins/example',
  uiUrl: 'http://127.0.0.1:5173/index.html',
  workerUrl: 'http://127.0.0.1:5173/worker.html',
  host: '127.0.0.1' as const,
  port: 5173,
  sessionToken: 'a'.repeat(32),
  startedAt: new Date().toISOString(),
};

describe('plugin runtime URL routing', () => {
  it('opens only the requested mounted plugin view', () => {
    const openDevTools = vi.fn();
    const router = Object.assign(Object.create(PluginRuntimeRouter.prototype), {
      mountedByWindowId: new Map([
        [
          1,
          {
            pluginId: 'example.plugin',
            pageId: 'main',
            view: { webContents: { isDestroyed: () => false, openDevTools } },
          },
        ],
      ]),
    }) as PluginRuntimeRouter;
    expect(() => router.openMountedDevTools({ id: 1 } as any, 'other.plugin', 'main')).toThrow(
      'PLUGIN_PAGE_NOT_MOUNTED'
    );
    expect(() => router.openMountedDevTools({ id: 1 } as any, 'example.plugin', 'other')).toThrow(
      'PLUGIN_PAGE_NOT_MOUNTED'
    );
    expect(openDevTools).not.toHaveBeenCalled();
    router.openMountedDevTools({ id: 1 } as any, 'example.plugin', 'main');
    expect(openDevTools).toHaveBeenCalledWith({ mode: 'detach' });
  });
  it('uses dev URLs only for an active session', () => {
    expect(resolvePluginRuntimeUrl(record, session, 'ui')).toBe(session.uiUrl);
    expect(resolvePluginRuntimeUrl(record, null, 'ui')).toBe(
      'file:///C:/plugins/example/index.html'
    );
    expect(resolvePluginRuntimeUrl(record, session, 'worker')).toBe(session.workerUrl);
  });
});
