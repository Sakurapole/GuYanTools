import { describe, expect, it } from 'vitest';
import { getPluginPageRoutePath } from './plugin_host';

describe('plugin page routes', () => {
  it('uses the canonical runtime route shared by home shortcuts and registered pages', () => {
    expect(getPluginPageRoutePath('guyantools.bilibili', 'media')).toBe('/plugins/runtime/guyantools.bilibili/media');
  });
});
