export type UpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error';

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateInfo {
  status: UpdateStatus;
  supported: boolean;
  platform: NodeJS.Platform;
  currentVersion: string;
  latestVersion?: string | null;
  releaseName?: string | null;
  releaseNotes?: string | null;
  releaseDate?: string | null;
  manualUrl: string;
  progress?: UpdateProgress | null;
  error?: string | null;
}

export interface UpdateApi {
  getStatus: () => Promise<UpdateInfo>;
  check: () => Promise<UpdateInfo>;
  download: () => Promise<UpdateInfo>;
  install: () => Promise<{ ok: boolean }>;
  openReleasePage: () => Promise<void>;
  onEvent: (listener: (payload: UpdateInfo) => void) => () => void;
}

declare global {
  interface Window {
    updateApi: UpdateApi;
  }
}
