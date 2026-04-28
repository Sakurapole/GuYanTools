import { defineStore, acceptHMRUpdate } from 'pinia';
import { computed, ref } from 'vue';
import type {
  CreateTerminalSessionPayload,
  TerminalEventEnvelope,
  TerminalProfile,
  TerminalSessionDescriptor,
} from '@/contracts/terminal';
import { useAppConfigStore } from './app_config_store';

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

export const useTerminalStore = defineStore('terminal', () => {
  const profiles = ref<TerminalProfile[]>([]);
  const sessions = ref<TerminalSessionDescriptor[]>([]);
  const activeSessionId = ref('');
  const sessionBuffers = ref<Record<string, string>>({});
  const sessionErrors = ref<Record<string, string>>({});
  const sessionBootStartedAt = ref<Record<string, number>>({});
  const sessionBootReported = ref<Record<string, boolean>>({});
  const initialized = ref(false);
  let removeListener: (() => void) | null = null;

  const activeSession = computed(() =>
    sessions.value.find((session) => session.sessionId === activeSessionId.value) ?? null,
  );

  /**
   * Sessions visible in the main window.
   * Excludes sessions that have been detached to independent windows.
   */
  const mainSessions = computed(() =>
    sessions.value.filter((session) => !isDetachedTarget(session.attachedTarget)),
  );

  function isDetachedTarget(target: string | undefined) {
    return typeof target === 'string' && target.startsWith('popup:');
  }

  function ensureEventSubscription() {
    if (removeListener) return;
    removeListener = window.terminalApi.onEvent(handleEvent);
  }

  async function initialize(preferredSessionId?: string) {
    if (!initialized.value) {
      profiles.value = await window.terminalApi.listProfiles();
      sessions.value = await window.terminalApi.listSessions();
      ensureEventSubscription();
      await hydrateSessionBuffers(sessions.value.map((session) => session.sessionId));
      initialized.value = true;
    }

    if (preferredSessionId) {
      activeSessionId.value = preferredSessionId;
    } else if (!activeSessionId.value && sessions.value.length > 0) {
      activeSessionId.value = sessions.value[0].sessionId;
    }
  }

  async function ensureSession(preferredSessionId?: string) {
    await initialize(preferredSessionId);
    if (preferredSessionId && sessions.value.some((session) => session.sessionId === preferredSessionId)) {
      activeSessionId.value = preferredSessionId;
      return activeSession.value;
    }

    if (sessions.value.length === 0) {
      return createSession();
    }

    if (!activeSessionId.value && sessions.value.length > 0) {
      activeSessionId.value = sessions.value[0].sessionId;
    }

    return activeSession.value;
  }

  async function refreshSessions() {
    sessions.value = await window.terminalApi.listSessions();
    if (!activeSessionId.value && sessions.value.length > 0) {
      activeSessionId.value = sessions.value[0].sessionId;
    }
  }

  async function createSession(payload: Partial<CreateTerminalSessionPayload> = {}) {
    const appConfigStore = useAppConfigStore();
    const defaultProfileId = appConfigStore.config.features.terminal.defaultProfileId || undefined;
    const defaultCwd = appConfigStore.config.features.terminal.defaultCwd || undefined;
    const descriptor = await window.terminalApi.createSession({
      profileId: payload.profileId ?? defaultProfileId,
      cwd: payload.cwd ?? defaultCwd,
      args: payload.args,
      env: {
        ...appConfigStore.config.features.terminal.env,
        ...(payload.env ?? {}),
      },
      rows: payload.rows ?? DEFAULT_ROWS,
      cols: payload.cols ?? DEFAULT_COLS,
      pixelWidth: payload.pixelWidth ?? DEFAULT_COLS * 8,
      pixelHeight: payload.pixelHeight ?? DEFAULT_ROWS * 18,
      attachedTarget: payload.attachedTarget,
    });

    upsertSession(descriptor);
    sessionBootStartedAt.value = {
      ...sessionBootStartedAt.value,
      [descriptor.sessionId]: Date.now(),
    };
    sessionBootReported.value = {
      ...sessionBootReported.value,
      [descriptor.sessionId]: false,
    };
    activeSessionId.value = descriptor.sessionId;
    return descriptor;
  }

  function focusSession(sessionId: string) {
    activeSessionId.value = sessionId;
  }

  async function write(sessionId: string, data: string) {
    await window.terminalApi.write(sessionId, data);
  }

  async function resizeSession(sessionId: string, cols: number, rows: number, pixelWidth: number, pixelHeight: number) {
    await window.terminalApi.resizeSession({
      sessionId,
      cols,
      rows,
      pixelWidth,
      pixelHeight,
    });
  }

  async function killSession(sessionId: string) {
    try {
      await window.terminalApi.killSession(sessionId);
    } catch (error) {
      console.warn(`[TerminalStore] Failed to kill session ${sessionId}:`, error);
    }
  }

  async function detachToWindow(sessionId: string) {
    await window.terminalApi.detachToWindow(sessionId);
    // Auto-switch focus to the next non-detached session in the main window
    if (activeSessionId.value === sessionId) {
      const nextSession = mainSessions.value.find((s) => s.sessionId !== sessionId);
      activeSessionId.value = nextSession?.sessionId ?? '';
    }
  }

  async function attachToMain(sessionId: string) {
    await window.terminalApi.attachToMain(sessionId);
  }

  function renameSession(sessionId: string, newLabel: string) {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const index = sessions.value.findIndex((s) => s.sessionId === sessionId);
    if (index === -1) return;
    sessions.value = sessions.value.map((s, i) =>
      i === index ? { ...s, profileLabel: trimmed } : s,
    );
  }

  function clearLocalBuffer(sessionId: string) {
    sessionBuffers.value = {
      ...sessionBuffers.value,
      [sessionId]: '',
    };
    void window.terminalApi.clearBuffer(sessionId);
  }

  function getBuffer(sessionId: string) {
    return sessionBuffers.value[sessionId] ?? '';
  }

  function getError(sessionId: string) {
    return sessionErrors.value[sessionId] ?? '';
  }

  function handleEvent(event: TerminalEventEnvelope) {
    switch (event.eventType) {
      case 'data': {
        // Skip buffering data for sessions detached to independent windows
        const matchedSession = sessions.value.find((s) => s.sessionId === event.sessionId);
        if (matchedSession && isDetachedTarget(matchedSession.attachedTarget)) {
          break;
        }
        const nextChunk = appendBootTimingIfNeeded(event.sessionId, event.data ?? '');
        sessionBuffers.value = {
          ...sessionBuffers.value,
          [event.sessionId]: `${sessionBuffers.value[event.sessionId] ?? ''}${nextChunk}`,
        };
        break;
      }
      case 'state':
        updateSessionFromEvent(event);
        if (event.attachedTarget && !isDetachedTarget(event.attachedTarget)) {
          focusReturnedSessionIfNeeded(event.sessionId);
          void hydrateSessionBuffer(event.sessionId);
        }
        break;
      case 'exit':
        removeSessionLocal(event.sessionId);
        break;
      case 'error':
        updateSessionFromEvent(event);
        sessionErrors.value = {
          ...sessionErrors.value,
          [event.sessionId]: event.message ?? '终端发生未知错误',
        };
        break;
      default:
        break;
    }
  }

  function updateSessionFromEvent(event: TerminalEventEnvelope) {
    const index = sessions.value.findIndex((session) => session.sessionId === event.sessionId);
    if (index === -1) {
      return;
    }

    const current = sessions.value[index];
    const next: TerminalSessionDescriptor = {
      ...current,
      status: event.status ?? current.status,
      attachedTarget: event.attachedTarget ?? current.attachedTarget,
      processId: event.processId ?? current.processId,
    };

    sessions.value = sessions.value.map((session, itemIndex) => itemIndex === index ? next : session);
  }

  function upsertSession(session: TerminalSessionDescriptor) {
    const index = sessions.value.findIndex((item) => item.sessionId === session.sessionId);
    if (index === -1) {
      sessions.value = [...sessions.value, session];
      return;
    }

    sessions.value = sessions.value.map((item, itemIndex) => itemIndex === index ? session : item);
  }

  function focusReturnedSessionIfNeeded(sessionId: string) {
    const activeMainSession = mainSessions.value.find((session) => session.sessionId === activeSessionId.value);
    if (activeMainSession) {
      return;
    }

    if (mainSessions.value.some((session) => session.sessionId === sessionId)) {
      activeSessionId.value = sessionId;
    }
  }

  async function hydrateSessionBuffers(sessionIds: string[]) {
    await Promise.all(sessionIds.map((sessionId) => hydrateSessionBuffer(sessionId)));
  }

  async function hydrateSessionBuffer(sessionId: string) {
    const buffer = await window.terminalApi.getBuffer(sessionId);
    sessionBuffers.value = {
      ...sessionBuffers.value,
      [sessionId]: buffer,
    };
  }

  function removeSessionLocal(sessionId: string) {
    const index = sessions.value.findIndex((s) => s.sessionId === sessionId);
    if (index === -1) return;

    sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId);

    const nextBuffers = { ...sessionBuffers.value };
    delete nextBuffers[sessionId];
    sessionBuffers.value = nextBuffers;

    const nextErrors = { ...sessionErrors.value };
    delete nextErrors[sessionId];
    sessionErrors.value = nextErrors;

    const nextStartedAt = { ...sessionBootStartedAt.value };
    delete nextStartedAt[sessionId];
    sessionBootStartedAt.value = nextStartedAt;

    const nextReported = { ...sessionBootReported.value };
    delete nextReported[sessionId];
    sessionBootReported.value = nextReported;

    if (activeSessionId.value === sessionId) {
      activeSessionId.value = sessions.value.length > 0 ? sessions.value[sessions.value.length - 1].sessionId : '';
    }
  }

  function appendBootTimingIfNeeded(sessionId: string, chunk: string) {
    if (!chunk || sessionBootReported.value[sessionId]) {
      return chunk;
    }

    const startedAt = sessionBootStartedAt.value[sessionId];
    if (!startedAt) {
      return chunk;
    }

    const session = sessions.value.find((item) => item.sessionId === sessionId);
    if (isPowerShellSession(session?.profileLabel)) {
      sessionBootReported.value = {
        ...sessionBootReported.value,
        [sessionId]: true,
      };
      return chunk;
    }

    if (!looksLikeInitialPrompt(sessionId, chunk)) {
      return chunk;
    }

    const elapsed = Math.max(0, Date.now() - startedAt);
    const timingLine = `Terminal startup finished in ${elapsed}ms.\r\n`;

    sessionBootReported.value = {
      ...sessionBootReported.value,
      [sessionId]: true,
    };

    return `${timingLine}${chunk}`;
  }

  function looksLikeInitialPrompt(sessionId: string, chunk: string) {
    const existingBuffer = sessionBuffers.value[sessionId] ?? '';
    if (existingBuffer.includes('> ') || existingBuffer.includes('$ ') || existingBuffer.includes('# ')) {
      return false;
    }

    return /(?:\([^)]+\)\s*)?PS [^\r\n>]+> $/.test(chunk)
      || /^[A-Za-z]:\\[^\r\n>]*> ?$/.test(chunk)
      || /^[^\r\n]*[$#] $/.test(chunk);
  }

  function isPowerShellSession(profileLabel?: string) {
    return typeof profileLabel === 'string' && profileLabel.toLowerCase().includes('powershell');
  }

  return {
    profiles,
    sessions,
    activeSessionId,
    activeSession,
    mainSessions,
    initialized,
    initialize,
    ensureSession,
    refreshSessions,
    createSession,
    focusSession,
    write,
    resizeSession,
    killSession,
    detachToWindow,
    attachToMain,
    clearLocalBuffer,
    getBuffer,
    getError,
    renameSession,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTerminalStore, import.meta.hot));
}
