<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiPopupSurface from '@/windows/main/components/ui/UiPopupSurface.vue';
import { notifyError } from '@/windows/main/composables/useInAppNotification';
import { useGlobalStore } from '@/windows/main/stores/global_store';
import { useTerminalStore } from '@/windows/main/stores/terminal_store';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import { useFtpStore } from '@/windows/main/stores/ftp_store';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import type { TerminalLayoutMode, TerminalRendererMode, TerminalSessionDescriptor } from '@/contracts/terminal';
import type { BackgroundConfirmPayload } from '@/contracts/background';
import type { SshProfile, SshSessionDescriptor } from '@/contracts/ssh';
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

const globalStore = useGlobalStore();
const terminalStore = useTerminalStore();
const sshStore = useSshStore();
const ftpStore = useFtpStore();
const appConfigStore = useAppConfigStore();

const viewportRefs = new Map<string, InstanceType<typeof TerminalViewport>>();
const searchPanelRef = ref<InstanceType<typeof TerminalSearchPanel> | null>(null);
const terminalMainRef = ref<HTMLElement | null>(null);
const terminalStageRef = ref<HTMLElement | null>(null);
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

interface DwindleLayoutModel {
  items: TerminalPaneLayoutItem[];
  handles: TerminalPaneResizeHandle[];
}

const focusedTerminalPaneKey = ref('');
const paneOrder = ref<string[]>([]);
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
const resizeInteraction = ref<PaneResizeInteraction | null>(null);
let transparentDragImage: HTMLElement | null = null;

function syncSidebarTabFromRoute() {
  const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  if (tab === 'config' || tab === 'terminal' || tab === 'ssh' || tab === 'connections') {
    sidebarTab.value = 'config';
  }
}

function activateSidebarTab() {
  sidebarTab.value = 'config';
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
const sshReconnectingSessionId = ref('');
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

async function reconnectActiveSshSession() {
  const session = activeSshSessionForPane.value;
  const profile = activeSshProfile.value;
  if (!session || !profile) {
    sshConnectError.value = '找不到原 SSH 配置，无法自动重连。请从左侧 SSH 配置列表重新连接。';
    return;
  }

  sshReconnectingSessionId.value = session.sessionId;
  sshConnectError.value = '';
  try {
    try {
      await sshStore.disconnect(session.sessionId);
    } catch {
      // The backend may already have dropped this session; reconnecting can continue.
    }
    await handleSshConnect(profile);
  } finally {
    sshReconnectingSessionId.value = '';
  }
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
  const ordered = paneOrder.value
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
const activeSshReconnectState = computed(() =>
  activeSshSessionForPane.value
    ? sshStore.reconnectStates[activeSshSessionForPane.value.sessionId] ?? null
    : null,
);
const activeSshDisconnectMessage = computed(() =>
  activeSshSessionForPane.value
    ? sshStore.getError(activeSshSessionForPane.value.sessionId) || activeSshReconnectState.value?.lastError || ''
    : '',
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
const activeTerminalBackground = computed(() => activeLocalTerminalProfile.value?.background ?? {
  type: appConfigStore.config.features.terminal.viewportBgType ?? 'color',
  color: appConfigStore.config.features.terminal.viewportBgColor ?? '',
  image: appConfigStore.config.features.terminal.viewportBgImage ?? '',
  video: appConfigStore.config.features.terminal.viewportBgVideo ?? '',
  style: appConfigStore.config.features.terminal.viewportBgStyle ?? {},
});
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
  getMeasuredElementSize(terminalStageRef.value ?? terminalMainRef.value, { width: 320, height: 200 })
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
      return localProfile.background;
    }
  }

  return {
    type: appConfigStore.config.features.terminal.viewportBgType ?? 'color',
    color: appConfigStore.config.features.terminal.viewportBgColor ?? '',
    image: appConfigStore.config.features.terminal.viewportBgImage ?? '',
    video: appConfigStore.config.features.terminal.viewportBgVideo ?? '',
    style: appConfigStore.config.features.terminal.viewportBgStyle ?? {},
  };
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

function handlePaneDragStart(event: DragEvent, pane: TerminalPane) {
  if (visibleTerminalPanes.value.length <= 1) return;
  draggingPaneKey.value = pane.key;
  dropTargetPaneKey.value = pane.key;
  updatePaneDragPreview(event, pane);
  event.dataTransfer?.setData('text/plain', pane.key);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setDragImage(getTransparentDragImage(), 0, 0);
  }
}

