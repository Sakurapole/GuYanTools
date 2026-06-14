import type { BackgroundStyleConfig, BackgroundType } from './background';

export type QuickLaunchProviderId =
  | 'internal-route'
  | 'terminal'
  | 'ssh'
  | 'ftp'
  | 'todo'
  | 'knowledge'
  | 'plugin'
  | 'app'
  | 'file';

export type QuickLaunchAction =
  | { type: 'open-route'; route: string }
  | { type: 'open-terminal-profile'; profileId: string }
  | { type: 'open-ssh-profile'; profileId: string }
  | { type: 'open-ftp-profile'; profileId: string }
  | { type: 'open-todo'; todoId: string }
  | { type: 'open-knowledge-result'; sourceId: string; nodeId?: string }
  | { type: 'open-plugin-page'; pluginId: string; pageId: string; routePath: string }
  | { type: 'execute-plugin-command'; pluginId: string; commandId: string; payload?: unknown }
  | { type: 'open-path'; path: string }
  | { type: 'open-windows-app'; appUserModelId: string }
  | { type: 'show-path-in-folder'; path: string }
  | { type: 'open-external'; url: string }
  | { type: 'copy-text'; text: string };

export type QuickLaunchExecutionMode =
  | 'default'
  | 'open-detached-window'
  | 'open-containing-folder'
  | 'run-as-admin'
  | 'copy'
  | 'copy-path';

export interface QuickLaunchExecuteOptions {
  mode?: QuickLaunchExecutionMode;
}

export interface QuickLaunchResizeInput {
  widthDelta?: number;
  heightDelta?: number;
}

export interface QuickLaunchFeatureConfig {
  enabled: boolean;
  maxResults: number;
  enabledProviders: QuickLaunchProviderId[];
  hideOnBlur: boolean;
  everythingEsPath: string;
  backgroundType: BackgroundType;
  backgroundColor: string;
  backgroundImage: string;
  backgroundVideo: string;
  backgroundStyle: BackgroundStyleConfig;
  windowOpacity: number;
  selectionColor: string;
  selectionOpacity: number;
  resultTitleColor: string;
  resultSubtitleColor: string;
}

export interface QuickLaunchSearchInput {
  query: string;
  limit?: number;
  providers?: QuickLaunchProviderId[];
  sessionId?: string;
}

export interface QuickLaunchHighlightRange {
  start: number;
  end: number;
}

export interface QuickLaunchResult {
  id: string;
  providerId: QuickLaunchProviderId;
  title: string;
  subtitle?: string;
  detail?: string;
  iconDataUrl?: string;
  keywords?: string[];
  score: number;
  lastUsedAt?: number;
  useCount?: number;
  highlights?: {
    title?: QuickLaunchHighlightRange[];
    subtitle?: QuickLaunchHighlightRange[];
  };
  action: QuickLaunchAction;
}

export interface QuickLaunchSearchResponse {
  query: string;
  sessionId: string;
  results: QuickLaunchResult[];
  searchedProviders: QuickLaunchProviderId[];
  elapsedMs: number;
  partial: boolean;
  errors: Array<{ providerId: QuickLaunchProviderId; message: string }>;
}

export interface QuickLaunchRefreshInput {
  providers?: QuickLaunchProviderId[];
}

export interface QuickLaunchRefreshResponse {
  refreshedProviders: QuickLaunchProviderId[];
  elapsedMs: number;
}

export interface QuickLaunchApi {
  search: (input: QuickLaunchSearchInput) => Promise<QuickLaunchSearchResponse>;
  execute: (result: QuickLaunchResult, options?: QuickLaunchExecuteOptions) => Promise<void>;
  refreshIndex: (input?: QuickLaunchRefreshInput) => Promise<QuickLaunchRefreshResponse>;
  setGameMode: (enabled: boolean) => Promise<boolean>;
  getGameModeStatus: () => Promise<boolean>;
  resizeWindow: (input: QuickLaunchResizeInput) => Promise<void>;
  show: () => Promise<void>;
  close: () => Promise<void>;
  notifyReady: () => Promise<void>;
  onReveal: (listener: () => void) => () => void;
  onHidden: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    quickLaunchApi?: QuickLaunchApi;
  }
}
