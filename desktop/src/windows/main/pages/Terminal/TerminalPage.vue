<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MainPageLayout from '@/windows/main/components/layout/MainPageLayout.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPopupSurface from '@/windows/main/components/ui/UiPopupSurface.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import { notifyError, notifySuccess } from '@/windows/main/composables/useInAppNotification';
import {
  CONNECTION_LAYOUTS_CHANGED_EVENT,
  deleteConnectionLayoutConfig,
  getConnectionLayoutConfig,
  listConnectionLayoutConfigs,
  saveConnectionLayoutConfig,
  type ConnectionLayoutConfig,
  type ConnectionLayoutTarget,
} from '@/windows/main/session_layouts';
import { useGlobalStore } from '@/windows/main/stores/global_store';
import { useTerminalStore } from '@/windows/main/stores/terminal_store';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import { useFtpStore } from '@/windows/main/stores/ftp_store';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import type { TerminalBackgroundConfig, TerminalLayoutMode, TerminalRendererMode, TerminalSessionDescriptor } from '@/contracts/terminal';
import type { BackgroundConfirmPayload } from '@/contracts/background';
import { resolveThemeBackground, withThemeBackground } from '@/contracts/background';
import type { SshProfile, SshSessionDescriptor } from '@/contracts/ssh';
import type { WorkspaceDetachedWindowState, WorkspaceWindowContext } from '@/contracts/workspace_window';
import TerminalSearchPanel from './TerminalSearchPanel.vue';
import TerminalToolbar from './TerminalToolbar.vue';
import TerminalProfileIcon from './TerminalProfileIcon.vue';
import TerminalViewport from './TerminalViewport.vue';
import SshSidebarTab from './SshSidebarTab.vue';
import SshProfileDialog from './SshProfileDialog.vue';
import SshKeyManagerDialog from './SshKeyManagerDialog.vue';
import SshFingerprintDialog from './SshFingerprintDialog.vue';
import PortForwardPanel from './PortForwardPanel.vue';
import PortForwardDialog from './PortForwardDialog.vue';

const UiPersonalizationConfig = defineAsyncComponent(() => import('@/windows/main/components/ui/UiPersonalizationConfig.vue'));

/**
 * Main-window terminal page.
 * This component is used exclusively in the main application window.
 * Detached (independent) terminal windows use DetachedTerminal.vue instead.
 */

const route = useRoute();
const router = useRouter();
const workspaceWindowContext = ref<WorkspaceWindowContext>({ role: 'main' });
const isDetachedWindow = computed(() => workspaceWindowContext.value.role === 'detached');

const globalStore = useGlobalStore();
const terminalStore = useTerminalStore();
const sshStore = useSshStore();
const ftpStore = useFtpStore();
const appConfigStore = useAppConfigStore();

type MainPageLayoutExpose = {
  mainElement: HTMLElement | null;
  stageElement: HTMLElement | null;
};

const viewportRefs = new Map<string, InstanceType<typeof TerminalViewport>>();
const searchPanelRef = ref<InstanceType<typeof TerminalSearchPanel> | null>(null);
const terminalLayoutRef = ref<MainPageLayoutExpose | null>(null);
const handledTerminalOpenRequestIds = new Set<string>();
const searchVisible = ref(false);
const searchQuery = ref('');
const searchResultIndex = ref(-1);
const searchResultCount = ref(0);
const sidebarCollapsed = ref(false);
const sidebarTab = ref<'config'>('config');
type TerminalPaneKind = 'local' | 'ssh' | 'ssh-pending';

interface TerminalPane {
  key: string;
  kind: TerminalPaneKind;
  sessionId: string;
  profileId: string;
  title: string;
  subtitle: string;
  status: string;
  buffer: string;
  session: TerminalSessionDescriptor | SshSessionDescriptor | SshProfile;
}

interface TerminalPaneLayoutItem {
  pane: TerminalPane;
  style: Record<string, string>;
}

type PaneResizeKind = 'split' | 'master-main' | 'grid' | 'dwindle';
type PaneResizeOrientation = 'horizontal' | 'vertical';

interface TerminalPaneResizeHandle {
  id: string;
  kind: PaneResizeKind;
  orientation: PaneResizeOrientation;
  style: Record<string, string>;
  bounds?: { left: number; top: number; width: number; height: number };
  stateKey?: string;
  index?: number;
  splitIndex?: number;
}

interface PaneResizeInteraction {
  handle: TerminalPaneResizeHandle;
  startX: number;
  startY: number;
  startSizes: number[];
  rect: DOMRect;
}

interface PaneDragInteraction {
  pointerId: number;
  pane: TerminalPane;
  startX: number;
  startY: number;
  focusViewportOnClick: boolean;
  moved: boolean;
  originalOrder: string[];
  previewOrder: string[];
}

interface DwindleLayoutModel {
  items: TerminalPaneLayoutItem[];
  handles: TerminalPaneResizeHandle[];
}

interface TerminalWorkspaceWindowState {
  focusedTerminalPaneKey?: string;
  paneOrder?: string[];
  layoutSizeState?: Record<string, number[]>;
  masterMainRatio?: number;
  dwindleSplitRatios?: number[];
  sidebarCollapsed?: boolean;
}

const focusedTerminalPaneKey = ref('');
const paneOrder = ref<string[]>([]);
const paneDragPreviewOrder = ref<string[]>([]);
const draggingPaneKey = ref('');
const dropTargetPaneKey = ref('');
const paneDragPreview = ref({
  visible: false,
  left: 0,
  top: 0,
  title: '',
  kind: '' as TerminalPaneKind | '',
});
const layoutSizeState = ref<Record<string, number[]>>({});
const masterMainRatio = ref(66);
const dwindleSplitRatios = ref<number[]>([]);
const paneDragInteraction = ref<PaneDragInteraction | null>(null);
const resizeInteraction = ref<PaneResizeInteraction | null>(null);
const connectionLayoutConfigs = ref<ConnectionLayoutConfig[]>([]);
const saveLayoutDialogVisible = ref(false);
const saveLayoutName = ref('');
let terminalWorkspaceWindowStateReady = false;
let terminalWorkspaceWindowStateTimer: number | undefined;
let terminalWorkspaceSessionRefreshQueue = Promise.resolve();
let removeWorkspaceWindowStateListener: (() => void) | undefined;

function syncSidebarTabFromRoute() {
  const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  if (tab === 'config' || tab === 'terminal' || tab === 'ssh' || tab === 'connections') {
    sidebarTab.value = 'config';
  }
}

function routeQueryString(key: string) {
  const value = route.query[key];
  return Array.isArray(value) ? value[0] ?? '' : typeof value === 'string' ? value : '';
}

function hasTerminalOpenRequest() {
  return Boolean(routeQueryString('openTerminalRequestId') && (
    routeQueryString('openLocalCwd') || routeQueryString('openLocalProfileId') || routeQueryString('connectSshProfileId')
  )) || Boolean(routeQueryString('openConnectionLayoutRequestId') && routeQueryString('openConnectionLayoutId'));
}

function activateSidebarTab() {
  sidebarTab.value = 'config';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function readNumberArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
    ? value
    : null;
}

function readLayoutSizeState(value: unknown) {
  if (!isPlainRecord(value)) return null;
  const next: Record<string, number[]> = {};
  for (const [key, sizes] of Object.entries(value)) {
    const parsed = readNumberArray(sizes);
    if (parsed) {
      next[key] = parsed;
    }
  }
  return next;
}

function cloneLayoutSizeState(value: Record<string, number[]>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, sizes]) => [key, [...sizes]]),
  );
}

async function loadTerminalWorkspaceWindowState() {
  try {
    const state = await window.workspaceWindowApi?.getPageState('terminal') as TerminalWorkspaceWindowState | null | undefined;
    if (!isPlainRecord(state)) return;

    if (typeof state.focusedTerminalPaneKey === 'string') {
      focusedTerminalPaneKey.value = state.focusedTerminalPaneKey;
    }
    const nextPaneOrder = readStringArray(state.paneOrder);
    if (nextPaneOrder) {
      paneOrder.value = nextPaneOrder;
    }
    const nextLayoutSizeState = readLayoutSizeState(state.layoutSizeState);
    if (nextLayoutSizeState) {
      layoutSizeState.value = nextLayoutSizeState;
    }
    if (typeof state.masterMainRatio === 'number' && Number.isFinite(state.masterMainRatio)) {
      masterMainRatio.value = clamp(state.masterMainRatio, 24, 76);
    }
    const nextDwindleSplitRatios = readNumberArray(state.dwindleSplitRatios);
    if (nextDwindleSplitRatios) {
      dwindleSplitRatios.value = nextDwindleSplitRatios;
    }
    if (typeof state.sidebarCollapsed === 'boolean') {
      sidebarCollapsed.value = state.sidebarCollapsed;
    }
    syncActiveStoresFromFocusedPane();
  } finally {
    terminalWorkspaceWindowStateReady = true;
  }
}

function buildTerminalWorkspaceWindowStateSnapshot(): TerminalWorkspaceWindowState {
  return {
    focusedTerminalPaneKey: focusedTerminalPaneKey.value,
    paneOrder: [...paneOrder.value],
    layoutSizeState: cloneLayoutSizeState(layoutSizeState.value),
    masterMainRatio: masterMainRatio.value,
    dwindleSplitRatios: [...dwindleSplitRatios.value],
    sidebarCollapsed: sidebarCollapsed.value,
  };
}

function persistTerminalWorkspaceWindowState() {
  if (!terminalWorkspaceWindowStateReady) return;
  void window.workspaceWindowApi
    ?.setPageState('terminal', buildTerminalWorkspaceWindowStateSnapshot())
    .catch((error) => {
      console.warn('[workspace-window] Failed to persist terminal page state:', error);
    });
}

function scheduleTerminalWorkspaceWindowStatePersist() {
  if (!terminalWorkspaceWindowStateReady) return;
  window.clearTimeout(terminalWorkspaceWindowStateTimer);
  terminalWorkspaceWindowStateTimer = window.setTimeout(persistTerminalWorkspaceWindowState, 80);
}

function refreshTerminalWorkspaceSessions() {
  const nextRefresh = terminalWorkspaceSessionRefreshQueue
    .catch(() => undefined)
    .then(async () => {
      if (terminalStore.initialized) {
        await terminalStore.refreshSessions();
      }
      if (sshStore.initialized) {
        await sshStore.refreshSessions();
      }
      syncActiveStoresFromFocusedPane();
    });
  terminalWorkspaceSessionRefreshQueue = nextRefresh;
  return nextRefresh;
}

function handleWorkspaceWindowStateChanged(state: WorkspaceDetachedWindowState) {
  if (route.path === '/terminal' && typeof state.detached.terminal === 'boolean') {
    void refreshTerminalWorkspaceSessions().catch((error) => {
      console.warn('[workspace-window] Failed to refresh terminal sessions:', error);
    });
  }
}

watch(() => route.query.tab, syncSidebarTabFromRoute, { immediate: true });
onActivated(syncSidebarTabFromRoute);

// ── SSH dialog state ──────────────────────────────────────────

const sshProfileDialogVisible = ref(false);
const sshProfileDialogTarget = ref<SshProfile | null>(null);
const sshProfileDialogGroupId = ref('');
const sshKeyManagerVisible = ref(false);
const sshFingerprintVisible = ref(false);
const sshFingerprintInfo = ref({ host: '', port: 22, algorithm: '', fingerprint: '' });
const sshConnectError = ref('');
const sshConnectingProfileIds = ref<string[]>([]);
const sshLastFailedProfile = ref<SshProfile | null>(null);
/** Pending connect callback resolved after fingerprint is trusted */
let sshFingerprintResolve: (() => void) | null = null;
let sshFingerprintReject: (() => void) | null = null;

const isAnySshProfileConnecting = computed(() => sshConnectingProfileIds.value.length > 0);

function isSshProfileConnecting(profileId: string) {
  return sshConnectingProfileIds.value.includes(profileId);
}

function markSshProfileConnecting(profileId: string) {
  if (!isSshProfileConnecting(profileId)) {
    sshConnectingProfileIds.value = [...sshConnectingProfileIds.value, profileId];
  }
}

function clearSshProfileConnecting(profileId: string) {
  sshConnectingProfileIds.value = sshConnectingProfileIds.value.filter((id) => id !== profileId);
}

// ── Port forward dialog state ─────────────────────────────────
const pfDialogVisible = ref(false);
const pfDialogTarget = ref<import('@/contracts/ssh').SshPortForward | null>(null);

function openPortForwardDialog(fwd: import('@/contracts/ssh').SshPortForward | null = null) {
  pfDialogTarget.value = fwd;
  pfDialogVisible.value = true;
}

// ── SSH Password Prompt ───────────────────────────────────────
const sshPasswordPromptVisible = ref(false);
const sshPasswordPromptLabel = ref('');
const sshPasswordPromptValue = ref('');
let sshPasswordResolve: ((pwd: string | null) => void) | null = null;

function promptSshPassword(profile: SshProfile): Promise<string | null> {
  sshPasswordPromptLabel.value = `${profile.username}@${profile.host}:${profile.port}`;
  sshPasswordPromptValue.value = '';
  sshPasswordPromptVisible.value = true;
  return new Promise<string | null>((resolve) => {
    sshPasswordResolve = resolve;
  });
}

function handleSshPasswordConfirm() {
  sshPasswordPromptVisible.value = false;
  sshPasswordResolve?.(sshPasswordPromptValue.value || null);
  sshPasswordResolve = null;
}

