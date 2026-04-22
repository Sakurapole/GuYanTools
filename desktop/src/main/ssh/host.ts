import { BrowserWindow } from 'electron';
import { EventEmitter } from 'node:events';
import * as nativeCore from '@guyantools/core';
import { dbManager } from '../../core/database';
import type {
  ConnectSshInput,
  CreateSshProfileInput,
  CreatePortForwardInput,
  ExportSshManagedKeyData,
  GenerateSshManagedKeyInput,
  HostVerifyResult,
  ImportSshManagedKeyInput,
  PortForwardStatus,
  PortForwardTrafficInfo,
  ResizeSshSessionInput,
  SshAgentIdentity,
  SshEventEnvelope,
  SshKnownHost,
  SshManagedKey,
  SshPortForward,
  SshProfile,
  SshSessionDescriptor,
  TrustHostInput,
  UpdateSshProfileInput,
  UpdatePortForwardInput,
} from '@/contracts/ssh';

type JsSshHostConstructor = new (db: unknown) => {
  registerEventSink(callback: (payload: string) => void): void;
  listProfiles(): Promise<SshProfile[]>;
  createProfile(input: unknown): Promise<SshProfile>;
  updateProfile(input: unknown): Promise<SshProfile>;
  deleteProfile(id: string): Promise<void>;
  listSessions(): SshSessionDescriptor[];
  connect(input: unknown): Promise<SshSessionDescriptor>;
  disconnect(sessionId: string): void;
  write(sessionId: string, data: string): void;
  resizeSession(input: unknown): void;
  listKnownHosts(): Promise<SshKnownHost[]>;
  verifyHostFingerprint(
    host: string,
    port: number,
    algorithm: string,
    fingerprint: string,
  ): Promise<HostVerifyResult>;
  trustHost(input: unknown): Promise<void>;
  deleteKnownHost(id: string): Promise<void>;
  listAgentIdentities(): Promise<SshAgentIdentity[]>;
  listManagedKeys(): Promise<SshManagedKey[]>;
  generateManagedKey(input: unknown): Promise<SshManagedKey>;
  importManagedKey(input: unknown): Promise<SshManagedKey>;
  exportManagedKey(id: string): Promise<ExportSshManagedKeyData>;
  deleteManagedKey(id: string): Promise<void>;
  listPortForwards(profileId: string): Promise<SshPortForward[]>;
  createPortForward(input: unknown): Promise<SshPortForward>;
  updatePortForward(input: unknown): Promise<SshPortForward>;
  deletePortForward(id: string): Promise<void>;
  startPortForward(sessionId: string, forwardId: string): Promise<void>;
  stopPortForward(sessionId: string, forwardId: string): Promise<void>;
  listForwardStatus(sessionId: string): PortForwardStatus[];
  getForwardTraffic(sessionId: string): PortForwardTrafficInfo[];
  exportPortForwards(profileId: string): Promise<string>;
  importPortForwards(profileId: string, jsonData: string): Promise<number>;
};

const JsSshHost = (nativeCore as unknown as { JsSshHost: JsSshHostConstructor }).JsSshHost;
type JsSshHostInstance = InstanceType<JsSshHostConstructor>;

// ── SSH host singleton ────────────────────────────────────────

class SshHost {
  private host!: JsSshHostInstance;
  private readonly emitter = new EventEmitter();
  private initialized = false;

  /** Lazy initialization — call after dbManager.initialize() */
  initialize() {
    if (this.initialized) return;
    const db = dbManager.getDatabase();
    this.host = new JsSshHost(db);
    this.host.registerEventSink((payload: string) => {
      try {
        const event = JSON.parse(payload) as SshEventEnvelope;
        this.emitter.emit('event', event);
        this.broadcast(event);
      } catch (err) {
        console.error('[SshHost] Failed to parse SSH event payload:', err);
      }
    });
    this.initialized = true;
    console.log('[SshHost] Initialized');
  }

  // ── Event subscription ───────────────────────────────────────

