import type {
  ModelRuntimeApi,
  ModelPythonEnvironment,
} from '../../../../../../src/contracts/plugin_model';
import type { JobRecord } from '../../../../../../src/contracts/plugin_media';
import type { NotificationPayload } from '../../../../../../src/contracts/notification';

export type Backend = 'cpu' | 'cuda' | 'tensorrt' | 'onnxruntime' | 'webgpu';
export type Device = 'cpu' | 'cuda';
export type HandleKind = 'input' | 'weights' | 'output';
export type Environment = ModelPythonEnvironment;
export type SelectedFile = { id: string; name?: string; size?: number };

export type PluginApi = {
  models: ModelRuntimeApi;
  storage: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  jobs: { onEvent: (callback: (job: JobRecord) => void) => (() => void) | void };
  ui: {
    getTheme: () => Promise<{ mode: string }>;
    onThemeChanged: (callback: (theme: { mode: string }) => void) => (() => void) | void;
  };
  system: {
    openExternal: (url: string) => Promise<void> | void;
    showNotification?: (payload: NotificationPayload) => Promise<void>;
  };
};

export type WorkbenchNav = 'workbench' | 'models' | 'history' | 'runtime';