function handleSshPasswordCancel() {
  sshPasswordPromptVisible.value = false;
  sshPasswordResolve?.(null);
  sshPasswordResolve = null;
}

function openSshProfileDialog(profile: SshProfile | null, groupId = '') {
  sshProfileDialogTarget.value = profile;
  sshProfileDialogGroupId.value = profile ? '' : groupId;
  sshProfileDialogVisible.value = true;
}

function handleSshProfileSaved() {
  sshProfileDialogVisible.value = false;
  sshProfileDialogGroupId.value = '';
}

async function handleSshConnect(profile: SshProfile) {
  if (!sshStore) return;
  sshConnectError.value = '';
  markSshProfileConnecting(profile.id);
  focusedTerminalPaneKey.value = makePaneKey('ssh-pending', profile.id);
  sshLastFailedProfile.value = null;

  // If password auth and password not saved, prompt the user
  let password: string | undefined;
  if (profile.authType === 'password' && !profile.savePassword) {
    const input = await promptSshPassword(profile);
    if (input === null) {
      clearSshProfileConnecting(profile.id);
      return;
    }
    password = input;
  }

  const doConnect = async (pwd?: string) =>
    sshStore!.connect({ profileId: profile.id, rows: 32, cols: 120, password: pwd });

  try {
    const descriptor = await doConnect(password);
    focusSshSession(descriptor.sessionId, true);
    sshConnectError.value = '';
  } catch (err: unknown) {
    const descriptor = await handleSshConnectFailure(profile, password, err, doConnect);
    if (descriptor) {
      focusSshSession(descriptor.sessionId, true);
    }
  } finally {
    clearSshProfileConnecting(profile.id);
  }
}

async function handleSshConnectFailure(
  profile: SshProfile,
  password: string | undefined,
  err: unknown,
  doConnect: (pwd?: string) => Promise<SshSessionDescriptor>,
): Promise<SshSessionDescriptor | null> {
  const msg = err instanceof Error ? err.message : String(err);
  const hostVerification = extractSshHostVerification(msg);
  if (hostVerification) {
    try {
      sshFingerprintInfo.value = hostVerification;
      sshFingerprintVisible.value = true;
      await new Promise<void>((resolve, reject) => {
        sshFingerprintResolve = resolve;
        sshFingerprintReject = reject;
      });
      try {
        const descriptor = await doConnect(password);
        sshConnectError.value = '';
        return descriptor;
      } catch (retryErr) {
        showSshConnectError(profile, retryErr);
      }
    } catch {
      sshFingerprintVisible.value = false;
    }
    return null;
  }

  showSshConnectError(profile, err);
  return null;
}

function extractSshHostVerification(message: string) {
  const jsonStart = message.indexOf('{');
  if ((message.includes('unknown_host') || message.includes('mismatch')) && jsonStart !== -1) {
    try {
      const parsed = JSON.parse(message.slice(jsonStart)) as Partial<typeof sshFingerprintInfo.value>;
      if (
        typeof parsed.host === 'string'
        && typeof parsed.port === 'number'
        && typeof parsed.algorithm === 'string'
        && typeof parsed.fingerprint === 'string'
      ) {
        return {
          host: parsed.host,
          port: parsed.port,
          algorithm: parsed.algorithm,
          fingerprint: parsed.fingerprint,
        };
      }
    } catch {
      // Fall through to the native colon-delimited format.
    }
  }

  const match = message.match(/host_verification_(?:required|mismatch):([^:]+):(\d+):([^:]+):([^\s]+)/);
  if (!match) return null;

  return {
    host: match[1],
    port: Number(match[2]),
    algorithm: match[3],
    fingerprint: match[4],
  };
}

function showSshConnectError(profile: SshProfile, err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw
    .replace(/^Error invoking remote method 'ssh:connect': Error:\s*/i, '')
    .replace(/^connect failed:\s*/i, '')
    .replace(/^host_verification_(?:required|mismatch):/i, '需要确认服务器主机指纹：')
    .trim();
  sshLastFailedProfile.value = profile;
  sshConnectError.value = `SSH 连接失败：${message || '未知错误'}`;
  notifyError(new Error(`${profile.label}: ${message || '未知错误'}`), 'SSH 连接失败', {
    dedupeKey: `ssh-connect:${profile.id}:${message || raw}`,
  });
  console.warn('[TerminalPage] SSH connect failed:', message || raw);
}

function handleSshFingerprintTrusted() {
  sshFingerprintVisible.value = false;
  sshFingerprintResolve?.();
  sshFingerprintResolve = null;
  sshFingerprintReject = null;
}

function handleSshFingerprintRejected() {
  sshFingerprintVisible.value = false;
  sshFingerprintReject?.();
  sshFingerprintResolve = null;
  sshFingerprintReject = null;
}

function handleSshFocusSession(session: SshSessionDescriptor) {
  sshConnectError.value = '';
  sshLastFailedProfile.value = null;
  focusSshSession(session.sessionId, true);
}

