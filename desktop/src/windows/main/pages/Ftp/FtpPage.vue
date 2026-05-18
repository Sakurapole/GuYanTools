<script setup lang="ts">
import type {
  FileTransferEntry,
  FtpScheduledTask,
  TransferTask,
  UpsertFtpScheduledTaskInput,
} from '@/contracts/ftp';
import type { TerminalLayoutMode } from '@/contracts/terminal';
import DeleteIcon from '@/windows/main/components/svgs/icons/DeleteIcon.vue';
import OpenIcon from '@/windows/main/components/svgs/icons/OpenIcon.vue';
import MainPageLayout from '@/windows/main/components/layout/MainPageLayout.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiDateTimePicker from '@/windows/main/components/ui/UiDateTimePicker.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiTimePicker from '@/windows/main/components/ui/UiTimePicker.vue';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
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
import FtpBrowserPanel from '@/windows/main/pages/Ftp/components/FtpBrowserPanel.vue';
import FtpCodeEditor from '@/windows/main/pages/Ftp/components/FtpCodeEditor.vue';
import FtpConfigSidebar from '@/windows/main/pages/Ftp/components/FtpConfigSidebar.vue';
import FtpSyncPanel from '@/windows/main/pages/Ftp/components/FtpSyncPanel.vue';
import FtpTransferQueue from '@/windows/main/pages/Ftp/components/FtpTransferQueue.vue';
import FtpAuthChallengeDialog from '@/windows/main/pages/Ftp/components/dialogs/FtpAuthChallengeDialog.vue';
import FtpEntryNameDialog from '@/windows/main/pages/Ftp/components/dialogs/FtpEntryNameDialog.vue';
import FtpFolderDialog from '@/windows/main/pages/Ftp/components/dialogs/FtpFolderDialog.vue';
import FtpPasswordDialog from '@/windows/main/pages/Ftp/components/dialogs/FtpPasswordDialog.vue';
import FtpProfileDialog from '@/windows/main/pages/Ftp/components/dialogs/FtpProfileDialog.vue';
import { useFtpBrowserState } from '@/windows/main/pages/Ftp/composables/useFtpBrowserState';
import { useFtpConfigFlow } from '@/windows/main/pages/Ftp/composables/useFtpConfigFlow';
import { useFtpPanelInteractions } from '@/windows/main/pages/Ftp/composables/useFtpPanelInteractions';
import { useFtpSidebar } from '@/windows/main/pages/Ftp/composables/useFtpSidebar';
import { useFtpThumbnails } from '@/windows/main/pages/Ftp/composables/useFtpThumbnails';
import type {
  PanelFilterState,
  EntrySortKey,
  PanelKind,
  PanelViewMode,
  SyncActionKind,
  SyncComparisonItem,
  SyncConflictPolicy,
  SyncDirection,
  SyncPreviewItem,
  TaskSortKey,
} from '@/windows/main/pages/Ftp/types';
import { highlightEntryName, isRuleFilterActive, matchesPanelFilter, panelFilterSummary } from '@/windows/main/pages/Ftp/utils/ftpFilters';
import { formatSize, formatTime } from '@/windows/main/pages/Ftp/utils/ftpFormat';
import {
  baseName,
  buildLocalBreadcrumbs,
  buildPathSuggestions,
  buildRemoteBreadcrumbs,
  joinLocalPath,
  joinRemotePath,
  parentLocalPath,
  parentRemotePath,
} from '@/windows/main/pages/Ftp/utils/ftpPaths';
import {
  canPauseTask,
  canResumeTask,
  canRetryTask,
  compareTaskValues,
  sessionStatusLabel,
  sortEntries,
  taskPriorityLabel,
  taskStatusLabel,
} from '@/windows/main/pages/Ftp/utils/ftpSort';
import {
  buildRecursiveSyncComparisonItems,
  buildSyncComparisonItems,
  determineSyncAction,
  syncActionLabel,
  syncDifferenceLabel,
  syncStatusLabel,
  verifySyncComparisonContent,
} from '@/windows/main/pages/Ftp/utils/ftpSync';
import { useFtpStore, type PendingFtpOpenRequest } from '@/windows/main/stores/ftp_store';
import { useGlobalStore } from '@/windows/main/stores/global_store';
import { useSettingStore } from '@/windows/main/stores/settings_store';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import { useTerminalStore } from '@/windows/main/stores/terminal_store';
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

type PanelLayoutMode = TerminalLayoutMode;
type SidebarDockSide = 'left' | 'right';
type AuxiliaryDockSide = 'bottom' | 'right';
type ActiveBrowserPanel = string;
type FtpWorkspacePaneKey = string;
type EditorTargetKind = 'local' | 'remote';
type RemotePreviewKind = 'image' | 'text';
type AuxiliaryDockTab = 'queue' | 'log';
type TransferTaskRefreshSnapshot = Pick<TransferTask, 'id' | 'status' | 'direction' | 'sessionId' | 'remotePath'>;
type RemoteRefreshTarget = {
  panel: string;
  sessionId: string;
  path: string;
};
type FtpPaneResizeKind = 'split' | 'master-main' | 'grid' | 'dwindle';
type FtpPaneResizeOrientation = 'horizontal' | 'vertical';
type FtpWorkspacePane = {
  key: FtpWorkspacePaneKey;
  title: string;
  kind: PanelKind;
  sessionId?: string;
  profileId?: string;
  protocol?: string;
  connectionState?: 'connecting';
  connectionMessage?: string;
  path: string;
  pathInput: string;
  entries: FileTransferEntry[];
  selectedPaths: string[];
  lastSelectedIndex: number;
  loading: boolean;
  viewMode: PanelViewMode;
};
type FtpPaneDragPayload = {
  sourcePaneKey: FtpWorkspacePaneKey;
  sourceKind: PanelKind;
  sourceSessionId?: string;
  entries: FileTransferEntry[];
};
type FtpWorkspacePaneLayoutItem = {
  pane: FtpWorkspacePane;
  style: Record<string, string>;
};
type FtpPaneResizeHandle = {
  id: string;
  kind: FtpPaneResizeKind;
  orientation: FtpPaneResizeOrientation;
  style: Record<string, string>;
  bounds?: { left: number; top: number; width: number; height: number };
  stateKey?: string;
  index?: number;
  splitIndex?: number;
};
type FtpPaneResizeInteraction = {
  handle: FtpPaneResizeHandle;
  startX: number;
  startY: number;
  startSizes: number[];
  rect: DOMRect;
};
type FtpPaneDragInteraction = {
  pointerId: number;
  pane: FtpWorkspacePane;
  startX: number;
  startY: number;
  moved: boolean;
  originalOrder: string[];
  previewOrder: string[];
};
type FtpDwindleLayoutModel = {
  items: FtpWorkspacePaneLayoutItem[];
  handles: FtpPaneResizeHandle[];
};
type TerminalOpenTarget =
  | { kind: 'local'; path: string }
  | { kind: 'ssh'; path: string; sshProfileId: string };
type DisconnectedSessionNotice = {
  sessionId: string;
  profileId: string;
  label: string;
  remotePath: string;
  message: string;
};
type ClosedSessionSnapshot = {
  profileId: string;
  profileLabel: string;
  localPath: string;
  remotePath: string;
};
type PendingSshOpenRequest = Extract<PendingFtpOpenRequest, { source: 'ssh' }>;
type PendingProfileOpenRequest = Extract<PendingFtpOpenRequest, { source: 'profile' }>;

const FTP_LAYOUT_STORAGE_KEY = 'guyantools.ftp.layout';
const FTP_PREFERENCES_STORAGE_KEY = 'guyantools.ftp.preferences';
const IMAGE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
const REMOTE_TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

const globalStore = useGlobalStore();
const ftpStore = useFtpStore();
const sshStore = useSshStore();
const terminalStore = useTerminalStore();
const settingsStore = useSettingStore();
const router = useRouter();
const route = useRoute();
const { show: showConfirm } = useConfirmDialog();
const { open: openContextMenu, close: closeContextMenu } = useContextMenu();

const busyMessage = ref('');
const actionError = ref('');
const disconnectedSessionNotice = ref<DisconnectedSessionNotice | null>(null);
const reconnectingDisconnectedSession = ref(false);
const remoteEditorDialogVisible = ref(false);
const remotePreviewDialogVisible = ref(false);
const syncPanelVisible = ref(false);
const linkNavigationEnabled = ref(false);
const taskSortKey = ref<TaskSortKey>('createdAt');
const taskSortDirection = ref<'asc' | 'desc'>('desc');
const auxiliaryDockCollapsed = ref(false);
const expandedTaskIds = ref<string[]>([]);
const autoExpandedTreeTaskIds = ref<string[]>([]);
const syncDirection = ref<SyncDirection>('localToRemote');
const syncConflictPolicy = ref<SyncConflictPolicy>('keepNewer');
const recursiveCompareEnabled = ref(false);
const checksumCompareEnabled = ref(false);
const checksumCompareRunning = ref(false);
const syncComparisonItems = ref<SyncComparisonItem[]>([]);
const syncComparisonExpanded = ref(false);
const syncExecuting = ref(false);
const syncExecutionCurrentIndex = ref(0);
const syncExecutionTotal = ref(0);
const syncExecutionLabel = ref('');
const syncCancelRequested = ref(false);
const remoteEditorPath = ref('');
const remoteEditorContent = ref('');
const remoteEditorOriginalContent = ref('');
const remoteEditorLoading = ref(false);
const remoteEditorSaving = ref(false);
const editorTargetKind = ref<EditorTargetKind>('remote');
const remotePreviewSource = ref<EditorTargetKind>('remote');
const remotePreviewKind = ref<RemotePreviewKind>('image');
const remotePreviewPath = ref('');
const remotePreviewName = ref('');
const remotePreviewImageSrc = ref('');
const remotePreviewText = ref('');
const remotePreviewLoading = ref(false);
const remotePreviewError = ref('');
const panelLayoutMode = ref<PanelLayoutMode>('split-vertical');
const sidebarDockSide = ref<SidebarDockSide>('left');
const auxiliaryDockSide = ref<AuxiliaryDockSide>('bottom');
const activeBrowserPanel = ref<ActiveBrowserPanel>('');
const auxiliaryDockSize = ref('260');
const localPanelViewMode = ref<PanelViewMode>('details');
const remotePanelViewMode = ref<PanelViewMode>('details');
const ftpWorkspacePanes = ref<FtpWorkspacePane[]>([]);
const localWorkspacePaneCounter = ref(0);
const ftpPaneWorkspaceRef = ref<HTMLElement | null>(null);
const ftpLayoutSizeState = ref<Record<string, number[]>>({});
const ftpMasterMainRatio = ref(66);
const ftpDwindleSplitRatios = ref<number[]>([]);
const ftpPaneResizeInteraction = ref<FtpPaneResizeInteraction | null>(null);
const ftpPaneDragInteraction = ref<FtpPaneDragInteraction | null>(null);
const ftpPaneDragPreviewOrder = ref<string[]>([]);
const draggingFtpPaneKey = ref('');
const dropTargetFtpPaneKey = ref('');
const ftpFileDropTargetPaneKey = ref('');
const ftpWorkspaceRemoteRestoreReady = ref(false);
const ftpPaneDragPreview = ref({
  visible: false,
  left: 0,
  top: 0,
  title: '',
  kind: '' as PanelKind | '',
});
const connectionLayoutConfigs = ref<ConnectionLayoutConfig[]>([]);
const saveLayoutDialogVisible = ref(false);
const saveLayoutName = ref('');

let stopAuxiliaryDockResize: (() => void) | null = null;

