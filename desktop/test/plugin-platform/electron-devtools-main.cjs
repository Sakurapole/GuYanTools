const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, WebContentsView } = require('electron');
const [temporaryRoot, resultFile, securityModule] = process.argv.slice(2);
const { getSandboxedPluginWebPreferences, securePluginWebContents } = require(securityModule);
const pluginRoot = path.join(temporaryRoot, 'plugin');
fs.mkdirSync(pluginRoot);
fs.writeFileSync(
  path.join(pluginRoot, 'index.html'),
  '<!doctype html><title>Plugin DevTools smoke</title><p>Sandboxed plugin</p>'
);
app.setPath('userData', path.join(temporaryRoot, 'user-data'));
let finished = false;
const requests = [];
function finish(result) {
  if (finished) return;
  finished = true;
  fs.writeFileSync(resultFile, JSON.stringify({ ...result, requests }, null, 2));
  app.quit();
}
function opened(contents) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DevTools did not open')), 8000);
    contents.once('devtools-opened', () => {
      clearTimeout(timeout);
      BrowserWindow.fromWebContents(contents.devToolsWebContents)?.hide();
      resolve();
    });
    contents.openDevTools({ mode: 'detach' });
  });
}
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({ show: false });
    const view = new WebContentsView({
      webPreferences: getSandboxedPluginWebPreferences('', 'guyantools.smoke', 'main'),
    });
    win.contentView.addChildView(view);
    const contents = view.webContents;
    const webRequest = contents.session.webRequest;
    const original = webRequest.onBeforeRequest.bind(webRequest);
    webRequest.onBeforeRequest = (listener) =>
      original((details, callback) =>
        listener(details, (response) => {
          requests.push({
            url: details.url,
            sender: details.webContentsId,
            senderType: details.webContents?.getType(),
            sameSession: details.webContents?.session === contents.session,
            devtools: contents.devToolsWebContents?.id,
            blocked: response.cancel,
          });
          callback(response);
        })
      );
    securePluginWebContents(contents, pluginRoot, null);
    await contents.loadFile(path.join(pluginRoot, 'index.html'));
    await opened(contents);
    const devtools = contents.devToolsWebContents;
    const frontendLoaded = await devtools.executeJavaScript(
      "document.readyState === 'complete' && Boolean(document.body && document.body.children.length)"
    );
    const sandbox = await contents.executeJavaScript(
      "typeof require === 'undefined' && typeof process === 'undefined'"
    );
    const remoteBlocked = await contents.executeJavaScript(
      "fetch('https://example.invalid/plugin-test').then(() => false, () => true)"
    );
    await new Promise((resolve) => {
      contents.once('devtools-closed', resolve);
      contents.closeDevTools();
    });
    await opened(contents);
    const reopened = await contents.devToolsWebContents.executeJavaScript(
      "document.readyState === 'complete' && Boolean(document.body && document.body.children.length)"
    );
    let pluginDevtoolsBlocked = false;
    try {
      await contents.loadURL('devtools://devtools/bundled/devtools_app.html');
    } catch {
      pluginDevtoolsBlocked = true;
    }
    const devtoolsRequests = requests.filter(
      (request) => request.senderType === 'remote' && request.url.startsWith('devtools://')
    );
    finish({
      electronVersion: process.versions.electron,
      checks: {
        frontendLoaded,
        reopened,
        sandbox,
        remoteBlocked,
        pluginDevtoolsBlocked,
        devtoolsResourcesAllowed:
          devtoolsRequests.length > 0 && devtoolsRequests.every((request) => !request.blocked),
      },
    });
  })
  .catch((error) => finish({ error: String(error) }));
