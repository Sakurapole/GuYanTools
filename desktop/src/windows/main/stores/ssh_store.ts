import { defineStore, acceptHMRUpdate } from 'pinia';
import { computed, ref } from 'vue';
import { useAppConfigStore } from './app_config_store';
import { notifyError, notifyWarning } from '../composables/useInAppNotification';
import type {
  ConnectSshInput,
  CreateSshProfileFolderInput,
  CreateSshProfileInput,
  CreatePortForwardInput,
  ExportSshManagedKeyData,
  GenerateSshManagedKeyInput,
  HostVerifyResult,
  ImportSshManagedKeyInput,
  PortForwardStatus,
  PortForwardTrafficInfo,
  PortOccupantInfo,
  ResizeSshSessionInput,
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
import type { TerminalSshProfileGroupConfig } from '@/contracts/terminal';

// ── SSH Store ─────────────────────────────────────────────────
// Manages SSH profiles, active sessions, and event bus routing.
// SSH events arrive via window.sshApi.onEvent (session IDs prefixed "ssh-").

type ReconnectStatus = 'auto' | 'manual-wait' | 'manual';

interface SshReconnectState {
  profileId: string;
  password?: string;
  rows: number;
  cols: number;
  attempts: number;
  maxAttempts: number;
  status: ReconnectStatus;
  lastError?: string;
}

export interface RunningPortForwardSummary {
  sessionId: string;
  forwardId: string;
  profileLabel: string;
  label: string;
  forwardType: SshPortForward['forwardType'];
  port: number;
  address: string;
}

export interface PortForwardConflict {
  sessionId: string;
  profileId: string;
  forwardId: string;
  forwardLabel: string;
  host: string;
  port: number;
  occupant: PortOccupantInfo | null;
  message: string;
  detectedAt: number;
}

const SSH_RECONNECT_DELAY_MS = 2000;

export const useSshStore = defineStore('ssh', () => {
  const appConfigStore = useAppConfigStore();

  // ── State ─────────────────────────────────────────────────────
  const profiles = ref<SshProfile[]>([]);
  const folders = ref<SshProfileFolder[]>([]);
  const sessions = ref<SshSessionDescriptor[]>([]);
  const activeSshSessionId = ref<string>('');
  const knownHosts = ref<SshKnownHost[]>([]);
  const managedKeys = ref<SshManagedKey[]>([]);

  // Per-session data buffers (stdout content for the Viewport)
  const sessionBuffers = ref<Record<string, string>>({});
  const sessionErrors = ref<Record<string, string>>({});
  const sessionWorkingDirectories = ref<Record<string, string>>({});
  const pendingInputLines = ref<Record<string, string>>({});

  // Port forwarding state
  const portForwards = ref<Record<string, SshPortForward[]>>({});
  const forwardStatuses = ref<Record<string, PortForwardStatus[]>>({});
  const forwardTraffic = ref<Record<string, PortForwardTrafficInfo[]>>({});
  const portConflicts = ref<Record<string, PortForwardConflict>>({});
  const portForwardPanelOpen = ref(false);

  const initialized = ref(false);
  let removeListener: (() => void) | null = null;
  const sessionConnectInputs = new Map<string, ConnectSshInput>();
  const reconnectStates = ref<Record<string, SshReconnectState>>({});
  const reconnectTimers = new Map<string, number>();
  const manualDisconnectSessionIds = new Set<string>();
  const autoStartedPortForwardSessionIds = new Set<string>();
  const autoStartingPortForwardSessionIds = new Set<string>();

  // ── Derived ───────────────────────────────────────────────────
  const activeSshSession = computed(
    () => sessions.value.find((s) => s.sessionId === activeSshSessionId.value) ?? null,
  );

  const mainSessions = computed(() =>
    sessions.value.filter((session) => !isDetachedTarget(session.attachedTarget)),
  );

  const connectedSessions = computed(
    () => mainSessions.value.filter((s) => s.status === 'connected'),
  );

  const runningPortForwardSummaries = computed<RunningPortForwardSummary[]>(() => {
    const summaries: RunningPortForwardSummary[] = [];

    for (const session of sessions.value) {
      const statuses = forwardStatuses.value[session.sessionId] ?? [];
      const rules = portForwards.value[session.profileId] ?? [];

      for (const status of statuses) {
        if (status.status !== 'running') continue;

        const rule = rules.find((item) => item.id === status.forwardId);
        if (!rule) continue;

        const port = rule.forwardType === 'remote'
          ? rule.remotePort
          : rule.localPort;
        if (typeof port !== 'number') continue;

        const host = rule.forwardType === 'remote'
          ? (rule.remoteHost || '0.0.0.0')
          : rule.localHost;

        summaries.push({
          sessionId: session.sessionId,
          forwardId: rule.id,
          profileLabel: session.profileLabel,
          label: rule.label || `${host}:${port}`,
          forwardType: rule.forwardType,
          port,
          address: `${host}:${port}`,
        });
      }
    }

    return summaries;
  });

  // ── Lifecycle ─────────────────────────────────────────────────

  function ensureEventSubscription() {
    if (removeListener) return;
    removeListener = window.sshApi.onEvent(handleEvent);
  }

  async function initialize() {
    if (initialized.value) return;
    folders.value = await window.sshApi.listFolders();
    profiles.value = await window.sshApi.listProfiles();
    await migrateLegacyTerminalSshGroups();
    sessions.value = await window.sshApi.listSessions();
    managedKeys.value = await window.sshApi.listManagedKeys();
    ensureEventSubscription();
    await hydrateSessionBuffers(sessions.value.map((session) => session.sessionId));
    await hydratePortForwardRuntimeState();
    initialized.value = true;
  }

  async function refreshSessions() {
    sessions.value = await window.sshApi.listSessions();
    await hydrateSessionBuffers(sessions.value.map((session) => session.sessionId));
    if (activeSshSessionId.value && !sessions.value.some((session) => session.sessionId === activeSshSessionId.value)) {
      activeSshSessionId.value = sessions.value[0]?.sessionId ?? '';
    }
    await hydratePortForwardRuntimeState();
  }

  // ── Profile CRUD ──────────────────────────────────────────────

  async function refreshProfiles() {
    profiles.value = await window.sshApi.listProfiles();
  }

  async function migrateLegacyTerminalSshGroups() {
    const legacyGroups = appConfigStore.config.features.terminal.sshProfileGroups ?? [];
    const legacyMap = appConfigStore.config.features.terminal.sshProfileGroupMap ?? {};
    if (folders.value.length > 0 || legacyGroups.length === 0) {
      return;
    }

    const remaining = [...legacyGroups]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.label.localeCompare(b.label, 'zh-CN'));
    const idMap = new Map<string, string>();
    const knownLegacyIds = new Set(remaining.map((group) => group.id));

    while (remaining.length) {
      let progressed = false;
      for (let index = 0; index < remaining.length;) {
        const group = remaining[index];
        const parentId = group.parentId && knownLegacyIds.has(group.parentId)
          ? idMap.get(group.parentId)
          : '';
        if (group.parentId && knownLegacyIds.has(group.parentId) && !parentId) {
          index += 1;
          continue;
        }

        const created = await window.sshApi.createFolder({
          label: group.label,
          parentId: parentId || undefined,
        });
        idMap.set(group.id, created.id);
        remaining.splice(index, 1);
        progressed = true;
      }

      if (!progressed) {
        const group = remaining.shift() as TerminalSshProfileGroupConfig;
        const created = await window.sshApi.createFolder({ label: group.label });
        idMap.set(group.id, created.id);
      }
    }

    for (const profile of profiles.value) {
      const legacyGroupId = legacyMap[profile.id];
      const folderId = legacyGroupId ? idMap.get(legacyGroupId) : '';
      if (folderId) {
        await window.sshApi.updateProfile({ id: profile.id, folderId });
      }
    }

    folders.value = await window.sshApi.listFolders();
    profiles.value = await window.sshApi.listProfiles();
    await appConfigStore.updateConfig({
      features: {
        terminal: {
          sshProfileGroups: [],
          sshProfileGroupMap: {},
        },
      },
    });
  }

  async function refreshFolders() {
    folders.value = await window.sshApi.listFolders();
    return folders.value;
  }

  async function createFolder(input: CreateSshProfileFolderInput) {
    const folder = await window.sshApi.createFolder(input);
    folders.value = [...folders.value, folder];
    return folder;
  }

  async function updateFolder(input: UpdateSshProfileFolderInput) {
    const folder = await window.sshApi.updateFolder(input);
    folders.value = folders.value.map((item) => (item.id === folder.id ? folder : item));
    return folder;
  }

  async function deleteFolder(id: string) {
    await window.sshApi.deleteFolder(id);
    const nestedIds = collectFolderDescendantIds(id);
    folders.value = folders.value.filter((item) => !nestedIds.includes(item.id));
    profiles.value = profiles.value.map((profile) =>
      profile.folderId && nestedIds.includes(profile.folderId) ? { ...profile, folderId: undefined } : profile,
    );
  }

  function collectFolderDescendantIds(folderId: string) {
    const output = [folderId];
    const stack = [folderId];
    while (stack.length) {
      const currentId = stack.pop();
      for (const folder of folders.value) {
        if (folder.parentId === currentId) {
          output.push(folder.id);
          stack.push(folder.id);
        }
      }
    }
    return output;
  }

  async function createProfile(input: CreateSshProfileInput) {
    const profile = await window.sshApi.createProfile(input);
    profiles.value = [...profiles.value, profile];
    return profile;
  }

  async function updateProfile(input: UpdateSshProfileInput) {
    const updated = await window.sshApi.updateProfile(input);
    profiles.value = profiles.value.map((p) => (p.id === updated.id ? updated : p));
    return updated;
  }

  async function deleteProfile(id: string) {
    await window.sshApi.deleteProfile(id);
    profiles.value = profiles.value.filter((p) => p.id !== id);
    // Also remove any active sessions for this profile
    sessions.value = sessions.value.filter((s) => s.profileId !== id);
    if (activeSshSessionId.value) {
      const stillExists = sessions.value.some((s) => s.sessionId === activeSshSessionId.value);
      if (!stillExists) activeSshSessionId.value = '';
    }
  }

  // ── Connection management ─────────────────────────────────────

  async function connect(input: ConnectSshInput): Promise<SshSessionDescriptor> {
    const descriptor = await window.sshApi.connect(input);
    upsertSession(descriptor);
    sessionConnectInputs.set(descriptor.sessionId, {
      ...input,
      rows: input.rows || 32,
      cols: input.cols || 120,
    });
    activeSshSessionId.value = descriptor.sessionId;
    if (descriptor.status === 'connected') {
      autoStartPortForwards(descriptor.sessionId).catch((err) =>
        console.warn('[SshStore] auto-start forwards error:', err),
      );
    }
    return descriptor;
  }

  async function disconnect(sessionId: string) {
    manualDisconnectSessionIds.add(sessionId);
    clearReconnectState(sessionId);
    // If the session is no longer tracked locally, just clean up local state
    const exists = sessions.value.some((s) => s.sessionId === sessionId);
    if (!exists) {
      removeSessionLocal(sessionId);
      return;
    }
    try {
      await window.sshApi.disconnect(sessionId);
    } catch (err) {
      // Session may have already been cleaned up on the backend (e.g. network drop)
      console.warn('[SshStore] disconnect warning (session may already be gone):', err);
    }
    removeSessionLocal(sessionId);
  }

  function focusSession(sessionId: string) {
    activeSshSessionId.value = sessionId;
  }

  // ── I/O ──────────────────────────────────────────────────────

  async function write(sessionId: string, data: string) {
    const reconnectState = reconnectStates.value[sessionId];
    if (reconnectState) {
      if (reconnectState.status === 'manual-wait' && data) {
        void restartReconnectManually(sessionId);
      }
      return;
    }

    if (!hasSession(sessionId)) return;

    try {
      await window.sshApi.write(sessionId, data);
      trackWorkingDirectoryFromInput(sessionId, data);
    } catch (err) {
      if (handleMissingSessionError(sessionId, err)) return;
      throw err;
    }
  }

  async function resizeSession(input: ResizeSshSessionInput) {
    const connectInput = sessionConnectInputs.get(input.sessionId);
    if (connectInput) {
      connectInput.rows = input.rows;
      connectInput.cols = input.cols;
    }

    if (!hasSession(input.sessionId)) return;

    try {
      await window.sshApi.resizeSession(input);
    } catch (err) {
      if (handleMissingSessionError(input.sessionId, err)) return;
      throw err;
    }
  }

  function clearBuffer(sessionId: string) {
    const next = { ...sessionBuffers.value };
    delete next[sessionId];
    sessionBuffers.value = next;
    void window.sshApi.clearBuffer(sessionId);
  }

  function getBuffer(sessionId: string) {
    return sessionBuffers.value[sessionId] ?? '';
  }

  function getError(sessionId: string) {
    return sessionErrors.value[sessionId] ?? '';
  }

  function getSessionWorkingDirectory(sessionId: string) {
    return sessionWorkingDirectories.value[sessionId] ?? '';
  }

  // ── Known hosts ───────────────────────────────────────────────

  async function refreshKnownHosts() {
    knownHosts.value = await window.sshApi.listKnownHosts();
  }

  async function verifyHostFingerprint(
    host: string,
    port: number,
    algorithm: string,
    fingerprint: string,
  ): Promise<HostVerifyResult> {
    return window.sshApi.verifyHostFingerprint(host, port, algorithm, fingerprint);
  }

  async function trustHost(input: TrustHostInput) {
    await window.sshApi.trustHost(input);
    await refreshKnownHosts();
  }

  async function deleteKnownHost(id: string) {
    await window.sshApi.deleteKnownHost(id);
    knownHosts.value = knownHosts.value.filter((kh) => kh.id !== id);
  }

  // ── Managed keys ─────────────────────────────────────────────

  async function refreshManagedKeys() {
    managedKeys.value = await window.sshApi.listManagedKeys();
    return managedKeys.value;
  }

  async function generateManagedKey(input: GenerateSshManagedKeyInput) {
    const key = await window.sshApi.generateManagedKey(input);
    managedKeys.value = [key, ...managedKeys.value.filter((item) => item.id !== key.id)];
    return key;
  }

  async function importManagedKey(input: ImportSshManagedKeyInput) {
    const key = await window.sshApi.importManagedKey(input);
    managedKeys.value = [key, ...managedKeys.value.filter((item) => item.id !== key.id)];
    return key;
  }

  async function exportManagedKey(id: string): Promise<ExportSshManagedKeyData> {
    return window.sshApi.exportManagedKey(id);
  }

  async function deleteManagedKey(id: string) {
    await window.sshApi.deleteManagedKey(id);
    managedKeys.value = managedKeys.value.filter((item) => item.id !== id);
  }

  // ── Event handler ─────────────────────────────────────────────

  function handleEvent(event: SshEventEnvelope) {
    switch (event.eventType) {
      case 'data': {
        updateWorkingDirectoryFromOutput(event.sessionId, event.data ?? '');
        const matchedSession = sessions.value.find((session) => session.sessionId === event.sessionId);
        if (matchedSession && isDetachedTarget(matchedSession.attachedTarget)) {
          break;
        }
        sessionBuffers.value = {
          ...sessionBuffers.value,
          [event.sessionId]: `${sessionBuffers.value[event.sessionId] ?? ''}${event.data ?? ''}`,
        };
        break;
      }
      case 'state':
        updateSessionFromEvent(event);
        if (event.attachedTarget && !isDetachedTarget(event.attachedTarget)) {
          focusReturnedSessionIfNeeded(event.sessionId);
          void hydrateSessionBuffer(event.sessionId);
        } else if (
          event.attachedTarget
          && isDetachedTarget(event.attachedTarget)
          && activeSshSessionId.value === event.sessionId
        ) {
          const nextSession = mainSessions.value.find((session) => session.sessionId !== event.sessionId);
          activeSshSessionId.value = nextSession?.sessionId ?? '';
        }
        // Auto-start port forwards when session becomes connected
        if (event.status === 'connected') {
          clearReconnectState(event.sessionId);
          autoStartPortForwards(event.sessionId).catch((err) =>
            console.warn('[SshStore] auto-start forwards error:', err),
          );
        } else if (event.status === 'disconnected') {
          handleUnexpectedDisconnect(event);
        }
        break;
      case 'exit':
        updateSessionFromEvent(event);
        // Delay removal so the user can read the exit status
        clearReconnectState(event.sessionId);
        setTimeout(() => removeSessionLocal(event.sessionId), 3000);
        break;
      case 'error':
        updateSessionFromEvent(event);
        sessionErrors.value = {
          ...sessionErrors.value,
          [event.sessionId]: event.message ?? 'SSH connection error',
        };
        handleUnexpectedDisconnect(event);
        break;
      case 'forward-state':
      case 'forward-error': {
        // Update forward status from event data
        if (event.data) {
          try {
            const status = JSON.parse(event.data) as PortForwardStatus;
            updateForwardStatus(event.sessionId, status);
          } catch { /* ignore parse errors */ }
        }
        break;
      }
      default:
        break;
    }
  }

  // ── Internal helpers ──────────────────────────────────────────

  function upsertSession(session: SshSessionDescriptor) {
    const index = sessions.value.findIndex((s) => s.sessionId === session.sessionId);
    if (index === -1) {
      sessions.value = [...sessions.value, session];
    } else {
      sessions.value = sessions.value.map((s, i) => (i === index ? session : s));
    }
  }

  function updateSessionFromEvent(event: SshEventEnvelope) {
    const index = sessions.value.findIndex((s) => s.sessionId === event.sessionId);
    if (index === -1) return;

    const current = sessions.value[index];
    sessions.value = sessions.value.map((s, i) =>
      i === index
        ? {
          ...current,
          status: event.status ?? current.status,
          attachedTarget: event.attachedTarget ?? current.attachedTarget,
        }
        : s,
    );
  }

  function isDetachedTarget(target: string | undefined) {
    return typeof target === 'string' && target.startsWith('popup:');
  }

  function focusReturnedSessionIfNeeded(sessionId: string) {
    const activeMainSession = mainSessions.value.find((session) => session.sessionId === activeSshSessionId.value);
    if (activeMainSession) {
      return;
    }

    if (mainSessions.value.some((session) => session.sessionId === sessionId)) {
      activeSshSessionId.value = sessionId;
    }
  }

  async function hydrateSessionBuffers(sessionIds: string[]) {
    await Promise.all(sessionIds.map((sessionId) => hydrateSessionBuffer(sessionId)));
  }

  async function hydrateSessionBuffer(sessionId: string) {
    const buffer = await window.sshApi.getBuffer(sessionId);
    sessionBuffers.value = {
      ...sessionBuffers.value,
      [sessionId]: buffer,
    };
  }

  function removeSessionLocal(sessionId: string) {
    clearReconnectState(sessionId);
    autoStartedPortForwardSessionIds.delete(sessionId);
    autoStartingPortForwardSessionIds.delete(sessionId);
    sessionConnectInputs.delete(sessionId);
    manualDisconnectSessionIds.delete(sessionId);
    sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId);

    const nextBuffers = { ...sessionBuffers.value };
    delete nextBuffers[sessionId];
    sessionBuffers.value = nextBuffers;

    const nextErrors = { ...sessionErrors.value };
    delete nextErrors[sessionId];
    sessionErrors.value = nextErrors;

    const nextDirectories = { ...sessionWorkingDirectories.value };
    delete nextDirectories[sessionId];
    sessionWorkingDirectories.value = nextDirectories;

    const nextPendingInputs = { ...pendingInputLines.value };
    delete nextPendingInputs[sessionId];
    pendingInputLines.value = nextPendingInputs;

    if (activeSshSessionId.value === sessionId) {
      activeSshSessionId.value =
        sessions.value.length > 0 ? sessions.value[sessions.value.length - 1].sessionId : '';
    }

    // Cleanup forward statuses for dropped session
    const nextFwdStatuses = { ...forwardStatuses.value };
    delete nextFwdStatuses[sessionId];
    forwardStatuses.value = nextFwdStatuses;

    const nextFwdTraffic = { ...forwardTraffic.value };
    delete nextFwdTraffic[sessionId];
    forwardTraffic.value = nextFwdTraffic;

    const nextConflicts = { ...portConflicts.value };
    for (const [key, conflict] of Object.entries(nextConflicts)) {
      if (conflict.sessionId === sessionId) {
        delete nextConflicts[key];
      }
    }
    portConflicts.value = nextConflicts;
  }

  function updateForwardStatus(sessionId: string, status: PortForwardStatus) {
    const current = forwardStatuses.value[sessionId] ?? [];
    const idx = current.findIndex((s) => s.forwardId === status.forwardId);
    if (idx === -1) {
      forwardStatuses.value = {
        ...forwardStatuses.value,
        [sessionId]: [...current, status],
      };
    } else {
      const updated = [...current];
      if (status.status === 'stopped') {
        updated.splice(idx, 1);
      } else {
        updated[idx] = status;
      }
      forwardStatuses.value = {
        ...forwardStatuses.value,
        [sessionId]: updated,
      };
    }
  }

  function hasSession(sessionId: string) {
    return sessions.value.some((session) => session.sessionId === sessionId);
  }

  function isMissingSessionError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return /SSH session ['"][^'"]+['"] not found/i.test(message)
      || /session ['"][^'"]+['"] not found/i.test(message);
  }

  function handleMissingSessionError(sessionId: string, err: unknown) {
    if (!isMissingSessionError(err)) return false;
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[SshStore] SSH session ${sessionId} is no longer available; marking disconnected.`);
    markSessionUnavailable(sessionId, message);
    return true;
  }

  function handleUnexpectedDisconnect(event: SshEventEnvelope) {
    if (manualDisconnectSessionIds.has(event.sessionId)) return;
    if (reconnectStates.value[event.sessionId]) return;
    autoStartedPortForwardSessionIds.delete(event.sessionId);
    autoStartingPortForwardSessionIds.delete(event.sessionId);

    const session = sessions.value.find((item) => item.sessionId === event.sessionId);
    if (!session) return;

    const profile = profiles.value.find((item) => item.id === session.profileId);
    if (!profile?.autoReconnect) {
      markSessionUnavailable(event.sessionId, event.message || 'SSH session closed');
      return;
    }

    const connectInput = sessionConnectInputs.get(event.sessionId);
    const state: SshReconnectState = {
      profileId: session.profileId,
      password: connectInput?.password,
      rows: connectInput?.rows || 32,
      cols: connectInput?.cols || 120,
      attempts: 0,
      maxAttempts: appConfigStore.config.features.terminal.sshReconnectMaxAttempts || 3,
      status: 'auto',
      lastError: event.message,
    };

    reconnectStates.value = {
      ...reconnectStates.value,
      [event.sessionId]: state,
    };
    appendSystemMessage(event.sessionId, `连接已断开：${event.message || 'SSH session closed'}`);
    scheduleReconnectAttempt(event.sessionId);
  }

  function markSessionUnavailable(sessionId: string, message: string) {
    const session = sessions.value.find((item) => item.sessionId === sessionId);
    autoStartedPortForwardSessionIds.delete(sessionId);
    autoStartingPortForwardSessionIds.delete(sessionId);

    const nextFwdStatuses = { ...forwardStatuses.value };
    delete nextFwdStatuses[sessionId];
    forwardStatuses.value = nextFwdStatuses;

    const nextFwdTraffic = { ...forwardTraffic.value };
    delete nextFwdTraffic[sessionId];
    forwardTraffic.value = nextFwdTraffic;

    sessionErrors.value = {
      ...sessionErrors.value,
      [sessionId]: message || 'SSH session closed',
    };

    if (!session) return;

    sessions.value = sessions.value.map((item) =>
      item.sessionId === sessionId
        ? { ...item, status: 'disconnected' }
        : item,
    );

    if (reconnectStates.value[sessionId]) {
      return;
    }

    const connectInput = sessionConnectInputs.get(sessionId);
    reconnectStates.value = {
      ...reconnectStates.value,
      [sessionId]: {
        profileId: session.profileId,
        password: connectInput?.password,
        rows: connectInput?.rows || 32,
        cols: connectInput?.cols || 120,
        attempts: 0,
        maxAttempts: appConfigStore.config.features.terminal.sshReconnectMaxAttempts || 3,
        status: 'manual-wait',
        lastError: message,
      },
    };

    appendSystemMessage(
      sessionId,
      `连接已断开：${message || 'SSH session closed'}。请点击重连后继续操作。`,
    );
  }

  function scheduleReconnectAttempt(sessionId: string) {
    clearReconnectTimer(sessionId);
    const timerId = window.setTimeout(() => {
      reconnectTimers.delete(sessionId);
      void runReconnectAttempt(sessionId);
    }, SSH_RECONNECT_DELAY_MS);
    reconnectTimers.set(sessionId, timerId);
  }

  async function runReconnectAttempt(sessionId: string) {
    const state = reconnectStates.value[sessionId];
    if (!state || state.status === 'manual-wait') return;

    if (state.attempts >= state.maxAttempts) {
      pauseReconnect(sessionId, state);
      return;
    }

    const nextAttempt = state.attempts + 1;
    updateReconnectState(sessionId, {
      attempts: nextAttempt,
      status: state.status === 'manual' ? 'manual' : 'auto',
    });
    appendSystemMessage(
      sessionId,
      `${state.status === 'manual' ? '手动' : '自动'}重连中（${nextAttempt}/${state.maxAttempts}）...`,
    );

    try {
      const descriptor = await connect({
        profileId: state.profileId,
        password: state.password,
        rows: state.rows,
        cols: state.cols,
      });
      transferReconnectSession(sessionId, descriptor.sessionId);
      appendSystemMessage(descriptor.sessionId, 'SSH 重连成功。');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateReconnectState(sessionId, { lastError: message });
      appendSystemMessage(sessionId, `重连失败：${message}`);

      const nextState = reconnectStates.value[sessionId];
      if (!nextState) return;
      if (nextState.attempts >= nextState.maxAttempts) {
        pauseReconnect(sessionId, nextState);
        return;
      }
      scheduleReconnectAttempt(sessionId);
    }
  }

  function pauseReconnect(sessionId: string, state: SshReconnectState) {
    clearReconnectTimer(sessionId);
    updateReconnectState(sessionId, { status: 'manual-wait' });
    appendSystemMessage(
      sessionId,
      `自动重连 ${state.maxAttempts} 次仍未成功${state.lastError ? `：${state.lastError}` : ''}。按任意键手动重连。`,
    );
  }

  async function restartReconnectManually(sessionId: string) {
    const state = reconnectStates.value[sessionId];
    if (!state || state.status !== 'manual-wait') return;
    updateReconnectState(sessionId, {
      attempts: 0,
      status: 'manual',
      maxAttempts: appConfigStore.config.features.terminal.sshReconnectMaxAttempts || state.maxAttempts,
    });
    appendSystemMessage(sessionId, '收到输入，开始手动重连。');
    await runReconnectAttempt(sessionId);
  }

  function transferReconnectSession(oldSessionId: string, newSessionId: string) {
    const oldBuffer = sessionBuffers.value[oldSessionId] ?? '';
    const newBuffer = sessionBuffers.value[newSessionId] ?? '';
    sessionBuffers.value = {
      ...sessionBuffers.value,
      [newSessionId]: `${oldBuffer}${newBuffer}`,
    };
    clearReconnectState(oldSessionId);
    removeSessionLocal(oldSessionId);
    activeSshSessionId.value = newSessionId;
  }

  function updateReconnectState(sessionId: string, patch: Partial<SshReconnectState>) {
    const current = reconnectStates.value[sessionId];
    if (!current) return;
    reconnectStates.value = {
      ...reconnectStates.value,
      [sessionId]: { ...current, ...patch },
    };
  }

  function clearReconnectState(sessionId: string) {
    clearReconnectTimer(sessionId);
    if (!reconnectStates.value[sessionId]) return;
    const next = { ...reconnectStates.value };
    delete next[sessionId];
    reconnectStates.value = next;
  }

  function clearReconnectTimer(sessionId: string) {
    const timerId = reconnectTimers.get(sessionId);
    if (timerId === undefined) return;
    window.clearTimeout(timerId);
    reconnectTimers.delete(sessionId);
  }

  function appendSystemMessage(sessionId: string, message: string) {
    const timestamp = new Date().toLocaleTimeString();
    const line = `\r\n\u001b[33m[SSH ${timestamp}] ${message}\u001b[0m\r\n`;
    sessionBuffers.value = {
      ...sessionBuffers.value,
      [sessionId]: `${sessionBuffers.value[sessionId] ?? ''}${line}`,
    };
  }

  // ── Port forwarding ──────────────────────────────────────────

  async function hydratePortForwardRuntimeState() {
    await Promise.allSettled(
      connectedSessions.value.map(async (session) => {
        await loadPortForwards(session.profileId);
        await refreshForwardStatus(session.sessionId);
      }),
    );
  }

  async function loadPortForwards(profileId: string) {
    const list = await window.sshApi.listPortForwards(profileId);
    portForwards.value = { ...portForwards.value, [profileId]: list };
    return list;
  }

  async function createPortForward(input: CreatePortForwardInput) {
    const rule = await window.sshApi.createPortForward(input);
    const current = portForwards.value[input.profileId] ?? [];
    portForwards.value = {
      ...portForwards.value,
      [input.profileId]: [...current, rule],
    };
    return rule;
  }

  async function updatePortForward(input: UpdatePortForwardInput) {
    const updated = await window.sshApi.updatePortForward(input);
    const profileId = updated.profileId;
    const current = portForwards.value[profileId] ?? [];
    portForwards.value = {
      ...portForwards.value,
      [profileId]: current.map((f) => (f.id === updated.id ? updated : f)),
    };
    return updated;
  }

  async function deletePortForward(profileId: string, id: string) {
    await window.sshApi.deletePortForward(id);
    const current = portForwards.value[profileId] ?? [];
    portForwards.value = {
      ...portForwards.value,
      [profileId]: current.filter((f) => f.id !== id),
    };
  }

  async function startPortForward(sessionId: string, forwardId: string) {
    if (!hasSession(sessionId)) return;

    try {
      await window.sshApi.startPortForward(sessionId, forwardId);
      clearPortConflict(sessionId, forwardId);
    } catch (err) {
      if (handleMissingSessionError(sessionId, err)) return;
      await registerPortForwardConflict(sessionId, forwardId, err);
      throw err;
    }
  }

  async function stopPortForward(sessionId: string, forwardId: string) {
    if (!hasSession(sessionId)) return;

    try {
      await window.sshApi.stopPortForward(sessionId, forwardId);
    } catch (err) {
      if (handleMissingSessionError(sessionId, err)) return;
      throw err;
    }
  }

  async function refreshForwardStatus(sessionId: string) {
    if (!hasSession(sessionId)) {
      forwardStatuses.value = { ...forwardStatuses.value, [sessionId]: [] };
      return [];
    }

    try {
      const statuses = await window.sshApi.listForwardStatus(sessionId);
      forwardStatuses.value = { ...forwardStatuses.value, [sessionId]: statuses };
      return statuses;
    } catch (err) {
      if (handleMissingSessionError(sessionId, err)) return [];
      throw err;
    }
  }

  function togglePortForwardPanel(open?: boolean) {
    portForwardPanelOpen.value = open ?? !portForwardPanelOpen.value;
  }

  /**
   * Auto-start all port forwards with autoStart=true for a session.
   * Called when the SSH session state becomes 'connected'.
   */
  async function autoStartPortForwards(sessionId: string) {
    if (
      autoStartedPortForwardSessionIds.has(sessionId)
      || autoStartingPortForwardSessionIds.has(sessionId)
    ) {
      return;
    }

    const session = sessions.value.find((s) => s.sessionId === sessionId);
    if (!session) return;

    autoStartingPortForwardSessionIds.add(sessionId);
    try {
      const rules = await loadPortForwards(session.profileId);
      const autoRules = rules.filter((r) => r.autoStart && r.enabled);
      const currentStatuses = autoRules.length > 0
        ? await refreshForwardStatus(sessionId)
        : [];
      const runningForwardIds = new Set(
        currentStatuses
          .filter((status) => status.status === 'running' || status.status === 'starting')
          .map((status) => status.forwardId),
      );
      const pendingRules = autoRules.filter((rule) => !runningForwardIds.has(rule.id));

      for (const rule of pendingRules) {
        try {
          await startPortForward(sessionId, rule.id);
        } catch (err: unknown) {
          console.warn(`[SshStore] auto-start forward '${rule.label ?? rule.id}' failed:`, err);
        }
      }
      // Refresh status after all auto-starts
      if (pendingRules.length > 0) {
        await refreshForwardStatus(sessionId);
      }
      autoStartedPortForwardSessionIds.add(sessionId);
    } finally {
      autoStartingPortForwardSessionIds.delete(sessionId);
    }
  }

  // ── Traffic statistics ─────────────────────────────────────────

  async function refreshForwardTraffic(sessionId: string) {
    if (!hasSession(sessionId)) {
      forwardTraffic.value = { ...forwardTraffic.value, [sessionId]: [] };
      return [];
    }

    try {
      const traffic = await window.sshApi.getForwardTraffic(sessionId);
      forwardTraffic.value = { ...forwardTraffic.value, [sessionId]: traffic };
      return traffic;
    } catch (err) {
      if (handleMissingSessionError(sessionId, err)) return [];
      throw err;
    }
  }

  // ── Port forward import/export ─────────────────────────────────

  async function exportPortForwards(profileId: string) {
    return window.sshApi.exportPortForwards(profileId);
  }

  async function importPortForwards(profileId: string, jsonData: string) {
    const count = await window.sshApi.importPortForwards(profileId, jsonData);
    // Refresh the port forward list after import
    await loadPortForwards(profileId);
    return count;
  }

  function getConflictKey(sessionId: string, forwardId: string) {
    return `${sessionId}:${forwardId}`;
  }

  function clearPortConflict(sessionId: string, forwardId: string) {
    const key = getConflictKey(sessionId, forwardId);
    if (!portConflicts.value[key]) return;
    const next = { ...portConflicts.value };
    delete next[key];
    portConflicts.value = next;
  }

  async function registerPortForwardConflict(sessionId: string, forwardId: string, err: unknown) {
    const message = getErrorMessage(err);
    if (!looksLikeLocalPortBindError(message)) {
      return;
    }

    const session = sessions.value.find((item) => item.sessionId === sessionId);
    const rule = session ? (portForwards.value[session.profileId] ?? []).find((item) => item.id === forwardId) : null;
    if (!session || !rule || rule.forwardType === 'remote') {
      notifyWarning(message, '端口转发启动失败', {
        dedupeKey: `ssh-forward:${sessionId}:${forwardId}:bind`,
      });
      return;
    }

    const host = rule.localHost || '127.0.0.1';
    const port = rule.localPort;
    const occupant = await window.sshApi.getPortOccupant(host, port).catch((): PortOccupantInfo | null => null);
    const conflict: PortForwardConflict = {
      sessionId,
      profileId: session.profileId,
      forwardId,
      forwardLabel: rule.label || `${host}:${port}`,
      host,
      port,
      occupant,
      message,
      detectedAt: Date.now(),
    };

    portConflicts.value = {
      ...portConflicts.value,
      [getConflictKey(sessionId, forwardId)]: conflict,
    };
    portForwardPanelOpen.value = true;
    notifyWarning(
      occupant
        ? `${host}:${port} 被 ${occupant.name || '未知进程'} (PID ${occupant.pid}) 占用，可在端口转发面板中释放后重试。`
        : `${host}:${port} 已被占用，可在端口转发面板中查看并重试。`,
      '端口转发端口被占用',
      { dedupeKey: `ssh-forward:${sessionId}:${forwardId}:occupied` },
    );
  }

  function getErrorMessage(err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }

  function looksLikeLocalPortBindError(message: string) {
    return /failed to bind/i.test(message)
      || /address already in use/i.test(message)
      || /only one usage of each socket address/i.test(message)
      || /通常每个套接字地址/i.test(message)
      || /端口.*占用/.test(message);
  }

  async function resolvePortConflict(sessionId: string, forwardId: string) {
    const conflict = portConflicts.value[getConflictKey(sessionId, forwardId)];
    if (!conflict) {
      return;
    }

    try {
      if (conflict.occupant?.pid) {
        await window.sshApi.killPortOccupant(conflict.occupant.pid);
        await waitForPortRelease(conflict.host, conflict.port);
      }
      clearPortConflict(sessionId, forwardId);
      await startPortForward(sessionId, forwardId);
      await refreshForwardStatus(sessionId);
    } catch (error) {
      await registerPortForwardConflict(sessionId, forwardId, error);
      notifyError(error, '释放端口失败', {
        dedupeKey: `ssh-forward:${sessionId}:${forwardId}:kill-failed`,
      });
      throw error;
    }
  }

  async function waitForPortRelease(host: string, port: number) {
    for (let index = 0; index < 10; index += 1) {
      const occupant = await window.sshApi.getPortOccupant(host, port).catch((): PortOccupantInfo | null => null);
      if (!occupant) {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }

  function trackWorkingDirectoryFromInput(sessionId: string, data: string) {
    let pending = pendingInputLines.value[sessionId] ?? '';

    for (const char of data) {
      if (char === '\r' || char === '\n') {
        applyCdCommand(sessionId, pending);
        pending = '';
        continue;
      }

      if (char === '\b' || char === '\u007f') {
        pending = pending.slice(0, -1);
        continue;
      }

      if (char >= ' ') {
        pending += char;
      }
    }

    pendingInputLines.value = {
      ...pendingInputLines.value,
      [sessionId]: pending,
    };
  }

  function updateWorkingDirectoryFromOutput(sessionId: string, data: string) {
    if (!data) return;

    const currentDir = extractOscValue(data, ']1337;CurrentDir=');
    if (currentDir) {
      setSessionWorkingDirectory(sessionId, currentDir);
    }

    const osc7 = extractOscValue(data, ']7;file://');
    if (osc7) {
      const pathStart = osc7.indexOf('/');
      const decodedPath = pathStart === -1 ? '' : safeDecodeOscPath(osc7.slice(pathStart));
      if (decodedPath) {
        setSessionWorkingDirectory(sessionId, decodedPath);
      }
    }
  }

  function extractOscValue(data: string, marker: string) {
    const start = data.indexOf(`\u001b${marker}`);
    if (start === -1) return '';

    const valueStart = start + marker.length + 1;
    const belEnd = data.indexOf('\u0007', valueStart);
    const stEnd = data.indexOf('\u001b\\', valueStart);
    const ends = [belEnd, stEnd].filter((index) => index !== -1);
    const valueEnd = ends.length ? Math.min(...ends) : data.length;

    return data.slice(valueStart, valueEnd);
  }

  function safeDecodeOscPath(path: string) {
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  }

  function setSessionWorkingDirectory(sessionId: string, value: string) {
    const normalized = normalizeRemoteDirectory(value);
    if (!normalized) return;
    sessionWorkingDirectories.value = {
      ...sessionWorkingDirectories.value,
      [sessionId]: normalized,
    };
  }

  function applyCdCommand(sessionId: string, line: string) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'cd' || trimmed.startsWith('cd -')) {
      return;
    }

    const match = trimmed.match(/^cd(?:\s+--)?\s+(.+)$/);
    if (!match) return;

    const rawTarget = stripWrappingQuotes(match[1].trim());
    if (!rawTarget || rawTarget.startsWith('$')) return;

    if (rawTarget === '~') {
      return;
    }

    const current = sessionWorkingDirectories.value[sessionId] || '/';
    const next = resolveRemoteDirectory(current, rawTarget);
    if (!next) return;
    setSessionWorkingDirectory(sessionId, next);
  }

  function stripWrappingQuotes(value: string) {
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }

  function resolveRemoteDirectory(current: string, target: string) {
    if (!target) return current;
    if (target.startsWith('/')) {
      return normalizeRemoteDirectory(target);
    }
    if (target.startsWith('~/')) {
      return normalizeRemoteDirectory(target.slice(1));
    }
    return normalizeRemoteDirectory(`${current.replace(/\/+$/, '')}/${target}`);
  }

  function normalizeRemoteDirectory(path: string) {
    const trimmed = path.trim();
    if (!trimmed) return '';

    const parts = trimmed.split('/').filter((part) => part.length > 0 && part !== '.');
    const normalized: string[] = [];
    for (const part of parts) {
      if (part === '..') {
        normalized.pop();
      } else {
        normalized.push(part);
      }
    }

    return `/${normalized.join('/')}`.replace(/\/{2,}/g, '/');
  }

  // ── Expose ────────────────────────────────────────────────────

  return {
    // State
    profiles,
    folders,
    sessions,
    activeSshSessionId,
    activeSshSession,
    mainSessions,
    connectedSessions,
    runningPortForwardSummaries,
    reconnectStates,
    knownHosts,
    managedKeys,
    initialized,

    // Lifecycle
    initialize,
    refreshSessions,

    // Profile CRUD
    refreshProfiles,
    refreshFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    createProfile,
    updateProfile,
    deleteProfile,

    // Connection
    connect,
    disconnect,
    focusSession,

    // I/O
    write,
    resizeSession,
    clearBuffer,
    getBuffer,
    getError,
    getSessionWorkingDirectory,

    // Known hosts
    refreshKnownHosts,
    verifyHostFingerprint,
    trustHost,
    deleteKnownHost,
    refreshManagedKeys,
    generateManagedKey,
    importManagedKey,
    exportManagedKey,
    deleteManagedKey,

    // Port forwarding
    portForwards,
    forwardStatuses,
    forwardTraffic,
    portConflicts,
    portForwardPanelOpen,
    loadPortForwards,
    createPortForward,
    updatePortForward,
    deletePortForward,
    startPortForward,
    stopPortForward,
    refreshForwardStatus,
    refreshForwardTraffic,
    resolvePortConflict,
    clearPortConflict,
    togglePortForwardPanel,
    markSessionUnavailable,

    // Import/export
    exportPortForwards,
    importPortForwards,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSshStore, import.meta.hot));
}
