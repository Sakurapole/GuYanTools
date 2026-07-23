import { contextBridge, ipcRenderer } from 'electron';
import { createPluginApi } from './sdk';
import type { PluginRuntimeInvoke, PluginRuntimeSubscribe } from './sdk';

const pluginAPI = createPluginApi(
  ((channel, ...args) => ipcRenderer.invoke(channel, ...args)) satisfies PluginRuntimeInvoke,
  ((channel, listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }) satisfies PluginRuntimeSubscribe,
);

contextBridge.exposeInMainWorld('pluginAPI', pluginAPI);
