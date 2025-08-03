// export * from './plugin.d.ts';
export { };

interface IpcRenderer {
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, listener: (...args: any[]) => void) => () => void;
}

interface PluginAPI {
  getPluginInfo: () => void;
  send: (message: string) => void;
}

declare global {
  namespace globalThis {
    var LOCAL_PLUGINS: {
      plguins: PluginInfo[];
      downloadPlugin: (plugin: PluginInfo) => Promise<void>;
      importFromLocalFiles: () => Promise<void>;
      getPluginWebContentsView: (plugin: PluginInfo, windowOptions: { width: number, height: number, x: number, y: number }) => Promise<WebContentsView>;
    };
  }

  interface Window {
    ipcRenderer?: IpcRenderer;
    pluginAPI?: PluginAPI;
  }
}

