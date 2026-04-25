export type TerminalRendererMode = 'auto' | 'standard' | 'webgl';
export type TerminalSessionStatus = 'running' | 'terminating' | 'exited' | 'failed';

export interface TerminalProfile {
  id: string;
  label: string;
  command: string;
  args: string[];
  isDefault: boolean;
}

export interface TerminalSessionDescriptor {
  sessionId: string;
  profileId: string;
  profileLabel: string;
  cwd?: string;
  attachedTarget: string;
  status: TerminalSessionStatus | string;
  processId?: number;
}

export interface CreateTerminalSessionPayload {
  profileId?: string;
  cwd?: string;
  args?: string[];
  env?: Record<string, string>;
  rows: number;
  cols: number;
  pixelWidth: number;
  pixelHeight: number;
  attachedTarget?: string;
}

export interface ResizeTerminalSessionPayload {
  sessionId: string;
  rows: number;
  cols: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface TerminalEventEnvelope {
  eventType: 'data' | 'exit' | 'state' | 'error' | string;
  sessionId: string;
  data?: string;
  status?: TerminalSessionStatus | string;
  attachedTarget?: string;
  message?: string;
  processId?: number;
  exitCode?: number;
  signal?: string;
}

export interface TerminalFeatureConfig {
  defaultProfileId?: string;
  defaultCwd?: string;
  env: Record<string, string>;
  rendererMode: TerminalRendererMode;
  enableSixel: boolean;
  detachToWindowByDefault: boolean;
  /** Max automatic SSH reconnect attempts before waiting for manual input */
  sshReconnectMaxAttempts: number;
  /** Active terminal color scheme identifier */
  colorSchemeId: string;
  /** Viewport background type: color, image, or video */
  viewportBgType: 'color' | 'image' | 'video';
  /** Viewport background color / gradient CSS value */
  viewportBgColor: string;
  /** Viewport background image (data-URL or file path) */
  viewportBgImage: string;
  /** Viewport background video (data-URL or file path) */
  viewportBgVideo: string;
  /** Viewport background style overrides */
  viewportBgStyle: import('./background').BackgroundStyleConfig;
}

export interface TerminalApi {
  listProfiles: () => Promise<TerminalProfile[]>;
  listSessions: () => Promise<TerminalSessionDescriptor[]>;
  createSession: (payload: CreateTerminalSessionPayload) => Promise<TerminalSessionDescriptor>;
  write: (sessionId: string, data: string) => Promise<void>;
  resizeSession: (payload: ResizeTerminalSessionPayload) => Promise<void>;
  killSession: (sessionId: string) => Promise<void>;
  attachSession: (sessionId: string, target: string) => Promise<void>;
  attachToMain: (sessionId: string) => Promise<void>;
  detachToWindow: (sessionId: string) => Promise<void>;
  readClipboardText: () => Promise<string>;
  writeClipboardText: (text: string) => Promise<void>;
  onEvent: (listener: (event: TerminalEventEnvelope) => void) => () => void;
}

declare global {
  interface Window {
    terminalApi: TerminalApi;
  }
}
