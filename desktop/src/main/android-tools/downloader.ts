import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import extractZip from 'extract-zip';
import type { AndroidToolchainDownloadProgress } from '@/contracts/android-tools';

const PLATFORM_TOOLS_URL = 'https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip';
const PLATFORM_TOOLS_SHA256 = '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99';
const SCRCPY_URL = 'https://github.com/Genymobile/scrcpy/releases/download/v4.1/scrcpy-win64-v4.1.zip';
const SCRCPY_SHA256 = '5b12172b3264b2889f4583ee64752ce832e29bc8b1089dca81093459697165db';
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;

type DownloadSpec = { name: string; url: string; sha256: string };

const SPECS: DownloadSpec[] = [
  { name: 'Android Platform-Tools 37.0.1', url: PLATFORM_TOOLS_URL, sha256: PLATFORM_TOOLS_SHA256 },
  { name: 'scrcpy 4.1', url: SCRCPY_URL, sha256: SCRCPY_SHA256 },
];

function downloadFile(spec: DownloadSpec, target: string, onProgress: (received: number, total?: number) => void, redirectCount = 0): Promise<void> {
  if (redirectCount > 3) return Promise.reject(new Error('ANDROID_DOWNLOAD_REDIRECT_LIMIT'));
  const parsed = new URL(spec.url);
  if (parsed.protocol !== 'https:') return Promise.reject(new Error('ANDROID_DOWNLOAD_URL_INVALID'));

  return new Promise((resolve, reject) => {
    const request = https.get(parsed, response => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const redirected = { ...spec, url: new URL(response.headers.location, parsed).toString() };
        void downloadFile(redirected, target, onProgress, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`ANDROID_DOWNLOAD_HTTP_${response.statusCode ?? 0}`));
        return;
      }
      const total = Number(response.headers['content-length'] ?? 0) || undefined;
      if (total && total > MAX_ARCHIVE_BYTES) {
        response.resume();
        reject(new Error('ANDROID_DOWNLOAD_TOO_LARGE'));
        return;
      }
      let received = 0;
      response.on('data', chunk => {
        received += Buffer.byteLength(chunk);
        if (received > MAX_ARCHIVE_BYTES) response.destroy(new Error('ANDROID_DOWNLOAD_TOO_LARGE'));
        onProgress(received, total);
      });
      void pipeline(response, fs.createWriteStream(target)).then(resolve, reject);
    });
    request.setTimeout(120_000, () => request.destroy(new Error('ANDROID_DOWNLOAD_TIMEOUT')));
    request.on('error', reject);
  });
}

async function verifyHash(filePath: string, expected: string) {
  const content = await fsp.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex') === expected;
}

async function findFile(root: string, relativeSuffix: string): Promise<string | undefined> {
  const entries = await fsp.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested: string | undefined = await findFile(candidate, relativeSuffix);
      if (nested) return nested;
    } else if (entry.isFile() && candidate.replace(/\\/g, '/').endsWith(relativeSuffix)) {
      return candidate;
    }
  }
  return undefined;
}

async function copyRequiredFile(root: string, suffix: string, destination: string) {
  const source = await findFile(root, suffix);
  if (!source) throw new Error(`ANDROID_DOWNLOAD_MISSING_${path.basename(suffix)}`);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.copyFile(source, destination);
}

