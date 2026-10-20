import { describe, expect, it } from 'vitest';
import { resolveWorkerRuntimeKind } from './runtime_router';
import type { InstalledPluginRecord } from '@/contracts/plugin_host';

function record(
  workerRuntime?: 'browser' | 'utility',
  workerEntry = 'worker.js'
): InstalledPluginRecord {
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
      runtime: 'worker',
      ...(workerRuntime ? { workerRuntime } : {}),
      entry: { worker: workerEntry },
      permissions: [],
      capabilities: [],
      contributes: {},
    },
    enabled: true,
    status: 'enabled',
    installSource: { type: 'local', value: '/tmp/demo' },
    resolvedEntryPaths: { worker: `/tmp/demo/${workerEntry}` },
    approvedPermissions: [],
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('resolveWorkerRuntimeKind', () => {
  it('uses only browser workers for third-party plugins', () => {
    expect(resolveWorkerRuntimeKind(record('browser', 'worker.html'))).toBe('browser');
    expect(() => resolveWorkerRuntimeKind(record('utility', 'worker.html'))).toThrow('PLUGIN_RUNTIME_INVALID');
  });

  it('rejects bare JavaScript worker entries', () => {
    expect(() => resolveWorkerRuntimeKind(record(undefined, 'worker.js'))).toThrow('PLUGIN_ENTRY_INVALID');
    expect(resolveWorkerRuntimeKind(record(undefined, 'worker.html'))).toBe('browser');
  });

  it('does not let environment override the sandbox boundary', () => {
    const previous = process.env.GUYANTOOLS_PLUGIN_WORKER_RUNTIME;
    process.env.GUYANTOOLS_PLUGIN_WORKER_RUNTIME = 'utility';
    try {
      expect(resolveWorkerRuntimeKind(record(undefined, 'worker.html'))).toBe('browser');
    } finally {
      if (previous === undefined) delete process.env.GUYANTOOLS_PLUGIN_WORKER_RUNTIME;
      else process.env.GUYANTOOLS_PLUGIN_WORKER_RUNTIME = previous;
    }
  });
});
