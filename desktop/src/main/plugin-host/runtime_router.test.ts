import { describe, expect, it } from 'vitest';
import { resolvePluginRuntimeUrl } from './runtime_router';
import type { InstalledPluginRecord } from '@/contracts/plugin_host';

const record = { manifest: { id: 'example.plugin' }, resolvedEntryPaths: { ui: 'C:/plugins/example/index.html', worker: 'C:/plugins/example/worker.js' } } as InstalledPluginRecord;
const session = { pluginId: 'example.plugin', rootPath: 'C:/plugins/example', uiUrl: 'http://127.0.0.1:5173/index.html', workerUrl: 'http://127.0.0.1:5173/worker.js', host: '127.0.0.1' as const, port: 5173, sessionToken: 'a'.repeat(32), startedAt: new Date().toISOString() };

describe('plugin runtime URL routing', () => {
  it('uses dev URLs only for an active session', () => {
    expect(resolvePluginRuntimeUrl(record, session, 'ui')).toBe(session.uiUrl);
    expect(resolvePluginRuntimeUrl(record, null, 'ui')).toBe('file://C:/plugins/example/index.html');
    expect(resolvePluginRuntimeUrl(record, session, 'worker')).toBe(session.workerUrl);
  });
});