async function handleSshDisconnect(sessionId: string) {
  await sshStore?.disconnect(sessionId);
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

const activeSession = computed(() => terminalStore.activeSession);
const rendererMode = computed(() => appConfigStore.config.features.terminal.rendererMode);
const layoutMode = computed(() => appConfigStore.config.features.terminal.layoutMode ?? 'tabbed');
const enableBell = computed(() => appConfigStore.config.features.terminal.enableBell);
const enableSixel = computed(() => appConfigStore.config.features.terminal.enableSixel);
const colorSchemeId = computed(() => appConfigStore.config.features.terminal.colorSchemeId ?? 'dark-default');
const forwardedPortSummaries = computed(() => sshStore.runningPortForwardSummaries);
const localTerminalPanes = computed<TerminalPane[]>(() =>
  terminalStore.mainSessions.map((session) => ({
    key: makePaneKey('local', session.sessionId),
    kind: 'local',
    sessionId: session.sessionId,
    profileId: session.profileId,
    title: session.profileLabel,
    subtitle: session.cwd || '本地终端',
    status: session.status,
    buffer: terminalStore.getBuffer(session.sessionId),
    session,
  })),
);
const sshTerminalPanes = computed<TerminalPane[]>(() =>
  sshStore.mainSessions.map((session) => ({
    key: makePaneKey('ssh', session.sessionId),
    kind: 'ssh',
    sessionId: session.sessionId,
    profileId: session.profileId,
    title: session.profileLabel,
    subtitle: `${session.username}@${session.host}:${session.port}`,
    status: session.status,
    buffer: sshStore.getBuffer(session.sessionId),
    session,
  })),
);
const pendingSshTerminalPanes = computed<TerminalPane[]>(() =>
  sshConnectingProfileIds.value
    .map((profileId) => sshStore.profiles.find((profile) => profile.id === profileId))
    .filter((profile): profile is SshProfile => Boolean(profile))
    .map((profile) => ({
      key: makePaneKey('ssh-pending', profile.id),
      kind: 'ssh-pending',
      sessionId: profile.id,
      profileId: profile.id,
      title: profile.label,
      subtitle: `${profile.username}@${profile.host}:${profile.port}`,
      status: 'connecting',
      buffer: '',
      session: profile,
    })),
);
const terminalPanes = computed<TerminalPane[]>(() => [
  ...localTerminalPanes.value,
  ...pendingSshTerminalPanes.value,
  ...sshTerminalPanes.value,
]);
const orderedTerminalPanes = computed<TerminalPane[]>(() => {
  const paneByKey = new Map(terminalPanes.value.map((pane) => [pane.key, pane]));
  const orderKeys = paneOrder.value;
  const ordered = orderKeys
    .map((key) => paneByKey.get(key))
    .filter((pane): pane is TerminalPane => Boolean(pane));
  const orderedKeys = new Set(ordered.map((pane) => pane.key));
  const appended = terminalPanes.value.filter((pane) => !orderedKeys.has(pane.key));
  return [...ordered, ...appended];
});
const activeTerminalPane = computed<TerminalPane | null>(() => {
  const panes = terminalPanes.value;
  return panes.find((pane) => pane.key === focusedTerminalPaneKey.value)
    ?? panes.find((pane) => pane.kind === 'ssh' && pane.sessionId === sshStore.activeSshSessionId)
    ?? panes.find((pane) => pane.kind === 'local' && pane.sessionId === terminalStore.activeSessionId)
    ?? panes.find((pane) => pane.kind === 'ssh-pending')
    ?? panes[0]
    ?? null;
});
const activeToolbarSession = computed<TerminalSessionDescriptor | null>(() => {
  const pane = activeTerminalPane.value;
  if (!pane) return null;
  if (pane.kind === 'local') {
    return pane.session as TerminalSessionDescriptor;
  }
  if (pane.kind === 'ssh-pending') {
    const profile = pane.session as SshProfile;
    return {
      sessionId: pane.sessionId,
      profileId: profile.id,
      profileLabel: profile.label,
      cwd: pane.subtitle,
      attachedTarget: 'main',
      status: 'connecting',
    };
  }

  const session = pane.session as SshSessionDescriptor;
  return {
    sessionId: session.sessionId,
    profileId: session.profileId,
    profileLabel: session.profileLabel,
    cwd: pane.subtitle,
    attachedTarget: session.attachedTarget ?? 'main',
    status: session.status,
  };
});
const visibleTerminalPanes = computed<TerminalPane[]>(() => {
  const activePane = activeTerminalPane.value;
  if (layoutMode.value === 'tabbed') {
    return activePane ? [activePane] : [];
  }

  return orderedTerminalPanes.value;
});
const gridColumnCount = computed(() => {
  const count = visibleTerminalPanes.value.length;
  return Math.max(1, Math.ceil(Math.sqrt(count)));
});
const gridRowCount = computed(() => {
  const count = visibleTerminalPanes.value.length;
  return Math.max(1, Math.ceil(count / gridColumnCount.value));
});
const masterStackCount = computed(() => Math.max(0, visibleTerminalPanes.value.length - 1));
const terminalPaneWorkspaceStyle = computed<Record<string, string>>(() => {
  const count = visibleTerminalPanes.value.length;
  if (layoutMode.value === 'split-horizontal') {
    return {
      gridTemplateRows: toGridTemplate(ensureLayoutSizes('split-horizontal:rows', count)),
      gridTemplateColumns: 'minmax(0, 1fr)',
    };
  }

  if (layoutMode.value === 'split-vertical') {
    return {
      gridTemplateColumns: toGridTemplate(ensureLayoutSizes('split-vertical:columns', count)),
      gridTemplateRows: 'minmax(0, 1fr)',
    };
  }

  if (layoutMode.value === 'master-stack' && count > 1) {
    return {
      gridTemplateColumns: `${masterMainRatio.value}% ${100 - masterMainRatio.value}%`,
      gridTemplateRows: toGridTemplate(ensureLayoutSizes('master-stack:stack-rows', masterStackCount.value)),
    };
  }

  if (layoutMode.value === 'grid') {
    return {
      gridTemplateColumns: toGridTemplate(ensureLayoutSizes('grid:columns', gridColumnCount.value)),
      gridTemplateRows: toGridTemplate(ensureLayoutSizes('grid:rows', gridRowCount.value)),
    };
  }

  return {};
});
const dwindleLayoutModel = computed<DwindleLayoutModel>(() => buildDwindleLayout(visibleTerminalPanes.value));
const terminalPaneLayoutItems = computed<TerminalPaneLayoutItem[]>(() => {
  if (layoutMode.value === 'dwindle') {
    return dwindleLayoutModel.value.items;
  }

  return visibleTerminalPanes.value.map((pane, index) => ({
    pane,
    style: getGridPaneStyle(index),
  }));
});
const terminalPaneResizeHandles = computed<TerminalPaneResizeHandle[]>(() => {
  const count = visibleTerminalPanes.value.length;
  if (count <= 1 || layoutMode.value === 'tabbed') {
    return [];
  }

  if (layoutMode.value === 'split-horizontal') {
    return buildLinearResizeHandles('split-horizontal:rows', 'horizontal');
  }

  if (layoutMode.value === 'split-vertical') {
    return buildLinearResizeHandles('split-vertical:columns', 'vertical');
  }

  if (layoutMode.value === 'master-stack') {
    const handles: TerminalPaneResizeHandle[] = [{
      id: 'master-stack:main',
      kind: 'master-main',
      orientation: 'vertical',
      style: {
        left: `${masterMainRatio.value}%`,
        top: '0%',
        height: '100%',
      },
    }];
    return [
      ...handles,
      ...buildLinearResizeHandles('master-stack:stack-rows', 'horizontal', {
        left: `${masterMainRatio.value}%`,
        width: `${100 - masterMainRatio.value}%`,
      }),
    ];
  }

  if (layoutMode.value === 'grid') {
    return [
      ...buildLinearResizeHandles('grid:columns', 'vertical'),
      ...buildLinearResizeHandles('grid:rows', 'horizontal'),
    ];
  }

  if (layoutMode.value === 'dwindle') {
    return dwindleLayoutModel.value.handles;
  }

  return [];
});
const activeSshSessionForPane = computed(() =>
  activeTerminalPane.value?.kind === 'ssh'
    ? (activeTerminalPane.value.session as SshSessionDescriptor)
    : null,
);
const activeSshProfile = computed(() =>
  activeSshSessionForPane.value
    ? sshStore.profiles.find((profile) => profile.id === activeSshSessionForPane.value?.profileId) ?? null
    : null,
);
/** Whether the active viewport is for an SSH session */
const isSshMode = computed(() => activeTerminalPane.value?.kind === 'ssh');
const activeLocalTerminalProfile = computed(() => {
  const activePane = activeTerminalPane.value;
  if (!activePane || activePane.kind !== 'local') {
    return null;
  }

  return appConfigStore.config.features.terminal.localProfiles.find((profile) => profile.id === activePane.profileId) ?? null;
});

watch(() => sshStore.activeSshSessionId, (sessionId) => {
  if (sessionId || activeSession.value) {
    return;
  }

  sshStore.togglePortForwardPanel(false);
});

watch(terminalPanes, (panes) => {
  const activePane = activeTerminalPane.value;
  const currentKeys = panes.map((pane) => pane.key);
  paneOrder.value = [
    ...paneOrder.value.filter((key) => currentKeys.includes(key)),
    ...currentKeys.filter((key) => !paneOrder.value.includes(key)),
  ];

  if (!activePane) {
    focusedTerminalPaneKey.value = '';
    return;
  }

  if (!panes.some((pane) => pane.key === focusedTerminalPaneKey.value)) {
    focusedTerminalPaneKey.value = activePane.key;
  }
});

// Background config derived from the active local terminal profile, falling back to global app config.
function getGlobalTerminalBackground(): TerminalBackgroundConfig {
  return {
    type: appConfigStore.config.features.terminal.viewportBgType ?? 'color',
    color: appConfigStore.config.features.terminal.viewportBgColor ?? '',
    image: appConfigStore.config.features.terminal.viewportBgImage ?? '',
    video: appConfigStore.config.features.terminal.viewportBgVideo ?? '',
    style: appConfigStore.config.features.terminal.viewportBgStyle ?? {},
  };
}

function resolveTerminalBackground(background: TerminalBackgroundConfig): TerminalBackgroundConfig {
  const resolved = resolveThemeBackground({
    type: background.type,
    color: background.color,
    image: background.image,
    video: background.video,
    backgroundStyle: background.style,
  }, appConfigStore.config.appearance.theme);
  return {
    type: resolved.type,
    color: resolved.color,
    image: resolved.image,
    video: resolved.video,
    style: resolved.backgroundStyle,
  };
}

const activeTerminalBackground = computed(() => resolveTerminalBackground(
  activeLocalTerminalProfile.value?.background ?? getGlobalTerminalBackground(),
));
const termBgType = computed(() => activeTerminalBackground.value.type);
const termBgColor = computed(() => activeTerminalBackground.value.color);
const termBgImage = computed(() => activeTerminalBackground.value.image);
const termBgVideo = computed(() => activeTerminalBackground.value.video);
const termBgStyle = computed(() => activeTerminalBackground.value.style);
const bgPickerVisible = ref(false);

function getMeasuredElementSize(element: HTMLElement | null, fallback: { width: number; height: number }) {
  if (!element) return fallback;

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0
    ? { width: Math.round(rect.width), height: Math.round(rect.height) }
    : fallback;
}

const terminalBgPreviewSize = computed(() => (
  getMeasuredElementSize(
    terminalLayoutRef.value?.stageElement ?? terminalLayoutRef.value?.mainElement ?? null,
    { width: 320, height: 200 },
  )
));

function makePaneKey(kind: TerminalPaneKind, sessionId: string) {
  return `${kind}:${sessionId}`;
}

function parsePaneKey(key: string): { kind: TerminalPaneKind; sessionId: string } | null {
  const index = key.indexOf(':');
  if (index <= 0) return null;
  const kind = key.slice(0, index);
  const sessionId = key.slice(index + 1);
  if ((kind !== 'local' && kind !== 'ssh' && kind !== 'ssh-pending') || !sessionId) {
    return null;
  }
  return { kind, sessionId };
}

function isTerminalViewportInstance(value: unknown): value is InstanceType<typeof TerminalViewport> {
  return Boolean(value)
    && typeof (value as { focus?: unknown }).focus === 'function'
    && typeof (value as { clear?: unknown }).clear === 'function';
}

function setViewportRef(key: string, instance: unknown) {
  if (isTerminalViewportInstance(instance)) {
    viewportRefs.set(key, instance);
    return;
  }
  viewportRefs.delete(key);
}

function getActiveViewportRef() {
  const key = activeTerminalPane.value?.key;
  return key ? viewportRefs.get(key) ?? null : null;
}

function refitTerminalViewports() {
  viewportRefs.forEach((viewport) => {
    (viewport as { refit?: () => void }).refit?.();
  });
}

function toGridTemplate(sizes: number[]) {
  return sizes.map((size) => `minmax(0, ${size}fr)`).join(' ');
}

function ensureLayoutSizes(key: string, count: number) {
  if (count <= 0) return [];
  const current = layoutSizeState.value[key] ?? [];
  if (current.length === count && current.every((size) => size > 0)) {
    return current;
  }

  const next = Array.from({ length: count }, (_, index) => current[index] || 1);
  layoutSizeState.value = {
    ...layoutSizeState.value,
    [key]: normalizeSizes(next),
  };
  return layoutSizeState.value[key];
}

function normalizeSizes(sizes: number[]) {
  const safeSizes = sizes.map((size) => Math.max(0.1, Number.isFinite(size) ? size : 1));
  const total = safeSizes.reduce((sum, size) => sum + size, 0) || 1;
  return safeSizes.map((size) => size / total);
}

function updateLayoutSizes(key: string, sizes: number[]) {
  layoutSizeState.value = {
    ...layoutSizeState.value,
    [key]: normalizeSizes(sizes),
  };
}

function getGridPaneStyle(index: number): Record<string, string> {
  if (layoutMode.value === 'master-stack' && visibleTerminalPanes.value.length > 1) {
    if (index === 0) {
      return {
        gridColumn: '1',
        gridRow: `1 / ${masterStackCount.value + 1}`,
      };
    }

    return {
      gridColumn: '2',
      gridRow: `${index} / ${index + 1}`,
    };
  }

  if (layoutMode.value === 'grid') {
    const column = (index % gridColumnCount.value) + 1;
    const row = Math.floor(index / gridColumnCount.value) + 1;
    return {
      gridColumn: `${column} / ${column + 1}`,
      gridRow: `${row} / ${row + 1}`,
    };
  }

  return {};
}

function buildLinearResizeHandles(
  stateKey: string,
  orientation: PaneResizeOrientation,
  bounds: Record<string, string> = {},
): TerminalPaneResizeHandle[] {
  const sizes = ensureLayoutSizes(
    stateKey,
    stateKey === 'grid:columns'
      ? gridColumnCount.value
      : stateKey === 'grid:rows'
        ? gridRowCount.value
        : stateKey === 'master-stack:stack-rows'
          ? masterStackCount.value
          : visibleTerminalPanes.value.length,
  );

  if (sizes.length <= 1) return [];

  let offset = 0;
  return sizes.slice(0, -1).map((size, index) => {
    offset += size;
    const percent = offset * 100;
    return {
      id: `${stateKey}:${index}`,
      kind: stateKey.startsWith('grid') ? 'grid' : 'split',
      orientation,
      stateKey,
      index,
      style: orientation === 'vertical'
        ? { left: `${percent}%`, top: '0%', height: '100%', ...bounds }
        : { top: `${percent}%`, left: '0%', width: '100%', ...bounds },
    };
  });
}

function buildDwindleLayout(panes: TerminalPane[]): DwindleLayoutModel {
  const rects: Record<string, string>[] = [];
  const handles: TerminalPaneResizeHandle[] = [];
  let left = 0;
  let top = 0;
  let width = 100;
  let height = 100;

  panes.forEach((pane, index) => {
    const isLast = index === panes.length - 1;
    if (isLast) {
      rects.push(toDwindleStyle(left, top, width, height));
      return;
    }

    const ratio = ensureDwindleRatio(index);
    if (index % 2 === 0) {
      const paneWidth = width * ratio;
      rects.push(toDwindleStyle(left, top, paneWidth, height));
      handles.push({
        id: `dwindle:${index}`,
        kind: 'dwindle',
        orientation: 'vertical',
        splitIndex: index,
        bounds: { left, top, width, height },
        style: {
          left: `${left + paneWidth}%`,
          top: `${top}%`,
          height: `${height}%`,
        },
      });
      left += paneWidth;
      width -= paneWidth;
    } else {
      const paneHeight = height * ratio;
      rects.push(toDwindleStyle(left, top, width, paneHeight));
      handles.push({
        id: `dwindle:${index}`,
        kind: 'dwindle',
        orientation: 'horizontal',
        splitIndex: index,
        bounds: { left, top, width, height },
        style: {
          left: `${left}%`,
          top: `${top + paneHeight}%`,
          width: `${width}%`,
        },
      });
      top += paneHeight;
      height -= paneHeight;
    }
  });

  return {
    items: panes.map((pane, index) => ({ pane, style: rects[index] ?? {} })),
    handles,
  };
}

function ensureDwindleRatio(index: number) {
  const current = dwindleSplitRatios.value[index];
  if (typeof current === 'number' && Number.isFinite(current)) {
    return current;
  }

  const next = [...dwindleSplitRatios.value];
  next[index] = 0.5;
  dwindleSplitRatios.value = next;
  return 0.5;
}

function toDwindleStyle(left: number, top: number, width: number, height: number) {
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  };
}

function resolvePaneBackground(pane: TerminalPane) {
  if (pane.kind === 'local') {
    const localProfile = appConfigStore.config.features.terminal.localProfiles.find((profile) => profile.id === pane.profileId);
    if (localProfile?.background) {
      return resolveTerminalBackground(localProfile.background);
    }
  }

  return resolveTerminalBackground(getGlobalTerminalBackground());
}

function paneHasCustomBg(pane: TerminalPane) {
  const background = resolvePaneBackground(pane);
  if (background.type === 'image' && background.image) return true;
  if (background.type === 'video' && background.video) return true;
  if (background.type === 'color' && background.color) return true;
  return false;
}

// Whether a user-defined background is active (drives WebGL skip + terminal key)
const hasCustomBg = computed(() => {
  if (termBgType.value === 'image' && termBgImage.value) return true;
  if (termBgType.value === 'video' && termBgVideo.value) return true;
  if (termBgType.value === 'color' && termBgColor.value) return true;
  return false;
});

async function initializePage() {
  await terminalStore.ensureSession();
}

async function createSession(profileId?: string) {
  const requestedProfileId = profileId || appConfigStore.config.features.terminal.defaultProfileId || undefined;
  const session = await terminalStore.createSession({
    profileId: requestedProfileId,
  });
  if (appConfigStore.config.features.terminal.detachToWindowByDefault) {
    await terminalStore.detachToWindow(session.sessionId);
    return;
  }
  focusLocalSession(session.sessionId, true);
}

function focusLocalSession(sessionId: string, focusViewport = false) {
  terminalStore.focusSession(sessionId);
  focusedTerminalPaneKey.value = makePaneKey('local', sessionId);
  if (focusViewport) {
    void focusActiveTerminalViewport();
  }
}

function focusSshSession(sessionId: string, focusViewport = false) {
  sshStore.focusSession(sessionId);
  focusedTerminalPaneKey.value = makePaneKey('ssh', sessionId);
  sshConnectError.value = '';
  sshLastFailedProfile.value = null;
  if (focusViewport) {
    void focusActiveTerminalViewport();
  }
}

function focusPane(pane: TerminalPane, focusViewport = true) {
  if (pane.kind === 'ssh-pending') {
    focusedTerminalPaneKey.value = pane.key;
    return;
  }
  if (pane.kind === 'ssh') {
    focusSshSession(pane.sessionId, focusViewport);
    return;
  }
  focusLocalSession(pane.sessionId, focusViewport);
}

function syncActiveStoresFromFocusedPane() {
  const parsed = parsePaneKey(focusedTerminalPaneKey.value);
  if (!parsed) return;
  if (parsed.kind === 'local') {
    terminalStore.focusSession(parsed.sessionId);
  } else if (parsed.kind === 'ssh') {
    sshStore.focusSession(parsed.sessionId);
  }
}

function loadConnectionLayoutConfigs() {
  connectionLayoutConfigs.value = listConnectionLayoutConfigs('terminal');
}

function targetKeyForTerminalLayout(target: ConnectionLayoutTarget, sessionId: string) {
  if (target.surface !== 'terminal') return '';
  return makePaneKey(target.kind === 'ssh' ? 'ssh' : 'local', sessionId);
}

function snapshotTerminalTarget(pane: TerminalPane): ConnectionLayoutTarget | null {
  if (pane.kind === 'ssh-pending') return null;
  if (pane.kind === 'local') {
    const session = pane.session as TerminalSessionDescriptor;
    return {
      surface: 'terminal',
      kind: 'local',
      profileId: session.profileId,
      cwd: session.cwd,
      label: pane.title,
    };
  }

  const session = pane.session as SshSessionDescriptor;
  return {
    surface: 'terminal',
    kind: 'ssh',
    profileId: session.profileId,
    cwd: sshStore.getSessionWorkingDirectory(session.sessionId),
    label: session.profileLabel,
  };
}

