import { ipcMain } from 'electron';
import { sshHost } from './host';
import type {
  ConnectSshInput,
  CreateSshProfileInput,
  CreatePortForwardInput,
  GenerateSshManagedKeyInput,
  ImportSshManagedKeyInput,
  ResizeSshSessionInput,
  TrustHostInput,
  UpdateSshProfileInput,
  UpdatePortForwardInput,
} from '@/contracts/ssh';

let registered = false;

export function registerSshIpcHandlers() {
  if (registered) return;

  // ── Profile CRUD ─────────────────────────────────────────────

  ipcMain.handle('ssh:list-profiles', async () => {
    return sshHost.listProfiles();
  });

  ipcMain.handle('ssh:create-profile', async (_event, input: CreateSshProfileInput) => {
    return sshHost.createProfile(input);
  });

  ipcMain.handle('ssh:update-profile', async (_event, input: UpdateSshProfileInput) => {
    return sshHost.updateProfile(input);
  });

  ipcMain.handle('ssh:delete-profile', async (_event, id: string) => {
    return sshHost.deleteProfile(id);
  });

  // ── Connection management ─────────────────────────────────────

  ipcMain.handle('ssh:list-sessions', async () => {
    return sshHost.listSessions();
  });

  ipcMain.handle('ssh:connect', async (_event, input: ConnectSshInput) => {
    return sshHost.connect(input);
  });

  ipcMain.handle('ssh:disconnect', async (_event, sessionId: string) => {
    return sshHost.disconnect(sessionId);
  });

  // ── I/O ──────────────────────────────────────────────────────

  ipcMain.handle('ssh:write', async (_event, sessionId: string, data: string) => {
    sshHost.write(sessionId, data);
  });

  ipcMain.handle('ssh:resize-session', async (_event, input: ResizeSshSessionInput) => {
    sshHost.resizeSession(input);
  });

  // ── Known hosts ───────────────────────────────────────────────

  ipcMain.handle('ssh:list-known-hosts', async () => {
    return sshHost.listKnownHosts();
  });

  ipcMain.handle('ssh:verify-host-fingerprint', async (
    _event,
    host: string,
    port: number,
    algorithm: string,
    fingerprint: string
  ) => {
    return sshHost.verifyHostFingerprint(host, port, algorithm, fingerprint);
  });

  ipcMain.handle('ssh:trust-host', async (_event, input: TrustHostInput) => {
    return sshHost.trustHost(input);
  });

  ipcMain.handle('ssh:delete-known-host', async (_event, id: string) => {
    return sshHost.deleteKnownHost(id);
  });

  // ── SSH Agent ─────────────────────────────────────────────────

  ipcMain.handle('ssh:list-agent-identities', async () => {
    return sshHost.listAgentIdentities();
  });

  ipcMain.handle('ssh:list-managed-keys', async () => {
    return sshHost.listManagedKeys();
  });

  ipcMain.handle('ssh:generate-managed-key', async (_event, input: GenerateSshManagedKeyInput) => {
    return sshHost.generateManagedKey(input);
  });

  ipcMain.handle('ssh:import-managed-key', async (_event, input: ImportSshManagedKeyInput) => {
    return sshHost.importManagedKey(input);
  });

  ipcMain.handle('ssh:export-managed-key', async (_event, id: string) => {
    return sshHost.exportManagedKey(id);
  });

  ipcMain.handle('ssh:delete-managed-key', async (_event, id: string) => {
    return sshHost.deleteManagedKey(id);
  });

  // ── Port forwarding ───────────────────────────────────────────

  ipcMain.handle('ssh:list-port-forwards', async (_event, profileId: string) => {
    return sshHost.listPortForwards(profileId);
  });

  ipcMain.handle('ssh:create-port-forward', async (_event, input: CreatePortForwardInput) => {
    return sshHost.createPortForward(input);
  });

  ipcMain.handle('ssh:update-port-forward', async (_event, input: UpdatePortForwardInput) => {
    return sshHost.updatePortForward(input);
  });

  ipcMain.handle('ssh:delete-port-forward', async (_event, id: string) => {
    return sshHost.deletePortForward(id);
  });

  ipcMain.handle('ssh:start-port-forward', async (_event, sessionId: string, forwardId: string) => {
    return sshHost.startPortForward(sessionId, forwardId);
  });

  ipcMain.handle('ssh:stop-port-forward', async (_event, sessionId: string, forwardId: string) => {
    await sshHost.stopPortForward(sessionId, forwardId);
  });

  ipcMain.handle('ssh:list-forward-status', async (_event, sessionId: string) => {
    return sshHost.listForwardStatus(sessionId);
  });

  // ── Traffic statistics ────────────────────────────────────────

  ipcMain.handle('ssh:get-forward-traffic', async (_event, sessionId: string) => {
    return sshHost.getForwardTraffic(sessionId);
  });

  // ── Port forward import/export ─────────────────────────────────

  ipcMain.handle('ssh:export-port-forwards', async (_event, profileId: string) => {
    return sshHost.exportPortForwards(profileId);
  });

  ipcMain.handle('ssh:import-port-forwards', async (_event, profileId: string, jsonData: string) => {
    return sshHost.importPortForwards(profileId, jsonData);
  });

  registered = true;
  console.log('[SshIpc] Handlers registered');
}
