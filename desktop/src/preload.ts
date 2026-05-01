// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';
import type {
  CreateHomeCategoryPayload,
  CreateHomeWidgetPayload,
  ImportHomeLayoutPayload,
  UpdateHomeCategoryPayload,
  UpdateHomeWidgetPayload,
} from '@/contracts/home_layout';
import type { AppConfigApi } from '@/contracts/app_config';
import type { PluginHostApi } from '@/contracts/plugin_host';
import type { NotificationApi, NotificationPayload } from '@/contracts/notification';
import type { SaveFileOptions, SelectFileOptions, ShellApi } from '@/contracts/shell';
import type { HomeWorkspaceApi } from '@/contracts/home_workspace';
import type { UpdateApi } from '@/contracts/updater';
import type {
  TodoApi,
  CreateTodoListPayload,
  UpdateTodoListPayload,
  CreateTodoPayload,
  UpdateTodoPayload,
  CreateTodoStepPayload,
  UpdateTodoStepPayload,
  CreateTodoReminderPayload,
} from '@/contracts/todo';
import type { MediaApi, CompressImageOptions, CompressVideoOptions } from '@/contracts/media';
import type {
  TerminalApi,
  CreateTerminalSessionPayload,
  DetachedTerminalSessionKind,
  ResizeTerminalSessionPayload,
  TerminalEventEnvelope,
} from '@/contracts/terminal';
import type {
  SshApi,
  ConnectSshInput,
  CreateSshProfileInput,
  CreatePortForwardInput,
  ResizeSshSessionInput,
  SshEventEnvelope,
  TrustHostInput,
  UpdateSshProfileInput,
  UpdatePortForwardInput,
} from '@/contracts/ssh';
import type {
  ConnectFtpInput,
  CreateFtpSessionFolderInput,
  CreateFtpProfileInput,
  FtpApi,
  FtpEventEnvelope,
  FtpExternalEditorOptions,
  FtpRetryPolicy,
  FtpTransferOptions,
  UpsertFtpRestoreStateInput,
  UpdateFtpProfileInput,
  UpdateFtpSessionFolderInput,
} from '@/contracts/ftp';

contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args);
  },
  on: (channel: string, listener: (...args: any[]) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, ...args: any[]) => listener(...args);
    ipcRenderer.on(channel, wrappedListener);
    return () => ipcRenderer.removeListener(channel, wrappedListener);
  },
});

contextBridge.exposeInMainWorld('homeLayoutApi', {
  getHomeLayout: () => ipcRenderer.invoke('home-layout:get'),
  createCategory: (input: CreateHomeCategoryPayload) =>
    ipcRenderer.invoke('home-layout:create-category', input),
  updateCategory: (categoryId: string, input: UpdateHomeCategoryPayload) =>
    ipcRenderer.invoke('home-layout:update-category', categoryId, input),
  deleteCategory: (categoryId: string) =>
    ipcRenderer.invoke('home-layout:delete-category', categoryId),
  createWidget: (input: CreateHomeWidgetPayload) =>
    ipcRenderer.invoke('home-layout:create-widget', input),
  updateWidget: (widgetId: string, input: UpdateHomeWidgetPayload) =>
    ipcRenderer.invoke('home-layout:update-widget', widgetId, input),
  deleteWidget: (widgetId: string) =>
    ipcRenderer.invoke('home-layout:delete-widget', widgetId),
  importLegacyLayout: (input: ImportHomeLayoutPayload) =>
    ipcRenderer.invoke('home-layout:import-layout', input),
});

