import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import {
  getSandboxedPluginWebPreferences,
  isAllowedPluginDevUrl,
  isAllowedPluginResourceUrl,
  securePluginWebContents,
} from './runtime_security';
import { validatePluginManifest } from './manifest_resolver';

describe('plugin runtime security', () => {
  it('always creates third-party views with the sandbox boundary', () => {
    const preferences = getSandboxedPluginWebPreferences(
      'preload.js',
      'guyantools.example',
      'page'
    );
    expect(preferences).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    });
  });

  it('does not allow trusted or host runtime manifests into the market path', () => {
    const base = {
      schemaVersion: '1.0',
      id: 'guyantools.example',
      name: 'example',
      displayName: 'Example',
      version: '1.0.0',
      description: '',
      pluginApiVersion: '1.0.0',
      hostVersionRange: '>=1.0.0',
      runtime: 'ui',
      entry: { ui: 'index.html' },
      permissions: [] as string[],
      capabilities: [] as object[],
      contributes: {},
    };
    expect(() => validatePluginManifest({ ...base, trustLevel: 'trusted' })).toThrow(
      'PLUGIN_TRUST_UNSUPPORTED'
    );
    expect(() =>
      validatePluginManifest({ ...base, trustLevel: 'sandboxed', runtime: 'host' })
    ).toThrow('PLUGIN_RUNTIME_INVALID');
  });

  it('allows dev URLs only for an active matching session', () => {
    const session = {
      pluginId: 'guyantools.example',
      rootPath: 'C:/plugins/example',
      uiUrl: 'http://127.0.0.1:5173/index.html',
      host: '127.0.0.1' as const,
      port: 5173,
      sessionToken: 'a'.repeat(32),
      startedAt: new Date().toISOString(),
    };
    expect(isAllowedPluginDevUrl(session.uiUrl, session)).toBe(true);
    expect(isAllowedPluginDevUrl(session.uiUrl, null)).toBe(false);
    expect(isAllowedPluginDevUrl('http://127.0.0.1:5174/index.html', session)).toBe(false);
  });

  it('restricts plugin resources to its own directory or active development origin', () => {
    const root = process.platform === 'win32' ? 'C:\\plugins\\example' : '/plugins/example';
    const ownFile =
      process.platform === 'win32'
        ? 'file:///C:/plugins/example/dist/worker.js'
        : 'file:///plugins/example/dist/worker.js';
    const outsideFile =
      process.platform === 'win32'
        ? 'file:///C:/plugins/other/private.js'
        : 'file:///plugins/other/private.js';
    expect(isAllowedPluginResourceUrl(ownFile, root, null)).toBe(true);
    expect(isAllowedPluginResourceUrl(outsideFile, root, null)).toBe(false);
    expect(isAllowedPluginResourceUrl('https://example.com/payload.js', root, null)).toBe(false);
  });
});

describe('plugin session DevTools requests', () => {
  function setup() {
    let request: (
      details: Electron.OnBeforeRequestListenerDetails,
      callback: (response: Electron.CallbackResponse) => void
    ) => void;
    const session = {
      webRequest: {
        onBeforeRequest: vi.fn((listener) => {
          request = listener;
        }),
      },
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      on: vi.fn(),
    };
    const plugin = {
      id: 10,
      session,
      devToolsWebContents: null as WebContents | null,
      getType: () => 'window',
      isDestroyed: () => false,
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    };
    const devtools = { id: 11, session, getType: () => 'remote', isDestroyed: () => false };
    securePluginWebContents(plugin as unknown as WebContents, 'C:/plugins/example', null);
    function blocked(url: string, sender?: unknown, senderId?: number) {
      const callback = vi.fn();
      request(
        {
          url,
          webContents: sender,
          webContentsId: senderId,
        } as Electron.OnBeforeRequestListenerDetails,
        callback
      );
      return callback.mock.calls[0][0].cancel;
    }
    return { blocked, plugin, devtools };
  }
  it('allows the Chromium inspector bootstrap before devToolsWebContents is assigned', () => {
    const { blocked, devtools } = setup();
    expect(
      blocked(
        'devtools://devtools/bundled/devtools_app.html?remoteBase=https://example.com',
        devtools,
        11
      )
    ).toBe(false);
    expect(
      blocked('devtools://devtools/bundled/entrypoints/devtools_app/devtools_app.js', devtools, 11)
    ).toBe(false);
    expect(blocked('devtools://theme/colors.css?sets=ui,chrome', devtools, 11)).toBe(false);
  });
  it('does not allow a plugin page to access the same internal inspector resources', () => {
    const { blocked, plugin } = setup();
    expect(blocked('devtools://devtools/bundled/devtools_app.html', plugin, 10)).toBe(true);
    expect(blocked('devtools://theme/colors.css', plugin, 10)).toBe(true);
  });
  it('rejects mismatched identities, destroyed inspectors and other sessions', () => {
    const { blocked, devtools } = setup();
    const url = 'devtools://devtools/bundled/devtools_app.html';
    expect(blocked(url, devtools, 10)).toBe(true);
    expect(blocked(url, { ...devtools, session: {} }, 11)).toBe(true);
    expect(blocked(url, { ...devtools, isDestroyed: () => true }, 11)).toBe(true);
    expect(blocked(url)).toBe(true);
  });
  it('does not extend the exception to network, outside files or other internal protocols', () => {
    const { blocked, devtools, plugin } = setup();
    for (const url of [
      'https://example.com/payload.js',
      'devtools://other/bundled/a.js',
      'devtools://devtools/remote/a.js',
      'devtools://theme/other.css',
      'chrome://settings',
      'file:///C:/private.js',
    ]) {
      expect(blocked(url, devtools, 11)).toBe(true);
      expect(blocked(url, plugin, 10)).toBe(true);
    }
  });
});
