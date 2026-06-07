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
import type { AiApi, AiStreamEvent } from '@/contracts/ai';
import type { PluginHostApi } from '@/contracts/plugin_host';
import type { NotificationApi, NotificationPayload } from '@/contracts/notification';
import type { SaveFileOptions, SelectFileOptions, ShellApi } from '@/contracts/shell';
import type { HomeProfileApi } from '@/contracts/home_profile';
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
import type { KnowledgeApi } from '@/contracts/knowledge';
import type { MediaApi, CompressImageOptions, CompressVideoOptions } from '@/contracts/media';
import type {
  MultiDeviceClipboardApi,
  MultiDeviceClipboardEvent,
} from '@/contracts/multi_device_clipboard';
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
  CreateSshProfileFolderInput,
  CreateSshProfileInput,
  CreatePortForwardInput,
  ResizeSshSessionInput,
  SshEventEnvelope,
  TrustHostInput,
  UpdateSshProfileFolderInput,
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

const homeProfileApi: HomeProfileApi = {
  listProfiles: () => ipcRenderer.invoke('home-profile:list'),
  getActiveProfileKey: () => ipcRenderer.invoke('home-profile:get-active'),
  setActiveProfile: (key: string) => ipcRenderer.invoke('home-profile:set-active', key),
  createProfile: (input: { name: string }) => ipcRenderer.invoke('home-profile:create', input),
  renameProfile: (key: string, name: string) => ipcRenderer.invoke('home-profile:rename', key, name),
  deleteProfile: (key: string) => ipcRenderer.invoke('home-profile:delete', key),
};
contextBridge.exposeInMainWorld('homeProfileApi', homeProfileApi);

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
  listNetworkInterfaces: () => ipcRenderer.invoke('app-config:list-network-interfaces'),
  onDidChange: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, config: Awaited<ReturnType<AppConfigApi['getConfig']>>) => listener(config);
    ipcRenderer.on('app-config:changed', wrappedListener);
    return () => ipcRenderer.removeListener('app-config:changed', wrappedListener);
  },
};

contextBridge.exposeInMainWorld('pluginHostApi', pluginHostApi);
contextBridge.exposeInMainWorld('appConfigApi', appConfigApi);

const aiApi: AiApi = {
  getConfig: () => ipcRenderer.invoke('ai:get-config'),
  updateConfig: (patch) => ipcRenderer.invoke('ai:update-config', patch),
  testProvider: (input) => ipcRenderer.invoke('ai:test-provider', input),
  listConversations: () => ipcRenderer.invoke('ai:list-conversations'),
  createConversation: (input) => ipcRenderer.invoke('ai:create-conversation', input),
  updateConversation: (id, input) => ipcRenderer.invoke('ai:update-conversation', id, input),
  deleteConversation: (id) => ipcRenderer.invoke('ai:delete-conversation', id),
  listMessages: (conversationId) => ipcRenderer.invoke('ai:list-messages', conversationId),
  sendMessage: (input) => ipcRenderer.invoke('ai:send-message', input),
  regenerateMessage: (input) => ipcRenderer.invoke('ai:regenerate-message', input),
  stopRun: (runId) => ipcRenderer.invoke('ai:stop-run', runId),
  getKnowledgeEmbeddingStats: (input) => ipcRenderer.invoke('ai:get-knowledge-embedding-stats', input),
  rebuildKnowledgeEmbeddings: (input) => ipcRenderer.invoke('ai:rebuild-knowledge-embeddings', input),
  listCanvasWorkspaces: (conversationId) => ipcRenderer.invoke('ai:list-canvas-workspaces', conversationId),
  createCanvasWorkspace: (input) => ipcRenderer.invoke('ai:create-canvas-workspace', input),
  updateCanvasWorkspace: (id, input) => ipcRenderer.invoke('ai:update-canvas-workspace', id, input),
  deleteCanvasWorkspace: (id) => ipcRenderer.invoke('ai:delete-canvas-workspace', id),
  listCanvasFiles: (workspaceId) => ipcRenderer.invoke('ai:list-canvas-files', workspaceId),
  upsertCanvasFile: (input) => ipcRenderer.invoke('ai:upsert-canvas-file', input),
  deleteCanvasFile: (workspaceId, path) => ipcRenderer.invoke('ai:delete-canvas-file', workspaceId, path),
  listCanvasVersions: (workspaceId) => ipcRenderer.invoke('ai:list-canvas-versions', workspaceId),
  createCanvasVersion: (input) => ipcRenderer.invoke('ai:create-canvas-version', input),
  listCanvasOperations: (workspaceId) => ipcRenderer.invoke('ai:list-canvas-operations', workspaceId),
  onStreamEvent: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: AiStreamEvent) => listener(payload);
    ipcRenderer.on('ai:stream-event', wrappedListener);
    return () => ipcRenderer.removeListener('ai:stream-event', wrappedListener);
  },
};
contextBridge.exposeInMainWorld('aiApi', aiApi);

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

  getBackgrounds: () => ipcRenderer.invoke('todo:get-backgrounds'),
  updateBackgrounds: (payload) => ipcRenderer.invoke('todo:update-backgrounds', payload),
};
contextBridge.exposeInMainWorld('todoApi', todoApi);

