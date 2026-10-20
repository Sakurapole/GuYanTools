const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildSync } = require('esbuild');

const desktopRoot = path.resolve(__dirname, '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guyantools-devtools-test-'));
const resultFile = path.join(temporaryRoot, 'result.json');
const securityModule = path.join(temporaryRoot, 'runtime-security.cjs');

async function run() {
  buildSync({
    entryPoints: [path.join(desktopRoot, 'src/main/plugin-host/runtime_security.ts')],
    outfile: securityModule, bundle: true, platform: 'node', format: 'cjs',
  });
  const child = spawn(require('electron'), [
    path.join(desktopRoot, 'test/plugin-platform/electron-devtools-main.cjs'),
    temporaryRoot, resultFile, securityModule,
  ], {
    cwd: desktopRoot, windowsHide: true,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')),
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.resume();
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`DevTools smoke timed out: ${stderr}`)); }, 25000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); resolve(code); });
  });
  if (!fs.existsSync(resultFile)) throw new Error(`No smoke result (exit ${exitCode}): ${stderr}`);
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  console.log(JSON.stringify({ ...result, requests: undefined, blockedRequests: result.requests.filter(request => request.blocked) }, null, 2));
  if (result.error || exitCode !== 0 || Object.values(result.checks).some(value => !value))
    throw new Error(`DevTools smoke failed: ${result.error || JSON.stringify(result.checks)}`);
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  // This directory is generated locally, never taken from a plugin or command argument.
  if (path.dirname(path.resolve(temporaryRoot)) !== path.resolve(os.tmpdir()))
    throw new Error('Unexpected smoke directory');
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});
