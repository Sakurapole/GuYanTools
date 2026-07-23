import { describe, expect, it } from 'vitest';
import { LocalPluginDevChannel } from './dev_channel';

describe('local plugin dev channel', () => {
  it('starts on loopback and authenticates a session', async () => {
    const channel = new LocalPluginDevChannel();
    const started = await channel.start();
    expect(started.address.includes('127.0.0.1') || started.address.startsWith('\\\\.\\pipe\\')).toBe(true);
    const accepted = await channel.accept({ token: started.token, session: { pluginId: 'example.plugin', rootPath: 'C:/plugins/example', uiUrl: 'http://127.0.0.1:5173/index.html', host: '127.0.0.1', port: 5173, sessionToken: 'a'.repeat(32), startedAt: new Date().toISOString() } });
    expect(accepted.pluginId).toBe('example.plugin');
    await channel.stop();
  });

  it('forwards accepted sessions to the host callback', async () => {
    const received: string[] = [];
    const channel = new LocalPluginDevChannel(session => { received.push(session.pluginId); });
    const started = await channel.start();
    await channel.accept({ token: started.token, session: { pluginId: 'example.plugin', rootPath: 'C:/plugins/example', uiUrl: 'http://127.0.0.1:5173/index.html', host: '127.0.0.1', port: 5173, sessionToken: 'a'.repeat(32), startedAt: new Date().toISOString() } });
    expect(received).toEqual(['example.plugin']);
    await channel.stop();
  });
});
