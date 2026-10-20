import { describe, expect, it } from 'vitest';
import { validateProductionManifest } from '../src/manifest';

const manifest = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: '1.1',
  id: 'example.plugin',
  trustLevel: 'sandboxed',
  runtime: 'hybrid',
  entry: { ui: 'dist/index.html', worker: 'dist/worker.html' },
  permissions: [],
  capabilities: [],
  contributes: {},
  ...overrides,
});

describe('production plugin manifest', () => {
  it('rejects utility and bare JavaScript worker entrypoints', () => {
    expect(() => validateProductionManifest(manifest({ workerRuntime: 'utility' }))).toThrow(
      'PLUGIN_RUNTIME_INVALID'
    );
    expect(() => validateProductionManifest(manifest({
      entry: { ui: 'dist/index.html', worker: 'dist/worker.js' },
    }))).toThrow('PLUGIN_ENTRY_INVALID');
  });

  it('rejects unknown contribution types and path traversal', () => {
    expect(() => validateProductionManifest(manifest({ contributes: { mystery: [] } }))).toThrow(
      'PLUGIN_CONTRIBUTION_INVALID'
    );
    expect(() => validateProductionManifest(manifest({
      entry: { ui: 'dist/../other.html', worker: 'dist/worker.html' },
    }))).toThrow('PLUGIN_ENTRY_INVALID');
  });
});
