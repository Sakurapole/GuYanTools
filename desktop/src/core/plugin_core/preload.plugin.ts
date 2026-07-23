import { contextBridge, ipcRenderer } from 'electron';
import { createPluginApi } from './sdk';

const pluginAPI = createPluginApi((channel, ...args) => ipcRenderer.invoke(channel, ...args));

contextBridge.exposeInMainWorld('pluginAPI', pluginAPI);