const pluginHostApi: PluginHostApi = {
  getHostSummary: () => ipcRenderer.invoke('plugin-host:get-summary'),
  listPlugins: () => ipcRenderer.invoke('plugin-host:list-plugins'),
  listPages: () => ipcRenderer.invoke('plugin-host:list-pages'),
  installPluginFromPackage: (packageName: string) => ipcRenderer.invoke('plugin-host:install-package', packageName),
  registerLocalPlugin: (inputPath: string) => ipcRenderer.invoke('plugin-host:register-local', inputPath),
  enablePlugin: (pluginId: string) => ipcRenderer.invoke('plugin-host:enable', pluginId),
  disablePlugin: (pluginId: string) => ipcRenderer.invoke('plugin-host:disable', pluginId),
  mountPage: (pluginId, pageId, bounds) => ipcRenderer.invoke('plugin-host:mount-page', pluginId, pageId, bounds),
  updateMountedPageBounds: (bounds) => ipcRenderer.invoke('plugin-host:update-page-bounds', bounds),
  unmountPage: (pluginId?: string, pageId?: string) => ipcRenderer.invoke('plugin-host:unmount-page', pluginId, pageId),
};

const appConfigApi: AppConfigApi = {
  getConfig: () => ipcRenderer.invoke('app-config:get'),
  updateConfig: (patch) => ipcRenderer.invoke('app-config:update', patch),
  listLocalFonts: () => ipcRenderer.invoke('app-config:list-fonts'),
};

contextBridge.exposeInMainWorld('pluginHostApi', pluginHostApi);
contextBridge.exposeInMainWorld('appConfigApi', appConfigApi);

const notificationApi: NotificationApi = {
  show: (payload: NotificationPayload) => ipcRenderer.invoke('notification:show', payload),
};
contextBridge.exposeInMainWorld('notificationApi', notificationApi);

const updateApi: UpdateApi = {
  getStatus: () => ipcRenderer.invoke('updater:get-status'),
  getAuth: () => ipcRenderer.invoke('updater:get-auth'),
  setGithubToken: (token) => ipcRenderer.invoke('updater:set-github-token', token),
  clearGithubToken: () => ipcRenderer.invoke('updater:clear-github-token'),
  check: () => ipcRenderer.invoke('updater:check'),
  download: () => ipcRenderer.invoke('updater:download'),
  install: () => ipcRenderer.invoke('updater:install'),
  openReleasePage: () => ipcRenderer.invoke('updater:open-release-page'),
  onEvent: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: Awaited<ReturnType<UpdateApi['getStatus']>>) => listener(payload);
    ipcRenderer.on('updater:event', wrappedListener);
    return () => ipcRenderer.removeListener('updater:event', wrappedListener);
  },
};
contextBridge.exposeInMainWorld('updateApi', updateApi);