function startAuxiliaryDockResize(e: MouseEvent) {
  if (auxiliaryDockSide.value !== 'bottom' || auxiliaryDockCollapsed.value) return;
  e.preventDefault();
  stopAuxiliaryDockResize?.();

  const startY = e.clientY;
  const startSize = Number.parseInt(auxiliaryDockSize.value, 10) || 260;
  document.body.classList.add('ftp-aux-dock-resizing');

  function onMove(ev: MouseEvent) {
    const nextSize = Math.max(180, startSize + startY - ev.clientY);
    auxiliaryDockSize.value = String(Math.round(nextSize));
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.classList.remove('ftp-aux-dock-resizing');
    stopAuxiliaryDockResize = null;
  }

  stopAuxiliaryDockResize = onUp;
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
const showSidebarPanel = ref(true);
const showLogPanel = ref(true);
const auxDockActiveTab = ref<AuxiliaryDockTab>('queue');
const draggedSessionId = ref('');
const recentlyClosedSessions = ref<ClosedSessionSnapshot[]>([]);
const scheduledTasks = ref<FtpScheduledTask[]>([]);
const scheduleDialogVisible = ref(false);
const editingScheduledTaskId = ref('');
const pendingExternalPaths = ref<string[]>([]);
const viewportWidth = ref(typeof window === 'undefined' ? 0 : window.innerWidth);
const viewportHeight = ref(typeof window === 'undefined' ? 0 : window.innerHeight);
const externalEditorPath = ref('');
const cleanupExternalDraftsOnClose = ref(false);
const syncSelectedKeys = ref<string[]>([]);
const permissionDialogVisible = ref(false);
const permissionDialogTargetPath = ref('');
const permissionDialogTargetLabel = ref('');
const permissionDialogSessionId = ref('');
const permissionModeInput = ref('644');
const permissionMatrix = ref([
  { key: 'owner', label: '所有者', read: true, write: true, execute: false },
  { key: 'group', label: '用户组', read: true, write: false, execute: false },
  { key: 'others', label: '其他人', read: true, write: false, execute: false },
]);
const scheduleForm = ref<UpsertFtpScheduledTaskInput>({
  label: '',
  profileId: '',
  direction: 'upload',
  localPath: '',
  remotePath: '',
  scheduleType: 'once',
  conflictPolicy: 'skip',
  enabled: true,
  includeSubdirectories: true,
  intervalHours: 1,
  timeOfDay: '09:00',
  dayOfWeek: 1,
  cronExpression: '0 2 * * *',
});
const pendingRemoteRefreshTargets = new Map<string, RemoteRefreshTarget>();
let remoteRefreshTimer: number | null = null;
let transferTaskRefreshWatcherInitialized = false;
let transferTaskListWatcherInitialized = false;

const taskSortOptions = [
  { label: '创建时间', value: 'createdAt' },
  { label: '文件名', value: 'fileName' },
  { label: '文件大小', value: 'fileSize' },
  { label: '状态', value: 'status' },
  { label: '优先级', value: 'priority' },
];

const ftpWorkspaceLayoutOptions: Array<{ label: string; value: TerminalLayoutMode }> = [
  { label: '标签布局', value: 'tabbed' },
  { label: '水平分屏', value: 'split-horizontal' },
  { label: '垂直分屏', value: 'split-vertical' },
  { label: '主从布局', value: 'master-stack' },
  { label: '递减布局', value: 'dwindle' },
  { label: '网格布局', value: 'grid' },
];

const {
  profileDialogVisible,
  folderDialogVisible,
  passwordDialogVisible,
  authChallengeDialogVisible,
  entryNameDialogVisible,
  editingProfileId,
  editingFolderId,
  pendingConnectProfile,
  pendingAuthChallenge,
  connectPassword,
  authChallengeResponses,
  entryNameDialogTitle,
  entryNameDialogLabel,
  entryNameDialogConfirmText,
  entryNameDialogValue,
  entryNameDialogPlaceholder,
  profileForm,
  folderForm,
  protocolOptions,
  authTypeOptions,
  sshProfileEnabled,
  sshProfileLabel,
  sshProfileOptions,
  applySshProfile,
  openCreateDialog,
  openCreateFolderDialog,
  openEditDialog,
  openEditFolderDialog,
  initializePage,
  saveProfile,
  saveFolder,
  removeFolder,
  removeProfile,
  connectProfile: connectProfileBase,
  submitPasswordConnect: submitPasswordConnectBase,
  cancelPasswordPrompt: cancelPasswordPromptBase,
  submitAuthChallenge: submitAuthChallengeBase,
  cancelAuthChallenge: cancelAuthChallengeBase,
  requestEntryName,
  submitEntryNameDialog,
  cancelEntryNameDialog,
} = useFtpConfigFlow({
  ftpStore,
  busyMessage,
  actionError,
  showConfirm,
  changeRemotePermissions,
});
const processingPendingOpenRequest = ref(false);
const handledFtpConnectionLayoutRequestIds = new Set<string>();
const selectedConnectionLayoutId = ref('');

function findSftpProfileForPendingOpenRequest(request: PendingSshOpenRequest) {
  const requestHost = request.host.toLowerCase();
  const requestUser = request.username.toLowerCase();
  return ftpStore.profiles.find((profile) => (
    profile.protocol.toLowerCase() === 'sftp'
    && (
      profile.sshProfileId === request.sshProfileId
      || (
        profile.host.toLowerCase() === requestHost
        && profile.username.toLowerCase() === requestUser
      )
    )
  )) ?? null;
}

async function ensureSftpProfileForPendingOpenRequest(request: PendingSshOpenRequest) {
  const existing = findSftpProfileForPendingOpenRequest(request);
  if (existing) return existing;

  const baseLabel = `${request.label} · SFTP`;
  const label = ftpStore.profiles.some((profile) => profile.label === baseLabel)
    ? `${baseLabel} (${request.host})`
    : baseLabel;

  return ftpStore.createProfile({
    label,
    protocol: 'sftp',
    host: request.host,
    port: request.port,
    username: request.username,
    authType: request.authType,
    savePassword: request.savePassword,
    privateKeyPath: request.privateKeyPath,
    certificatePath: request.certificatePath,
    hostCaKeyPath: request.hostCaKeyPath,
    sshProfileId: request.sshProfileId,
    defaultRemotePath: request.remotePath || '/',
    defaultLocalPath: ftpStore.localPath || '',
    maxConcurrent: 2,
  });
}

async function processPendingProfileOpenRequest(request: PendingProfileOpenRequest) {
  let targetProfile = ftpStore.profiles.find((profile) => profile.id === request.profileId) ?? null;
  if (!targetProfile) {
    await ftpStore.refreshProfiles();
    targetProfile = ftpStore.profiles.find((profile) => profile.id === request.profileId) ?? null;
  }
  if (!targetProfile) {
    throw new Error(`未找到传输配置：${request.label || request.profileId}`);
  }

  const targetPath = request.remotePath || targetProfile.defaultRemotePath || '/';
  const existingSession = ftpStore.sessions.find((session) => session.profileId === targetProfile.id) ?? null;
  if (existingSession) {
    ftpStore.focusSession(existingSession.sessionId, targetPath || existingSession.remoteRoot);
    if (targetPath && targetPath !== (ftpStore.remotePath || existingSession.remoteRoot)) {
      busyMessage.value = `正在打开 ${targetPath}...`;
      await refreshPrimaryRemoteDirectory(targetPath);
    }
    ftpStore.clearPendingOpenRequest(request.requestId);
    return;
  }

  await connectProfile(targetProfile);

  const connectedSession = ftpStore.sessions.find((session) => session.profileId === targetProfile.id) ?? null;
  if (!connectedSession) {
    return;
  }

  ftpStore.focusSession(connectedSession.sessionId, targetPath || connectedSession.remoteRoot);
  if (targetPath && targetPath !== connectedSession.remoteRoot) {
    busyMessage.value = `正在打开 ${targetPath}...`;
    await refreshPrimaryRemoteDirectory(targetPath);
  }
  ftpStore.clearPendingOpenRequest(request.requestId);
}

async function processPendingOpenRequest() {
  const request = ftpStore.pendingOpenRequest;
  if (!request || route.name !== 'FileTransfer' || processingPendingOpenRequest.value) return;

  processingPendingOpenRequest.value = true;
  actionError.value = '';

  try {
    busyMessage.value = `正在打开 ${request.label}...`;
    if (request.source === 'profile') {
      await processPendingProfileOpenRequest(request);
      return;
    }

    const targetProfile = await ensureSftpProfileForPendingOpenRequest(request);
    const existingSession = ftpStore.sessions.find((session) => session.profileId === targetProfile.id) ?? null;

    if (existingSession) {
      ftpStore.focusSession(existingSession.sessionId, request.remotePath || existingSession.remoteRoot);
      if (request.remotePath && request.remotePath !== (ftpStore.remotePath || existingSession.remoteRoot)) {
        busyMessage.value = `正在打开 ${request.remotePath}...`;
        await refreshPrimaryRemoteDirectory(request.remotePath);
      }
      ftpStore.clearPendingOpenRequest(request.requestId);
      return;
    }

    await connectProfile(targetProfile);

    const connectedSession = ftpStore.sessions.find((session) => session.profileId === targetProfile.id) ?? null;
    if (!connectedSession) {
      return;
    }

    ftpStore.focusSession(connectedSession.sessionId, request.remotePath || connectedSession.remoteRoot);
    if (request.remotePath && request.remotePath !== connectedSession.remoteRoot) {
      busyMessage.value = `正在打开 ${request.remotePath}...`;
      await refreshPrimaryRemoteDirectory(request.remotePath);
    }
    ftpStore.clearPendingOpenRequest(request.requestId);
  } catch (error) {
    handleFtpOperationError(error);
  } finally {
    processingPendingOpenRequest.value = false;
    if (!ftpStore.pendingOpenRequest) {
      busyMessage.value = '';
    }
  }
}

async function processFtpConnectionLayoutOpenRequest() {
  if (route.name !== 'FileTransfer') return;
  const requestId = typeof route.query.openConnectionLayoutRequestId === 'string'
    ? route.query.openConnectionLayoutRequestId
    : '';
  const layoutId = typeof route.query.openConnectionLayoutId === 'string'
    ? route.query.openConnectionLayoutId
    : '';
  if (!requestId || !layoutId || handledFtpConnectionLayoutRequestIds.has(requestId)) return;

  handledFtpConnectionLayoutRequestIds.add(requestId);
  await openFtpConnectionLayout(layoutId);
}

const sortedTransferTasks = computed(() =>
  [...ftpStore.transferTasks].sort((left, right) =>
    compareTaskValues(left, right, taskSortKey.value, taskSortDirection.value),
  ),
);
const activeTaskCount = computed(() =>
  ftpStore.transferTasks.filter((task) => ['pending', 'retrying', 'transferring'].includes(task.status)).length,
);
const pausedTaskCount = computed(() =>
  ftpStore.transferTasks.filter((task) => task.status === 'paused').length,
);
const completedTaskCount = computed(() =>
  ftpStore.transferTasks.filter((task) => task.status === 'completed').length,
);
const failedTaskCount = computed(() =>
  ftpStore.transferTasks.filter((task) => task.status === 'failed').length,
);
const isDenseViewport = computed(() => viewportHeight.value > 0 && (viewportHeight.value < 980 || viewportWidth.value < 1480));
const useAuxDockTabs = computed(() => showLogPanel.value);
const showQueuePanelInDock = computed(() => auxDockActiveTab.value === 'queue');
const showLogPanelInDock = computed(() => auxDockActiveTab.value === 'log');
const activeSession = computed(() => ftpStore.activeSession);
const {
  localPathInput,
  remotePathInput,
  localFilterQuery,
  remoteFilterQuery,
  localSortKey,
  remoteSortKey,
  localSortDirection,
  remoteSortDirection,
  localSearchExpanded,
  remoteSearchExpanded,
  localRuleFilterExpanded,
  remoteRuleFilterExpanded,
  localRuleFilter,
  remoteRuleFilter,
  localFilterPresetId,
  remoteFilterPresetId,
  filteredLocalEntries,
  filteredRemoteEntries,
  currentLocalWorkspaceBookmarked,
  currentRemoteWorkspaceBookmarked,
  localWorkspaceSelectValue,
  localWorkspaceOptions,
  localWorkspaceBookmarkValues,
  remoteWorkspaceSelectValue,
  remoteWorkspaceOptions,
  remoteWorkspaceBookmarkValues,
  localPathSuggestions,
  remotePathSuggestions,
  localFilterSummary,
  remoteFilterSummary,
  filterPresetOptions,
  toggleRuleFilter,
  setRuleFilterMode,
  setRuleFilterOperator,
  toggleHideHidden,
  resetRuleFilter,
  saveFilterPreset,
  applyFilterPreset,
  deleteSelectedFilterPreset,
  switchLocalWorkspace,
  switchRemoteWorkspace,
  addCurrentLocalWorkspace,
  pickLocalWorkspace,
  removeCurrentLocalWorkspace,
  addCurrentRemoteWorkspace,
  removeCurrentRemoteWorkspace,
  openLocalPath,
  openRemotePath,
  toggleSearch,
  setPanelSortKey,
  togglePanelSortDirection,
} = useFtpBrowserState({
  ftpStore,
  activeSession,
  requestEntryName,
  showConfirm,
});
const {
  localDropActive,
  remoteDropActive,
  localSelectedPaths,
  remoteSelectedPaths,
  selectedLocalEntries,
  selectedRemoteEntries,
  selectedLocalEntry,
  selectedRemoteEntry,
  canUpload,
  canDownload,
  uploadActionLabel,
  downloadActionLabel,
  clearLocalSelection,
  clearRemoteSelection,
  selectAllLocalEntries,
  selectAllRemoteEntries,
  handleLocalMarqueeSelect,
  handleRemoteMarqueeSelect,
  handleLocalEntryClick,
  handleRemoteEntryClick,
  handlePanelListContextMenu,
  handleEntryContextMenu,
  openLocalEntry,
  openRemoteEntry,
  goLocalParent,
  goRemoteParent,
  createLocalDirectory,
  createRemoteDirectory,
  uploadSelected,
  downloadSelected,
  handleLocalDragStart,
  handleRemoteDragStart,
  handleRemoteDragEnter,
  handleRemoteDragOver,
  handleRemoteDragLeave,
  handleRemoteDrop,
  handleLocalDragEnter,
  handleLocalDragOver,
  handleLocalDragLeave,
  handleLocalDrop,
  handleEntryDragEnd,
} = useFtpPanelInteractions({
  ftpStore,
  activeSession,
  linkNavigationEnabled,
  filteredLocalEntries,
  filteredRemoteEntries,
  localSortKey,
  remoteSortKey,
  localSortDirection,
  remoteSortDirection,
  busyMessage,
  setPanelSortKey,
  togglePanelSortDirection,
  openContextMenu,
  requestEntryName,
  showConfirm,
  changeRemotePermissions,
  pasteClipboardToRemote,
  copySelectionInfo,
  canOpenTerminalForPanel,
  openTerminalForPanel,
  canPreviewLocalImage: canPreviewLocalImageEntry,
  previewLocalImage,
  canPreviewRemoteImage: canPreviewRemoteImageEntry,
  previewRemoteImage,
  canPreviewRemoteText: canPreviewRemoteTextEntry,
  previewRemoteText,
  canOpenInternalEditor,
  openInternalEditor,
  canOpenExternalEditor,
  openExternalEditor: openExternalEditorForEntry,
  prepareRemoteDragExport: (sessionId, remotePaths) => window.ftpApi.prepareRemoteDragExport(sessionId, remotePaths),
  startPreparedDrag: (localPaths) => window.ftpApi.startPreparedDrag(localPaths.map((localPath) => String(localPath))),
  copyLocalPathsToCurrentLocal: async (paths) => {
    for (const sourcePath of paths) {
      await window.ftpApi.copyLocalPath(sourcePath, joinLocalPath(ftpStore.localPath, baseName(sourcePath)));
    }
    await ftpStore.refreshLocalDirectory(ftpStore.localPath);
  },
});
const activeFtpProfile = computed(() =>
  activeSession.value
    ? ftpStore.profiles.find((profile) => profile.id === activeSession.value?.profileId) ?? null
    : null,
);
const disconnectedSessionProfile = computed(() =>
  disconnectedSessionNotice.value
    ? ftpStore.profiles.find((profile) => profile.id === disconnectedSessionNotice.value?.profileId) ?? null
    : null,
);
const canEditRemoteFile = computed(() => {
  const pane = activeFtpWorkspacePane();
  return Boolean(pane?.kind === 'remote' && isEditableTextEntry(selectedActivePaneEntry.value));
});
const canPreviewRemoteImage = computed(() => canPreviewRemoteImageEntry(selectedRemoteEntry.value));
const canPreviewRemoteText = computed(() => {
  const pane = activeFtpWorkspacePane();
  return Boolean(pane?.kind === 'remote' && canPreviewRemoteTextEntry(selectedActivePaneEntry.value));
});
const selectedActivePaneEntries = computed(() => {
  const pane = activeFtpWorkspacePane();
  if (!pane) return [];
  const selected = new Set(pane.selectedPaths);
  return ftpPaneFilteredEntries(pane).filter((entry) => selected.has(entry.path));
});
const selectedActivePaneEntry = computed(() => selectedActivePaneEntries.value[0] ?? null);
const activeRemoteWorkspacePane = computed(() => {
  const pane = activeFtpWorkspacePane();
  return pane?.kind === 'remote' ? pane : null;
});
const canPreviewActiveImage = computed(() => {
  const pane = activeFtpWorkspacePane();
  if (!pane) return false;
  return pane.kind === 'local'
    ? canPreviewLocalImageEntry(selectedActivePaneEntry.value)
    : canPreviewRemoteImageEntry(selectedActivePaneEntry.value);
});
const canChmodRemoteFile = computed(() => {
  const pane = activeFtpWorkspacePane();
  return Boolean(pane?.kind === 'remote' && pane.sessionId && selectedActivePaneEntry.value);
});
function resolveTerminalOpenTarget(panel: ActiveBrowserPanel = activeBrowserPanel.value): TerminalOpenTarget | null {
  const pane = findFtpWorkspacePane(panel);
  if (pane?.kind === 'local') {
    return pane.path ? { kind: 'local', path: pane.path } : null;
  }
  if (pane?.kind === 'remote') {
    const session = pane.sessionId ? ftpStore.sessions.find((item) => item.sessionId === pane.sessionId) ?? null : null;
    const profile = session ? ftpStore.profiles.find((item) => item.id === session.profileId) ?? null : null;
    if (!session || !profile?.sshProfileId) return null;
    return {
      kind: 'ssh',
      sshProfileId: profile.sshProfileId,
      path: pane.path || session.remoteRoot || '/',
    };
  }

  const localPane = panel === 'local' ? findFirstFtpPane('local') : null;
  if (localPane?.path) {
    return { kind: 'local', path: localPane.path };
  }

  if (!activeSession.value || !activeFtpProfile.value?.sshProfileId) return null;
  return {
    kind: 'ssh',
    sshProfileId: activeFtpProfile.value.sshProfileId,
    path: ftpStore.remotePath || activeSession.value.remoteRoot || '/',
  };
}
const terminalOpenTarget = computed<TerminalOpenTarget | null>(() => resolveTerminalOpenTarget());
const terminalOpenTooltip = computed(() => {
  const target = terminalOpenTarget.value;
  if (target) {
    return target.kind === 'local'
      ? `在本地终端中打开：${target.path}`
      : `在 SSH 终端中打开：${target.path}`;
  }
  if (activeFtpWorkspacePane()?.kind === 'local') return '当前本地目录不可用';
  return '当前远程连接未绑定 SSH Profile';
});
const canOpenTerminalFromFtp = computed(() => Boolean(terminalOpenTarget.value));

function setActiveBrowserPanel(panel: ActiveBrowserPanel) {
  activeBrowserPanel.value = panel;
  const pane = findFtpWorkspacePane(panel);
  if (!pane) return;
  if (pane.kind === 'remote' && pane.sessionId) {
    ftpStore.focusSession(pane.sessionId, pane.path);
  } else if (pane.kind === 'local') {
    void ftpStore.refreshLocalDirectory(pane.path);
  }
}

function focusRemoteWorkspacePane(sessionId: string) {
  const paneKey = makeRemotePaneKey(sessionId);
  const existingPane = findFtpWorkspacePane(paneKey);
  if (existingPane) {
    setActiveBrowserPanel(existingPane.key);
    return;
  }
  const session = ftpStore.sessions.find((item) => item.sessionId === sessionId) ?? null;
  if (!session) return;
  const pane = createRemoteWorkspacePane(session, session.remoteRoot);
  ftpWorkspacePanes.value = [...ftpWorkspacePanes.value, pane];
  setActiveBrowserPanel(pane.key);
  void refreshFtpWorkspacePaneDirectory(pane.key, pane.path);
}

function resolveRemotePasteTarget(panel = activeBrowserPanel.value) {
  const pane = findFtpWorkspacePane(panel);
  if (!pane || pane.kind !== 'remote' || !pane.sessionId) return null;
  const session = ftpStore.sessions.find((item) => item.sessionId === pane.sessionId) ?? null;
  if (!session) return null;
  return {
    panel: pane.key,
    sessionId: session.sessionId,
    remoteRoot: session.remoteRoot,
    remotePath: pane.path || session.remoteRoot,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isFtpSessionClosedError(error: unknown) {
  return /session closed|connection closed|not connected|broken pipe|connection reset/i.test(errorMessage(error));
}

function noticeDisconnectedSession(error: unknown, session = activeSession.value, remotePath = ftpStore.remotePath) {
  if (!isFtpSessionClosedError(error)) return false;

  const message = errorMessage(error);
  const targetSession = session ?? activeSession.value;
  disconnectedSessionNotice.value = {
    sessionId: targetSession?.sessionId ?? '',
    profileId: targetSession?.profileId ?? '',
    label: targetSession?.profileLabel ?? 'FTP 连接',
    remotePath: remotePath || targetSession?.remoteRoot || '/',
    message,
  };
  actionError.value = '';
  return true;
}

function handleFtpOperationError(error: unknown, session = activeSession.value, remotePath = ftpStore.remotePath) {
  if (noticeDisconnectedSession(error, session, remotePath)) return;
  actionError.value = errorMessage(error);
  notifyError(error, 'FTP 操作失败');
}

function handleUnhandledFtpRejection(event: PromiseRejectionEvent) {
  if (!isFtpSessionClosedError(event.reason)) return;
  event.preventDefault();
  noticeDisconnectedSession(event.reason);
}

async function reconnectDisconnectedSession() {
  const notice = disconnectedSessionNotice.value;
  const profile = disconnectedSessionProfile.value;
  if (!notice || !profile) {
    actionError.value = '找不到原连接配置，无法自动重连。请从左侧配置列表重新连接。';
    return;
  }

  reconnectingDisconnectedSession.value = true;
  actionError.value = '';
  const stalePaneKey = notice.sessionId ? makeRemotePaneKey(notice.sessionId) : undefined;
  const previousSessionIds = new Set(ftpStore.sessions.map((session) => session.sessionId));
  const pendingKey = ensureConnectingRemoteWorkspacePane(profile, {
    replaceKey: stalePaneKey,
    path: notice.remotePath || '/',
    message: `正在重连 ${notice.label}...`,
  });
  try {
    if (notice.sessionId && ftpStore.sessions.some((session) => session.sessionId === notice.sessionId)) {
      try {
        await ftpStore.disconnect(notice.sessionId);
      } catch {
        // The backend may already have closed the stale session; reconnecting can continue.
      }
    }
    await connectProfileBase(profile);
    completeConnectingRemoteWorkspacePane(profile, pendingKey, previousSessionIds, notice.remotePath);
    disconnectedSessionNotice.value = null;
  } catch (error) {
    actionError.value = errorMessage(error);
    updateFtpWorkspacePane(pendingKey, {
      connectionMessage: errorMessage(error),
    });
  } finally {
    reconnectingDisconnectedSession.value = false;
  }
}

async function refreshPrimaryRemoteDirectory(path = ftpStore.remotePath) {
  const session = activeSession.value;
  try {
    await ftpStore.refreshRemoteDirectory(path);
  } catch (error) {
    handleFtpOperationError(error, session, path);
  }
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(element.closest(
    'input, textarea, select, [contenteditable], [role="textbox"], .cm-editor, .cm-content',
  ));
}

function shouldIgnoreExplorerShortcut(target: EventTarget | null) {
  return isEditableKeyboardTarget(target)
    || remoteEditorDialogVisible.value
    || remotePreviewDialogVisible.value
    || scheduleDialogVisible.value
    || permissionDialogVisible.value
    || profileDialogVisible.value
    || folderDialogVisible.value
    || passwordDialogVisible.value
    || authChallengeDialogVisible.value
    || entryNameDialogVisible.value
    || syncPanelVisible.value;
}

function isExplorerPasteShortcut(event: KeyboardEvent) {
  const pasteByModifier = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'v';
  const pasteByInsert = event.key === 'Insert' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
  return pasteByModifier || pasteByInsert;
}

function handleExplorerPasteShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || !isExplorerPasteShortcut(event)) return;
  if (shouldIgnoreExplorerShortcut(event.target)) return;
  const target = resolveRemotePasteTarget();
  if (!target) return;
  event.preventDefault();
  void pasteClipboardToRemote(target.panel);
}

function isExplorerSelectAllShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase() === 'a';
}

function selectAllActiveBrowserEntries() {
  const pane = activeFtpWorkspacePane();
  if (!pane) return;
  selectAllFtpPaneEntries(pane);
}

function handleExplorerSelectAllShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || !isExplorerSelectAllShortcut(event)) return;
  if (shouldIgnoreExplorerShortcut(event.target)) return;
  event.preventDefault();
  selectAllActiveBrowserEntries();
}
const {
  thumbnailUrlFor,
  isThumbnailLoading,
} = useFtpThumbnails({
  ftpStore,
  filteredLocalEntries,
  filteredRemoteEntries,
  workspacePanes: computed(() => ftpWorkspacePanes.value.map((pane) => ({
    kind: pane.kind,
    sessionId: pane.sessionId,
    entries: ftpPaneFilteredEntries(pane),
  }))),
});
function makeLocalPaneKey() {
  localWorkspacePaneCounter.value += 1;
  return `local:${localWorkspacePaneCounter.value}`;
}

function makeRemotePaneKey(sessionId: string) {
  return `remote:${sessionId}`;
}

function createLocalWorkspacePane(path: string): FtpWorkspacePane {
  const key = makeLocalPaneKey();
  return {
    key,
    kind: 'local',
    title: localWorkspacePaneCounter.value === 1 ? '本地连接' : `本地连接 ${localWorkspacePaneCounter.value}`,
    path,
    pathInput: path,
    entries: [],
    selectedPaths: [],
    lastSelectedIndex: -1,
    loading: false,
    viewMode: localPanelViewMode.value,
  };
}

function createRemoteWorkspacePane(session: NonNullable<typeof activeSession.value>, path?: string): FtpWorkspacePane {
  const nextPath = path || session.remoteRoot || '/';
  return {
    key: makeRemotePaneKey(session.sessionId),
    kind: 'remote',
    title: session.profileLabel,
    sessionId: session.sessionId,
    profileId: session.profileId,
    protocol: session.protocol,
    path: nextPath,
    pathInput: nextPath,
    entries: [],
    selectedPaths: [],
    lastSelectedIndex: -1,
    loading: false,
    viewMode: remotePanelViewMode.value,
  };
}

function makePendingRemotePaneKey(profileId: string) {
  return `remote-pending:${profileId}`;
}

function createConnectingRemoteWorkspacePane(
  profile: FtpProfile,
  path = '/',
  message = '正在建立连接...',
): FtpWorkspacePane {
  const nextPath = path || '/';
  return {
    key: makePendingRemotePaneKey(profile.id),
    kind: 'remote',
    title: profile.label,
    profileId: profile.id,
    protocol: profile.protocol,
    connectionState: 'connecting',
    connectionMessage: message,
    path: nextPath,
    pathInput: nextPath,
    entries: [],
    selectedPaths: [],
    lastSelectedIndex: -1,
    loading: false,
    viewMode: remotePanelViewMode.value,
  };
}

function updateFtpWorkspacePane(key: string, patch: Partial<FtpWorkspacePane>) {
  ftpWorkspacePanes.value = ftpWorkspacePanes.value.map((pane) => (
    pane.key === key ? { ...pane, ...patch } : pane
  ));
}

function findFtpWorkspacePane(key = activeBrowserPanel.value) {
  return ftpWorkspacePanes.value.find((pane) => pane.key === key) ?? null;
}

function activeFtpWorkspacePane() {
  return findFtpWorkspacePane();
}

function ftpPaneDisconnectedNotice(pane: FtpWorkspacePane) {
  if (!disconnectedSessionNotice.value || pane.kind !== 'remote') return null;
  if (pane.sessionId && disconnectedSessionNotice.value.sessionId === pane.sessionId) {
    return disconnectedSessionNotice.value;
  }
  if (!pane.sessionId && pane.profileId && disconnectedSessionNotice.value.profileId === pane.profileId) {
    return disconnectedSessionNotice.value;
  }
  return null;
}

function findFirstFtpPane(kind: PanelKind) {
  return ftpWorkspacePanes.value.find((pane) => pane.kind === kind) ?? null;
}

function ensureConnectingRemoteWorkspacePane(
  profile: FtpProfile,
  options: { replaceKey?: string; path?: string; message?: string } = {},
) {
  const pendingKey = makePendingRemotePaneKey(profile.id);
  const pane = createConnectingRemoteWorkspacePane(profile, options.path, options.message);
  const panes = [...ftpWorkspacePanes.value];
  const replaceIndex = options.replaceKey
    ? panes.findIndex((item) => item.key === options.replaceKey)
    : panes.findIndex((item) => item.key === pendingKey);
  if (replaceIndex >= 0) {
    panes.splice(replaceIndex, 1, pane);
  } else {
    panes.push(pane);
  }
  ftpWorkspacePanes.value = panes;
  activeBrowserPanel.value = pendingKey;
  return pendingKey;
}

function removePendingRemoteWorkspacePane(profileId: string | undefined) {
  if (!profileId) return;
  const pendingKey = makePendingRemotePaneKey(profileId);
  const wasActive = activeBrowserPanel.value === pendingKey;
  ftpWorkspacePanes.value = ftpWorkspacePanes.value.filter((pane) => pane.key !== pendingKey);
  if (wasActive) {
    activeBrowserPanel.value = ftpWorkspacePanes.value[0]?.key ?? '';
  }
}

function completeConnectingRemoteWorkspacePane(
  profile: FtpProfile,
  pendingKey: string,
  previousSessionIds: Set<string>,
  preferredPath?: string,
) {
  const nextSession = [...ftpStore.sessions]
    .reverse()
    .find((session) => session.profileId === profile.id && !previousSessionIds.has(session.sessionId))
    ?? [...ftpStore.sessions].reverse().find((session) => session.profileId === profile.id)
    ?? null;
  if (!nextSession) return false;

  const pane = createRemoteWorkspacePane(nextSession, preferredPath || nextSession.remoteRoot);
  const pendingIndex = ftpWorkspacePanes.value.findIndex((item) => item.key === pendingKey);
  if (pendingIndex >= 0) {
    const panes = [...ftpWorkspacePanes.value];
    panes.splice(pendingIndex, 1, pane);
    ftpWorkspacePanes.value = panes;
  } else if (!findFtpWorkspacePane(pane.key)) {
    ftpWorkspacePanes.value = [...ftpWorkspacePanes.value, pane];
  }
  setActiveBrowserPanel(pane.key);
  void refreshFtpWorkspacePaneDirectory(pane.key, pane.path);
  return true;
}

async function connectProfile(
  profile: FtpProfile,
  password?: string,
  authSessionId?: string,
  challengeResponses?: string[],
) {
  const previousSessionIds = new Set(ftpStore.sessions.map((session) => session.sessionId));
  const pendingKey = ensureConnectingRemoteWorkspacePane(profile, {
    message: `正在连接 ${profile.label}...`,
  });
  await connectProfileBase(profile, password, authSessionId, challengeResponses);
  if (passwordDialogVisible.value || authChallengeDialogVisible.value) return;
  const completed = completeConnectingRemoteWorkspacePane(profile, pendingKey, previousSessionIds);
  if (!completed) {
    removePendingRemoteWorkspacePane(profile.id);
  }
}

async function submitPasswordConnect() {
  const profile = pendingConnectProfile.value;
  const previousSessionIds = new Set(ftpStore.sessions.map((session) => session.sessionId));
  const pendingKey = profile
    ? ensureConnectingRemoteWorkspacePane(profile, { message: `正在连接 ${profile.label}...` })
    : '';
  await submitPasswordConnectBase();
  if (!profile || authChallengeDialogVisible.value) return;
  const completed = completeConnectingRemoteWorkspacePane(profile, pendingKey, previousSessionIds);
  if (!completed) {
    removePendingRemoteWorkspacePane(profile.id);
  }
}

function cancelPasswordPrompt() {
  const profileId = pendingConnectProfile.value?.id;
  cancelPasswordPromptBase();
  removePendingRemoteWorkspacePane(profileId);
}

async function submitAuthChallenge() {
  const profile = pendingAuthChallenge.value
    ? ftpStore.profiles.find((item) => item.id === pendingAuthChallenge.value?.profileId) ?? null
    : null;
  const previousSessionIds = new Set(ftpStore.sessions.map((session) => session.sessionId));
  const pendingKey = profile
    ? ensureConnectingRemoteWorkspacePane(profile, { message: `正在连接 ${profile.label}...` })
    : '';
  await submitAuthChallengeBase();
  if (!profile) return;
  const completed = completeConnectingRemoteWorkspacePane(profile, pendingKey, previousSessionIds);
  if (!completed) {
    removePendingRemoteWorkspacePane(profile.id);
  }
}

function cancelAuthChallenge() {
  const profileId = pendingAuthChallenge.value?.profileId;
  void cancelAuthChallengeBase();
  removePendingRemoteWorkspacePane(profileId);
}

async function refreshFtpWorkspacePaneDirectory(key: string, path?: string) {
  const pane = findFtpWorkspacePane(key);
  if (!pane) return;
  const nextPath = path || pane.path;
  updateFtpWorkspacePane(key, { loading: true });
  try {
    if (pane.kind === 'local') {
      const targetPath = nextPath || await window.ftpApi.getDefaultLocalPath();
      const entries = await window.ftpApi.listLocalDirectory(targetPath);
      updateFtpWorkspacePane(key, {
        path: targetPath,
        pathInput: targetPath,
        entries,
        selectedPaths: [],
        lastSelectedIndex: -1,
        loading: false,
      });
      if (activeBrowserPanel.value === key) {
        await ftpStore.refreshLocalDirectory(targetPath);
      }
      return;
    }

    if (!pane.sessionId) return;
    const session = ftpStore.sessions.find((item) => item.sessionId === pane.sessionId) ?? null;
    const targetPath = nextPath || session?.remoteRoot || '/';
    const entries = await window.ftpApi.listRemoteDirectory(pane.sessionId, targetPath);
    updateFtpWorkspacePane(key, {
      path: targetPath,
      pathInput: targetPath,
      entries,
      selectedPaths: [],
      lastSelectedIndex: -1,
      loading: false,
    });
    if (activeBrowserPanel.value === key) {
      ftpStore.focusSession(pane.sessionId, targetPath);
    }
  } catch (error) {
    updateFtpWorkspacePane(key, { loading: false });
    const session = pane.sessionId
      ? ftpStore.sessions.find((item) => item.sessionId === pane.sessionId) ?? null
      : null;
    handleFtpOperationError(error, session, nextPath);
  }
}

async function addLocalWorkspacePane(path = ftpStore.localPath) {
  const nextPath = path || await window.ftpApi.getDefaultLocalPath();
  const pane = createLocalWorkspacePane(nextPath);
  ftpWorkspacePanes.value = [...ftpWorkspacePanes.value, pane];
  activeBrowserPanel.value = pane.key;
  await refreshFtpWorkspacePaneDirectory(pane.key, nextPath);
}

