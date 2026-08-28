import type {
  AndroidDevice,
  AndroidDeviceEvent,
  AndroidSession,
  AndroidSessionEvent,
} from '@/contracts/android-tools';
import type { PluginRuntimeContext } from '@/contracts/plugin_host';
import { androidAdbService, androidFastbootService, androidScrcpyService } from '../android-tools';
import { validateDeviceSerial, validateFastbootVarNames, validateSessionId } from '../android-tools/ipc_guards';
import { PluginContextGuard } from './context_guard';

interface AndroidDeviceServiceLike {
  listDevices: () => Promise<AndroidDevice[]>;
  onDevicesChanged: (listener: (event: AndroidDeviceEvent) => void) => () => void;
}

interface AndroidSessionServiceLike {
  startMirror: (input: { deviceSerial: string; keyboard?: 'uhid' | 'sdk'; mouse?: 'uhid' | 'sdk' }, ownerPluginId?: string) => Promise<AndroidSession>;
  startAudio: (input: { deviceSerial: string; duplicateOnDevice?: boolean }, ownerPluginId?: string) => Promise<AndroidSession>;
  startOtg: (input: { deviceSerial: string; keyboard?: boolean; mouse?: boolean }, ownerPluginId?: string) => Promise<AndroidSession>;
  listSessions: () => AndroidSession[];
  stopSession: (sessionId: string) => Promise<void>;
  stopSessionsForOwner: (ownerPluginId: string) => Promise<void>;
  onSessionEvent: (listener: (event: AndroidSessionEvent) => void) => () => void;
}

interface AndroidFastbootServiceLike {
  listDevices: () => Promise<AndroidDevice[]>;
  getVars: (serial: string, names: string[]) => Promise<Record<string, string>>;
  reboot: (serial: string, target?: 'system' | 'bootloader') => Promise<void>;
}

export interface AndroidHostServiceOptions {
  devices?: AndroidDeviceServiceLike;
  sessions?: AndroidSessionServiceLike;
  fastboot?: AndroidFastbootServiceLike;
  guard?: PluginContextGuard;
}

type MirrorInput = { deviceSerial: string; keyboard?: 'uhid' | 'sdk'; mouse?: 'uhid' | 'sdk' };
type AudioInput = { deviceSerial: string; duplicateOnDevice?: boolean };
type OtgInput = { deviceSerial: string; keyboard?: boolean; mouse?: boolean };

function readObject(input: unknown, allowedKeys: readonly string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('ANDROID_PAYLOAD_INVALID');
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some(key => !allowedKeys.includes(key))) throw new Error('ANDROID_PAYLOAD_INVALID');
  return record;
}

function readSerial(input: Record<string, unknown>) {
  return validateDeviceSerial(input.deviceSerial);
}

function readMirrorInput(input: unknown): MirrorInput {
  const record = readObject(input, ['deviceSerial', 'keyboard', 'mouse']);
  const deviceSerial = readSerial(record);
  if (record.keyboard !== undefined && record.keyboard !== 'uhid' && record.keyboard !== 'sdk') throw new Error('ANDROID_PAYLOAD_INVALID');
  if (record.mouse !== undefined && record.mouse !== 'uhid' && record.mouse !== 'sdk') throw new Error('ANDROID_PAYLOAD_INVALID');
  return {
    deviceSerial,
    keyboard: record.keyboard as MirrorInput['keyboard'],
    mouse: record.mouse as MirrorInput['mouse'],
  };
}

function readAudioInput(input: unknown): AudioInput {
  const record = readObject(input, ['deviceSerial', 'duplicateOnDevice']);
  const deviceSerial = readSerial(record);
  if (record.duplicateOnDevice !== undefined && typeof record.duplicateOnDevice !== 'boolean') throw new Error('ANDROID_PAYLOAD_INVALID');
  return { deviceSerial, duplicateOnDevice: record.duplicateOnDevice as boolean | undefined };
}

function readOtgInput(input: unknown): OtgInput {
  const record = readObject(input, ['deviceSerial', 'keyboard', 'mouse']);
  const deviceSerial = readSerial(record);
  if (record.keyboard !== undefined && typeof record.keyboard !== 'boolean') throw new Error('ANDROID_PAYLOAD_INVALID');
  if (record.mouse !== undefined && typeof record.mouse !== 'boolean') throw new Error('ANDROID_PAYLOAD_INVALID');
  return {
    deviceSerial,
    keyboard: record.keyboard as boolean | undefined,
    mouse: record.mouse as boolean | undefined,
  };
}

function cloneSession(session: AndroidSession): AndroidSession {
  return { ...session };
}

export class AndroidHostService {
  private readonly devices: AndroidDeviceServiceLike;
  private readonly sessions: AndroidSessionServiceLike;
  private readonly fastboot: AndroidFastbootServiceLike;
  private readonly guard: PluginContextGuard;
  private readonly subscriptions = new Map<string, Set<() => void>>();

