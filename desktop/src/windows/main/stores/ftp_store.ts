import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  ConnectFtpInput,
  CreateFtpSessionFolderInput,
  CreateFtpProfileInput,
  FileTransferEntry,
  FtpConnectionDescriptor,
  FtpEventEnvelope,
  FtpProfile,
  FtpRestoreState,
  FtpSessionFolder,
  TransferTask,
  UpsertFtpRestoreStateInput,
  UpdateFtpProfileInput,
  UpdateFtpSessionFolderInput,
} from '@/contracts/ftp';

const LOCAL_WORKSPACE_STORAGE_KEY = 'guyantools.ftp.local-workspaces';
const MAX_FTP_LOGS = 200;

type FtpLogEntry = {
  id: string;
  timestamp: number;
  tone: 'info' | 'success' | 'danger';
  message: string;
};

export const useFtpStore = defineStore('ftp', () => {
  const profiles = ref<FtpProfile[]>([]);
  const folders = ref<FtpSessionFolder[]>([]);
  const sessions = ref<FtpConnectionDescriptor[]>([]);
  const transferTasks = ref<TransferTask[]>([]);
  const restoreStates = ref<FtpRestoreState[]>([]);
  const restoreFailures = ref<Array<{ profileId: string; errorMessage: string }>>([]);
  const logs = ref<FtpLogEntry[]>([]);
  const activeSessionId = ref('');

  const localPath = ref('');
  const remotePath = ref('');
  const localEntries = ref<FileTransferEntry[]>([]);
  const remoteEntries = ref<FileTransferEntry[]>([]);
  const selectedLocalPath = ref('');
  const selectedRemotePath = ref('');
  const localWorkspaces = ref<string[]>([]);

  const localLoading = ref(false);
  const remoteLoading = ref(false);
  const initialized = ref(false);
  const sessionLocalPaths = ref<Record<string, string>>({});
  const sessionRemotePaths = ref<Record<string, string>>({});

  let removeListener: (() => void) | null = null;

  const activeSession = computed(
    () => sessions.value.find((session) => session.sessionId === activeSessionId.value) ?? null,
  );

  async function initialize() {
    if (initialized.value) return;
    loadLocalWorkspaces();
    ensureEventSubscription();
    profiles.value = await window.ftpApi.listProfiles();
    folders.value = await window.ftpApi.listFolders();
    restoreStates.value = await window.ftpApi.listRestoreStates();
    sessions.value = await window.ftpApi.listSessions();
    transferTasks.value = await window.ftpApi.listTransferTasks();
    localPath.value = await window.ftpApi.getDefaultLocalPath();
    await restorePreviousSessions();
    if (!sessions.value.length) {
      await refreshLocalDirectory(localPath.value);
    }
    initialized.value = true;
  }

  function ensureEventSubscription() {
    if (removeListener) return;
    removeListener = window.ftpApi.onEvent(handleEvent);
  }

  async function refreshProfiles() {
    profiles.value = await window.ftpApi.listProfiles();
  }

  async function refreshFolders() {
    folders.value = await window.ftpApi.listFolders();
  }

  async function reloadRuntimeState() {
    sessions.value = await window.ftpApi.listSessions();
    transferTasks.value = await window.ftpApi.listTransferTasks();
    restoreStates.value = await window.ftpApi.listRestoreStates();
  }

  async function createFolder(input: CreateFtpSessionFolderInput) {
    const folder = await window.ftpApi.createFolder(input);
    folders.value = [...folders.value, folder];
    return folder;
  }

  async function updateFolder(input: UpdateFtpSessionFolderInput) {
    const folder = await window.ftpApi.updateFolder(input);
    folders.value = folders.value.map((item) => (item.id === folder.id ? folder : item));
    return folder;
  }

  async function deleteFolder(id: string) {
    await window.ftpApi.deleteFolder(id);
    folders.value = folders.value.filter((item) => item.id !== id);
    profiles.value = profiles.value.map((item) => (item.folderId === id ? { ...item, folderId: undefined } : item));
  }

  async function createProfile(input: CreateFtpProfileInput) {
    const profile = await window.ftpApi.createProfile(input);
    profiles.value = [...profiles.value, profile];
    return profile;
  }

  async function updateProfile(input: UpdateFtpProfileInput) {
    const profile = await window.ftpApi.updateProfile(input);
    profiles.value = profiles.value.map((item) => (item.id === profile.id ? profile : item));
    return profile;
  }

  async function deleteProfile(id: string) {
    await window.ftpApi.deleteProfile(id);
    profiles.value = profiles.value.filter((item) => item.id !== id);
  }

  async function connect(input: ConnectFtpInput) {
    const descriptor = await window.ftpApi.connect(input);
    upsertSession(descriptor);
    activeSessionId.value = descriptor.sessionId;
    sessionRemotePaths.value = {
      ...sessionRemotePaths.value,
      [descriptor.sessionId]: descriptor.remoteRoot,
    };
    sessionLocalPaths.value = {
      ...sessionLocalPaths.value,
      [descriptor.sessionId]: localPath.value || descriptor.localRoot,
    };
    remotePath.value = sessionRemotePaths.value[descriptor.sessionId];
    localPath.value = sessionLocalPaths.value[descriptor.sessionId];
    restoreFailures.value = restoreFailures.value.filter((item) => item.profileId !== descriptor.profileId);
    await Promise.all([
      refreshRemoteDirectory(remotePath.value),
      refreshLocalDirectory(localPath.value),
    ]);
    await persistRestoreStates();
    return descriptor;
  }

  async function disconnect(sessionId: string) {
    const session = sessions.value.find((item) => item.sessionId === sessionId) ?? null;
    await window.ftpApi.disconnect(sessionId);
    sessions.value = sessions.value.filter((session) => session.sessionId !== sessionId);
    if (session) {
      const { [sessionId]: _local, ...nextLocal } = sessionLocalPaths.value;
      const { [sessionId]: _remote, ...nextRemote } = sessionRemotePaths.value;
      sessionLocalPaths.value = nextLocal;
      sessionRemotePaths.value = nextRemote;
      await window.ftpApi.deleteRestoreState(session.profileId);
      restoreStates.value = restoreStates.value.filter((item) => item.sessionId !== session.profileId);
    }
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = sessions.value[0]?.sessionId ?? '';
      if (!activeSessionId.value) {
        remoteEntries.value = [];
        remotePath.value = '';
        selectedRemotePath.value = '';
      } else {
        const nextSessionId = activeSessionId.value;
        localPath.value = sessionLocalPaths.value[nextSessionId] || localPath.value;
        remotePath.value = sessionRemotePaths.value[nextSessionId] || remotePath.value;
      }
    }
  }

  function focusSession(sessionId: string) {
    const session = sessions.value.find((item) => item.sessionId === sessionId);
    if (!session) return;
    activeSessionId.value = sessionId;
    remotePath.value = sessionRemotePaths.value[sessionId] || session.remoteRoot;
    localPath.value = sessionLocalPaths.value[sessionId] || localPath.value || session.localRoot;
    void Promise.all([
      refreshRemoteDirectory(remotePath.value || session.remoteRoot),
      refreshLocalDirectory(localPath.value || session.localRoot),
    ]);
  }

  async function reorderSessions(sessionIds: string[]) {
    if (!sessionIds.length) return;
    const sessionMap = new Map(sessions.value.map((session) => [session.sessionId, session]));
    const ordered = sessionIds
      .map((sessionId) => sessionMap.get(sessionId))
      .filter((session): session is FtpConnectionDescriptor => Boolean(session));
    const remaining = sessions.value.filter((session) => !sessionIds.includes(session.sessionId));
    sessions.value = [...ordered, ...remaining];
    await persistRestoreStates();
  }

  async function refreshLocalDirectory(path = localPath.value) {
    localLoading.value = true;
    try {
      const nextPath = path || await window.ftpApi.getDefaultLocalPath();
      localEntries.value = await window.ftpApi.listLocalDirectory(nextPath);
      localPath.value = nextPath;
      if (activeSessionId.value) {
        sessionLocalPaths.value = {
          ...sessionLocalPaths.value,
          [activeSessionId.value]: nextPath,
        };
        await persistRestoreStates();
      }
      selectedLocalPath.value = '';
    } finally {
      localLoading.value = false;
    }
  }

  async function refreshRemoteDirectory(path = remotePath.value) {
    if (!activeSessionId.value) {
      remoteEntries.value = [];
      return;
    }
    remoteLoading.value = true;
    try {
      remoteEntries.value = await window.ftpApi.listRemoteDirectory(activeSessionId.value, path);
      remotePath.value = path;
      sessionRemotePaths.value = {
        ...sessionRemotePaths.value,
        [activeSessionId.value]: path,
      };
      await persistRestoreStates();
      selectedRemotePath.value = '';
    } finally {
      remoteLoading.value = false;
    }
  }

  async function createRemoteDir(path: string) {
    if (!activeSessionId.value) return;
    await window.ftpApi.createRemoteDir(activeSessionId.value, path);
    await refreshRemoteDirectory(remotePath.value);
  }

  async function renameRemotePath(oldPath: string, newPath: string) {
    if (!activeSessionId.value) return;
    await window.ftpApi.renameRemotePath(activeSessionId.value, oldPath, newPath);
    await refreshRemoteDirectory(remotePath.value);
  }

  async function deleteRemotePath(path: string) {
    if (!activeSessionId.value) return;
    await window.ftpApi.deleteRemotePath(activeSessionId.value, path);
    await refreshRemoteDirectory(remotePath.value);
  }

  async function chmodRemotePath(path: string, mode: string) {
    if (!activeSessionId.value) return;
    await window.ftpApi.chmodRemotePath(activeSessionId.value, path, mode);
    await refreshRemoteDirectory(remotePath.value);
  }

  async function createLocalDir(path: string) {
    await window.ftpApi.createLocalDir(path);
    await refreshLocalDirectory(localPath.value);
  }

  async function renameLocalPath(oldPath: string, newPath: string) {
    await window.ftpApi.renameLocalPath(oldPath, newPath);
    await refreshLocalDirectory(localPath.value);
  }

  async function deleteLocalPath(path: string) {
    await window.ftpApi.deleteLocalPath(path);
    await refreshLocalDirectory(localPath.value);
  }

  async function uploadFileToSession(sessionId: string, localFilePath: string, remoteFilePath: string) {
    if (!sessionId) return null;
    const task = await window.ftpApi.uploadFile(sessionId, localFilePath, remoteFilePath);
    upsertTask(task);
    return task;
  }

  async function uploadFile(localFilePath: string, remoteFilePath: string) {
    if (!activeSessionId.value) return null;
    return uploadFileToSession(activeSessionId.value, localFilePath, remoteFilePath);
  }

  async function downloadFile(remoteFilePath: string, localFilePath: string) {
    if (!activeSessionId.value) return null;
    const task = await window.ftpApi.downloadFile(activeSessionId.value, remoteFilePath, localFilePath);
    upsertTask(task);
    return task;
  }

  async function fxpTransfer(sourceSessionId: string, sourcePath: string, targetSessionId: string, targetPath: string) {
    const task = await window.ftpApi.fxpTransfer(sourceSessionId, sourcePath, targetSessionId, targetPath);
    upsertTask(task);
    return task;
  }

  async function updateTaskPriority(taskId: string, priority: TransferTask['priority']) {
    const task = await window.ftpApi.updateTaskPriority(taskId, priority);
    upsertTask(task);
    return task;
  }

  async function deleteTransferTask(taskId: string) {
    await window.ftpApi.deleteTransferTask(taskId);
    transferTasks.value = transferTasks.value.filter((item) => item.id !== taskId);
  }

  async function pauseTask(taskId: string) {
    const task = await window.ftpApi.pauseTask(taskId);
    upsertTask(task);
    return task;
  }

  async function resumeTask(taskId: string) {
    const task = await window.ftpApi.resumeTask(taskId);
    upsertTask(task);
    return task;
  }

  async function retryTask(taskId: string) {
    const task = await window.ftpApi.retryTask(taskId);
    upsertTask(task);
    return task;
  }

  async function pauseAllTasks() {
    const tasks = await window.ftpApi.pauseAllTasks();
    tasks.forEach(upsertTask);
    return tasks;
  }

  async function resumeAllTasks() {
    const tasks = await window.ftpApi.resumeAllTasks();
    tasks.forEach(upsertTask);
    return tasks;
  }

  async function addLocalWorkspace(path?: string) {
    const candidate = normalizeWorkspacePath(path || localPath.value);
    if (!candidate) return null;
    localWorkspaces.value = [candidate, ...localWorkspaces.value.filter((item) => item !== candidate)];
    persistLocalWorkspaces();
    return candidate;
  }

  async function pickLocalWorkspace(title = '选择本地工作目录') {
    const selected = await window.shellApi.selectDirectory(title);
    if (!selected) return null;
    return addLocalWorkspace(selected);
  }

  async function removeLocalWorkspace(path: string) {
    const candidate = normalizeWorkspacePath(path);
    if (!candidate) return;
    localWorkspaces.value = localWorkspaces.value.filter((item) => item !== candidate);
    persistLocalWorkspaces();
  }

  async function openLocalWorkspace(path: string) {
    const candidate = normalizeWorkspacePath(path);
    if (!candidate) return;
    await refreshLocalDirectory(candidate);
    await addLocalWorkspace(candidate);
  }

  function selectLocal(path: string) {
    selectedLocalPath.value = path;
  }

  function selectRemote(path: string) {
    selectedRemotePath.value = path;
  }

  function handleEvent(event: FtpEventEnvelope) {
    if (event.session) {
      upsertSession(event.session);
      if (event.session.status === 'disconnected') {
        sessions.value = sessions.value.filter((item) => item.sessionId !== event.session?.sessionId);
      }
    }
    if (event.task) {
      const previous = transferTasks.value.find((item) => item.id === event.task?.id) ?? null;
      upsertTask(event.task);
      if (previous?.status !== event.task.status) {
        maybeNotifyTaskState(event.task);
      }
    }
    maybeAppendLog(event);
  }

  function upsertSession(session: FtpConnectionDescriptor) {
    const index = sessions.value.findIndex((item) => item.sessionId === session.sessionId);
    if (index === -1) {
      sessions.value = [...sessions.value, session];
      sessionRemotePaths.value = {
        ...sessionRemotePaths.value,
        [session.sessionId]: session.remoteRoot,
      };
      sessionLocalPaths.value = {
        ...sessionLocalPaths.value,
        [session.sessionId]: session.localRoot,
      };
      return;
    }
    sessions.value = sessions.value.map((item, itemIndex) => (itemIndex === index ? session : item));
  }

  function upsertTask(task: TransferTask) {
    const index = transferTasks.value.findIndex((item) => item.id === task.id);
    if (index === -1) {
      transferTasks.value = [task, ...transferTasks.value];
      return;
    }
    transferTasks.value = transferTasks.value.map((item, itemIndex) => (itemIndex === index ? task : item));
  }

  function maybeNotifyTaskState(task: TransferTask) {
    if (!window.notificationApi) return;
    if (task.status === 'completed') {
      void window.notificationApi.show({
        type: 'text',
        size: 'sm',
        title: '传输完成',
        message: `${taskDirectionLabel(task.direction)} ${task.fileName || task.remotePath || task.localPath}`,
        duration: 4000,
        clickRoute: `/ftp?taskId=${encodeURIComponent(task.id)}`,
      });
      return;
    }
    if (task.status === 'failed') {
      void window.notificationApi.show({
        type: 'text',
        size: 'md',
        title: '传输失败',
        message: task.errorMessage || `${task.fileName || task.remotePath || task.localPath} 传输失败`,
        duration: 6000,
        clickRoute: `/ftp?taskId=${encodeURIComponent(task.id)}`,
      });
    }
  }

  function maybeAppendLog(event: FtpEventEnvelope) {
    if (event.eventType === 'taskProgress') return;

    let message = event.message?.trim() || '';
    let tone: FtpLogEntry['tone'] = 'info';

    if (!message && event.task) {
      message = `任务 ${event.task.fileName || event.task.id} 状态更新为 ${event.task.status}`;
    } else if (!message && event.session) {
      message = `连接 ${event.session.profileLabel} 状态更新为 ${event.session.status}`;
    }

    if (!message) return;
    if (event.task?.status === 'completed') {
      tone = 'success';
    } else if (event.task?.status === 'failed' || event.session?.status === 'failed') {
      tone = 'danger';
    }

    logs.value = [
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        tone,
        message,
      },
      ...logs.value,
    ].slice(0, MAX_FTP_LOGS);
  }

  function clearLogs() {
    logs.value = [];
  }

  async function restorePreviousSessions() {
    if (!restoreStates.value.length) return;

    for (const state of [...restoreStates.value].sort((left, right) => left.tabOrder - right.tabOrder)) {
      // 若后端进程仍存活（如前端 HMR 刷新），该 profileId 对应的 session 可能已在
      // listSessions() 中加载，直接复用，不再重复建立连接。
      const existing = sessions.value.find((s) => s.profileId === state.sessionId);
      if (existing) {
        sessionRemotePaths.value = {
          ...sessionRemotePaths.value,
          [existing.sessionId]: state.remotePath || sessionRemotePaths.value[existing.sessionId] || existing.remoteRoot,
        };
        sessionLocalPaths.value = {
          ...sessionLocalPaths.value,
          [existing.sessionId]: state.localPath || sessionLocalPaths.value[existing.sessionId] || existing.localRoot,
        };
        continue;
      }

      try {
        const descriptor = await window.ftpApi.connect({ profileId: state.sessionId });
        upsertSession(descriptor);
        sessionRemotePaths.value = {
          ...sessionRemotePaths.value,
          [descriptor.sessionId]: state.remotePath || descriptor.remoteRoot,
        };
        sessionLocalPaths.value = {
          ...sessionLocalPaths.value,
          [descriptor.sessionId]: state.localPath || descriptor.localRoot,
        };
      } catch (error) {
        restoreFailures.value = [
          ...restoreFailures.value.filter((item) => item.profileId !== state.sessionId),
          {
            profileId: state.sessionId,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        ];
      }
    }

    const firstSession = sessions.value[0];
    if (firstSession) {
      activeSessionId.value = firstSession.sessionId;
      remotePath.value = sessionRemotePaths.value[firstSession.sessionId] || firstSession.remoteRoot;
      localPath.value = sessionLocalPaths.value[firstSession.sessionId] || firstSession.localRoot;
      await Promise.all([
        refreshRemoteDirectory(remotePath.value),
        refreshLocalDirectory(localPath.value),
      ]);
    }
  }

  async function persistRestoreStates() {
    const nextStates: FtpRestoreState[] = [];
    for (const [index, session] of sessions.value.entries()) {
      const input: UpsertFtpRestoreStateInput = {
        sessionId: session.profileId,
        tabOrder: index,
        remotePath: sessionRemotePaths.value[session.sessionId] || session.remoteRoot,
        localPath: sessionLocalPaths.value[session.sessionId] || session.localRoot,
      };
      const state = await window.ftpApi.upsertRestoreState(input);
      nextStates.push(state);
    }
    restoreStates.value = nextStates;
  }

  function loadLocalWorkspaces() {
    try {
      const raw = window.localStorage.getItem(LOCAL_WORKSPACE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      localWorkspaces.value = parsed
        .map((item) => normalizeWorkspacePath(String(item)))
        .filter((item, index, array): item is string => Boolean(item) && array.indexOf(item) === index);
    } catch {
      localWorkspaces.value = [];
    }
  }

  function persistLocalWorkspaces() {
    window.localStorage.setItem(LOCAL_WORKSPACE_STORAGE_KEY, JSON.stringify(localWorkspaces.value));
  }

  return {
    profiles,
    folders,
    sessions,
    transferTasks,
    restoreStates,
    restoreFailures,
    logs,
    activeSessionId,
    activeSession,
    localPath,
    remotePath,
    localEntries,
    remoteEntries,
    selectedLocalPath,
    selectedRemotePath,
    localWorkspaces,
    localLoading,
    remoteLoading,
    initialized,
    initialize,
    refreshProfiles,
    refreshFolders,
    reloadRuntimeState,
    restorePreviousSessions,
    persistRestoreStates,
    createFolder,
    updateFolder,
    deleteFolder,
    createProfile,
    updateProfile,
    deleteProfile,
    connect,
    disconnect,
    focusSession,
    reorderSessions,
    refreshLocalDirectory,
    refreshRemoteDirectory,
    createRemoteDir,
    renameRemotePath,
    deleteRemotePath,
    chmodRemotePath,
    createLocalDir,
    renameLocalPath,
    deleteLocalPath,
    uploadFileToSession,
    uploadFile,
    downloadFile,
    fxpTransfer,
    deleteTransferTask,
    updateTaskPriority,
    pauseTask,
    resumeTask,
    retryTask,
    pauseAllTasks,
    resumeAllTasks,
    clearLogs,
    addLocalWorkspace,
    pickLocalWorkspace,
    removeLocalWorkspace,
    openLocalWorkspace,
    selectLocal,
    selectRemote,
  };
});

function normalizeWorkspacePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return '';
  if (/^[A-Za-z]:\\$/.test(trimmed) || trimmed === '/') {
    return trimmed;
  }
  if (/^[A-Za-z]:$/.test(trimmed)) {
    return `${trimmed}\\`;
  }
  return trimmed.replace(/[\\/]+$/, '');
}

function taskDirectionLabel(direction: string) {
  if (direction === 'upload') return '上传';
  if (direction === 'download') return '下载';
  if (direction === 'fxp') return 'FXP';
  return direction;
}

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFtpStore, import.meta.hot));
}
