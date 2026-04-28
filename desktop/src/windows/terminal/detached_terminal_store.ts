import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  DetachedTerminalSessionKind,
  TerminalEventEnvelope,
  TerminalProfile,
  TerminalSessionDescriptor,
} from '@/contracts/terminal';
import type { SshEventEnvelope, SshSessionDescriptor } from '@/contracts/ssh';

/**
 * Lightweight terminal store for detached (independent) terminal windows.
 *
 * Unlike the full `terminal_store` used in the main window, this store
 * manages a single terminal session. It subscribes to IPC events and
 * filters only those matching its bound `sessionId`.
 */
export const useDetachedTerminalStore = defineStore('detached-terminal', () => {
  // ── Bound session identity ──────────────────────────────────
  const sessionId = ref('');
  const attachedTarget = ref('');
  const sessionKind = ref<DetachedTerminalSessionKind>('local');
  const profileLabel = ref('Terminal');
  const status = ref<string>('running');
  const processId = ref<number | undefined>(undefined);

  // ── Buffer & error ──────────────────────────────────────────
  const buffer = ref('');
  const error = ref('');

  // ── Profiles ────────────────────────────────────────────────
  const profiles = ref<TerminalProfile[]>([]);

  // ── Event subscription handle ───────────────────────────────
  let removeListener: (() => void) | null = null;

  const isRunning = computed(() => {
    if (sessionKind.value === 'ssh') {
      return status.value === 'connected' || status.value === 'connecting';
    }
    return status.value === 'running';
  });

  /**
   * Initialize the store by binding to a specific session.
   * Loads profiles, subscribes to terminal events, and focuses
   * the single session this window is responsible for.
   */
  async function initialize(
    sid: string,
    target: string,
    label?: string,
    kind: DetachedTerminalSessionKind = 'local',
  ) {
    sessionId.value = sid;
    attachedTarget.value = target;
    sessionKind.value = kind;
    if (label) {
      profileLabel.value = label;
    }

    ensureEventSubscription();

    if (kind === 'local') {
      profiles.value = await window.terminalApi.listProfiles();

      // Resolve initial session status from main process
      const sessions = await window.terminalApi.listSessions();
      const match = sessions.find((s: TerminalSessionDescriptor) => s.sessionId === sid);
      if (match) {
        status.value = match.status;
        processId.value = match.processId;
        if (!label) {
          profileLabel.value = match.profileLabel;
        }
      }
      buffer.value = await window.terminalApi.getBuffer(sid);
    } else {
      profiles.value = [];
      const sessions = await window.sshApi.listSessions();
      const match = sessions.find((s: SshSessionDescriptor) => s.sessionId === sid);
      if (match) {
        status.value = match.status;
        if (!label) {
          profileLabel.value = match.profileLabel;
        }
      }
      buffer.value = await window.sshApi.getBuffer(sid);
    }
  }

  function ensureEventSubscription() {
    if (removeListener) return;
    removeListener = sessionKind.value === 'ssh'
      ? window.sshApi.onEvent(handleSshEvent)
      : window.terminalApi.onEvent(handleTerminalEvent);
  }

  function handleTerminalEvent(event: TerminalEventEnvelope) {
    // Only process events for the bound session
    if (event.sessionId !== sessionId.value) return;

    switch (event.eventType) {
      case 'data': {
        buffer.value += event.data ?? '';
        break;
      }
      case 'state': {
        if (event.status) {
          status.value = event.status;
        }
        if (event.processId !== undefined) {
          processId.value = event.processId;
        }
        break;
      }
      case 'exit': {
        status.value = 'exited';
        break;
      }
      case 'error': {
        if (event.status) {
          status.value = event.status;
        }
        error.value = event.message ?? 'Unknown terminal error';
        break;
      }
      default:
        break;
    }
  }

  function handleSshEvent(event: SshEventEnvelope) {
    if (event.sessionId !== sessionId.value) return;

    switch (event.eventType) {
      case 'data': {
        buffer.value += event.data ?? '';
        break;
      }
      case 'state': {
        if (event.status) {
          status.value = event.status;
        }
        break;
      }
      case 'exit': {
        status.value = 'exited';
        break;
      }
      case 'error': {
        if (event.status) {
          status.value = event.status;
        } else {
          status.value = 'failed';
        }
        error.value = event.message ?? 'Unknown SSH error';
        break;
      }
      default:
        break;
    }
  }

  async function write(data: string) {
    if (sessionKind.value === 'ssh') {
      await window.sshApi.write(sessionId.value, data);
      return;
    }
    await window.terminalApi.write(sessionId.value, data);
  }

  async function resize(cols: number, rows: number) {
    if (sessionKind.value === 'ssh') {
      await window.sshApi.resizeSession({
        sessionId: sessionId.value,
        cols,
        rows,
      });
      return;
    }
    await window.terminalApi.resizeSession({
      sessionId: sessionId.value,
      cols,
      rows,
      pixelWidth: 1,
      pixelHeight: 1,
    });
  }

  async function kill() {
    try {
      if (sessionKind.value === 'ssh') {
        await window.sshApi.disconnect(sessionId.value);
      } else {
        await window.terminalApi.killSession(sessionId.value);
      }
    } catch (err) {
      console.warn(`[DetachedTerminalStore] Failed to kill session ${sessionId.value}:`, err);
    }
  }

  function clearBuffer() {
    buffer.value = '';
    if (sessionKind.value === 'local') {
      void window.terminalApi.clearBuffer(sessionId.value);
    } else {
      void window.sshApi.clearBuffer(sessionId.value);
    }
  }

  /**
   * Dispose event subscription. Called when the detached window unmounts.
   */
  function dispose() {
    if (removeListener) {
      removeListener();
      removeListener = null;
    }
  }

  return {
    sessionId,
    attachedTarget,
    sessionKind,
    profileLabel,
    status,
    processId,
    buffer,
    error,
    profiles,
    isRunning,
    initialize,
    write,
    resize,
    kill,
    clearBuffer,
    dispose,
  };
});
