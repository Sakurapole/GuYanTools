// export * from './plugin.d.ts';
export { };

interface IpcRenderer {
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, listener: (...args: any[]) => void) => () => void;
}

declare global {
  namespace globalThis {
    var LOCAL_PLUGINS: any;
  }

  interface Window {
    ipcRenderer?: IpcRenderer;
  }
}

