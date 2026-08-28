export type AndroidToolName = 'adb' | 'fastboot' | 'scrcpy' | 'scrcpy-server';
export type AndroidTransport = 'adb-usb' | 'adb-tcpip' | 'fastboot-usb';
export type AndroidDeviceState = 'device' | 'unauthorized' | 'offline' | 'bootloader' | 'no-permissions' | 'unknown';

export interface AndroidToolchainStatus {
  available: boolean;
  platform: string;
  architecture: string;
  versions: { adb?: string; fastboot?: string; scrcpy?: string; scrcpyServer?: string };
  rootPath?: string;
  errorCode?: string;
  errorMessage?: string;
  checksums?: Partial<Record<AndroidToolName, string>>;
}

export interface AndroidDevice {
  serial: string;
  state: AndroidDeviceState;
  transport: AndroidTransport;
  model?: string;
  product?: string;
  androidVersion?: string;
  sdkLevel?: number;
  usb?: boolean;
}

export interface AndroidSession {
  sessionId: string;
  deviceSerial: string;
  mode: 'mirror-control' | 'audio-only' | 'otg';
  keyboard: 'sdk' | 'uhid' | 'aoa' | 'disabled';
  mouse: 'sdk' | 'uhid' | 'aoa' | 'disabled';
  pid?: number;
  ownerPluginId?: string;
  status: 'starting' | 'running' | 'stopping' | 'exited' | 'failed';
  startedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface AndroidSessionEvent {
  type: 'created' | 'started' | 'stopped' | 'exited' | 'failed' | 'device-disconnected';
  session: AndroidSession;
  timestamp: string;
}

export interface AndroidDeviceEvent {
  devices: AndroidDevice[];
  timestamp: string;
}

export interface AndroidToolsApi {
  getToolchainStatus: () => Promise<AndroidToolchainStatus>;
  listDevices: () => Promise<AndroidDevice[]>;
  onDevicesChanged: (listener: (event: AndroidDeviceEvent) => void) => () => void;
  listSessions: () => Promise<AndroidSession[]>;
  startMirror: (input: { deviceSerial: string; keyboard?: 'uhid' | 'sdk'; mouse?: 'uhid' | 'sdk' }) => Promise<AndroidSession>;
  startAudio: (input: { deviceSerial: string; duplicateOnDevice?: boolean }) => Promise<AndroidSession>;
  startOtg: (input: { deviceSerial: string; keyboard?: boolean; mouse?: boolean }) => Promise<AndroidSession>;
  stopSession: (sessionId: string) => Promise<void>;
  getFastbootDevices: () => Promise<AndroidDevice[]>;
  fastbootGetVars: (deviceSerial: string, names: string[]) => Promise<Record<string, string>>;
  fastbootReboot: (deviceSerial: string, target?: 'system' | 'bootloader') => Promise<void>;
  onSessionEvent: (listener: (event: AndroidSessionEvent) => void) => () => void;
}

declare global {
  interface Window {
    androidApi: AndroidToolsApi;
  }
}

