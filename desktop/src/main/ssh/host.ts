import { BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import * as nativeCore from '@guyantools/core';
import { dbManager } from '../../core/database';
import type {
  ConnectSshInput,
  CreateSshProfileInput,
  CreateSshProfileFolderInput,
  CreatePortForwardInput,
  ExportSshManagedKeyData,
  GenerateSshManagedKeyInput,
  HostVerifyResult,
  ImportSshManagedKeyInput,
  PortForwardStatus,
  PortForwardTrafficInfo,
  PortOccupantInfo,
  ResizeSshSessionInput,
  SshAgentIdentity,
  SshEventEnvelope,
  SshKnownHost,
  SshManagedKey,
  SshPortForward,
  SshProfile,
  SshProfileFolder,
  SshSessionDescriptor,
  TrustHostInput,
  UpdateSshProfileInput,
  UpdateSshProfileFolderInput,
  UpdatePortForwardInput,
} from '@/contracts/ssh';

const execFileAsync = promisify(execFile);

type JsSshHostConstructor = new (db: unknown) => {
  registerEventSink(callback: (payload: string) => void): void;
  listProfiles(): Promise<SshProfile[]>;
  listFolders(): Promise<SshProfileFolder[]>;
  createFolder(input: unknown): Promise<SshProfileFolder>;
  updateFolder(input: unknown): Promise<SshProfileFolder>;
  deleteFolder(id: string): Promise<void>;
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
  private static readonly MAX_SESSION_BUFFER_CHARS = 2_000_000;

  private host!: JsSshHostInstance;
  private readonly emitter = new EventEmitter();
  private readonly sessionBuffers = new Map<string, string>();
  private readonly attachedTargets = new Map<string, string>();
  private initialized = false;

  /** Lazy initialization — call after dbManager.initialize() */
  initialize() {
    if (this.initialized) return;
    const db = dbManager.getDatabase();
    this.host = new JsSshHost(db);
    this.host.registerEventSink((payload: string) => {
      try {
        const rawEvent = JSON.parse(payload) as SshEventEnvelope;
        this.updateSessionBuffer(rawEvent);
        const event = this.withAttachedTarget(rawEvent);
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

  async listFolders(): Promise<SshProfileFolder[]> {
    return this.host.listFolders();
  }

  async createFolder(input: CreateSshProfileFolderInput): Promise<SshProfileFolder> {
    return this.host.createFolder(input);
  }

  async updateFolder(input: UpdateSshProfileFolderInput): Promise<SshProfileFolder> {
    return this.host.updateFolder(input);
  }

  async deleteFolder(id: string): Promise<void> {
    return this.host.deleteFolder(id);
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
    return this.host.listSessions().map((session) => this.withSessionAttachedTarget(session));
  }

  async connect(input: ConnectSshInput): Promise<SshSessionDescriptor> {
    const session = await this.host.connect(input);
    this.attachedTargets.set(session.sessionId, 'main');
    if (!this.sessionBuffers.has(session.sessionId)) {
      this.sessionBuffers.set(session.sessionId, '');
    }
    return this.withSessionAttachedTarget(session);
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

  getBuffer(sessionId: string) {
    return this.sessionBuffers.get(sessionId) ?? '';
  }

  clearBuffer(sessionId: string) {
    this.sessionBuffers.set(sessionId, '');
  }

  attachSession(sessionId: string, target: string) {
    this.attachedTargets.set(sessionId, normalizeTarget(target));
    this.emitSessionState(sessionId, 'session attached');
  }

  attachToMain(sessionId: string) {
    this.attachSession(sessionId, 'main');
  }

  closeDetachedView(sessionId: string, target: string) {
    if (this.attachedTargets.get(sessionId) !== target) {
      return;
    }

    this.attachedTargets.set(sessionId, 'main');
    this.emitSessionState(sessionId, 'detached view closed');
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

  async getPortOccupant(host: string, port: number): Promise<PortOccupantInfo | null> {
    return findPortOccupant(host, port);
  }

  async killPortOccupant(pid: number): Promise<void> {
    await killProcess(pid);
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

  private withAttachedTarget(event: SshEventEnvelope): SshEventEnvelope {
    return {
      ...event,
      attachedTarget: event.attachedTarget ?? this.attachedTargets.get(event.sessionId) ?? 'main',
    };
  }

  private withSessionAttachedTarget(session: SshSessionDescriptor): SshSessionDescriptor {
    return {
      ...session,
      attachedTarget: this.attachedTargets.get(session.sessionId) ?? session.attachedTarget ?? 'main',
    };
  }

  private emitSessionState(sessionId: string, message: string) {
    const session = this.host.listSessions().find((item) => item.sessionId === sessionId);
    if (!session) return;

    const event: SshEventEnvelope = {
      eventType: 'state',
      sessionId,
      status: session.status,
      attachedTarget: this.attachedTargets.get(sessionId) ?? 'main',
      message,
    };

    this.emitter.emit('event', event);
    this.broadcast(event);
  }

  private updateSessionBuffer(event: SshEventEnvelope) {
    if (event.eventType === 'data') {
      this.appendSessionBuffer(event.sessionId, event.data ?? '');
      return;
    }

    if (event.eventType === 'exit') {
      this.attachedTargets.delete(event.sessionId);
      this.sessionBuffers.delete(event.sessionId);
    }
  }

  private appendSessionBuffer(sessionId: string, data: string) {
    if (!data) return;

    const previous = this.sessionBuffers.get(sessionId) ?? '';
    const next = `${previous}${data}`;
    if (next.length <= SshHost.MAX_SESSION_BUFFER_CHARS) {
      this.sessionBuffers.set(sessionId, next);
      return;
    }

    this.sessionBuffers.set(sessionId, next.slice(next.length - SshHost.MAX_SESSION_BUFFER_CHARS));
  }

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

function normalizeTarget(value: string) {
  const trimmed = value.trim();
  return trimmed || 'main';
}

async function findPortOccupant(host: string, port: number): Promise<PortOccupantInfo | null> {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return null;
  }

  if (process.platform === 'win32') {
    return findWindowsPortOccupant(host, port);
  }

  return findUnixPortOccupant(port);
}

async function findWindowsPortOccupant(host: string, port: number): Promise<PortOccupantInfo | null> {
  const escapedHost = host.replace(/'/g, "''");
  const command = [
    `$connections = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue`,
    `$connections = @($connections | Where-Object { '${escapedHost}' -eq '' -or $_.LocalAddress -eq '${escapedHost}' -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' -or '${escapedHost}' -eq '127.0.0.1' -or '${escapedHost}' -eq 'localhost' })`,
    'if ($connections.Count -eq 0) { exit 0 }',
    '$connection = $connections | Select-Object -First 1',
    '$process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue',
    '[PSCustomObject]@{',
    '  pid = [int]$connection.OwningProcess;',
    '  name = if ($process) { $process.ProcessName } else { "" };',
    '  command = if ($process) { $process.Path } else { "" };',
    '  localAddress = [string]$connection.LocalAddress;',
    `  localPort = ${port}`,
    '} | ConvertTo-Json -Compress',
  ].join('; ');

  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
      windowsHide: true,
      timeout: 4000,
    });
    return parsePortOccupantJson(stdout, port);
  } catch {
    return null;
  }
}

async function findUnixPortOccupant(port: number): Promise<PortOccupantInfo | null> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      timeout: 4000,
    });
    const rows = stdout.split(/\r?\n/).filter(Boolean);
    const line = rows.find((row, index) => index > 0 && row.includes(`:${port}`));
    if (!line) {
      return null;
    }
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[1]);
    if (!Number.isInteger(pid) || pid <= 0) {
      return null;
    }
    return {
      pid,
      name: parts[0] ?? '',
      command: parts.slice(8).join(' '),
      localPort: port,
    };
  } catch {
    return null;
  }
}

function parsePortOccupantJson(stdout: string, port: number): PortOccupantInfo | null {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Partial<PortOccupantInfo>;
    const pid = Number(parsed.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      return null;
    }
    return {
      pid,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      command: typeof parsed.command === 'string' ? parsed.command : '',
      localAddress: typeof parsed.localAddress === 'string' ? parsed.localAddress : undefined,
      localPort: Number(parsed.localPort) || port,
    };
  } catch {
    return null;
  }
}

async function killProcess(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('Invalid process id');
  }

  if (pid === process.pid) {
    throw new Error('Refusing to terminate the current application process');
  }

  if (process.platform === 'win32') {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/F'], {
      windowsHide: true,
      timeout: 5000,
    });
    return;
  }

  process.kill(pid, 'SIGTERM');
}
