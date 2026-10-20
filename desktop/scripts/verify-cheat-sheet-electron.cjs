const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');

function getNativeAffinity(win) {
  const handleBuffer = win.getNativeWindowHandle();
  const handle = (handleBuffer.length === 8 ? handleBuffer.readBigUInt64LE() : BigInt(handleBuffer.readUInt32LE())).toString();
  const source = `$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CheatSheetAffinityProbe {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool GetWindowDisplayAffinity(IntPtr hwnd, out uint affinity);
}
'@
[uint32]$captureAffinity = 0
$captureOk = [CheatSheetAffinityProbe]::GetWindowDisplayAffinity([IntPtr]::new([long]${handle}), [ref]$captureAffinity)
[pscustomobject]@{ok=$captureOk;affinity=$captureAffinity} | ConvertTo-Json -Compress`;
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8' }));
}

async function runElectronChild() {
  const { app } = require('electron');
  const root = process.argv[3];
  const resultPath = path.join(root, 'result.json');
  app.setPath('userData', root);
  app.on('window-all-closed', () => {});
  await app.whenReady();
  const { CheatSheetWindow } = require(path.join(root, 'build/window.cjs'));
  const { createDefaultCheatSheetSettings } = require(path.join(root, 'build/settings.cjs'));
  const loadingChecks = [];
  app.on('browser-window-created', (_event, win) => {
    win.webContents.once('did-start-loading', () => {
      loadingChecks.push({ protected: win.isContentProtected(), native: getNativeAffinity(win) });
    });
  });
  const controller = new CheatSheetWindow({
    load: async () => ({ questions: [], settings: createDefaultCheatSheetSettings() }),
    flush: async () => {}, updateSettings: async () => {},
  }, () => undefined);
  const states = [];
  try {
    const snapshot = (stage) => {
      const win = controller.getWindow();
      const native = getNativeAffinity(win);
      assert.equal(win.isContentProtected(), true, stage);
      assert.equal(native.ok, true, stage);
      assert.equal(native.affinity, 0x11, stage);
      assert.equal(win.isVisible(), true, stage);
      assert.ok(Math.abs(win.getOpacity() - 1) < 0.01, stage);
      states.push({ stage, protected: true, nativeWindowOpacity: win.getOpacity(), backgroundOpacity: 0.9, native });
    };
    await Promise.all([controller.open(), controller.open()]);
    snapshot('first-open');
    await controller.execute('hide');
    await controller.open();
    snapshot('hide-and-reopen');
    await controller.execute('close');
    await controller.open();
    snapshot('destroy-and-recreate');
    assert.equal(loadingChecks.length, 2);
    for (const check of loadingChecks) {
      assert.equal(check.protected, true, 'protection must precede content loading');
      assert.equal(check.native.affinity, 0x11, 'native affinity must precede content loading');
    }
    fs.writeFileSync(resultPath, JSON.stringify({ electron: process.versions.electron, windows: os.release(), states, loadingChecks }, null, 2));
    await controller.close();
    app.exit(0);
  } catch (error) {
    fs.writeFileSync(resultPath, JSON.stringify({ error: error.stack }));
    app.exit(1);
  }
}

async function run() {
  if (process.platform !== 'win32') throw new Error('This smoke test requires Windows.');
  const { build } = require('esbuild');
  const desktopRoot = path.resolve(__dirname, '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guyantools-cheat-sheet-test-'));
  try {
    const renderer = path.join(root, 'renderer/main_window');
    fs.mkdirSync(renderer, { recursive: true });
    fs.writeFileSync(path.join(renderer, 'cheat_sheet.html'), '<!doctype html><title>Capture test fixture</title><p>Protected window test</p>');
    await build({
      entryPoints: [path.join(desktopRoot, 'src/main/cheat-sheet/window.ts')],
      outfile: path.join(root, 'build/window.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'],
      plugins: [{ name: 'isolate-host-services', setup(build) {
        build.onResolve({ filter: /@\/main\/(shortcuts\/service|windows\/window_icon)$/ }, (args) => ({ path: args.path, namespace: 'smoke-host' }));
        build.onLoad({ filter: /.*/, namespace: 'smoke-host' }, (args) => ({ contents: args.path.includes('shortcuts')
          ? 'export const shortcutService = { syncFeatureShortcuts: async () => [], clearFeatureShortcuts() {} };'
          : 'export function resolveWindowIconPath() { return undefined; }' }));
      } }],
    });
    fs.writeFileSync(path.join(root, 'build/preload.js'), '');
    await build({ entryPoints: [path.join(desktopRoot, 'src/contracts/cheat_sheet.ts')], outfile: path.join(root, 'build/settings.cjs'), bundle: true, platform: 'node', format: 'cjs' });
    const child = spawn(require('electron'), [__filename, '--electron-child', root], {
      cwd: desktopRoot, windowsHide: true,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')),
    });
    let stderr = '';
    child.stdout.resume();
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`Smoke test timed out: ${stderr}`)); }, 30000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); resolve(code); });
    });
    const result = JSON.parse(fs.readFileSync(path.join(root, 'result.json'), 'utf8'));
    console.log(JSON.stringify(result, null, 2));
    assert.equal(exitCode, 0, result.error ?? stderr);
    assert.equal(result.error, undefined);
  } finally {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir())) throw new Error('Unexpected smoke directory');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

(process.argv.includes('--electron-child') ? runElectronChild() : run()).catch((error) => {
  console.error(error);
  if (process.versions.electron) require('electron').app.exit(1);
  else process.exitCode = 1;
});
