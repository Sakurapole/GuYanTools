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
