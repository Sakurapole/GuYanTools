import { describe, expect, it } from 'vitest';
import { PluginDevSessionManager, validateDevSession } from './dev_session';

const session = { pluginId: 'example.plugin', rootPath: 'C:/plugins/example', uiUrl: 'http://127.0.0.1:5173/index.html', workerUrl: 'http://127.0.0.1:5173/worker.js', host: '127.0.0.1' as const, port: 5173, sessionToken: 'a'.repeat(32), startedAt: new Date().toISOString() };

describe('plugin dev sessions', () => {
  it('validates and replaces sessions per plugin', () => {
    const manager = new PluginDevSessionManager();
    expect(() => validateDevSession(session)).not.toThrow();
    manager.connect(session);
    manager.connect({ ...session, sessionToken: 'b'.repeat(32) });
    expect(manager.list()).toHaveLength(1);
    expect(manager.get(session.pluginId)?.sessionToken).toBe('b'.repeat(32));
  });

  it('rejects non-loopback sessions', () => {
    expect(() => validateDevSession({ ...session, uiUrl: 'http://0.0.0.0:5173/index.html' })).toThrow('PLUGIN_DEV_SESSION_INVALID');
  });
});