async function replaceInstalledToolchain(installRoot: string, destinationRoot: string) {
  const backupRoot = `${destinationRoot}.backup-${crypto.randomUUID()}`;
  let movedExisting = false;
  try {
    try {
      await fsp.rename(destinationRoot, backupRoot);
      movedExisting = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    await fsp.rename(installRoot, destinationRoot);
    if (movedExisting) {
      // Windows may keep the previous adb.exe open while its server is alive.
      // The new toolchain is already active, so a locked backup is harmless;
      // leave it for a later cleanup instead of rolling back a valid install.
      await fsp.rm(backupRoot, { recursive: true, force: true }).catch((): undefined => undefined);
    }
  } catch (error) {
    await fsp.rm(destinationRoot, { recursive: true, force: true }).catch((): undefined => undefined);
    if (movedExisting) {
      await fsp.rename(backupRoot, destinationRoot).catch((): undefined => undefined);
    }
    throw error;
  }
}

export async function downloadAndInstallAndroidToolchain(
  destinationRoot: string,
  onProgress: (progress: AndroidToolchainDownloadProgress) => void,
) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('ANDROID_PLATFORM_UNSUPPORTED');
  const destinationParent = path.dirname(path.resolve(destinationRoot));
  await fsp.mkdir(destinationParent, { recursive: true });
  // Keep staging and final install on the same volume so the final rename is
  // atomic even when the user data directory is configured on another drive.
  const stagingRoot = await fsp.mkdtemp(path.join(destinationParent, '.guyantools-android-tools-'));
  try {
    let completed = 0;
    const archives: string[] = [];
    for (const spec of SPECS) {
      const archivePath = path.join(stagingRoot, `${completed}.zip`);
      onProgress({ phase: 'downloading', percent: Math.round((completed / SPECS.length) * 80), current: spec.name });
      await downloadFile(spec, archivePath, (received, total) => {
        const fraction = total ? received / total : 0;
        onProgress({
          phase: 'downloading',
          percent: Math.min(80, Math.round(((completed + fraction) / SPECS.length) * 80)),
          current: spec.name,
          receivedBytes: received,
          totalBytes: total,
        });
      });
      onProgress({ phase: 'verifying', percent: Math.round(((completed + 0.5) / SPECS.length) * 80), current: spec.name });
      if (!await verifyHash(archivePath, spec.sha256)) throw new Error(`ANDROID_DOWNLOAD_HASH_MISMATCH_${spec.name}`);
      archives.push(archivePath);
      completed += 1;
    }

    const extractedRoot = path.join(stagingRoot, 'extracted');
    await fsp.mkdir(extractedRoot, { recursive: true });
    onProgress({ phase: 'extracting', percent: 82, current: '解压 Android Platform-Tools' });
    await extractZip(archives[0], { dir: extractedRoot });
    onProgress({ phase: 'extracting', percent: 88, current: '解压 scrcpy' });
    await extractZip(archives[1], { dir: extractedRoot });

    const installRoot = path.join(stagingRoot, 'install');
    await copyRequiredFile(extractedRoot, '/platform-tools/adb.exe', path.join(installRoot, 'platform-tools', 'adb.exe'));
    await copyRequiredFile(extractedRoot, '/platform-tools/fastboot.exe', path.join(installRoot, 'platform-tools', 'fastboot.exe'));
    await copyRequiredFile(extractedRoot, '/platform-tools/AdbWinApi.dll', path.join(installRoot, 'platform-tools', 'AdbWinApi.dll'));
    await copyRequiredFile(extractedRoot, '/platform-tools/AdbWinUsbApi.dll', path.join(installRoot, 'platform-tools', 'AdbWinUsbApi.dll'));
    await copyRequiredFile(extractedRoot, '/platform-tools/libwinpthread-1.dll', path.join(installRoot, 'platform-tools', 'libwinpthread-1.dll'));
    await copyRequiredFile(extractedRoot, '/scrcpy.exe', path.join(installRoot, 'scrcpy', 'scrcpy.exe'));
    await copyRequiredFile(extractedRoot, '/scrcpy-server', path.join(installRoot, 'scrcpy', 'scrcpy-server'));
    // The Windows scrcpy bundle includes its matching adb launcher. Keep it
    // beside scrcpy.exe so the client can find ADB without modifying PATH.
    await copyRequiredFile(extractedRoot, '/scrcpy-win64-v4.1/adb.exe', path.join(installRoot, 'scrcpy', 'adb.exe'));
    await copyRequiredFile(extractedRoot, '/AdbWinApi.dll', path.join(installRoot, 'scrcpy', 'AdbWinApi.dll'));
    await copyRequiredFile(extractedRoot, '/AdbWinUsbApi.dll', path.join(installRoot, 'scrcpy', 'AdbWinUsbApi.dll'));
    for (const file of ['SDL3.dll', 'libusb-1.0.dll', 'avcodec-62.dll', 'avformat-62.dll', 'avutil-60.dll', 'swresample-6.dll']) {
      await copyRequiredFile(extractedRoot, `/${file}`, path.join(installRoot, 'scrcpy', file));
    }
    await copyRequiredFile(extractedRoot, '/platform-tools/NOTICE.txt', path.join(installRoot, 'THIRD-PARTY-NOTICES', 'android-platform-tools-NOTICE.txt'));
    await copyRequiredFile(extractedRoot, '/LICENSE.txt', path.join(installRoot, 'THIRD-PARTY-NOTICES', 'scrcpy-LICENSE.txt'));

    onProgress({ phase: 'verifying', percent: 96, current: '检查安装文件' });
    await fsp.access(path.join(installRoot, 'platform-tools', 'adb.exe'));
    await replaceInstalledToolchain(installRoot, destinationRoot);
    onProgress({ phase: 'completed', percent: 100, current: 'Android 工具链已安装' });
  } finally {
    await fsp.rm(stagingRoot, { recursive: true, force: true }).catch((): undefined => undefined);
  }
}

export const androidToolchainDownloadManifest = SPECS.map(spec => ({ name: spec.name, url: spec.url, sha256: spec.sha256 }));
