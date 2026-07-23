import { describe, expect, it } from 'vitest';
import { resolvePluginPageIdentity } from './plugin_runtime_identity';

describe('plugin runtime page identity', () => {
  it('uses static route metadata before dynamic params', () => {
    expect(resolvePluginPageIdentity({
      meta: { pluginId: 'guyantools.bilibili', pageId: 'media' },
      params: {},
    })).toEqual({ pluginId: 'guyantools.bilibili', pageId: 'media' });
  });
});