  constructor(options: AndroidHostServiceOptions = {}) {
    this.devices = options.devices ?? androidAdbService;
    this.sessions = options.sessions ?? androidScrcpyService;
    this.fastboot = options.fastboot ?? androidFastbootService;
    this.guard = options.guard ?? new PluginContextGuard();
  }

  async listDevices(context: PluginRuntimeContext) {
    this.guard.requirePermission(context, 'android.devices.read');
    return this.devices.listDevices();
  }

  onDevicesChanged(context: PluginRuntimeContext, listener: (event: AndroidDeviceEvent) => void) {
    this.guard.requirePermission(context, 'android.devices.read');
    const unsubscribe = this.devices.onDevicesChanged(event => listener({ devices: event.devices.map(device => ({ ...device })), timestamp: event.timestamp }));
    return this.trackSubscription(context.pluginId, unsubscribe);
  }

  async listSessions(context: PluginRuntimeContext) {
    this.guard.requirePermission(context, 'android.sessions.read');
    return this.sessions.listSessions()
      .filter(session => session.ownerPluginId === context.pluginId)
      .map(cloneSession);
  }

  async startMirror(context: PluginRuntimeContext, input: MirrorInput) {
    this.guard.requirePermission(context, 'android.sessions.control');
    const normalized = readMirrorInput(input);
    const session = await this.sessions.startMirror(normalized, context.pluginId);
    return cloneSession({ ...session, ownerPluginId: context.pluginId });
  }

  async startAudio(context: PluginRuntimeContext, input: AudioInput) {
    this.guard.requirePermission(context, 'android.sessions.control');
    this.guard.requirePermission(context, 'android.audio.playback');
    const normalized = readAudioInput(input);
    const session = await this.sessions.startAudio(normalized, context.pluginId);
    return cloneSession({ ...session, ownerPluginId: context.pluginId });
  }

  async startOtg(context: PluginRuntimeContext, input: OtgInput) {
    this.guard.requirePermission(context, 'android.sessions.control');
    this.guard.requirePermission(context, 'android.otg.control');
    const normalized = readOtgInput(input);
    const session = await this.sessions.startOtg(normalized, context.pluginId);
    return cloneSession({ ...session, ownerPluginId: context.pluginId });
  }

  async stop(context: PluginRuntimeContext, sessionId: string) {
    this.guard.requirePermission(context, 'android.sessions.control');
    const id = validateSessionId(sessionId);
    const session = this.sessions.listSessions().find(candidate => candidate.sessionId === id);
    if (!session) throw new Error('ANDROID_SESSION_NOT_FOUND');
    this.guard.requireOwner(context, session.ownerPluginId ?? '');
    await this.sessions.stopSession(id);
  }

  onSessionEvent(context: PluginRuntimeContext, listener: (event: AndroidSessionEvent) => void) {
    this.guard.requirePermission(context, 'android.sessions.read');
    const unsubscribe = this.sessions.onSessionEvent(event => {
      if (event.session.ownerPluginId !== context.pluginId) return;
      listener({ ...event, session: cloneSession(event.session) });
    });
    return this.trackSubscription(context.pluginId, unsubscribe);
  }

  async getFastbootDevices(context: PluginRuntimeContext) {
    this.guard.requirePermission(context, 'android.fastboot.read');
    return this.fastboot.listDevices();
  }

  async getFastbootVars(context: PluginRuntimeContext, serial: string, names: string[]) {
    this.guard.requirePermission(context, 'android.fastboot.read');
    return this.fastboot.getVars(validateDeviceSerial(serial), validateFastbootVarNames(names));
  }

  async fastbootReboot(context: PluginRuntimeContext, serial: string, target?: 'system' | 'bootloader') {
    this.guard.requirePermission(context, 'android.fastboot.reboot');
    if (target !== undefined && target !== 'system' && target !== 'bootloader') throw new Error('ANDROID_FASTBOOT_OPERATION_DENIED');
    await this.fastboot.reboot(validateDeviceSerial(serial), target);
  }

  async stopSessionsForOwner(ownerPluginId: string) {
    this.disposePlugin(ownerPluginId);
    await this.sessions.stopSessionsForOwner(ownerPluginId);
  }

  disposePlugin(pluginId: string) {
    const subscriptions = this.subscriptions.get(pluginId);
    if (!subscriptions) return;
    for (const unsubscribe of subscriptions) unsubscribe();
    this.subscriptions.delete(pluginId);
  }

  getCapabilities() {
    return [
      'devices.list',
      'devices.events',
      'sessions.list',
      'sessions.startMirror',
      'sessions.startAudio',
      'sessions.startOtg',
      'sessions.stop',
      'sessions.events',
      'fastboot.list',
      'fastboot.getVars',
      'fastboot.reboot',
    ];
  }

  private trackSubscription(pluginId: string, unsubscribe: () => void) {
    const current = this.subscriptions.get(pluginId) ?? new Set<() => void>();
    current.add(unsubscribe);
    this.subscriptions.set(pluginId, current);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      unsubscribe();
      current.delete(unsubscribe);
      if (current.size === 0) this.subscriptions.delete(pluginId);
    };
  }
}
