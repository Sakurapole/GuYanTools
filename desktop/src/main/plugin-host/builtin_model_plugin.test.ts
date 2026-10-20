import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PluginManifestResolver } from './manifest_resolver';

describe('built-in image enhancement plugin', () => {
  it('ships a valid model manifest, UI and Python runner', async () => {
    const root = path.resolve(__dirname, '../../../resources/model-plugins/image-enhancement');
    const { manifest } = await new PluginManifestResolver().resolveFromDirectory(root);
    expect(manifest.id).toBe('guyantools.image-enhancement');
    expect(manifest.permissions).toContain('models.execute');
    expect(manifest.modelRuntime?.dependencies.cpu.length).toBeGreaterThan(0);
    expect(manifest.modelRuntime?.dependencies.cuda.length).toBeGreaterThan(0);
    await expect(fs.stat(path.join(root, manifest.modelRuntime!.entry))).resolves.toMatchObject({});
  });
});
