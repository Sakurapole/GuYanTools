import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  TerminalEventEnvelope,
  TerminalProfile,
  TerminalSessionDescriptor,
  TerminalSessionStatus,
} from '@/contracts/terminal';

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
  const profileLabel = ref('Terminal');
  const status = ref<TerminalSessionStatus | string>('running');
  const processId = ref<number | undefined>(undefined);

  // ── Buffer & error ──────────────────────────────────────────
  const buffer = ref('');
  const error = ref('');

  // ── Profiles ────────────────────────────────────────────────
  const profiles = ref<TerminalProfile[]>([]);

  // ── Event subscription handle ───────────────────────────────
  let removeListener: (() => void) | null = null;

  const isRunning = computed(() => status.value === 'running');

  /**
   * Initialize the store by binding to a specific session.
   * Loads profiles, subscribes to terminal events, and focuses
   * the single session this window is responsible for.
   */
  async function initialize(sid: string, target: string, label?: string) {
    sessionId.value = sid;
    attachedTarget.value = target;
    if (label) {
      profileLabel.value = label;
    }

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

    ensureEventSubscription();
  }

  function ensureEventSubscription() {
    if (removeListener) return;
    removeListener = window.terminalApi.onEvent(handleEvent);
  }

  function handleEvent(event: TerminalEventEnvelope) {
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

  async function write(data: string) {
    await window.terminalApi.write(sessionId.value, data);
  }

  async function resize(cols: number, rows: number, pixelWidth: number, pixelHeight: number) {
    await window.terminalApi.resizeSession({
      sessionId: sessionId.value,
      cols,
      rows,
      pixelWidth,
      pixelHeight,
    });
  }

  async function kill() {
    try {
      await window.terminalApi.killSession(sessionId.value);
    } catch (err) {
      console.warn(`[DetachedTerminalStore] Failed to kill session ${sessionId.value}:`, err);
    }
  }

  function clearBuffer() {
    buffer.value = '';
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