function handlePaneDragOver(event: DragEvent, pane: TerminalPane) {
  if (!draggingPaneKey.value) return;
  event.preventDefault();
  updatePaneDragPreview(event, pane);
  if (draggingPaneKey.value === pane.key) return;
  if (dropTargetPaneKey.value !== pane.key) {
    reorderPane(draggingPaneKey.value, pane.key);
  }
  dropTargetPaneKey.value = pane.key;
}

function handlePaneDrop(event: DragEvent, pane: TerminalPane) {
  event.preventDefault();
  const sourceKey = event.dataTransfer?.getData('text/plain') || draggingPaneKey.value;
  reorderPane(sourceKey, pane.key);
  clearPaneDragState();
}

function handlePaneDragMove(event: DragEvent) {
  if (!draggingPaneKey.value) return;
  updatePaneDragPreview(event);
}

function handlePaneWorkspaceDragOver(event: DragEvent) {
  if (!draggingPaneKey.value) return;
  event.preventDefault();
  updatePaneDragPreview(event);
}

function clearPaneDragState() {
  draggingPaneKey.value = '';
  dropTargetPaneKey.value = '';
  paneDragPreview.value = {
    ...paneDragPreview.value,
    visible: false,
  };
}

function reorderPane(sourceKey: string, targetKey: string) {
  if (!sourceKey || !targetKey || sourceKey === targetKey) return;
  const keys = orderedTerminalPanes.value.map((pane) => pane.key);
  const sourceIndex = keys.indexOf(sourceKey);
  const targetIndex = keys.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0) return;

  keys.splice(sourceIndex, 1);
  keys.splice(targetIndex, 0, sourceKey);
  paneOrder.value = keys;
}

function updatePaneDragPreview(event: DragEvent, pane?: TerminalPane) {
  if (event.clientX === 0 && event.clientY === 0) return;
  const draggedPane = orderedTerminalPanes.value.find((item) => item.key === draggingPaneKey.value);
  const sourcePane = draggedPane ?? pane ?? null;
  paneDragPreview.value = {
    visible: true,
    left: event.clientX + 14,
    top: event.clientY + 14,
    title: sourcePane?.title ?? paneDragPreview.value.title,
    kind: sourcePane?.kind ?? paneDragPreview.value.kind,
  };
}

function getTransparentDragImage() {
  if (transparentDragImage) return transparentDragImage;
  transparentDragImage = document.createElement('div');
  transparentDragImage.style.position = 'fixed';
  transparentDragImage.style.left = '-100px';
  transparentDragImage.style.top = '-100px';
  transparentDragImage.style.width = '1px';
  transparentDragImage.style.height = '1px';
  transparentDragImage.style.opacity = '0';
  document.body.appendChild(transparentDragImage);
  return transparentDragImage;
}

