import { contextBridge, ipcRenderer } from "electron";
import type { PluginRuntimeApi } from "@/contracts/plugin_host";

const pluginAPI: PluginRuntimeApi = {
  getContext: () => ipcRenderer.invoke('plugin-runtime:get-context'),
  workspace: {
    getCurrent: () => ipcRenderer.invoke('plugin-runtime:workspace:get-current'),
  },
  data: {
    getCapabilities: () => ipcRenderer.invoke('plugin-runtime:data:get-capabilities'),
  },
  storage: {
    get: (key: string) => ipcRenderer.invoke('plugin-runtime:storage:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('plugin-runtime:storage:set', key, value),
  },
  navigation: {
    openRoute: (route: string) => ipcRenderer.invoke('plugin-runtime:navigation:open-route', route),
  },
  commands: {
    execute: (commandId: string, payload?: unknown) => ipcRenderer.invoke('plugin-runtime:commands:execute', commandId, payload),
  },
  ui: {
    getPages: () => ipcRenderer.invoke('plugin-runtime:ui:get-pages'),
  },
  system: {
    getCapabilities: () => ipcRenderer.invoke('plugin-runtime:system:get-capabilities'),
    showNotification: (payload) => ipcRenderer.invoke('plugin-runtime:system:show-notification', payload),
  },
  logger: {
    info: (message: string, meta?: unknown) => ipcRenderer.invoke('plugin-runtime:logger:info', message, meta),
    error: (message: string, meta?: unknown) => ipcRenderer.invoke('plugin-runtime:logger:error', message, meta),
  },
};

contextBridge.exposeInMainWorld('pluginAPI', pluginAPI);
