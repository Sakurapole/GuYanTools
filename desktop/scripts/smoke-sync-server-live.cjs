const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const desktopRoot = path.resolve(__dirname, '..');

async function main() {
  const endpoint = await resolveEndpoint();
  const existingReady = await isReady(endpoint);
  let serverProcess = null;
  if (!existingReady) {
    serverProcess = startLocalServer(endpoint);
    await waitReady(endpoint, serverProcess);
  }

  try {
    await runNodeScript('smoke-sync-server-provider.cjs', endpoint);
    await runNodeScript('smoke-sync-server-two-device.cjs', endpoint);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

function startLocalServer(endpoint) {
  const child = spawn('cargo', ['run', '--manifest-path', 'sync_server/Cargo.toml'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GUYANTOOLS_SYNC_BIND: endpointToBind(endpoint),
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://laityh:20030303@127.0.0.1:5430/mydb',
      REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379/',
      S3_ENDPOINT: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || 'guyantools',
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || 'guyantools-sync-2026',
      S3_BUCKET: process.env.S3_BUCKET || 'guyantools-sync-assets',
      S3_REGION: process.env.S3_REGION || 'us-east-1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[sync-server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[sync-server] ${chunk}`));
  return child;
}

async function runNodeScript(scriptName, endpoint) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, scriptName)], {
      cwd: desktopRoot,
      env: {
        ...process.env,
        GUYANTOOLS_SYNC_BASE_URL: endpoint,
      },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });
  });
}

async function waitReady(baseUrl, serverProcess) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`sync server exited before ready with code ${serverProcess.exitCode}`);
    }
    if (await isReady(baseUrl)) {
      return;
    }
    await sleep(750);
  }
  throw new Error(`sync server did not become ready at ${baseUrl}`);
}

async function isReady(baseUrl) {
  try {
    const response = await fetch(new URL('/readyz', baseUrl), { signal: AbortSignal.timeout(2_500) });
    return response.ok;
  } catch {
    return false;
  }
}

function endpointToBind(baseUrl) {
  const url = new URL(baseUrl);
  const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
  return `${host}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
}

function normalizeEndpoint(value) {
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

async function resolveEndpoint() {
  if (process.env.GUYANTOOLS_SYNC_BASE_URL) {
    return normalizeEndpoint(process.env.GUYANTOOLS_SYNC_BASE_URL);
  }
  const port = await getAvailablePort();
  return normalizeEndpoint(`http://127.0.0.1:${port}`);
}

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('failed to allocate local sync smoke port')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
