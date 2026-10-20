import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { packPlugin } from '../src/commands/pack';
import { validatePlugin } from '../src/commands/validate';

async function createPackFixture(parent = os.tmpdir()) {
  const root = await fs.mkdtemp(path.join(parent, 'guyantools-pack-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>');
  await fs.writeFile(path.join(root, 'src/main.ts'), 'document.body.textContent = "demo";');
  await fs.writeFile(path.join(root, 'guyantools.plugin.json'), JSON.stringify({
    schemaVersion: '1.1', id: 'demo.plugin', version: '1.0.0', runtime: 'ui',
    trustLevel: 'sandboxed', entry: { ui: 'dist/index.html' }, permissions: [], capabilities: [],
  }));
  return root;
}

describe('plugin pack', () => {
  it('creates a hashable archive without development session files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-pack-'));
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'index.html'),
      '<script type="module" src="/src/main.ts"></script>'
    );
    await fs.writeFile(path.join(root, 'src/main.ts'), 'document.body.textContent = "demo";');
    await fs.writeFile(
      path.join(root, 'guyantools.plugin.json'),
      JSON.stringify({
        schemaVersion: '1.1',
        id: 'demo.plugin',
        version: '1.0.0',
        entry: { ui: 'index.html' },
        permissions: [],
        capabilities: [],
      })
    );
    const result = await packPlugin(root);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await fs.stat(result.archive)).toBeTruthy();
    expect(JSON.parse(await fs.readFile(path.join(root, 'catalog-entry.json'), 'utf8')).id).toBe(
      'demo.plugin'
    );
    const extracted = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-unzip-'));
    execFileSync('tar', ['-xf', result.archive, '-C', extracted]);
    expect((await validatePlugin(extracted)).entry.ui).toBe('dist/index.html');
  });

  it('packs a valid production manifest and entry from a path containing an apostrophe', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "guyantools-'quoted-"));
    const root = await createPackFixture(parent);
    const result = await packPlugin(root);
    const extracted = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-unzip-'));
    execFileSync('tar', ['-xf', result.archive, '-C', extracted]);
    expect((await validatePlugin(extracted)).entry.ui).toBe('dist/index.html');
    expect(await fs.readFile(path.join(extracted, 'dist/index.html'), 'utf8')).toContain('./assets/');
    expect(await fs.readdir(root)).not.toContain('signature.json');
  });

  it('signs the actual archive hash and publishes the same signature in the catalog', async () => {
    const root = await createPackFixture();
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const previous = process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY;
    process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    try {
      const result = await packPlugin(root);
      const zip = await fs.readFile(result.archive);
      const hash = crypto.createHash('sha256').update(zip).digest('hex');
      const signature = JSON.parse(await fs.readFile(path.join(root, 'signature.json'), 'utf8'));
      const catalog = JSON.parse(await fs.readFile(path.join(root, 'catalog-entry.json'), 'utf8'));
      expect(result.sha256).toBe(hash);
      expect(signature.packageSha256).toBe(hash);
      expect(catalog.sha256).toBe(hash);
      expect(catalog.signature.signature).toBe(signature.signature);
      expect(crypto.verify(null, Buffer.from(`demo.plugin\n1.0.0\n${hash}`),
        signature.publicKey, Buffer.from(signature.signature, 'base64'))).toBe(true);
      const extracted = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-unzip-'));
      execFileSync('tar', ['-xf', result.archive, '-C', extracted]);
      await expect(fs.access(path.join(extracted, 'signature.json'))).rejects.toThrow();
    } finally {
      if (previous === undefined) delete process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY;
      else process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY = previous;
    }
  });

  it('does not validate a production entry until the file exists', async () => {
    const root = await createPackFixture();
    await expect(validatePlugin(root)).rejects.toThrow('PLUGIN_ENTRY_MISSING');
  });

  it('rejects a symbolic-link production entry', async () => {
    const root = await createPackFixture();
    await fs.mkdir(path.join(root, 'dist'));
    await fs.symlink(path.join(root, 'index.html'), path.join(root, 'dist/index.html'), 'file');
    await expect(validatePlugin(root)).rejects.toThrow('PLUGIN_ENTRY_SYMLINK');
  });

  it('removes a detached signature when repacking without a signing key', async () => {
    const root = await createPackFixture();
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const previous = process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY;
    try {
      process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      await packPlugin(root);
      delete process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY;
      const result = await packPlugin(root);
      expect(result.signed).toBe(false);
      await expect(fs.access(path.join(root, 'signature.json'))).rejects.toThrow();
    } finally {
      if (previous === undefined) delete process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY;
      else process.env.GUYANTOOLS_PLUGIN_SIGNING_KEY = previous;
    }
  });

  it('rejects linked files instead of copying data outside the plugin root', async () => {
    const root = await createPackFixture();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-outside-'));
    await fs.writeFile(path.join(outside, 'secret'), 'private');
    await fs.symlink(path.join(outside, 'secret'), path.join(root, 'README.md'), 'file');
    await expect(packPlugin(root)).rejects.toThrow('PLUGIN_PACK_SYMLINK');
  });
});