function defaultTerminalLayoutName() {
  return `终端布局 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
}

function openSaveTerminalLayoutDialog() {
  if (!orderedTerminalPanes.value.some((pane) => pane.kind !== 'ssh-pending')) {
    notifyError(new Error('当前没有可保存的终端连接。'), '保存连接布局失败');
    return;
  }
  saveLayoutName.value = defaultTerminalLayoutName();
  saveLayoutDialogVisible.value = true;
}

function saveCurrentTerminalConnectionLayout() {
  const targets = orderedTerminalPanes.value
    .map(snapshotTerminalTarget)
    .filter((target): target is ConnectionLayoutTarget => Boolean(target));
  if (!targets.length) {
    notifyError(new Error('当前没有可保存的终端连接。'), '保存连接布局失败');
    return;
  }

  const name = saveLayoutName.value.trim() || defaultTerminalLayoutName();

  const saved = saveConnectionLayoutConfig({
    name,
    surface: 'terminal',
    targets,
    viewState: {
      layoutMode: layoutMode.value,
      order: orderedTerminalPanes.value.map((pane) => pane.key),
      layoutSizeState: layoutSizeState.value,
      masterMainRatio: masterMainRatio.value,
      dwindleSplitRatios: dwindleSplitRatios.value,
    },
  });
  loadConnectionLayoutConfigs();
  saveLayoutDialogVisible.value = false;
  notifySuccess(`${saved.name} 已保存，可在首页小组件或终端页快速打开。`, '连接布局已保存');
}

function deleteTerminalConnectionLayout(layoutId: string) {
  if (!layoutId) return;
  const layout = getConnectionLayoutConfig(layoutId);
  deleteConnectionLayoutConfig(layoutId);
  loadConnectionLayoutConfigs();
  notifySuccess(`${layout?.name ?? '连接布局'} 已删除。`, '连接布局已删除');
}

async function replaceExistingTerminalConnections() {
  const localSessionIds = terminalStore.mainSessions.map((session) => session.sessionId);
  const sshSessionIds = sshStore.mainSessions.map((session) => session.sessionId);
  await Promise.all([
    ...localSessionIds.map((sessionId) => terminalStore.killSession(sessionId)),
    ...sshSessionIds.map((sessionId) => sshStore.disconnect(sessionId)),
  ]);
  paneOrder.value = [];
  focusedTerminalPaneKey.value = '';
  layoutSizeState.value = {};
  dwindleSplitRatios.value = [];
  masterMainRatio.value = 66;
}

async function openTerminalTargetFromConnectionLayout(target: ConnectionLayoutTarget) {
  if (target.surface !== 'terminal') return '';

  if (target.kind === 'local') {
    const session = await terminalStore.createSession({
      profileId: target.profileId || undefined,
      cwd: target.cwd || undefined,
    });
    focusLocalSession(session.sessionId, false);
    return targetKeyForTerminalLayout(target, session.sessionId);
  }

  const existing = sshStore.sessions.find(
    (session) => session.profileId === target.profileId && session.status === 'connected',
  );
  if (existing) {
    focusSshSession(existing.sessionId, false);
    await cdSshSession(existing.sessionId, target.cwd ?? '');
    return targetKeyForTerminalLayout(target, existing.sessionId);
  }

  const beforeSessionIds = new Set(sshStore.sessions.map((session) => session.sessionId));
  const profile = sshStore.profiles.find((item) => item.id === target.profileId);
  if (!profile) return '';

  await handleSshConnect(profile);
  const created = [...sshStore.sessions]
    .reverse()
    .find((session) => session.profileId === target.profileId && !beforeSessionIds.has(session.sessionId))
    ?? null;
  if (!created) return '';

  await cdSshSession(created.sessionId, target.cwd ?? '');
  return targetKeyForTerminalLayout(target, created.sessionId);
}

async function openTerminalConnectionLayout(layoutId: string) {
  const layout = getConnectionLayoutConfig(layoutId);
  if (!layout || layout.surface !== 'terminal') {
    notifyError(new Error('找不到终端连接布局配置。'), '打开连接布局失败');
    return;
  }

  try {
    await terminalStore.initialize();
    await sshStore.initialize();
    await replaceExistingTerminalConnections();
    const desiredKeys = (await Promise.all(
      layout.targets.map((target) => openTerminalTargetFromConnectionLayout(target)),
    )).filter(Boolean);

    if (layout.viewState.layoutSizeState) {
      layoutSizeState.value = layout.viewState.layoutSizeState;
    }
    if (typeof layout.viewState.masterMainRatio === 'number') {
      masterMainRatio.value = layout.viewState.masterMainRatio;
    }
    if (layout.viewState.dwindleSplitRatios?.length) {
      dwindleSplitRatios.value = layout.viewState.dwindleSplitRatios;
    }
    paneOrder.value = [
      ...desiredKeys.filter(Boolean),
      ...paneOrder.value.filter((key) => !desiredKeys.includes(key)),
    ];
    await updateLayoutMode(layout.viewState.layoutMode);
    notifySuccess(`${layout.name} 已打开。`, '连接布局已打开');
  } catch (error) {
    notifyError(error, '打开连接布局失败');
  }
}

function shellQuote(path: string) {
  return `'${path.replaceAll("'", `'\"'\"'`)}'`;
}

async function cdSshSession(sessionId: string, cwd: string) {
  if (!cwd.trim()) return;
  try {
    await sshStore.write(sessionId, `cd ${shellQuote(cwd)}\n`);
  } catch (error) {
    if (isSshSessionClosedError(error)) {
      sshStore.markSessionUnavailable(sessionId, getErrorMessage(error));
      return;
    }
    notifyError(error, '切换 SSH 目录失败');
  }
}

async function handleTerminalOpenRequestFromRoute() {
  if (route.path !== '/terminal') return;
  const layoutRequestId = routeQueryString('openConnectionLayoutRequestId');
  const layoutId = routeQueryString('openConnectionLayoutId');
  if (layoutRequestId && layoutId && !handledTerminalOpenRequestIds.has(`layout:${layoutRequestId}`)) {
    handledTerminalOpenRequestIds.add(`layout:${layoutRequestId}`);
    await openTerminalConnectionLayout(layoutId);
    return;
  }

  const requestId = routeQueryString('openTerminalRequestId');
  if (!requestId || handledTerminalOpenRequestIds.has(requestId)) return;

  const localCwd = routeQueryString('openLocalCwd');
  const localProfileId = routeQueryString('openLocalProfileId');
  const sshProfileId = routeQueryString('connectSshProfileId');
  const cwd = routeQueryString('cwd');
  if (!localCwd && !localProfileId && !sshProfileId) return;

  handledTerminalOpenRequestIds.add(requestId);

  try {
    if (localCwd || localProfileId) {
      await terminalStore.initialize();
      if (localProfileId) {
        await createSession(localProfileId);
      } else {
        const session = await terminalStore.createSession({ cwd: localCwd });
        focusLocalSession(session.sessionId, true);
      }
      return;
    }

    await sshStore.initialize();
    const existing = sshStore.sessions.find(
      (session) => session.profileId === sshProfileId && session.status === 'connected',
    );
    if (existing) {
      focusSshSession(existing.sessionId, true);
      await cdSshSession(existing.sessionId, cwd);
      return;
    }

    const profile = sshStore.profiles.find((item) => item.id === sshProfileId);
    if (!profile) {
      sshConnectError.value = '找不到对应的 SSH 配置，无法打开终端。';
      return;
    }

    await handleSshConnect(profile);
    const connectedSession = sshStore.sessions.find(
      (session) => session.profileId === profile.id
        && session.status === 'connected'
        && session.sessionId === sshStore.activeSshSessionId,
    ) ?? sshStore.sessions.find(
      (session) => session.profileId === profile.id && session.status === 'connected',
    );
    if (connectedSession) {
      await cdSshSession(connectedSession.sessionId, cwd);
    }
  } catch (error) {
    notifyError(error, '打开终端失败');
  }
}

function startPanePointerDrag(event: PointerEvent, pane: TerminalPane, focusViewportOnClick = false) {
  if (orderedTerminalPanes.value.length <= 1 || event.button !== 0) return;
  if (event.target instanceof Element) {
    const control = event.target.closest('button, input, textarea, select, a');
    if (control && control !== event.currentTarget) {
      return;
    }
  }

  const currentOrder = orderedTerminalPanes.value.map((item) => item.key);
  paneDragInteraction.value = {
    pointerId: event.pointerId,
    pane,
    startX: event.clientX,
    startY: event.clientY,
    focusViewportOnClick,
    moved: false,
    originalOrder: currentOrder,
    previewOrder: currentOrder,
  };
  window.addEventListener('pointermove', handlePanePointerMove, true);
  window.addEventListener('pointerup', finishPanePointerDrag, true);
  window.addEventListener('pointercancel', cancelPanePointerDrag, true);
}

function handlePanePointerMove(event: PointerEvent) {
  const interaction = paneDragInteraction.value;
  if (!interaction || interaction.pointerId !== event.pointerId) return;

  const deltaX = event.clientX - interaction.startX;
  const deltaY = event.clientY - interaction.startY;
  if (!interaction.moved && Math.hypot(deltaX, deltaY) < 4) {
    return;
  }

  event.preventDefault();
  if (!interaction.moved) {
    interaction.moved = true;
    draggingPaneKey.value = interaction.pane.key;
    dropTargetPaneKey.value = interaction.pane.key;
    paneDragPreviewOrder.value = interaction.previewOrder;
    document.body.classList.add('terminal-pane-dragging-active');
  }

  updatePaneDragPreview(event.clientX, event.clientY, interaction.pane);
  const dropTarget = findPaneDropTargetAtPoint(event.clientX, event.clientY);
  if (!dropTarget) {
    interaction.previewOrder = interaction.originalOrder;
    paneDragPreviewOrder.value = interaction.previewOrder;
    dropTargetPaneKey.value = '';
    return;
  }

  const nextOrder = dropTarget.key === draggingPaneKey.value
    ? interaction.originalOrder
    : makePanePreviewOrder(
      interaction.originalOrder,
      draggingPaneKey.value,
      dropTarget.key,
      dropTarget.insertAfter,
    );
  if (!areStringArraysEqual(nextOrder, interaction.previewOrder)) {
    interaction.previewOrder = nextOrder;
    paneDragPreviewOrder.value = nextOrder;
  }
  dropTargetPaneKey.value = dropTarget.key;
}

function finishPanePointerDrag(event: PointerEvent) {
  const interaction = paneDragInteraction.value;
  if (!interaction || interaction.pointerId !== event.pointerId) return;

  if (interaction.moved && interaction.previewOrder.length) {
    paneOrder.value = interaction.previewOrder;
  }
  const shouldFocus = !interaction.moved;
  const pane = interaction.pane;
  clearPaneDragState();
  removePaneDragListeners();
  if (shouldFocus) {
    focusPane(pane, interaction.focusViewportOnClick);
  }
}

function cancelPanePointerDrag() {
  clearPaneDragState();
  removePaneDragListeners();
}

function removePaneDragListeners() {
  window.removeEventListener('pointermove', handlePanePointerMove, true);
  window.removeEventListener('pointerup', finishPanePointerDrag, true);
  window.removeEventListener('pointercancel', cancelPanePointerDrag, true);
}

function clearPaneDragState() {
  paneDragInteraction.value = null;
  paneDragPreviewOrder.value = [];
  draggingPaneKey.value = '';
  dropTargetPaneKey.value = '';
  paneDragPreview.value = {
    ...paneDragPreview.value,
    visible: false,
  };
  document.body.classList.remove('terminal-pane-dragging-active');
}

function makePanePreviewOrder(order: string[], sourceKey: string, targetKey: string, insertAfter: boolean) {
  if (!sourceKey || !targetKey || sourceKey === targetKey) return order;
  const keys = [...order];
  const sourceIndex = keys.indexOf(sourceKey);
  const targetIndex = keys.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0) return keys;

  keys.splice(sourceIndex, 1);
  const adjustedTargetIndex = keys.indexOf(targetKey);
  keys.splice(adjustedTargetIndex + (insertAfter ? 1 : 0), 0, sourceKey);
  return keys;
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function updatePaneDragPreview(clientX: number, clientY: number, pane?: TerminalPane) {
  const draggedPane = orderedTerminalPanes.value.find((item) => item.key === draggingPaneKey.value);
  const sourcePane = draggedPane ?? pane ?? null;
  paneDragPreview.value = {
    visible: true,
    left: clientX + 14,
    top: clientY + 14,
    title: sourcePane?.title ?? paneDragPreview.value.title,
    kind: sourcePane?.kind ?? paneDragPreview.value.kind,
  };
}

function findPaneDropTargetAtPoint(clientX: number, clientY: number): { key: string; insertAfter: boolean } | null {
  const target = document.elementFromPoint(clientX, clientY);
  if (!(target instanceof Element)) return null;
  const paneElement = target.closest<HTMLElement>('[data-terminal-pane-key]');
  const key = paneElement?.dataset.terminalPaneKey ?? '';
  if (!key) return null;
  const rect = paneElement.getBoundingClientRect();
  const useHorizontalAxis = rect.width >= rect.height;
  const insertAfter = useHorizontalAxis
    ? clientX > rect.left + rect.width / 2
    : clientY > rect.top + rect.height / 2;
  return { key, insertAfter };
}

function startPaneResize(event: PointerEvent, handle: TerminalPaneResizeHandle) {
  const workspace = terminalLayoutRef.value?.stageElement?.querySelector('.terminal-pane-workspace');
  if (!(workspace instanceof HTMLElement)) return;

  event.preventDefault();
  event.stopPropagation();

  resizeInteraction.value = {
    handle,
    startX: event.clientX,
    startY: event.clientY,
    startSizes: handle.stateKey ? [...ensureLayoutSizes(handle.stateKey, getResizeStateCount(handle.stateKey))] : [],
    rect: workspace.getBoundingClientRect(),
  };

  document.body.classList.add('terminal-pane-resizing');
  window.addEventListener('pointermove', handlePaneResizeMove, true);
  window.addEventListener('pointerup', stopPaneResize, true);
  window.addEventListener('pointercancel', stopPaneResize, true);
}