function ensureRemoteWorkspacePanes() {
  if (!ftpWorkspaceRemoteRestoreReady.value && !ftpWorkspacePanes.value.length) return;
  const sessionById = new Map(ftpStore.sessions.map((session) => [session.sessionId, session]));
  const connectedProfileIds = new Set(ftpStore.sessions.map((session) => session.profileId));
  const nextPanes = ftpWorkspacePanes.value
    .map((pane) => {
      if (pane.kind === 'local') return pane;
      if (pane.connectionState === 'connecting') {
        return !pane.profileId || !connectedProfileIds.has(pane.profileId) ? pane : null;
      }
      if (!pane.sessionId) return pane;
      const session = sessionById.get(pane.sessionId);
      if (!session) return null;
      return {
        ...pane,
        title: session.profileLabel,
        profileId: session.profileId,
        protocol: session.protocol,
      };
    })
    .filter((pane): pane is FtpWorkspacePane => Boolean(pane));
  const representedSessionIds = new Set(
    nextPanes
      .filter((pane) => pane.kind === 'remote' && pane.sessionId)
      .map((pane) => pane.sessionId),
  );
  const appendedRemotePanes = ftpStore.sessions
    .filter((session) => !representedSessionIds.has(session.sessionId))
    .map((session) => createRemoteWorkspacePane(session, session.remoteRoot));
  ftpWorkspacePanes.value = [...nextPanes, ...appendedRemotePanes];
  if (activeBrowserPanel.value && !findFtpWorkspacePane(activeBrowserPanel.value)) {
    activeBrowserPanel.value = appendedRemotePanes[0]?.key ?? ftpWorkspacePanes.value[0]?.key ?? '';
  }
  for (const pane of ftpWorkspacePanes.value) {
    if (pane.kind !== 'remote' || !pane.sessionId) continue;
    if (!pane.entries.length && !pane.loading) {
      void refreshFtpWorkspacePaneDirectory(pane.key, pane.path);
    }
  }
}

async function ensureInitialFtpWorkspacePanes() {
  if (!ftpWorkspacePanes.value.some((pane) => pane.kind === 'local')) {
    await addLocalWorkspacePane(ftpStore.localPath);
  }
  ftpWorkspaceRemoteRestoreReady.value = true;
  ensureRemoteWorkspacePanes();
  if (!activeBrowserPanel.value && ftpWorkspacePanes.value.length) {
    activeBrowserPanel.value = ftpWorkspacePanes.value[0].key;
  }
}

function removeFtpWorkspacePane(key: string) {
  const pane = findFtpWorkspacePane(key);
  if (!pane) return;
  ftpWorkspacePanes.value = ftpWorkspacePanes.value.filter((item) => item.key !== key);
  if (pane.kind === 'remote' && pane.sessionId) {
    void disconnectSession(pane.sessionId);
  }
  if (activeBrowserPanel.value === key) {
    activeBrowserPanel.value = ftpWorkspacePanes.value[0]?.key ?? '';
  }
}

function startFtpPanePointerDrag(event: PointerEvent, pane: FtpWorkspacePane) {
  if (orderedFtpWorkspacePanes.value.length <= 1 || event.button !== 0) return;
  if (event.target instanceof Element) {
    const control = event.target.closest('button, input, textarea, select, a');
    if (control && control !== event.currentTarget) {
      return;
    }
  }

  const currentOrder = orderedFtpWorkspacePanes.value.map((item) => item.key);
  ftpPaneDragInteraction.value = {
    pointerId: event.pointerId,
    pane,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    originalOrder: currentOrder,
    previewOrder: currentOrder,
  };
  window.addEventListener('pointermove', handleFtpPanePointerMove, true);
  window.addEventListener('pointerup', finishFtpPanePointerDrag, true);
  window.addEventListener('pointercancel', cancelFtpPanePointerDrag, true);
}

function handleFtpPanePointerMove(event: PointerEvent) {
  const interaction = ftpPaneDragInteraction.value;
  if (!interaction || interaction.pointerId !== event.pointerId) return;

  const deltaX = event.clientX - interaction.startX;
  const deltaY = event.clientY - interaction.startY;
  if (!interaction.moved && Math.hypot(deltaX, deltaY) < 4) {
    return;
  }

  event.preventDefault();
  if (!interaction.moved) {
    interaction.moved = true;
    draggingFtpPaneKey.value = interaction.pane.key;
    dropTargetFtpPaneKey.value = interaction.pane.key;
    ftpPaneDragPreviewOrder.value = interaction.previewOrder;
    document.body.classList.add('terminal-pane-dragging-active');
  }

  updateFtpPaneDragPreview(event.clientX, event.clientY, interaction.pane);
  const dropTarget = findFtpPaneDropTargetAtPoint(event.clientX, event.clientY);
  if (!dropTarget) {
    interaction.previewOrder = interaction.originalOrder;
    ftpPaneDragPreviewOrder.value = interaction.previewOrder;
    dropTargetFtpPaneKey.value = '';
    return;
  }

  const nextOrder = dropTarget.key === draggingFtpPaneKey.value
    ? interaction.originalOrder
    : makePanePreviewOrder(
      interaction.originalOrder,
      draggingFtpPaneKey.value,
      dropTarget.key,
      dropTarget.insertAfter,
    );
  if (!areStringArraysEqual(nextOrder, interaction.previewOrder)) {
    interaction.previewOrder = nextOrder;
    ftpPaneDragPreviewOrder.value = nextOrder;
  }
  dropTargetFtpPaneKey.value = dropTarget.key;
}

function finishFtpPanePointerDrag(event: PointerEvent) {
  const interaction = ftpPaneDragInteraction.value;
  if (!interaction || interaction.pointerId !== event.pointerId) return;

  if (interaction.moved && interaction.previewOrder.length) {
    applyFtpWorkspacePaneOrder(interaction.previewOrder);
  }
  const shouldActivateOnly = !interaction.moved;
  const pane = interaction.pane;
  clearFtpPaneDragState();
  removeFtpPaneDragListeners();
  if (shouldActivateOnly) {
    setActiveBrowserPanel(pane.key);
  }
}

function cancelFtpPanePointerDrag() {
  clearFtpPaneDragState();
  removeFtpPaneDragListeners();
}

function removeFtpPaneDragListeners() {
  window.removeEventListener('pointermove', handleFtpPanePointerMove, true);
  window.removeEventListener('pointerup', finishFtpPanePointerDrag, true);
  window.removeEventListener('pointercancel', cancelFtpPanePointerDrag, true);
}

function clearFtpPaneDragState() {
  ftpPaneDragInteraction.value = null;
  ftpPaneDragPreviewOrder.value = [];
  draggingFtpPaneKey.value = '';
  dropTargetFtpPaneKey.value = '';
  ftpPaneDragPreview.value = {
    ...ftpPaneDragPreview.value,
    visible: false,
  };
  document.body.classList.remove('terminal-pane-dragging-active');
}

function updateFtpPaneDragPreview(clientX: number, clientY: number, pane?: FtpWorkspacePane) {
  const draggedPane = ftpWorkspacePanes.value.find((item) => item.key === draggingFtpPaneKey.value);
  const sourcePane = draggedPane ?? pane ?? null;
  ftpPaneDragPreview.value = {
    visible: true,
    left: clientX + 14,
    top: clientY + 14,
    title: sourcePane?.title ?? ftpPaneDragPreview.value.title,
    kind: sourcePane?.kind ?? ftpPaneDragPreview.value.kind,
  };
}

function ftpPaneKindLabel(kind: PanelKind | '') {
  if (kind === 'local') return '本地';
  if (kind === 'remote') return '远程';
  return '';
}

function findFtpPaneDropTargetAtPoint(clientX: number, clientY: number): { key: string; insertAfter: boolean } | null {
  const target = document.elementFromPoint(clientX, clientY);
  if (!(target instanceof Element)) return null;
  const paneElement = target.closest<HTMLElement>('[data-ftp-pane-key]');
  const key = paneElement?.dataset.ftpPaneKey ?? '';
  if (!key) return null;
  const rect = paneElement.getBoundingClientRect();
  const useHorizontalAxis = rect.width >= rect.height;
  const insertAfter = useHorizontalAxis
    ? clientX > rect.left + rect.width / 2
    : clientY > rect.top + rect.height / 2;
  return { key, insertAfter };
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

function persistRemoteSessionOrderFromFtpPanes() {
  const sessionIds = ftpWorkspacePanes.value
    .filter((pane) => pane.kind === 'remote' && pane.sessionId)
    .map((pane) => pane.sessionId as string);
  const currentSessionIds = ftpStore.sessions.map((session) => session.sessionId);
  if (sessionIds.length <= 1 || areStringArraysEqual(sessionIds, currentSessionIds)) return;
  void ftpStore.reorderSessions(sessionIds);
}

function applyFtpWorkspacePaneOrder(order: string[]) {
  const paneByKey = new Map(ftpWorkspacePanes.value.map((pane) => [pane.key, pane]));
  const ordered = order
    .map((key) => paneByKey.get(key))
    .filter((pane): pane is FtpWorkspacePane => Boolean(pane));
  const orderedKeys = new Set(ordered.map((pane) => pane.key));
  const appended = ftpWorkspacePanes.value.filter((pane) => !orderedKeys.has(pane.key));
  ftpWorkspacePanes.value = [...ordered, ...appended];
  persistRemoteSessionOrderFromFtpPanes();
}

function ftpPaneFilteredEntries(pane: FtpWorkspacePane) {
  const query = pane.kind === 'local' ? localFilterQuery.value : remoteFilterQuery.value;
  const ruleFilter = pane.kind === 'local' ? localRuleFilter : remoteRuleFilter;
  const sortKey = pane.kind === 'local' ? localSortKey.value : remoteSortKey.value;
  const sortDirection = pane.kind === 'local' ? localSortDirection.value : remoteSortDirection.value;
  return sortEntries(
    pane.entries.filter((entry) => matchesPanelFilter(entry, query, ruleFilter)),
    sortKey,
    sortDirection,
  );
}

function ftpPanePathSuggestions(pane: FtpWorkspacePane) {
  return buildPathSuggestions(pane.entries, pane.pathInput);
}

function ftpPaneBreadcrumbs(pane: FtpWorkspacePane) {
  return pane.kind === 'local' ? buildLocalBreadcrumbs(pane.path) : buildRemoteBreadcrumbs(pane.path || '/');
}

function ftpPaneFilterSummary(pane: FtpWorkspacePane) {
  return pane.kind === 'local' ? localFilterSummary.value : remoteFilterSummary.value;
}

function ftpPaneFilterQuery(pane: FtpWorkspacePane) {
  return pane.kind === 'local' ? localFilterQuery.value : remoteFilterQuery.value;
}

function ftpPaneRuleFilter(pane: FtpWorkspacePane) {
  return pane.kind === 'local' ? localRuleFilter : remoteRuleFilter;
}

function ftpPaneRuleFilterExpanded(pane: FtpWorkspacePane) {
  return pane.kind === 'local' ? localRuleFilterExpanded.value : remoteRuleFilterExpanded.value;
}

function ftpPaneSearchExpanded(pane: FtpWorkspacePane) {
  return pane.kind === 'local' ? localSearchExpanded.value : remoteSearchExpanded.value;
}

function ftpPaneFilterPresetId(pane: FtpWorkspacePane) {
  return pane.kind === 'local' ? localFilterPresetId.value : remoteFilterPresetId.value;
}

function setFtpPanePathInput(pane: FtpWorkspacePane, value: string) {
  updateFtpWorkspacePane(pane.key, { pathInput: value });
  if (pane.kind === 'local' && pane.key === activeBrowserPanel.value) {
    localPathInput.value = value;
  } else if (pane.kind === 'remote' && pane.key === activeBrowserPanel.value) {
    remotePathInput.value = value;
  }
}

function setFtpPaneViewMode(pane: FtpWorkspacePane, value: PanelViewMode) {
  updateFtpWorkspacePane(pane.key, { viewMode: value });
  if (pane.kind === 'local') {
    localPanelViewMode.value = value;
  } else {
    remotePanelViewMode.value = value;
  }
}

function ftpPaneSortKey(pane: FtpWorkspacePane) {
  return pane.kind === 'local' ? localSortKey.value : remoteSortKey.value;
}

function ftpPaneSortDirection(pane: FtpWorkspacePane) {
  return pane.kind === 'local' ? localSortDirection.value : remoteSortDirection.value;
}

function sortFtpPaneByColumn(pane: FtpWorkspacePane, sortKey: EntrySortKey) {
  if (ftpPaneSortKey(pane) === sortKey) {
    togglePanelSortDirection(pane.kind);
    return;
  }
  setPanelSortKey(pane.kind, sortKey);
}

function updateFtpPaneSelection(pane: FtpWorkspacePane, paths: string[], lastSelectedIndex = -1) {
  updateFtpWorkspacePane(pane.key, { selectedPaths: paths, lastSelectedIndex });
}

function handleFtpPaneEntryClick(pane: FtpWorkspacePane, event: MouseEvent, entry: FileTransferEntry, index: number) {
  const entries = ftpPaneFilteredEntries(pane);
  let nextPaths = [entry.path];
  if (event.shiftKey && pane.lastSelectedIndex >= 0) {
    const start = Math.min(pane.lastSelectedIndex, index);
    const end = Math.max(pane.lastSelectedIndex, index);
    nextPaths = entries.slice(start, end + 1).map((item) => item.path);
  } else if (event.ctrlKey || event.metaKey) {
    nextPaths = pane.selectedPaths.includes(entry.path)
      ? pane.selectedPaths.filter((path) => path !== entry.path)
      : [...pane.selectedPaths, entry.path];
  }
  updateFtpPaneSelection(pane, nextPaths, index);
  setActiveBrowserPanel(pane.key);
}

function handleFtpPaneMarqueeSelect(pane: FtpWorkspacePane, payload: { paths: string[]; additive: boolean }) {
  updateFtpPaneSelection(
    pane,
    payload.additive ? [...new Set([...pane.selectedPaths, ...payload.paths])] : payload.paths,
  );
}

function selectAllFtpPaneEntries(pane: FtpWorkspacePane) {
  updateFtpPaneSelection(pane, ftpPaneFilteredEntries(pane).map((entry) => entry.path));
}

async function openFtpPanePath(pane: FtpWorkspacePane, path = pane.pathInput) {
  await refreshFtpWorkspacePaneDirectory(pane.key, path.trim() || (pane.kind === 'remote' ? '/' : pane.path));
}

async function goFtpPaneParent(pane: FtpWorkspacePane) {
  await refreshFtpWorkspacePaneDirectory(
    pane.key,
    pane.kind === 'local' ? parentLocalPath(pane.path) : parentRemotePath(pane.path),
  );
}

async function openFtpPaneEntry(pane: FtpWorkspacePane, entry: FileTransferEntry) {
  if (entry.isDir) {
    await refreshFtpWorkspacePaneDirectory(pane.key, entry.path);
    return;
  }
  if (pane.kind === 'local') {
    await openLocalEntry(entry);
  } else {
    setActiveBrowserPanel(pane.key);
    await openRemoteEntry(entry);
  }
}

async function createFtpPaneDirectory(pane: FtpWorkspacePane) {
  const name = await requestEntryName({
    title: pane.kind === 'local' ? '新建本地文件夹' : '新建远程文件夹',
    label: '文件夹名称',
    confirmText: '创建',
    placeholder: 'folder-name',
  });
  if (!name) return;
  if (pane.kind === 'local') {
    await window.ftpApi.createLocalDir(joinLocalPath(pane.path, name));
  } else if (pane.sessionId) {
    await window.ftpApi.createRemoteDir(pane.sessionId, joinRemotePath(pane.path || '/', name));
  }
  await refreshFtpWorkspacePaneDirectory(pane.key, pane.path);
}

async function runFtpPanePrimaryAction(pane: FtpWorkspacePane) {
  if (pane.kind === 'local') {
    const targetRemote = activeFtpWorkspacePane()?.kind === 'remote'
      ? activeFtpWorkspacePane()
      : findFirstFtpPane('remote');
    if (!targetRemote?.sessionId || !pane.selectedPaths.length) return;
    for (const localPath of pane.selectedPaths) {
      await ftpStore.uploadFileToSession(targetRemote.sessionId, localPath, joinRemotePath(targetRemote.path || '/', baseName(localPath)));
    }
    await refreshFtpWorkspacePaneDirectory(targetRemote.key, targetRemote.path);
    return;
  }

  const targetLocal = activeFtpWorkspacePane()?.kind === 'local'
    ? activeFtpWorkspacePane()
    : findFirstFtpPane('local');
  if (!pane.sessionId || !targetLocal || !pane.selectedPaths.length) return;
  for (const remotePath of pane.selectedPaths) {
    await window.ftpApi.downloadFile(pane.sessionId, remotePath, joinLocalPath(targetLocal.path, baseName(remotePath)));
  }
  await refreshFtpWorkspacePaneDirectory(targetLocal.key, targetLocal.path);
}

function ftpPanePrimaryActionLabel(pane: FtpWorkspacePane) {
  if (pane.kind === 'local') {
    return pane.selectedPaths.length > 1 ? `上传 ${pane.selectedPaths.length} 项` : '上传';
  }
  return pane.selectedPaths.length > 1 ? `下载 ${pane.selectedPaths.length} 项` : '下载';
}

function canRunFtpPanePrimaryAction(pane: FtpWorkspacePane) {
  if (!pane.selectedPaths.length) return false;
  if (pane.kind === 'local') return Boolean(findFirstFtpPane('remote')?.sessionId);
  return Boolean(pane.sessionId && findFirstFtpPane('local'));
}

function selectedEntriesForFtpPaneDrag(pane: FtpWorkspacePane, entry: FileTransferEntry) {
  if (!pane.selectedPaths.includes(entry.path)) return [entry];
  const selected = new Set(pane.selectedPaths);
  return ftpPaneFilteredEntries(pane).filter((item) => selected.has(item.path));
}

function setFtpPaneDragPayload(event: DragEvent, pane: FtpWorkspacePane, entry: FileTransferEntry) {
  if (!event.dataTransfer) return;
  const entries = selectedEntriesForFtpPaneDrag(pane, entry);
  const payload: FtpPaneDragPayload = {
    sourcePaneKey: pane.key,
    sourceKind: pane.kind,
    sourceSessionId: pane.sessionId,
    entries,
  };
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-guyantools-ftp-pane-entries', JSON.stringify(payload));
  event.dataTransfer.setData(
    pane.kind === 'local' ? 'application/x-guyantools-local-entries' : 'application/x-guyantools-remote-entries',
    JSON.stringify(entries),
  );
  setActiveBrowserPanel(pane.key);
}

function getFtpDragTypes(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []);
}

function hasFtpDragType(event: DragEvent, type: string) {
  return getFtpDragTypes(event).includes(type);
}

function hasFtpPaneDragPayload(event: DragEvent) {
  return hasFtpDragType(event, 'application/x-guyantools-ftp-pane-entries');
}

function hasFtpLocalDragPayload(event: DragEvent) {
  return hasFtpDragType(event, 'application/x-guyantools-local-entries')
    || hasFtpDragType(event, 'application/x-guyantools-local-entry');
}

function hasFtpRemoteDragPayload(event: DragEvent) {
  return hasFtpDragType(event, 'application/x-guyantools-remote-entries')
    || hasFtpDragType(event, 'application/x-guyantools-remote-entry');
}

function hasFtpExternalFilePayload(event: DragEvent) {
  return hasFtpDragType(event, 'Files') || Boolean(event.dataTransfer?.files?.length);
}

function canDropOnFtpPane(event: DragEvent, pane: FtpWorkspacePane) {
  if (!event.dataTransfer) return false;
  const hasSupportedPayload = hasFtpPaneDragPayload(event)
    || hasFtpLocalDragPayload(event)
    || hasFtpRemoteDragPayload(event)
    || hasFtpExternalFilePayload(event);
  if (!hasSupportedPayload) return false;
  return pane.kind === 'local' || Boolean(pane.sessionId);
}

function updateFtpPaneDropEffect(event: DragEvent, allowed: boolean) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = allowed ? 'copy' : 'none';
  }
}

function parseFtpPaneDragPayload(event: DragEvent): FtpPaneDragPayload | null {
  const rawPayload = event.dataTransfer?.getData('application/x-guyantools-ftp-pane-entries');
  if (rawPayload) {
    const payload = JSON.parse(rawPayload) as FtpPaneDragPayload;
    return {
      ...payload,
      entries: Array.isArray(payload.entries) ? payload.entries : [],
    };
  }

  const localPayload = event.dataTransfer?.getData('application/x-guyantools-local-entries')
    || event.dataTransfer?.getData('application/x-guyantools-local-entry');
  if (localPayload) {
    const entries = JSON.parse(localPayload) as FileTransferEntry[] | FileTransferEntry;
    return {
      sourcePaneKey: '',
      sourceKind: 'local',
      entries: Array.isArray(entries) ? entries : [entries],
    };
  }

  const remotePayload = event.dataTransfer?.getData('application/x-guyantools-remote-entries')
    || event.dataTransfer?.getData('application/x-guyantools-remote-entry');
  if (remotePayload) {
    const entries = JSON.parse(remotePayload) as FileTransferEntry[] | FileTransferEntry;
    return {
      sourcePaneKey: '',
      sourceKind: 'remote',
      sourceSessionId: activeSession.value?.sessionId,
      entries: Array.isArray(entries) ? entries : [entries],
    };
  }

  return null;
}

function ftpDropEntryName(entry: FileTransferEntry) {
  return entry.name || baseName(entry.path);
}

function ftpSessionById(sessionId?: string) {
  return sessionId
    ? ftpStore.sessions.find((session) => session.sessionId === sessionId) ?? null
    : null;
}

async function copyDroppedLocalEntriesToLocal(entries: FileTransferEntry[], targetPane: FtpWorkspacePane) {
  for (const entry of entries) {
    await window.ftpApi.copyLocalPath(entry.path, joinLocalPath(targetPane.path, ftpDropEntryName(entry)));
  }
  await refreshFtpWorkspacePaneDirectory(targetPane.key, targetPane.path);
}

async function downloadDroppedRemoteEntriesToLocal(payload: FtpPaneDragPayload, targetPane: FtpWorkspacePane) {
  if (!payload.sourceSessionId) return;
  for (const entry of payload.entries) {
    await ftpStore.downloadFileFromSession(
      payload.sourceSessionId,
      entry.path,
      joinLocalPath(targetPane.path, ftpDropEntryName(entry)),
    );
  }
  await refreshFtpWorkspacePaneDirectory(targetPane.key, targetPane.path);
}

async function uploadDroppedLocalEntriesToRemote(entries: FileTransferEntry[], targetPane: FtpWorkspacePane) {
  if (!targetPane.sessionId) return;
  for (const entry of entries) {
    await ftpStore.uploadFileToSession(
      targetPane.sessionId,
      entry.path,
      joinRemotePath(targetPane.path || '/', ftpDropEntryName(entry)),
    );
  }
  await refreshFtpWorkspacePaneDirectory(targetPane.key, targetPane.path);
}

async function copyDroppedRemoteEntriesToRemote(payload: FtpPaneDragPayload, targetPane: FtpWorkspacePane) {
  if (!payload.sourceSessionId || !targetPane.sessionId) return;
  for (const entry of payload.entries) {
    await ftpStore.fxpTransfer(
      payload.sourceSessionId,
      entry.path,
      targetPane.sessionId,
      joinRemotePath(targetPane.path || '/', ftpDropEntryName(entry)),
    );
  }
  await refreshFtpWorkspacePaneDirectory(targetPane.key, targetPane.path);
}

async function uploadExternalFilesToFtpPane(event: DragEvent, targetPane: FtpWorkspacePane) {
  const files = Array.from(event.dataTransfer?.files ?? []);
  const localPaths = files
    .map((file) => (file as File & { path?: string }).path)
    .filter((path): path is string => Boolean(path));
  if (!localPaths.length) return;

  if (targetPane.kind === 'local') {
    for (const sourcePath of localPaths) {
      await window.ftpApi.copyLocalPath(sourcePath, joinLocalPath(targetPane.path, baseName(sourcePath)));
    }
  } else if (targetPane.sessionId) {
    for (const sourcePath of localPaths) {
      await ftpStore.uploadFileToSession(
        targetPane.sessionId,
        sourcePath,
        joinRemotePath(targetPane.path || '/', baseName(sourcePath)),
      );
    }
  }
  await refreshFtpWorkspacePaneDirectory(targetPane.key, targetPane.path);
}