const shellApi: ShellApi = {
  openPath: (targetPath: string) => ipcRenderer.invoke('shell:open-path', targetPath),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  listLocalRoots: () => ipcRenderer.invoke('shell:list-local-roots'),
  selectFile: (options?: SelectFileOptions) => ipcRenderer.invoke('shell:select-file', options),
  saveFile: (options?: SaveFileOptions) => ipcRenderer.invoke('shell:save-file', options),
  selectDirectory: (title?: string) => ipcRenderer.invoke('shell:select-directory', title),
  readTextFile: (path: string, maxBytes?: number) => ipcRenderer.invoke('shell:read-text-file', path, maxBytes),
  writeTextFile: (path: string, content: string) => ipcRenderer.invoke('shell:write-text-file', path, content),
  readClipboardText: () => ipcRenderer.invoke('shell:clipboard-read-text'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('shell:clipboard-write-text', text),
  readClipboardPaths: () => ipcRenderer.invoke('shell:clipboard-read-paths'),
};
contextBridge.exposeInMainWorld('shellApi', shellApi);

const todoApi: TodoApi = {
  getAllLists: () => ipcRenderer.invoke('todo:get-all-lists'),
  createList: (input: CreateTodoListPayload) => ipcRenderer.invoke('todo:create-list', input),
  updateList: (listId: string, input: UpdateTodoListPayload) => ipcRenderer.invoke('todo:update-list', listId, input),
  deleteList: (listId: string) => ipcRenderer.invoke('todo:delete-list', listId),
  reorderLists: (ids: string[]) => ipcRenderer.invoke('todo:reorder-lists', ids),

  createTodo: (input: CreateTodoPayload) => ipcRenderer.invoke('todo:create-todo', input),
  updateTodo: (todoId: string, input: UpdateTodoPayload) => ipcRenderer.invoke('todo:update-todo', todoId, input),
  deleteTodo: (todoId: string) => ipcRenderer.invoke('todo:delete-todo', todoId),
  completeTodo: (todoId: string) => ipcRenderer.invoke('todo:complete-todo', todoId),
  uncompleteTodo: (todoId: string) => ipcRenderer.invoke('todo:uncomplete-todo', todoId),
  getTodosByList: (listId: string, includeCompleted: boolean) => ipcRenderer.invoke('todo:get-by-list', listId, includeCompleted),
  searchTodos: (query: string) => ipcRenderer.invoke('todo:search', query),
  moveTodo: (todoId: string, targetListId: string) => ipcRenderer.invoke('todo:move', todoId, targetListId),

  getMyDayTodos: (date: string) => ipcRenderer.invoke('todo:get-my-day', date),
  getImportantTodos: () => ipcRenderer.invoke('todo:get-important'),
  getPlannedTodos: () => ipcRenderer.invoke('todo:get-planned'),
  getAllTodos: () => ipcRenderer.invoke('todo:get-all'),
  getCompletedTodos: () => ipcRenderer.invoke('todo:get-completed'),

  addToMyDay: (todoId: string, date: string) => ipcRenderer.invoke('todo:add-to-my-day', todoId, date),
  removeFromMyDay: (todoId: string) => ipcRenderer.invoke('todo:remove-from-my-day', todoId),
  getYesterdayIncomplete: (today: string) => ipcRenderer.invoke('todo:get-yesterday-incomplete', today),
  getMyDaySuggestions: (today: string) => ipcRenderer.invoke('todo:get-my-day-suggestions', today),

  createStep: (input: CreateTodoStepPayload) => ipcRenderer.invoke('todo:create-step', input),
  updateStep: (stepId: string, input: UpdateTodoStepPayload) => ipcRenderer.invoke('todo:update-step', stepId, input),
  deleteStep: (stepId: string) => ipcRenderer.invoke('todo:delete-step', stepId),
  reorderSteps: (ids: string[]) => ipcRenderer.invoke('todo:reorder-steps', ids),

  createReminder: (input: CreateTodoReminderPayload) => ipcRenderer.invoke('todo:create-reminder', input),
  deleteReminder: (reminderId: string) => ipcRenderer.invoke('todo:delete-reminder', reminderId),
  getRemindersByTodo: (todoId: string) => ipcRenderer.invoke('todo:get-reminders', todoId),

  getDismissedDate: () => ipcRenderer.invoke('todo:get-dismissed-date'),
  setDismissedDate: (date: string) => ipcRenderer.invoke('todo:set-dismissed-date', date),
};
contextBridge.exposeInMainWorld('todoApi', todoApi);

const homeWorkspaceApi: HomeWorkspaceApi = {
  getBackground: () => ipcRenderer.invoke('home-workspace:get-background'),
  updateBackground: (payload: {
    header?: { color?: string; image?: string; video?: string; style?: Record<string, unknown> };
    sidebar?: { color?: string; image?: string; video?: string; style?: Record<string, unknown> };
  }) => ipcRenderer.invoke('home-workspace:update-background', payload),
};
contextBridge.exposeInMainWorld('homeWorkspaceApi', homeWorkspaceApi);

const mediaApi: MediaApi = {
  compressImage: (dataUrl: string, options: CompressImageOptions) =>
    ipcRenderer.invoke('media:compress-image', dataUrl, options),
  compressVideo: (filePath: string, options: CompressVideoOptions) =>
    ipcRenderer.invoke('media:compress-video', filePath, options),
  checkFfmpeg: () => ipcRenderer.invoke('media:check-ffmpeg'),
};
contextBridge.exposeInMainWorld('mediaApi', mediaApi);

const webviewApi = {
  checkDomain: (domain: string) => ipcRenderer.invoke('webview:check-domain', domain),
  getInjectedScripts: (domain: string) => ipcRenderer.invoke('webview:get-injected-scripts', domain),
  openNewWindow: (url: string) => ipcRenderer.invoke('webview:open-new-window', url),
  clearSession: () => ipcRenderer.invoke('webview:clear-session'),
  // Chrome 扩展管理
  installExtension: (sourcePath: string) => ipcRenderer.invoke('webview:install-extension', sourcePath),
  removeExtension: (id: string) => ipcRenderer.invoke('webview:remove-extension', id),
  toggleExtension: (id: string, enabled: boolean) => ipcRenderer.invoke('webview:toggle-extension', id, enabled),
  getExtensions: () => ipcRenderer.invoke('webview:get-extensions'),
  openScriptEditor: (scriptId?: string, domain?: string) => ipcRenderer.invoke('webview:open-script-editor', scriptId, domain),
};
contextBridge.exposeInMainWorld('webviewApi', webviewApi);

const terminalApi: TerminalApi = {
  listProfiles: () => ipcRenderer.invoke('terminal:list-profiles'),
  listSessions: () => ipcRenderer.invoke('terminal:list-sessions'),
  createSession: (payload: CreateTerminalSessionPayload) => ipcRenderer.invoke('terminal:create-session', payload),
  getBuffer: (sessionId: string) => ipcRenderer.invoke('terminal:get-buffer', sessionId),
  clearBuffer: (sessionId: string) => ipcRenderer.invoke('terminal:clear-buffer', sessionId),
  write: (sessionId: string, data: string) => ipcRenderer.invoke('terminal:write', sessionId, data),
  resizeSession: (payload: ResizeTerminalSessionPayload) => ipcRenderer.invoke('terminal:resize-session', payload),
  killSession: (sessionId: string) => ipcRenderer.invoke('terminal:kill-session', sessionId),
  attachSession: (sessionId: string, target: string) => ipcRenderer.invoke('terminal:attach-session', sessionId, target),
  attachToMain: (sessionId: string) => ipcRenderer.invoke('terminal:attach-main', sessionId),
  detachToWindow: (sessionId: string, kind?: DetachedTerminalSessionKind, label?: string) =>
    ipcRenderer.invoke('terminal:detach-to-window', sessionId, kind ?? 'local', label ?? ''),
  returnDetachedToMain: (sessionId: string, target: string, kind?: DetachedTerminalSessionKind) =>
    ipcRenderer.invoke('terminal:return-detached-to-main', sessionId, target, kind ?? 'local'),
  readClipboardText: () => ipcRenderer.invoke('terminal:clipboard-read'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('terminal:clipboard-write', text),
  onEvent: (listener: (event: TerminalEventEnvelope) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: TerminalEventEnvelope) => listener(payload);
    ipcRenderer.on('terminal:event', wrappedListener);
    return () => ipcRenderer.removeListener('terminal:event', wrappedListener);
  },
};
contextBridge.exposeInMainWorld('terminalApi', terminalApi);

// ── SSH API ───────────────────────────────────────────────────

const sshApi: SshApi = {
  // Profile CRUD
  listProfiles: () => ipcRenderer.invoke('ssh:list-profiles'),
  createProfile: (input: CreateSshProfileInput) => ipcRenderer.invoke('ssh:create-profile', input),
  updateProfile: (input: UpdateSshProfileInput) => ipcRenderer.invoke('ssh:update-profile', input),
  deleteProfile: (id: string) => ipcRenderer.invoke('ssh:delete-profile', id),

  // Connection management
  listSessions: () => ipcRenderer.invoke('ssh:list-sessions'),
  connect: (input: ConnectSshInput) => ipcRenderer.invoke('ssh:connect', input),
  disconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', sessionId),
  detachToWindow: (sessionId: string, label?: string) =>
    ipcRenderer.invoke('terminal:detach-to-window', sessionId, 'ssh', label ?? ''),
  getBuffer: (sessionId: string) => ipcRenderer.invoke('ssh:get-buffer', sessionId),
  clearBuffer: (sessionId: string) => ipcRenderer.invoke('ssh:clear-buffer', sessionId),

  // I/O
  write: (sessionId: string, data: string) => ipcRenderer.invoke('ssh:write', sessionId, data),
  resizeSession: (input: ResizeSshSessionInput) => ipcRenderer.invoke('ssh:resize-session', input),

  // Known hosts
  listKnownHosts: () => ipcRenderer.invoke('ssh:list-known-hosts'),
  verifyHostFingerprint: (host, port, algorithm, fingerprint) =>
    ipcRenderer.invoke('ssh:verify-host-fingerprint', host, port, algorithm, fingerprint),
  trustHost: (input: TrustHostInput) => ipcRenderer.invoke('ssh:trust-host', input),
  deleteKnownHost: (id: string) => ipcRenderer.invoke('ssh:delete-known-host', id),

  // SSH Agent
  listAgentIdentities: () => ipcRenderer.invoke('ssh:list-agent-identities'),
  listManagedKeys: () => ipcRenderer.invoke('ssh:list-managed-keys'),
  generateManagedKey: (input) => ipcRenderer.invoke('ssh:generate-managed-key', input),
  importManagedKey: (input) => ipcRenderer.invoke('ssh:import-managed-key', input),
  exportManagedKey: (id: string) => ipcRenderer.invoke('ssh:export-managed-key', id),
  deleteManagedKey: (id: string) => ipcRenderer.invoke('ssh:delete-managed-key', id),

  // Port forwarding
  listPortForwards: (profileId: string) => ipcRenderer.invoke('ssh:list-port-forwards', profileId),
  createPortForward: (input: CreatePortForwardInput) => ipcRenderer.invoke('ssh:create-port-forward', input),
  updatePortForward: (input: UpdatePortForwardInput) => ipcRenderer.invoke('ssh:update-port-forward', input),
  deletePortForward: (id: string) => ipcRenderer.invoke('ssh:delete-port-forward', id),
  startPortForward: (sessionId: string, forwardId: string) => ipcRenderer.invoke('ssh:start-port-forward', sessionId, forwardId),
  stopPortForward: (sessionId: string, forwardId: string) => ipcRenderer.invoke('ssh:stop-port-forward', sessionId, forwardId),
  listForwardStatus: (sessionId: string) => ipcRenderer.invoke('ssh:list-forward-status', sessionId),

  // Traffic statistics
  getForwardTraffic: (sessionId: string) => ipcRenderer.invoke('ssh:get-forward-traffic', sessionId),

  // Port forward import/export
  exportPortForwards: (profileId: string) => ipcRenderer.invoke('ssh:export-port-forwards', profileId),
  importPortForwards: (profileId: string, jsonData: string) => ipcRenderer.invoke('ssh:import-port-forwards', profileId, jsonData),

  // Event subscription
  onEvent: (listener: (event: SshEventEnvelope) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: SshEventEnvelope) => listener(payload);
    ipcRenderer.on('ssh:event', wrappedListener);
    return () => ipcRenderer.removeListener('ssh:event', wrappedListener);
  },
};
contextBridge.exposeInMainWorld('sshApi', sshApi);

