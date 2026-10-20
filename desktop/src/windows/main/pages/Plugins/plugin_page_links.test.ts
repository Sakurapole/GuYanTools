import { describe, expect, it } from 'vitest';
import type {
  InstalledPluginRecord,
  PluginPageDescriptor,
} from '../../../../contracts/plugin_host';
import { getPluginPageDescriptors } from './plugin_page_links';

function pluginRecord(): InstalledPluginRecord {
  return {
    manifest: {
      id: 'guyantools.demo',
      name: 'demo',
      displayName: 'Demo',
      version: '1.0.0',
      description: '',
      schemaVersion: '1.1',
      pluginApiVersion: '1.0.0',
      uiApiVersion: '1.0.0',
      hostVersionRange: '>=1.0.0',
      trustLevel: 'sandboxed',
      runtime: 'hybrid',
      entry: { ui: 'index.html' },
      permissions: ['ui.contribute'],
      capabilities: [],
      contributes: {
        pages: [
          { id: 'main', title: '插件主页' },
          { id: 'settings', title: '插件设置', routePath: '/custom/settings' },
        ],
      },
    },
    enabled: true,
    status: 'enabled',
  } as InstalledPluginRecord;
}

describe('plugin page links', () => {
  it('falls back to manifest page contributions when registered pages are temporarily empty', () => {
    const pages = getPluginPageDescriptors(pluginRecord(), []);
    expect(pages.map((page) => [page.title, page.routePath])).toEqual([
      ['插件主页', '/plugins/runtime/guyantools.demo/main'],
      ['插件设置', '/custom/settings'],
    ]);
  });

  it('keeps the registered route when the host has already assembled the page', () => {
    const registered: PluginPageDescriptor = {
      pluginId: 'guyantools.demo',
      pageId: 'main',
      title: '插件主页',
      routePath: '/registered/demo',
      trustLevel: 'sandboxed',
    };
    expect(getPluginPageDescriptors(pluginRecord(), [registered])[0].routePath).toBe(
      '/registered/demo'
    );
  });
});
