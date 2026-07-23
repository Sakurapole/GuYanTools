export function getSandboxedPluginWebPreferences(preload: string, pluginId: string, pageId: string) {
  return {
    preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: false,
    devTools: true,
    additionalArguments: [`--guyantools-plugin-id=${pluginId}`, `--guyantools-page-id=${pageId}`],
  };
}

export function isAllowedPluginDevUrl(value: string, session: PluginDevSession | null): boolean {
  if (!session) return false;
  try {
    const url = new URL(value);
    const allowed = [session.uiUrl, session.workerUrl].filter((entry): entry is string => Boolean(entry));
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === String(session.port)
      && allowed.some(entry => new URL(entry).origin === url.origin);
  } catch { return false; }
}
import type { PluginDevSession } from '@/contracts/plugin_host';
