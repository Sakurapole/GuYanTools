import { describe, expect, it } from 'vitest';
import { getSandboxedPluginWebPreferences } from './runtime_security';
import { validatePluginManifest } from './manifest_resolver';

describe('plugin runtime security', () => {
  it('always creates third-party views with the sandbox boundary', () => {
    const preferences = getSandboxedPluginWebPreferences('preload.js', 'guyantools.example', 'page');
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
      schemaVersion: '1.0', id: 'guyantools.example', name: 'example', displayName: 'Example', version: '1.0.0', description: '',
      pluginApiVersion: '1.0.0', hostVersionRange: '>=1.0.0', runtime: 'ui', entry: { ui: 'index.html' }, permissions: [] as string[], capabilities: [] as object[], contributes: {},
    };
    expect(() => validatePluginManifest({ ...base, trustLevel: 'trusted' })).toThrow('PLUGIN_TRUST_UNSUPPORTED');
    expect(() => validatePluginManifest({ ...base, trustLevel: 'sandboxed', runtime: 'host' })).toThrow('PLUGIN_RUNTIME_INVALID');
  });
});