function handleFtpPaneDragEnter(event: DragEvent, pane: FtpWorkspacePane) {
  const allowed = canDropOnFtpPane(event, pane);
  ftpFileDropTargetPaneKey.value = allowed ? pane.key : '';
  updateFtpPaneDropEffect(event, allowed);
}

function handleFtpPaneDragOver(event: DragEvent, pane: FtpWorkspacePane) {
  const allowed = canDropOnFtpPane(event, pane);
  ftpFileDropTargetPaneKey.value = allowed ? pane.key : '';
  updateFtpPaneDropEffect(event, allowed);
}

function handleFtpPaneDragLeave(event: DragEvent, pane: FtpWorkspacePane) {
  const currentTarget = event.currentTarget as Node | null;
  const relatedTarget = event.relatedTarget as Node | null;
  if (ftpFileDropTargetPaneKey.value === pane.key && currentTarget && (!relatedTarget || !currentTarget.contains(relatedTarget))) {
    ftpFileDropTargetPaneKey.value = '';
  }
}

async function handleFtpPaneDrop(event: DragEvent, targetPane: FtpWorkspacePane) {
  event.preventDefault();
  const acceptsDrop = canDropOnFtpPane(event, targetPane);
  ftpFileDropTargetPaneKey.value = '';
  if (!acceptsDrop || !event.dataTransfer) return;

  let sourceSessionId = '';
  try {
    const payload = parseFtpPaneDragPayload(event);
    sourceSessionId = payload?.sourceSessionId ?? '';
    if (payload?.entries.length) {
      if (targetPane.kind === 'local') {
        if (payload.sourceKind === 'local') {
          await copyDroppedLocalEntriesToLocal(payload.entries, targetPane);
        } else {
          await downloadDroppedRemoteEntriesToLocal(payload, targetPane);
        }
      } else if (payload.sourceKind === 'local') {
        await uploadDroppedLocalEntriesToRemote(payload.entries, targetPane);
      } else {
        await copyDroppedRemoteEntriesToRemote(payload, targetPane);
      }
      return;
    }

    await uploadExternalFilesToFtpPane(event, targetPane);
  } catch (error) {
    const session = targetPane.kind === 'remote'
      ? ftpSessionById(targetPane.sessionId)
      : ftpSessionById(sourceSessionId);
    handleFtpOperationError(error, session, targetPane.path);
  }
}

function handleFtpPaneEntryDragEnd() {
  ftpFileDropTargetPaneKey.value = '';
  handleEntryDragEnd();
}

function ftpPaneDropHint(pane: FtpWorkspacePane) {
  return pane.kind === 'local'
    ? '释放后下载远程项目，或复制本地项目到此目录'
    : '释放后上传本地项目，或复制远程项目到此目录';
}

const visibleBrowserPanelCount = computed(() => ftpWorkspacePanes.value.length);
const orderedFtpWorkspacePanes = computed<FtpWorkspacePane[]>(() => {
  return ftpWorkspacePanes.value;
});
const visibleFtpWorkspacePanes = computed<FtpWorkspacePane[]>(() => {
  if (panelLayoutMode.value !== 'tabbed') {
    return orderedFtpWorkspacePanes.value;
  }
  const activePane = orderedFtpWorkspacePanes.value.find((pane) => pane.key === activeBrowserPanel.value)
    ?? orderedFtpWorkspacePanes.value[0];
  return activePane ? [activePane] : [];
});
const ftpGridColumnCount = computed(() => Math.max(1, Math.ceil(Math.sqrt(visibleFtpWorkspacePanes.value.length))));
const ftpGridRowCount = computed(() => Math.max(1, Math.ceil(visibleFtpWorkspacePanes.value.length / ftpGridColumnCount.value)));
const ftpMasterStackCount = computed(() => Math.max(0, visibleFtpWorkspacePanes.value.length - 1));
const ftpPaneWorkspaceStyle = computed<Record<string, string>>(() => {
  const count = visibleFtpWorkspacePanes.value.length;
  if (panelLayoutMode.value === 'split-horizontal') {
    return {
      gridTemplateRows: toFtpGridTemplate(ensureFtpLayoutSizes('split-horizontal:rows', count)),
      gridTemplateColumns: 'minmax(0, 1fr)',
    };
  }
  if (panelLayoutMode.value === 'split-vertical') {
    return {
      gridTemplateColumns: toFtpGridTemplate(ensureFtpLayoutSizes('split-vertical:columns', count)),
      gridTemplateRows: 'minmax(0, 1fr)',
    };
  }
  if (panelLayoutMode.value === 'master-stack' && count > 1) {
    return {
      gridTemplateColumns: `${ftpMasterMainRatio.value}% ${100 - ftpMasterMainRatio.value}%`,
      gridTemplateRows: toFtpGridTemplate(ensureFtpLayoutSizes('master-stack:stack-rows', ftpMasterStackCount.value)),
    };
  }
  if (panelLayoutMode.value === 'grid') {
    return {
      gridTemplateColumns: toFtpGridTemplate(ensureFtpLayoutSizes('grid:columns', ftpGridColumnCount.value)),
      gridTemplateRows: toFtpGridTemplate(ensureFtpLayoutSizes('grid:rows', ftpGridRowCount.value)),
    };
  }
  return {};
});
const ftpDwindleLayoutModel = computed<FtpDwindleLayoutModel>(() => buildFtpDwindleLayout(visibleFtpWorkspacePanes.value));
const ftpPaneLayoutItems = computed<FtpWorkspacePaneLayoutItem[]>(() => {
  if (panelLayoutMode.value === 'dwindle') {
    return ftpDwindleLayoutModel.value.items;
  }
  return visibleFtpWorkspacePanes.value.map((pane, index) => ({
    pane,
    style: getFtpGridPaneStyle(index),
  }));
});
const ftpPaneLayoutByKey = computed(() => new Map(ftpPaneLayoutItems.value.map((item) => [item.pane.key, item])));
const ftpPaneResizeHandles = computed<FtpPaneResizeHandle[]>(() => {
  const count = visibleFtpWorkspacePanes.value.length;
  if (count <= 1 || panelLayoutMode.value === 'tabbed') {
    return [];
  }
  if (panelLayoutMode.value === 'split-horizontal') {
    return buildFtpSplitHandles('split-horizontal:rows', 'horizontal', 'split', count);
  }
  if (panelLayoutMode.value === 'split-vertical') {
    return buildFtpSplitHandles('split-vertical:columns', 'vertical', 'split', count);
  }
  if (panelLayoutMode.value === 'master-stack') {
    const stackHandles = buildFtpSplitHandles('master-stack:stack-rows', 'horizontal', 'split', ftpMasterStackCount.value)
      .map((handle) => ({
        ...handle,
        id: `master-stack:${handle.id}`,
        style: {
          ...handle.style,
          left: `${ftpMasterMainRatio.value}%`,
          width: `${100 - ftpMasterMainRatio.value}%`,
        },
      }));
    return [
      {
        id: 'master-main',
        kind: 'master-main',
        orientation: 'vertical',
        style: { left: `${ftpMasterMainRatio.value}%`, top: '0%', height: '100%' },
      },
      ...stackHandles,
    ];
  }
  if (panelLayoutMode.value === 'grid') {
    return [
      ...buildFtpSplitHandles('grid:columns', 'vertical', 'grid', ftpGridColumnCount.value),
      ...buildFtpSplitHandles('grid:rows', 'horizontal', 'grid', ftpGridRowCount.value),
    ];
  }
  if (panelLayoutMode.value === 'dwindle') {
    return ftpDwindleLayoutModel.value.handles;
  }
  return [];
});

function ensureFtpLayoutSizes(key: string, count: number) {
  if (count <= 0) return [];
  const current = ftpLayoutSizeState.value[key] ?? [];
  if (current.length === count && current.every((size) => size > 0)) {
    return current;
  }
  const next = Array.from({ length: count }, () => 100 / count);
  ftpLayoutSizeState.value = {
    ...ftpLayoutSizeState.value,
    [key]: next,
  };
  return next;
}

function toFtpGridTemplate(sizes: number[]) {
  return sizes.length ? sizes.map((size) => `minmax(0, ${size}fr)`).join(' ') : 'minmax(0, 1fr)';
}

function getFtpGridPaneStyle(index: number): Record<string, string> {
  if (panelLayoutMode.value === 'master-stack' && visibleFtpWorkspacePanes.value.length > 1) {
    if (index === 0) {
      return {
        gridColumn: '1',
        gridRow: `1 / ${ftpMasterStackCount.value + 1}`,
      };
    }
    return {
      gridColumn: '2',
      gridRow: String(index),
    };
  }

  if (panelLayoutMode.value === 'grid') {
    const column = (index % ftpGridColumnCount.value) + 1;
    const row = Math.floor(index / ftpGridColumnCount.value) + 1;
    return {
      gridColumn: String(column),
      gridRow: String(row),
    };
  }

  return {};
}

function buildFtpSplitHandles(
  key: string,
  orientation: FtpPaneResizeOrientation,
  kind: FtpPaneResizeKind,
  count: number,
): FtpPaneResizeHandle[] {
  if (count <= 1) return [];
  const sizes = ensureFtpLayoutSizes(key, count);
  let offset = 0;
  return sizes.slice(0, -1).map((size, index) => {
    offset += size;
    return {
      id: `${key}:${index}`,
      kind,
      orientation,
      stateKey: key,
      index,
      style: orientation === 'vertical'
        ? { left: `${offset}%`, top: '0%', height: '100%' }
        : { top: `${offset}%`, left: '0%', width: '100%' },
    };
  });
}

function buildFtpDwindleLayout(panes: FtpWorkspacePane[]): FtpDwindleLayoutModel {
  const rects: Record<string, string>[] = [];
  const handles: FtpPaneResizeHandle[] = [];
  let left = 0;
  let top = 0;
  let width = 100;
  let height = 100;
  const ratios = ensureFtpDwindleRatios(Math.max(0, panes.length - 1));

  panes.forEach((pane, index) => {
    if (index === panes.length - 1) {
      rects.push(toFtpRectStyle(left, top, width, height));
      return;
    }
    const ratio = ratios[index] ?? 50;
    const splitVertical = index % 2 === 0;
    if (splitVertical) {
      const firstWidth = width * (ratio / 100);
      rects.push(toFtpRectStyle(left, top, firstWidth, height));
      const handleLeft = left + firstWidth;
      handles.push({
        id: `dwindle:${pane.key}:${index}`,
        kind: 'dwindle',
        orientation: 'vertical',
        splitIndex: index,
        style: { left: `${handleLeft}%`, top: `${top}%`, height: `${height}%` },
        bounds: { left, top, width, height },
      });
      left += firstWidth;
      width -= firstWidth;
      return;
    }

    const firstHeight = height * (ratio / 100);
    rects.push(toFtpRectStyle(left, top, width, firstHeight));
    const handleTop = top + firstHeight;
    handles.push({
      id: `dwindle:${pane.key}:${index}`,
      kind: 'dwindle',
      orientation: 'horizontal',
      splitIndex: index,
      style: { left: `${left}%`, top: `${handleTop}%`, width: `${width}%` },
      bounds: { left, top, width, height },
    });
    top += firstHeight;
    height -= firstHeight;
  });

  return {
    items: panes.map((pane, index) => ({ pane, style: rects[index] ?? toFtpRectStyle(0, 0, 100, 100) })),
    handles,
  };
}

function ensureFtpDwindleRatios(count: number) {
  if (count <= 0) return [];
  if (ftpDwindleSplitRatios.value.length === count) {
    return ftpDwindleSplitRatios.value;
  }
  ftpDwindleSplitRatios.value = Array.from({ length: count }, (_, index) => ftpDwindleSplitRatios.value[index] ?? 50);
  return ftpDwindleSplitRatios.value;
}

function toFtpRectStyle(left: number, top: number, width: number, height: number): Record<string, string> {
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  };
}

function clampFtpLayoutValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function startFtpPaneResize(event: PointerEvent, handle: FtpPaneResizeHandle) {
  const workspace = ftpPaneWorkspaceRef.value;
  if (!(workspace instanceof HTMLElement)) return;
  event.preventDefault();
  event.stopPropagation();
  ftpPaneResizeInteraction.value = {
    handle,
    startX: event.clientX,
    startY: event.clientY,
    startSizes: handle.stateKey ? [...ensureFtpLayoutSizes(handle.stateKey, inferFtpResizeSizeCount(handle.stateKey))] : [],
    rect: workspace.getBoundingClientRect(),
  };
  document.body.classList.add('terminal-pane-resizing');
  window.addEventListener('pointermove', handleFtpPaneResizeMove, true);
  window.addEventListener('pointerup', stopFtpPaneResize, true);
  window.addEventListener('pointercancel', stopFtpPaneResize, true);
}

function handleFtpPaneResizeMove(event: PointerEvent) {
  const interaction = ftpPaneResizeInteraction.value;
  if (!interaction) return;

  const { handle, rect } = interaction;
  if (handle.kind === 'master-main') {
    ftpMasterMainRatio.value = clampFtpLayoutValue(((event.clientX - rect.left) / rect.width) * 100, 24, 76);
    return;
  }

  if (handle.kind === 'dwindle' && handle.bounds && handle.splitIndex !== undefined) {
    const next = [...ftpDwindleSplitRatios.value];
    const ratio = handle.orientation === 'vertical'
      ? ((event.clientX - rect.left - (handle.bounds.left / 100) * rect.width) / ((handle.bounds.width / 100) * rect.width)) * 100
      : ((event.clientY - rect.top - (handle.bounds.top / 100) * rect.height) / ((handle.bounds.height / 100) * rect.height)) * 100;
    next[handle.splitIndex] = clampFtpLayoutValue(ratio, 20, 80);
    ftpDwindleSplitRatios.value = next;
    return;
  }

  if (!handle.stateKey || handle.index === undefined) return;
  const deltaPercent = handle.orientation === 'vertical'
    ? ((event.clientX - interaction.startX) / rect.width) * 100
    : ((event.clientY - interaction.startY) / rect.height) * 100;
  const next = [...interaction.startSizes];
  const current = next[handle.index] ?? 0;
  const following = next[handle.index + 1] ?? 0;
  const total = current + following;
  const minSize = Math.min(18, total / 2);
  next[handle.index] = clampFtpLayoutValue(current + deltaPercent, minSize, total - minSize);
  next[handle.index + 1] = total - next[handle.index];
  ftpLayoutSizeState.value = {
    ...ftpLayoutSizeState.value,
    [handle.stateKey]: next,
  };
}

function stopFtpPaneResize() {
  ftpPaneResizeInteraction.value = null;
  document.body.classList.remove('terminal-pane-resizing');
  window.removeEventListener('pointermove', handleFtpPaneResizeMove, true);
  window.removeEventListener('pointerup', stopFtpPaneResize, true);
  window.removeEventListener('pointercancel', stopFtpPaneResize, true);
}

function inferFtpResizeSizeCount(key: string) {
  if (key.includes('grid:columns')) return ftpGridColumnCount.value;
  if (key.includes('grid:rows')) return ftpGridRowCount.value;
  if (key.includes('master-stack')) return ftpMasterStackCount.value;
  return visibleFtpWorkspacePanes.value.length;
}

function setFtpWorkspaceLayoutMode(mode: TerminalLayoutMode) {
  panelLayoutMode.value = mode;
}

function loadConnectionLayoutConfigs() {
  connectionLayoutConfigs.value = listConnectionLayoutConfigs('ftp');
  if (
    selectedConnectionLayoutId.value
    && !connectionLayoutConfigs.value.some((layout) => layout.id === selectedConnectionLayoutId.value)
  ) {
    selectedConnectionLayoutId.value = '';
  }
}

const connectionLayoutOptions = computed(() => [
  { label: '打开布局...', value: '' },
  ...connectionLayoutConfigs.value.map((layout) => ({
    label: layout.name,
    value: layout.id,
  })),
]);

function snapshotFtpTarget(pane: FtpWorkspacePane): ConnectionLayoutTarget | null {
  if (pane.kind === 'local') {
    return {
      surface: 'ftp',
      kind: 'local',
      path: pane.path,
      label: pane.title,
    };
  }

  if (!pane.profileId || pane.connectionState === 'connecting') {
    return null;
  }

  return {
    surface: 'ftp',
    kind: 'remote',
    profileId: pane.profileId,
    remotePath: pane.path,
    label: pane.title,
  };
}