function handlePaneResizeMove(event: PointerEvent) {
  const interaction = resizeInteraction.value;
  if (!interaction) return;

  const { handle, rect } = interaction;
  if (handle.kind === 'master-main') {
    masterMainRatio.value = clamp(((event.clientX - rect.left) / rect.width) * 100, 24, 76);
    return;
  }

  if (handle.kind === 'dwindle' && typeof handle.splitIndex === 'number') {
    const next = [...dwindleSplitRatios.value];
    const bounds = handle.bounds;
    if (!bounds) return;
    const ratio = handle.orientation === 'vertical'
      ? ((event.clientX - rect.left) / rect.width * 100 - bounds.left) / bounds.width
      : ((event.clientY - rect.top) / rect.height * 100 - bounds.top) / bounds.height;
    next[handle.splitIndex] = clamp(ratio, 0.18, 0.82);
    dwindleSplitRatios.value = next;
    return;
  }

  if (!handle.stateKey || typeof handle.index !== 'number') return;
  const delta = handle.orientation === 'vertical'
    ? (event.clientX - interaction.startX) / rect.width
    : (event.clientY - interaction.startY) / rect.height;
  resizeAdjacentSizes(handle.stateKey, handle.index, interaction.startSizes, delta);
}

function stopPaneResize() {
  resizeInteraction.value = null;
  document.body.classList.remove('terminal-pane-resizing');
  window.removeEventListener('pointermove', handlePaneResizeMove, true);
  window.removeEventListener('pointerup', stopPaneResize, true);
  window.removeEventListener('pointercancel', stopPaneResize, true);
}

function resizeAdjacentSizes(stateKey: string, index: number, startSizes: number[], delta: number) {
  const next = [...startSizes];
  const pairTotal = next[index] + next[index + 1];
  const minSize = Math.min(0.12, pairTotal / 3);
  next[index] = clamp(next[index] + delta, minSize, pairTotal - minSize);
  next[index + 1] = pairTotal - next[index];
  updateLayoutSizes(stateKey, next);
}

function getResizeStateCount(stateKey: string) {
  if (stateKey === 'grid:columns') return gridColumnCount.value;
  if (stateKey === 'grid:rows') return gridRowCount.value;
  if (stateKey === 'master-stack:stack-rows') return masterStackCount.value;
  return visibleTerminalPanes.value.length;
}

async function resetTerminalLayoutSize() {
  stopPaneResize();
  layoutSizeState.value = {};
  masterMainRatio.value = 66;
  dwindleSplitRatios.value = [];
  await nextTick();
  window.requestAnimationFrame(refitTerminalViewports);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function focusActiveTerminalViewport() {
  await nextTick();
  getActiveViewportRef()?.focus();
}

function findNext() {
  getActiveViewportRef()?.findNext(searchQuery.value);
}

function findPrevious() {
  getActiveViewportRef()?.findPrevious(searchQuery.value);
}

function resetSearchResults() {
  searchResultIndex.value = -1;
  searchResultCount.value = 0;
}

function handleSearchResults(value: { resultIndex: number; resultCount: number }) {
  searchResultIndex.value = value.resultIndex;
  searchResultCount.value = value.resultCount;
}

function updateSearchQuery(value: string) {
  searchQuery.value = value;
  if (!value.trim()) {
    resetSearchResults();
    getActiveViewportRef()?.clearSearchResults();
    return;
  }

  void nextTick(() => {
    getActiveViewportRef()?.findNext(value, true);
  });
}

async function openSearchPanel() {
  searchVisible.value = true;
  await nextTick();
  await searchPanelRef.value?.focusInput();
  if (searchQuery.value.trim()) {
    getActiveViewportRef()?.findNext(searchQuery.value, true);
  }
}

async function toggleSearchPanel() {
  if (searchVisible.value) {
    closeSearchPanel();
    return;
  }

  await openSearchPanel();
}

function closeSearchPanel() {
  searchVisible.value = false;
  resetSearchResults();
  getActiveViewportRef()?.clearSearchResults();
}

function handleTerminalPageKeydown(event: KeyboardEvent) {
  if (route.name !== 'Terminal') {
    return;
  }

  if (event.defaultPrevented || event.isComposing) {
    return;
  }

  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || event.key.toLowerCase() !== 'f') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (event.repeat) {
    return;
  }

  void toggleSearchPanel();
}

async function detachActiveSession() {
  const activePane = activeTerminalPane.value;
  if (!activePane) return;
  if (activePane.kind === 'ssh-pending') return;
  if (activePane.kind === 'ssh') {
    await window.sshApi.detachToWindow(activePane.sessionId, activePane.title);
    return;
  }
  await terminalStore.detachToWindow(activePane.sessionId);
}

async function closeSession(sessionId: string) {
  await terminalStore.killSession(sessionId);
}

async function closePane(pane: TerminalPane) {
  if (pane.kind === 'ssh-pending') {
    clearSshProfileConnecting(pane.profileId);
    if (focusedTerminalPaneKey.value === pane.key) {
      focusedTerminalPaneKey.value = '';
    }
    return;
  }

  if (pane.kind === 'ssh') {
    await handleSshDisconnect(pane.sessionId);
    return;
  }

  await closeSession(pane.sessionId);
}

function handleRenameSession(sessionId: string, newLabel: string) {
  terminalStore.renameSession(sessionId, newLabel);
}

function openPortForwardPanelForSession(sessionId: string) {
  focusSshSession(sessionId, true);
  sshStore.togglePortForwardPanel(true);
}

async function updateRendererMode(nextMode: TerminalRendererMode) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        rendererMode: nextMode,
      },
    },
  });
}

async function updateLayoutMode(nextMode: TerminalLayoutMode) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        layoutMode: nextMode,
      },
    },
  });
}

async function handleRendererFallback(nextMode: Exclude<TerminalRendererMode, 'webgl'>) {
  if (rendererMode.value === 'webgl') {
    await updateRendererMode(nextMode);
  }
}

async function updateColorScheme(schemeId: string) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        colorSchemeId: schemeId,
      },
    },
  });
}

async function handleBgConfirm(payload: BackgroundConfirmPayload) {
  const localProfile = activeLocalTerminalProfile.value;
  const currentBackground = localProfile?.background ?? getGlobalTerminalBackground();
  const scopedBackground = withThemeBackground({
    type: currentBackground.type,
    color: currentBackground.color,
    image: currentBackground.image,
    video: currentBackground.video,
    backgroundStyle: currentBackground.style,
  }, appConfigStore.config.appearance.theme, {
    type: payload.type,
    color: payload.color ?? '',
    image: payload.image ?? '',
    video: payload.video ?? '',
    backgroundStyle: payload.backgroundStyle ?? {},
  });

  if (localProfile) {
    await appConfigStore.updateConfig({
      features: {
        terminal: {
          localProfiles: appConfigStore.config.features.terminal.localProfiles.map((profile) =>
            profile.id === localProfile.id
              ? {
                  ...profile,
                  background: {
                    type: scopedBackground.type,
                    color: scopedBackground.color,
                    image: scopedBackground.image,
                    video: scopedBackground.video,
                    style: scopedBackground.backgroundStyle,
                  },
                }
              : profile,
          ),
        },
      },
    });
    return;
  }

  await appConfigStore.updateConfig({
    features: {
      terminal: {
        viewportBgType: scopedBackground.type,
        viewportBgColor: scopedBackground.color,
        viewportBgImage: scopedBackground.image,
        viewportBgVideo: scopedBackground.video,
        viewportBgStyle: scopedBackground.backgroundStyle,
      },
    },
  });
}



function clearTerminal() {
  const activePane = activeTerminalPane.value;
  if (!activePane) return;
  if (activePane.kind === 'ssh-pending') return;
  if (activePane.kind === 'ssh') {
    sshStore.clearBuffer(activePane.sessionId);
  } else {
    terminalStore.clearLocalBuffer(activePane.sessionId);
  }
  getActiveViewportRef()?.clear();
}