  onEvent(listener: (event: SshEventEnvelope) => void) {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  // ── Profile CRUD ─────────────────────────────────────────────

  async listProfiles(): Promise<SshProfile[]> {
    return this.host.listProfiles();
  }

  async createProfile(input: CreateSshProfileInput): Promise<SshProfile> {
    return this.host.createProfile(input);
  }

  async updateProfile(input: UpdateSshProfileInput): Promise<SshProfile> {
    return this.host.updateProfile(input);
  }

  async deleteProfile(id: string): Promise<void> {
    return this.host.deleteProfile(id);
  }

  // ── Connection management ─────────────────────────────────────

  listSessions(): SshSessionDescriptor[] {
    return this.host.listSessions();
  }

  async connect(input: ConnectSshInput): Promise<SshSessionDescriptor> {
    return this.host.connect(input);
  }

  disconnect(sessionId: string): void {
    try {
      this.host.disconnect(sessionId);
    } catch (err) {
      // Re-throw so the IPC handler can propagate it to the renderer
      throw new Error(`disconnect failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── I/O ──────────────────────────────────────────────────────

  write(sessionId: string, data: string): void {
    this.host.write(sessionId, data);
  }

  resizeSession(input: ResizeSshSessionInput): void {
    this.host.resizeSession(input);
  }

  // ── Known hosts ───────────────────────────────────────────────

  async listKnownHosts(): Promise<SshKnownHost[]> {
    return this.host.listKnownHosts();
  }

  async verifyHostFingerprint(
    host: string,
    port: number,
    algorithm: string,
    fingerprint: string,
  ): Promise<HostVerifyResult> {
    return this.host.verifyHostFingerprint(host, port, algorithm, fingerprint);
  }

  async trustHost(input: TrustHostInput): Promise<void> {
    return this.host.trustHost(input);
  }

  async deleteKnownHost(id: string): Promise<void> {
    return this.host.deleteKnownHost(id);
  }

  // ── SSH Agent ─────────────────────────────────────────────

  async listAgentIdentities(): Promise<SshAgentIdentity[]> {
    return this.host.listAgentIdentities();
  }

  async listManagedKeys(): Promise<SshManagedKey[]> {
    return this.host.listManagedKeys();
  }

  async generateManagedKey(input: GenerateSshManagedKeyInput): Promise<SshManagedKey> {
    return this.host.generateManagedKey(input);
  }

  async importManagedKey(input: ImportSshManagedKeyInput): Promise<SshManagedKey> {
    return this.host.importManagedKey(input);
  }

  async exportManagedKey(id: string): Promise<ExportSshManagedKeyData> {
    return this.host.exportManagedKey(id);
  }

  async deleteManagedKey(id: string): Promise<void> {
    return this.host.deleteManagedKey(id);
  }

  // ── Port forwarding ─────────────────────────────────────────

  async listPortForwards(profileId: string): Promise<SshPortForward[]> {
    return this.host.listPortForwards(profileId);
  }

  async createPortForward(input: CreatePortForwardInput): Promise<SshPortForward> {
    return this.host.createPortForward(input);
  }

  async updatePortForward(input: UpdatePortForwardInput): Promise<SshPortForward> {
    return this.host.updatePortForward(input);
  }

  async deletePortForward(id: string): Promise<void> {
    return this.host.deletePortForward(id);
  }

  async startPortForward(sessionId: string, forwardId: string): Promise<void> {
    return this.host.startPortForward(sessionId, forwardId);
  }

  async stopPortForward(sessionId: string, forwardId: string): Promise<void> {
    return this.host.stopPortForward(sessionId, forwardId);
  }

  listForwardStatus(sessionId: string): PortForwardStatus[] {
    return this.host.listForwardStatus(sessionId);
  }

  getForwardTraffic(sessionId: string): PortForwardTrafficInfo[] {
    return this.host.getForwardTraffic(sessionId);
  }

  async exportPortForwards(profileId: string): Promise<string> {
    return this.host.exportPortForwards(profileId);
  }

  async importPortForwards(profileId: string, jsonData: string): Promise<number> {
    return this.host.importPortForwards(profileId, jsonData);
  }

  // ── Internal ─────────────────────────────────────────────

  /** Broadcast an SSH event to all renderer windows */
  private broadcast(event: SshEventEnvelope) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('ssh:event', event);
      }
    }
  }
}

export const sshHost = new SshHost();
