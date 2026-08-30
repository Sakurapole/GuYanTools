import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AndroidToolchainManager } from './toolchain';

async function createFixture(files: string[]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guyantools-android-tools-'));
  for (const file of files) {
    const target = path.join(root, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.endsWith('.exe') ? 'binary' : 'server', 'utf8');
  }
  return root;
}

describe('AndroidToolchainManager', () => {
  it('reports missing required tools without resolving a path outside the toolchain root', async () => {
    const root = await createFixture(['platform-tools/adb.exe']);
    const manager = new AndroidToolchainManager({ rootPath: root, platform: 'win32', arch: 'x64' });

    const status = await manager.verify();

    expect(status.available).toBe(false);
    expect(status.errorCode).toBe('ANDROID_TOOL_UNAVAILABLE');
    expect(manager.getToolPath('scrcpy')).toBe(path.join(root, 'scrcpy', 'scrcpy.exe'));
    expect(manager.getToolPath('adb')).toBe(path.join(root, 'platform-tools', 'adb.exe'));
  });

  it('requires the scrcpy server to be present alongside the client', async () => {
    const root = await createFixture([
      'platform-tools/adb.exe',
      'platform-tools/fastboot.exe',
      'scrcpy/scrcpy.exe',
    ]);
    const manager = new AndroidToolchainManager({ rootPath: root, platform: 'win32', arch: 'x64' });

    const status = await manager.verify();

    expect(status.available).toBe(false);
    expect(status.errorCode).toBe('ANDROID_TOOL_UNAVAILABLE');
    expect(status.errorMessage).toContain('scrcpy-server');
  });

  it('accepts an explicit development root while keeping paths deterministic', () => {
    const root = path.join(os.tmpdir(), 'android-toolchain');
    const manager = new AndroidToolchainManager({ rootPath: root, platform: 'win32', arch: 'x64' });

    expect(manager.getToolPath('fastboot')).toBe(path.join(root, 'platform-tools', 'fastboot.exe'));
    expect(manager.getToolPath('scrcpy-server')).toBe(path.join(root, 'scrcpy', 'scrcpy-server'));
  });

  it('prefers a configured root over the managed and bundled roots', () => {
    const configured = path.join(os.tmpdir(), 'android-configured');
    const managed = path.join(os.tmpdir(), 'android-managed');
    const manager = new AndroidToolchainManager({
      platform: 'win32',
      arch: 'x64',
      getConfiguredRootPath: () => configured,
      getManagedRootPath: () => managed,
    });

    expect(manager.resolve()).toMatchObject({ rootPath: configured, source: 'configured' });
  });

  it('uses the managed root when no configured path is set', () => {
    const managed = path.join(os.tmpdir(), 'android-managed');
    const manager = new AndroidToolchainManager({
      platform: 'win32',
      arch: 'x64',
      getConfiguredRootPath: () => '',
      getManagedRootPath: () => managed,
    });

    expect(manager.resolve()).toMatchObject({ rootPath: managed, source: 'managed' });
  });
});
