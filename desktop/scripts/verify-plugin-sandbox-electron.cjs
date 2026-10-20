const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const desktopRoot = path.resolve(__dirname, '..');
const fixtureMain = path.join(desktopRoot, 'test', 'plugin-platform', 'electron-sandbox-main.cjs');
const preload = ['preload-plugin.js', 'preload.plugin.js']
  .map((name) => path.join(desktopRoot, '.vite', 'build', name))
  .find((candidate) => fs.existsSync(candidate));
if (!preload) {
  throw new Error('Build the production plugin preload first: pnpm --dir desktop run build:preload-plugin');
}

const electronPath = require('electron');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guyantools-plugin-sandbox-'));
const userData = path.join(temporaryRoot, 'user-data');
const resultFile = path.join(temporaryRoot, 'result.json');

async function run() {
  let stdout = '';
  let stderr = '';
  const child = spawn(electronPath, [fixtureMain, userData, resultFile, preload], {
    cwd: desktopRoot,
    windowsHide: true,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')),
  });
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Electron sandbox smoke timed out.\n${stderr}`));
    }, 25_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => { clearTimeout(timer); resolve(code); });
  });
  if (!fs.existsSync(resultFile)) {
    throw new Error(`Electron exited ${exitCode} without a result.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  if (result.error) throw new Error(`Electron fixture failed: ${result.error}\n${result.stack || stderr}`);
  const probe = result.probe;
  const checks = {
    electronExitedCleanly: exitCode === 0,
    sandboxEnabled: result.sandboxPreference === true,
    nodeGlobalsAbsent: probe?.processType === 'undefined' && probe?.requireType === 'undefined' &&
      probe?.moduleType === 'undefined' && probe?.electronType === 'undefined',
    productionPreloadExposedApi: probe?.apiType === 'object',
    boundContextReceived: probe?.context?.pluginId === 'guyantools.smoke',
    workerReady: probe?.ready === true,
    directNetworkDenied: probe?.networkAttempted === true && probe?.networkResult === 'blocked' &&
      result.blockedRequests.some((url) => url.startsWith('https://example.invalid/')),
  };
  console.log(JSON.stringify({ electronVersion: result.electronVersion, preload, checks }, null, 2));
  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error(`Electron sandbox smoke assertions failed.\n${JSON.stringify(result, null, 2)}\n${stderr}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  const parent = path.resolve(os.tmpdir());
  if (path.dirname(path.resolve(temporaryRoot)) !== parent) {
    throw new Error(`Refusing to remove unexpected temporary path: ${temporaryRoot}`);
  }
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});