const knowledgeApi: KnowledgeApi = {
  listLibraries: () => ipcRenderer.invoke('knowledge:list-libraries'),
  createLibrary: (input) => ipcRenderer.invoke('knowledge:create-library', input),
  updateLibrary: (libraryId, input) => ipcRenderer.invoke('knowledge:update-library', libraryId, input),
  deleteLibrary: (libraryId: string) => ipcRenderer.invoke('knowledge:delete-library', libraryId),
  listSpaces: (libraryId?: string) => ipcRenderer.invoke('knowledge:list-spaces', libraryId),
  createSpace: (input) => ipcRenderer.invoke('knowledge:create-space', input),
  updateSpace: (spaceId, input) => ipcRenderer.invoke('knowledge:update-space', spaceId, input),
  deleteSpace: (spaceId: string) => ipcRenderer.invoke('knowledge:delete-space', spaceId),
  listTree: (input) => ipcRenderer.invoke('knowledge:list-tree', input),
  createFolder: (input) => ipcRenderer.invoke('knowledge:create-folder', input),
  createPage: (input) => ipcRenderer.invoke('knowledge:create-page', input),
  getPage: (pageId: string) => ipcRenderer.invoke('knowledge:get-page', pageId),
  updatePage: (pageId, input) => ipcRenderer.invoke('knowledge:update-page', pageId, input),
  listQuickNotes: (input) => ipcRenderer.invoke('knowledge:list-quick-notes', input),
  createQuickNote: (input) => ipcRenderer.invoke('knowledge:create-quick-note', input),
  updateQuickNote: (noteId, input) => ipcRenderer.invoke('knowledge:update-quick-note', noteId, input),
  archiveQuickNote: (noteId: string) => ipcRenderer.invoke('knowledge:archive-quick-note', noteId),
  convertQuickNoteToPage: (noteId, input) => ipcRenderer.invoke('knowledge:convert-quick-note-to-page', noteId, input),
  linkQuickNoteTodo: (noteId: string, todoId: string) => ipcRenderer.invoke('knowledge:link-quick-note-todo', noteId, todoId),
  saveAsset: (input) => ipcRenderer.invoke('knowledge:save-asset', input),
  getAsset: (assetId: string) => ipcRenderer.invoke('knowledge:get-asset', assetId),
  openAsset: (assetId: string) => ipcRenderer.invoke('knowledge:open-asset', assetId),
  showAssetInFolder: (assetId: string) => ipcRenderer.invoke('knowledge:show-asset-in-folder', assetId),
  importFiles: (input) => ipcRenderer.invoke('knowledge:import-files', input),
  listIndexJobs: (input) => ipcRenderer.invoke('knowledge:list-index-jobs', input),
  retryIndexJob: (jobId: string) => ipcRenderer.invoke('knowledge:retry-index-job', jobId),
  cancelIndexJob: (jobId: string) => ipcRenderer.invoke('knowledge:cancel-index-job', jobId),
  clearPreviewCache: () => ipcRenderer.invoke('knowledge:clear-preview-cache'),
  search: (input) => ipcRenderer.invoke('knowledge:search', input),
  listTags: (input) => ipcRenderer.invoke('knowledge:list-tags', input),
  createTag: (input) => ipcRenderer.invoke('knowledge:create-tag', input),
  updateTag: (tagId, input) => ipcRenderer.invoke('knowledge:update-tag', tagId, input),
  bindTag: (input) => ipcRenderer.invoke('knowledge:bind-tag', input),
  unbindTag: (input) => ipcRenderer.invoke('knowledge:unbind-tag', input),
  listTagTargets: (input) => ipcRenderer.invoke('knowledge:list-tag-targets', input),
  listPageLinks: (pageId) => ipcRenderer.invoke('knowledge:list-page-links', pageId),
  listBacklinks: (pageId) => ipcRenderer.invoke('knowledge:list-backlinks', pageId),
  linkTodoSource: (input) => ipcRenderer.invoke('knowledge:link-todo-source', input),
  getGraph: (input) => ipcRenderer.invoke('knowledge:get-graph', input),
  listOrphanPages: (input) => ipcRenderer.invoke('knowledge:list-orphan-pages', input),
  moveNode: (nodeId, input) => ipcRenderer.invoke('knowledge:move-node', nodeId, input),
  updateNode: (nodeId, input) => ipcRenderer.invoke('knowledge:update-node', nodeId, input),
  archiveNode: (nodeId: string) => ipcRenderer.invoke('knowledge:archive-node', nodeId),
  toggleFavorite: (nodeId: string, favorite: boolean) => ipcRenderer.invoke('knowledge:toggle-favorite', nodeId, favorite),
  deleteNode: (nodeId: string) => ipcRenderer.invoke('knowledge:delete-node', nodeId),
};
contextBridge.exposeInMainWorld('knowledgeApi', knowledgeApi);