function startPaneResize(event: PointerEvent, handle: TerminalPaneResizeHandle) {
  const workspace = terminalStageRef.value?.querySelector('.terminal-pane-workspace');
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
  if (localProfile) {
    await appConfigStore.updateConfig({
      features: {
        terminal: {
          localProfiles: appConfigStore.config.features.terminal.localProfiles.map((profile) =>
            profile.id === localProfile.id
              ? {
                  ...profile,
                  background: {
                    type: payload.type,
                    color: payload.color ?? '',
                    image: payload.image ?? '',
                    video: payload.video ?? '',
                    style: payload.backgroundStyle ?? {},
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
        viewportBgType: payload.type,
        viewportBgColor: payload.color ?? '',
        viewportBgImage: payload.image ?? '',
        viewportBgVideo: payload.video ?? '',
        viewportBgStyle: payload.backgroundStyle ?? {},
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

onMounted(() => {
  globalStore.setTopbarColor('');
  window.addEventListener('keydown', handleTerminalPageKeydown, true);
  window.addEventListener('unhandledrejection', handleUnhandledSshRejection);
  void initializePage();
  void sshStore.initialize();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleTerminalPageKeydown, true);
  window.removeEventListener('unhandledrejection', handleUnhandledSshRejection);
  stopPaneResize();
  transparentDragImage?.remove();
  transparentDragImage = null;
});
</script>

<template>
  <div class="terminal-page">
    <div class="terminal-layout">
      <!-- Sidebar -->
      <div class="terminal-sidebar" :class="{ 'terminal-sidebar--collapsed': sidebarCollapsed }">
        <div class="terminal-sidebar__header">
          <button
            class="terminal-sidebar__toggle"
            type="button"
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
          </button>
          <!-- Tab switcher (only visible when sidebar is expanded) -->
          <div v-show="!sidebarCollapsed" class="sidebar-tabs">
            <button
              class="sidebar-tab"
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
            </button>
          </div>
        </div>

        <div class="terminal-sidebar__tab-panels">
          <!-- Config tab -->
          <div class="terminal-sidebar__panel terminal-sidebar__panel--config">
            <template v-if="sidebarCollapsed">
              <div class="terminal-sidebar__collapsed-rail">
                <button
                  v-for="profile in terminalStore.profiles"
                  :key="profile.id"
                  class="terminal-sidebar__collapsed-action"
                  type="button"
                  :title="`新建本地终端：${profile.label}`"
                  @click="createSession(profile.id)"
                >
                  <TerminalProfileIcon
                    :profile-id="profile.id"
                    :command="profile.command"
                    :label="profile.label"
                    :size="18"
                  />
                </button>
                <div class="terminal-sidebar__collapsed-divider" />
                <button
                  v-for="profile in sshStore.profiles"
                  :key="profile.id"
                  class="terminal-sidebar__collapsed-action terminal-sidebar__collapsed-action--ssh"
                  :class="{ 'terminal-sidebar__collapsed-action--connecting': isSshProfileConnecting(profile.id) }"
                  type="button"
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
                </button>
                <div class="terminal-sidebar__collapsed-divider" />
                <button
                  class="terminal-sidebar__collapsed-action terminal-sidebar__collapsed-action--muted"
                  type="button"
                  title="新建 SSH 配置"
                  @click="openSshProfileDialog(null)"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2"
                    fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
              </div>
            </template>
            <template v-else>
              <div class="terminal-sidebar__sessions terminal-sidebar__config-list">
                <div class="terminal-sidebar__section-header">
                  <span class="terminal-sidebar__section-label">本地终端配置</span>
                </div>
                <button
                  v-for="profile in terminalStore.profiles"
                  :key="profile.id"
                  class="terminal-profile-item"
                  type="button"
                  @click="createSession(profile.id)"
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
                </button>
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
            </template>
          </div>
        </div>
      </div>

      <!-- Main content area -->
      <div ref="terminalMainRef" class="terminal-main">
        <TerminalToolbar :active-session="activeToolbarSession"
          :renderer-mode="rendererMode"
          :layout-mode="layoutMode"
          :color-scheme-id="colorSchemeId"
          :ssh-mode="isSshMode" :port-forward-open="sshStore.portForwardPanelOpen"
          :can-detach="!!activeTerminalPane && activeTerminalPane.kind !== 'ssh-pending'"
          :title-editable="activeTerminalPane?.kind === 'local'"
          @search="toggleSearchPanel" @clear="clearTerminal" @detach="detachActiveSession"
          @rename="handleRenameSession" @update:rendererMode="updateRendererMode"
          @update:layoutMode="updateLayoutMode"
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

        <Transition name="ui-tab-fade">
        <div v-if="isSshMode && activeSshReconnectState && activeSshSessionForPane" class="terminal-alert terminal-alert--error">
          <span>
            {{ activeSshSessionForPane.profileLabel }} 连接已断开，请重连后继续操作。
            <span v-if="activeSshDisconnectMessage" class="terminal-alert__detail">{{ activeSshDisconnectMessage }}</span>
          </span>
          <div class="terminal-alert__actions">
            <UiButton
              size="sm"
              variant="secondary"
              :disabled="sshReconnectingSessionId === activeSshSessionForPane.sessionId || !activeSshProfile"
              @click="reconnectActiveSshSession"
            >
              {{ sshReconnectingSessionId === activeSshSessionForPane.sessionId ? '重连中' : '重连' }}
            </UiButton>
          </div>
        </div>
        </Transition>

        <div
          v-if="terminalPanes.length"
          ref="terminalStageRef"
          class="terminal-stage"
          :class="[
            `terminal-stage--${layoutMode}`,
            { 'terminal-stage--single': visibleTerminalPanes.length === 1 },
          ]"
        >
          <div v-if="layoutMode === 'tabbed' && terminalPanes.length > 1" class="terminal-pane-tabs">
            <button
              v-for="pane in orderedTerminalPanes"
              :key="pane.key"
              class="terminal-pane-tab"
              :class="{
                'terminal-pane-tab--active': pane.key === activeTerminalPane?.key,
                'terminal-pane-tab--drop-target': pane.key === dropTargetPaneKey,
              }"
              type="button"
              draggable="true"
              @dragstart="handlePaneDragStart($event, pane)"
              @drag="handlePaneDragMove"
              @dragover="handlePaneDragOver($event, pane)"
              @drop="handlePaneDrop($event, pane)"
              @dragend="clearPaneDragState"
              @click="focusPane(pane, true)"
            >
              <span class="terminal-pane-tab__kind">{{ pane.kind === 'local' ? '本地' : 'SSH' }}</span>
              <span class="terminal-pane-tab__title">{{ pane.title }}</span>
            </button>
          </div>

          <div
            class="terminal-pane-workspace"
            :style="terminalPaneWorkspaceStyle"
            @dragover="handlePaneWorkspaceDragOver"
          >
            <div
              v-for="item in terminalPaneLayoutItems"
              :key="item.pane.key"
              class="terminal-pane"
              :class="{
                'terminal-pane--active': item.pane.key === activeTerminalPane?.key,
                'terminal-pane--ssh': item.pane.kind === 'ssh',
                'terminal-pane--pending': item.pane.kind === 'ssh-pending',
                'terminal-pane--dragging': item.pane.key === draggingPaneKey,
                'terminal-pane--drop-target': item.pane.key === dropTargetPaneKey,
              }"
              :style="item.style"
              @dragover="handlePaneDragOver($event, item.pane)"
              @drop="handlePaneDrop($event, item.pane)"
              @pointerdown.capture="focusPane(item.pane, false)"
            >
              <div
                class="terminal-pane__header"
                draggable="true"
                title="拖动以调整终端位置"
                @dragstart="handlePaneDragStart($event, item.pane)"
                @drag="handlePaneDragMove"
                @dragover="handlePaneDragOver($event, item.pane)"
                @drop="handlePaneDrop($event, item.pane)"
                @dragend="clearPaneDragState"
              >
                <span class="terminal-pane__kind">{{ item.pane.kind === 'local' ? '本地' : 'SSH' }}</span>
                <span class="terminal-pane__title">{{ item.pane.title }}</span>
                <span class="terminal-pane__status">{{ item.pane.status }}</span>
                <button
                  class="terminal-pane__close"
                  type="button"
                  title="关闭终端"
                  aria-label="关闭终端"
                  draggable="false"
                  @click.stop="closePane(item.pane)"
                  @dragstart.prevent
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
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
            <button
              v-for="handle in terminalPaneResizeHandles"
              :key="handle.id"
              class="terminal-pane-resizer"
              :class="`terminal-pane-resizer--${handle.orientation}`"
              :style="handle.style"
              type="button"
              aria-label="调整终端区域大小"
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
        </div>

        <div v-else class="terminal-empty ui-glass-surface ui-glass-surface--strong">
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
              <button
                v-for="port in forwardedPortSummaries"
                :key="`${port.sessionId}:${port.forwardId}`"
                class="statusbar-forward-chip"
                :title="`${port.profileLabel} · ${port.label} · ${port.address}`"
                @click="openPortForwardPanelForSession(port.sessionId)"
              >
                <span class="statusbar-forward-chip__type">{{ port.forwardType.slice(0, 1).toUpperCase() }}</span>
                <span class="statusbar-forward-chip__port">{{ port.port }}</span>
              </button>
            </div>
            <span>{{ activeTerminalPane?.kind === 'local' ? '本地' : 'SSH' }}</span>
          </div>
        </div>
      </div>
    </div>

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
        :z-index="9000"
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
              <input
                id="ssh-password-input"
                v-model="sshPasswordPromptValue"
                type="password"
                class="ssh-pwd-dialog__input"
                placeholder="请输入密码..."
                autofocus
                @keydown.enter="handleSshPasswordConfirm"
                @keydown.esc="handleSshPasswordCancel"
              />
              <div class="ssh-pwd-dialog__actions">
                <button class="ssh-pwd-btn ssh-pwd-btn--cancel" @click="handleSshPasswordCancel">取消</button>
                <button class="ssh-pwd-btn ssh-pwd-btn--confirm" @click="handleSshPasswordConfirm">连接</button>
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

  </div>
</template>

<style lang="scss" scoped>
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

/* Sidebar Styles */
.terminal-sidebar {
  display: flex;
  flex-direction: column;
  width: var(--ui-page-sidebar-width);
  flex-shrink: 0;
  border-right: 1px solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);
  transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
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

.terminal-sidebar__toggle {
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
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    border-color: var(--ui-border-subtle);
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
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

.sidebar-tab {
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
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;

  &--active {
    background: var(--ui-surface-panel);
    color: var(--ui-text-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  &:hover:not(&--active) {
    color: var(--ui-text-secondary);
  }

  &__badge {
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
}

// ── Status bar SSH indicator ──────────────────────────────────

.statusbar-ssh-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-family: Consolas, 'Cascadia Mono', monospace;
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

  :deep(.ui-tooltip-trigger) {
    width: 100%;
  }
}

.terminal-sidebar__config-list {
  flex: 0 0 auto;
  overflow: visible;
  padding-bottom: 0;
}

.terminal-sidebar__ssh-configs {
  min-height: 0;
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

.terminal-profile-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;

  &:hover {
    border-color: var(--ui-border-accent-soft);
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);

    .terminal-profile-item__launch {
      opacity: 1;
      transform: translateX(0);
    }
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
  font-size: 12px;
  font-weight: 600;
}

.terminal-profile-item__command {
  color: var(--ui-text-muted);
  font-family: Consolas, 'Cascadia Mono', monospace;
  font-size: 11px;
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

.terminal-sidebar--collapsed .terminal-sidebar__sessions :deep(.ui-tooltip-trigger) {
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
}

.terminal-sidebar__collapsed-action {
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
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;

  &:hover:not(:disabled) {
    border-color: var(--ui-border-accent-soft);
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }

  &:disabled {
    cursor: progress;
    opacity: 0.72;
  }

  &--ssh {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  }

  &--connecting::after {
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

  &--muted {
    color: var(--ui-text-muted);
    background: color-mix(in srgb, var(--ui-surface-overlay) 72%, transparent);
  }
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

.terminal-pane-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-right: 1px solid var(--ui-border-subtle);
  border-radius: 0;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.16s ease;

  &:hover {
    border-color: var(--ui-border-accent-soft);
    color: var(--ui-text-secondary);
  }

  &--active {
    border-color: var(--ui-border-subtle);
    background: color-mix(in srgb, var(--ui-tabs-active-bg) 84%, transparent);
    color: var(--ui-text-primary);
  }

  &--drop-target {
    box-shadow: inset 2px 0 0 var(--primary-color);
  }
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
  border-color: rgba(102, 204, 255, 0.48);
  box-shadow: inset 0 0 0 1px rgba(102, 204, 255, 0.2);
}

.terminal-pane--dragging {
  opacity: 0.55;
  transform: scale(0.985);
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
  font-size: 12px;

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

.terminal-pane__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  opacity: 0.72;
  transition: background-color 0.14s ease, color 0.14s ease, opacity 0.14s ease;

  &:hover {
    background: rgba(239, 68, 68, 0.16);
    color: #ef4444;
    opacity: 1;
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }
}

.terminal-pane :deep(.terminal-viewport) {
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
    font-size: 13px;
    font-weight: 700;
  }

  span {
    color: var(--ui-text-muted);
    font-family: Consolas, 'Cascadia Mono', monospace;
    font-size: 12px;
  }
}

@keyframes terminal-connecting-spin {
  to {
    transform: rotate(360deg);
  }
}

.terminal-pane-drag-preview {
  position: fixed;
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 260px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid rgba(102, 204, 255, 0.42);
  background: color-mix(in srgb, var(--ui-surface-panel) 90%, rgba(102, 204, 255, 0.12));
  color: var(--ui-text-primary);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(102, 204, 255, 0.1);
  pointer-events: none;
  transform: translate3d(0, 0, 0);
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
  font-size: 12px;
  font-weight: 700;
}

.terminal-pane-resizer {
  position: absolute;
  z-index: 40;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  transition: background-color 0.12s ease, box-shadow 0.12s ease;

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

:global(body.terminal-pane-resizing) {
  cursor: grabbing;
  user-select: none;
}

:global(body.terminal-pane-resizing) .terminal-pane,
:global(body.terminal-pane-resizing) .terminal-pane-workspace {
  transition: none;
}

.terminal-port-forward-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.12);
}

.terminal-stage__path {
  min-width: 0;
  color: var(--primary-color);
  font-size: 13px;
  font-family: Consolas, 'Cascadia Mono', monospace;
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
  font-size: 12px;
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
  font-size: 18px;
  font-weight: 600;
  color: var(--ui-text-primary);
}

.terminal-empty__desc {
  max-width: 420px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.terminal-empty__error {
  max-width: min(560px, 80%);
  padding: 10px 12px;
  border: 1px solid rgba(var(--ui-state-error-rgb, 239 68 68), 0.28);
  border-radius: var(--ui-radius-md);
  background: rgba(var(--ui-state-error-rgb, 239 68 68), 0.1);
  color: var(--ui-state-error, #ef4444);
  font-size: 12px;
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
  font-size: 12px;
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
  font-family: Consolas, 'Cascadia Mono', monospace;
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
  font-size: 12px;
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
  font-size: 11px;
  font-weight: 600;
}

.statusbar-forward-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  gap: 4px;
  height: 22px;
  padding: 0 7px;
  border: 1px solid rgba(34, 197, 94, 0.34);
  border-radius: var(--ui-radius-sm);
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
  cursor: pointer;
  font-family: Consolas, 'Cascadia Mono', monospace;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    border-color: rgba(34, 197, 94, 0.62);
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
  }
}

.statusbar-forward-chip__type {
  color: var(--ui-text-muted);
  font-size: 9px;
  font-weight: 800;
}

.statusbar-forward-chip__port {
  font-size: 11px;
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
    font-size: 15px;
    font-weight: 700;
    color: var(--ui-text-primary);

    svg { color: var(--primary-color); }
  }

  &__sub {
    margin: 0;
    font-size: 12px;
    font-family: Consolas, 'Cascadia Mono', monospace;
    color: var(--ui-text-muted);
  }

  &__input {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 12px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: var(--ui-radius-md);
    background: var(--ui-surface-overlay);
    color: var(--ui-text-primary);
    font-size: 14px;
    outline: none;
    transition: border-color 0.18s;

    &:focus {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.15);
    }
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
}

.ssh-pwd-btn {
  padding: 7px 18px;
  border-radius: var(--ui-radius-md);
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;

  &--cancel {
    background: var(--ui-surface-overlay);
    color: var(--ui-text-secondary);

    &:hover { background: var(--ui-surface-panel); }
  }

  &--confirm {
    background: var(--primary-color);
    color: #fff;

    &:hover { filter: brightness(1.1); }
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
