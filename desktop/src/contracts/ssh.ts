// SSH client type definitions.
// Mirrors the Rust structs exposed via NAPI (JsSshHost).

// ── Jump host embedded in a profile ──────────────────────────

export interface SshJumpHost {
  host: string;
  port: number;
  username: string;
  /** 'password' | 'privateKey' | 'agent' */
  authType: string;
  /** Reference to another SSH profile used as jump host */
  profileId?: string;
  hostCaKeyPath?: string;
}

// ── Persisted SSH profile ─────────────────────────────────────

export interface SshProfile {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  /** 'password' | 'privateKey' | 'agent' */
  authType: string;
  /** Whether the credential is encrypted and persisted */
  savePassword: boolean;
  privateKeyPath?: string;
  certificatePath?: string;
  hostCaKeyPath?: string;
  /** JSON-serialized SshJumpHost */
  jumpHostJson?: string;
  autoReconnect: boolean;
  sortOrder: number;
  color?: string;
  /** JSON-serialized string[] */
  tags?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Input DTOs ────────────────────────────────────────────────

export interface CreateSshProfileInput {
  label: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  savePassword: boolean;
  /** Plain-text password (encrypted before persisting) */
  password?: string;
  privateKeyPath?: string;
  certificatePath?: string;
  hostCaKeyPath?: string;
  privateKeyPassphrase?: string;
  jumpHostJson?: string;
  autoReconnect: boolean;
  color?: string;
  tags?: string;
}

export interface UpdateSshProfileInput {
  id: string;
  label?: string;
  host?: string;
  port?: number;
  username?: string;
  authType?: string;
  savePassword?: boolean;
  password?: string;
  privateKeyPath?: string;
  certificatePath?: string;
  hostCaKeyPath?: string;
  privateKeyPassphrase?: string;
  jumpHostJson?: string;
  autoReconnect?: boolean;
  color?: string;
  tags?: string;
}

// ── Active session ────────────────────────────────────────────

export type SshSessionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'failed'
  | 'exited';

export interface SshSessionDescriptor {
  sessionId: string;
  profileId: string;
  profileLabel: string;
  host: string;
  port: number;
  username: string;
  status: SshSessionStatus | string;
  viaJumpHost: boolean;
  attachedTarget?: string;
}

// ── Connect input (runtime only) ──────────────────────────────

export interface ConnectSshInput {
  profileId: string;
  /** One-time password if not saved in profile */
  password?: string;
  rows: number;
  cols: number;
}

// ── Resize ────────────────────────────────────────────────────

export interface ResizeSshSessionInput {
  sessionId: string;
  rows: number;
  cols: number;
}

// ── Known hosts ───────────────────────────────────────────────

export interface SshKnownHost {
  id: string;
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  /** 'permanent' | 'session' */
  trustMode: string;
  addedAt: number;
}

export interface TrustHostInput {
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  /** 'permanent' | 'session' */
  trustMode: string;
}

export interface HostVerifyResult {
  /** 'trusted' | 'unknown' | 'mismatch' */
  status: 'trusted' | 'unknown' | 'mismatch';
  /** Stored fingerprint when status is 'mismatch' */
  storedFingerprint?: string;
}

// ── SSH Agent ─────────────────────────────────────────────────

export interface SshAgentIdentity {
  fingerprint: string;
  comment: string;
}

export interface SshManagedKey {
  id: string;
  label: string;
  algorithm: string;
  source: string;
  comment?: string;
  fingerprint: string;
  publicKey: string;
  isEncrypted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GenerateSshManagedKeyInput {
  label: string;
  algorithm: string;
  comment?: string;
}

export interface ImportSshManagedKeyInput {
  label?: string;
  privateKey?: string;
  filePath?: string;
}

export interface ExportSshManagedKeyData {
  id: string;
  label: string;
  algorithm: string;
  fingerprint: string;
  comment?: string;
  publicKey: string;
  privateKey: string;
  suggestedPrivateKeyName: string;
  suggestedPublicKeyName: string;
}

// ── Event envelope ─────────────────────────────────────────────
// SSH events share the terminal event bus.
// sessionId is prefixed with "ssh-" to distinguish from local sessions.

export interface SshEventEnvelope {
  eventType: 'data' | 'state' | 'exit' | 'error' | 'forward-state' | 'forward-error' | string;
  sessionId: string;
  data?: string;
  status?: SshSessionStatus | string;
  attachedTarget?: string;
  message?: string;
  exitCode?: number;
}

// ── Port forwarding ───────────────────────────────────────────

export type PortForwardType = 'local' | 'remote' | 'dynamic';
export type PortForwardRuntimeStatus = 'running' | 'stopped' | 'error' | 'starting';

export interface SshPortForward {
  id: string;
  profileId: string;
  label?: string;
  forwardType: PortForwardType;
  localHost: string;
  localPort: number;
  remoteHost?: string;
  remotePort?: number;
  autoStart: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreatePortForwardInput {
  profileId: string;
  label?: string;
  forwardType: PortForwardType;
  localHost?: string;
  localPort: number;
  remoteHost?: string;
  remotePort?: number;
  autoStart: boolean;
}

export interface UpdatePortForwardInput {
  id: string;
  label?: string;
  forwardType?: PortForwardType;
  localHost?: string;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
  autoStart?: boolean;
  enabled?: boolean;
}

export interface PortForwardStatus {
  forwardId: string;
  sessionId: string;
  status: PortForwardRuntimeStatus;
  activeConnections: number;
  errorMessage?: string;
}

/** 端口转发实时流量统计 */
export interface PortForwardTrafficInfo {
  forwardId: string;
  sessionId: string;
  /** 上行字节数 (本地 → 远程) */
  bytesSent: number;
  /** 下行字节数 (远程 → 本地) */
  bytesReceived: number;
  activeConnections: number;
}

// ── Renderer API (exposed via contextBridge) ──────────────────

export interface SshApi {
  // Profile CRUD
  listProfiles: () => Promise<SshProfile[]>;
  createProfile: (input: CreateSshProfileInput) => Promise<SshProfile>;
  updateProfile: (input: UpdateSshProfileInput) => Promise<SshProfile>;
  deleteProfile: (id: string) => Promise<void>;

