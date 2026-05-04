<script setup lang="ts">
import type {
  FileTransferEntry,
  FtpScheduledTask,
  TransferTask,
  UpsertFtpScheduledTaskInput,
} from '@/contracts/ftp';
import CategoryMediaIcon from '@/windows/main/components/svgs/icons/CategoryMediaIcon.vue';
import CategoryTextIcon from '@/windows/main/components/svgs/icons/CategoryTextIcon.vue';
import ConvertIcon from '@/windows/main/components/svgs/icons/ConvertIcon.vue';
import DeleteIcon from '@/windows/main/components/svgs/icons/DeleteIcon.vue';
import OpenIcon from '@/windows/main/components/svgs/icons/OpenIcon.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiDateTimePicker from '@/windows/main/components/ui/UiDateTimePicker.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiTooltip from '@/windows/main/components/ui/UiTooltip.vue';
import UiTimePicker from '@/windows/main/components/ui/UiTimePicker.vue';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
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

type PanelLayoutMode = 'columns' | 'stacked';
type SessionTabGroup = 'primary' | 'secondary';
type SidebarDockSide = 'left' | 'right';
type AuxiliaryDockSide = 'bottom' | 'right';
type ActiveBrowserPanel = 'local' | 'remote' | 'secondaryRemote';
type EditorTargetKind = 'local' | 'remote';
type RemotePreviewKind = 'image' | 'text';
type AuxiliaryDockTab = 'queue' | 'log';
type TransferTaskRefreshSnapshot = Pick<TransferTask, 'id' | 'status' | 'direction' | 'sessionId' | 'remotePath'>;
type RemoteRefreshTarget = {
  panel: 'primary' | 'secondary';
  sessionId: string;
  path: string;
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
const disconnectedSessionDialogVisible = ref(false);
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
const panelLayoutMode = ref<PanelLayoutMode>('columns');
const sidebarDockSide = ref<SidebarDockSide>('left');
const auxiliaryDockSide = ref<AuxiliaryDockSide>('bottom');
const activeBrowserPanel = ref<ActiveBrowserPanel>('remote');
const auxiliaryDockSize = ref('260');
const localPanelViewMode = ref<PanelViewMode>('details');
const remotePanelViewMode = ref<PanelViewMode>('details');
const dualRemoteMode = ref(false);

// 面板分割比例（含拖拽调整）
/** 水平分割：本地列占总宽的百分比 (30-70) */
const panelHSplitPct = ref(50);
/** 垂直分割：远程堆叠中第二远程面板占总高的百分比 (20-80) */
const remoteVSplitPct = ref(50);
let stopAuxiliaryDockResize: (() => void) | null = null;

function startHDrag(e: MouseEvent) {
  e.preventDefault();
  const container = (e.currentTarget as HTMLElement).closest('.ftp-panels') as HTMLElement | null;
  if (!container) return;
  const startX = e.clientX;
  const startPct = panelHSplitPct.value;
  const totalW = container.offsetWidth;

  function onMove(ev: MouseEvent) {
    const dx = ev.clientX - startX;
    const newPct = Math.min(70, Math.max(30, startPct + (dx / totalW) * 100));
    panelHSplitPct.value = newPct;
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function startVDrag(e: MouseEvent) {
  e.preventDefault();
  const container = (e.currentTarget as HTMLElement).closest('.ftp-panels__remote-stack') as HTMLElement | null;
  if (!container) return;
  const startY = e.clientY;
  const startPct = remoteVSplitPct.value;
  const totalH = container.offsetHeight;

  function onMove(ev: MouseEvent) {
    const dy = ev.clientY - startY;
    const newPct = Math.min(80, Math.max(20, startPct + (dy / totalH) * 100));
    remoteVSplitPct.value = newPct;
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

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
const secondaryTabGroupProfileIds = ref<string[]>([]);
const secondaryRemoteProfileId = ref('');
const secondaryRemoteSessionId = ref('');
const secondaryRemotePath = ref('');
const secondaryRemotePathInput = ref('');
const secondaryRemoteEntries = ref<FileTransferEntry[]>([]);
const secondaryRemoteSelectedPaths = ref<string[]>([]);
const secondaryRemoteLastSelectedIndex = ref(-1);
const secondaryRemoteLoading = ref(false);
const secondaryRemoteSessionPaths = ref<Record<string, string>>({});
const secondaryRemoteRuleFilter = ref<PanelFilterState>({
  mode: 'all',
  operator: 'and',
  hideHidden: false,
  extensionQuery: '',
  minSizeKb: '',
  maxSizeKb: '',
  modifiedWithinDays: '',
});
const showSidebarPanel = ref(true);
const showLocalPanel = ref(true);
const showRemotePanel = ref(true);
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
  connectProfile,
  submitPasswordConnect,
  cancelPasswordPrompt,
  submitAuthChallenge,
  cancelAuthChallenge,
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
  localWorkspaceSelectValue,
  localWorkspaceOptions,
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
  addCurrentLocalWorkspace,
  pickLocalWorkspace,
  removeCurrentLocalWorkspace,
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
  startPreparedDrag: (localPaths) => window.ftpApi.startPreparedDrag(localPaths),
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
const canEditRemoteFile = computed(() => isEditableTextEntry(selectedRemoteEntry.value));
const canPreviewRemoteImage = computed(() => canPreviewRemoteImageEntry(selectedRemoteEntry.value));
const canPreviewRemoteText = computed(() => canPreviewRemoteTextEntry(selectedRemoteEntry.value));
const canPreviewActiveImage = computed(() => {
  if (activeBrowserPanel.value === 'local') {
    return canPreviewLocalImageEntry(selectedLocalEntry.value);
  }
  if (activeBrowserPanel.value === 'remote') {
    return canPreviewRemoteImage.value;
  }
  return false;
});
const canChmodRemoteFile = computed(() => Boolean(activeSession.value && selectedRemoteEntry.value));
const primarySessionTabs = computed(() =>
  ftpStore.sessions.filter((session) => !secondaryTabGroupProfileIds.value.includes(session.profileId)),
);
const secondarySessionTabs = computed(() =>
  ftpStore.sessions.filter((session) => secondaryTabGroupProfileIds.value.includes(session.profileId)),
);
const availableSecondaryRemoteSessions = computed(() =>
  ftpStore.sessions.filter((session) => session.sessionId !== activeSession.value?.sessionId),
);
const secondaryRemoteSession = computed(() =>
  secondarySessionTabs.value.find((session) => session.sessionId === secondaryRemoteSessionId.value)
  ?? (secondaryRemoteProfileId.value
    ? secondarySessionTabs.value.find((session) => session.profileId === secondaryRemoteProfileId.value) ?? null
    : null),
);
function resolveTerminalOpenTarget(panel: ActiveBrowserPanel = activeBrowserPanel.value): TerminalOpenTarget | null {
  if (panel === 'local') {
    return showLocalPanel.value && ftpStore.localPath ? { kind: 'local', path: ftpStore.localPath } : null;
  }

  if (panel === 'secondaryRemote') {
    const session = secondaryRemoteSession.value;
    const profile = session ? ftpStore.profiles.find((item) => item.id === session.profileId) ?? null : null;
    if (!dualRemoteMode.value || !session || !profile?.sshProfileId) return null;
    return {
      kind: 'ssh',
      sshProfileId: profile.sshProfileId,
      path: secondaryRemotePath.value || session.remoteRoot || '/',
    };
  }

  if (!showRemotePanel.value || !activeSession.value || !activeFtpProfile.value?.sshProfileId) return null;
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
  if (activeBrowserPanel.value === 'local') return '当前本地目录不可用';
  return '当前远程连接未绑定 SSH Profile';
});
const canOpenTerminalFromFtp = computed(() => Boolean(terminalOpenTarget.value));
const secondaryRemoteBreadcrumbs = computed(() =>
  buildRemoteBreadcrumbs(secondaryRemotePath.value || secondaryRemoteSession.value?.remoteRoot || '/'),
);
const filteredSecondaryRemoteEntries = computed(() =>
  sortEntries(
    secondaryRemoteEntries.value.filter((entry) => matchesPanelFilter(entry, '', secondaryRemoteRuleFilter.value)),
    'name',
    'asc',
  ),
);
const secondaryRemotePathSuggestions = computed(() =>
  secondaryRemoteSession.value ? buildPathSuggestions(secondaryRemoteEntries.value, secondaryRemotePathInput.value) : [],
);
const selectedSecondaryRemoteEntries = computed(() =>
  filteredSecondaryRemoteEntries.value.filter((entry) => secondaryRemoteSelectedPaths.value.includes(entry.path)),
);
const fxpSourcePanel = computed<'remote' | 'secondaryRemote' | null>(() => {
  if (activeBrowserPanel.value === 'secondaryRemote' && selectedSecondaryRemoteEntries.value.length) {
    return 'secondaryRemote';
  }
  if (activeBrowserPanel.value === 'remote' && selectedRemoteEntries.value.length) {
    return 'remote';
  }
  if (selectedRemoteEntries.value.length) {
    return 'remote';
  }
  if (selectedSecondaryRemoteEntries.value.length) {
    return 'secondaryRemote';
  }
  return null;
});
const fxpSourceSession = computed(() =>
  fxpSourcePanel.value === 'secondaryRemote' ? secondaryRemoteSession.value : activeSession.value,
);
const fxpTargetSession = computed(() =>
  fxpSourcePanel.value === 'secondaryRemote' ? activeSession.value : secondaryRemoteSession.value,
);
const fxpSourceEntries = computed(() =>
  fxpSourcePanel.value === 'secondaryRemote' ? selectedSecondaryRemoteEntries.value : selectedRemoteEntries.value,
);
function isRemoteCopyPair() {
  const src = fxpSourceSession.value?.protocol ?? '';
  const dst = fxpTargetSession.value?.protocol ?? '';
  const srcProfile = ftpStore.profiles.find((p) => p.id === fxpSourceSession.value?.profileId);
  const dstProfile = ftpStore.profiles.find((p) => p.id === fxpTargetSession.value?.profileId);
  // True FXP: both ends are plain FTP with no SSH tunnel
  const isTrueFxp = src === 'ftp' && dst === 'ftp' && !srcProfile?.sshProfileId && !dstProfile?.sshProfileId;
  return !isTrueFxp;
}
const fxpActionLabel = computed(() => {
  const transferVerb = isRemoteCopyPair() ? '远程复制' : 'FXP';
  if (fxpSourcePanel.value === 'secondaryRemote') {
    return fxpSourceEntries.value.length > 1 ? `${transferVerb} 到主远程 (${fxpSourceEntries.value.length})` : `${transferVerb} 到主远程`;
  }
  return fxpSourceEntries.value.length > 1 ? `${transferVerb} 到第二远程 (${fxpSourceEntries.value.length})` : `${transferVerb} 到第二远程`;
});
const canTriggerFxp = computed(() =>
  Boolean(
    dualRemoteMode.value
    && fxpSourceSession.value
    && fxpTargetSession.value
    && fxpSourceEntries.value.length,
  ),
);

function setActiveBrowserPanel(panel: ActiveBrowserPanel) {
  activeBrowserPanel.value = panel;
}

function isFxpEligibleSession(_profileId: string, protocol: string) {
  // All active sessions (sftp, ftp, ftps) support remote copy.
  // True server-side FXP is only used internally when both ends are plain FTP;
  // SFTP and mixed combinations fall back to relay mode automatically.
  return ['sftp', 'ftp', 'ftps'].includes(protocol);
}

function resolveRemotePasteTarget(panel = activeBrowserPanel.value) {
  if (panel === 'secondaryRemote') {
    if (!dualRemoteMode.value || !secondaryRemoteSession.value) return null;
    return {
      panel,
      sessionId: secondaryRemoteSession.value.sessionId,
      remoteRoot: secondaryRemoteSession.value.remoteRoot,
      remotePath: secondaryRemotePath.value || secondaryRemoteSession.value.remoteRoot,
    };
  }
  if (panel !== 'remote' || !showRemotePanel.value || !activeSession.value) return null;
  return {
    panel,
    sessionId: activeSession.value.sessionId,
    remoteRoot: activeSession.value.remoteRoot,
    remotePath: ftpStore.remotePath || activeSession.value.remoteRoot,
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
  const targetSession = session ?? activeSession.value ?? secondaryRemoteSession.value;
  disconnectedSessionNotice.value = {
    sessionId: targetSession?.sessionId ?? '',
    profileId: targetSession?.profileId ?? '',
    label: targetSession?.profileLabel ?? 'FTP 连接',
    remotePath: remotePath || targetSession?.remoteRoot || '/',
    message,
  };
  disconnectedSessionDialogVisible.value = true;
  actionError.value = `${disconnectedSessionNotice.value.label} 连接已断开，请重连后继续操作。`;
  return true;
}

function handleFtpOperationError(error: unknown, session = activeSession.value, remotePath = ftpStore.remotePath) {
  if (noticeDisconnectedSession(error, session, remotePath)) return;
  actionError.value = errorMessage(error);
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
    disconnectedSessionDialogVisible.value = false;
    return;
  }

  reconnectingDisconnectedSession.value = true;
  actionError.value = '';
  try {
    if (notice.sessionId && ftpStore.sessions.some((session) => session.sessionId === notice.sessionId)) {
      try {
        await ftpStore.disconnect(notice.sessionId);
      } catch {
        // The backend may already have closed the stale session; reconnecting can continue.
      }
    }
    await connectProfile(profile);
    const nextSession = ftpStore.sessions.find((session) => session.profileId === profile.id) ?? activeSession.value;
    if (nextSession) {
      ftpStore.focusSession(nextSession.sessionId, notice.remotePath || nextSession.remoteRoot);
      if (notice.remotePath) {
        await refreshPrimaryRemoteDirectory(notice.remotePath);
      }
    }
    disconnectedSessionNotice.value = null;
    disconnectedSessionDialogVisible.value = false;
  } catch (error) {
    actionError.value = errorMessage(error);
    disconnectedSessionDialogVisible.value = true;
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

async function triggerFxpTransfer() {
  if (!dualRemoteMode.value || !fxpSourceSession.value || !fxpTargetSession.value || !fxpSourceEntries.value.length) {
    return;
  }
  if (!isFxpEligibleSession(fxpSourceSession.value.profileId, fxpSourceSession.value.protocol)
    || !isFxpEligibleSession(fxpTargetSession.value.profileId, fxpTargetSession.value.protocol)) {
    actionError.value = '远程复制需要两个已连接的会话（支持 SFTP、FTP、FTPS）';
    return;
  }

  const targetBasePath = fxpSourcePanel.value === 'secondaryRemote'
    ? (ftpStore.remotePath || fxpTargetSession.value.remoteRoot)
    : (secondaryRemotePath.value || fxpTargetSession.value.remoteRoot);

  busyMessage.value = '正在创建 FXP 服务器对传任务...';
  actionError.value = '';
  try {
    for (const entry of fxpSourceEntries.value) {
      await ftpStore.fxpTransfer(
        fxpSourceSession.value.sessionId,
        entry.path,
        fxpTargetSession.value.sessionId,
        joinRemotePath(targetBasePath, entry.name),
      );
    }
  } catch (error) {
    handleFtpOperationError(error, fxpSourceSession.value, targetBasePath);
  } finally {
    busyMessage.value = '';
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
  if (activeBrowserPanel.value === 'local') {
    selectAllLocalEntries();
    return;
  }
  if (activeBrowserPanel.value === 'secondaryRemote') {
    selectAllSecondaryRemoteEntries();
    return;
  }
  selectAllRemoteEntries();
}

function handleExplorerSelectAllShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || !isExplorerSelectAllShortcut(event)) return;
  if (shouldIgnoreExplorerShortcut(event.target)) return;
  event.preventDefault();
  selectAllActiveBrowserEntries();
}
const secondaryRemoteFilterSummary = computed(() => panelFilterSummary(secondaryRemoteRuleFilter.value));
const {
  thumbnailUrlFor,
  isThumbnailLoading,
} = useFtpThumbnails({
  ftpStore,
  filteredLocalEntries,
  filteredRemoteEntries,
  filteredSecondaryRemoteEntries,
  secondaryRemoteSessionId,
});
const visibleBrowserPanelCount = computed(() =>
  Number(showLocalPanel.value) + Number(showRemotePanel.value) + Number(dualRemoteMode.value),
);
const browserPanelGridStyle = computed(() => {
  if (!showLocalPanel.value || (!showRemotePanel.value && !dualRemoteMode.value) || panelLayoutMode.value !== 'columns') {
    return undefined;
  }

  return {
    gridTemplateColumns: `minmax(0, ${panelHSplitPct.value}fr) 5px minmax(0, ${100 - panelHSplitPct.value}fr)`,
  };
});
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
const isConnecting = computed(() => busyMessage.value.startsWith('正在连接 '));
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
  if (!activeSession.value || !isEditableTextEntry(entry)) return;
  editorTargetKind.value = 'remote';
  remoteEditorLoading.value = true;
  remoteEditorDialogVisible.value = true;
  remoteEditorPath.value = entry.path;
  remoteEditorContent.value = '';
  remoteEditorOriginalContent.value = '';
  actionError.value = '';
  try {
    remoteEditorContent.value = await window.ftpApi.loadRemoteTextFile(activeSession.value.sessionId, entry.path);
    remoteEditorOriginalContent.value = remoteEditorContent.value;
  } catch (error) {
    remoteEditorDialogVisible.value = false;
    handleFtpOperationError(error, activeSession.value, entry.path);
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
  if (!activeSession.value || !isPreviewableImageEntry(entry)) return;
  const session = activeSession.value;
  remotePreviewSource.value = 'remote';
  remotePreviewKind.value = 'image';
  remotePreviewDialogVisible.value = true;
  remotePreviewLoading.value = true;
  remotePreviewPath.value = entry.path;
  remotePreviewName.value = entry.name;
  resetRemotePreviewContent();
  actionError.value = '';
  try {
    const dataUrl = await window.ftpApi.loadRemoteImagePreview(session.sessionId, entry.path, IMAGE_PREVIEW_MAX_BYTES);
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
  if (activeBrowserPanel.value === 'local') {
    await previewLocalImage(selectedLocalEntry.value);
    return;
  }
  if (activeBrowserPanel.value === 'remote') {
    await previewRemoteImage(selectedRemoteEntry.value);
  }
}

async function previewRemoteText(entry = selectedRemoteEntry.value) {
  if (!activeSession.value || !isEditableTextEntry(entry)) return;
  const session = activeSession.value;
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
      session.sessionId,
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
  if (!activeSession.value || !isEditableTextEntry(entry)) return;
  actionError.value = '';
  try {
    const tempPath = await window.ftpApi.openExternalEditorDraft(activeSession.value.sessionId, entry.path, {
      editorPath: externalEditorPath.value || undefined,
      cleanupOnClose: cleanupExternalDraftsOnClose.value,
    });
    if (!externalEditorPath.value) {
      await window.shellApi.openPath(tempPath);
    }
  } catch (error) {
    handleFtpOperationError(error, activeSession.value, entry.path);
  }
}

async function openExternalEditor() {
  await openRemoteExternalEditor(selectedRemoteEntry.value);
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
    if (target.kind === 'local') {
      await terminalStore.initialize();
      const session = await terminalStore.createSession({ cwd: target.path });
      terminalStore.focusSession(session.sessionId);
      await router.push({ path: '/terminal', query: { tab: 'terminal' } });
      return;
    }

    await sshStore.initialize();
    const existing = sshStore.sessions.find(
      (session) => session.profileId === target.sshProfileId && session.status === 'connected',
    ) ?? sshStore.sessions.find((session) => session.profileId === target.sshProfileId);
    const session = existing ?? await sshStore.connect({
      profileId: target.sshProfileId,
      rows: 32,
      cols: 120,
    });
    sshStore.focusSession(session.sessionId);
    await router.push({ path: '/terminal', query: { tab: 'ssh' } });
    await sshStore.write(session.sessionId, `cd ${shellQuote(target.path)}\n`);
  } catch (error) {
    actionError.value = errorMessage(error);
  }
}

async function openTerminalForCurrentFtp() {
  await openTerminalForPanel(activeBrowserPanel.value);
}

function shellQuote(path: string) {
  return `'${path.replaceAll("'", `'\"'\"'`)}'`;
}

async function changeRemotePermissions(entry = selectedRemoteEntry.value) {
  if (!entry || !activeSession.value) return;
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
  if (!activeSession.value || !pendingExternalPaths.value.length) return;
  actionError.value = '';
  try {
    for (const itemPath of pendingExternalPaths.value) {
      const fileName = itemPath.split(/[\\/]/).filter(Boolean).pop();
      if (!fileName) continue;
      await ftpStore.uploadFile(
        itemPath,
        joinRemotePath(ftpStore.remotePath || activeSession.value.remoteRoot, fileName),
      );
    }
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
      mode: PanelLayoutMode;
      sidebarDockSide: SidebarDockSide;
      auxiliaryDockSide: AuxiliaryDockSide;
      auxiliaryDockSize: string;
      showSidebar: boolean;
      showLocal: boolean;
      showRemote: boolean;
      auxCollapsed: boolean;
    }>;
    if (parsed.mode === 'columns' || parsed.mode === 'stacked') {
      panelLayoutMode.value = parsed.mode;
    }
    sidebarDockSide.value = parsed.sidebarDockSide === 'right' ? 'right' : 'left';
    auxiliaryDockSide.value = parsed.auxiliaryDockSide === 'right' ? 'right' : 'bottom';
    auxiliaryDockSize.value = normalizePanelSize(parsed.auxiliaryDockSize, 180, '260');
    showSidebarPanel.value = parsed.showSidebar ?? true;
    showLocalPanel.value = parsed.showLocal ?? true;
    showRemotePanel.value = parsed.showRemote ?? true;
    auxiliaryDockCollapsed.value = parsed.auxCollapsed ?? false;
    showLogPanel.value = true;
    if (!showLocalPanel.value && !showRemotePanel.value) {
      showRemotePanel.value = true;
    }
  } catch {
    panelLayoutMode.value = 'columns';
    sidebarDockSide.value = 'left';
    auxiliaryDockSide.value = 'bottom';
    auxiliaryDockSize.value = '260';
    showSidebarPanel.value = true;
    showLocalPanel.value = true;
    showRemotePanel.value = true;
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
    showLocal: showLocalPanel.value,
    showRemote: showRemotePanel.value,
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
      dualRemoteMode: boolean;
      secondaryTabGroupProfileIds: string[];
      secondaryRemoteProfileId: string;
    }>;
    externalEditorPath.value = typeof parsed.externalEditorPath === 'string' ? parsed.externalEditorPath : '';
    cleanupExternalDraftsOnClose.value = Boolean(parsed.cleanupExternalDraftsOnClose);
    linkNavigationEnabled.value = Boolean(parsed.linkNavigationEnabled);
    localPanelViewMode.value = parsed.localPanelViewMode === 'list' ? 'list' : 'details';
    remotePanelViewMode.value = parsed.remotePanelViewMode === 'list' ? 'list' : 'details';
    dualRemoteMode.value = Boolean(parsed.dualRemoteMode);
    secondaryTabGroupProfileIds.value = Array.isArray(parsed.secondaryTabGroupProfileIds)
      ? parsed.secondaryTabGroupProfileIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
    secondaryRemoteProfileId.value = typeof parsed.secondaryRemoteProfileId === 'string' ? parsed.secondaryRemoteProfileId : '';
  } catch {
    externalEditorPath.value = '';
    cleanupExternalDraftsOnClose.value = false;
    linkNavigationEnabled.value = false;
    localPanelViewMode.value = 'details';
    remotePanelViewMode.value = 'details';
    dualRemoteMode.value = false;
    secondaryTabGroupProfileIds.value = [];
    secondaryRemoteProfileId.value = '';
  }
}

function persistFtpPreferences() {
  window.localStorage.setItem(FTP_PREFERENCES_STORAGE_KEY, JSON.stringify({
    externalEditorPath: externalEditorPath.value,
    cleanupExternalDraftsOnClose: cleanupExternalDraftsOnClose.value,
    linkNavigationEnabled: linkNavigationEnabled.value,
    localPanelViewMode: localPanelViewMode.value,
    remotePanelViewMode: remotePanelViewMode.value,
    dualRemoteMode: dualRemoteMode.value,
    secondaryTabGroupProfileIds: secondaryTabGroupProfileIds.value,
    secondaryRemoteProfileId: secondaryRemoteProfileId.value,
  }));
}

function clearSecondaryRemoteState() {
  secondaryRemoteSessionId.value = '';
  secondaryRemoteProfileId.value = '';
  secondaryRemoteEntries.value = [];
  secondaryRemotePath.value = '';
  secondaryRemotePathInput.value = '';
  secondaryRemoteSelectedPaths.value = [];
  secondaryRemoteLastSelectedIndex.value = -1;
}

function uniqueProfileIds(profileIds: string[]) {
  return Array.from(new Set(profileIds.filter(Boolean)));
}

function normalizePanelSize(value: string | undefined, min: number, fallback: string) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return String(Math.max(min, parsed));
}

function normalizeSecondaryTabGroupProfiles() {
  const connectedProfileIds = new Set(ftpStore.sessions.map((session) => session.profileId));
  let nextProfileIds = uniqueProfileIds(secondaryTabGroupProfileIds.value)
    .filter((profileId) => connectedProfileIds.has(profileId));
  const activeProfileId = activeSession.value?.profileId;
  if (activeProfileId && nextProfileIds.includes(activeProfileId)) {
    nextProfileIds = nextProfileIds.filter((profileId) => profileId !== activeProfileId);
  }
  if (ftpStore.sessions.length <= 1) {
    nextProfileIds = [];
  }
  secondaryTabGroupProfileIds.value = nextProfileIds;
}

function sessionTabGroup(sessionId: string): SessionTabGroup {
  const session = ftpStore.sessions.find((item) => item.sessionId === sessionId);
  if (!session) return 'primary';
  return secondaryTabGroupProfileIds.value.includes(session.profileId) ? 'secondary' : 'primary';
}

async function openLocalBreadcrumb(path: string) {
  await ftpStore.refreshLocalDirectory(path);
}

async function openRemoteBreadcrumb(path: string) {
  if (!activeSession.value) return;
  await refreshPrimaryRemoteDirectory(path);
}

async function refreshSecondaryRemoteDirectory(
  path = secondaryRemotePath.value,
  sessionId = secondaryRemoteSession.value?.sessionId ?? secondaryRemoteSessionId.value,
) {
  const session = ftpStore.sessions.find((item) => item.sessionId === sessionId) ?? null;
  if (!session) {
    secondaryRemoteEntries.value = [];
    secondaryRemotePath.value = '';
    secondaryRemotePathInput.value = '';
    secondaryRemoteSelectedPaths.value = [];
    return;
  }
  const nextPath = path || secondaryRemoteSessionPaths.value[session.sessionId] || session.remoteRoot;
  secondaryRemoteLoading.value = true;
  try {
    secondaryRemoteEntries.value = await window.ftpApi.listRemoteDirectory(session.sessionId, nextPath);
    secondaryRemotePath.value = nextPath;
    secondaryRemotePathInput.value = nextPath;
    secondaryRemoteSessionPaths.value = {
      ...secondaryRemoteSessionPaths.value,
      [session.sessionId]: nextPath,
    };
    secondaryRemoteSelectedPaths.value = [];
    secondaryRemoteLastSelectedIndex.value = -1;
  } catch (error) {
    handleFtpOperationError(error, session, nextPath);
  } finally {
    secondaryRemoteLoading.value = false;
  }
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
    if (target.panel === 'primary') {
      if (activeSession.value?.sessionId !== target.sessionId) continue;
      if (normalizeRemoteDirectoryPath(ftpStore.remotePath || activeSession.value.remoteRoot) !== target.path) continue;
      await refreshPrimaryRemoteDirectory(target.path);
      continue;
    }

    if (secondaryRemoteSessionId.value !== target.sessionId) continue;
    if (normalizeRemoteDirectoryPath(secondaryRemotePath.value || secondaryRemoteSession.value?.remoteRoot || '/') !== target.path) continue;
    await refreshSecondaryRemoteDirectory(target.path, target.sessionId);
  }
}

function refreshVisibleRemoteDirectoriesForCompletedTask(task: TransferTaskRefreshSnapshot) {
  if (!shouldRefreshRemoteDirectoryForTask(task)) return;

  const primarySession = activeSession.value;
  const primaryPath = ftpStore.remotePath || primarySession?.remoteRoot || '';
  if (primarySession
    && (task.direction !== 'upload' || task.sessionId === primarySession.sessionId)
    && remoteTransferAffectsDirectory(task.remotePath, primaryPath)) {
    queueRemoteDirectoryRefresh('primary', primarySession.sessionId, primaryPath);
  }

  const secondarySession = secondaryRemoteSession.value;
  const secondaryPath = secondaryRemotePath.value || secondarySession?.remoteRoot || '';
  if (secondarySession
    && (task.direction !== 'upload' || task.sessionId === secondarySession.sessionId)
    && remoteTransferAffectsDirectory(task.remotePath, secondaryPath)) {
    queueRemoteDirectoryRefresh('secondary', secondarySession.sessionId, secondaryPath);
  }
}

async function ensureSecondaryRemoteSession(preferredPath = '') {
  if (!dualRemoteMode.value) {
    clearSecondaryRemoteState();
    return;
  }
  const sessions = secondarySessionTabs.value;
  if (!sessions.length) {
    dualRemoteMode.value = false;
    clearSecondaryRemoteState();
    return;
  }
  const nextSession = sessions.find((item) => item.sessionId === secondaryRemoteSessionId.value)
    ?? (secondaryRemoteProfileId.value
      ? sessions.find((item) => item.profileId === secondaryRemoteProfileId.value)
      : null)
    ?? sessions[0];
  const sessionChanged = secondaryRemoteSessionId.value !== nextSession.sessionId;
  secondaryRemoteSessionId.value = nextSession.sessionId;
  secondaryRemoteProfileId.value = nextSession.profileId;
  if (preferredPath || sessionChanged || !secondaryRemoteEntries.value.length) {
    await refreshSecondaryRemoteDirectory(preferredPath || secondaryRemoteSessionPaths.value[nextSession.sessionId] || nextSession.remoteRoot, nextSession.sessionId);
  }
}

async function setSessionTabGroup(sessionId: string, group: SessionTabGroup) {
  const session = ftpStore.sessions.find((item) => item.sessionId === sessionId) ?? null;
  if (!session) return;
  const currentlySecondary = secondaryTabGroupProfileIds.value.includes(session.profileId);
  if (group === 'secondary') {
    if (currentlySecondary) {
      await setSecondaryRemoteSession(sessionId);
      return;
    }
    const remainingPrimarySessions = ftpStore.sessions.filter((item) =>
      item.sessionId !== sessionId && !secondaryTabGroupProfileIds.value.includes(item.profileId),
    );
    if (!remainingPrimarySessions.length) {
      actionError.value = '主标签组至少需要保留一个已连接会话';
      return;
    }
    secondaryTabGroupProfileIds.value = uniqueProfileIds([...secondaryTabGroupProfileIds.value, session.profileId]);
    dualRemoteMode.value = true;
    if (activeSession.value?.sessionId === sessionId) {
      ftpStore.focusSession(remainingPrimarySessions[0].sessionId);
    }
    await refreshSecondaryRemoteDirectory(secondaryRemoteSessionPaths.value[sessionId] || session.remoteRoot, sessionId);
    secondaryRemoteSessionId.value = sessionId;
    secondaryRemoteProfileId.value = session.profileId;
    return;
  }

  if (!currentlySecondary) return;
  secondaryTabGroupProfileIds.value = secondaryTabGroupProfileIds.value.filter((profileId) => profileId !== session.profileId);
  if (!secondaryTabGroupProfileIds.value.length) {
    dualRemoteMode.value = false;
    clearSecondaryRemoteState();
    return;
  }
  await ensureSecondaryRemoteSession();
}

async function setSecondaryRemoteSession(sessionId: string) {
  secondaryRemoteSessionId.value = sessionId;
  const session = availableSecondaryRemoteSessions.value.find((item) => item.sessionId === sessionId) ?? null;
  secondaryRemoteProfileId.value = session?.profileId ?? '';
  if (!sessionId) {
    clearSecondaryRemoteState();
    return;
  }
  if (session && !secondaryTabGroupProfileIds.value.includes(session.profileId)) {
    secondaryTabGroupProfileIds.value = uniqueProfileIds([...secondaryTabGroupProfileIds.value, session.profileId]);
  }
  dualRemoteMode.value = true;
  await refreshSecondaryRemoteDirectory(secondaryRemoteSessionPaths.value[sessionId] || session?.remoteRoot || '/', sessionId);
}

async function openSecondaryRemoteBreadcrumb(path: string) {
  await refreshSecondaryRemoteDirectory(path);
}

function updateSecondaryRemoteSelection(paths: string[], primaryPath: string, index: number) {
  secondaryRemoteSelectedPaths.value = paths;
  secondaryRemoteLastSelectedIndex.value = index;
}

function updateSecondaryRemotePathsSelection(paths: string[], additive = false) {
  const nextPaths = additive
    ? [...new Set([...secondaryRemoteSelectedPaths.value, ...paths])]
    : paths;
  const primaryPath = nextPaths[nextPaths.length - 1] ?? '';
  const primaryIndex = primaryPath
    ? filteredSecondaryRemoteEntries.value.findIndex((entry) => entry.path === primaryPath)
    : -1;
  updateSecondaryRemoteSelection(nextPaths, primaryPath, primaryIndex);
}

function selectAllSecondaryRemoteEntries() {
  updateSecondaryRemotePathsSelection(filteredSecondaryRemoteEntries.value.map((entry) => entry.path));
}

function handleSecondaryRemoteMarqueeSelect(payload: { paths: string[]; additive: boolean }) {
  updateSecondaryRemotePathsSelection(payload.paths, payload.additive);
}

function handleSecondaryRemoteEntryClick(event: MouseEvent, entry: FileTransferEntry, index: number) {
  if (event.shiftKey && secondaryRemoteLastSelectedIndex.value >= 0) {
    const [start, end] = [secondaryRemoteLastSelectedIndex.value, index].sort((left, right) => left - right);
    updateSecondaryRemoteSelection(
      filteredSecondaryRemoteEntries.value.slice(start, end + 1).map((item) => item.path),
      entry.path,
      index,
    );
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    const next = secondaryRemoteSelectedPaths.value.includes(entry.path)
      ? secondaryRemoteSelectedPaths.value.filter((path) => path !== entry.path)
      : [...secondaryRemoteSelectedPaths.value, entry.path];
    updateSecondaryRemoteSelection(next, entry.path, index);
    return;
  }

  updateSecondaryRemoteSelection([entry.path], entry.path, index);
}

async function openSecondaryRemoteEntry(entry: FileTransferEntry) {
  updateSecondaryRemoteSelection(
    [entry.path],
    entry.path,
    filteredSecondaryRemoteEntries.value.findIndex((item) => item.path === entry.path),
  );
  if (!entry.isDir) return;
  await refreshSecondaryRemoteDirectory(entry.path);
  await syncRemotePanelToChild(entry.name);
}

async function goSecondaryRemoteParent() {
  if (!secondaryRemoteSession.value) return;
  await refreshSecondaryRemoteDirectory(parentRemotePath(secondaryRemotePath.value || secondaryRemoteSession.value.remoteRoot));
  await syncRemotePanelToParent();
}

async function openSecondaryRemotePath() {
  if (!secondaryRemoteSession.value) return;
  await refreshSecondaryRemoteDirectory(secondaryRemotePathInput.value.trim() || secondaryRemoteSession.value.remoteRoot);
}

async function focusSecondaryRemoteAsPrimary() {
  const nextPrimary = secondaryRemoteSession.value;
  const previousPrimary = activeSession.value;
  const previousPrimaryPath = ftpStore.remotePath || previousPrimary?.remoteRoot || '/';
  if (!nextPrimary) return;
  secondaryTabGroupProfileIds.value = secondaryTabGroupProfileIds.value.filter((profileId) => profileId !== nextPrimary.profileId);
  ftpStore.focusSession(nextPrimary.sessionId);
  if (previousPrimary && previousPrimary.sessionId !== nextPrimary.sessionId) {
    secondaryTabGroupProfileIds.value = uniqueProfileIds([...secondaryTabGroupProfileIds.value, previousPrimary.profileId]);
    secondaryRemoteSessionId.value = previousPrimary.sessionId;
    secondaryRemoteProfileId.value = previousPrimary.profileId;
    await refreshSecondaryRemoteDirectory(previousPrimaryPath, previousPrimary.sessionId);
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
  if (!permissionDialogTargetPath.value) return;
  actionError.value = '';
  try {
    await ftpStore.chmodRemotePath(permissionDialogTargetPath.value, permissionModeInput.value);
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
  const group = sessionTabGroup(sessionId);
  const moveToSecondaryDisabled = group === 'primary' && primarySessionTabs.value.length <= 1;
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
      id: `ftp-tab-move-${sessionId}`,
      label: group === 'secondary' ? '移回主标签组' : '移到第二标签组',
      icon: ConvertIcon,
      disabled: group === 'primary' ? moveToSecondaryDisabled : false,
      action: () => {
        void setSessionTabGroup(sessionId, group === 'secondary' ? 'primary' : 'secondary');
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
  if (dualRemoteMode.value && secondaryRemoteSession.value) {
    const matchedEntry = secondaryRemoteEntries.value.find((entry) => entry.isDir && entry.name === entryName);
    if (!matchedEntry) return;
    await refreshSecondaryRemoteDirectory(matchedEntry.path);
    return;
  }
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
  if (dualRemoteMode.value && secondaryRemoteSession.value) {
    await refreshSecondaryRemoteDirectory(parentRemotePath(secondaryRemotePath.value || secondaryRemoteSession.value.remoteRoot));
    return;
  }
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
    if (session && secondaryTabGroupProfileIds.value.includes(session.profileId)) {
      secondaryTabGroupProfileIds.value = secondaryTabGroupProfileIds.value.filter((profileId) => profileId !== session.profileId);
      await ensureSecondaryRemoteSession();
    }
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
    showLocalPanel,
    showRemotePanel,
    showLogPanel,
    dualRemoteMode,
  ],
  () => {
    if (!showLocalPanel.value && !showRemotePanel.value && !dualRemoteMode.value) {
      showRemotePanel.value = true;
      return;
    }
    persistPanelLayout();
  },
  { immediate: false },
);

watch(
  [
    externalEditorPath,
    cleanupExternalDraftsOnClose,
    linkNavigationEnabled,
    localPanelViewMode,
    remotePanelViewMode,
    dualRemoteMode,
    secondaryRemoteProfileId,
    secondaryTabGroupProfileIds,
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
    // 只在并行模式已开启时才规范化，避免刚通过 setSessionTabGroup 设置
    // dualRemoteMode=true 后立即被此 watcher 的 normalizeSecondaryTabGroupProfiles 清空
    if (dualRemoteMode.value) {
      normalizeSecondaryTabGroupProfiles();
    }
    void ensureSecondaryRemoteSession();
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
    () => ftpStore.sessions.map((session) => session.sessionId).join('|'),
  ],
  ([routeName, initialized]) => {
    if (routeName !== 'FileTransfer' || !initialized) return;
    void processPendingOpenRequest();
  },
  { immediate: false },
);

async function initializeFtpPage() {
  await initializePage();
  await processPendingOpenRequest();
}

onMounted(() => {
  globalStore.setTopbarColor('');
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
  window.removeEventListener('keydown', handleExplorerPasteShortcut);
  window.removeEventListener('keydown', handleExplorerSelectAllShortcut);
  window.removeEventListener('unhandledrejection', handleUnhandledFtpRejection);
  window.removeEventListener('resize', updateViewportState);
  stopAuxiliaryDockResize?.();
});
</script>

<template>
  <div class="ftp-page" :class="{
    'ftp-page--sidebar-hidden': !showSidebarPanel,
    'ftp-page--sidebar-right': sidebarDockSide === 'right',
    'ftp-page--dense': isDenseViewport,
  }" :style="{
      '--ftp-aux-dock-size': `${auxiliaryDockSize}px`,
    }">
    <FtpConfigSidebar v-if="showSidebarPanel" :sidebar-collapsed="sidebarCollapsed"
      :profiles-count="ftpStore.profiles.length" :sessions-count="ftpStore.sessions.length"
      :config-tree-nodes="configTreeNodes" :selected-config-tree-node-id="selectedConfigTreeNodeId"
      :config-tree-expanded-ids="configTreeExpandedIds" :sessions="ftpStore.sessions"
      :active-session-id="ftpStore.activeSessionId" :secondary-tab-group-profile-ids="secondaryTabGroupProfileIds"
      :dual-remote-mode="dualRemoteMode" :secondary-remote-session-id="secondaryRemoteSessionId"
      :restore-failure-profiles="restoreFailureProfiles" :session-status-label="sessionStatusLabel"
      :session-status-tone="sessionStatusTone" @toggle-sidebar="toggleSidebarCollapsed"
      @open-create-dialog="openCreateDialog($event)" @open-create-folder-dialog="openCreateFolderDialog($event)"
      @open-collapsed-configs-menu="openCollapsedConfigsMenu" @update:expandedIds="configTreeExpandedIds = $event"
      @select-config="handleConfigTreeSelect" @activate-config="handleConfigTreeActivate"
      @contextmenu-config="openConfigNodeContextMenu" @drop-config="handleConfigTreeDrop"
      @focus-session="ftpStore.focusSession($event)" @focus-secondary-session="setSecondaryRemoteSession($event)"
      @disconnect-session="disconnectSession" @reconnect-profile="connectProfile"
      @session-contextmenu="openSessionTabContextMenu($event.event, $event.sessionId)"
      @session-dragstart="handleSessionTabDragStart($event)" @session-drop="handleSessionTabDrop($event)" />

    <main class="ftp-main">
      <div class="ftp-workspace-shell" :class="{
        'ftp-workspace-shell--aux-right': auxiliaryDockSide === 'right',
        'ftp-workspace-shell--aux-bottom': auxiliaryDockSide === 'bottom',
      }">
        <div class="ftp-workspace">
          <section class="ftp-hero">
            <div class="ftp-hero__actions" aria-label="文件传输快捷操作">
              <span v-if="busyMessage" class="ftp-badge ftp-badge--accent ftp-hero__busy">{{ busyMessage }}</span>
              <UiTooltip content="定时任务" placement="bottom">
                <UiIconButton size="sm" variant="ghost" title="定时任务" @click="openScheduleDialog()">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="8" cy="8" r="6" />
                    <path d="M8 5v3l2 1.5" />
                  </svg>
                </UiIconButton>
              </UiTooltip>
              <UiTooltip :content="`恢复标签 · ${recentClosedSessionSummary}`" placement="bottom">
                <UiIconButton size="sm" variant="ghost" :disabled="!recentlyClosedSessions.length"
                  :title="`恢复标签 · ${recentClosedSessionSummary}`" @click="reopenLastClosedSession()">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3.5 8A4.5 4.5 0 1 0 5 4.2L3.5 5.5" />
                    <path d="M3.5 2.8v2.7H6.2" />
                  </svg>
                </UiIconButton>
              </UiTooltip>
              <UiTooltip content="预览图片" placement="bottom">
                <UiIconButton size="sm" variant="ghost" :disabled="!canPreviewActiveImage" title="预览图片"
                  @click="previewActiveImage()">
                  <CategoryMediaIcon width="14" height="14" />
                </UiIconButton>
              </UiTooltip>
              <UiTooltip content="预览文本" placement="bottom">
                <UiIconButton size="sm" variant="ghost" :disabled="!canPreviewRemoteText" title="预览文本"
                  @click="previewRemoteText()">
                  <CategoryTextIcon width="14" height="14" />
                </UiIconButton>
              </UiTooltip>
              <UiTooltip content="编辑远程" placement="bottom">
                <UiIconButton size="sm" variant="ghost" :disabled="!canEditRemoteFile" title="编辑远程"
                  @click="openRemoteEditor()">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 2.5l2.5 2.5-7 7-3 .5.5-3z" />
                    <path d="M9.5 4l2.5 2.5" />
                  </svg>
                </UiIconButton>
              </UiTooltip>
              <UiTooltip content="外部编辑" placement="bottom">
                <UiIconButton size="sm" variant="ghost" :disabled="!canEditRemoteFile" title="外部编辑"
                  @click="openExternalEditor()">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 2h5v5M9 7l5-5M7 4H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" />
                  </svg>
                </UiIconButton>
              </UiTooltip>
              <UiTooltip content="修改权限" placement="bottom">
                <UiIconButton size="sm" variant="ghost" :disabled="!canChmodRemoteFile" title="修改权限"
                  @click="changeRemotePermissions()">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 1L6 3v2L4.5 6.5A5 5 0 1 0 9.5 11.5L11 10h2l2-2-2-2h-1V4z" />
                    <circle cx="10" cy="10" r="1.5" />
                  </svg>
                </UiIconButton>
              </UiTooltip>
              <UiTooltip v-if="dualRemoteMode" :content="fxpActionLabel" placement="bottom">
                <UiIconButton v-if="dualRemoteMode" size="sm" variant="ghost" :disabled="!canTriggerFxp"
                  :title="fxpActionLabel" @click="triggerFxpTransfer()">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 5h12M2 11h12M11 2l3 3-3 3M5 8l-3 3 3 3" />
                  </svg>
                </UiIconButton>
              </UiTooltip>
              <UiTooltip :content="terminalOpenTooltip" placement="bottom">
                <UiIconButton size="sm" variant="secondary" :disabled="!canOpenTerminalFromFtp"
                  :title="terminalOpenTooltip" @click="openTerminalForCurrentFtp">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <rect x="1" y="2" width="14" height="12" rx="1.5" />
                    <path d="M4 6l3 2.5L4 11M9 11h3" />
                  </svg>
                </UiIconButton>
              </UiTooltip>
              <UiTooltip content="目录比较/同步" placement="bottom">
                <UiIconButton size="sm" variant="secondary" title="目录比较/同步" @click="openSyncPanel">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 4h5v8H2zM9 4h5v8H9M7 8h2" />
                  </svg>
                </UiIconButton>
              </UiTooltip>
              <UiTooltip content="传输设置" placement="bottom">
                <UiIconButton size="sm" variant="secondary" title="传输设置" @click="openTransferSettingsPage">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="8" cy="8" r="2" />
                    <path
                      d="M8 1v2M8 13v2M1 8h2M13 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
                  </svg>
                </UiIconButton>
              </UiTooltip>
            </div>
          </section>

          <div v-if="actionError" class="ftp-alert ftp-alert--error">
            <span>{{ actionError }}</span>
            <div v-if="disconnectedSessionNotice" class="ftp-alert__actions">
              <UiButton
                size="sm"
                variant="secondary"
                :disabled="reconnectingDisconnectedSession || !disconnectedSessionProfile"
                @click="reconnectDisconnectedSession"
              >
                {{ reconnectingDisconnectedSession ? '重连中' : '重连' }}
              </UiButton>
              <UiButton size="sm" variant="ghost" @click="disconnectedSessionDialogVisible = true">详情</UiButton>
            </div>
          </div>
          <div v-if="pendingExternalSummary" class="ftp-alert ftp-alert--info">
            <span>{{ pendingExternalSummary }}</span>
            <div class="ftp-alert__actions">
              <UiIconButton size="sm" variant="secondary" :disabled="!activeSession" label="上传到当前远程"
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

          <section class="ftp-panels" :class="[
            `ftp-panels--${panelLayoutMode}`,
            { 'ftp-panels--single': visibleBrowserPanelCount <= 1, 'ftp-panels--parallel': dualRemoteMode },
          ]" :style="browserPanelGridStyle">
            <!-- 双端模式：本地面板占第一列，两个远程面板在第二列垂直堆叠 -->
            <FtpBrowserPanel v-if="showLocalPanel" kind="local" title="本地目录"
              :badges="[{ text: `${filteredLocalEntries.length} 项` }]" :drop-active="localDropActive"
              :active="activeBrowserPanel === 'local'"
              :breadcrumbs="localBreadcrumbs" :path-input="localPathInput" :path-suggestions="localPathSuggestions"
              path-placeholder="输入本地目录" :view-mode="localPanelViewMode" :search-expanded="localSearchExpanded"
              :search-active="localSearchExpanded || !!localFilterQuery" :filter-expanded="localRuleFilterExpanded"
              :filter-active="localRuleFilterExpanded || isRuleFilterActive(localRuleFilter)"
              :filter-query="localFilterQuery" :filter-state="localRuleFilter" :filter-summary="localFilterSummary"
              :filter-preset-id="localFilterPresetId" :filter-preset-options="filterPresetOptions"
              :entries="filteredLocalEntries" :loading="ftpStore.localLoading" loading-text="正在读取本地目录..."
              :empty-text="localFilterQuery || isRuleFilterActive(localRuleFilter) ? '没有匹配的本地文件。' : '本地目录为空。'"
              drop-hint="释放后下载到当前本地目录" :selected-paths="localSelectedPaths" :selected-count="localSelectedPaths.length"
              :primary-action-label="uploadActionLabel" primary-action-variant="primary"
              :primary-action-disabled="!canUpload" :show-workspace-controls="true"
              :workspace-select-value="localWorkspaceSelectValue" :workspace-options="localWorkspaceOptions"
              :bookmark-disabled="!ftpStore.localPath" :remove-bookmark-disabled="!currentLocalWorkspaceBookmarked"
              secondary-meta-label="大小" tertiary-meta-label="修改时间"
              :size-value="(entry) => (entry.isDir ? '--' : formatSize(entry.size))"
              :modified-value="(entry) => formatTime(entry.modifiedAt)"
              :permissions-value="(entry) => entry.permissions || '--'" :owner-value="(entry) => entry.owner || '--'"
              :secondary-meta-value="(entry) => (entry.isDir ? '--' : formatSize(entry.size))"
              :tertiary-meta-value="(entry) => formatTime(entry.modifiedAt)"
              :thumbnail-url-for="(entry) => thumbnailUrlFor('local', entry)"
              :is-thumbnail-loading="(entry) => isThumbnailLoading('local', entry)"
              :highlight-entry-name="highlightEntryName" @dragenter="handleLocalDragEnter"
              @dragleave="handleLocalDragLeave" @dragover="handleLocalDragOver" @drop="handleLocalDrop"
              @update:pathInput="localPathInput = $event" @update:filterQuery="localFilterQuery = $event"
              @update:extensionQuery="localRuleFilter.extensionQuery = $event"
              @update:minSizeKb="localRuleFilter.minSizeKb = $event"
              @update:maxSizeKb="localRuleFilter.maxSizeKb = $event"
              @update:modifiedWithinDays="localRuleFilter.modifiedWithinDays = $event" @primary-action="uploadSelected"
              @create-directory="createLocalDirectory" @switch-workspace="switchLocalWorkspace"
              @bookmark-current="addCurrentLocalWorkspace" @pick-workspace="pickLocalWorkspace"
              @remove-workspace="removeCurrentLocalWorkspace" @open-breadcrumb="openLocalBreadcrumb"
              @open-path="openLocalPath" @go-parent="goLocalParent" @refresh="ftpStore.refreshLocalDirectory()"
              @toggle-search="toggleSearch('local')" @toggle-filter="toggleRuleFilter('local')"
              @set-view-mode="localPanelViewMode = $event" @set-filter-mode="setRuleFilterMode('local', $event)"
              @set-filter-operator="setRuleFilterOperator('local', $event)"
              @toggle-hide-hidden="toggleHideHidden('local')" @apply-filter-preset="applyFilterPreset('local', $event)"
              @save-filter-preset="saveFilterPreset('local')"
              @delete-filter-preset="deleteSelectedFilterPreset('local')" @reset-filter="resetRuleFilter('local')"
              @panel-activate="setActiveBrowserPanel('local')"
              @select-all="selectAllLocalEntries"
              @marquee-select="handleLocalMarqueeSelect"
              @list-contextmenu="handlePanelListContextMenu($event, 'local')"
              @entry-click="handleLocalEntryClick($event.event, $event.entry, $event.index)"
              @entry-dblclick="openLocalEntry" @entry-dragstart="handleLocalDragStart($event.event, $event.entry)"
              @entry-dragend="handleEntryDragEnd"
              @entry-contextmenu="handleEntryContextMenu($event.event, 'local', $event.entry, $event.index)" />

            <!-- 水平分割条（只在并联模式且本地面板可见时显示） -->
            <div v-if="dualRemoteMode && showLocalPanel && panelLayoutMode === 'columns'" class="ftp-panels__h-divider"
              @mousedown="startHDrag" />

            <!-- 双端模式：两个远程面板的堆叠容器（第二列） -->
            <div v-if="dualRemoteMode" class="ftp-panels__remote-stack"
              :style="{ '--ftp-remote-top-pct': `${remoteVSplitPct}%` }">

              <FtpBrowserPanel v-if="dualRemoteMode" kind="remote"
                :title="secondaryRemoteSession ? `${secondaryRemoteSession.profileLabel} · 第二标签组` : '第二标签组目录'" :badges="[
                  { text: '第二组', accent: true },
                  { text: secondaryRemoteSession ? secondaryRemoteSession.protocol.toUpperCase() : 'SFTP' },
                  { text: `${secondaryRemoteSession ? filteredSecondaryRemoteEntries.length : 0} 项` },
                ]" :drop-active="false" :active="activeBrowserPanel === 'secondaryRemote'"
                :breadcrumbs="secondaryRemoteBreadcrumbs" :path-input="secondaryRemotePathInput"
                :path-suggestions="secondaryRemotePathSuggestions" path-placeholder="输入第二远程目录"
                :view-mode="remotePanelViewMode" :path-input-disabled="!secondaryRemoteSession"
                :open-path-disabled="!secondaryRemoteSession" :go-parent-disabled="!secondaryRemoteSession"
                :refresh-disabled="!secondaryRemoteSession" :show-search-control="false" :show-filter-control="false"
                :show-create-directory-action="false" :search-expanded="false" :search-active="false"
                :filter-expanded="false" :filter-active="false" filter-query=""
                :filter-state="secondaryRemoteRuleFilter" :filter-summary="secondaryRemoteFilterSummary"
                filter-preset-id="" :filter-preset-options="[]" :entries="filteredSecondaryRemoteEntries"
                :loading="secondaryRemoteLoading" loading-text="正在读取第二标签组目录..."
                :empty-text="secondaryRemoteSession ? '第二标签组目录为空。' : '请先把会话移到第二标签组。'" drop-hint=""
                :selected-paths="secondaryRemoteSelectedPaths" :selected-count="secondaryRemoteSelectedPaths.length"
                primary-action-label="切到主标签组" primary-action-variant="secondary"
                :primary-action-disabled="!secondaryRemoteSession" secondary-meta-label="权限" tertiary-meta-label="大小"
                :size-value="(entry) => (entry.isDir ? '--' : formatSize(entry.size))"
                :modified-value="(entry) => formatTime(entry.modifiedAt)"
                :permissions-value="(entry) => entry.permissions || '--'" :owner-value="(entry) => entry.owner || '--'"
                :secondary-meta-value="(entry) => entry.permissions || '--'"
                :tertiary-meta-value="(entry) => (entry.isDir ? '--' : formatSize(entry.size))"
                secondary-meta-class="ftp-entry__meta--mono"
                :thumbnail-url-for="(entry) => thumbnailUrlFor('secondaryRemote', entry)"
                :is-thumbnail-loading="(entry) => isThumbnailLoading('secondaryRemote', entry)"
                :highlight-entry-name="highlightEntryName" @update:pathInput="secondaryRemotePathInput = $event"
                @primary-action="focusSecondaryRemoteAsPrimary" @open-breadcrumb="openSecondaryRemoteBreadcrumb"
                @open-path="openSecondaryRemotePath" @go-parent="goSecondaryRemoteParent"
                @refresh="refreshSecondaryRemoteDirectory()" @set-view-mode="remotePanelViewMode = $event"
                @panel-activate="setActiveBrowserPanel('secondaryRemote')" @list-contextmenu="() => undefined"
                @select-all="selectAllSecondaryRemoteEntries" @marquee-select="handleSecondaryRemoteMarqueeSelect"
                @entry-click="handleSecondaryRemoteEntryClick($event.event, $event.entry, $event.index)"
                @entry-dblclick="openSecondaryRemoteEntry" @entry-dragstart="() => undefined"
                @entry-contextmenu="() => undefined" />

              <!-- 垂直分割条（双远程面板之间） -->
              <div class="ftp-panels__v-divider" @mousedown="startVDrag" />


              <!-- 双端模式堆叠容器（第二列）包含第二远程 + 主远程，形成上下排列 -->
              <!-- 非双端模式：主远程直接作为 section 子元素 -->
              <FtpBrowserPanel v-if="showRemotePanel && dualRemoteMode" kind="remote" title="远程目录" :badges="[
                { text: activeSession ? activeSession.protocol.toUpperCase() : 'SFTP', accent: true },
                { text: `${activeSession ? filteredRemoteEntries.length : 0} 项` },
              ]" :drop-active="remoteDropActive" :active="activeBrowserPanel === 'remote'"
                :breadcrumbs="remoteBreadcrumbs" :path-input="remotePathInput"
                :path-suggestions="remotePathSuggestions" path-placeholder="输入远程目录" :view-mode="remotePanelViewMode"
                :path-input-disabled="!activeSession" :open-path-disabled="!activeSession"
                :go-parent-disabled="!activeSession" :refresh-disabled="!activeSession"
                :search-expanded="remoteSearchExpanded" :search-active="remoteSearchExpanded || !!remoteFilterQuery"
                :filter-expanded="remoteRuleFilterExpanded"
                :filter-active="remoteRuleFilterExpanded || isRuleFilterActive(remoteRuleFilter)"
                :filter-query="remoteFilterQuery" :filter-state="remoteRuleFilter" :filter-summary="remoteFilterSummary"
                :filter-preset-id="remoteFilterPresetId" :filter-preset-options="filterPresetOptions"
                :entries="filteredRemoteEntries" :loading="Boolean(activeSession) && ftpStore.remoteLoading"
                loading-text="正在读取远程目录..." :empty-text="activeSession
                  ? (remoteFilterQuery || isRuleFilterActive(remoteRuleFilter) ? '没有匹配的远程文件。' : '远程目录为空。')
                  : '连接后显示远程目录。'" drop-hint="释放后上传到当前远程目录" :selected-paths="remoteSelectedPaths"
                :selected-count="remoteSelectedPaths.length" :primary-action-label="downloadActionLabel"
                :primary-action-disabled="!canDownload" :create-directory-disabled="!activeSession"
                secondary-meta-label="权限" tertiary-meta-label="大小"
                :size-value="(entry) => (entry.isDir ? '--' : formatSize(entry.size))"
                :modified-value="(entry) => formatTime(entry.modifiedAt)"
                :permissions-value="(entry) => entry.permissions || '--'" :owner-value="(entry) => entry.owner || '--'"
                :secondary-meta-value="(entry) => entry.permissions || '--'"
                :tertiary-meta-value="(entry) => (entry.isDir ? '--' : formatSize(entry.size))"
                secondary-meta-class="ftp-entry__meta--mono"
                :thumbnail-url-for="(entry) => thumbnailUrlFor('remote', entry)"
                :is-thumbnail-loading="(entry) => isThumbnailLoading('remote', entry)"
                :highlight-entry-name="highlightEntryName" :show-connecting-overlay="isConnecting || isDeletingRemote"
                :connecting-title="isDeletingRemote ? '正在删除远程条目' : '正在建立连接'"
                :connecting-message="busyMessage" @dragenter="handleRemoteDragEnter" @dragleave="handleRemoteDragLeave"
                @dragover="handleRemoteDragOver" @drop="handleRemoteDrop"
                @update:pathInput="remotePathInput = $event" @update:filterQuery="remoteFilterQuery = $event"
                @update:extensionQuery="remoteRuleFilter.extensionQuery = $event"
                @update:minSizeKb="remoteRuleFilter.minSizeKb = $event"
                @update:maxSizeKb="remoteRuleFilter.maxSizeKb = $event"
                @update:modifiedWithinDays="remoteRuleFilter.modifiedWithinDays = $event"
                @primary-action="downloadSelected" @create-directory="createRemoteDirectory"
                @open-breadcrumb="openRemoteBreadcrumb" @open-path="openRemotePath" @go-parent="goRemoteParent"
                @refresh="refreshPrimaryRemoteDirectory()" @toggle-search="toggleSearch('remote')"
                @toggle-filter="toggleRuleFilter('remote')" @set-view-mode="remotePanelViewMode = $event"
                @set-filter-mode="setRuleFilterMode('remote', $event)"
                @set-filter-operator="setRuleFilterOperator('remote', $event)"
                @toggle-hide-hidden="toggleHideHidden('remote')"
                @apply-filter-preset="applyFilterPreset('remote', $event)"
                @save-filter-preset="saveFilterPreset('remote')"
                @delete-filter-preset="deleteSelectedFilterPreset('remote')" @reset-filter="resetRuleFilter('remote')"
                @panel-activate="setActiveBrowserPanel('remote')"
                @select-all="selectAllRemoteEntries"
                @marquee-select="handleRemoteMarqueeSelect"
                @list-contextmenu="handlePanelListContextMenu($event, 'remote')"
                @entry-click="handleRemoteEntryClick($event.event, $event.entry, $event.index)"
                @entry-dblclick="openRemoteEntry" @entry-dragstart="handleRemoteDragStart($event.event, $event.entry)"
                @entry-dragend="handleEntryDragEnd"
                @entry-contextmenu="handleEntryContextMenu($event.event, 'remote', $event.entry, $event.index)" />

              <!-- 双端模式：关闭 ftp-panels__remote-stack 容器 -->
            </div>

            <!-- 非并联模式下本地与远程之间的水平分割条 -->
            <div v-if="showLocalPanel && showRemotePanel && !dualRemoteMode && panelLayoutMode === 'columns'"
              class="ftp-panels__h-divider" @mousedown="startHDrag" />

            <!-- 非双端模式：主远程面板直接作为 section 子元素（第二列）-->
            <FtpBrowserPanel v-if="showRemotePanel && !dualRemoteMode" kind="remote" title="远程目录" :badges="[
              { text: activeSession ? activeSession.protocol.toUpperCase() : 'SFTP', accent: true },
              { text: `${activeSession ? filteredRemoteEntries.length : 0} 项` },
            ]" :drop-active="remoteDropActive" :active="activeBrowserPanel === 'remote'"
              :breadcrumbs="remoteBreadcrumbs" :path-input="remotePathInput"
              :path-suggestions="remotePathSuggestions" path-placeholder="输入远程目录" :view-mode="remotePanelViewMode"
              :path-input-disabled="!activeSession" :open-path-disabled="!activeSession"
              :go-parent-disabled="!activeSession" :refresh-disabled="!activeSession"
              :search-expanded="remoteSearchExpanded" :search-active="remoteSearchExpanded || !!remoteFilterQuery"
              :filter-expanded="remoteRuleFilterExpanded"
              :filter-active="remoteRuleFilterExpanded || isRuleFilterActive(remoteRuleFilter)"
              :filter-query="remoteFilterQuery" :filter-state="remoteRuleFilter" :filter-summary="remoteFilterSummary"
              :filter-preset-id="remoteFilterPresetId" :filter-preset-options="filterPresetOptions"
              :entries="filteredRemoteEntries" :loading="ftpStore.remoteLoading" loading-text="正在读取远程目录..."
              :empty-text="remoteFilterQuery || isRuleFilterActive(remoteRuleFilter) ? '没有匹配的远程文件。' : (activeSession ? '远程目录为空。' : '连接后即可浏览远程目录。')"
              drop-hint="释放后上传到当前远程目录" :selected-paths="remoteSelectedPaths"
              :selected-count="remoteSelectedPaths.length" :primary-action-label="downloadActionLabel"
              primary-action-variant="secondary" :primary-action-disabled="!canDownload"
              :show-create-directory-action="true" :create-directory-disabled="!activeSession" secondary-meta-label="权限"
              tertiary-meta-label="大小" :size-value="(entry) => (entry.isDir ? '--' : formatSize(entry.size))"
              :modified-value="(entry) => formatTime(entry.modifiedAt)"
              :permissions-value="(entry) => entry.permissions || '--'" :owner-value="(entry) => entry.owner || '--'"
              :secondary-meta-value="(entry) => entry.permissions || '--'"
              :tertiary-meta-value="(entry) => (entry.isDir ? '--' : formatSize(entry.size))"
              secondary-meta-class="ftp-entry__meta--mono"
              :thumbnail-url-for="(entry) => thumbnailUrlFor('remote', entry)"
              :is-thumbnail-loading="(entry) => isThumbnailLoading('remote', entry)"
              :highlight-entry-name="highlightEntryName" :show-connecting-overlay="isConnecting || isDeletingRemote"
              :connecting-title="isDeletingRemote ? '正在删除远程条目' : '正在建立连接'"
              :connecting-message="busyMessage" @dragenter="handleRemoteDragEnter" @dragleave="handleRemoteDragLeave"
              @dragover="handleRemoteDragOver" @drop="handleRemoteDrop" @update:pathInput="remotePathInput = $event"
              @update:filterQuery="remoteFilterQuery = $event"
              @update:extensionQuery="remoteRuleFilter.extensionQuery = $event"
              @update:minSizeKb="remoteRuleFilter.minSizeKb = $event"
              @update:maxSizeKb="remoteRuleFilter.maxSizeKb = $event"
              @update:modifiedWithinDays="remoteRuleFilter.modifiedWithinDays = $event"
              @primary-action="downloadSelected" @create-directory="createRemoteDirectory"
              @open-breadcrumb="openRemoteBreadcrumb" @open-path="openRemotePath" @go-parent="goRemoteParent"
              @refresh="refreshPrimaryRemoteDirectory()" @set-view-mode="remotePanelViewMode = $event"
              @toggle-search="toggleSearch('remote')" @toggle-filter="toggleRuleFilter('remote')"
              @set-filter-mode="setRuleFilterMode('remote', $event)" @toggle-hide-hidden="toggleHideHidden('remote')"
              @apply-filter-preset="applyFilterPreset('remote', $event)"
              @save-filter-preset="saveFilterPreset('remote')"
              @delete-filter-preset="deleteSelectedFilterPreset('remote')" @reset-filter="resetRuleFilter('remote')"
              @set-filter-operator="setRuleFilterOperator('remote', $event)"
              @panel-activate="setActiveBrowserPanel('remote')"
              @select-all="selectAllRemoteEntries"
              @marquee-select="handleRemoteMarqueeSelect"
              @list-contextmenu="handlePanelListContextMenu($event, 'remote')"
              @entry-click="handleRemoteEntryClick($event.event, $event.entry, $event.index)"
              @entry-dblclick="openRemoteEntry" @entry-dragstart="handleRemoteDragStart($event.event, $event.entry)"
              @entry-dragend="handleEntryDragEnd"
              @entry-contextmenu="handleEntryContextMenu($event.event, 'remote', $event.entry, $event.index)" />

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
      </div>

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

    </main>

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

    <UiDialog v-model="disconnectedSessionDialogVisible" width="520" max-width="92vw">
      <template #header>
        <div class="ftp-dialog__header">FTP 连接已断开</div>
      </template>
      <div class="ftp-dialog__body">
        <div class="ftp-disconnect-dialog">
          <p>
            {{ disconnectedSessionNotice?.label || '当前 FTP 连接' }} 长时间不活动后已断开，远程目录操作无法继续。
          </p>
          <div class="ftp-disconnect-dialog__meta">
            <span>目录：{{ disconnectedSessionNotice?.remotePath || '/' }}</span>
            <span>错误：{{ disconnectedSessionNotice?.message || 'session closed' }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="ftp-dialog__footer">
          <UiButton variant="ghost" @click="disconnectedSessionDialogVisible = false">稍后处理</UiButton>
          <UiButton
            variant="primary"
            :disabled="reconnectingDisconnectedSession || !disconnectedSessionProfile"
            @click="reconnectDisconnectedSession"
          >
            {{ reconnectingDisconnectedSession ? '重连中...' : '立即重连' }}
          </UiButton>
        </div>
      </template>
    </UiDialog>

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
  </div>
</template>
<style src="./FtpPage.scss" lang="scss"></style>
