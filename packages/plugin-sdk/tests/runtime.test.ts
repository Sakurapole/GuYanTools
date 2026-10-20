import { describe, expect, it, vi } from 'vitest';
import { createPluginApi } from '../src/runtime';

describe('plugin runtime SDK', () => {
  it('routes environment, package and CUDA controls without accepting shell commands', async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const api = createPluginApi((channel, ...args) => {
      calls.push([channel, ...args]);
      return Promise.resolve({});
    });
    await api.models.getEnvironmentSnapshot();
    await api.models.createManagedEnvironment({
      name: 'Image',
      manager: 'uv',
      pythonVersion: '3.10',
    });
    await api.models.listPackages('env-id', 'uv');
    await api.models.inspectRuntime('env-id');
    await api.models.installDependencies('cuda', 'cu128');
    expect(calls).toEqual([
      ['plugin-runtime:models:environments:list'],
      [
        'plugin-runtime:models:environments:create',
        { name: 'Image', manager: 'uv', pythonVersion: '3.10' },
      ],
      ['plugin-runtime:models:packages:list', 'env-id', 'uv'],
      ['plugin-runtime:models:inspect', 'env-id'],
      ['plugin-runtime:models:install-dependencies', 'cuda', 'cu128'],
    ]);
  });
  it('routes model environment and inference actions through scoped channels', async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const api = createPluginApi((channel, ...args) => {
      calls.push([channel, ...args]);
      return Promise.resolve({});
    });
    await api.models.listPython();
    await api.models.createEnvironment('base-id');
    await api.models.startInference({
      inputId: 'in',
      weightsId: 'weights',
      outputId: 'out',
      options: { scale: 2 },
    });
    expect(calls).toEqual([
      ['plugin-runtime:models:list-python'],
      ['plugin-runtime:models:create-environment', 'base-id'],
      [
        'plugin-runtime:models:start-inference',
        { inputId: 'in', weightsId: 'weights', outputId: 'out', options: { scale: 2 } },
      ],
    ]);
  });
  it('opens an official source URL through the host', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    await createPluginApi(invoke).system.openExternal('https://github.com/bilibili/ailab');
    expect(invoke).toHaveBeenCalledWith(
      'plugin-runtime:system:open-external',
      'https://github.com/bilibili/ailab'
    );
  });
  it('signals worker readiness over the scoped runtime channel', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    await createPluginApi(invoke).lifecycle.ready();
    expect(invoke).toHaveBeenCalledWith('plugin-runtime:worker:ready');
  });
  it('maps UI methods to named runtime channels', async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const api = createPluginApi((channel, ...args) => {
      calls.push([channel, ...args]);
      return Promise.resolve({ mode: 'dark', tokensVersion: '1.0.0' });
    });
    await api.ui.getTheme();
    expect(calls[0]?.[0]).toBe('plugin-runtime:ui:get-theme');
  });

  it('returns an exact cleanup function for theme listeners', () => {
    const unsubscribe = vi.fn();
    const api = createPluginApi(
      () => Promise.resolve(),
      (_channel, _listener) => unsubscribe
    );
    const cleanup = api.ui.onThemeChanged(() => undefined);
    cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('maps Android facade methods to scoped runtime channels', async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const api = createPluginApi((channel, ...args) => {
      calls.push([channel, ...args]);
      return Promise.resolve([]);
    });

    await api.android.devices.list();
    await api.android.sessions.startMirror({ deviceSerial: 'usb-1' });
    await api.android.sessions.stop('session-1');
    await api.android.fastboot.getVars('usb-1', ['product']);

    expect(calls).toEqual([
      ['plugin-runtime:android:devices:list'],
      ['plugin-runtime:android:sessions:start-mirror', { deviceSerial: 'usb-1' }],
      ['plugin-runtime:android:sessions:stop', 'session-1'],
      ['plugin-runtime:android:fastboot:get-vars', 'usb-1', ['product']],
    ]);
  });

  it('registers a local command handler and answers host invocations', async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const listeners = new Map<string, (payload: unknown) => void>();
    const api = createPluginApi(
      (channel, ...args) => {
        calls.push([channel, ...args]);
        return Promise.resolve();
      },
      (channel, listener) => {
        listeners.set(channel, listener);
        return () => listeners.delete(channel);
      }
    );

    await api.commands.register('guyantools.demo.resolve', (payload) => ({ payload }));
    listeners.get('plugin-runtime:command:invoke')?.({
      requestId: 'request-1',
      commandId: 'guyantools.demo.resolve',
      payload: { value: 1 },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls[0]).toEqual(['plugin-runtime:commands:register', 'guyantools.demo.resolve']);
    expect(calls[1]?.[0]).toBe('plugin-runtime:commands:respond');
    expect(calls[1]?.[1]).toBe('request-1');
    expect(calls[1]?.[2]).toMatchObject({ ok: true, result: { payload: { value: 1 } } });
  });

  it('registers a capability handler and returns its operation result', async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const listeners = new Map<string, (payload: unknown) => void>();
    const api = createPluginApi(
      (channel, ...args) => {
        calls.push([channel, ...args]);
        return Promise.resolve();
      },
      (channel, listener) => {
        listeners.set(channel, listener);
        return () => listeners.delete(channel);
      }
    );
    await api.capabilities.register('source', async (operation, payload) => ({
      operation,
      payload,
    }));
    listeners.get('plugin-runtime:capability:invoke')?.({
      requestId: 'cap-1',
      capabilityId: 'source',
      operation: 'resolve',
      payload: { url: 'x' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toContainEqual(['plugin-runtime:capabilities:register', 'source']);
    expect(calls).toContainEqual([
      'plugin-runtime:capabilities:respond',
      'cap-1',
      { ok: true, result: { operation: 'resolve', payload: { url: 'x' } } },
    ]);
  });
});
