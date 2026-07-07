const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
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
    await runScenario('use-remote', endpoint);
    await runScenario('use-local', endpoint);
    await runScenario('keep-both', endpoint);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

async function runScenario(resolution, endpoint) {
  const runId = randomUUID();
  const email = `sync-service-${runId.replace(/-/g, '')}@example.local`;
  const password = 'sync-service-smoke-password';
  const marker = `sync-service-${runId.slice(0, 8)}`;
  const deviceAUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'guyantools-sync-service-a-'));
  const deviceBUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'guyantools-sync-service-b-'));
  await runClient('device-a-initial', email, password, marker, deviceAUserData, endpoint);
  await runClient('device-b-baseline', email, password, marker, deviceBUserData, endpoint);
  await runClient('device-a-update', email, password, marker, deviceAUserData, endpoint);
  const roleByResolution = {
    'use-local': 'device-b-use-local',
    'use-remote': 'device-b-conflict',
    'keep-both': 'device-b-keep-both',
  };
  await runClient(roleByResolution[resolution], email, password, marker, deviceBUserData, endpoint);
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

async function runClient(role, email, password, marker, userData, endpoint) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'smoke-sync-service-client.cjs')], {
      cwd: desktopRoot,
      env: {
        ...process.env,
        GUYANTOOLS_SYNC_BASE_URL: endpoint,
        GUYANTOOLS_SMOKE_ROLE: role,
        GUYANTOOLS_SMOKE_EMAIL: email,
        GUYANTOOLS_SMOKE_PASSWORD: password,
        GUYANTOOLS_SMOKE_MARKER: marker,
        GUYANTOOLS_SMOKE_USER_DATA: userData,
      },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`sync service ${role} smoke exited with code ${code}`));
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