  // Connection management
  listSessions: () => Promise<SshSessionDescriptor[]>;
  connect: (input: ConnectSshInput) => Promise<SshSessionDescriptor>;
  disconnect: (sessionId: string) => Promise<void>;
  detachToWindow: (sessionId: string, label?: string) => Promise<void>;
  getBuffer: (sessionId: string) => Promise<string>;
  clearBuffer: (sessionId: string) => Promise<void>;

  // I/O (writes go through the same pipe as terminal writes)
  write: (sessionId: string, data: string) => Promise<void>;
  resizeSession: (input: ResizeSshSessionInput) => Promise<void>;

  // Known hosts
  listKnownHosts: () => Promise<SshKnownHost[]>;
  verifyHostFingerprint: (host: string, port: number, algorithm: string, fingerprint: string) => Promise<HostVerifyResult>;
  trustHost: (input: TrustHostInput) => Promise<void>;
  deleteKnownHost: (id: string) => Promise<void>;

  // SSH Agent
  listAgentIdentities: () => Promise<SshAgentIdentity[]>;
  listManagedKeys: () => Promise<SshManagedKey[]>;
  generateManagedKey: (input: GenerateSshManagedKeyInput) => Promise<SshManagedKey>;
  importManagedKey: (input: ImportSshManagedKeyInput) => Promise<SshManagedKey>;
  exportManagedKey: (id: string) => Promise<ExportSshManagedKeyData>;
  deleteManagedKey: (id: string) => Promise<void>;

  // Port forwarding
  listPortForwards: (profileId: string) => Promise<SshPortForward[]>;
  createPortForward: (input: CreatePortForwardInput) => Promise<SshPortForward>;
  updatePortForward: (input: UpdatePortForwardInput) => Promise<SshPortForward>;
  deletePortForward: (id: string) => Promise<void>;
  startPortForward: (sessionId: string, forwardId: string) => Promise<void>;
  stopPortForward: (sessionId: string, forwardId: string) => Promise<void>;
  listForwardStatus: (sessionId: string) => Promise<PortForwardStatus[]>;

  // Traffic statistics
  getForwardTraffic: (sessionId: string) => Promise<PortForwardTrafficInfo[]>;

  // Port forward import/export
  exportPortForwards: (profileId: string) => Promise<string>;
  importPortForwards: (profileId: string, jsonData: string) => Promise<number>;

  // Event subscription (shared with terminal event bus via 'ssh:event' channel)
  onEvent: (listener: (event: SshEventEnvelope) => void) => () => void;
}

// ── Window augmentation ────────────────────────────────────────

declare global {
  interface Window {
    sshApi: SshApi;
  }
}
