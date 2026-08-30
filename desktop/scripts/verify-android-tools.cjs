const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing Android tools file: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(relative, tokens) {
  const content = read(relative);
  for (const token of tokens) {
    if (!content.includes(token)) throw new Error(`Android invariant missing in ${relative}: ${token}`);
  }
  return content;
}

const toolchain = assertIncludes('src/main/android-tools/toolchain.ts', [
  'getToolPath',
  'path.resolve',
  'ANDROID_TOOL_UNAVAILABLE',
  "source: selected.source",
]);
if (/process\.env\.PATH|process\.env\.ANDROID/i.test(toolchain)) {
  throw new Error('Android toolchain must not resolve executables from PATH/environment');
}

const downloader = assertIncludes('src/main/android-tools/downloader.ts', [
  'https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip',
  'https://github.com/Genymobile/scrcpy/releases/download/v4.1/scrcpy-win64-v4.1.zip',
  'ANDROID_DOWNLOAD_REDIRECT_LIMIT',
  'ANDROID_DOWNLOAD_HASH_MISMATCH',
  "'/scrcpy-win64-v4.1/adb.exe'",
  'THIRD-PARTY-NOTICES',
]);
if (!/sha256/i.test(downloader) || !/extractZip/.test(downloader)) {
  throw new Error('Android downloader must verify SHA-256 and extract pinned archives');
}
if (/http:\/\//i.test(downloader)) {
  throw new Error('Android downloader must use HTTPS sources only');
}

for (const relative of [
  'src/main/android-tools/adb_service.ts',
  'src/main/android-tools/scrcpy_service.ts',
  'src/main/android-tools/fastboot_service.ts',
]) {
  const content = read(relative);
  if (!content.includes('getToolPath')) throw new Error(`Android service does not use a fixed tool path: ${relative}`);
  if (!content.includes('windowsHide: true')) throw new Error(`Windows process hiding missing: ${relative}`);
  if (/shell\s*:\s*true/.test(content)) throw new Error(`Shell execution is forbidden: ${relative}`);
}

const androidService = assertIncludes('src/main/plugin-host/android_service.ts', [
  'PluginContextGuard',
  'readObject',
  'android.devices.read',
  'android.sessions.control',
  'android.audio.playback',
  'android.otg.control',
  'android.fastboot.read',
  'android.fastboot.reboot',
  'stopSessionsForOwner',
]);
if (/from ['"]node:(child_process|process)['"]/.test(androidService)) {
  throw new Error('Plugin Android facade must not spawn arbitrary child processes');
}
if (/\bargv\b|\bexecutablePath\b|\bshellCommand\b/.test(androidService)) {
  throw new Error('Plugin Android facade must not accept arbitrary argv, paths, or shell commands');
}

const hostContract = assertIncludes('src/contracts/plugin_host.ts', [
  "'android.devices.read'",
  "'android.sessions.read'",
  "'android.sessions.control'",
  "'android.audio.playback'",
  "'android.otg.control'",
  "'android.fastboot.read'",
  "'android.fastboot.reboot'",
]);
for (const forbidden of ['android.adb.shell', 'android.fastboot.write']) {
  if (hostContract.includes(forbidden)) throw new Error(`Forbidden plugin permission exposed: ${forbidden}`);
}

const fastbootArgs = assertIncludes('src/main/android-tools/fastboot_args.ts', [
  "['devices', '-l']",
  "['getvar', normalized]",
  "['reboot']",
]);
if (/\bflash\b|\berase\b|\bunlock\b/i.test(fastbootArgs)) {
  throw new Error('Fastboot write/unlock operation found in the allowlisted argument builder');
}

const pluginIpc = assertIncludes('src/main/plugin-host/ipc.ts', [
  'getSenderPluginContext(event.sender.id)',
  'plugin-runtime:android:devices:list',
  'plugin-runtime:android:sessions:start-mirror',
  'plugin-runtime:android:sessions:stop',
  'plugin-runtime:android:fastboot:reboot',
]);
const androidIpc = pluginIpc.slice(pluginIpc.indexOf("plugin-runtime:android:devices:list"));
if (/pluginId\s*:\s*(unknown|string)/.test(androidIpc)) {
  throw new Error('Plugin Android IPC must derive pluginId from sender context');
}

console.log('android tools verification passed');
