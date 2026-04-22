export interface FtpProfile {
  id: string;
  label: string;
  protocol: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  savePassword: boolean;
  privateKeyPath?: string;
  certificatePath?: string;
  hostCaKeyPath?: string;
  sshProfileId?: string;
  folderId?: string;
  sortOrder: number;
  defaultRemotePath: string;
  defaultLocalPath: string;
  maxConcurrent: number;
  createdAt: number;
  updatedAt: number;
}

export interface FtpSessionFolder {
  id: string;
  label: string;
  parentId?: string;
  sortOrder: number;
  createdAt: number;
}

export interface CreateFtpSessionFolderInput {
  label: string;
  parentId?: string;
}

export interface UpdateFtpSessionFolderInput {
  id: string;
  label?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface CreateFtpProfileInput {
  label: string;
  protocol: string;
  host?: string;
  port?: number;
  username?: string;
  authType?: string;
  savePassword?: boolean;
  password?: string;
  privateKeyPath?: string;
  certificatePath?: string;
  hostCaKeyPath?: string;
  privateKeyPassphrase?: string;
  sshProfileId?: string;
  folderId?: string;
  defaultRemotePath?: string;
  defaultLocalPath?: string;
  maxConcurrent?: number;
}

export interface UpdateFtpProfileInput extends Partial<CreateFtpProfileInput> {
  id: string;
  sortOrder?: number;
}

export interface ConnectFtpInput {
  profileId: string;
  password?: string;
  authSessionId?: string;
  challengeResponses?: string[];
}

export interface FtpAuthPrompt {
  prompt: string;
  echo: boolean;
}

export interface FtpAuthChallenge {
  authSessionId: string;
  profileId: string;
  profileLabel: string;
  username: string;
  name?: string;
  instructions?: string;
  prompts: FtpAuthPrompt[];
}

export interface FtpConnectionDescriptor {
  sessionId: string;
  profileId: string;
  profileLabel: string;
  protocol: string;
  host: string;
  port: number;
  username: string;
  status: string;
  remoteRoot: string;
  localRoot: string;
}

export interface FtpRestoreState {
  id: string;
  sessionId: string;
  tabOrder: number;
  remotePath: string;
  localPath: string;
  panelLayoutJson?: string;
  updatedAt: number;
}

export interface UpsertFtpRestoreStateInput {
  sessionId: string;
  tabOrder: number;
  remotePath: string;
  localPath: string;
  panelLayoutJson?: string;
}

export interface FileTransferEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt?: number;
  permissions?: string;
  owner?: string;
  source: 'local' | 'remote' | string;
}

export interface TransferTask {
  id: string;
  sessionId: string;
  profileId: string;
  retryCount: number;
  priority: 'high' | 'medium' | 'low' | string;
  direction: 'upload' | 'download' | string;
  localPath: string;
  remotePath: string;
  fileName: string;
  fileSize: number;
  transferredSize: number;
  progress: number;
  speedBytesPerSec: number;
  status: 'pending' | 'retrying' | 'transferring' | 'completed' | 'failed' | string;
  errorMessage?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface FtpRetryPolicy {
  maxRetries: number;
  baseDelaySecs: number;
}

export interface FtpWindowsContextMenuStatus {
  installed: boolean;
  command: string;
}

export interface FtpScheduledTask {
  id: string;
  label: string;
  profileId: string;
  direction: 'upload' | 'download';
  localPath: string;
  remotePath: string;
  scheduleType: 'once' | 'hourly' | 'daily' | 'weekly' | 'cron';
  conflictPolicy?: 'skip' | 'parallel';
  enabled: boolean;
  includeSubdirectories: boolean;
  onceAt?: number;
  intervalHours?: number;
  timeOfDay?: string;
  dayOfWeek?: number;
  cronExpression?: string;
  nextRunAt?: number;
  lastRunAt?: number;
  lastStatus?: 'idle' | 'running' | 'success' | 'failed';
  lastResult?: string;
  lastTaskId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertFtpScheduledTaskInput {
  id?: string;
  label: string;
  profileId: string;
  direction: 'upload' | 'download';
  localPath: string;
  remotePath: string;
  scheduleType: 'once' | 'hourly' | 'daily' | 'weekly' | 'cron';
  conflictPolicy?: 'skip' | 'parallel';
  enabled?: boolean;
  includeSubdirectories?: boolean;
  onceAt?: number;
  intervalHours?: number;
  timeOfDay?: string;
  dayOfWeek?: number;
  cronExpression?: string;
}

export interface FtpExternalEditorOptions {
  editorPath?: string;
  cleanupOnClose?: boolean;
}

export interface FtpEventEnvelope {
  eventType: 'sessionState' | 'taskState' | 'taskProgress' | string;
  session?: FtpConnectionDescriptor;
  task?: TransferTask;
  message?: string;
}

export interface FtpApi {
  listProfiles: () => Promise<FtpProfile[]>;
  listFolders: () => Promise<FtpSessionFolder[]>;
  createFolder: (input: CreateFtpSessionFolderInput) => Promise<FtpSessionFolder>;
  updateFolder: (input: UpdateFtpSessionFolderInput) => Promise<FtpSessionFolder>;
  deleteFolder: (id: string) => Promise<void>;
  createProfile: (input: CreateFtpProfileInput) => Promise<FtpProfile>;
  updateProfile: (input: UpdateFtpProfileInput) => Promise<FtpProfile>;
  deleteProfile: (id: string) => Promise<void>;

