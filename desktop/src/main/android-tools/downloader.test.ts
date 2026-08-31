import { describe, expect, it } from 'vitest';
import { androidToolchainDownloadManifest } from './downloader';

describe('Android toolchain downloader manifest', () => {
  it('pins official HTTPS archives and SHA-256 values', () => {
    expect(androidToolchainDownloadManifest).toEqual([
      {
        name: 'Android Platform-Tools 37.0.1',
        url: 'https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip',
        sha256: '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99',
      },
      {
        name: 'scrcpy 4.1',
        url: 'https://github.com/Genymobile/scrcpy/releases/download/v4.1/scrcpy-win64-v4.1.zip',
        sha256: '5b12172b3264b2889f4583ee64752ce832e29bc8b1089dca81093459697165db',
      },
    ]);
    expect(androidToolchainDownloadManifest.every(item => item.url.startsWith('https://'))).toBe(true);
  });

  it('keeps scrcpy self-contained so it can locate its matching adb binary', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('./downloader.ts', import.meta.url), 'utf8'));
    expect(source).toContain("'/scrcpy-win64-v4.1/adb.exe'");
    expect(source).toContain("path.join(installRoot, 'scrcpy', 'adb.exe')");
  });

  it('does not fail installation when a previous adb binary is locked on Windows', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('./downloader.ts', import.meta.url), 'utf8'));
    expect(source).toContain("fsp.rm(backupRoot, { recursive: true, force: true }).catch");
  });
});
