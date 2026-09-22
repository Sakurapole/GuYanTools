import { describe, expect, it } from 'vitest';
import { redactPluginLogMeta, validatePluginCommand } from './security_guards';
import { PluginPermissionManager } from './permission_manager';
import type { PluginManifest } from '@/contracts/plugin_host';
import { getSandboxedPluginWebPreferences, isAllowedPluginDevUrl } from './runtime_security';
import { validateDevSession } from './dev_session';

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.1',
    id: 'guyantools.example',
    name: 'example',
    displayName: 'Example',
    version: '1.0.0',
    description: 'fixture',
    pluginApiVersion: '1.0.0',
    hostVersionRange: '>=1.1.0',
    trustLevel: 'sandboxed',
    runtime: 'ui',
    entry: { ui: 'dist/index.html' },
    permissions: [],
    capabilities: [],
    contributes: {},
    ...overrides,
  } as unknown as PluginManifest;
}

describe('plugin security regression guards', () => {
  it('rejects arbitrary commands outside the plugin namespace', () => {
    expect(() => validatePluginCommand('guyantools.example', 'shell.exec')).toThrow('PLUGIN_COMMAND_DENIED');
    expect(() => validatePluginCommand('guyantools.example', 'guyantools.example.resolve')).not.toThrow();
  });

  it('redacts credentials and sensitive fields before plugin metadata is logged', () => {
    const safe = redactPluginLogMeta({ token: 'secret-token', Cookie: 'SESSDATA=secret', nested: { password: 'secret-password' }, ok: 'value' });
    expect(JSON.stringify(safe)).not.toContain('secret-token');
    expect(JSON.stringify(safe)).not.toContain('SESSDATA');
    expect(JSON.stringify(safe)).not.toContain('secret-password');
    expect(safe).toMatchObject({ token: '[REDACTED]', Cookie: '[REDACTED]', nested: { password: '[REDACTED]' }, ok: 'value' });
  });

  it('blocks sandboxed host-runtime privilege escalation', () => {
    const manager = new PluginPermissionManager();
    expect(() => manager.validateManifest(manifest({ runtime: 'host' }))).toThrow('cannot use host runtime');
  });

  it('blocks unknown permissions in the manifest', () => {
    const manager = new PluginPermissionManager();
    expect(() => manager.validateManifest(manifest({ permissions: ['not.a.real.permission' as never] })))
      .toThrow('unsupported permissions');
  });

  it('enforces hardened sandbox webPreferences', () => {
    const prefs = getSandboxedPluginWebPreferences('/tmp/preload.js', 'guyantools.demo', 'home') as Record<string, unknown>;
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.webSecurity).toBe(true);
    expect(prefs.webviewTag).toBe(false);
  });

  it('only allows loopback dev session URLs with matching port', () => {
    const session = {
      pluginId: 'guyantools.demo',
      rootPath: 'C:\\tmp\\demo',
      uiUrl: 'http://127.0.0.1:5173/',
      host: '127.0.0.1' as const,
      port: 5173,
      sessionToken: 'a'.repeat(40),
      startedAt: new Date().toISOString(),
    };
    expect(isAllowedPluginDevUrl('http://127.0.0.1:5173/', session)).toBe(true);
    expect(isAllowedPluginDevUrl('http://127.0.0.1:5174/', session)).toBe(false);
    expect(isAllowedPluginDevUrl('http://localhost:5173/', session)).toBe(false);
    expect(isAllowedPluginDevUrl('https://127.0.0.1:5173/', session)).toBe(false);
    expect(isAllowedPluginDevUrl('http://127.0.0.1:5173/', null)).toBe(false);
  });

  it('rejects invalid dev session payloads', () => {
    expect(() => validateDevSession(null)).toThrow('PLUGIN_DEV_SESSION_INVALID');
    expect(() => validateDevSession({
      pluginId: 'guyantools.demo',
      rootPath: 'relative/path',
      uiUrl: 'http://127.0.0.1:5173/',
      host: '127.0.0.1',
      port: 5173,
      sessionToken: 'a'.repeat(40),
      startedAt: new Date().toISOString(),
    })).toThrow('rootPath must be absolute');
    expect(() => validateDevSession({
      pluginId: 'guyantools.demo',
      rootPath: 'C:\\tmp\\demo',
      uiUrl: 'http://0.0.0.0:5173/',
      host: '127.0.0.1',
      port: 5173,
      sessionToken: 'a'.repeat(40),
      startedAt: new Date().toISOString(),
    })).toThrow('uiUrl must be loopback');
  });
});
