import { describe, expect, it } from 'vitest';
import { PluginContributionAssembler } from './contribution_assembler';
import type { InstalledPluginRecord } from '@/contracts/plugin_host';

function record(overrides: Partial<InstalledPluginRecord> = {}): InstalledPluginRecord {
  return {
    manifest: {
      schemaVersion: '1.1',
      id: 'guyantools.demo',
      name: 'demo',
      displayName: 'Demo',
      version: '1.0.0',
      description: '',
      pluginApiVersion: '1.0.0',
      hostVersionRange: '>=1.0.0',
      trustLevel: 'sandboxed',
      runtime: 'hybrid',
      entry: { ui: 'index.html', worker: 'worker.js' },
      permissions: ['ui.contribute'],
      capabilities: [],
      contributes: {
        pages: [{ id: 'home', title: '首页' }],
        commands: [{ id: 'guyantools.demo.resolve', title: '解析' }],
        widgets: [{ id: 'status', title: '状态', target: 'home' }],
        menus: [{ id: 'open', title: '打开', target: 'app', commandId: 'guyantools.demo.resolve' }],
        shortcuts: [
          { id: 'open', accelerator: 'CmdOrCtrl+Shift+D', commandId: 'guyantools.demo.resolve' },
        ],
        backgroundTasks: [{ id: 'sync', title: '同步' }],
      },
    },
    enabled: true,
    status: 'enabled',
    installSource: { type: 'local', value: '/tmp/demo' },
    resolvedEntryPaths: { ui: '/tmp/demo/index.html' },
    approvedPermissions: ['ui.contribute'],
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('PluginContributionAssembler', () => {
  const assembler = new PluginContributionAssembler();

  it('assembles all contribution kinds for enabled plugins', () => {
    const all = assembler.listAll([record()]);
    expect(all.pages).toHaveLength(1);
    expect(all.commands).toHaveLength(1);
    expect(all.widgets).toHaveLength(1);
    expect(all.menus).toHaveLength(1);
    expect(all.shortcuts).toHaveLength(1);
    expect(all.backgroundTasks).toHaveLength(1);
    expect(all.pages[0].routePath).toContain('/plugins/runtime/');
  });

  it('skips disabled plugins', () => {
    const all = assembler.listAll([record({ enabled: false, status: 'disabled' })]);
    expect(all.pages).toHaveLength(0);
    expect(all.commands).toHaveLength(0);
  });
  it('only exposes the DevTools button when the plugin explicitly opts in', () => {
    const base = record();
    expect(assembler.listPages([base])[0].showDevToolsButton).toBe(false);
    expect(
      assembler.listPages([
        {
          ...base,
          manifest: {
            ...base.manifest,
            ui: {
              theme: 'guyantools',
              components: '@guyantools/plugin-ui',
              showDevToolsButton: true,
            },
          },
        },
      ])[0].showDevToolsButton
    ).toBe(true);
  });

  it('namespaces contributions with pluginId', () => {
    const commands = assembler.listCommands([record()]);
    expect(commands[0].pluginId).toBe('guyantools.demo');
    expect(commands[0].contribution.id).toBe('guyantools.demo.resolve');
  });
});
