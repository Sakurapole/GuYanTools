const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');

const [userData, resultFile, preloadPath] = process.argv.slice(2);
if (!userData || !resultFile || !preloadPath) throw new Error('Missing sandbox smoke arguments');
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);

const fixtureRoot = path.resolve(__dirname);
const workerFile = path.join(fixtureRoot, 'sandbox-worker.html');
let finished = false;

function finish(result) {
  if (finished) return;
  finished = true;
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  app.quit();
}

function isWithinRoot(candidate) {
  const relative = path.relative(fixtureRoot, candidate);
  return relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

app.whenReady().then(async () => {
  const blockedRequests = [];
  const window = new BrowserWindow({ show: false, width: 100, height: 100 });
  const view = new WebContentsView({
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      partition: `plugin-smoke-${Date.now()}`,
    },
  });
  window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 100, height: 100 });
  view.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      const resource = new URL(details.url);
      allowed = resource.protocol === 'file:' && isWithinRoot(fileURLToPath(resource));
    } catch {
      allowed = false;
    }
    if (!allowed) blockedRequests.push(details.url);
    callback({ cancel: !allowed });
  });
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', (event, url) => {
    if (url !== pathToFileURL(workerFile).href) event.preventDefault();
  });

  ipcMain.handle('plugin-runtime:get-context', (event) => {
    if (event.sender.id !== view.webContents.id) throw new Error('Unbound plugin runtime');
    return { pluginId: 'guyantools.smoke', pageId: '__worker__', trustLevel: 'sandboxed', runtime: 'worker', permissions: [] };
  });
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  ipcMain.handle('plugin-runtime:worker:ready', (event) => {
    if (event.sender.id !== view.webContents.id) throw new Error('Unbound plugin runtime');
    readyResolve();
  });

  await view.webContents.loadURL(pathToFileURL(workerFile).href);
  await Promise.race([
    ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Worker ready timeout')), 10_000)),
  ]);
  const probe = await view.webContents.executeJavaScript('globalThis.__pluginSandboxProbe');
  finish({
    electronVersion: process.versions.electron,
    sandboxPreference: view.webContents.getLastWebPreferences().sandbox,
    blockedRequests,
    probe,
  });
}).catch((error) => finish({ error: String(error), stack: error && error.stack }));
