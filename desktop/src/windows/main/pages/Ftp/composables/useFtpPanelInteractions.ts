import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import AddIcon from '@/windows/main/components/svgs/icons/AddIcon.vue';
import CategoryMediaIcon from '@/windows/main/components/svgs/icons/CategoryMediaIcon.vue';
import CategoryTextIcon from '@/windows/main/components/svgs/icons/CategoryTextIcon.vue';
import DeleteIcon from '@/windows/main/components/svgs/icons/DeleteIcon.vue';
import EditIcon from '@/windows/main/components/svgs/icons/EditIcon.vue';
import OpenIcon from '@/windows/main/components/svgs/icons/OpenIcon.vue';
import SettingsIcon from '@/windows/main/components/svgs/icons/SettingsIcon.vue';
import ToolIcon from '@/windows/main/components/svgs/icons/ToolIcon.vue';
import { joinLocalPath, joinRemotePath, parentLocalPath, parentRemotePath } from '../utils/ftpPaths';
import type { FileTransferEntry, FtpConnectionDescriptor } from '@/contracts/ftp';
import type { useFtpStore } from '@/windows/main/stores/ftp_store';
import type { ContextMenuItem } from '@/windows/main/composables/useContextMenu';
import type { EntrySortKey, PanelKind } from '../types';

type UseFtpPanelInteractionsOptions = {
  ftpStore: ReturnType<typeof useFtpStore>;
  activeSession: ComputedRef<FtpConnectionDescriptor | null>;
  linkNavigationEnabled: Ref<boolean>;
  filteredLocalEntries: ComputedRef<FileTransferEntry[]>;
  filteredRemoteEntries: ComputedRef<FileTransferEntry[]>;
  localSortKey: Ref<EntrySortKey>;
  remoteSortKey: Ref<EntrySortKey>;
  localSortDirection: Ref<'asc' | 'desc'>;
  remoteSortDirection: Ref<'asc' | 'desc'>;
  setPanelSortKey: (kind: 'local' | 'remote', sortKey: EntrySortKey) => void;
  togglePanelSortDirection: (kind: 'local' | 'remote') => void;
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  requestEntryName: (options: {
    title: string;
    label: string;
    confirmText?: string;
    initialValue?: string;
    placeholder?: string;
  }) => Promise<string | null>;
  showConfirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    danger?: boolean;
  }) => Promise<boolean>;
  changeRemotePermissions?: (entry: FileTransferEntry) => void | Promise<void>;
  pasteClipboardToRemote?: () => void | Promise<void>;
  copySelectionInfo?: (kind: PanelKind) => void | Promise<void>;
  canOpenTerminalForPanel?: (kind: PanelKind) => boolean;
  openTerminalForPanel?: (kind: PanelKind) => void | Promise<void>;
  canPreviewLocalImage?: (entry: FileTransferEntry | null) => boolean;
  previewLocalImage?: (entry: FileTransferEntry) => void | Promise<void>;
  canPreviewRemoteImage?: (entry: FileTransferEntry | null) => boolean;
  previewRemoteImage?: (entry: FileTransferEntry) => void | Promise<void>;
  canPreviewRemoteText?: (entry: FileTransferEntry | null) => boolean;
  previewRemoteText?: (entry: FileTransferEntry) => void | Promise<void>;
  canOpenInternalEditor?: (kind: PanelKind, entry: FileTransferEntry | null) => boolean;
  openInternalEditor?: (kind: PanelKind, entry: FileTransferEntry) => void | Promise<void>;
  canOpenExternalEditor?: (kind: PanelKind, entry: FileTransferEntry | null) => boolean;
  openExternalEditor?: (kind: PanelKind, entry: FileTransferEntry) => void | Promise<void>;
  prepareRemoteDragExport?: (sessionId: string, remotePaths: string[]) => Promise<string[]>;
  startPreparedDrag?: (localPaths: string[]) => void;
  copyLocalPathsToCurrentLocal?: (paths: string[]) => Promise<void>;
};

