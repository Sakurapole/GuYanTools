import type { HomeLayoutApi } from '@/contracts/home_layout';
import type { AppConfigApi } from '@/contracts/app_config';
import type { HomeProfileApi } from '@/contracts/home_profile';
import type { HomeWorkspaceApi } from '@/contracts/home_workspace';
import type { PluginHostApi, PluginRuntimeApi, PluginRuntimeContext } from '@/contracts/plugin_host';
import type { NotificationApi } from '@/contracts/notification';
import type { TrayApi } from '@/contracts/tray';
import type { FtpApi } from '@/contracts/ftp';
import type { MultiDeviceClipboardApi } from '@/contracts/multi_device_clipboard';
import type { TodoApi } from '@/contracts/todo';
import type { KnowledgeApi, QuickNoteWindowApi } from '@/contracts/knowledge';

// export * from './plugin.d.ts';
export { };

interface IpcRenderer {
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, listener: (...args: any[]) => void) => () => void;
}

interface PluginAPI {
  getContext: () => Promise<PluginRuntimeContext>;
  workspace: PluginRuntimeApi['workspace'];
  data: PluginRuntimeApi['data'];
  storage: PluginRuntimeApi['storage'];
  navigation: PluginRuntimeApi['navigation'];
  commands: PluginRuntimeApi['commands'];
  ui: PluginRuntimeApi['ui'];
  system: PluginRuntimeApi['system'];
  logger: PluginRuntimeApi['logger'];
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
    homeLayoutApi?: HomeLayoutApi;
    homeProfileApi?: HomeProfileApi;
    pluginHostApi?: PluginHostApi;
    appConfigApi?: AppConfigApi;
    notificationApi?: NotificationApi;
    homeWorkspaceApi?: HomeWorkspaceApi;
    todoApi?: TodoApi;
    knowledgeApi?: KnowledgeApi;
    quickNoteWindowApi?: QuickNoteWindowApi;
    trayApi?: TrayApi;
    multiDeviceClipboardApi?: MultiDeviceClipboardApi;
    ftpApi: FtpApi;
  }
}

