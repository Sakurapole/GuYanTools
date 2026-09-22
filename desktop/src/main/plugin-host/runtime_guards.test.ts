import { describe, expect, it } from 'vitest';
import { PluginCommandRouter } from './command_router';
import { CapabilityRouter } from './capability_router';
import { PluginQuotaService, DEFAULT_PLUGIN_QUOTA_LIMITS, NETWORK_RESPONSE_HARD_CAP_BYTES } from './quota';
import { PluginApiError, normalizePluginError, toPluginApiErrorPayload } from './plugin_api_error';
import { PluginAuditStore } from './audit_store';

describe('PluginCommandRouter', () => {
  it('executes registered plugin commands', async () => {
    const router = new PluginCommandRouter();
    router.register('guyantools.demo', 'guyantools.demo.resolve', async payload => ({ ok: true, payload }));
    const result = await router.execute('guyantools.demo', 'guyantools.demo.resolve', { url: 'https://example.com' }) as any;
    expect(result.accepted).toBe(true);
    expect(result.result).toMatchObject({ ok: true });
  });

  it('denies commands outside the plugin namespace', async () => {
    const router = new PluginCommandRouter();
    await expect(router.execute('guyantools.demo', 'shell.exec')).rejects.toThrow('PLUGIN_COMMAND_DENIED');
  });

  it('denies cross-plugin command ownership', async () => {
    const router = new PluginCommandRouter();
    router.register('guyantools.a', 'guyantools.a.run', () => 'ok');
    await expect(router.execute('guyantools.b', 'guyantools.a.run')).rejects.toThrow('PLUGIN_COMMAND_DENIED');
  });

  it('reports missing command handlers', async () => {
    const router = new PluginCommandRouter();
    await expect(router.execute('guyantools.demo', 'guyantools.demo.missing')).rejects.toThrow('PLUGIN_COMMAND_NOT_FOUND');
  });

  it('unregisters handlers when a plugin is disabled', async () => {
    const router = new PluginCommandRouter();
    router.register('guyantools.demo', 'guyantools.demo.resolve', () => 'ok');
    router.unregisterPlugin('guyantools.demo');
    await expect(router.execute('guyantools.demo', 'guyantools.demo.resolve')).rejects.toThrow('PLUGIN_COMMAND_NOT_FOUND');
  });
});

describe('CapabilityRouter', () => {
  it('registers and resolves capabilities by host', () => {
    const router = new CapabilityRouter();
    router.register('guyantools.bilibili', [{
      id: 'source',
      kind: 'media-source',
      operations: ['resolve'],
      match: { hosts: ['bilibili.com', 'b23.tv'] },
    }]);
    expect(router.findByHost('www.bilibili.com')).toHaveLength(1);
    expect(router.findByHost('example.com')).toHaveLength(0);
    expect(router.findByUrl('https://b23.tv/abc')).toHaveLength(1);
  });

  it('invokes only owned capabilities with allowed operations', async () => {
    const router = new CapabilityRouter();
    router.register('guyantools.demo', [{
      id: 'source',
      kind: 'media-source',
      operations: ['resolve'],
    }]);
    router.registerInvokeHandler('guyantools.demo', 'source', async () => ({ ok: true }));
    await expect(router.invoke('guyantools.demo', { capabilityId: 'source', operation: 'resolve' })).resolves.toMatchObject({ ok: true });
    await expect(router.invoke('guyantools.demo', { capabilityId: 'source', operation: 'download' })).rejects.toThrow('PLUGIN_CAPABILITY_OPERATION_DENIED');
    await expect(router.invoke('other.plugin', { capabilityId: 'source', operation: 'resolve' })).rejects.toThrow('PLUGIN_CAPABILITY_NOT_FOUND');
    await expect(router.invoke('other.plugin', { capabilityId: 'guyantools.demo.source', operation: 'resolve' })).rejects.toThrow('PLUGIN_CAPABILITY_OWNER_MISMATCH');
  });

  it('unregisters capabilities on plugin disable', () => {
    const router = new CapabilityRouter();
    router.register('guyantools.demo', [{ id: 'source', kind: 'media-source', operations: ['resolve'], match: { hosts: ['example.com'] } }]);
    router.unregister('guyantools.demo');
    expect(router.findByHost('example.com')).toHaveLength(0);
  });
});

describe('PluginQuotaService', () => {
  it('clamps network response bytes to hard cap', () => {
    const quota = new PluginQuotaService();
    expect(quota.clampNetworkResponseBytes(999_999_999_999)).toBe(NETWORK_RESPONSE_HARD_CAP_BYTES);
    expect(quota.clampNetworkResponseBytes(1024)).toBe(1024);
    expect(quota.clampNetworkResponseBytes()).toBe(DEFAULT_PLUGIN_QUOTA_LIMITS.networkResponseBytes);
  });

  it('limits log rate per minute', () => {
    const quota = new PluginQuotaService({ logsPerMinute: 2 });
    expect(quota.allowLog('p')).toBe(true);
    expect(quota.allowLog('p')).toBe(true);
    expect(quota.allowLog('p')).toBe(false);
    expect(quota.allowLog('other')).toBe(true);
  });

  it('limits job concurrency', () => {
    const quota = new PluginQuotaService({ jobConcurrency: 2 });
    expect(quota.tryAcquireJobSlot('p')).toBe(true);
    expect(quota.tryAcquireJobSlot('p')).toBe(true);
    expect(quota.tryAcquireJobSlot('p')).toBe(false);
    quota.releaseJobSlot('p');
    expect(quota.tryAcquireJobSlot('p')).toBe(true);
  });
});

describe('PluginApiError', () => {
  it('normalizes legacy error strings into structured codes', () => {
    expect(normalizePluginError(new Error('PLUGIN_PERMISSION_DENIED: p lacks files.write')).code).toBe('PERMISSION_DENIED');
    expect(normalizePluginError(new Error('PLUGIN_NETWORK_PRIVATE_DENIED')).code).toBe('NETWORK_PRIVATE_DENIED');
    expect(normalizePluginError(new Error('PLUGIN_FILE_PATH_DENIED')).code).toBe('FILE_NOT_GRANTED');
    const payload = toPluginApiErrorPayload(new Error('QUOTA_EXCEEDED: storage'));
    expect(payload.code).toBe('QUOTA_EXCEEDED');
    expect(payload.retryable).toBe(true);
  });

  it('preserves PluginApiError instances', () => {
    const error = new PluginApiError('NETWORK_PRIVATE_DENIED', 'blocked');
    expect(normalizePluginError(error)).toBe(error);
  });
});

describe('PluginAuditStore', () => {
  it('buffers and flushes audit events in batches', async () => {
    const batches: unknown[][] = [];
    const persist = async (events: unknown[]) => {
      batches.push(events);
    };
    const store = new PluginAuditStore(persist);
    store.record({ pluginId: 'p', runtime: 'ui', operation: 'network.fetch', result: 'allowed' });
    store.record({ pluginId: 'p', runtime: 'ui', operation: 'files.write', result: 'denied' });
    await store.flush();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(store.listRecent('p')).toHaveLength(2);
  });
});
