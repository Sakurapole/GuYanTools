import { describe, expect, it } from 'vitest';
import type { PluginPageDescriptor } from '@/contracts/plugin_host';
import { resolvePluginPageRoute } from './plugin_page_navigation';

describe('home plugin page navigation', () => {
  it('uses a declared route when available and the canonical fallback otherwise', () => {
    const page: PluginPageDescriptor = {
      pluginId: 'guyantools.bilibili',
      pageId: 'media',
      title: 'Bilibili Media',
      routePath: '/custom/bilibili-media',
      trustLevel: 'sandboxed',
    };

    expect(resolvePluginPageRoute([page], page.pluginId, page.pageId)).toBe('/custom/bilibili-media');
    expect(resolvePluginPageRoute([], page.pluginId, page.pageId)).toBe('/plugins/runtime/guyantools.bilibili/media');
  });
});