async function openFileManagerForCurrentSsh() {
  const sshSession = activeSshSessionForPane.value;
  if (!sshSession) return;
  const sshProfile = activeSshProfile.value ?? sshStore.profiles.find((profile) => profile.id === sshSession.profileId) ?? null;
  if (!sshProfile) return;

  ftpStore.setPendingOpenRequest({
    requestId: crypto.randomUUID(),
    source: 'ssh',
    sshSessionId: sshSession.sessionId,
    sshProfileId: sshProfile.id,
    label: sshProfile.label,
    host: sshProfile.host,
    port: sshProfile.port,
    username: sshProfile.username,
    authType: sshProfile.authType,
    savePassword: sshProfile.savePassword,
    privateKeyPath: sshProfile.privateKeyPath,
    certificatePath: sshProfile.certificatePath,
    hostCaKeyPath: sshProfile.hostCaKeyPath,
    remotePath: sshStore.getSessionWorkingDirectory(sshSession.sessionId) || '/',
  });

  if (isDetachedWindow.value) {
    await window.workspaceWindowApi?.openDetached('ftp', { routeOverride: '/ftp' });
    return;
  }

  if (route.path !== '/ftp') {
    await router.push('/ftp');
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isSshSessionClosedError(error: unknown) {
  return /SSH session ['"][^'"]+['"] not found|session ['"][^'"]+['"] not found|connection closed|broken pipe|connection reset/i
    .test(getErrorMessage(error));
}

function extractSshSessionIdFromError(error: unknown) {
  const message = getErrorMessage(error);
  return message.match(/SSH session ['"]([^'"]+)['"] not found/i)?.[1]
    ?? message.match(/session ['"]([^'"]+)['"] not found/i)?.[1]
    ?? activeSshSessionForPane.value?.sessionId
    ?? '';
}

function handleUnhandledSshRejection(event: PromiseRejectionEvent) {
  if (!isSshSessionClosedError(event.reason)) return;
  event.preventDefault();
  const sessionId = extractSshSessionIdFromError(event.reason);
  if (!sessionId) return;
  sshStore.markSessionUnavailable(sessionId, getErrorMessage(event.reason));
}

watch(
  [
    focusedTerminalPaneKey,
    paneOrder,
    layoutSizeState,
    masterMainRatio,
    dwindleSplitRatios,
    sidebarCollapsed,
  ],
  scheduleTerminalWorkspaceWindowStatePersist,
  { deep: true },
);

watch(
  () => [
    route.path,
    route.query.openTerminalRequestId,
    route.query.openLocalCwd,
    route.query.openLocalProfileId,
    route.query.connectSshProfileId,
    route.query.cwd,
    route.query.openConnectionLayoutRequestId,
    route.query.openConnectionLayoutId,
  ],
  () => {
    void handleTerminalOpenRequestFromRoute();
  },
  { immediate: true },
);

onActivated(() => {
  void handleTerminalOpenRequestFromRoute();
  void refreshTerminalWorkspaceSessions().catch((error) => {
    console.warn('[workspace-window] Failed to refresh terminal sessions on activation:', error);
  });
});

onMounted(() => {
  void window.workspaceWindowApi?.getContext().then((context) => {
    workspaceWindowContext.value = context;
  });
  void window.workspaceWindowApi?.getState().then((state) => {
    handleWorkspaceWindowStateChanged(state);
  });
  removeWorkspaceWindowStateListener = window.workspaceWindowApi?.onStateChanged((state) => {
    handleWorkspaceWindowStateChanged(state);
  });
  void loadTerminalWorkspaceWindowState();
  globalStore.setTopbarColor('');
  loadConnectionLayoutConfigs();
  window.addEventListener(CONNECTION_LAYOUTS_CHANGED_EVENT, loadConnectionLayoutConfigs);
  window.addEventListener('keydown', handleTerminalPageKeydown, true);
  window.addEventListener('unhandledrejection', handleUnhandledSshRejection);
  if (hasTerminalOpenRequest()) {
    void terminalStore.initialize()
      .then(() => refreshTerminalWorkspaceSessions())
      .catch((error) => {
        console.warn('[workspace-window] Failed to initialize terminal sessions:', error);
      });
  } else {
    void initializePage()
      .then(() => refreshTerminalWorkspaceSessions())
      .catch((error) => {
        console.warn('[workspace-window] Failed to initialize terminal page:', error);
      });
  }
  void sshStore.initialize()
    .then(() => refreshTerminalWorkspaceSessions())
    .catch((error) => {
      console.warn('[workspace-window] Failed to initialize SSH sessions:', error);
    });
});

onBeforeUnmount(() => {
  persistTerminalWorkspaceWindowState();
  window.clearTimeout(terminalWorkspaceWindowStateTimer);
  removeWorkspaceWindowStateListener?.();
  window.removeEventListener(CONNECTION_LAYOUTS_CHANGED_EVENT, loadConnectionLayoutConfigs);
  window.removeEventListener('keydown', handleTerminalPageKeydown, true);
  window.removeEventListener('unhandledrejection', handleUnhandledSshRejection);
  stopPaneResize();
  cancelPanePointerDrag();
});
</script>

<template>
  <MainPageLayout
    ref="terminalLayoutRef"
    page-class="terminal-page"
    layout-class="terminal-layout"
    sidebar-class="terminal-sidebar"
    sidebar-collapsed-class="terminal-sidebar--collapsed"
    main-class="terminal-main"
    :sidebar-collapsed="sidebarCollapsed"
    :stage-visible="terminalPanes.length > 0"
    :stage-class="[
      'terminal-stage',
      `terminal-stage--${layoutMode}`,
      { 'terminal-stage--single': visibleTerminalPanes.length === 1 },
    ]"
  >
    <template #sidebar>
        <div class="terminal-sidebar__header">
          <UiIconButton
            class="terminal-sidebar__toggle"
            size="sm"
            variant="ghost"
            :aria-label="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
            :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
            @click="toggleSidebar"
          >
            <svg
              v-if="sidebarCollapsed"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="18"
              height="18"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M9 4v16" />
              <path d="m15 9-3 3 3 3" />
            </svg>
          </UiIconButton>
          <!-- Tab switcher (only visible when sidebar is expanded) -->
          <div v-show="!sidebarCollapsed" class="sidebar-tabs">
            <UiButton
              class="sidebar-tab"
              size="sm"
              variant="ghost"
              type="button"
              :active="sidebarTab === 'config'"
              :class="{ 'sidebar-tab--active': sidebarTab === 'config' }"
              id="sidebar-tab-config"
              @click="activateSidebarTab()"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2"
                fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.04.04a2 2 0 1 1-2.83 2.83l-.04-.04A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.06.06a2 2 0 1 1-3.88 0L10 20a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.04.04a2 2 0 1 1-2.83-2.83l.04-.04A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1l-.06-.06a2 2 0 1 1 0-3.88L4 10a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.04-.04a2 2 0 1 1 2.83-2.83l.04.04A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6l.06-.06a2 2 0 1 1 3.88 0L14 4a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.04-.04a2 2 0 1 1 2.83 2.83l-.04.04A1.7 1.7 0 0 0 19.4 9c.19.35.4.69.6 1l.06.06a2 2 0 1 1 0 3.88L20 14a1.7 1.7 0 0 0-.6 1Z" />
              </svg>
              配置
            </UiButton>
          </div>
        </div>

        <div class="terminal-sidebar__tab-panels">
          <!-- Config tab -->
          <div class="terminal-sidebar__panel terminal-sidebar__panel--config">
            <template v-if="sidebarCollapsed">
              <div class="terminal-sidebar__collapsed-rail">
                <UiIconButton
                  v-for="profile in terminalStore.profiles"
                  :key="profile.id"
                  class="terminal-sidebar__collapsed-action"
                  size="sm"
                  variant="ghost"
                  :title="`双击新建本地终端：${profile.label}`"
                  @dblclick="createSession(profile.id)"
                >
                  <TerminalProfileIcon
                    :profile-id="profile.id"
                    :command="profile.command"
                    :label="profile.label"
                    :size="18"
                  />
                </UiIconButton>
                <div class="terminal-sidebar__collapsed-divider" />
                <UiIconButton
                  v-for="profile in sshStore.profiles"
                  :key="profile.id"
                  class="terminal-sidebar__collapsed-action terminal-sidebar__collapsed-action--ssh"
                  size="sm"
                  variant="ghost"
                  :class="{ 'terminal-sidebar__collapsed-action--connecting': isSshProfileConnecting(profile.id) }"
                  :title="isSshProfileConnecting(profile.id)
                    ? `正在连接 SSH：${profile.label}`
                    : `连接 SSH：${profile.label}`"
                  :disabled="isSshProfileConnecting(profile.id)"
                  @click="handleSshConnect(profile)"
                >
                  <span v-if="profile.color" class="terminal-sidebar__collapsed-color" :style="{ background: profile.color }" />
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2"
                    fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                </UiIconButton>
                <div class="terminal-sidebar__collapsed-divider" />
                <UiIconButton
                  class="terminal-sidebar__collapsed-action terminal-sidebar__collapsed-action--muted"
                  size="sm"
                  variant="ghost"
                  title="新建 SSH 配置"
                  @click="openSshProfileDialog(null)"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2"
                    fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </UiIconButton>
              </div>
            </template>
            <template v-else>
              <UiScrollbar class="terminal-sidebar__expanded-scroll" :x="false" :size="6">
                <div class="terminal-sidebar__expanded-content">
                  <div class="terminal-sidebar__sessions terminal-sidebar__config-list">
                    <div class="terminal-sidebar__section-header">
                      <span class="terminal-sidebar__section-label">本地终端配置</span>
                    </div>
                    <UiButton
                      v-for="profile in terminalStore.profiles"
                      :key="profile.id"
                      class="terminal-profile-item"
                      size="sm"
                      variant="ghost"
                      type="button"
                      @dblclick="createSession(profile.id)"
                    >
                      <TerminalProfileIcon
                        class="terminal-profile-item__icon"
                        :profile-id="profile.id"
                        :command="profile.command"
                        :label="profile.label"
                        :size="16"
                      />
                      <span class="terminal-profile-item__text">
                        <span class="terminal-profile-item__label">{{ profile.label }}</span>
                        <span class="terminal-profile-item__command">{{ profile.command || profile.id }}</span>
                      </span>
                      <svg class="terminal-profile-item__launch" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 12h14" />
                        <path d="m13 6 6 6-6 6" />
                      </svg>
                    </UiButton>
                    <div class="terminal-sidebar__divider" />
                  </div>
                  <SshSidebarTab
                    class="terminal-sidebar__ssh-configs"
                    :show-active-sessions="false"
                    :profile-section-label="'SSH 配置'"
                    :connecting-profile-ids="sshConnectingProfileIds"
                    @edit-profile="openSshProfileDialog"
                    @create-profile-in-group="openSshProfileDialog(null, $event)"
                    @open-key-manager="sshKeyManagerVisible = true"
                    @connect="handleSshConnect"
                    @focus-session="handleSshFocusSession"
                    @disconnect="handleSshDisconnect"
                  />
                </div>
              </UiScrollbar>
            </template>
          </div>
        </div>
    </template>

    <template #main-before>
        <TerminalToolbar :active-session="activeToolbarSession"
          :renderer-mode="rendererMode"
          :layout-mode="layoutMode"
          :color-scheme-id="colorSchemeId"
          :connection-layouts="connectionLayoutConfigs"
          :ssh-mode="isSshMode" :port-forward-open="sshStore.portForwardPanelOpen"
          :can-detach="!!activeTerminalPane && activeTerminalPane.kind !== 'ssh-pending'"
          :title-editable="activeTerminalPane?.kind === 'local'"
          @search="toggleSearchPanel" @clear="clearTerminal" @detach="detachActiveSession"
          @rename="handleRenameSession" @update:rendererMode="updateRendererMode"
          @update:layoutMode="updateLayoutMode"
          @save-connection-layout="openSaveTerminalLayoutDialog"
          @open-connection-layout="openTerminalConnectionLayout"
          @delete-connection-layout="deleteTerminalConnectionLayout"
          @reset-layout-size="resetTerminalLayoutSize"
          @update:colorSchemeId="updateColorScheme" @background="bgPickerVisible = true"
          @port-forward="sshStore.togglePortForwardPanel()"
          @open-file-manager="openFileManagerForCurrentSsh" />

        <Transition name="ui-panel-pop">
          <TerminalSearchPanel
            v-if="searchVisible"
            ref="searchPanelRef"
            :query="searchQuery"
            :result-index="searchResultIndex"
            :result-count="searchResultCount"
            @update:query="updateSearchQuery"
            @next="findNext"
            @previous="findPrevious"
            @close="closeSearchPanel"
          />
        </Transition>

    </template>

    <template #stage>
          <div v-if="layoutMode === 'tabbed' && terminalPanes.length > 1" class="terminal-pane-tabs">
            <UiButton
              v-for="pane in orderedTerminalPanes"
              :key="pane.key"
              class="terminal-pane-tab"
              size="sm"
              variant="ghost"
              type="button"
              :active="pane.key === activeTerminalPane?.key"
              :data-terminal-pane-key="pane.key"
              :class="{
                'terminal-pane-tab--active': pane.key === activeTerminalPane?.key,
                'terminal-pane-tab--drop-target': pane.key === dropTargetPaneKey,
                'terminal-pane-tab--drag-placeholder': pane.key === draggingPaneKey,
              }"
              @pointerdown="startPanePointerDrag($event, pane, true)"
            >
              <span class="terminal-pane-tab__kind">{{ pane.kind === 'local' ? '本地' : 'SSH' }}</span>
              <span class="terminal-pane-tab__title">{{ pane.title }}</span>
              <span
                class="terminal-pane-tab__close"
                role="button"
                tabindex="-1"
                title="关闭终端"
                aria-label="关闭终端"
                @pointerdown.stop
                @click.stop="closePane(pane)"
              >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                  <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                </svg>
              </span>
            </UiButton>
          </div>

          <div
            class="terminal-pane-workspace"
            :style="terminalPaneWorkspaceStyle"
          >
            <div
              v-for="item in terminalPaneLayoutItems"
              :key="item.pane.key"
              class="terminal-pane"
              :data-terminal-pane-key="item.pane.key"
              :class="{
                'terminal-pane--active': item.pane.key === activeTerminalPane?.key,
                'terminal-pane--ssh': item.pane.kind === 'ssh',
                'terminal-pane--pending': item.pane.kind === 'ssh-pending',
                'terminal-pane--drag-placeholder': item.pane.key === draggingPaneKey,
                'terminal-pane--drop-target': item.pane.key === dropTargetPaneKey,
              }"
              :style="item.style"
              @pointerdown.capture="focusPane(item.pane, false)"
            >
              <div
                class="terminal-pane__header"
                title="拖动以调整终端位置"
                @pointerdown="startPanePointerDrag($event, item.pane)"
              >
                <span class="terminal-pane__kind">{{ item.pane.kind === 'local' ? '本地' : 'SSH' }}</span>
                <span class="terminal-pane__title">{{ item.pane.title }}</span>
                <span class="terminal-pane__status">{{ item.pane.key === draggingPaneKey ? '占位' : item.pane.status }}</span>
                <UiIconButton
                  class="terminal-pane__close"
                  size="sm"
                  variant="ghost"
                  title="关闭终端"
                  aria-label="关闭终端"
                  @click.stop="closePane(item.pane)"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </UiIconButton>
              </div>
              <div v-if="item.pane.kind === 'ssh-pending'" class="terminal-pane__connecting">
                <span class="terminal-pane__connecting-spinner" aria-hidden="true" />
                <div class="terminal-pane__connecting-text">
                  <strong>正在连接 {{ item.pane.title }}</strong>
                  <span>{{ item.pane.subtitle }}</span>
                </div>
              </div>
              <TerminalViewport
                v-else
                :key="`${item.pane.key}:${rendererMode}:${enableBell}:${enableSixel}:${paneHasCustomBg(item.pane)}`"
                :ref="(instance) => setViewportRef(item.pane.key, instance)"
                :session-id="item.pane.sessionId"
                :buffer="item.pane.buffer"
                :renderer-mode="rendererMode"
                :enable-bell="enableBell"
                :enable-sixel="enableSixel"
                :color-scheme-id="colorSchemeId"
                :bg-type="resolvePaneBackground(item.pane).type"
                :bg-color="resolvePaneBackground(item.pane).color"
                :bg-image="resolvePaneBackground(item.pane).image"
                :bg-video="resolvePaneBackground(item.pane).video"
                :bg-style="resolvePaneBackground(item.pane).style"
                :copy-shortcut="appConfigStore.config.shortcuts.internal.terminalCopy"
                :paste-shortcut="appConfigStore.config.shortcuts.internal.terminalPaste"
                :auto-focus="item.pane.key === activeTerminalPane?.key"
                :write-handler="item.pane.kind === 'ssh'
                  ? (data: string) => sshStore.write(item.pane.sessionId, data)
                  : undefined"
                :resize-handler="item.pane.kind === 'ssh'
                  ? (cols: number, rows: number) => sshStore.resizeSession({ sessionId: item.pane.sessionId, cols, rows })
                  : undefined"
                @renderer-fallback="handleRendererFallback"
                @search-results="item.pane.key === activeTerminalPane?.key ? handleSearchResults($event) : undefined"
              />
            </div>
            <UiIconButton
              v-for="handle in terminalPaneResizeHandles"
              :key="handle.id"
              class="terminal-pane-resizer"
              size="sm"
              variant="ghost"
              :class="`terminal-pane-resizer--${handle.orientation}`"
              :style="handle.style"
              title="调整终端区域大小"
              @pointerdown="startPaneResize($event, handle)"
            />
            <div
              v-if="paneDragPreview.visible"
              class="terminal-pane-drag-preview"
              :style="{
                left: `${paneDragPreview.left}px`,
                top: `${paneDragPreview.top}px`,
              }"
            >
              <span class="terminal-pane-drag-preview__kind">{{ paneDragPreview.kind === 'local' ? '本地' : 'SSH' }}</span>
              <span class="terminal-pane-drag-preview__title">{{ paneDragPreview.title }}</span>
            </div>
          </div>

          <!-- Port forward floating panel (SSH mode only, main window) -->
          <Transition name="ui-pop">
          <div
            v-if="isSshMode && sshStore.portForwardPanelOpen && activeSshSessionForPane"
            class="terminal-port-forward-overlay"
            @click.self="sshStore.togglePortForwardPanel(false)"
          >
            <PortForwardPanel
              :session-id="activeSshSessionForPane.sessionId"
              :profile-id="activeSshSessionForPane.profileId"
              @close="sshStore.togglePortForwardPanel(false)"
              @add-forward="openPortForwardDialog(null)"
              @edit-forward="openPortForwardDialog($event)"
            />
          </div>
          </Transition>
    </template>

    <template #main-after>
        <div v-if="!terminalPanes.length" class="terminal-empty ui-glass-surface ui-glass-surface--strong">
          <div class="terminal-empty__title">
            {{ isAnySshProfileConnecting ? '正在连接 SSH' : '没有活跃连接' }}
          </div>
          <div v-if="sshConnectError" class="terminal-empty__error">
            {{ sshConnectError }}
          </div>
          <div class="terminal-empty__desc">
            {{ isAnySshProfileConnecting ? '正在建立连接，请稍候。' : '从左侧配置列表点击本地终端或 SSH 配置来创建连接。' }}
          </div>
          <div class="terminal-empty__actions">
            <UiButton variant="primary" size="sm" @click="activateSidebarTab()">查看配置</UiButton>
            <UiButton
              v-if="sshLastFailedProfile"
              variant="secondary"
              size="sm"
              :disabled="isSshProfileConnecting(sshLastFailedProfile.id)"
              @click="handleSshConnect(sshLastFailedProfile)"
            >
              重新连接
            </UiButton>
          </div>
        </div>

        <div class="terminal-statusbar">
          <div class="terminal-statusbar__left">
            <span v-if="isSshMode && activeSshSessionForPane" class="statusbar-ssh-indicator">
              <span class="ssh-dot ssh-dot--connected" />
              SSH: {{ activeSshSessionForPane.username }}@{{ activeSshSessionForPane.host }}
            </span>
          </div>
          <div class="terminal-statusbar__right">
            <div v-if="forwardedPortSummaries.length > 0" class="statusbar-forward-list">
              <span class="statusbar-forward-list__label">转发</span>
              <UiButton
                v-for="port in forwardedPortSummaries"
                :key="`${port.sessionId}:${port.forwardId}`"
                class="statusbar-forward-chip"
                size="sm"
                variant="ghost"
                type="button"
                :title="`${port.profileLabel} · ${port.label} · ${port.address}`"
                @click="openPortForwardPanelForSession(port.sessionId)"
              >
                <span class="statusbar-forward-chip__type">{{ port.forwardType.slice(0, 1).toUpperCase() }}</span>
                <span class="statusbar-forward-chip__port">{{ port.port }}</span>
              </UiButton>
            </div>
            <span>{{ activeTerminalPane?.kind === 'local' ? '本地' : 'SSH' }}</span>
          </div>
        </div>
    </template>

    <template #overlays>
    <UiDialog v-model="saveLayoutDialogVisible" width="420" max-width="calc(100vw - 48px)">
      <template #header>
        <div class="terminal-layout-dialog__header">保存连接布局</div>
      </template>
      <div class="terminal-layout-dialog__body">
        <UiInput
          v-model="saveLayoutName"
          placeholder="输入布局名称"
          @keydown.enter="saveCurrentTerminalConnectionLayout"
        />
      </div>
      <template #footer>
        <div class="terminal-layout-dialog__footer">
          <UiButton size="sm" variant="ghost" @click="saveLayoutDialogVisible = false">取消</UiButton>
          <UiButton size="sm" variant="primary" @click="saveCurrentTerminalConnectionLayout">保存</UiButton>
        </div>
      </template>
    </UiDialog>

    <!-- Personalization Dialog -->
    <UiPersonalizationConfig
      :visible="bgPickerVisible"
      :current-background="termBgColor"
      :current-background-image="termBgImage"
      :current-background-video="termBgVideo"
      :current-background-style="termBgStyle"
      :preview-width="terminalBgPreviewSize.width"
      :preview-height="terminalBgPreviewSize.height"
      @close="bgPickerVisible = false"
      @confirm="handleBgConfirm"
    />

    <!-- SSH dialogs (only in main window context) -->
    <template>
      <SshProfileDialog
        :visible="sshProfileDialogVisible"
        :profile="sshProfileDialogTarget"
        :initial-group-id="sshProfileDialogGroupId"
        @close="sshProfileDialogVisible = false"
        @saved="handleSshProfileSaved"
        @deleted="sshProfileDialogVisible = false"
      />

      <SshKeyManagerDialog
        :visible="sshKeyManagerVisible"
        @close="sshKeyManagerVisible = false"
      />

      <SshFingerprintDialog
        :visible="sshFingerprintVisible"
        :host="sshFingerprintInfo.host"
        :port="sshFingerprintInfo.port"
        :algorithm="sshFingerprintInfo.algorithm"
        :fingerprint="sshFingerprintInfo.fingerprint"
        @trusted="handleSshFingerprintTrusted"
        @rejected="handleSshFingerprintRejected"
      />

      <!-- SSH Password Prompt Dialog -->
      <UiPopupSurface
        :model-value="sshPasswordPromptVisible"
        variant="dialog"
        width="340px"
        max-width="calc(100vw - 48px)"
        z-index="var(--ui-z-secure-modal)"
        aria-label="输入 SSH 密码"
        @close="handleSshPasswordCancel"
      >
            <div class="ssh-pwd-dialog ui-glass-surface ui-glass-surface--strong">
              <div class="ssh-pwd-dialog__header">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2"
                  fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span>输入 SSH 密码</span>
              </div>
              <p class="ssh-pwd-dialog__sub">{{ sshPasswordPromptLabel }}</p>
              <UiInput
                id="ssh-password-input"
                v-model="sshPasswordPromptValue"
                type="password"
                class="ssh-pwd-dialog__input"
                size="md"
                placeholder="请输入密码..."
                autofocus
                @keydown.enter="handleSshPasswordConfirm"
                @keydown.esc="handleSshPasswordCancel"
              />
              <div class="ssh-pwd-dialog__actions">
                <UiButton class="ssh-pwd-btn ssh-pwd-btn--cancel" size="sm" variant="ghost" type="button" @click="handleSshPasswordCancel">取消</UiButton>
                <UiButton class="ssh-pwd-btn ssh-pwd-btn--confirm" size="sm" variant="primary" type="button" @click="handleSshPasswordConfirm">连接</UiButton>
              </div>
            </div>
      </UiPopupSurface>

      <!-- Port Forward Dialog -->
      <PortForwardDialog
        :visible="pfDialogVisible"
        :profile-id="activeSshSessionForPane?.profileId ?? ''"
        :forward="pfDialogTarget"
        @close="pfDialogVisible = false"
        @saved="pfDialogVisible = false"
      />
    </template>
    </template>
  </MainPageLayout>