const ftpApi: FtpApi = {
  listProfiles: () => ipcRenderer.invoke('ftp:list-profiles'),
  listFolders: () => ipcRenderer.invoke('ftp:list-folders'),
  createFolder: (input: CreateFtpSessionFolderInput) => ipcRenderer.invoke('ftp:create-folder', input),
  updateFolder: (input: UpdateFtpSessionFolderInput) => ipcRenderer.invoke('ftp:update-folder', input),
  deleteFolder: (id: string) => ipcRenderer.invoke('ftp:delete-folder', id),
  createProfile: (input: CreateFtpProfileInput) => ipcRenderer.invoke('ftp:create-profile', input),
  updateProfile: (input: UpdateFtpProfileInput) => ipcRenderer.invoke('ftp:update-profile', input),
  deleteProfile: (id: string) => ipcRenderer.invoke('ftp:delete-profile', id),

  listSessions: () => ipcRenderer.invoke('ftp:list-sessions'),
  listRestoreStates: () => ipcRenderer.invoke('ftp:list-restore-states'),
  upsertRestoreState: (input: UpsertFtpRestoreStateInput) => ipcRenderer.invoke('ftp:upsert-restore-state', input),
  deleteRestoreState: (sessionId: string) => ipcRenderer.invoke('ftp:delete-restore-state', sessionId),
  connect: (input: ConnectFtpInput) => ipcRenderer.invoke('ftp:connect', input),
  cancelAuthChallenge: (authSessionId: string) => ipcRenderer.invoke('ftp:cancel-auth-challenge', authSessionId),
  disconnect: (sessionId: string) => ipcRenderer.invoke('ftp:disconnect', sessionId),

  listRemoteDirectory: (sessionId: string, path: string) =>
    ipcRenderer.invoke('ftp:list-remote-directory', sessionId, path),
  computeRemoteFileSha256: (sessionId: string, path: string) =>
    ipcRenderer.invoke('ftp:compute-remote-file-sha256', sessionId, path),
  loadRemoteImagePreview: (sessionId: string, path: string, maxBytes?: number) =>
    ipcRenderer.invoke('ftp:load-remote-image-preview', sessionId, path, maxBytes),
  loadRemoteTextFile: (sessionId: string, path: string, maxBytes?: number) =>
    ipcRenderer.invoke('ftp:load-remote-text-file', sessionId, path, maxBytes),
  saveRemoteTextFile: (sessionId: string, path: string, content: string) =>
    ipcRenderer.invoke('ftp:save-remote-text-file', sessionId, path, content),
  exportRemotePathToLocal: (sessionId: string, remotePath: string, localPath: string) =>
    ipcRenderer.invoke('ftp:export-remote-path-to-local', sessionId, remotePath, localPath),
  openExternalEditorDraft: (sessionId: string, path: string, options?: FtpExternalEditorOptions) =>
    ipcRenderer.invoke('ftp:open-external-editor-draft', sessionId, path, options),
  createRemoteDir: (sessionId: string, path: string) =>
    ipcRenderer.invoke('ftp:create-remote-dir', sessionId, path),
  renameRemotePath: (sessionId: string, oldPath: string, newPath: string) =>
    ipcRenderer.invoke('ftp:rename-remote-path', sessionId, oldPath, newPath),
  deleteRemotePath: (sessionId: string, path: string) =>
    ipcRenderer.invoke('ftp:delete-remote-path', sessionId, path),
  chmodRemotePath: (sessionId: string, path: string, mode: string) =>
    ipcRenderer.invoke('ftp:chmod-remote-path', sessionId, path, mode),

  listLocalDirectory: (path: string) => ipcRenderer.invoke('ftp:list-local-directory', path),
  computeLocalFileSha256: (path: string) =>
    ipcRenderer.invoke('ftp:compute-local-file-sha256', path),
  loadLocalImagePreview: (path: string, maxBytes?: number) =>
    ipcRenderer.invoke('ftp:load-local-image-preview', path, maxBytes),
  createLocalDir: (path: string) => ipcRenderer.invoke('ftp:create-local-dir', path),
  renameLocalPath: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('ftp:rename-local-path', oldPath, newPath),
  deleteLocalPath: (path: string) => ipcRenderer.invoke('ftp:delete-local-path', path),
  copyLocalPath: (sourcePath: string, targetPath: string) =>
    ipcRenderer.invoke('ftp:copy-local-path', sourcePath, targetPath),
  getDefaultLocalPath: () => ipcRenderer.invoke('ftp:get-default-local-path'),

  uploadFile: (sessionId: string, localPath: string, remotePath: string, options?: FtpTransferOptions) =>
    ipcRenderer.invoke('ftp:upload-file', sessionId, localPath, remotePath, options),
  downloadFile: (sessionId: string, remotePath: string, localPath: string, options?: FtpTransferOptions) =>
    ipcRenderer.invoke('ftp:download-file', sessionId, remotePath, localPath, options),
  fxpTransfer: (sourceSessionId: string, sourcePath: string, targetSessionId: string, targetPath: string) =>
    ipcRenderer.invoke('ftp:fxp-transfer', sourceSessionId, sourcePath, targetSessionId, targetPath),
  listTransferTasks: () => ipcRenderer.invoke('ftp:list-transfer-tasks'),
  getRetryPolicy: () => ipcRenderer.invoke('ftp:get-retry-policy'),
  updateRetryPolicy: (input: FtpRetryPolicy) => ipcRenderer.invoke('ftp:update-retry-policy', input),
  deleteTransferTask: (taskId: string) => ipcRenderer.invoke('ftp:delete-transfer-task', taskId),
  updateTaskPriority: (taskId: string, priority: string) =>
    ipcRenderer.invoke('ftp:update-task-priority', taskId, priority),
  pauseTask: (taskId: string) => ipcRenderer.invoke('ftp:pause-task', taskId),
  resumeTask: (taskId: string) => ipcRenderer.invoke('ftp:resume-task', taskId),
  retryTask: (taskId: string) => ipcRenderer.invoke('ftp:retry-task', taskId),
  pauseAllTasks: () => ipcRenderer.invoke('ftp:pause-all-tasks'),
  resumeAllTasks: () => ipcRenderer.invoke('ftp:resume-all-tasks'),
  listScheduledTasks: () => ipcRenderer.invoke('ftp:list-scheduled-tasks'),
  upsertScheduledTask: (input) => ipcRenderer.invoke('ftp:upsert-scheduled-task', input),
  deleteScheduledTask: (taskId: string) => ipcRenderer.invoke('ftp:delete-scheduled-task', taskId),
  runScheduledTaskNow: (taskId: string) => ipcRenderer.invoke('ftp:run-scheduled-task-now', taskId),
  getWindowsContextMenuStatus: () => ipcRenderer.invoke('ftp:get-windows-context-menu-status'),
  installWindowsContextMenu: () => ipcRenderer.invoke('ftp:install-windows-context-menu'),
  uninstallWindowsContextMenu: () => ipcRenderer.invoke('ftp:uninstall-windows-context-menu'),
  getPendingExternalPaths: () => ipcRenderer.invoke('ftp:get-pending-external-paths'),
  clearPendingExternalPaths: (paths?: string[]) => ipcRenderer.invoke('ftp:clear-pending-external-paths', paths),
  prepareRemoteDragExport: (sessionId: string, remotePaths: string[]) =>
    ipcRenderer.invoke('ftp:prepare-remote-drag-export', sessionId, remotePaths),
  startPreparedDrag: (localPaths: string[]) => {
    ipcRenderer.send('ftp:start-prepared-drag', localPaths);
  },

  onEvent: (listener: (event: FtpEventEnvelope) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: FtpEventEnvelope) => listener(payload);
    ipcRenderer.on('ftp:event', wrappedListener);
    return () => ipcRenderer.removeListener('ftp:event', wrappedListener);
  },
};
contextBridge.exposeInMainWorld('ftpApi', ftpApi);

import type { TrayApi } from '@/contracts/tray';

const trayApi: TrayApi = {
  quit: () => ipcRenderer.send('tray:quit'),
  showWindow: () => ipcRenderer.send('tray:show-window'),
  onContextMenu: (listener: (x: number, y: number) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, x: number, y: number) => listener(x, y);
    ipcRenderer.on('tray:context-menu', wrapped);
    return () => ipcRenderer.removeListener('tray:context-menu', wrapped);
  },
};
contextBridge.exposeInMainWorld('trayApi', trayApi);
