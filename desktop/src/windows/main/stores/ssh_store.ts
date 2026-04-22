import { defineStore, acceptHMRUpdate } from 'pinia';
import { computed, ref } from 'vue';
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

// ── SSH Store ─────────────────────────────────────────────────
// Manages SSH profiles, active sessions, and event bus routing.
// SSH events arrive via window.sshApi.onEvent (session IDs prefixed "ssh-").

export const useSshStore = defineStore('ssh', () => {
  // ── State ─────────────────────────────────────────────────────
  const profiles = ref<SshProfile[]>([]);
  const sessions = ref<SshSessionDescriptor[]>([]);
  const activeSshSessionId = ref<string>('');
  const knownHosts = ref<SshKnownHost[]>([]);
  const managedKeys = ref<SshManagedKey[]>([]);

  // Per-session data buffers (stdout content for the Viewport)
  const sessionBuffers = ref<Record<string, string>>({});
  const sessionErrors = ref<Record<string, string>>({});

  // Port forwarding state
  const portForwards = ref<Record<string, SshPortForward[]>>({});
  const forwardStatuses = ref<Record<string, PortForwardStatus[]>>({});
  const forwardTraffic = ref<Record<string, PortForwardTrafficInfo[]>>({});
  const portForwardPanelOpen = ref(false);

  const initialized = ref(false);
  let removeListener: (() => void) | null = null;

  // ── Derived ───────────────────────────────────────────────────
  const activeSshSession = computed(
    () => sessions.value.find((s) => s.sessionId === activeSshSessionId.value) ?? null,
  );

  const connectedSessions = computed(
    () => sessions.value.filter((s) => s.status === 'connected'),
  );

  // ── Lifecycle ─────────────────────────────────────────────────

  function ensureEventSubscription() {
    if (removeListener) return;
    removeListener = window.sshApi.onEvent(handleEvent);
  }

  async function initialize() {
    if (initialized.value) return;
    profiles.value = await window.sshApi.listProfiles();
    sessions.value = await window.sshApi.listSessions();
    managedKeys.value = await window.sshApi.listManagedKeys();
    ensureEventSubscription();
    initialized.value = true;
  }

  // ── Profile CRUD ──────────────────────────────────────────────

  async function refreshProfiles() {
    profiles.value = await window.sshApi.listProfiles();
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
    activeSshSessionId.value = descriptor.sessionId;
    return descriptor;
  }

  async function disconnect(sessionId: string) {
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
    await window.sshApi.write(sessionId, data);
  }

  async function resizeSession(input: ResizeSshSessionInput) {
    await window.sshApi.resizeSession(input);
  }

  function clearBuffer(sessionId: string) {
    const next = { ...sessionBuffers.value };
    delete next[sessionId];
    sessionBuffers.value = next;
  }

  function getBuffer(sessionId: string) {
    return sessionBuffers.value[sessionId] ?? '';
  }

  function getError(sessionId: string) {
    return sessionErrors.value[sessionId] ?? '';
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
        sessionBuffers.value = {
          ...sessionBuffers.value,
          [event.sessionId]: `${sessionBuffers.value[event.sessionId] ?? ''}${event.data ?? ''}`,
        };
        break;
      }
      case 'state':
        updateSessionFromEvent(event);
        // Auto-start port forwards when session becomes connected
        if (event.status === 'connected') {
          autoStartPortForwards(event.sessionId).catch((err) =>
            console.warn('[SshStore] auto-start forwards error:', err),
          );
        }
        break;
      case 'exit':
        updateSessionFromEvent(event);
        // Delay removal so the user can read the exit status
        setTimeout(() => removeSessionLocal(event.sessionId), 3000);
        break;
      case 'error':
        updateSessionFromEvent(event);
        sessionErrors.value = {
          ...sessionErrors.value,
          [event.sessionId]: event.message ?? 'SSH connection error',
        };
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
        ? { ...current, status: event.status ?? current.status }
        : s,
    );
  }

  function removeSessionLocal(sessionId: string) {
    sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId);

    const nextBuffers = { ...sessionBuffers.value };
    delete nextBuffers[sessionId];
    sessionBuffers.value = nextBuffers;

    const nextErrors = { ...sessionErrors.value };
    delete nextErrors[sessionId];
    sessionErrors.value = nextErrors;

    if (activeSshSessionId.value === sessionId) {
      activeSshSessionId.value =
        sessions.value.length > 0 ? sessions.value[sessions.value.length - 1].sessionId : '';
    }

    // Cleanup forward statuses for dropped session
    const nextFwdStatuses = { ...forwardStatuses.value };
    delete nextFwdStatuses[sessionId];
    forwardStatuses.value = nextFwdStatuses;
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

  // ── Port forwarding ──────────────────────────────────────────

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
    await window.sshApi.startPortForward(sessionId, forwardId);
  }

  async function stopPortForward(sessionId: string, forwardId: string) {
    await window.sshApi.stopPortForward(sessionId, forwardId);
  }

  async function refreshForwardStatus(sessionId: string) {
    const statuses = await window.sshApi.listForwardStatus(sessionId);
    forwardStatuses.value = { ...forwardStatuses.value, [sessionId]: statuses };
    return statuses;
  }

  function togglePortForwardPanel(open?: boolean) {
    portForwardPanelOpen.value = open ?? !portForwardPanelOpen.value;
  }

  /**
   * Auto-start all port forwards with autoStart=true for a session.
   * Called when the SSH session state becomes 'connected'.
   */
  async function autoStartPortForwards(sessionId: string) {
    const session = sessions.value.find((s) => s.sessionId === sessionId);
    if (!session) return;
    const rules = await loadPortForwards(session.profileId);
    const autoRules = rules.filter((r) => r.autoStart && r.enabled);
    for (const rule of autoRules) {
      try {
        await startPortForward(sessionId, rule.id);
      } catch (err: unknown) {
        console.warn(`[SshStore] auto-start forward '${rule.label ?? rule.id}' failed:`, err);
      }
    }
    // Refresh status after all auto-starts
    if (autoRules.length > 0) {
      await refreshForwardStatus(sessionId);
    }
  }

  // ── Traffic statistics ─────────────────────────────────────────

  async function refreshForwardTraffic(sessionId: string) {
    const traffic = await window.sshApi.getForwardTraffic(sessionId);
    forwardTraffic.value = { ...forwardTraffic.value, [sessionId]: traffic };
    return traffic;
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

  // ── Expose ────────────────────────────────────────────────────

  return {
    // State
    profiles,
    sessions,
    activeSshSessionId,
    activeSshSession,
    connectedSessions,
    knownHosts,
    managedKeys,
    initialized,

    // Lifecycle
    initialize,

    // Profile CRUD
    refreshProfiles,
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
    portForwardPanelOpen,
    loadPortForwards,
    createPortForward,
    updatePortForward,
    deletePortForward,
    startPortForward,
    stopPortForward,
    refreshForwardStatus,
    refreshForwardTraffic,
    togglePortForwardPanel,

    // Import/export
    exportPortForwards,
    importPortForwards,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSshStore, import.meta.hot));
}
