import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import type { WebContents } from 'electron';
import type { InstalledPluginRecord, PluginDevSession } from '@/contracts/plugin_host';

export function getSandboxedPluginWebPreferences(
  preload: string,
  pluginId: string,
  pageId: string
) {
  return {
    preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: false,
    devTools: true,
    partition: `plugin-${crypto.randomUUID()}`,
    additionalArguments: [`--guyantools-plugin-id=${pluginId}`, `--guyantools-page-id=${pageId}`],
  };
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

export function isAllowedPluginResourceUrl(
  value: string,
  rootPath: string,
  session: PluginDevSession | null
): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'data:' || url.protocol === 'blob:') return true;
    if (url.protocol === 'file:') {
      const target = fileURLToPath(url);
      if (!isWithin(path.resolve(rootPath), path.resolve(target))) return false;
      // An existing symlink in any parent directory must not escape the plugin root.
      if (fs.existsSync(target) && fs.existsSync(rootPath)) {
        return isWithin(fs.realpathSync(rootPath), fs.realpathSync(target));
      }
      return true;
    }
    if (session && ['http:', 'ws:'].includes(url.protocol)) {
      const expected = new URL(session.uiUrl);
      return (
        url.hostname === '127.0.0.1' &&
        url.port === String(session.port) &&
        expected.hostname === url.hostname &&
        expected.port === url.port
      );
    }
    return false;
  } catch {
    return false;
  }
}

export function getPluginResourceRoot(
  record: InstalledPluginRecord,
  kind: 'ui' | 'worker'
): string {
  const entry = record.resolvedEntryPaths[kind];
  const relative = record.manifest.entry[kind];
  if (!entry || !relative) throw new Error(`PLUGIN_ENTRY_INVALID: entry.${kind} is missing`);
  const segments = path.normalize(relative).split(path.sep).filter(Boolean);
  let root = entry;
  for (const _segment of segments) root = path.dirname(root);
  return root;
}

function isDevToolsResourceRequest(
  details: Electron.OnBeforeRequestListenerDetails,
  pluginContents: WebContents
): boolean {
  const sender = details.webContents;
  if (
    !sender ||
    sender.isDestroyed() ||
    sender.id !== details.webContentsId ||
    sender.id === pluginContents.id ||
    sender.session !== pluginContents.session ||
    sender.getType() !== 'remote'
  )
    return false;
  // Electron's inspector shares the plugin session. Its first request arrives
  // before devToolsWebContents is assigned, so use Chromium's sender identity.
  try {
    const url = new URL(details.url);
    return (
      url.protocol === 'devtools:' &&
      ((url.hostname === 'devtools' && url.pathname.startsWith('/bundled/')) ||
        (url.hostname === 'theme' && url.pathname === '/colors.css'))
    );
  } catch {
    return false;
  }
}

export function securePluginWebContents(
  contents: WebContents,
  rootPath: string,
  session: PluginDevSession | null
): void {
  contents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({
      cancel:
        !isDevToolsResourceRequest(details, contents) &&
        !isAllowedPluginResourceUrl(details.url, rootPath, session),
    });
  });
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  );
  contents.session.setPermissionCheckHandler(() => false);
  contents.session.on('will-download', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedPluginResourceUrl(url, rootPath, session)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

export function isAllowedPluginDevUrl(value: string, session: PluginDevSession | null): boolean {
  if (!session) return false;
  try {
    const url = new URL(value);
    const allowed = [session.uiUrl, session.workerUrl].filter((entry): entry is string =>
      Boolean(entry)
    );
    return (
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      url.port === String(session.port) &&
      allowed.some((entry) => new URL(entry).origin === url.origin)
    );
  } catch {
    return false;
  }
}