</template>

<style lang="scss">
.terminal-page {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--ui-surface-bg-muted);
}

.terminal-layout {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.terminal-layout-dialog__header {
  padding: 14px 16px;
  font-size: var(--ui-font-size-md);
  font-weight: 700;
  color: var(--ui-text-primary);
}

.terminal-layout-dialog__body {
  padding: 16px;
}

.terminal-layout-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
}

/* Sidebar Styles */
.terminal-sidebar {
  display: flex;
  flex-direction: column;
  width: var(--ui-page-sidebar-width);
  flex-shrink: 0;
  border-right: 1px solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);
  transition:
    width 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    min-width 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    flex-basis 0.38s cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;

  &--collapsed {
    width: var(--ui-page-sidebar-collapsed-width);
  }
}

.terminal-sidebar__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ui-border-subtle);
  gap: 8px;
}

.terminal-sidebar--collapsed .terminal-sidebar__header {
  justify-content: center;
  padding: 10px 0;
}

.terminal-sidebar__toggle.ui-icon-button.ui-icon-button--sm:not(.ui-icon-button--labeled) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-muted);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
  transform: none;

  &:hover:not(:disabled) {
    border-color: var(--ui-border-subtle);
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
    transform: none;
  }

  svg {
    fill: none;
    stroke: currentColor;
  }
}

// ── Sidebar tab switcher ───────────────────────────────────────

.sidebar-tabs {
  display: flex;
  flex: 1;
  gap: 2px;
  background: var(--ui-surface-overlay);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 7px;
  padding: 3px;
}

.sidebar-tab.ui-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 32px;
  padding: 8px 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  font-weight: 600;
  transition: all 0.18s;
  white-space: nowrap;
  box-shadow: none;
  transform: none;

  &:hover:not(.sidebar-tab--active, :disabled) {
    color: var(--ui-text-secondary);
    transform: none;
  }

  .ui-button__label {
    gap: 4px;
  }
}

.sidebar-tab--active.ui-button {
  background: var(--ui-surface-panel);
  color: var(--ui-text-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.sidebar-tab__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--primary-color);
  color: #fff;
  font-size: 9px;
  font-weight: 800;
}

// ── Status bar SSH indicator ──────────────────────────────────

.statusbar-ssh-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--ui-font-size-xs);
  font-family: var(--ui-font-family-mono);
  color: #22c55e;
}

.ssh-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &--connected {
    background: #22c55e;
    box-shadow: 0 0 5px rgba(34, 197, 94, 0.5);
  }
}

.terminal-sidebar__tab-panels {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.terminal-sidebar__panel {
  position: absolute;
  inset: 0;
  width: 100%;
  min-width: 0;
  transition: transform var(--ui-motion-duration-base) var(--ui-motion-ease-emphasized);
  will-change: transform;
}

.terminal-sidebar__panel--config {
  transform: translateX(0);
  display: flex;
  flex-direction: column;
}

.terminal-sidebar__sessions {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  gap: 6px;
  animation: terminal-sidebar-content-in 0.32s cubic-bezier(0.22, 1, 0.36, 1);

  .ui-tooltip-trigger {
    width: 100%;
  }
}

.terminal-sidebar__expanded-scroll {
  flex: 1;
  min-height: 0;
}

.terminal-sidebar__expanded-content {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  animation: terminal-sidebar-content-in 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.terminal-sidebar__config-list {
  flex: 0 0 auto;
  overflow: visible;
  padding-bottom: 0;
}

.terminal-sidebar__ssh-configs {
  min-height: 0;
  overflow: visible;
}

.terminal-sidebar__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.terminal-sidebar__section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  padding: 4px 8px 6px;
}

.terminal-sidebar__divider {
  height: 1px;
  margin: 6px 0 2px;
  background: var(--ui-border-subtle);
}

.terminal-profile-item.ui-button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-text-secondary);
  text-align: left;
  transition: all 0.18s ease;
  box-shadow: none;
  transform: none;

  &:hover:not(:disabled) {
    border-color: var(--ui-border-accent-soft);
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
    transform: none;

    .terminal-profile-item__launch {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .ui-button__label {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    min-width: 0;
    width: 100%;
  }

  svg {
    fill: none;
    stroke: currentColor;
  }
}

.terminal-profile-item__icon {
  flex-shrink: 0;
}

.terminal-profile-item__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.terminal-profile-item__label,
.terminal-profile-item__command {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-profile-item__label {
  color: var(--ui-text-primary);
  font-size: var(--ui-font-size-xs);
  font-weight: 600;
}

.terminal-profile-item__command {
  color: var(--ui-text-muted);
  font-family: var(--ui-font-family-mono);
  font-size: var(--ui-font-size-xs);
}

.terminal-profile-item__launch {
  margin-left: auto;
  color: var(--ui-text-subtle);
  flex-shrink: 0;
  opacity: 0;
  transform: translateX(-3px);
  transition: all 0.16s ease;
}

.terminal-sidebar--collapsed .terminal-sidebar__sessions {
  align-items: center;
  padding: 12px 0;
}

.terminal-sidebar--collapsed .terminal-sidebar__sessions .ui-tooltip-trigger {
  justify-content: center;
}

.terminal-sidebar__collapsed-rail {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 6px;
  box-sizing: border-box;
  scrollbar-width: none;
  animation: terminal-sidebar-rail-in 0.3s cubic-bezier(0.22, 1, 0.36, 1);

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
}

@keyframes terminal-sidebar-content-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes terminal-sidebar-rail-in {
  from {
    opacity: 0;
    transform: translateX(6px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .terminal-sidebar,
  .terminal-sidebar__panel,
  .terminal-sidebar__sessions,
  .terminal-sidebar__expanded-content,
  .terminal-sidebar__collapsed-rail {
    animation: none;
    transition: none;
  }
}

.terminal-sidebar__collapsed-action.ui-icon-button.ui-icon-button--sm:not(.ui-icon-button--labeled) {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-text-secondary);
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
  box-shadow: none;

  &:hover:not(:disabled) {
    border-color: var(--ui-border-accent-soft);
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: progress;
    opacity: 0.72;
  }
}

.terminal-sidebar__collapsed-action--ssh.ui-icon-button {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}

.terminal-sidebar__collapsed-action--connecting.ui-icon-button::after {
  content: '';
  position: absolute;
  right: 5px;
  top: 5px;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #f59e0b;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.55);
  animation: terminal-collapsed-pulse 0.9s ease-in-out infinite;
}

.terminal-sidebar__collapsed-action--muted.ui-icon-button {
  color: var(--ui-text-muted);
  background: color-mix(in srgb, var(--ui-surface-overlay) 72%, transparent);
}

.terminal-sidebar__collapsed-color {
  position: absolute;
  left: 4px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 999px;
}

.terminal-sidebar__collapsed-divider {
  width: 28px;
  height: 1px;
  flex: 0 0 auto;
  background: var(--ui-border-subtle);
}

@keyframes terminal-collapsed-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

/* Main Content Styles */
.terminal-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  position: relative;
  background: var(--ui-surface-bg);
}

.terminal-stage {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  position: relative;
  padding: 0;
  gap: 0;
  overflow: hidden;
}

.terminal-pane-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  min-height: 30px;
  flex-shrink: 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-surface-panel) 84%, transparent);
}

.terminal-pane-tab.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  max-width: 220px;
  min-width: 0;
  min-height: 30px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-right: 1px solid var(--ui-border-subtle);
  border-radius: 0;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  user-select: none;
  transition: all 0.16s ease;
  box-shadow: none;
  transform: none;

  &:active {
    cursor: pointer;
  }

  &:hover:not(:disabled) {
    border-color: var(--ui-border-accent-soft);
    color: var(--ui-text-secondary);
    transform: none;
  }

  .ui-button__label {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    min-width: 0;
  }
}

