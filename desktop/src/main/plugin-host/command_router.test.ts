import { describe, expect, it } from 'vitest';
import { PluginCommandRouter } from './command_router';

describe('PluginCommandRouter runtime handlers', () => {
  it('routes a contributed command to a registered runtime', async () => {
    const router = new PluginCommandRouter();
    router.register('guyantools.demo', 'guyantools.demo.resolve', () =>
      router.invokeRuntime('guyantools.demo', 'guyantools.demo.resolve', { url: 'https://example.com' })
    );
    router.registerRuntime('guyantools.demo', 'runtime-1', async (request) => ({
      runtimeId: 'runtime-1',
      payload: request.payload,
    }));

    await expect(
      router.execute('guyantools.demo', 'guyantools.demo.resolve', { url: 'https://example.com' })
    ).resolves.toMatchObject({
      accepted: true,
      result: { runtimeId: 'runtime-1' },
    });
  });

  it('removes runtime handlers and rejects commands after runtime cleanup', async () => {
    const router = new PluginCommandRouter();
    router.register('guyantools.demo', 'guyantools.demo.resolve', () =>
      router.invokeRuntime('guyantools.demo', 'guyantools.demo.resolve')
    );
    router.registerRuntime('guyantools.demo', 'runtime-1', async () => 'ok');
    router.unregisterRuntime('runtime-1');

    await expect(
      router.execute('guyantools.demo', 'guyantools.demo.resolve')
    ).rejects.toThrow('PLUGIN_RUNTIME_UNAVAILABLE');
  });
});