contextBridge.exposeInMainWorld('quickNoteWindowApi', {
  show: (prefill) => ipcRenderer.invoke('quick-note:show-window', prefill),
  close: () => ipcRenderer.invoke('quick-note:close-window'),
  dock: () => ipcRenderer.invoke('quick-note:dock-window'),
  setAlwaysOnTop: (alwaysOnTop: boolean) => ipcRenderer.invoke('quick-note:set-always-on-top', alwaysOnTop),
  onPrefill: (listener: (payload: import('@/contracts/knowledge').QuickNotePrefillPayload) => void) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: import('@/contracts/knowledge').QuickNotePrefillPayload,
    ) => listener(payload);
    ipcRenderer.on('quick-note:prefill', wrappedListener);
    return () => ipcRenderer.removeListener('quick-note:prefill', wrappedListener);
  },
} satisfies import('@/contracts/knowledge').QuickNoteWindowApi);

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

const multiDeviceClipboardApi: MultiDeviceClipboardApi = {
  listItems: () => ipcRenderer.invoke('multi-device-clipboard:list-items'),
  applyItem: (itemId: string) => ipcRenderer.invoke('multi-device-clipboard:apply-item', itemId),
  showItemPreview: (itemId: string) => ipcRenderer.invoke('multi-device-clipboard:show-item-preview', itemId),
  deleteItem: (itemId: string) => ipcRenderer.invoke('multi-device-clipboard:delete-item', itemId),
  clearHistory: () => ipcRenderer.invoke('multi-device-clipboard:clear-history'),
  listDevices: () => ipcRenderer.invoke('multi-device-clipboard:list-devices'),
  listDeviceStatuses: (onlineWindowSeconds: number) =>
    ipcRenderer.invoke('multi-device-clipboard:list-device-statuses', onlineWindowSeconds),
  listDiscoveredDevices: () => ipcRenderer.invoke('multi-device-clipboard:list-discovered-devices'),
  listPairingRequests: () => ipcRenderer.invoke('multi-device-clipboard:list-pairing-requests'),
  startPairing: (deviceId: string) => ipcRenderer.invoke('multi-device-clipboard:start-pairing', deviceId),
  startPairingByAddress: (endpoint: string) => ipcRenderer.invoke('multi-device-clipboard:start-pairing-by-address', endpoint),
  approvePairing: (requestId: string) => ipcRenderer.invoke('multi-device-clipboard:approve-pairing', requestId),
  rejectPairing: (requestId: string) => ipcRenderer.invoke('multi-device-clipboard:reject-pairing', requestId),
  forgetDevice: (deviceId: string) => ipcRenderer.invoke('multi-device-clipboard:forget-device', deviceId),
  showWindow: () => ipcRenderer.invoke('multi-device-clipboard:show-window'),
  closeWindow: () => ipcRenderer.invoke('multi-device-clipboard:close-window'),
  dockWindow: () => ipcRenderer.invoke('multi-device-clipboard:dock-window'),
  expandWindow: () => ipcRenderer.invoke('multi-device-clipboard:expand-window'),
  openDevTools: () => ipcRenderer.invoke('multi-device-clipboard:open-devtools'),
  onEvent: (listener: (event: MultiDeviceClipboardEvent) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: MultiDeviceClipboardEvent) => listener(payload);
    ipcRenderer.on('multi-device-clipboard:event', wrappedListener);
    return () => ipcRenderer.removeListener('multi-device-clipboard:event', wrappedListener);
  },
};
contextBridge.exposeInMainWorld('multiDeviceClipboardApi', multiDeviceClipboardApi);

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
  listFolders: () => ipcRenderer.invoke('ssh:list-folders'),
  createFolder: (input: CreateSshProfileFolderInput) => ipcRenderer.invoke('ssh:create-folder', input),
  updateFolder: (input: UpdateSshProfileFolderInput) => ipcRenderer.invoke('ssh:update-folder', input),
  deleteFolder: (id: string) => ipcRenderer.invoke('ssh:delete-folder', id),
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
  getPortOccupant: (host: string, port: number) => ipcRenderer.invoke('ssh:get-port-occupant', host, port),
  killPortOccupant: (pid: number) => ipcRenderer.invoke('ssh:kill-port-occupant', pid),

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