.terminal-pane-tab--active.ui-button {
  border-color: color-mix(in srgb, var(--primary-color) 28%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--primary-color) 10%, var(--ui-tabs-active-bg));
  color: color-mix(in srgb, var(--primary-color) 72%, var(--ui-text-primary));
  box-shadow:
    inset 0 -2px 0 var(--primary-color),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 0 1px color-mix(in srgb, var(--primary-color) 12%, transparent);
}

.terminal-pane-tab--drop-target.ui-button {
  box-shadow: inset 2px 0 0 var(--primary-color);
}

.terminal-pane-tab--drag-placeholder.ui-button {
  border-right-color: color-mix(in srgb, var(--primary-color) 34%, var(--ui-border-subtle));
  background:
    repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 12%, transparent) 0 6px,
      transparent 6px 12px
    ),
    color-mix(in srgb, var(--ui-surface-panel-muted) 84%, transparent);
  color: color-mix(in srgb, var(--ui-text-muted) 72%, transparent);
  outline: 1px dashed color-mix(in srgb, var(--primary-color) 52%, transparent);
  outline-offset: -4px;
}

.terminal-pane-tab--drag-placeholder .terminal-pane-tab__kind,
.terminal-pane-tab--drag-placeholder .terminal-pane-tab__title {
  opacity: 0.58;
}

.terminal-pane-tab__kind {
  color: var(--primary-color);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  flex-shrink: 0;
}

.terminal-pane-tab__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-pane-tab__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text-muted);
  transition:
    background-color 0.14s ease,
    color 0.14s ease;

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  &:hover {
    background: color-mix(in srgb, var(--ui-state-error, #ef4444) 12%, transparent);
    color: var(--ui-state-error, #ef4444);
  }
}

.terminal-pane-workspace {
  position: relative;
  display: grid;
  flex: 1;
  min-width: 0;
  min-height: 0;
  gap: 0;
  overflow: hidden;
  transition: grid-template-columns 0.18s ease, grid-template-rows 0.18s ease;
}

.terminal-stage--tabbed .terminal-pane-workspace,
.terminal-stage--single .terminal-pane-workspace {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.terminal-stage--split-horizontal .terminal-pane-workspace {
  grid-auto-flow: row;
  grid-auto-rows: minmax(0, 1fr);
  grid-template-columns: minmax(0, 1fr);
}

.terminal-stage--split-vertical .terminal-pane-workspace {
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.terminal-stage--grid .terminal-pane-workspace {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  grid-auto-rows: minmax(220px, 1fr);
}

.terminal-stage--master-stack .terminal-pane-workspace {
  grid-template-columns: minmax(0, 2fr) minmax(220px, 1fr);
  grid-auto-rows: minmax(0, 1fr);
}

.terminal-stage--single.terminal-stage--master-stack .terminal-pane-workspace {
  grid-template-columns: minmax(0, 1fr);
}

.terminal-stage--master-stack .terminal-pane:first-child {
  grid-row: 1 / -1;
}

.terminal-stage--dwindle .terminal-pane-workspace {
  display: block;
}

.terminal-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0;
  background: var(--ui-surface-panel);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    opacity 0.16s ease,
    transform 0.18s ease,
    left 0.18s ease,
    top 0.18s ease,
    width 0.18s ease,
    height 0.18s ease;
}

.terminal-stage--dwindle .terminal-pane {
  position: absolute;
}

.terminal-pane--active {
  border-color: rgba(102, 204, 255, 0.66);
  box-shadow:
    inset 0 0 0 1px rgba(102, 204, 255, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 0 0 1px color-mix(in srgb, var(--primary-color) 18%, transparent),
    0 8px 22px color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.terminal-pane--active .terminal-pane__header {
  border-bottom-color: color-mix(in srgb, var(--primary-color) 38%, var(--ui-border-subtle));
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--primary-color) 18%, var(--ui-surface-panel)) 0%,
      color-mix(in srgb, var(--primary-color) 9%, var(--ui-surface-panel)) 100%
    );
  color: var(--ui-text-primary);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -1px 0 color-mix(in srgb, var(--primary-color) 22%, transparent);
}

.terminal-pane--drag-placeholder {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--primary-color) 48%, rgba(148, 163, 184, 0.22));
  background:
    repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 10%, transparent) 0 8px,
      transparent 8px 16px
    ),
    color-mix(in srgb, var(--ui-surface-panel-muted) 90%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 18%, transparent);
}

.terminal-pane--drag-placeholder > :not(.terminal-pane__header) {
  opacity: 0;
  pointer-events: none;
}

.terminal-pane--drag-placeholder .terminal-pane__header {
  border-bottom-color: color-mix(in srgb, var(--primary-color) 24%, transparent);
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 86%, transparent);
}

.terminal-pane--drop-target {
  box-shadow: inset 0 0 0 2px rgba(102, 204, 255, 0.55);
}

.terminal-pane__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: color-mix(in srgb, var(--ui-surface-panel) 86%, rgba(15, 23, 42, 0.34));
  color: var(--ui-text-secondary);
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  font-size: var(--ui-font-size-xs);
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;

  &:active {
    cursor: grabbing;
  }
}

.terminal-pane__kind {
  color: var(--primary-color);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.terminal-pane__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.terminal-pane__status {
  margin-left: auto;
  color: var(--ui-text-muted);
  font-size: 10px;
  text-transform: uppercase;
}

.terminal-pane__close.ui-icon-button.ui-icon-button--sm:not(.ui-icon-button--labeled) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  margin-left: 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  opacity: 0.72;
  transition: background-color 0.14s ease, color 0.14s ease, opacity 0.14s ease;
  transform: none;

  &:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.16);
    color: #ef4444;
    opacity: 1;
    transform: none;
  }

  svg {
    fill: none;
    stroke: currentColor;
  }
}

.terminal-pane .terminal-viewport {
  border: none;
  border-radius: 0;
}

.terminal-pane__connecting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background:
    radial-gradient(circle at 50% 42%, rgba(102, 204, 255, 0.12), transparent 34%),
    var(--ui-surface-panel);
  color: var(--ui-text-primary);
}

.terminal-pane__connecting-spinner {
  width: 28px;
  height: 28px;
  border: 2px solid rgba(102, 204, 255, 0.22);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: terminal-connecting-spin 0.9s linear infinite;
  flex-shrink: 0;
}

.terminal-pane__connecting-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: var(--ui-font-size-sm);
    font-weight: 700;
  }

  span {
    color: var(--ui-text-muted);
    font-family: var(--ui-font-family-mono);
    font-size: var(--ui-font-size-xs);
  }
}

@keyframes terminal-connecting-spin {
  to {
    transform: rotate(360deg);
  }
}

.terminal-pane-drag-preview {
  position: fixed;
  z-index: var(--ui-z-popover);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 260px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid rgba(102, 204, 255, 0.42);
  border-radius: 0;
  background: color-mix(in srgb, var(--ui-surface-panel) 90%, rgba(102, 204, 255, 0.12));
  color: var(--ui-text-primary);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(102, 204, 255, 0.1);
  pointer-events: none;
  transform: translate3d(0, 0, 0) scale(0.94);
  transform-origin: top left;
  transition: opacity 0.12s ease, box-shadow 0.12s ease;
  backdrop-filter: blur(14px);
}

.terminal-pane-drag-preview__kind {
  color: var(--primary-color);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  flex-shrink: 0;
}

.terminal-pane-drag-preview__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
}

.terminal-pane-resizer.ui-icon-button.ui-icon-button--sm:not(.ui-icon-button--labeled) {
  position: absolute;
  z-index: var(--ui-z-floating);
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  transition: background-color 0.12s ease, box-shadow 0.12s ease;
  transform: none;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: transparent;
    transition: background-color 0.12s ease, box-shadow 0.12s ease;
  }

  &:hover::after,
  &:focus-visible::after {
    background: rgba(102, 204, 255, 0.55);
    box-shadow: 0 0 10px rgba(102, 204, 255, 0.28);
  }
}

.terminal-pane-resizer--vertical {
  width: 8px;
  min-height: 100%;
  transform: translateX(-50%);
  cursor: col-resize;

  &::after {
    left: 3px;
    right: 3px;
  }
}

.terminal-pane-resizer--horizontal {
  min-width: 100%;
  height: 8px;
  transform: translateY(-50%);
  cursor: row-resize;

  &::after {
    top: 3px;
    bottom: 3px;
  }
}

body.terminal-pane-resizing {
  cursor: grabbing;
  user-select: none;
}

body.terminal-pane-resizing .terminal-pane,
body.terminal-pane-resizing .terminal-pane-workspace {
  transition: none;
}

body.terminal-pane-dragging-active {
  cursor: grabbing;
  user-select: none;
}

body.terminal-pane-dragging-active .terminal-pane,
body.terminal-pane-dragging-active .terminal-pane-tab {
  cursor: grabbing;
}

.terminal-port-forward-overlay {
  position: absolute;
  inset: 0;
  z-index: var(--ui-z-docked);
  background: rgba(0, 0, 0, 0.12);
}

.terminal-stage__path {
  min-width: 0;
  color: var(--primary-color);
  font-size: var(--ui-font-size-sm);
  font-family: var(--ui-font-family-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &::first-line {
    color: var(--ui-text-primary);
  }
}

.terminal-stage__error {
  flex-shrink: 0;
  color: var(--ui-state-error);
  font-size: var(--ui-font-size-xs);
}

.terminal-empty {
  display: flex;
  flex: 1;
  min-width: 0;
  margin: 16px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface-panel);
  border: 1px solid var(--ui-border-subtle);
}

.terminal-empty__title {
  font-size: var(--ui-font-size-xl);
  font-weight: 600;
  color: var(--ui-text-primary);
}

.terminal-empty__desc {
  max-width: 420px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: 1.6;
}

.terminal-empty__error {
  max-width: min(560px, 80%);
  padding: 10px 12px;
  border: 1px solid rgba(var(--ui-state-error-rgb, 239 68 68), 0.28);
  border-radius: var(--ui-radius-md);
  background: rgba(var(--ui-state-error-rgb, 239 68 68), 0.1);
  color: var(--ui-state-error, #ef4444);
  font-size: var(--ui-font-size-xs);
  line-height: 1.5;
  text-align: center;
  overflow-wrap: anywhere;
}

.terminal-empty__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.terminal-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  margin: 10px 12px 0;
  padding: 9px 12px;
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-font-size-xs);
  line-height: 1.5;

  &--error {
    border: 1px solid rgba(var(--ui-state-error-rgb, 239 68 68), 0.28);
    background: rgba(var(--ui-state-error-rgb, 239 68 68), 0.1);
    color: var(--ui-state-error, #ef4444);
  }
}

.terminal-alert__detail {
  display: inline-block;
  margin-left: 6px;
  color: var(--ui-text-muted);
  font-family: var(--ui-font-family-mono);
  overflow-wrap: anywhere;
}

.terminal-alert__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

/* Status Bar Styles */
.terminal-statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  background: var(--ui-surface-panel-muted);
  border-top: 1px solid var(--ui-border-subtle);
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-muted);
}

.terminal-statusbar__left {
  display: flex;
  align-items: center;
  min-width: 0;
}

.terminal-statusbar__right {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.statusbar-forward-list {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: min(420px, 48vw);
  overflow-x: auto;
  overflow-y: hidden;

  &::-webkit-scrollbar {
    height: 0;
  }
}

.statusbar-forward-list__label {
  flex: 0 0 auto;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  font-weight: 600;
}

.statusbar-forward-chip.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  gap: 4px;
  height: 22px;
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid rgba(34, 197, 94, 0.34);
  border-radius: var(--ui-radius-sm);
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
  font-family: var(--ui-font-family-mono);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
  box-shadow: none;
  transform: none;

  &:hover:not(:disabled) {
    border-color: rgba(34, 197, 94, 0.62);
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
    transform: none;
  }

  .ui-button__label {
    gap: 4px;
  }
}

.statusbar-forward-chip__type {
  color: var(--ui-text-muted);
  font-size: 9px;
  font-weight: 800;
}

.statusbar-forward-chip__port {
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
}

// ── SSH Password Prompt ───────────────────────────────────────

.ssh-pwd-dialog {
  width: 100%;
  border-radius: var(--ui-radius-lg);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);

  &__header {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--ui-font-size-lg);
    font-weight: 700;
    color: var(--ui-text-primary);

    svg { color: var(--primary-color); }
  }

  &__sub {
    margin: 0;
    font-size: var(--ui-font-size-xs);
    font-family: var(--ui-font-family-mono);
    color: var(--ui-text-muted);
  }

  &__input.ui-input {
    width: 100%;
    box-sizing: border-box;
    border-radius: var(--ui-radius-md);
    font-size: var(--ui-font-size-md);
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
}

.ssh-pwd-btn.ui-button {
  padding: 7px 18px;
  border-radius: var(--ui-radius-md);
  border: none;
  font-size: var(--ui-font-size-sm);
  font-weight: 600;
  transition: all 0.18s;
  box-shadow: none;
  transform: none;
}

.ssh-pwd-btn--cancel.ui-button {
  background: var(--ui-surface-overlay);
  color: var(--ui-text-secondary);

  &:hover:not(:disabled) {
    background: var(--ui-surface-panel);
    transform: none;
  }
}

.ssh-pwd-btn--confirm.ui-button {
  background: var(--primary-color);
  color: #fff;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: none;
  }
}

// Dialog fade transition
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;

  .ssh-pwd-dialog {
    transition: transform 0.2s ease;
  }
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;

  .ssh-pwd-dialog {
    transform: translateY(-12px) scale(0.97);
  }
}
</style>
