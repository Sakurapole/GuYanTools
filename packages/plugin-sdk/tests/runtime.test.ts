import { describe, expect, it, vi } from 'vitest';
import { createPluginApi } from '../src/runtime';

describe('plugin runtime SDK', () => {
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
    const api = createPluginApi(() => Promise.resolve(), (_channel, _listener) => unsubscribe);
    const cleanup = api.ui.onThemeChanged(() => undefined);
    cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