  listSessions: () => Promise<FtpConnectionDescriptor[]>;
  listRestoreStates: () => Promise<FtpRestoreState[]>;
  upsertRestoreState: (input: UpsertFtpRestoreStateInput) => Promise<FtpRestoreState>;
  deleteRestoreState: (sessionId: string) => Promise<void>;
  connect: (input: ConnectFtpInput) => Promise<FtpConnectionDescriptor>;
  cancelAuthChallenge: (authSessionId: string) => Promise<void>;
  disconnect: (sessionId: string) => Promise<void>;

  listRemoteDirectory: (sessionId: string, path: string) => Promise<FileTransferEntry[]>;
  computeRemoteFileSha256: (sessionId: string, path: string) => Promise<string | null>;
  loadRemoteImagePreview: (sessionId: string, path: string, maxBytes?: number) => Promise<string | null>;
  loadRemoteTextFile: (sessionId: string, path: string, maxBytes?: number) => Promise<string>;
  saveRemoteTextFile: (sessionId: string, path: string, content: string) => Promise<void>;
  exportRemotePathToLocal: (sessionId: string, remotePath: string, localPath: string) => Promise<void>;
  openExternalEditorDraft: (sessionId: string, path: string, options?: FtpExternalEditorOptions) => Promise<string>;
  createRemoteDir: (sessionId: string, path: string) => Promise<void>;
  renameRemotePath: (sessionId: string, oldPath: string, newPath: string) => Promise<void>;
  deleteRemotePath: (sessionId: string, path: string) => Promise<void>;
  chmodRemotePath: (sessionId: string, path: string, mode: string) => Promise<void>;

  listLocalDirectory: (path: string) => Promise<FileTransferEntry[]>;
  computeLocalFileSha256: (path: string) => Promise<string | null>;
  loadLocalImagePreview: (path: string, maxBytes?: number) => Promise<string | null>;
  createLocalDir: (path: string) => Promise<void>;
  renameLocalPath: (oldPath: string, newPath: string) => Promise<void>;
  deleteLocalPath: (path: string) => Promise<void>;
  copyLocalPath: (sourcePath: string, targetPath: string) => Promise<void>;
  getDefaultLocalPath: () => Promise<string>;

  uploadFile: (sessionId: string, localPath: string, remotePath: string) => Promise<TransferTask>;
  downloadFile: (sessionId: string, remotePath: string, localPath: string) => Promise<TransferTask>;
  fxpTransfer: (sourceSessionId: string, sourcePath: string, targetSessionId: string, targetPath: string) => Promise<TransferTask>;
  listTransferTasks: () => Promise<TransferTask[]>;
  getRetryPolicy: () => Promise<FtpRetryPolicy>;
  updateRetryPolicy: (input: FtpRetryPolicy) => Promise<FtpRetryPolicy>;
  deleteTransferTask: (taskId: string) => Promise<void>;
  updateTaskPriority: (taskId: string, priority: 'high' | 'medium' | 'low' | string) => Promise<TransferTask>;
  pauseTask: (taskId: string) => Promise<TransferTask>;
  resumeTask: (taskId: string) => Promise<TransferTask>;
  retryTask: (taskId: string) => Promise<TransferTask>;
  pauseAllTasks: () => Promise<TransferTask[]>;
  resumeAllTasks: () => Promise<TransferTask[]>;
  listScheduledTasks: () => Promise<FtpScheduledTask[]>;
  upsertScheduledTask: (input: UpsertFtpScheduledTaskInput) => Promise<FtpScheduledTask>;
  deleteScheduledTask: (taskId: string) => Promise<void>;
  runScheduledTaskNow: (taskId: string) => Promise<TransferTask>;
  getWindowsContextMenuStatus: () => Promise<FtpWindowsContextMenuStatus>;
  installWindowsContextMenu: () => Promise<FtpWindowsContextMenuStatus>;
  uninstallWindowsContextMenu: () => Promise<FtpWindowsContextMenuStatus>;
  getPendingExternalPaths: () => Promise<string[]>;
  clearPendingExternalPaths: (paths?: string[]) => Promise<void>;
  prepareRemoteDragExport: (sessionId: string, remotePaths: string[]) => Promise<string[]>;
  startPreparedDrag: (localPaths: string[]) => void;

  onEvent: (listener: (event: FtpEventEnvelope) => void) => () => void;
}

declare global {
  interface Window {
    ftpApi: FtpApi;
  }
}