export function useFtpPanelInteractions(options: UseFtpPanelInteractionsOptions) {
  const localDropActive = ref(false);
  const remoteDropActive = ref(false);
  const localSelectedPaths = ref<string[]>([]);
  const remoteSelectedPaths = ref<string[]>([]);
  const lastLocalSelectedIndex = ref(-1);
  const lastRemoteSelectedIndex = ref(-1);

  const selectedLocalEntries = computed(() =>
    options.filteredLocalEntries.value.filter((entry) => localSelectedPaths.value.includes(entry.path)),
  );
  const selectedRemoteEntries = computed(() =>
    options.filteredRemoteEntries.value.filter((entry) => remoteSelectedPaths.value.includes(entry.path)),
  );
  const selectedLocalEntry = computed(() => (selectedLocalEntries.value.length === 1 ? selectedLocalEntries.value[0] : null));
  const selectedRemoteEntry = computed(() => (selectedRemoteEntries.value.length === 1 ? selectedRemoteEntries.value[0] : null));
  const preparedRemoteDragKey = ref('');
  const preparedRemoteDragPaths = ref<string[]>([]);
  const preparingRemoteDragKey = ref('');
  const canUpload = computed(() => Boolean(options.activeSession.value && selectedLocalEntries.value.length));
  const canDownload = computed(() => Boolean(options.activeSession.value && selectedRemoteEntries.value.length));
  const uploadActionLabel = computed(() => {
    if (selectedLocalEntries.value.length > 1) return `批量上传 (${selectedLocalEntries.value.length})`;
    return selectedLocalEntry.value?.isDir ? '上传目录' : '上传';
  });
  const downloadActionLabel = computed(() => {
    if (selectedRemoteEntries.value.length > 1) return `批量下载 (${selectedRemoteEntries.value.length})`;
    return selectedRemoteEntry.value?.isDir ? '下载目录' : '下载';
  });

  function clearLocalSelection() {
    localSelectedPaths.value = [];
    lastLocalSelectedIndex.value = -1;
    options.ftpStore.selectLocal('');
  }

  function clearRemoteSelection() {
    remoteSelectedPaths.value = [];
    lastRemoteSelectedIndex.value = -1;
    options.ftpStore.selectRemote('');
  }

  function updateLocalSelection(paths: string[], primaryPath: string, index: number) {
    localSelectedPaths.value = paths;
    lastLocalSelectedIndex.value = index;
    options.ftpStore.selectLocal(primaryPath);
  }

  function updateRemoteSelection(paths: string[], primaryPath: string, index: number) {
    remoteSelectedPaths.value = paths;
    lastRemoteSelectedIndex.value = index;
    options.ftpStore.selectRemote(primaryPath);
  }

  function mergeSelectedPaths(currentPaths: string[], incomingPaths: string[]) {
    return [...new Set([...currentPaths, ...incomingPaths])];
  }

  function updateLocalPathsSelection(paths: string[], additive = false) {
    const nextPaths = additive ? mergeSelectedPaths(localSelectedPaths.value, paths) : paths;
    const primaryPath = nextPaths[nextPaths.length - 1] ?? '';
    const primaryIndex = primaryPath
      ? options.filteredLocalEntries.value.findIndex((entry) => entry.path === primaryPath)
      : -1;
    updateLocalSelection(nextPaths, primaryPath, primaryIndex);
  }

  function updateRemotePathsSelection(paths: string[], additive = false) {
    const nextPaths = additive ? mergeSelectedPaths(remoteSelectedPaths.value, paths) : paths;
    const primaryPath = nextPaths[nextPaths.length - 1] ?? '';
    const primaryIndex = primaryPath
      ? options.filteredRemoteEntries.value.findIndex((entry) => entry.path === primaryPath)
      : -1;
    updateRemoteSelection(nextPaths, primaryPath, primaryIndex);
  }

  function selectAllLocalEntries() {
    updateLocalPathsSelection(options.filteredLocalEntries.value.map((entry) => entry.path));
  }

  function selectAllRemoteEntries() {
    updateRemotePathsSelection(options.filteredRemoteEntries.value.map((entry) => entry.path));
  }

  function handleLocalMarqueeSelect(payload: { paths: string[]; additive: boolean }) {
    updateLocalPathsSelection(payload.paths, payload.additive);
  }

  function handleRemoteMarqueeSelect(payload: { paths: string[]; additive: boolean }) {
    updateRemotePathsSelection(payload.paths, payload.additive);
  }

  function buildRemoteDragKey(entries: FileTransferEntry[]) {
    const sessionId = options.activeSession.value?.sessionId ?? '';
    return `${sessionId}:${entries.map((entry) => entry.path).sort().join('|')}`;
  }

  async function primeRemoteDragExport(entries: FileTransferEntry[]) {
    if (!entries.length || !options.activeSession.value || !options.prepareRemoteDragExport) {
      preparedRemoteDragKey.value = '';
      preparedRemoteDragPaths.value = [];
      preparingRemoteDragKey.value = '';
      return [];
    }
    const key = buildRemoteDragKey(entries);
    if (preparedRemoteDragKey.value === key && preparedRemoteDragPaths.value.length) {
      return preparedRemoteDragPaths.value;
    }
    if (preparingRemoteDragKey.value === key) {
      return [];
    }
    preparingRemoteDragKey.value = key;
    try {
      const localPaths = await options.prepareRemoteDragExport(
        options.activeSession.value.sessionId,
        entries.map((entry) => entry.path),
      );
      if (preparingRemoteDragKey.value === key) {
        preparedRemoteDragKey.value = key;
        preparedRemoteDragPaths.value = localPaths;
      }
      return localPaths;
    } finally {
      if (preparingRemoteDragKey.value === key) {
        preparingRemoteDragKey.value = '';
      }
    }
  }

  function handleLocalEntryClick(event: MouseEvent, entry: FileTransferEntry, index: number) {
    if (event.shiftKey && lastLocalSelectedIndex.value >= 0) {
      const [start, end] = [lastLocalSelectedIndex.value, index].sort((left, right) => left - right);
      updateLocalSelection(
        options.filteredLocalEntries.value.slice(start, end + 1).map((item) => item.path),
        entry.path,
        index,
      );
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const next = localSelectedPaths.value.includes(entry.path)
        ? localSelectedPaths.value.filter((path) => path !== entry.path)
        : [...localSelectedPaths.value, entry.path];
      updateLocalSelection(next, next[next.length - 1] ?? '', index);
      return;
    }

    updateLocalSelection([entry.path], entry.path, index);
  }

  function handleRemoteEntryClick(event: MouseEvent, entry: FileTransferEntry, index: number) {
    if (event.shiftKey && lastRemoteSelectedIndex.value >= 0) {
      const [start, end] = [lastRemoteSelectedIndex.value, index].sort((left, right) => left - right);
      updateRemoteSelection(
        options.filteredRemoteEntries.value.slice(start, end + 1).map((item) => item.path),
        entry.path,
        index,
      );
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const next = remoteSelectedPaths.value.includes(entry.path)
        ? remoteSelectedPaths.value.filter((path) => path !== entry.path)
        : [...remoteSelectedPaths.value, entry.path];
      updateRemoteSelection(next, next[next.length - 1] ?? '', index);
      return;
    }

    updateRemoteSelection([entry.path], entry.path, index);
  }

  function clearPanelSelection(kind: PanelKind) {
    if (kind === 'local') {
      clearLocalSelection();
      return;
    }
    clearRemoteSelection();
  }

  function ensureEntryContextSelection(kind: PanelKind, entry: FileTransferEntry, index: number) {
    if (kind === 'local') {
      if (!localSelectedPaths.value.includes(entry.path)) {
        updateLocalSelection([entry.path], entry.path, index);
      }
      return;
    }

    if (!remoteSelectedPaths.value.includes(entry.path)) {
      updateRemoteSelection([entry.path], entry.path, index);
    }
  }

  async function syncRemotePanelToChild(entryName: string) {
    if (!options.linkNavigationEnabled.value || !options.activeSession.value) return;
    const matchedEntry = options.ftpStore.remoteEntries.find((entry) => entry.isDir && entry.name === entryName);
    if (!matchedEntry) return;
    await options.ftpStore.refreshRemoteDirectory(matchedEntry.path);
  }

  async function syncLocalPanelToChild(entryName: string) {
    if (!options.linkNavigationEnabled.value) return;
    const matchedEntry = options.ftpStore.localEntries.find((entry) => entry.isDir && entry.name === entryName);
    if (!matchedEntry) return;
    await options.ftpStore.refreshLocalDirectory(matchedEntry.path);
  }

  async function syncRemotePanelToParent() {
    if (!options.linkNavigationEnabled.value || !options.activeSession.value) return;
    await options.ftpStore.refreshRemoteDirectory(parentRemotePath(options.ftpStore.remotePath || options.activeSession.value.remoteRoot));
  }

  async function syncLocalPanelToParent() {
    if (!options.linkNavigationEnabled.value) return;
    await options.ftpStore.refreshLocalDirectory(parentLocalPath(options.ftpStore.localPath));
  }

  async function openLocalEntry(entry: FileTransferEntry) {
    updateLocalSelection([entry.path], entry.path, options.filteredLocalEntries.value.findIndex((item) => item.path === entry.path));
    if (!entry.isDir) return;
    await options.ftpStore.refreshLocalDirectory(entry.path);
    await syncRemotePanelToChild(entry.name);
  }

  async function openRemoteEntry(entry: FileTransferEntry) {
    updateRemoteSelection([entry.path], entry.path, options.filteredRemoteEntries.value.findIndex((item) => item.path === entry.path));
    if (!entry.isDir) return;
    await options.ftpStore.refreshRemoteDirectory(entry.path);
    await syncLocalPanelToChild(entry.name);
  }

  async function goLocalParent() {
    await options.ftpStore.refreshLocalDirectory(parentLocalPath(options.ftpStore.localPath));
    await syncRemotePanelToParent();
  }

  async function goRemoteParent() {
    await options.ftpStore.refreshRemoteDirectory(parentRemotePath(options.ftpStore.remotePath));
    await syncLocalPanelToParent();
  }

  async function createLocalDirectory() {
    const name = await options.requestEntryName({
      title: '新建本地目录',
      label: '目录名称',
      confirmText: '创建',
      initialValue: 'new-folder',
      placeholder: '请输入目录名称',
    });
    if (!name) return;
    await options.ftpStore.createLocalDir(joinLocalPath(options.ftpStore.localPath, name));
  }

  async function createRemoteDirectory() {
    if (!options.activeSession.value) return;
    const name = await options.requestEntryName({
      title: '新建远程目录',
      label: '目录名称',
      confirmText: '创建',
      initialValue: 'new-folder',
      placeholder: '请输入目录名称',
    });
    if (!name) return;
    await options.ftpStore.createRemoteDir(joinRemotePath(options.ftpStore.remotePath || options.activeSession.value.remoteRoot, name));
  }

  async function renameLocalSelected() {
    const entry = selectedLocalEntry.value;
    if (!entry) return;
    const nextName = await options.requestEntryName({
      title: '重命名本地条目',
      label: '新名称',
      confirmText: '保存',
      initialValue: entry.name,
      placeholder: '请输入新名称',
    });
    if (!nextName || nextName === entry.name) return;
    await options.ftpStore.renameLocalPath(entry.path, joinLocalPath(parentLocalPath(entry.path), nextName));
  }

  async function renameRemoteSelected() {
    const entry = selectedRemoteEntry.value;
    if (!entry) return;
    const nextName = await options.requestEntryName({
      title: '重命名远程条目',
      label: '新名称',
      confirmText: '保存',
      initialValue: entry.name,
      placeholder: '请输入新名称',
    });
    if (!nextName || nextName === entry.name) return;
    await options.ftpStore.renameRemotePath(entry.path, joinRemotePath(parentRemotePath(entry.path), nextName));
  }

  async function deleteLocalSelected() {
    if (!selectedLocalEntries.value.length) return;
    const message = selectedLocalEntries.value.length === 1
      ? `确认删除本地条目“${selectedLocalEntries.value[0].name}”吗？`
      : `确认删除选中的 ${selectedLocalEntries.value.length} 个本地条目吗？`;
    const confirmed = await options.showConfirm({
      title: '删除本地条目',
      message,
      confirmText: '删除',
      danger: true,
    });
    if (!confirmed) return;
    for (const entry of selectedLocalEntries.value) {
      await options.ftpStore.deleteLocalPath(entry.path);
    }
  }

  async function deleteRemoteSelected() {
    if (!selectedRemoteEntries.value.length) return;
    const message = selectedRemoteEntries.value.length === 1
      ? `确认删除远程条目“${selectedRemoteEntries.value[0].name}”吗？`
      : `确认删除选中的 ${selectedRemoteEntries.value.length} 个远程条目吗？`;
    const confirmed = await options.showConfirm({
      title: '删除远程条目',
      message,
      confirmText: '删除',
      danger: true,
    });
    if (!confirmed) return;
    for (const entry of selectedRemoteEntries.value) {
      await options.ftpStore.deleteRemotePath(entry.path);
    }
  }

  async function uploadSelected() {
    if (!options.activeSession.value || !selectedLocalEntries.value.length) return;
    for (const entry of selectedLocalEntries.value) {
      await options.ftpStore.uploadFile(
        entry.path,
        joinRemotePath(options.ftpStore.remotePath || options.activeSession.value.remoteRoot, entry.name),
      );
    }
  }

  async function downloadSelected() {
    if (!selectedRemoteEntries.value.length) return;
    for (const entry of selectedRemoteEntries.value) {
      await options.ftpStore.downloadFile(entry.path, joinLocalPath(options.ftpStore.localPath, entry.name));
    }
  }

  function buildPanelContextMenuItems(kind: PanelKind) {
    const isLocal = kind === 'local';
    const selectedEntries = isLocal ? selectedLocalEntries.value : selectedRemoteEntries.value;
    const selectedEntry = isLocal ? selectedLocalEntry.value : selectedRemoteEntry.value;
    const disabledRemoteAction = !isLocal && !options.activeSession.value;
    const currentSortKey = isLocal ? options.localSortKey.value : options.remoteSortKey.value;
    const currentSortDirection = isLocal ? options.localSortDirection.value : options.remoteSortDirection.value;
    const canOpenTerminal = options.canOpenTerminalForPanel?.(kind) ?? false;
    const canPreviewImage = Boolean(
      selectedEntry && (isLocal ? options.canPreviewLocalImage?.(selectedEntry) : options.canPreviewRemoteImage?.(selectedEntry)),
    );
    const canPreviewText = Boolean(selectedEntry && !isLocal && options.canPreviewRemoteText?.(selectedEntry));
    const canInternalEdit = Boolean(selectedEntry && options.canOpenInternalEditor?.(kind, selectedEntry));
    const canExternalEdit = Boolean(selectedEntry && options.canOpenExternalEditor?.(kind, selectedEntry));

    return [
      {
        id: `${kind}-new-directory`,
        label: '新建目录',
        icon: AddIcon,
        action: () => {
          if (isLocal) {
            void createLocalDirectory();
          } else {
            void createRemoteDirectory();
          }
        },
        disabled: disabledRemoteAction,
      },
      ...(isLocal ? [{
        id: `${kind}-upload-selected`,
        label: selectedEntries.length > 1 ? `上传所选 ${selectedEntries.length} 项` : '上传所选文件',
        icon: AddIcon,
        disabled: !selectedEntries.length || !options.activeSession.value,
        action: () => {
          void uploadSelected();
        },
      }] : []),
      {
        id: `${kind}-open-terminal`,
        label: isLocal ? '在本地终端打开' : '在 SSH 终端打开',
        icon: OpenIcon,
        divided: true,
        disabled: !canOpenTerminal || !options.openTerminalForPanel,
        action: () => {
          if (options.openTerminalForPanel) {
            void options.openTerminalForPanel(kind);
          }
        },
      },
      {
        id: `${kind}-sort`,
        label: '排序方式',
        icon: SettingsIcon,
        divided: true,
        children: [
          {
            id: `${kind}-sort-name`,
            label: `${currentSortKey === 'name' ? '✓ ' : ''}按名称排序`,
            icon: CategoryTextIcon,
            action: () => options.setPanelSortKey(kind, 'name'),
          },
          {
            id: `${kind}-sort-size`,
            label: `${currentSortKey === 'size' ? '✓ ' : ''}按大小排序`,
            icon: ToolIcon,
            action: () => options.setPanelSortKey(kind, 'size'),
          },
          {
            id: `${kind}-sort-modified`,
            label: `${currentSortKey === 'modifiedAt' ? '✓ ' : ''}按修改时间排序`,
            icon: SettingsIcon,
            action: () => options.setPanelSortKey(kind, 'modifiedAt'),
          },
          {
            id: `${kind}-sort-type`,
            label: `${currentSortKey === 'type' ? '✓ ' : ''}按类型排序`,
            icon: OpenIcon,
            action: () => options.setPanelSortKey(kind, 'type'),
          },
          {
            id: `${kind}-sort-direction`,
            label: currentSortDirection === 'asc' ? '切换为降序' : '切换为升序',
            icon: ToolIcon,
            divided: true,
            action: () => options.togglePanelSortDirection(kind),
          },
        ],
      },
      {
        id: `${kind}-copy-info`,
        label: selectedEntries.length > 1 ? `复制 ${selectedEntries.length} 项信息` : '复制文件信息',
        icon: CategoryTextIcon,
        divided: true,
        disabled: !selectedEntries.length || !options.copySelectionInfo,
        action: () => {
          if (options.copySelectionInfo) {
            void options.copySelectionInfo(kind);
          }
        },
      },
      ...(!isLocal ? [{
        id: `${kind}-paste-upload`,
        label: '粘贴上传',
        icon: AddIcon,
        disabled: disabledRemoteAction || !options.pasteClipboardToRemote,
        action: () => {
          if (options.pasteClipboardToRemote) {
            void options.pasteClipboardToRemote();
          }
        },
      }] : []),
      {
        id: `${kind}-preview-image`,
        label: '预览图片',
        icon: CategoryMediaIcon,
        divided: true,
        disabled: disabledRemoteAction || !canPreviewImage || !selectedEntry
          || (isLocal ? !options.previewLocalImage : !options.previewRemoteImage),
        action: () => {
          if (!selectedEntry) return;
          if (isLocal && options.previewLocalImage) {
            void options.previewLocalImage(selectedEntry);
            return;
          }
          if (!isLocal && options.previewRemoteImage) {
            void options.previewRemoteImage(selectedEntry);
          }
        },
      },
      ...(!isLocal ? [
        {
          id: `${kind}-preview-text`,
          label: '预览文本',
          icon: CategoryTextIcon,
          disabled: disabledRemoteAction || !canPreviewText || !selectedEntry || !options.previewRemoteText,
          action: () => {
            if (selectedEntry && options.previewRemoteText) {
              void options.previewRemoteText(selectedEntry);
            }
          },
        },
      ] : []),
      {
        id: `${kind}-internal-edit`,
        label: '内部编辑',
        icon: EditIcon,
        divided: isLocal,
        disabled: !canInternalEdit || !selectedEntry || !options.openInternalEditor,
        action: () => {
          if (selectedEntry && options.openInternalEditor) {
            void options.openInternalEditor(kind, selectedEntry);
          }
        },
      },
      {
        id: `${kind}-external-edit`,
        label: '外部编辑',
        icon: EditIcon,
        disabled: !canExternalEdit || !selectedEntry || !options.openExternalEditor,
        action: () => {
          if (selectedEntry && options.openExternalEditor) {
            void options.openExternalEditor(kind, selectedEntry);
          }
        },
      },
      {
        id: `${kind}-rename`,
        label: '重命名',
        icon: EditIcon,
        disabled: !selectedEntry || disabledRemoteAction,
        action: () => {
          if (isLocal) {
            void renameLocalSelected();
          } else {
            void renameRemoteSelected();
          }
        },
      },
      ...(!isLocal ? [{
        id: `${kind}-chmod`,
        label: '修改权限',
        icon: EditIcon,
        disabled: !selectedEntry || disabledRemoteAction || !options.changeRemotePermissions,
        action: () => {
          if (selectedEntry && options.changeRemotePermissions) {
            void options.changeRemotePermissions(selectedEntry);
          }
        },
      }] : []),
      {
        id: `${kind}-delete`,
        label: selectedEntries.length > 1 ? `删除所选 ${selectedEntries.length} 项` : '删除',
        icon: DeleteIcon,
        danger: true,
        disabled: !selectedEntries.length || disabledRemoteAction,
        action: () => {
          if (isLocal) {
            void deleteLocalSelected();
          } else {
            void deleteRemoteSelected();
          }
        },
      },
    ] satisfies ContextMenuItem[];
  }

  function openPanelContextMenu(event: MouseEvent, kind: PanelKind) {
    options.openContextMenu(event.clientX, event.clientY, buildPanelContextMenuItems(kind));
  }

  function handlePanelListContextMenu(event: MouseEvent, kind: PanelKind) {
    event.preventDefault();
    clearPanelSelection(kind);
    openPanelContextMenu(event, kind);
  }

  function handleEntryContextMenu(event: MouseEvent, kind: PanelKind, entry: FileTransferEntry, index: number) {
    event.preventDefault();
    event.stopPropagation();
    ensureEntryContextSelection(kind, entry, index);
    openPanelContextMenu(event, kind);
  }

  function handleLocalDragStart(event: DragEvent, entry: FileTransferEntry) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    const entries = localSelectedPaths.value.includes(entry.path) ? selectedLocalEntries.value : [entry];
    event.dataTransfer.setData('application/x-guyantools-local-entries', JSON.stringify(entries));
  }

  function handleRemoteDragStart(event: DragEvent, entry: FileTransferEntry) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    const entries = remoteSelectedPaths.value.includes(entry.path) ? selectedRemoteEntries.value : [entry];
    event.dataTransfer.setData('application/x-guyantools-remote-entries', JSON.stringify(entries));
    const dragKey = buildRemoteDragKey(entries);
    if (preparedRemoteDragKey.value === dragKey && preparedRemoteDragPaths.value.length && options.startPreparedDrag) {
      options.startPreparedDrag(preparedRemoteDragPaths.value);
      return;
    }
    void primeRemoteDragExport(entries);
  }

  function dragTypes(event: DragEvent) {
    return Array.from(event.dataTransfer?.types ?? []);
  }

  function hasDragType(event: DragEvent, type: string) {
    return dragTypes(event).includes(type);
  }

  function hasLocalDragPayload(event: DragEvent) {
    return hasDragType(event, 'application/x-guyantools-local-entries')
      || hasDragType(event, 'application/x-guyantools-local-entry');
  }

  function hasRemoteDragPayload(event: DragEvent) {
    return hasDragType(event, 'application/x-guyantools-remote-entries')
      || hasDragType(event, 'application/x-guyantools-remote-entry');
  }

  function hasExternalFilePayload(event: DragEvent) {
    return hasDragType(event, 'Files') || Boolean(event.dataTransfer?.files?.length);
  }

  function canDropOnRemote(event: DragEvent) {
    if (!options.activeSession.value || !event.dataTransfer || hasRemoteDragPayload(event)) {
      return false;
    }
    return hasLocalDragPayload(event) || hasExternalFilePayload(event);
  }

  function canDropOnLocal(event: DragEvent) {
    if (!event.dataTransfer || hasLocalDragPayload(event)) {
      return false;
    }
    return hasRemoteDragPayload(event) || hasExternalFilePayload(event);
  }

  function updateDropEffect(event: DragEvent, allowed: boolean) {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = allowed ? 'copy' : 'none';
    }
  }

  function clearDropState() {
    localDropActive.value = false;
    remoteDropActive.value = false;
  }

  function didLeaveDropRoot(event: DragEvent) {
    const currentTarget = event.currentTarget as Node | null;
    const relatedTarget = event.relatedTarget as Node | null;
    return Boolean(currentTarget && (!relatedTarget || !currentTarget.contains(relatedTarget)));
  }

  function handleRemoteDragEnter(event: DragEvent) {
    const allowed = canDropOnRemote(event);
    remoteDropActive.value = allowed;
    updateDropEffect(event, allowed);
  }

  function handleRemoteDragOver(event: DragEvent) {
    const allowed = canDropOnRemote(event);
    remoteDropActive.value = allowed;
    updateDropEffect(event, allowed);
  }

  function handleRemoteDragLeave(event: DragEvent) {
    if (didLeaveDropRoot(event)) {
      remoteDropActive.value = false;
    }
  }

  async function handleRemoteDrop(event: DragEvent) {
    event.preventDefault();
    const acceptsDrop = canDropOnRemote(event);
    remoteDropActive.value = false;
    if (!acceptsDrop || !options.activeSession.value || !event.dataTransfer) return;

    const localPayload = event.dataTransfer.getData('application/x-guyantools-local-entries')
      || event.dataTransfer.getData('application/x-guyantools-local-entry');
    if (localPayload) {
      const entries = JSON.parse(localPayload) as FileTransferEntry[] | FileTransferEntry;
      const items = Array.isArray(entries) ? entries : [entries];
      for (const entry of items) {
        await options.ftpStore.uploadFile(
          entry.path,
          joinRemotePath(options.ftpStore.remotePath || options.activeSession.value.remoteRoot, entry.name),
        );
      }
      return;
    }

    const files = Array.from(event.dataTransfer.files ?? []);
    for (const file of files) {
      const externalPath = (file as File & { path?: string }).path;
      if (!externalPath) continue;
      await options.ftpStore.uploadFile(externalPath, joinRemotePath(options.ftpStore.remotePath || options.activeSession.value.remoteRoot, file.name));
    }
  }

  function handleLocalDragEnter(event: DragEvent) {
    const allowed = canDropOnLocal(event);
    localDropActive.value = allowed;
    updateDropEffect(event, allowed);
  }

  function handleLocalDragOver(event: DragEvent) {
    const allowed = canDropOnLocal(event);
    localDropActive.value = allowed;
    updateDropEffect(event, allowed);
  }

  function handleLocalDragLeave(event: DragEvent) {
    if (didLeaveDropRoot(event)) {
      localDropActive.value = false;
    }
  }

  async function handleLocalDrop(event: DragEvent) {
    event.preventDefault();
    const acceptsDrop = canDropOnLocal(event);
    localDropActive.value = false;
    if (!acceptsDrop || !event.dataTransfer) return;
    const remotePayload = event.dataTransfer.getData('application/x-guyantools-remote-entries')
      || event.dataTransfer.getData('application/x-guyantools-remote-entry');
    if (remotePayload) {
      const entries = JSON.parse(remotePayload) as FileTransferEntry[] | FileTransferEntry;
      const items = Array.isArray(entries) ? entries : [entries];
      for (const entry of items) {
        await options.ftpStore.downloadFile(entry.path, joinLocalPath(options.ftpStore.localPath, entry.name));
      }
      return;
    }

    const files = Array.from(event.dataTransfer.files ?? []);
    const localPaths = files
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    if (localPaths.length && options.copyLocalPathsToCurrentLocal) {
      await options.copyLocalPathsToCurrentLocal(localPaths);
    }
  }

  function handleEntryDragEnd() {
    clearDropState();
  }

  onMounted(() => {
    window.addEventListener('dragend', clearDropState);
    window.addEventListener('drop', clearDropState);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('dragend', clearDropState);
    window.removeEventListener('drop', clearDropState);
  });

  watch(
    () => `${options.activeSession.value?.sessionId ?? ''}:${selectedRemoteEntries.value.map((entry) => entry.path).sort().join('|')}`,
    () => {
      if (!selectedRemoteEntries.value.length) {
        preparedRemoteDragKey.value = '';
        preparedRemoteDragPaths.value = [];
        preparingRemoteDragKey.value = '';
        return;
      }
      void primeRemoteDragExport(selectedRemoteEntries.value);
    },
  );

  return {
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
  };
}