function defaultFtpLayoutName() {
  return `传输布局 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
}

function openSaveFtpLayoutDialog() {
  if (!orderedFtpWorkspacePanes.value.length) {
    notifyError(new Error('当前没有可保存的传输连接。'), '保存连接布局失败');
    return;
  }
  saveLayoutName.value = defaultFtpLayoutName();
  saveLayoutDialogVisible.value = true;
}

function saveCurrentFtpConnectionLayout() {
  const targets = orderedFtpWorkspacePanes.value
    .map(snapshotFtpTarget)
    .filter((target): target is ConnectionLayoutTarget => Boolean(target));
  if (!targets.length) {
    notifyError(new Error('当前没有可保存的传输连接。'), '保存连接布局失败');
    return;
  }

  const name = saveLayoutName.value.trim() || defaultFtpLayoutName();

  const saved = saveConnectionLayoutConfig({
    name,
    surface: 'ftp',
    targets,
    viewState: {
      layoutMode: panelLayoutMode.value,
      order: orderedFtpWorkspacePanes.value.map((pane) => pane.key),
      layoutSizeState: ftpLayoutSizeState.value,
      masterMainRatio: ftpMasterMainRatio.value,
      dwindleSplitRatios: ftpDwindleSplitRatios.value,
      sidebarDockSide: sidebarDockSide.value,
      auxiliaryDockSide: auxiliaryDockSide.value,
      auxiliaryDockSize: auxiliaryDockSize.value,
      auxiliaryDockCollapsed: auxiliaryDockCollapsed.value,
      showSidebar: showSidebarPanel.value,
    },
  });
  loadConnectionLayoutConfigs();
  saveLayoutDialogVisible.value = false;
  notifySuccess(`${saved.name} 已保存，可在首页小组件或传输页快速打开。`, '连接布局已保存');
}

function deleteFtpConnectionLayout(layoutId: string) {
  if (!layoutId) return;
  const layout = getConnectionLayoutConfig(layoutId);
  deleteConnectionLayoutConfig(layoutId);
  selectedConnectionLayoutId.value = '';
  loadConnectionLayoutConfigs();
  notifySuccess(`${layout?.name ?? '连接布局'} 已删除。`, '连接布局已删除');
}

async function replaceExistingFtpConnections() {
  const sessionIds = ftpStore.sessions.map((session) => session.sessionId);
  await Promise.all(sessionIds.map((sessionId) => ftpStore.disconnect(sessionId)));
  ftpWorkspacePanes.value = [];
  activeBrowserPanel.value = '';
  ftpLayoutSizeState.value = {};
  ftpDwindleSplitRatios.value = [];
  ftpMasterMainRatio.value = 66;
  ftpWorkspaceRemoteRestoreReady.value = true;
}

async function openLocalTargetFromConnectionLayout(target: Extract<ConnectionLayoutTarget, { surface: 'ftp'; kind: 'local' }>) {
  const pane = createLocalWorkspacePane(target.path);
  ftpWorkspacePanes.value = [...ftpWorkspacePanes.value, pane];
  await refreshFtpWorkspacePaneDirectory(pane.key, target.path);
  return pane.key;
}

async function openRemoteTargetFromConnectionLayout(target: Extract<ConnectionLayoutTarget, { surface: 'ftp'; kind: 'remote' }>) {
  let profile = ftpStore.profiles.find((item) => item.id === target.profileId) ?? null;
  if (!profile) {
    await ftpStore.refreshProfiles();
    profile = ftpStore.profiles.find((item) => item.id === target.profileId) ?? null;
  }
  if (!profile) return '';

  const targetPath = target.remotePath || profile.defaultRemotePath || '/';
  let session = ftpStore.sessions.find((item) => item.profileId === profile.id) ?? null;
  if (!session) {
    await connectProfile(profile);
    session = ftpStore.sessions.find((item) => item.profileId === profile.id) ?? null;
  }
  if (!session) return '';

  focusRemoteWorkspacePane(session.sessionId);
  const paneKey = makeRemotePaneKey(session.sessionId);
  await refreshFtpWorkspacePaneDirectory(paneKey, targetPath || session.remoteRoot);
  return paneKey;
}

async function openFtpConnectionLayout(layoutId: string) {
  const layout = getConnectionLayoutConfig(layoutId);
  if (!layout || layout.surface !== 'ftp') {
    notifyError(new Error('找不到传输连接布局配置。'), '打开连接布局失败');
    return;
  }

  try {
    if (!ftpStore.initialized) {
      await initializeFtpPage();
    }
    await replaceExistingFtpConnections();
    const desiredKeys = (await Promise.all(
      layout.targets.map((target) => {
        if (target.surface !== 'ftp') return Promise.resolve('');
        return target.kind === 'local'
          ? openLocalTargetFromConnectionLayout(target)
          : openRemoteTargetFromConnectionLayout(target);
      }),
    )).filter(Boolean);

    if (layout.viewState.layoutSizeState) {
      ftpLayoutSizeState.value = layout.viewState.layoutSizeState;
    }
    if (typeof layout.viewState.masterMainRatio === 'number') {
      ftpMasterMainRatio.value = layout.viewState.masterMainRatio;
    }
    if (layout.viewState.dwindleSplitRatios?.length) {
      ftpDwindleSplitRatios.value = layout.viewState.dwindleSplitRatios;
    }
    if (layout.viewState.sidebarDockSide) {
      sidebarDockSide.value = layout.viewState.sidebarDockSide;
    }
    if (layout.viewState.auxiliaryDockSide) {
      auxiliaryDockSide.value = layout.viewState.auxiliaryDockSide;
    }
    if (layout.viewState.auxiliaryDockSize) {
      auxiliaryDockSize.value = layout.viewState.auxiliaryDockSize;
    }
    if (typeof layout.viewState.auxiliaryDockCollapsed === 'boolean') {
      auxiliaryDockCollapsed.value = layout.viewState.auxiliaryDockCollapsed;
    }
    if (typeof layout.viewState.showSidebar === 'boolean') {
      showSidebarPanel.value = layout.viewState.showSidebar;
    }
    panelLayoutMode.value = layout.viewState.layoutMode;
    const paneByKey = new Map(ftpWorkspacePanes.value.map((pane) => [pane.key, pane]));
    const ordered = desiredKeys
      .map((key) => paneByKey.get(key))
      .filter((pane): pane is FtpWorkspacePane => Boolean(pane));
    const remaining = ftpWorkspacePanes.value.filter((pane) => !desiredKeys.includes(pane.key));
    ftpWorkspacePanes.value = [...ordered, ...remaining];
    activeBrowserPanel.value = desiredKeys[0] ?? ftpWorkspacePanes.value[0]?.key ?? '';
    notifySuccess(`${layout.name} 已打开。`, '连接布局已打开');
  } catch (error) {
    notifyError(error, '打开连接布局失败');
  }
}

function handleFtpConnectionLayoutSelect(value: string | number) {
  const layoutId = String(value || '');
  selectedConnectionLayoutId.value = layoutId;
  if (layoutId) {
    void openFtpConnectionLayout(layoutId);
  }
}

function isFtpPaneVisible(key: FtpWorkspacePaneKey) {
  return ftpPaneLayoutByKey.value.has(key);
}

function ftpPaneStyle(key: FtpWorkspacePaneKey) {
  return ftpPaneLayoutByKey.value.get(key)?.style ?? {};
}

const localBreadcrumbs = computed(() => buildLocalBreadcrumbs(ftpStore.localPath));
const remoteBreadcrumbs = computed(() => buildRemoteBreadcrumbs(ftpStore.remotePath || activeSession.value?.remoteRoot || '/'));
const recentClosedSessionSummary = computed(() => (
  recentlyClosedSessions.value.length
    ? `最近关闭 ${recentlyClosedSessions.value[0]?.profileLabel}`
    : '当前没有可恢复的最近关闭标签'
));
const remoteEditorDirty = computed(() => remoteEditorContent.value !== remoteEditorOriginalContent.value);
const editorDialogTitle = computed(() => (editorTargetKind.value === 'local' ? '编辑本地文件' : '编辑远程文件'));
const remotePreviewImageScopeLabel = computed(() => (remotePreviewSource.value === 'local' ? '本地图片预览' : '远程图片预览'));
const remotePreviewTitle = computed(() => {
  if (remotePreviewKind.value === 'text') return '预览远程文本';
  return remotePreviewSource.value === 'local' ? '预览本地图片' : '预览远程图片';
});
const remotePreviewLoadingText = computed(() => {
  if (remotePreviewKind.value === 'text') return '正在加载远程文本...';
  return remotePreviewSource.value === 'local' ? '正在加载本地图片...' : '正在加载远程图片...';
});
const editorSyncLabel = computed(() => {
  if (remoteEditorDirty.value) return '有未保存修改';
  return editorTargetKind.value === 'local' ? '已与本地文件同步' : '已与远程同步';
});
const editorLoadingText = computed(() => (editorTargetKind.value === 'local' ? '正在加载本地文件...' : '正在加载远程文件...'));
const editorSaveText = computed(() => {
  if (remoteEditorSaving.value) return '保存中...';
  return editorTargetKind.value === 'local' ? '保存到本地' : '保存并回传';
});
const isDeletingRemote = computed(() => busyMessage.value.startsWith('正在删除远程'));
const sessionTabs = computed(() => ftpStore.sessions);
const scheduledTaskProfileOptions = computed(() =>
  ftpStore.profiles.map((profile) => ({ label: profile.label, value: profile.id })),
);
const scheduledDirectionOptions = [
  { label: '本地上传到远程', value: 'upload' },
  { label: '远程下载到本地', value: 'download' },
];
const scheduledTypeOptions = [
  { label: '单次执行', value: 'once' },
  { label: '每隔 N 小时', value: 'hourly' },
  { label: '每日执行', value: 'daily' },
  { label: '每周执行', value: 'weekly' },
  { label: '自定义 Cron', value: 'cron' },
];
const scheduledConflictPolicyOptions = [
  { label: '冲突时跳过', value: 'skip' },
  { label: '允许并行执行', value: 'parallel' },
];
const weekDayOptions = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 0 },
];
const cronExpressionHint = '五段式：分钟 小时 日 月 周，例如 0 2 * * 1-5';
const pendingExternalSummary = computed(() =>
  pendingExternalPaths.value.length ? `待导入 ${pendingExternalPaths.value.length} 项 Explorer 内容` : '',
);
const syncDirectionOptions = [
  { label: '本地 -> 远程', value: 'localToRemote' },
  { label: '远程 -> 本地', value: 'remoteToLocal' },
  { label: '双向同步', value: 'bidirectional' },
];
const syncConflictPolicyOptions = [
  { label: '冲突时保留较新文件', value: 'keepNewer' },
  { label: '冲突时优先本地', value: 'preferLocal' },
  { label: '冲突时优先远程', value: 'preferRemote' },
  { label: '冲突时跳过', value: 'skipConflicts' },
];
const syncSummary = computed(() => {
  const counts = {
    localOnly: 0,
    remoteOnly: 0,
    different: 0,
    same: 0,
  };
  let transferSize = 0;
  let checksumVerified = 0;
  let checksumDifferent = 0;
  for (const item of syncComparisonItems.value) {
    counts[item.status] += 1;
    if (item.status !== 'same') {
      transferSize += item.transferSize;
    }
    if (item.contentVerification !== 'notCompared') {
      checksumVerified += 1;
      if (item.contentVerification === 'different') {
        checksumDifferent += 1;
      }
    }
  }
  return { ...counts, transferSize, checksumVerified, checksumDifferent };
});
const syncPreviewItems = computed<SyncPreviewItem[]>(() =>
  syncComparisonItems.value.map((item) => ({
    ...item,
    action: determineSyncAction(item, syncDirection.value, syncConflictPolicy.value),
  })),
);
const selectedSyncPreviewItems = computed(() =>
  syncPreviewItems.value.filter((item) => syncSelectedKeys.value.includes(item.key) && item.action !== 'skip'),
);
const syncPreviewSummary = computed(() => {
  const counts: Record<SyncActionKind, number> = {
    upload: 0,
    download: 0,
    deleteRemote: 0,
    deleteLocal: 0,
    replaceRemote: 0,
    replaceLocal: 0,
    skip: 0,
  };
  let transferSize = 0;
  for (const item of selectedSyncPreviewItems.value) {
    counts[item.action] += 1;
    if (item.action !== 'skip' && item.action !== 'deleteRemote' && item.action !== 'deleteLocal') {
      transferSize += item.transferSize;
    }
  }
  return { counts, transferSize };
});
const syncExecutableCount = computed(() => selectedSyncPreviewItems.value.length);
const syncExecutionSummary = computed(() => {
  if (!syncExecuting.value || !syncExecutionTotal.value) {
    return '';
  }
  const completed = Math.min(syncExecutionCurrentIndex.value, syncExecutionTotal.value);
  const base = `同步执行 ${completed}/${syncExecutionTotal.value}`;
  const detail = syncExecutionLabel.value ? ` · ${syncExecutionLabel.value}` : '';
  return syncCancelRequested.value ? `${base}${detail} · 正在停止后续项` : `${base}${detail}`;
});
const {
  sidebarCollapsed,
  folderSelectOptions,
  folderParentOptions,
  restoreFailureProfiles,
  configTreeExpandedIds,
  selectedConfigTreeNodeId,
  configTreeNodes,
  handleConfigTreeSelect,
  handleConfigTreeActivate,
  openConfigNodeContextMenu,
  handleConfigTreeDrop,
  toggleSidebarCollapsed,
  openCollapsedConfigsMenu,
  sessionStatusTone,
} = useFtpSidebar({
  ftpStore,
  activeSession,
  editingFolderId,
  openContextMenu,
  closeContextMenu,
  openCreateDialog,
  openCreateFolderDialog,
  openEditDialog,
  openEditFolderDialog,
  removeFolder,
  removeProfile,
  connectProfile,
});

watch(() => ftpStore.localPath, () => {
  clearLocalSelection();
}, { immediate: false });

watch(() => ftpStore.remotePath, () => {
  clearRemoteSelection();
}, { immediate: false });

watch([syncDirection, syncConflictPolicy], () => {
  if (!syncComparisonItems.value.length) return;
  syncSelectedKeys.value = syncPreviewItems.value
    .filter((item) => item.action !== 'skip')
    .map((item) => item.key);
});

function isEditableTextEntry(entry: { name: string; isDir: boolean } | null) {
  if (!entry || entry.isDir) return false;
  const loweredName = entry.name.toLowerCase();
  if (['dockerfile', 'makefile', '.gitignore', '.env', '.bashrc', '.zshrc'].includes(loweredName)) {
    return true;
  }
  return /\.(txt|md|markdown|mdx|json|jsonc|ya?ml|toml|ini|conf|cfg|log|csv|env|xml|svg|html?|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|mts|cts|vue|rs|py|sh|bash|zsh|sql)$/i.test(entry.name);
}

function isPreviewableImageEntry(entry: { name: string; isDir: boolean } | null) {
  return Boolean(entry && !entry.isDir && /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|avif)$/i.test(entry.name));
}

function canPreviewRemoteImageEntry(entry: FileTransferEntry | null) {
  return Boolean(activeSession.value && isPreviewableImageEntry(entry));
}

function canPreviewLocalImageEntry(entry: FileTransferEntry | null) {
  return isPreviewableImageEntry(entry);
}

function canPreviewRemoteTextEntry(entry: FileTransferEntry | null) {
  return Boolean(activeSession.value && isEditableTextEntry(entry));
}

function canOpenInternalEditor(kind: PanelKind, entry: FileTransferEntry | null) {
  if (!isEditableTextEntry(entry)) return false;
  return kind === 'local' || Boolean(activeSession.value);
}

function canOpenExternalEditor(kind: PanelKind, entry: FileTransferEntry | null) {
  if (!entry || entry.isDir) return false;
  return kind === 'local' || Boolean(activeSession.value && isEditableTextEntry(entry));
}

async function openLocalEditor(entry = selectedLocalEntry.value) {
  if (!isEditableTextEntry(entry)) return;
  editorTargetKind.value = 'local';
  remoteEditorLoading.value = true;
  remoteEditorDialogVisible.value = true;
  remoteEditorPath.value = entry.path;
  remoteEditorContent.value = '';
  remoteEditorOriginalContent.value = '';
  actionError.value = '';
  try {
    remoteEditorContent.value = await window.shellApi.readTextFile(entry.path, 2_000_000);
    remoteEditorOriginalContent.value = remoteEditorContent.value;
  } catch (error) {
    remoteEditorDialogVisible.value = false;
    actionError.value = errorMessage(error);
  } finally {
    remoteEditorLoading.value = false;
  }
}

async function openRemoteEditor(entry = selectedRemoteEntry.value) {
  const pane = activeFtpWorkspacePane();
  const sessionId = pane?.kind === 'remote' ? pane.sessionId : activeSession.value?.sessionId;
  const session = sessionId ? ftpStore.sessions.find((item) => item.sessionId === sessionId) ?? activeSession.value : activeSession.value;
  if (!sessionId || !isEditableTextEntry(entry)) return;
  editorTargetKind.value = 'remote';
  remoteEditorLoading.value = true;
  remoteEditorDialogVisible.value = true;
  remoteEditorPath.value = entry.path;
  remoteEditorContent.value = '';
  remoteEditorOriginalContent.value = '';
  actionError.value = '';
  try {
    remoteEditorContent.value = await window.ftpApi.loadRemoteTextFile(sessionId, entry.path);
    remoteEditorOriginalContent.value = remoteEditorContent.value;
  } catch (error) {
    remoteEditorDialogVisible.value = false;
    handleFtpOperationError(error, session, entry.path);
  } finally {
    remoteEditorLoading.value = false;
  }
}

function resetRemotePreviewContent() {
  remotePreviewImageSrc.value = '';
  remotePreviewText.value = '';
  remotePreviewError.value = '';
}

async function previewRemoteImage(entry = selectedRemoteEntry.value) {
  const pane = activeFtpWorkspacePane();
  const sessionId = pane?.kind === 'remote' ? pane.sessionId : activeSession.value?.sessionId;
  const session = sessionId ? ftpStore.sessions.find((item) => item.sessionId === sessionId) ?? activeSession.value : activeSession.value;
  if (!sessionId || !isPreviewableImageEntry(entry)) return;
  remotePreviewSource.value = 'remote';
  remotePreviewKind.value = 'image';
  remotePreviewDialogVisible.value = true;
  remotePreviewLoading.value = true;
  remotePreviewPath.value = entry.path;
  remotePreviewName.value = entry.name;
  resetRemotePreviewContent();
  actionError.value = '';
  try {
    const dataUrl = await window.ftpApi.loadRemoteImagePreview(sessionId, entry.path, IMAGE_PREVIEW_MAX_BYTES);
    if (!dataUrl) {
      remotePreviewError.value = '该图片无法预览，可能超过大小限制或格式不受支持。';
      return;
    }
    remotePreviewImageSrc.value = dataUrl;
  } catch (error) {
    remotePreviewError.value = errorMessage(error);
    handleFtpOperationError(error, session, entry.path);
  } finally {
    remotePreviewLoading.value = false;
  }
}

async function previewLocalImage(entry = selectedLocalEntry.value) {
  if (!isPreviewableImageEntry(entry)) return;
  remotePreviewSource.value = 'local';
  remotePreviewKind.value = 'image';
  remotePreviewDialogVisible.value = true;
  remotePreviewLoading.value = true;
  remotePreviewPath.value = entry.path;
  remotePreviewName.value = entry.name;
  resetRemotePreviewContent();
  actionError.value = '';
  try {
    const dataUrl = await window.ftpApi.loadLocalImagePreview(entry.path, IMAGE_PREVIEW_MAX_BYTES);
    if (!dataUrl) {
      remotePreviewError.value = '该图片无法预览，可能超过大小限制或格式不受支持。';
      return;
    }
    remotePreviewImageSrc.value = dataUrl;
  } catch (error) {
    remotePreviewError.value = errorMessage(error);
    actionError.value = errorMessage(error);
  } finally {
    remotePreviewLoading.value = false;
  }
}

async function previewActiveImage() {
  const pane = activeFtpWorkspacePane();
  const entry = selectedActivePaneEntry.value;
  if (!pane || !entry) return;
  if (pane.kind === 'local') {
    await previewLocalImage(entry);
    return;
  }
  await previewRemoteImage(entry);
}

async function previewRemoteText(entry = selectedRemoteEntry.value) {
  const pane = activeFtpWorkspacePane();
  const sessionId = pane?.kind === 'remote' ? pane.sessionId : activeSession.value?.sessionId;
  const session = sessionId ? ftpStore.sessions.find((item) => item.sessionId === sessionId) ?? activeSession.value : activeSession.value;
  if (!sessionId || !isEditableTextEntry(entry)) return;
  remotePreviewSource.value = 'remote';
  remotePreviewKind.value = 'text';
  remotePreviewDialogVisible.value = true;
  remotePreviewLoading.value = true;
  remotePreviewPath.value = entry.path;
  remotePreviewName.value = entry.name;
  resetRemotePreviewContent();
  actionError.value = '';
  try {
    remotePreviewText.value = await window.ftpApi.loadRemoteTextFile(
      sessionId,
      entry.path,
      REMOTE_TEXT_PREVIEW_MAX_BYTES,
    );
  } catch (error) {
    remotePreviewError.value = errorMessage(error);
    handleFtpOperationError(error, session, entry.path);
  } finally {
    remotePreviewLoading.value = false;
  }
}

async function openInternalEditor(kind: PanelKind, entry: FileTransferEntry) {
  if (kind === 'local') {
    await openLocalEditor(entry);
    return;
  }
  await openRemoteEditor(entry);
}

async function saveRemoteEditor() {
  if (!remoteEditorPath.value) return;
  remoteEditorSaving.value = true;
  actionError.value = '';
  try {
    if (editorTargetKind.value === 'local') {
      await window.shellApi.writeTextFile(remoteEditorPath.value, remoteEditorContent.value);
      await ftpStore.refreshLocalDirectory(ftpStore.localPath);
    } else {
      if (!activeSession.value) return;
      await window.ftpApi.saveRemoteTextFile(activeSession.value.sessionId, remoteEditorPath.value, remoteEditorContent.value);
      await refreshPrimaryRemoteDirectory();
    }
    remoteEditorOriginalContent.value = remoteEditorContent.value;
    remoteEditorDialogVisible.value = false;
  } catch (error) {
    handleFtpOperationError(error);
  } finally {
    remoteEditorSaving.value = false;
  }
}

async function openLocalExternalEditor(entry = selectedLocalEntry.value) {
  if (!entry || entry.isDir) return;
  actionError.value = '';
  try {
    const result = await window.shellApi.openPath(entry.path);
    if (result) {
      actionError.value = result;
    }
  } catch (error) {
    actionError.value = errorMessage(error);
  }
}

async function openRemoteExternalEditor(entry = selectedRemoteEntry.value) {
  const pane = activeFtpWorkspacePane();
  const sessionId = pane?.kind === 'remote' ? pane.sessionId : activeSession.value?.sessionId;
  const session = sessionId ? ftpStore.sessions.find((item) => item.sessionId === sessionId) ?? activeSession.value : activeSession.value;
  if (!sessionId || !isEditableTextEntry(entry)) return;
  actionError.value = '';
  try {
    const tempPath = await window.ftpApi.openExternalEditorDraft(sessionId, entry.path, {
      editorPath: externalEditorPath.value || undefined,
      cleanupOnClose: cleanupExternalDraftsOnClose.value,
    });
    if (!externalEditorPath.value) {
      await window.shellApi.openPath(tempPath);
    }
  } catch (error) {
    handleFtpOperationError(error, session, entry.path);
  }
}

async function openExternalEditor() {
  const pane = activeFtpWorkspacePane();
  const entry = selectedActivePaneEntry.value;
  if (!entry) return;
  if (pane?.kind === 'local') {
    await openLocalExternalEditor(entry);
    return;
  }
  await openRemoteExternalEditor(entry);
}

async function openExternalEditorForEntry(kind: PanelKind, entry: FileTransferEntry) {
  if (kind === 'local') {
    await openLocalExternalEditor(entry);
    return;
  }
  await openRemoteExternalEditor(entry);
}

function canOpenTerminalForPanel(panel: PanelKind) {
  return Boolean(resolveTerminalOpenTarget(panel));
}

async function openTerminalForPanel(panel: PanelKind | ActiveBrowserPanel = activeBrowserPanel.value) {
  const target = resolveTerminalOpenTarget(panel);
  if (!target) {
    actionError.value = panel === activeBrowserPanel.value
      ? terminalOpenTooltip.value
      : panel === 'local'
        ? '当前本地目录不可用'
        : '当前远程连接未绑定 SSH Profile';
    return;
  }
  actionError.value = '';
  try {
    const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (target.kind === 'local') {
      await router.push({
        path: '/terminal',
        query: {
          tab: 'terminal',
          openTerminalRequestId: requestId,
          openLocalCwd: target.path,
        },
      });
      return;
    }

    await router.push({
      path: '/terminal',
      query: {
        tab: 'ssh',
        openTerminalRequestId: requestId,
        connectSshProfileId: target.sshProfileId,
        cwd: target.path,
      },
    });
  } catch (error) {
    actionError.value = errorMessage(error);
  }
}

async function openTerminalForCurrentFtp() {
  await openTerminalForPanel(activeBrowserPanel.value);
}

async function changeRemotePermissions(entry = selectedRemoteEntry.value) {
  const pane = activeFtpWorkspacePane();
  const sessionId = pane?.kind === 'remote' ? pane.sessionId : activeSession.value?.sessionId;
  if (!entry || !sessionId) return;
  permissionDialogSessionId.value = sessionId;
  permissionDialogTargetPath.value = entry.path;
  permissionDialogTargetLabel.value = entry.name;
  applyPermissionMode(parsePermissionMode(entry.permissions));
  permissionDialogVisible.value = true;
}

async function reloadScheduledTasks() {
  scheduledTasks.value = await window.ftpApi.listScheduledTasks();
}

async function reloadPendingExternalPaths() {
  pendingExternalPaths.value = await window.ftpApi.getPendingExternalPaths();
}

function formatScheduledTaskRule(task: FtpScheduledTask) {
  switch (task.scheduleType) {
    case 'once':
      return `单次执行 · ${task.onceAt ? formatTime(task.onceAt) : '未设置时间'}`;
    case 'hourly':
      return `每隔 ${task.intervalHours || 1} 小时执行`;
    case 'daily':
      return `每日 ${task.timeOfDay || '09:00'} 执行`;
    case 'weekly': {
      const weekDay = weekDayOptions.find((item) => item.value === (task.dayOfWeek ?? 1))?.label || '周一';
      return `${weekDay} ${task.timeOfDay || '09:00'} 执行`;
    }
    case 'cron':
      return `Cron · ${task.cronExpression || '未设置表达式'}`;
    default:
      return '未设置计划';
  }
}

function openScheduleDialog(task?: FtpScheduledTask) {
  editingScheduledTaskId.value = task?.id ?? '';
  scheduleForm.value = {
    id: task?.id,
    label: task?.label ?? '',
    profileId: task?.profileId ?? ftpStore.profiles[0]?.id ?? '',
    direction: task?.direction ?? 'upload',
    localPath: task?.localPath ?? ftpStore.localPath,
    remotePath: task?.remotePath ?? (ftpStore.remotePath || activeSession.value?.remoteRoot || '/'),
    scheduleType: task?.scheduleType ?? 'once',
    conflictPolicy: task?.conflictPolicy ?? 'skip',
    enabled: task?.enabled ?? true,
    includeSubdirectories: task?.includeSubdirectories ?? true,
    onceAt: task?.onceAt,
    intervalHours: task?.intervalHours ?? 1,
    timeOfDay: task?.timeOfDay ?? '09:00',
    dayOfWeek: task?.dayOfWeek ?? 1,
    cronExpression: task?.cronExpression ?? '0 2 * * *',
  };
  scheduleDialogVisible.value = true;
}

async function saveScheduledTask() {
  actionError.value = '';
  try {
    await window.ftpApi.upsertScheduledTask({
      ...scheduleForm.value,
      id: editingScheduledTaskId.value || undefined,
    });
    await reloadScheduledTasks();
    scheduleDialogVisible.value = false;
  } catch (error) {
    handleFtpOperationError(error);
  }
}

async function deleteScheduledTask(taskId: string) {
  const confirmed = await showConfirm({
    title: '删除计划任务',
    message: '确认删除这个定时传输任务吗？',
    confirmText: '删除',
    danger: true,
  });
  if (!confirmed) return;
  await window.ftpApi.deleteScheduledTask(taskId);
  await reloadScheduledTasks();
}

async function runScheduledTaskNow(taskId: string) {
  actionError.value = '';
  try {
    const task = await window.ftpApi.runScheduledTaskNow(taskId);
    await reloadScheduledTasks();
    openTransferQueuePanel();
    if (!expandedTaskIds.value.includes(task.id)) {
      expandedTaskIds.value = [...expandedTaskIds.value, task.id];
    }
  } catch (error) {
    handleFtpOperationError(error);
  }
}

async function uploadPendingExternalPaths() {
  const pane = activeRemoteWorkspacePane.value;
  if (!pane?.sessionId || !pendingExternalPaths.value.length) return;
  const session = ftpStore.sessions.find((item) => item.sessionId === pane.sessionId) ?? null;
  if (!session) return;
  const targetBasePath = pane.path || session.remoteRoot;
  actionError.value = '';
  try {
    for (const itemPath of pendingExternalPaths.value) {
      const fileName = itemPath.split(/[\\/]/).filter(Boolean).pop();
      if (!fileName) continue;
      await ftpStore.uploadFileToSession(
        session.sessionId,
        itemPath,
        joinRemotePath(targetBasePath, fileName),
      );
    }
    await refreshFtpWorkspacePaneDirectory(pane.key, targetBasePath);
    await window.ftpApi.clearPendingExternalPaths(pendingExternalPaths.value);
    pendingExternalPaths.value = [];
  } catch (error) {
    handleFtpOperationError(error);
  }
}

async function discardPendingExternalPaths() {
  await window.ftpApi.clearPendingExternalPaths(pendingExternalPaths.value);
  pendingExternalPaths.value = [];
}

function focusTaskFromRoute(taskId: string) {
  const matchedTask = ftpStore.transferTasks.find((item) => item.id === taskId);
  if (!matchedTask) return;
  if (matchedTask.sessionId && ftpStore.sessions.some((item) => item.sessionId === matchedTask.sessionId)) {
    ftpStore.focusSession(matchedTask.sessionId);
  }
  openTransferQueuePanel();
  if (!expandedTaskIds.value.includes(taskId)) {
    expandedTaskIds.value = [...expandedTaskIds.value, taskId];
  }
}

function loadPanelLayout() {
  try {
    const raw = window.localStorage.getItem(FTP_LAYOUT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<{
      mode: PanelLayoutMode | 'columns' | 'stacked';
      sidebarDockSide: SidebarDockSide;
      auxiliaryDockSide: AuxiliaryDockSide;
      auxiliaryDockSize: string;
      showSidebar: boolean;
      auxCollapsed: boolean;
    }>;
    if (parsed.mode === 'columns') {
      panelLayoutMode.value = 'split-vertical';
    } else if (parsed.mode === 'stacked') {
      panelLayoutMode.value = 'split-horizontal';
    } else if (ftpWorkspaceLayoutOptions.some((option) => option.value === parsed.mode)) {
      panelLayoutMode.value = parsed.mode;
    }
    sidebarDockSide.value = parsed.sidebarDockSide === 'right' ? 'right' : 'left';
    auxiliaryDockSide.value = parsed.auxiliaryDockSide === 'right' ? 'right' : 'bottom';
    auxiliaryDockSize.value = normalizePanelSize(parsed.auxiliaryDockSize, 180, '260');
    showSidebarPanel.value = parsed.showSidebar ?? true;
    auxiliaryDockCollapsed.value = parsed.auxCollapsed ?? false;
    showLogPanel.value = true;
  } catch {
    panelLayoutMode.value = 'split-vertical';
    sidebarDockSide.value = 'left';
    auxiliaryDockSide.value = 'bottom';
    auxiliaryDockSize.value = '260';
    showSidebarPanel.value = true;
    auxiliaryDockCollapsed.value = false;
    showLogPanel.value = true;
  }
}

function persistPanelLayout() {
  window.localStorage.setItem(FTP_LAYOUT_STORAGE_KEY, JSON.stringify({
    mode: panelLayoutMode.value,
    sidebarDockSide: sidebarDockSide.value,
    auxiliaryDockSide: auxiliaryDockSide.value,
    auxiliaryDockSize: auxiliaryDockSize.value,
    showSidebar: showSidebarPanel.value,
    auxCollapsed: auxiliaryDockCollapsed.value,
  }));
}

function toggleAuxiliaryDockCollapsed() {
  auxiliaryDockCollapsed.value = !auxiliaryDockCollapsed.value;
}

function openTransferQueuePanel() {
  auxiliaryDockCollapsed.value = false;
  auxDockActiveTab.value = 'queue';
}

function updateViewportState() {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
}

function formatLogTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatTaskEta(task: TransferTask) {
  if (!['pending', 'retrying', 'transferring'].includes(task.status)) return '';
  if (task.speedBytesPerSec <= 0 || task.fileSize <= 0) return '';
  const remaining = Math.max(0, task.fileSize - task.transferredSize);
  if (!remaining) return '即将完成';
  const seconds = Math.ceil(remaining / task.speedBytesPerSec);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return restSeconds ? `${minutes}m ${restSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

function loadFtpPreferences() {
  try {
    const raw = window.localStorage.getItem(FTP_PREFERENCES_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<{
      externalEditorPath: string;
      cleanupExternalDraftsOnClose: boolean;
      linkNavigationEnabled: boolean;
      localPanelViewMode: PanelViewMode;
      remotePanelViewMode: PanelViewMode;
    }>;
    externalEditorPath.value = typeof parsed.externalEditorPath === 'string' ? parsed.externalEditorPath : '';
    cleanupExternalDraftsOnClose.value = Boolean(parsed.cleanupExternalDraftsOnClose);
    linkNavigationEnabled.value = Boolean(parsed.linkNavigationEnabled);
    localPanelViewMode.value = parsed.localPanelViewMode === 'list' ? 'list' : 'details';
    remotePanelViewMode.value = parsed.remotePanelViewMode === 'list' ? 'list' : 'details';
  } catch {
    externalEditorPath.value = '';
    cleanupExternalDraftsOnClose.value = false;
    linkNavigationEnabled.value = false;
    localPanelViewMode.value = 'details';
    remotePanelViewMode.value = 'details';
  }
}

function persistFtpPreferences() {
  window.localStorage.setItem(FTP_PREFERENCES_STORAGE_KEY, JSON.stringify({
    externalEditorPath: externalEditorPath.value,
    cleanupExternalDraftsOnClose: cleanupExternalDraftsOnClose.value,
    linkNavigationEnabled: linkNavigationEnabled.value,
    localPanelViewMode: localPanelViewMode.value,
    remotePanelViewMode: remotePanelViewMode.value,
  }));
}

function normalizePanelSize(value: string | undefined, min: number, fallback: string) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return String(Math.max(min, parsed));
}

async function openLocalBreadcrumb(path: string) {
  await ftpStore.refreshLocalDirectory(path);
}

async function openRemoteBreadcrumb(path: string) {
  if (!activeSession.value) return;
  await refreshPrimaryRemoteDirectory(path);
}

function normalizeRemoteDirectoryPath(path: string) {
  const normalized = `/${(path || '/').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return normalized === '/' ? '/' : normalized.replace(/\/{2,}/g, '/');
}

function isRemotePathWithin(path: string, parentPath: string) {
  if (parentPath === '/') return path.startsWith('/');
  return path === parentPath || path.startsWith(`${parentPath}/`);
}

function remoteTransferAffectsDirectory(taskRemotePath: string, directoryPath: string) {
  const targetPath = normalizeRemoteDirectoryPath(taskRemotePath);
  const currentDirectory = normalizeRemoteDirectoryPath(directoryPath);
  const targetParent = normalizeRemoteDirectoryPath(parentRemotePath(targetPath));
  return currentDirectory === targetParent
    || isRemotePathWithin(currentDirectory, targetPath)
    || isRemotePathWithin(targetPath, currentDirectory);
}

function shouldRefreshRemoteDirectoryForTask(task: TransferTaskRefreshSnapshot) {
  return ['upload', 'fxp', 'remote_copy'].includes(task.direction) && task.status === 'completed' && Boolean(task.remotePath);
}

function queueRemoteDirectoryRefresh(panel: RemoteRefreshTarget['panel'], sessionId: string, path: string) {
  if (!sessionId || !path) return;
  const normalizedPath = normalizeRemoteDirectoryPath(path);
  const key = `${panel}:${sessionId}:${normalizedPath}`;
  pendingRemoteRefreshTargets.set(key, { panel, sessionId, path: normalizedPath });
  if (remoteRefreshTimer !== null) return;
  remoteRefreshTimer = window.setTimeout(() => {
    remoteRefreshTimer = null;
    void flushRemoteDirectoryRefreshes();
  }, 180);
}

async function flushRemoteDirectoryRefreshes() {
  const targets = [...pendingRemoteRefreshTargets.values()];
  pendingRemoteRefreshTargets.clear();
  for (const target of targets) {
    const pane = findFtpWorkspacePane(target.panel);
    if (!pane || pane.kind !== 'remote' || pane.sessionId !== target.sessionId) continue;
    if (normalizeRemoteDirectoryPath(pane.path) !== target.path) continue;
    await refreshFtpWorkspacePaneDirectory(pane.key, target.path);
  }
}

function refreshVisibleRemoteDirectoriesForCompletedTask(task: TransferTaskRefreshSnapshot) {
  if (!shouldRefreshRemoteDirectoryForTask(task)) return;

  for (const pane of ftpWorkspacePanes.value) {
    if (pane.kind !== 'remote' || !pane.sessionId) continue;
    if (task.direction === 'upload' && task.sessionId !== pane.sessionId) continue;
    if (!remoteTransferAffectsDirectory(task.remotePath, pane.path || '/')) continue;
    queueRemoteDirectoryRefresh(pane.key, pane.sessionId, pane.path || '/');
  }
}

function applyPermissionMode(mode: string) {
  permissionModeInput.value = mode;
  const digits = mode.padStart(3, '0').slice(-3).split('').map((digit) => Number(digit) || 0);
  permissionMatrix.value = permissionMatrix.value.map((bucket, index) => ({
    ...bucket,
    read: Boolean(digits[index] & 4),
    write: Boolean(digits[index] & 2),
    execute: Boolean(digits[index] & 1),
  }));
}

function syncPermissionModeFromMatrix() {
  permissionModeInput.value = permissionMatrix.value
    .map((bucket) => (
      (bucket.read ? 4 : 0)
      + (bucket.write ? 2 : 0)
      + (bucket.execute ? 1 : 0)
    ))
    .join('');
}

function updatePermissionMatrix(bucketKey: string, field: 'read' | 'write' | 'execute', checked: boolean) {
  permissionMatrix.value = permissionMatrix.value.map((bucket) => (
    bucket.key === bucketKey
      ? { ...bucket, [field]: checked }
      : bucket
  ));
  syncPermissionModeFromMatrix();
}

function handlePermissionModeInput(value: string) {
  const normalized = value.replace(/\D/g, '').slice(-3) || '000';
  applyPermissionMode(normalized);
}

async function applyRemotePermissionDialog() {
  if (!permissionDialogTargetPath.value || !permissionDialogSessionId.value) return;
  actionError.value = '';
  try {
    await window.ftpApi.chmodRemotePath(permissionDialogSessionId.value, permissionDialogTargetPath.value, permissionModeInput.value);
    const pane = ftpWorkspacePanes.value.find((item) => item.sessionId === permissionDialogSessionId.value);
    if (pane) {
      await refreshFtpWorkspacePaneDirectory(pane.key, pane.path);
    }
    permissionDialogVisible.value = false;
  } catch (error) {
    handleFtpOperationError(error);
  }
}

function parsePermissionMode(value?: string) {
  const raw = (value || '').trim();
  const octal = raw.match(/([0-7]{3,4})$/);
  if (octal) {
    return octal[1].slice(-3);
  }
  const symbolic = raw.slice(-9);
  if (/^[rwx-]{9}$/i.test(symbolic)) {
    return [symbolic.slice(0, 3), symbolic.slice(3, 6), symbolic.slice(6, 9)]
      .map((chunk) => (
        (chunk[0] === 'r' ? 4 : 0)
        + (chunk[1] === 'w' ? 2 : 0)
        + (/[xs]/i.test(chunk[2]) ? 1 : 0)
      ))
      .join('');
  }
  return '644';
}

async function copySelectionInfo(kind: 'local' | 'remote') {
  const entries = kind === 'local' ? selectedLocalEntries.value : selectedRemoteEntries.value;
  if (!entries.length) return;
  const content = entries.map((entry) => formatEntryInfo(entry)).join('\n\n');
  await window.shellApi.writeClipboardText(content);
}

function formatEntryInfo(entry: FileTransferEntry) {
  return [
    `名称: ${entry.name}`,
    `路径: ${entry.path}`,
    `类型: ${entry.isDir ? '目录' : '文件'}`,
    `来源: ${entry.source}`,
    `大小: ${entry.isDir ? '--' : formatSize(entry.size)}`,
    `修改时间: ${entry.modifiedAt ? formatTime(entry.modifiedAt) : '--'}`,
    `权限: ${entry.permissions || '--'}`,
    `所有者: ${entry.owner || '--'}`,
  ].join('\n');
}

async function pasteClipboardToRemote(panel = activeBrowserPanel.value) {
  const target = resolveRemotePasteTarget(panel);
  if (!target) return;
  setActiveBrowserPanel(target.panel);
  actionError.value = '';
  const paths = await window.shellApi.readClipboardPaths();
  if (!paths.length) {
    actionError.value = '剪贴板中没有可上传的本地文件或目录路径';
    return;
  }
  for (const itemPath of paths) {
    const fileName = itemPath.split(/[\\/]/).filter(Boolean).pop();
    if (!fileName) continue;
    await ftpStore.uploadFileToSession(
      target.sessionId,
      itemPath,
      joinRemotePath(target.remotePath || target.remoteRoot, fileName),
    );
  }
  await refreshFtpWorkspacePaneDirectory(target.panel, target.remotePath || target.remoteRoot);
}

function rememberClosedSession(sessionId: string) {
  const session = ftpStore.sessions.find((item) => item.sessionId === sessionId);
  if (!session) return;
  const restoreState = ftpStore.restoreStates.find((item) => item.sessionId === session.profileId);
  recentlyClosedSessions.value = [
    {
      profileId: session.profileId,
      profileLabel: session.profileLabel,
      localPath: restoreState?.localPath || session.localRoot,
      remotePath: restoreState?.remotePath || session.remoteRoot,
    },
    ...recentlyClosedSessions.value.filter((item) => item.profileId !== session.profileId),
  ].slice(0, 8);
}

function handleSessionTabDragStart(sessionId: string) {
  draggedSessionId.value = sessionId;
}

async function handleSessionTabDrop(targetSessionId: string) {
  const sourceSessionId = draggedSessionId.value;
  draggedSessionId.value = '';
  if (!sourceSessionId || sourceSessionId === targetSessionId) return;
  const nextIds = sessionTabs.value.map((session) => session.sessionId);
  const sourceIndex = nextIds.indexOf(sourceSessionId);
  const targetIndex = nextIds.indexOf(targetSessionId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  nextIds.splice(sourceIndex, 1);
  nextIds.splice(targetIndex, 0, sourceSessionId);
  await ftpStore.reorderSessions(nextIds);
}

function openSessionTabContextMenu(event: MouseEvent, sessionId: string) {
  const session = sessionTabs.value.find((item) => item.sessionId === sessionId);
  if (!session) return;
  const sessionIndex = sessionTabs.value.findIndex((item) => item.sessionId === sessionId);
  const hasClosedSession = Boolean(recentlyClosedSessions.value.length);
  const reconnectProfile = ftpStore.profiles.find((profile) => profile.id === session.profileId) ?? null;
  openContextMenu(event.clientX, event.clientY, [
    {
      id: `ftp-tab-reconnect-${sessionId}`,
      label: '重连',
      icon: OpenIcon,
      disabled: !reconnectProfile,
      action: () => {
        if (reconnectProfile) {
          disconnectedSessionNotice.value = {
            sessionId: session.sessionId,
            profileId: session.profileId,
            label: session.profileLabel,
            remotePath: sessionRemotePaths.value[session.sessionId] || session.remoteRoot,
            message: '用户手动重连',
          };
          void reconnectDisconnectedSession();
        }
      },
    },
    {
      id: `ftp-tab-close-${sessionId}`,
      label: '关闭标签',
      icon: DeleteIcon,
      divided: true,
      action: () => {
        void disconnectSession(sessionId);
      },
    },
    {
      id: `ftp-tab-close-others-${sessionId}`,
      label: '关闭其他标签',
      icon: DeleteIcon,
      disabled: sessionTabs.value.length <= 1,
      action: () => {
        void closeOtherSessionTabs(sessionId);
      },
    },
    {
      id: `ftp-tab-close-right-${sessionId}`,
      label: '关闭右侧标签',
      icon: DeleteIcon,
      disabled: sessionIndex < 0 || sessionIndex === sessionTabs.value.length - 1,
      action: () => {
        void closeSessionTabsToRight(sessionId);
      },
    },
    {
      id: `ftp-tab-reopen-last`,
      label: hasClosedSession ? `重新打开 ${recentlyClosedSessions.value[0]?.profileLabel}` : '重新打开最近关闭标签',
      icon: OpenIcon,
      disabled: !hasClosedSession,
      divided: true,
      action: () => {
        void reopenLastClosedSession();
      },
    },
  ]);
}

async function compareCurrentDirectories() {
  if (!activeSession.value) {
    syncComparisonItems.value = [];
    syncSelectedKeys.value = [];
    syncComparisonExpanded.value = false;
    checksumCompareRunning.value = false;
    return;
  }
  busyMessage.value = recursiveCompareEnabled.value ? '正在递归比较目录...' : '正在比较当前目录...';
  actionError.value = '';
  checksumCompareRunning.value = false;
  try {
    syncComparisonItems.value = recursiveCompareEnabled.value
      ? await buildRecursiveSyncComparisonItems({
        sessionId: activeSession.value.sessionId,
        localRootPath: ftpStore.localPath,
        remoteRootPath: ftpStore.remotePath || activeSession.value.remoteRoot,
      })
      : buildSyncComparisonItems(ftpStore.localEntries, ftpStore.remoteEntries);
    if (checksumCompareEnabled.value) {
      busyMessage.value = '正在校验文件内容...';
      checksumCompareRunning.value = true;
      syncComparisonItems.value = await verifySyncComparisonContent(
        syncComparisonItems.value,
        activeSession.value.sessionId,
      );
    }
    syncSelectedKeys.value = syncComparisonItems.value
      .filter((item) => determineSyncAction(item, syncDirection.value, syncConflictPolicy.value) !== 'skip')
      .map((item) => item.key);
    syncComparisonExpanded.value = true;
  } catch (error) {
    handleFtpOperationError(error);
  } finally {
    checksumCompareRunning.value = false;
    busyMessage.value = '';
  }
}

function openTransferSettingsPage() {
  syncPanelVisible.value = false;
  settingsStore.setActiveSettingsTab('file-transfer');
  void router.push('/settings');
}

function openSyncPanel() {
  syncPanelVisible.value = true;
  if (activeSession.value) {
    void compareCurrentDirectories();
    return;
  }

  syncComparisonItems.value = [];
  syncComparisonExpanded.value = false;
}

async function executeSyncPreview() {
  if (!activeSession.value || !syncExecutableCount.value) return;
  const confirmed = await showConfirm({
    title: '执行同步',
    message: `将执行 ${syncExecutableCount.value} 项同步操作，确认继续吗？`,
    confirmText: '开始同步',
  });
  if (!confirmed) return;

  syncExecuting.value = true;
  syncCancelRequested.value = false;
  actionError.value = '';
  const itemsToExecute = [...selectedSyncPreviewItems.value];
  syncExecutionTotal.value = itemsToExecute.length;
  syncExecutionCurrentIndex.value = 0;
  syncExecutionLabel.value = '';
  busyMessage.value = '正在执行目录同步...';
  try {
    for (const [index, item] of itemsToExecute.entries()) {
      if (syncCancelRequested.value) {
        break;
      }
      syncExecutionCurrentIndex.value = index;
      syncExecutionLabel.value = `${syncActionLabel(item.action)} · ${item.relativePath}`;
      await executeSyncAction(item);
      syncExecutionCurrentIndex.value = index + 1;
    }
    await Promise.all([
      ftpStore.refreshLocalDirectory(),
      refreshPrimaryRemoteDirectory(),
    ]);
    await compareCurrentDirectories();
  } catch (error) {
    handleFtpOperationError(error);
  } finally {
    syncExecuting.value = false;
    syncExecutionLabel.value = '';
    busyMessage.value = '';
  }
}

function cancelSyncExecution() {
  if (!syncExecuting.value) return;
  syncCancelRequested.value = true;
}

function toggleSyncPreviewItem(key: string) {
  const item = syncPreviewItems.value.find((previewItem) => previewItem.key === key);
  if (!item || item.action === 'skip') return;
  syncSelectedKeys.value = syncSelectedKeys.value.includes(key)
    ? syncSelectedKeys.value.filter((currentKey) => currentKey !== key)
    : [...syncSelectedKeys.value, key];
}

function setAllSyncPreviewItems(selected: boolean) {
  if (!selected) {
    syncSelectedKeys.value = [];
    return;
  }
  syncSelectedKeys.value = syncPreviewItems.value
    .filter((item) => item.action !== 'skip')
    .map((item) => item.key);
}

async function executeSyncAction(item: SyncPreviewItem) {
  const remoteTargetPath = joinRemotePath(ftpStore.remotePath || activeSession.value?.remoteRoot || '/', item.relativePath);
  const localTargetPath = joinLocalPath(ftpStore.localPath, item.relativePath);

  if (item.action === 'upload') {
    if (!item.localEntry) return;
    await ftpStore.uploadFile(item.localEntry.path, remoteTargetPath);
    return;
  }
  if (item.action === 'download') {
    if (!item.remoteEntry) return;
    await ftpStore.downloadFile(item.remoteEntry.path, localTargetPath);
    return;
  }
  if (item.action === 'deleteRemote') {
    if (!item.remoteEntry) return;
    await ftpStore.deleteRemotePath(item.remoteEntry.path);
    return;
  }
  if (item.action === 'deleteLocal') {
    if (!item.localEntry) return;
    await ftpStore.deleteLocalPath(item.localEntry.path);
    return;
  }
  if (item.action === 'replaceRemote') {
    if (item.remoteEntry) {
      await ftpStore.deleteRemotePath(item.remoteEntry.path);
    }
    if (item.localEntry) {
      await ftpStore.uploadFile(item.localEntry.path, remoteTargetPath);
    }
    return;
  }
  if (item.action === 'replaceLocal') {
    if (item.localEntry) {
      await ftpStore.deleteLocalPath(item.localEntry.path);
    }
    if (item.remoteEntry) {
      await ftpStore.downloadFile(item.remoteEntry.path, localTargetPath);
    }
  }
}

async function syncRemotePanelToChild(entryName: string) {
  if (!linkNavigationEnabled.value || !activeSession.value) return;
  const matchedEntry = ftpStore.remoteEntries.find((entry) => entry.isDir && entry.name === entryName);
  if (!matchedEntry) return;
  await refreshPrimaryRemoteDirectory(matchedEntry.path);
}

async function syncLocalPanelToChild(entryName: string) {
  if (!linkNavigationEnabled.value) return;
  const matchedEntry = ftpStore.localEntries.find((entry) => entry.isDir && entry.name === entryName);
  if (!matchedEntry) return;
  await ftpStore.refreshLocalDirectory(matchedEntry.path);
}

async function syncRemotePanelToParent() {
  if (!linkNavigationEnabled.value || !activeSession.value) return;
  await refreshPrimaryRemoteDirectory(parentRemotePath(ftpStore.remotePath || activeSession.value.remoteRoot));
}

async function syncLocalPanelToParent() {
  if (!linkNavigationEnabled.value) return;
  await ftpStore.refreshLocalDirectory(parentLocalPath(ftpStore.localPath));
}

function isTaskExpanded(taskId: string) {
  return expandedTaskIds.value.includes(taskId);
}

function toggleTaskExpanded(taskId: string) {
  expandedTaskIds.value = expandedTaskIds.value.includes(taskId)
    ? expandedTaskIds.value.filter((id) => id !== taskId)
    : [...expandedTaskIds.value, taskId];
}

function toggleTaskSortDirection() {
  taskSortDirection.value = taskSortDirection.value === 'asc' ? 'desc' : 'asc';
}

async function disconnectSession(sessionId: string, remember = true) {
  actionError.value = '';
  busyMessage.value = '正在断开连接...';
  const session = ftpStore.sessions.find((item) => item.sessionId === sessionId) ?? null;
  try {
    if (remember) {
      rememberClosedSession(sessionId);
    }
    await ftpStore.disconnect(sessionId);
  } catch (error) {
    handleFtpOperationError(error, session);
  } finally {
    busyMessage.value = '';
  }
}

async function closeOtherSessionTabs(sessionId: string) {
  const otherSessionIds = sessionTabs.value
    .filter((session) => session.sessionId !== sessionId)
    .map((session) => session.sessionId);
  for (const otherSessionId of otherSessionIds) {
    await disconnectSession(otherSessionId);
  }
}

async function closeSessionTabsToRight(sessionId: string) {
  const startIndex = sessionTabs.value.findIndex((session) => session.sessionId === sessionId);
  if (startIndex < 0) return;
  const targets = sessionTabs.value.slice(startIndex + 1).map((session) => session.sessionId);
  for (const target of targets) {
    await disconnectSession(target);
  }
}

async function reopenLastClosedSession() {
  const snapshot = recentlyClosedSessions.value[0];
  if (!snapshot) return;
  actionError.value = '';
  busyMessage.value = `正在重新打开 ${snapshot.profileLabel}...`;
  try {
    await ftpStore.connect({ profileId: snapshot.profileId });
    if (snapshot.localPath) {
      await ftpStore.refreshLocalDirectory(snapshot.localPath);
    }
    if (snapshot.remotePath) {
      await refreshPrimaryRemoteDirectory(snapshot.remotePath);
    }
    recentlyClosedSessions.value = recentlyClosedSessions.value.slice(1);
  } catch (error) {
    handleFtpOperationError(error);
  } finally {
    busyMessage.value = '';
  }
}

async function updateTaskPriority(taskId: string, priority: string) {
  await ftpStore.updateTaskPriority(taskId, priority);
}

async function pauseTask(taskId: string) {
  await ftpStore.pauseTask(taskId);
}

async function resumeTask(taskId: string) {
  await ftpStore.resumeTask(taskId);
}

async function retryTask(taskId: string) {
  await ftpStore.retryTask(taskId);
}

async function pauseAllTasks() {
  await ftpStore.pauseAllTasks();
}

async function resumeAllTasks() {
  await ftpStore.resumeAllTasks();
}

async function deleteTransferTask(taskId: string) {
  await ftpStore.deleteTransferTask(taskId);
}

async function deleteCompletedTasks() {
  const completedTaskIds = ftpStore.transferTasks
    .filter((task) => task.status === 'completed')
    .map((task) => task.id);

  for (const taskId of completedTaskIds) {
    await deleteTransferTask(taskId);
  }
}

watch(() => ftpStore.transferTasks.map((task) => task.id), (taskIds, previousTaskIds) => {
  expandedTaskIds.value = expandedTaskIds.value.filter((id) => taskIds.includes(id));
  autoExpandedTreeTaskIds.value = autoExpandedTreeTaskIds.value.filter((id) => taskIds.includes(id));
  if (!transferTaskListWatcherInitialized) {
    transferTaskListWatcherInitialized = true;
    return;
  }
  if (!ftpStore.initialized) return;
  const previousTaskIdSet = new Set(previousTaskIds ?? []);
  const hasNewTask = taskIds.some((taskId) => !previousTaskIdSet.has(taskId));
  if (hasNewTask) {
    openTransferQueuePanel();
  }
}, { immediate: true });

watch(
  () => ftpStore.transferTasks.map((task) => ({
    id: task.id,
    hasTree: Boolean(task.transferTreeJson),
  })),
  (tasks) => {
    const treeTaskIds = tasks.filter((task) => task.hasTree).map((task) => task.id);
    const nextAutoExpandedIds = treeTaskIds.filter((taskId) => !autoExpandedTreeTaskIds.value.includes(taskId));
    if (!nextAutoExpandedIds.length) return;
    autoExpandedTreeTaskIds.value = [...autoExpandedTreeTaskIds.value, ...nextAutoExpandedIds];
    expandedTaskIds.value = [...new Set([...expandedTaskIds.value, ...nextAutoExpandedIds])];
    openTransferQueuePanel();
  },
  { immediate: true },
);

watch(
  () => ftpStore.transferTasks.map((task): TransferTaskRefreshSnapshot => ({
    id: task.id,
    status: task.status,
    direction: task.direction,
    sessionId: task.sessionId,
    remotePath: task.remotePath,
  })),
  (tasks, previousTasks) => {
    if (!transferTaskRefreshWatcherInitialized) {
      transferTaskRefreshWatcherInitialized = true;
      return;
    }
    const previousStatusById = new Map((previousTasks ?? []).map((task) => [task.id, task.status]));
    for (const task of tasks) {
      if (task.status !== 'completed') continue;
      if (previousStatusById.get(task.id) === 'completed') continue;
      refreshVisibleRemoteDirectoriesForCompletedTask(task);
    }
  },
  { immediate: true },
);

watch(
  [() => route.query.taskId, () => ftpStore.transferTasks.length],
  ([taskId]) => {
    if (typeof taskId === 'string' && taskId) {
      focusTaskFromRoute(taskId);
    }
  },
  { immediate: true },
);

watch(
  [
    panelLayoutMode,
    sidebarDockSide,
    auxiliaryDockSide,
    auxiliaryDockSize,
    auxiliaryDockCollapsed,
    showSidebarPanel,
    showLogPanel,
  ],
  () => {
    persistPanelLayout();
  },
  { immediate: false },
);

watch(ftpWorkspacePanes, (panes) => {
  if (!panes.length) return;
  if (!panes.some((pane) => pane.key === activeBrowserPanel.value)) {
    activeBrowserPanel.value = panes[0].key;
  }
}, { immediate: true });

watch(
  [
    externalEditorPath,
    cleanupExternalDraftsOnClose,
    linkNavigationEnabled,
    localPanelViewMode,
    remotePanelViewMode,
  ],
  () => {
    persistFtpPreferences();
  },
  { immediate: false },
);

watch(
  [
    () => activeSession.value?.sessionId || '',
    () => ftpStore.sessions.map((session) => session.sessionId).join('|'),
  ],
  () => {
    ensureRemoteWorkspacePanes();
  },
  { immediate: false },
);

watch(isDenseViewport, (dense, previousDense) => {
  if (!dense || dense === previousDense) return;
  auxDockActiveTab.value = 'queue';
});

watch(
  [
    () => route.name,
    () => ftpStore.initialized,
    () => ftpStore.pendingOpenRequest?.requestId || '',
    () => route.query.openConnectionLayoutRequestId || '',
    () => route.query.openConnectionLayoutId || '',
    () => ftpStore.sessions.map((session) => session.sessionId).join('|'),
  ],
  ([routeName, initialized]) => {
    if (routeName !== 'FileTransfer' || !initialized) return;
    void processPendingOpenRequest();
    void processFtpConnectionLayoutOpenRequest();
  },
  { immediate: false },
);

async function initializeFtpPage() {
  await initializePage();
  await ensureInitialFtpWorkspacePanes();
  await processPendingOpenRequest();
  await processFtpConnectionLayoutOpenRequest();
}

onMounted(() => {
  globalStore.setTopbarColor('');
  loadConnectionLayoutConfigs();
  window.addEventListener(CONNECTION_LAYOUTS_CHANGED_EVENT, loadConnectionLayoutConfigs);
  loadPanelLayout();
  loadFtpPreferences();
  updateViewportState();
  void reloadScheduledTasks();
  void reloadPendingExternalPaths();
  void initializeFtpPage();
  window.addEventListener('keydown', handleExplorerPasteShortcut);
  window.addEventListener('keydown', handleExplorerSelectAllShortcut);
  window.addEventListener('unhandledrejection', handleUnhandledFtpRejection);
  window.addEventListener('resize', updateViewportState);
});

onActivated(() => {
  loadPanelLayout();
  loadFtpPreferences();
});

onBeforeUnmount(() => {
  if (remoteRefreshTimer !== null) {
    window.clearTimeout(remoteRefreshTimer);
    remoteRefreshTimer = null;
  }
  pendingRemoteRefreshTargets.clear();
  window.removeEventListener(CONNECTION_LAYOUTS_CHANGED_EVENT, loadConnectionLayoutConfigs);
  window.removeEventListener('keydown', handleExplorerPasteShortcut);
  window.removeEventListener('keydown', handleExplorerSelectAllShortcut);
  window.removeEventListener('unhandledrejection', handleUnhandledFtpRejection);
  window.removeEventListener('resize', updateViewportState);
  stopAuxiliaryDockResize?.();
  stopFtpPaneResize();
  cancelFtpPanePointerDrag();
});
</script>

<template>
  <MainPageLayout
    :page-class="[
      'ftp-page',
      {
        'ftp-page--sidebar-hidden': !showSidebarPanel,
        'ftp-page--sidebar-right': sidebarDockSide === 'right',
        'ftp-page--dense': isDenseViewport,
      },
    ]"
    layout-class="ftp-layout"
    sidebar-class="ftp-sidebar"
    sidebar-collapsed-class="ftp-sidebar--collapsed"
    main-class="ftp-main"
    :stage-class="[
      'terminal-stage',
      `terminal-stage--${panelLayoutMode}`,
      'ftp-workspace-shell',
      {
        'terminal-stage--single': visibleFtpWorkspacePanes.length === 1,
        'ftp-workspace-shell--aux-right': auxiliaryDockSide === 'right',
        'ftp-workspace-shell--aux-bottom': auxiliaryDockSide === 'bottom',
      },
    ]"
    :sidebar-hidden="!showSidebarPanel"
    :sidebar-side="sidebarDockSide"
    :sidebar-collapsed="sidebarCollapsed"
    :style="{
      '--ftp-aux-dock-size': `${auxiliaryDockSize}px`,
    }"
  >
    <template #sidebar>
      <FtpConfigSidebar :sidebar-collapsed="sidebarCollapsed"
      :profiles-count="ftpStore.profiles.length" :sessions-count="ftpStore.sessions.length"
      :config-tree-nodes="configTreeNodes" :selected-config-tree-node-id="selectedConfigTreeNodeId"
      :config-tree-expanded-ids="configTreeExpandedIds" :sessions="ftpStore.sessions"
      :active-session-id="ftpStore.activeSessionId"
      :restore-failure-profiles="restoreFailureProfiles" :session-status-label="sessionStatusLabel"
      :session-status-tone="sessionStatusTone" @toggle-sidebar="toggleSidebarCollapsed"
      @create-local-connection="addLocalWorkspacePane()"
      @open-create-dialog="openCreateDialog($event)" @open-create-folder-dialog="openCreateFolderDialog($event)"
      @open-collapsed-configs-menu="openCollapsedConfigsMenu" @update:expandedIds="configTreeExpandedIds = $event"
      @select-config="handleConfigTreeSelect" @activate-config="handleConfigTreeActivate"
      @contextmenu-config="openConfigNodeContextMenu" @drop-config="handleConfigTreeDrop"
      @focus-session="focusRemoteWorkspacePane"
      @disconnect-session="disconnectSession" @reconnect-profile="connectProfile"
      @session-contextmenu="openSessionTabContextMenu($event.event, $event.sessionId)"
      @session-dragstart="handleSessionTabDragStart($event)" @session-drop="handleSessionTabDrop($event)" />
    </template>

    <template #main-before>
          <section class="terminal-toolbar ftp-toolbar">
            <div class="terminal-toolbar__left">
              <div class="terminal-toolbar__title">
                <span class="title-name">{{ activeFtpWorkspacePane()?.title ?? '文件传输' }}</span>
              </div>
            </div>
            <div class="terminal-toolbar__right ftp-hero__actions" aria-label="文件传输快捷操作">
              <span v-if="busyMessage" class="ftp-badge ftp-badge--accent ftp-hero__busy">{{ busyMessage }}</span>
              <UiSelect
                class="ftp-hero__layout-select"
                size="sm"
                :model-value="panelLayoutMode"
                :options="ftpWorkspaceLayoutOptions"
                @change="setFtpWorkspaceLayoutMode($event as TerminalLayoutMode)"
              />
              <UiSelect
                class="ftp-hero__layout-select"
                size="sm"
                :model-value="selectedConnectionLayoutId"
                :options="connectionLayoutOptions"
                @update:modelValue="handleFtpConnectionLayoutSelect"
              />
              <span v-tooltip="{ content: '删除选中的连接布局', placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" :disabled="!selectedConnectionLayoutId" title="删除选中的连接布局"
                  @click="deleteFtpConnectionLayout(selectedConnectionLayoutId)">
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: '保存当前连接布局', placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" title="保存当前连接布局" @click="openSaveFtpLayoutDialog">
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <path d="M17 21v-8H7v8" />
                    <path d="M7 3v5h8" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: '定时任务', placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" title="定时任务" @click="openScheduleDialog()">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="8" cy="8" r="6" />
                    <path d="M8 5v3l2 1.5" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: `恢复标签 · ${recentClosedSessionSummary}`, placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" :disabled="!recentlyClosedSessions.length"
                  :title="`恢复标签 · ${recentClosedSessionSummary}`" @click="reopenLastClosedSession()">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3.5 8A4.5 4.5 0 1 0 5 4.2L3.5 5.5" />
                    <path d="M3.5 2.8v2.7H6.2" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: '预览图片', placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" :disabled="!canPreviewActiveImage" title="预览图片"
                  @click="previewActiveImage()">
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: '预览文本', placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" :disabled="!canPreviewRemoteText" title="预览文本"
                  @click="previewRemoteText(selectedActivePaneEntry)">
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M8 13h8" />
                    <path d="M8 17h5" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: '编辑远程', placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" :disabled="!canEditRemoteFile" title="编辑远程"
                  @click="openRemoteEditor(selectedActivePaneEntry)">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 2.5l2.5 2.5-7 7-3 .5.5-3z" />
                    <path d="M9.5 4l2.5 2.5" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: '外部编辑', placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" :disabled="!canEditRemoteFile" title="外部编辑"
                  @click="openExternalEditor()">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 2h5v5M9 7l5-5M7 4H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: '修改权限', placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" :disabled="!canChmodRemoteFile" title="修改权限"
                  @click="changeRemotePermissions(selectedActivePaneEntry)">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 1L6 3v2L4.5 6.5A5 5 0 1 0 9.5 11.5L11 10h2l2-2-2-2h-1V4z" />
                    <circle cx="10" cy="10" r="1.5" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: terminalOpenTooltip, placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" :disabled="!canOpenTerminalFromFtp"
                  :title="terminalOpenTooltip" @click="openTerminalForCurrentFtp">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <rect x="1" y="2" width="14" height="12" rx="1.5" />
                    <path d="M4 6l3 2.5L4 11M9 11h3" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: '目录比较/同步', placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" title="目录比较/同步" @click="openSyncPanel">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 4h5v8H2zM9 4h5v8H9M7 8h2" />
                  </svg>
                </UiIconButton>
              </span>
              <span v-tooltip="{ content: '传输设置', placement: 'bottom' }">
                <UiIconButton size="sm" variant="ghost" title="传输设置" @click="openTransferSettingsPage">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="8" cy="8" r="2" />
                    <path
                      d="M8 1v2M8 13v2M1 8h2M13 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
                  </svg>
                </UiIconButton>
              </span>
            </div>
          </section>

          <div v-if="actionError" class="ftp-alert ftp-alert--error">
            <span>{{ actionError }}</span>
          </div>
          <div v-if="pendingExternalSummary" class="ftp-alert ftp-alert--info">
            <span>{{ pendingExternalSummary }}</span>
            <div class="ftp-alert__actions">
              <UiIconButton size="sm" variant="secondary" :disabled="!activeRemoteWorkspacePane" label="上传到当前远程"
                @click="uploadPendingExternalPaths()">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 11V3M4.5 6.5L8 3l3.5 3.5M3 13h10" />
                </svg>
              </UiIconButton>
              <UiIconButton size="sm" variant="ghost" label="忽略" @click="discardPendingExternalPaths()">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                  stroke-linecap="round">
                  <path d="M3 3l10 10M13 3 3 13" />
                </svg>
              </UiIconButton>
            </div>
          </div>
    </template>

    <template #stage>
        <div class="ftp-workspace">

          <div v-if="panelLayoutMode === 'tabbed' && orderedFtpWorkspacePanes.length > 1" class="terminal-pane-tabs ftp-workspace-tabs">
            <button
              v-for="pane in orderedFtpWorkspacePanes"
              :key="pane.key"
              type="button"
              class="terminal-pane-tab"
              :data-ftp-pane-key="pane.key"
              :class="{
                'terminal-pane-tab--active': pane.key === activeBrowserPanel,
                'terminal-pane-tab--drop-target': pane.key === dropTargetFtpPaneKey,
                'terminal-pane-tab--drag-placeholder': pane.key === draggingFtpPaneKey,
              }"
              @pointerdown="startFtpPanePointerDrag($event, pane)"
            >
              <span class="terminal-pane-tab__kind">{{ pane.kind === 'local' ? '本地' : '远程' }}</span>
              <span class="terminal-pane-tab__title">{{ pane.title }}</span>
              <span
                class="terminal-pane-tab__close"
                role="button"
                tabindex="-1"
                title="关闭工作区"
                aria-label="关闭工作区"
                @click.stop="removeFtpWorkspacePane(pane.key)"
              >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                  <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                </svg>
              </span>
            </button>
          </div>

          <section
            ref="ftpPaneWorkspaceRef"
            class="ftp-panels terminal-pane-workspace"
            :class="{
              'ftp-panels--single': visibleBrowserPanelCount <= 1,
            }"
            :style="ftpPaneWorkspaceStyle"
          >
            <div
              v-for="item in ftpPaneLayoutItems"
              :key="item.pane.key"
              class="terminal-pane ftp-workspace-pane"
              :data-ftp-pane-key="item.pane.key"
              :class="{
                'terminal-pane--active': item.pane.key === activeBrowserPanel,
                'terminal-pane--drag-placeholder': item.pane.key === draggingFtpPaneKey,
                'terminal-pane--drop-target': item.pane.key === dropTargetFtpPaneKey,
              }"
              :style="item.style"
              @pointerdown.capture="setActiveBrowserPanel(item.pane.key)"
            >
              <div
                class="terminal-pane__header"
                title="拖动以调整传输工作区位置"
                @pointerdown="startFtpPanePointerDrag($event, item.pane)"
              >
                <span class="terminal-pane__kind">{{ item.pane.kind === 'local' ? '本地' : '远程' }}</span>
                <span class="terminal-pane__title">{{ item.pane.title }}</span>
                <span class="terminal-pane__status">
                  {{ item.pane.key === draggingFtpPaneKey ? '占位' : (item.pane.kind === 'local' ? `${ftpPaneFilteredEntries(item.pane).length} 项` : (item.pane.protocol || 'SFTP').toUpperCase()) }}
                </span>
                <button
                  class="terminal-pane__close"
                  type="button"
                  title="关闭工作区"
                  aria-label="关闭工作区"
                  @click.stop="removeFtpWorkspacePane(item.pane.key)"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div v-if="item.pane.connectionState === 'connecting'" class="ftp-pane-connection-state">
                <span class="ftp-pane-connection-state__spinner" aria-hidden="true" />
                <div class="ftp-pane-connection-state__text">
                  <strong>{{ item.pane.connectionMessage || `正在连接 ${item.pane.title}...` }}</strong>
                  <span>{{ item.pane.protocol ? item.pane.protocol.toUpperCase() : 'FTP' }}</span>
                </div>
              </div>
              <div v-else-if="ftpPaneDisconnectedNotice(item.pane)" class="ftp-pane-connection-state ftp-pane-connection-state--disconnected">
                <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                  <path d="M12 3v7" />
                  <path d="M7.8 7.8a6 6 0 1 0 8.4 0" />
                </svg>
                <div class="ftp-pane-connection-state__text">
                  <strong>{{ ftpPaneDisconnectedNotice(item.pane)?.label || item.pane.title }} 已断开</strong>
                  <span>{{ ftpPaneDisconnectedNotice(item.pane)?.message || 'session closed' }}</span>
                  <span>目录：{{ ftpPaneDisconnectedNotice(item.pane)?.remotePath || item.pane.path || '/' }}</span>
                </div>
                <UiButton
                  size="sm"
                  variant="primary"
                  :disabled="reconnectingDisconnectedSession || !disconnectedSessionProfile"
                  @click="reconnectDisconnectedSession"
                >
                  {{ reconnectingDisconnectedSession ? '重连中' : '重连' }}
                </UiButton>
              </div>
              <FtpBrowserPanel
                v-else
                :kind="item.pane.kind"
                :title="item.pane.title"
                :show-titlebar="false"
                :badges="[
                  { text: item.pane.kind === 'local' ? '本地' : (item.pane.protocol || 'SFTP').toUpperCase(), accent: item.pane.kind === 'remote' },
                  { text: `${ftpPaneFilteredEntries(item.pane).length} 项` },
                ]"
                :drop-active="ftpFileDropTargetPaneKey === item.pane.key"
                :active="activeBrowserPanel === item.pane.key"
                :breadcrumbs="ftpPaneBreadcrumbs(item.pane)"
                :path-input="item.pane.pathInput"
                :path-suggestions="ftpPanePathSuggestions(item.pane)"
                :path-placeholder="item.pane.kind === 'local' ? '输入本地目录' : '输入远程目录'"
                :view-mode="item.pane.viewMode"
                :sort-key="ftpPaneSortKey(item.pane)"
                :sort-direction="ftpPaneSortDirection(item.pane)"
                :path-input-disabled="item.pane.kind === 'remote' && !item.pane.sessionId"
                :open-path-disabled="item.pane.kind === 'remote' && !item.pane.sessionId"
                :go-parent-disabled="item.pane.kind === 'remote' && !item.pane.sessionId"
                :refresh-disabled="item.pane.kind === 'remote' && !item.pane.sessionId"
                :search-expanded="ftpPaneSearchExpanded(item.pane)"
                :search-active="ftpPaneSearchExpanded(item.pane) || !!ftpPaneFilterQuery(item.pane)"
                :filter-expanded="ftpPaneRuleFilterExpanded(item.pane)"
                :filter-active="ftpPaneRuleFilterExpanded(item.pane) || isRuleFilterActive(ftpPaneRuleFilter(item.pane))"
                :filter-query="ftpPaneFilterQuery(item.pane)"
                :filter-state="ftpPaneRuleFilter(item.pane)"
                :filter-summary="ftpPaneFilterSummary(item.pane)"
                :filter-preset-id="ftpPaneFilterPresetId(item.pane)"
                :filter-preset-options="filterPresetOptions"
                :entries="ftpPaneFilteredEntries(item.pane)"
                :loading="item.pane.loading"
                :loading-text="item.pane.kind === 'local' ? '正在读取本地目录...' : '正在读取远程目录...'"
                :empty-text="ftpPaneFilterQuery(item.pane) || isRuleFilterActive(ftpPaneRuleFilter(item.pane)) ? '没有匹配的文件。' : '目录为空。'"
                :drop-hint="ftpPaneDropHint(item.pane)"
                :selected-paths="item.pane.selectedPaths"
                :selected-count="item.pane.selectedPaths.length"
                :primary-action-label="ftpPanePrimaryActionLabel(item.pane)"
                :primary-action-variant="item.pane.kind === 'local' ? 'primary' : 'secondary'"
                :primary-action-disabled="!canRunFtpPanePrimaryAction(item.pane)"
                :show-workspace-controls="true"
                :show-workspace-picker="item.pane.kind === 'local'"
                :workspace-select-value="item.pane.kind === 'local' ? localWorkspaceSelectValue : remoteWorkspaceSelectValue"
                :workspace-options="item.pane.kind === 'local' ? localWorkspaceOptions : remoteWorkspaceOptions"
                :workspace-removable-values="item.pane.kind === 'local' ? localWorkspaceBookmarkValues : remoteWorkspaceBookmarkValues"
                :bookmark-disabled="!item.pane.path"
                :remove-bookmark-disabled="item.pane.kind === 'local' ? !currentLocalWorkspaceBookmarked : !currentRemoteWorkspaceBookmarked"
                :show-create-directory-action="false"
                :create-directory-disabled="item.pane.kind === 'remote' && !item.pane.sessionId"
                secondary-meta-label="大小"
                tertiary-meta-label="修改时间"
                :size-value="(entry) => (entry.isDir ? '--' : formatSize(entry.size))"
                :modified-value="(entry) => formatTime(entry.modifiedAt)"
                :permissions-value="(entry) => entry.permissions || '--'" :owner-value="(entry) => entry.owner || '--'"
                :secondary-meta-value="(entry) => (entry.isDir ? '--' : formatSize(entry.size))"
                :tertiary-meta-value="(entry) => formatTime(entry.modifiedAt)"
                secondary-meta-class=""
                :thumbnail-url-for="(entry) => thumbnailUrlFor(item.pane.kind, entry, item.pane.sessionId)"
                :is-thumbnail-loading="(entry) => isThumbnailLoading(item.pane.kind, entry, item.pane.sessionId)"
                :highlight-entry-name="highlightEntryName"
                :show-connecting-overlay="item.pane.kind === 'remote' && activeBrowserPanel === item.pane.key && isDeletingRemote"
                connecting-title="正在删除远程条目"
                :connecting-message="busyMessage"
                @update:pathInput="setFtpPanePathInput(item.pane, $event)"
                @update:filterQuery="item.pane.kind === 'local' ? localFilterQuery = $event : remoteFilterQuery = $event"
                @update:extensionQuery="item.pane.kind === 'local' ? localRuleFilter.extensionQuery = $event : remoteRuleFilter.extensionQuery = $event"
                @update:minSizeKb="item.pane.kind === 'local' ? localRuleFilter.minSizeKb = $event : remoteRuleFilter.minSizeKb = $event"
                @update:maxSizeKb="item.pane.kind === 'local' ? localRuleFilter.maxSizeKb = $event : remoteRuleFilter.maxSizeKb = $event"
                @update:modifiedWithinDays="item.pane.kind === 'local' ? localRuleFilter.modifiedWithinDays = $event : remoteRuleFilter.modifiedWithinDays = $event"
                @primary-action="runFtpPanePrimaryAction(item.pane)"
                @create-directory="createFtpPaneDirectory(item.pane)"
                @switch-workspace="item.pane.kind === 'local' ? switchLocalWorkspace($event) : switchRemoteWorkspace($event)"
                @bookmark-current="item.pane.kind === 'local' ? addCurrentLocalWorkspace() : addCurrentRemoteWorkspace()"
                @pick-workspace="pickLocalWorkspace"
                @remove-workspace="item.pane.kind === 'local' ? removeCurrentLocalWorkspace($event) : removeCurrentRemoteWorkspace($event)"
                @open-breadcrumb="openFtpPanePath(item.pane, $event)"
                @open-path="openFtpPanePath(item.pane)"
                @go-parent="goFtpPaneParent(item.pane)"
                @refresh="refreshFtpWorkspacePaneDirectory(item.pane.key, item.pane.path)"
                @toggle-search="toggleSearch(item.pane.kind)"
                @toggle-filter="toggleRuleFilter(item.pane.kind)"
                @set-view-mode="setFtpPaneViewMode(item.pane, $event)"
                @sort-column="sortFtpPaneByColumn(item.pane, $event)"
                @set-filter-mode="setRuleFilterMode(item.pane.kind, $event)"
                @set-filter-operator="setRuleFilterOperator(item.pane.kind, $event)"
                @toggle-hide-hidden="toggleHideHidden(item.pane.kind)"
                @apply-filter-preset="applyFilterPreset(item.pane.kind, $event)"
                @save-filter-preset="saveFilterPreset(item.pane.kind)"
                @delete-filter-preset="deleteSelectedFilterPreset(item.pane.kind)"
                @reset-filter="resetRuleFilter(item.pane.kind)"
                @panel-activate="setActiveBrowserPanel(item.pane.key)"
                @dragenter="handleFtpPaneDragEnter($event, item.pane)"
                @dragover="handleFtpPaneDragOver($event, item.pane)"
                @dragleave="handleFtpPaneDragLeave($event, item.pane)"
                @drop="handleFtpPaneDrop($event, item.pane)"
                @select-all="selectAllFtpPaneEntries(item.pane)"
                @marquee-select="handleFtpPaneMarqueeSelect(item.pane, $event)"
                @list-contextmenu="handlePanelListContextMenu($event, item.pane.kind)"
                @entry-click="handleFtpPaneEntryClick(item.pane, $event.event, $event.entry, $event.index)"
                @entry-dblclick="openFtpPaneEntry(item.pane, $event)"
                @entry-dragstart="setFtpPaneDragPayload($event.event, item.pane, $event.entry)"
                @entry-dragend="handleFtpPaneEntryDragEnd"
                @entry-contextmenu="handleEntryContextMenu($event.event, item.pane.kind, $event.entry, $event.index)" />
            </div>

            <button
              v-for="handle in ftpPaneResizeHandles"
              :key="handle.id"
              type="button"
              class="terminal-pane-resizer"
              :class="`terminal-pane-resizer--${handle.orientation}`"
              :style="handle.style"
              aria-label="调整传输工作区大小"
              @pointerdown="startFtpPaneResize($event, handle)"
            />
            <div
              v-if="ftpPaneDragPreview.visible"
              class="terminal-pane-drag-preview"
              :style="{
                left: `${ftpPaneDragPreview.left}px`,
                top: `${ftpPaneDragPreview.top}px`,
              }"
            >
              <span class="terminal-pane-drag-preview__kind">{{ ftpPaneKindLabel(ftpPaneDragPreview.kind) }}</span>
              <span class="terminal-pane-drag-preview__title">{{ ftpPaneDragPreview.title }}</span>
            </div>
          </section>

        </div>

        <section class="ftp-aux-dock" :class="[
          `ftp-aux-dock--${auxiliaryDockSide}`,
          {
            'ftp-aux-dock--tabbed': useAuxDockTabs,
            'ftp-aux-dock--collapsed': auxiliaryDockCollapsed,
          },
        ]">
          <div
            v-if="auxiliaryDockSide === 'bottom' && !auxiliaryDockCollapsed"
            class="ftp-aux-dock__resize-handle"
            role="separator"
            aria-orientation="horizontal"
            aria-label="调整底部栏高度"
            title="拖拽调整底部栏高度"
            @mousedown="startAuxiliaryDockResize"
          />
          <div v-if="useAuxDockTabs" class="ftp-aux-dock__tabs">
            <div class="ftp-aux-dock__tab-list">
              <button type="button" class="ftp-aux-dock__tab"
                :class="{ 'ftp-aux-dock__tab--active': auxDockActiveTab === 'queue' }"
                @click="auxDockActiveTab = 'queue'">
                传输队列
                <span class="ftp-badge ftp-badge--accent">{{ activeTaskCount }}</span>
              </button>
              <button v-if="showLogPanel" type="button" class="ftp-aux-dock__tab"
                :class="{ 'ftp-aux-dock__tab--active': auxDockActiveTab === 'log' }" @click="auxDockActiveTab = 'log'">
                操作日志
                <span class="ftp-badge">{{ ftpStore.logs.length }}</span>
              </button>
            </div>
            <div class="ftp-aux-dock__toolbar">
              <template v-if="auxDockActiveTab === 'queue' && !auxiliaryDockCollapsed">
                <UiIconButton
                  v-if="completedTaskCount"
                  size="sm"
                  variant="ghost"
                  title="清除已完成"
                  @click="deleteCompletedTasks()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12M10.5 10v6M13.5 10v6" />
                  </svg>
                </UiIconButton>
                <UiIconButton size="sm" variant="ghost" title="全部暂停" @click="pauseAllTasks()">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 5v14M15 5v14" />
                  </svg>
                </UiIconButton>
                <UiIconButton size="sm" variant="ghost" title="全部恢复" @click="resumeAllTasks()">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5v14l11-7-11-7z" />
                  </svg>
                </UiIconButton>
                <UiSelect class="ftp-aux-dock__sort-select" size="sm" :model-value="taskSortKey" :options="taskSortOptions"
                  @change="taskSortKey = String($event) as TaskSortKey" />
                <UiIconButton
                  size="sm"
                  variant="ghost"
                  :title="taskSortDirection === 'asc' ? '升序' : '降序'"
                  @click="toggleTaskSortDirection"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" :class="{ 'ftp-aux-dock__sort-icon--desc': taskSortDirection === 'desc' }">
                    <path d="M12 19V5M7.5 9.5 12 5l4.5 4.5" />
                  </svg>
                </UiIconButton>
                <UiIconButton size="sm" variant="ghost" title="刷新任务" @click="ftpStore.reloadRuntimeState()">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19 8a7 7 0 1 0 1 4M19 5v3h-3" />
                  </svg>
                </UiIconButton>
              </template>
              <template v-else-if="auxDockActiveTab === 'log' && !auxiliaryDockCollapsed">
                <UiButton size="sm" variant="ghost" :disabled="!ftpStore.logs.length" @click="ftpStore.clearLogs()">
                  <template #prefix>
                    <DeleteIcon width="14" height="14" />
                  </template>
                  清空日志
                </UiButton>
              </template>
              <UiIconButton class="ftp-aux-dock__collapse-button" size="sm" variant="ghost"
                title="切换底部栏" aria-label="切换底部栏" @click="toggleAuxiliaryDockCollapsed">
                <svg viewBox="0 0 24 24" aria-hidden="true"
                  :class="{ 'ftp-aux-dock__collapse-icon--collapsed': auxiliaryDockCollapsed }">
                  <path d="m7 10 5 5 5-5" />
                </svg>
              </UiIconButton>
            </div>
          </div>
          <Transition name="ui-tab-fade" mode="out-in">
            <FtpTransferQueue v-if="!auxiliaryDockCollapsed && showQueuePanelInDock" :collapsed="false" :active-task-count="activeTaskCount"
              :paused-task-count="pausedTaskCount" :completed-task-count="completedTaskCount"
              :failed-task-count="failedTaskCount" :tasks="sortedTransferTasks" :is-task-expanded="isTaskExpanded"
              :task-priority-label="taskPriorityLabel" :task-status-label="taskStatusLabel"
              :can-pause-task="canPauseTask" :can-resume-task="canResumeTask" :can-retry-task="canRetryTask"
              :format-size="formatSize" :format-eta="formatTaskEta" @toggle-task-expanded="toggleTaskExpanded"
              @update-task-priority="updateTaskPriority($event.taskId, $event.priority)" @pause-task="pauseTask"
              @resume-task="resumeTask" @retry-task="retryTask" @delete-task="deleteTransferTask" />

            <section v-else-if="!auxiliaryDockCollapsed && showLogPanelInDock" class="ftp-log-panel ftp-inner-card">
              <div class="ftp-log-panel__body">
                <div v-if="!ftpStore.logs.length" class="ftp-empty-state">当前还没有 FTP 操作日志。</div>
                <div v-else class="ftp-log-panel__list">
                  <div v-for="entry in ftpStore.logs" :key="entry.id" class="ftp-log-panel__entry"
                    :class="`ftp-log-panel__entry--${entry.tone}`">
                    <span class="ftp-log-panel__time">{{ formatLogTime(entry.timestamp) }}</span>
                    <span class="ftp-log-panel__message">{{ entry.message }}</span>
                  </div>
                </div>
              </div>
            </section>
          </Transition>
        </section>

      <FtpSyncPanel :model-value="syncPanelVisible" :active-session="Boolean(activeSession)"
        :sync-direction="syncDirection" :sync-direction-options="syncDirectionOptions"
        :sync-conflict-policy="syncConflictPolicy" :sync-conflict-policy-options="syncConflictPolicyOptions"
        :recursive-compare-enabled="recursiveCompareEnabled" :checksum-compare-enabled="checksumCompareEnabled"
        :sync-executable-count="syncExecutableCount" :sync-executing="syncExecuting"
        :checksum-compare-running="checksumCompareRunning" :sync-execution-summary="syncExecutionSummary"
        :sync-cancel-requested="syncCancelRequested" :sync-comparison-expanded="syncComparisonExpanded"
        :sync-summary="syncSummary" :sync-preview-summary="syncPreviewSummary" :sync-preview-items="syncPreviewItems"
        :selected-preview-keys="syncSelectedKeys" :format-size="formatSize" :sync-status-label="syncStatusLabel"
        :sync-action-label="syncActionLabel" :sync-difference-label="syncDifferenceLabel"
        @update:modelValue="syncPanelVisible = $event" @update:syncDirection="syncDirection = $event"
        @update:syncConflictPolicy="syncConflictPolicy = $event"
        @update:recursiveCompareEnabled="recursiveCompareEnabled = $event"
        @update:checksumCompareEnabled="checksumCompareEnabled = $event" @compare="compareCurrentDirectories"
        @execute="executeSyncPreview" @cancel="cancelSyncExecution" @toggle-preview-item="toggleSyncPreviewItem"
        @set-all-preview-items="setAllSyncPreviewItems" />

    </template>

    <template #overlays>

    <UiDialog v-model="saveLayoutDialogVisible" width="420" max-width="calc(100vw - 48px)">
      <template #header>
        <div class="ftp-dialog__header">保存连接布局</div>
      </template>
      <div class="ftp-dialog__body">
        <UiInput
          v-model="saveLayoutName"
          placeholder="输入布局名称"
          @keydown.enter="saveCurrentFtpConnectionLayout"
        />
      </div>
      <template #footer>
        <div class="ftp-dialog__footer">
          <UiButton size="sm" variant="ghost" @click="saveLayoutDialogVisible = false">取消</UiButton>
          <UiButton size="sm" variant="primary" @click="saveCurrentFtpConnectionLayout">保存</UiButton>
        </div>
      </template>
    </UiDialog>

    <FtpProfileDialog :model-value="profileDialogVisible" :title="editingProfileId ? '编辑传输配置' : '新建传输配置'"
      :form="profileForm" :protocol-options="protocolOptions" :ssh-profile-options="sshProfileOptions"
      :folder-select-options="folderSelectOptions" :auth-type-options="authTypeOptions"
      :ssh-profile-enabled="sshProfileEnabled" :ssh-profile-label="sshProfileLabel"
      @update:modelValue="profileDialogVisible = $event" @apply-ssh-profile="applySshProfile" @save="saveProfile" />

    <FtpFolderDialog :model-value="folderDialogVisible" :title="editingFolderId ? '编辑文件夹' : '新建文件夹'" :form="folderForm"
      :parent-options="folderParentOptions" @update:modelValue="folderDialogVisible = $event" @save="saveFolder" />

    <FtpEntryNameDialog :model-value="entryNameDialogVisible" :title="entryNameDialogTitle"
      :label="entryNameDialogLabel" :confirm-text="entryNameDialogConfirmText" :value="entryNameDialogValue"
      :placeholder="entryNameDialogPlaceholder" @update:modelValue="(value) => !value && cancelEntryNameDialog()"
      @update:value="entryNameDialogValue = $event" @submit="submitEntryNameDialog" @cancel="cancelEntryNameDialog" />

    <FtpPasswordDialog :model-value="passwordDialogVisible"
      :label="pendingConnectProfile ? `${pendingConnectProfile.username}@${pendingConnectProfile.host}` : '密码'"
      :password="connectPassword" @update:modelValue="passwordDialogVisible = $event"
      @update:password="connectPassword = $event" @submit="submitPasswordConnect" @cancel="cancelPasswordPrompt" />

    <FtpAuthChallengeDialog :model-value="authChallengeDialogVisible" :challenge="pendingAuthChallenge"
      :responses="authChallengeResponses" @update:modelValue="(value) => !value && cancelAuthChallenge()"
      @update:responses="authChallengeResponses = $event" @submit="submitAuthChallenge" @cancel="cancelAuthChallenge" />

    <UiDialog v-model="scheduleDialogVisible" width="880" max-width="96vw">
      <template #header>
        <div class="ftp-dialog__header">定时传输任务</div>
      </template>
      <div class="ftp-dialog__body">
        <div class="ftp-dialog__grid">
          <label class="ftp-form-field">
            <span>任务名称</span>
            <UiInput :model-value="scheduleForm.label" placeholder="例如：夜间日志下载"
              @update:modelValue="scheduleForm.label = String($event)" />
          </label>
          <label class="ftp-form-field">
            <span>传输配置</span>
            <UiSelect :model-value="scheduleForm.profileId" :options="scheduledTaskProfileOptions"
              @change="scheduleForm.profileId = String($event)" />
          </label>
          <label class="ftp-form-field">
            <span>执行方向</span>
            <UiSelect :model-value="scheduleForm.direction" :options="scheduledDirectionOptions"
              @change="scheduleForm.direction = String($event)" />
          </label>
          <label class="ftp-form-field">
            <span>计划类型</span>
            <UiSelect :model-value="scheduleForm.scheduleType" :options="scheduledTypeOptions"
              @change="scheduleForm.scheduleType = String($event)" />
          </label>
          <label class="ftp-form-field">
            <span>冲突策略</span>
            <UiSelect :model-value="scheduleForm.conflictPolicy || 'skip'" :options="scheduledConflictPolicyOptions"
              @change="scheduleForm.conflictPolicy = String($event) as 'skip' | 'parallel'" />
          </label>
          <label class="ftp-form-field ftp-form-field--full">
            <span>本地路径</span>
            <UiInput :model-value="scheduleForm.localPath" placeholder="本地文件或目录路径"
              @update:modelValue="scheduleForm.localPath = String($event)" />
          </label>
          <label class="ftp-form-field ftp-form-field--full">
            <span>远程路径</span>
            <UiInput :model-value="scheduleForm.remotePath" placeholder="远程文件或目录路径"
              @update:modelValue="scheduleForm.remotePath = String($event)" />
          </label>
          <label v-if="scheduleForm.scheduleType === 'once'" class="ftp-form-field">
            <span>执行时间</span>
            <UiDateTimePicker :model-value="scheduleForm.onceAt" value-type="timestamp" placeholder="选择执行日期和时间"
              @update:model-value="scheduleForm.onceAt = ($event as number | undefined)" />
          </label>
          <label v-if="scheduleForm.scheduleType === 'hourly'" class="ftp-form-field">
            <span>间隔小时</span>
            <input class="ftp-native-input" type="number" min="1" :value="scheduleForm.intervalHours || 1"
              @input="scheduleForm.intervalHours = Number(($event.target as HTMLInputElement).value) || 1" />
          </label>
          <label v-if="scheduleForm.scheduleType === 'daily' || scheduleForm.scheduleType === 'weekly'"
            class="ftp-form-field">
            <span>执行时刻</span>
            <UiTimePicker :model-value="scheduleForm.timeOfDay || '09:00'" :minute-step="1"
              @update:model-value="scheduleForm.timeOfDay = String($event)" />
          </label>
          <label v-if="scheduleForm.scheduleType === 'weekly'" class="ftp-form-field">
            <span>每周执行日</span>
            <UiSelect :model-value="String(scheduleForm.dayOfWeek ?? 1)"
              :options="weekDayOptions.map((item) => ({ ...item, value: String(item.value) }))"
              @change="scheduleForm.dayOfWeek = Number($event)" />
          </label>
          <label v-if="scheduleForm.scheduleType === 'cron'" class="ftp-form-field ftp-form-field--full">
            <span>Cron 表达式</span>
            <UiInput :model-value="scheduleForm.cronExpression || ''" :placeholder="cronExpressionHint"
              @update:modelValue="scheduleForm.cronExpression = String($event)" />
            <div class="ftp-schedule-form__hint">{{ cronExpressionHint }}</div>
          </label>
        </div>

        <UiCheckbox v-model="scheduleForm.enabled">启用这个计划任务</UiCheckbox>

        <div class="ftp-schedule-list">
          <div v-for="task in scheduledTasks" :key="task.id" class="ftp-schedule-item">
            <div class="ftp-schedule-item__main">
              <div class="ftp-schedule-item__title">{{ task.label }}</div>
              <div class="ftp-schedule-item__meta">
                {{ task.direction === 'upload' ? '上传' : '下载' }} · {{ formatScheduledTaskRule(task) }} · 下次执行 {{
                  task.nextRunAt ? formatTime(task.nextRunAt) : '未计划' }}
              </div>
              <div class="ftp-schedule-item__meta">
                冲突策略：{{ task.conflictPolicy === 'parallel' ? '允许并行' : '冲突时跳过' }} · 最近结果：{{ task.lastResult || '暂无' }}
              </div>
            </div>
            <div class="ftp-schedule-item__actions">
              <UiButton size="sm" variant="ghost" @click="openScheduleDialog(task)">编辑</UiButton>
              <UiButton size="sm" variant="ghost" @click="runScheduledTaskNow(task.id)">立即执行</UiButton>
              <UiButton size="sm" variant="danger" @click="deleteScheduledTask(task.id)">删除</UiButton>
            </div>
          </div>
          <div v-if="!scheduledTasks.length" class="ftp-empty-state">当前还没有定时传输任务。</div>
        </div>
      </div>
      <template #footer>
        <div class="ftp-dialog__footer">
          <UiButton variant="ghost" @click="scheduleDialogVisible = false">关闭</UiButton>
          <UiButton variant="primary" @click="saveScheduledTask">{{ editingScheduledTaskId ? '保存修改' : '创建任务' }}
          </UiButton>
        </div>
      </template>
    </UiDialog>

    <UiDialog v-model="remotePreviewDialogVisible" width="960" max-width="96vw">
      <template #header>
        <div class="ftp-dialog__header">{{ remotePreviewTitle }}</div>
      </template>
      <div class="ftp-remote-preview">
        <div class="ftp-remote-editor__path-wrap">
          <div class="ftp-remote-editor__path">{{ remotePreviewPath }}</div>
          <span class="ftp-badge ftp-badge--accent">
            {{ remotePreviewKind === 'image' ? remotePreviewImageScopeLabel : '远程文本预览' }}
          </span>
        </div>
        <div v-if="remotePreviewLoading" class="ftp-empty-state">
          {{ remotePreviewLoadingText }}
        </div>
        <div v-else-if="remotePreviewError" class="ftp-empty-state ftp-empty-state--danger">
          {{ remotePreviewError }}
        </div>
        <div v-else-if="remotePreviewKind === 'image'" class="ftp-remote-preview__image-shell">
          <img v-if="remotePreviewImageSrc" class="ftp-remote-preview__image" :src="remotePreviewImageSrc"
            :alt="remotePreviewName" />
        </div>
        <pre v-else class="ftp-remote-preview__text">{{ remotePreviewText }}</pre>
      </div>
      <template #footer>
        <div class="ftp-dialog__footer">
          <UiButton variant="ghost" @click="remotePreviewDialogVisible = false">关闭</UiButton>
        </div>
      </template>
    </UiDialog>

    <UiDialog v-model="remoteEditorDialogVisible" width="min(1280px, calc(100vw - 32px))" max-width="98vw">
      <template #header>
        <div class="ftp-dialog__header">{{ editorDialogTitle }}</div>
      </template>
      <div class="ftp-remote-editor">
        <div class="ftp-remote-editor__path-wrap">
          <div class="ftp-remote-editor__path">{{ remoteEditorPath }}</div>
          <span class="ftp-badge" :class="{ 'ftp-badge--accent': remoteEditorDirty }">
            {{ editorSyncLabel }}
          </span>
        </div>
        <div v-if="remoteEditorLoading" class="ftp-loading-state ftp-remote-editor__loading">
          <span class="ftp-loading-state__spinner" />
          <span class="ftp-loading-state__text">{{ editorLoadingText }}</span>
        </div>
        <FtpCodeEditor v-else v-model="remoteEditorContent" :file-path="remoteEditorPath"
          @save-requested="saveRemoteEditor" />
      </div>
      <template #footer>
        <div class="ftp-dialog__footer">
          <UiButton variant="ghost" @click="remoteEditorDialogVisible = false">关闭</UiButton>
          <UiButton variant="primary" :disabled="remoteEditorLoading || remoteEditorSaving" @click="saveRemoteEditor">
            {{ editorSaveText }}
          </UiButton>
        </div>
      </template>
    </UiDialog>

    <UiDialog v-model="permissionDialogVisible" width="720" max-width="92vw">
      <template #header>
        <div class="ftp-dialog__header">修改远程权限</div>
      </template>
      <div class="ftp-dialog__body">
        <div class="ftp-remote-editor__path">{{ permissionDialogTargetLabel }} · {{ permissionDialogTargetPath }}</div>
        <div class="ftp-permission-grid">
          <div class="ftp-permission-grid__head">主体</div>
          <div class="ftp-permission-grid__head">读</div>
          <div class="ftp-permission-grid__head">写</div>
          <div class="ftp-permission-grid__head">执行</div>
          <template v-for="bucket in permissionMatrix" :key="bucket.key">
            <div class="ftp-permission-grid__label">{{ bucket.label }}</div>
            <UiCheckbox size="sm" :checked="bucket.read"
              @change="updatePermissionMatrix(bucket.key, 'read', $event as boolean)" />
            <UiCheckbox size="sm" :checked="bucket.write"
              @change="updatePermissionMatrix(bucket.key, 'write', $event as boolean)" />
            <UiCheckbox size="sm" :checked="bucket.execute"
              @change="updatePermissionMatrix(bucket.key, 'execute', $event as boolean)" />
          </template>
        </div>
        <label class="ftp-form-field ftp-form-field--full">
          <span>数字权限</span>
          <UiInput :model-value="permissionModeInput" placeholder="例如：755"
            @update:modelValue="handlePermissionModeInput(String($event))" />
        </label>
      </div>
      <template #footer>
        <div class="ftp-dialog__footer">
          <UiButton variant="ghost" @click="permissionDialogVisible = false">取消</UiButton>
          <UiButton variant="primary" @click="applyRemotePermissionDialog">应用权限</UiButton>
        </div>
      </template>
    </UiDialog>
    </template>
  </MainPageLayout>
</template>
<style src="./FtpPage.scss" lang="scss"></style>
