import { BrowserWindow, WebContents, nativeImage } from 'electron';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { watch as fsWatch, type FSWatcher } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as nativeCore from '@guyantools/core';
import { dbManager } from '../../core/database';
import type {
  ConnectFtpInput,
  CreateFtpSessionFolderInput,
  CreateFtpProfileInput,
  FileTransferEntry,
  FtpConnectionDescriptor,
  FtpExternalEditorOptions,
  FtpEventEnvelope,
  FtpProfile,
  FtpRetryPolicy,
  FtpRestoreState,
  FtpSessionFolder,
  TransferTask,
  UpsertFtpRestoreStateInput,
  UpdateFtpProfileInput,
  UpdateFtpSessionFolderInput,
} from '@/contracts/ftp';

type JsFtpHostConstructor = new (db: unknown) => {
  registerEventSink(callback: (payload: string) => void): void;
  listProfiles(): Promise<FtpProfile[]>;
  listFolders(): Promise<FtpSessionFolder[]>;
  createFolder(input: unknown): Promise<FtpSessionFolder>;
  updateFolder(input: unknown): Promise<FtpSessionFolder>;
  deleteFolder(id: string): Promise<void>;
  createProfile(input: unknown): Promise<FtpProfile>;
  updateProfile(input: unknown): Promise<FtpProfile>;
  deleteProfile(id: string): Promise<void>;
  listSessions(): FtpConnectionDescriptor[];
  listRestoreStates(): Promise<FtpRestoreState[]>;
  upsertRestoreState(input: unknown): Promise<FtpRestoreState>;
  deleteRestoreState(sessionId: string): Promise<void>;
  connect(input: unknown): Promise<FtpConnectionDescriptor>;
  cancelAuthChallenge(authSessionId: string): Promise<void>;
  disconnect(sessionId: string): Promise<void>;
  listRemoteDirectory(sessionId: string, path: string): Promise<FileTransferEntry[]>;
  computeRemoteFileSha256(sessionId: string, path: string): Promise<string | null>;
  loadRemoteImagePreview(sessionId: string, path: string, maxBytes?: number): Promise<string | null>;
  loadRemoteTextFile(sessionId: string, path: string, maxBytes?: number): Promise<string>;
  saveRemoteTextFile(sessionId: string, path: string, content: string): Promise<void>;
  exportRemotePathToLocal?(sessionId: string, remotePath: string, localPath: string): Promise<void>;
  openExternalEditorDraft?(sessionId: string, path: string): Promise<string>;
  createRemoteDir(sessionId: string, path: string): Promise<void>;
  renameRemotePath(sessionId: string, oldPath: string, newPath: string): Promise<void>;
  deleteRemotePath(sessionId: string, path: string): Promise<void>;
  chmodRemotePath(sessionId: string, path: string, mode: string): Promise<void>;
  listLocalDirectory(path: string): Promise<FileTransferEntry[]>;
  computeLocalFileSha256(path: string): Promise<string | null>;
  loadLocalImagePreview(path: string, maxBytes?: number): Promise<string | null>;
  createLocalDir(path: string): Promise<void>;
  renameLocalPath(oldPath: string, newPath: string): Promise<void>;
  deleteLocalPath(path: string): Promise<void>;
  copyLocalPath?(sourcePath: string, targetPath: string): Promise<void>;
  getDefaultLocalPath(): string;
  uploadFile(sessionId: string, localPath: string, remotePath: string): Promise<TransferTask>;
  downloadFile(sessionId: string, remotePath: string, localPath: string): Promise<TransferTask>;
  fxpTransfer(sourceSessionId: string, sourcePath: string, targetSessionId: string, targetPath: string): Promise<TransferTask>;
  listTransferTasks(): TransferTask[];
  getRetryPolicy(): FtpRetryPolicy;
  updateRetryPolicy(input: FtpRetryPolicy): FtpRetryPolicy;
  deleteTransferTask(taskId: string): Promise<void>;
  updateTaskPriority(taskId: string, priority: string): TransferTask;
  pauseTask(taskId: string): TransferTask;
  resumeTask(taskId: string): TransferTask;
  retryTask(taskId: string): Promise<TransferTask>;
  pauseAllTasks(): TransferTask[];
  resumeAllTasks(): TransferTask[];
};

const JsFtpHost = (nativeCore as unknown as { JsFtpHost: JsFtpHostConstructor }).JsFtpHost;
type JsFtpHostInstance = InstanceType<JsFtpHostConstructor>;

class FtpHost {
  private host!: JsFtpHostInstance;
  private readonly emitter = new EventEmitter();
  private initialized = false;
  private readonly externalDraftWatchers = new Map<string, { watcher: FSWatcher; timer: NodeJS.Timeout | null }>();
  private readonly dragExportRoots = new Set<string>();

  initialize() {
    if (this.initialized) return;
    const db = dbManager.getDatabase();
    this.host = new JsFtpHost(db);
    this.host.registerEventSink((payload: string) => {
      try {
        const event = JSON.parse(payload) as FtpEventEnvelope;
        this.emitter.emit('event', event);
        this.broadcast(event);
      } catch (error) {
        console.error('[FtpHost] Failed to parse event payload:', error);
      }
    });
    this.initialized = true;
  }

  async listProfiles() {
    return this.host.listProfiles();
  }

  async listFolders() {
    return this.host.listFolders();
  }

  async createFolder(input: CreateFtpSessionFolderInput) {
    return this.host.createFolder(input);
  }

  async updateFolder(input: UpdateFtpSessionFolderInput) {
    return this.host.updateFolder(input);
  }

  async deleteFolder(id: string) {
    return this.host.deleteFolder(id);
  }

  async createProfile(input: CreateFtpProfileInput) {
    return this.host.createProfile(input);
  }

  async updateProfile(input: UpdateFtpProfileInput) {
    return this.host.updateProfile(input);
  }

  async deleteProfile(id: string) {
    return this.host.deleteProfile(id);
  }

  listSessions() {
    return this.host.listSessions();
  }

  async listRestoreStates() {
    return this.host.listRestoreStates();
  }

  async upsertRestoreState(input: UpsertFtpRestoreStateInput) {
    return this.host.upsertRestoreState(input);
  }

  async deleteRestoreState(sessionId: string) {
    return this.host.deleteRestoreState(sessionId);
  }

  async connect(input: ConnectFtpInput) {
    return this.host.connect(input);
  }

  async cancelAuthChallenge(authSessionId: string) {
    return this.host.cancelAuthChallenge(authSessionId);
  }

  async disconnect(sessionId: string) {
    return this.host.disconnect(sessionId);
  }

  async listRemoteDirectory(sessionId: string, path: string) {
    return this.host.listRemoteDirectory(sessionId, path);
  }

  async computeRemoteFileSha256(sessionId: string, path: string) {
    return this.host.computeRemoteFileSha256(sessionId, path);
  }

  async loadRemoteImagePreview(sessionId: string, path: string, maxBytes?: number) {
    return this.host.loadRemoteImagePreview(sessionId, path, maxBytes);
  }

  async loadRemoteTextFile(sessionId: string, path: string, maxBytes?: number) {
    return this.host.loadRemoteTextFile(sessionId, path, maxBytes);
  }

  async saveRemoteTextFile(sessionId: string, path: string, content: string) {
    return this.host.saveRemoteTextFile(sessionId, path, content);
  }

  async exportRemotePathToLocal(sessionId: string, remotePath: string, localPath: string) {
    if (!this.host.exportRemotePathToLocal) {
      throw new Error('Current native FTP host does not support exportRemotePathToLocal');
    }
    return this.host.exportRemotePathToLocal(sessionId, remotePath, localPath);
  }

  async openExternalEditorDraft(sessionId: string, remotePath: string, options: FtpExternalEditorOptions = {}) {
    const content = await this.host.loadRemoteTextFile(sessionId, remotePath, 512_000);
    const tempDir = path.join(os.tmpdir(), 'guyantools-ftp-edits');
    await fs.mkdir(tempDir, { recursive: true });
    const fileName = sanitizeDraftFileName(path.basename(remotePath.replaceAll('/', path.sep)) || 'remote-file.txt');
    const tempPath = path.join(tempDir, `${Date.now()}-${fileName}`);
    await fs.writeFile(tempPath, content, 'utf8');
    this.registerExternalDraftWatcher(tempPath, sessionId, remotePath);
    const editorPath = options.editorPath?.trim();
    if (editorPath) {
      await fs.access(editorPath);
      this.launchExternalEditor(editorPath, tempPath, Boolean(options.cleanupOnClose));
    }
    return tempPath;
  }

  async createRemoteDir(sessionId: string, path: string) {
    return this.host.createRemoteDir(sessionId, path);
  }

  async renameRemotePath(sessionId: string, oldPath: string, newPath: string) {
    return this.host.renameRemotePath(sessionId, oldPath, newPath);
  }

  async deleteRemotePath(sessionId: string, path: string) {
    return this.host.deleteRemotePath(sessionId, path);
  }

  async chmodRemotePath(sessionId: string, path: string, mode: string) {
    return this.host.chmodRemotePath(sessionId, path, mode);
  }

  async listLocalDirectory(path: string) {
    return this.host.listLocalDirectory(path);
  }

  async computeLocalFileSha256(path: string) {
    return this.host.computeLocalFileSha256(path);
  }

  async loadLocalImagePreview(path: string, maxBytes?: number) {
    return this.host.loadLocalImagePreview(path, maxBytes);
  }

  async createLocalDir(path: string) {
    return this.host.createLocalDir(path);
  }

  async renameLocalPath(oldPath: string, newPath: string) {
    return this.host.renameLocalPath(oldPath, newPath);
  }

  async deleteLocalPath(path: string) {
    return this.host.deleteLocalPath(path);
  }

  async copyLocalPath(sourcePath: string, targetPath: string) {
    if (!this.host.copyLocalPath) {
      throw new Error('Current native FTP host does not support copyLocalPath');
    }
    return this.host.copyLocalPath(sourcePath, targetPath);
  }

  async getDefaultLocalPath() {
    return this.host.getDefaultLocalPath();
  }

  async uploadFile(sessionId: string, localPath: string, remotePath: string) {
    return this.host.uploadFile(sessionId, localPath, remotePath);
  }

  async downloadFile(sessionId: string, remotePath: string, localPath: string) {
    return this.host.downloadFile(sessionId, remotePath, localPath);
  }

  async fxpTransfer(sourceSessionId: string, sourcePath: string, targetSessionId: string, targetPath: string) {
    return this.host.fxpTransfer(sourceSessionId, sourcePath, targetSessionId, targetPath);
  }

  async prepareRemoteDragExport(sessionId: string, remotePaths: string[]) {
    if (!remotePaths.length) {
      return [] as string[];
    }
    await this.cleanupStaleDragExports();
    const exportRoot = path.join(os.tmpdir(), 'guyantools-ftp-drag', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(exportRoot, { recursive: true });
    this.dragExportRoots.add(exportRoot);
    const usedNames = new Set<string>();
    const exportedPaths: string[] = [];
    for (const remotePath of remotePaths) {
      const baseName = sanitizeDraftFileName(path.basename(remotePath.replaceAll('/', path.sep)) || 'remote-item');
      const localName = uniqueLocalName(baseName, usedNames);
      const targetPath = path.join(exportRoot, localName);
      await this.exportRemotePathToLocal(sessionId, remotePath, targetPath);
      exportedPaths.push(targetPath);
    }
    return exportedPaths;
  }

  startPreparedDrag(sender: WebContents, localPaths: string[]) {
    const existingPaths = localPaths.filter(Boolean);
    if (!existingPaths.length) {
      return;
    }
    const iconPath = path.join(process.cwd(), 'src', 'assets', 'icons', 'icon_64.png');
    const icon = nativeImage.createFromPath(iconPath);
    sender.startDrag({
      file: existingPaths[0],
      files: existingPaths,
      icon: icon.isEmpty() ? nativeImage.createEmpty() : icon,
    });
  }

  async listTransferTasks() {
    return this.host.listTransferTasks();
  }

  async getRetryPolicy() {
    return this.host.getRetryPolicy();
  }

  async updateRetryPolicy(input: FtpRetryPolicy) {
    return this.host.updateRetryPolicy(input);
  }

  async deleteTransferTask(taskId: string) {
    return this.host.deleteTransferTask(taskId);
  }

  async updateTaskPriority(taskId: string, priority: string) {
    return this.host.updateTaskPriority(taskId, priority);
  }

  async pauseTask(taskId: string) {
    return this.host.pauseTask(taskId);
  }

  async resumeTask(taskId: string) {
    return this.host.resumeTask(taskId);
  }

  async retryTask(taskId: string) {
    return this.host.retryTask(taskId);
  }

  async pauseAllTasks() {
    return this.host.pauseAllTasks();
  }

  async resumeAllTasks() {
    return this.host.resumeAllTasks();
  }

  onEvent(listener: (event: FtpEventEnvelope) => void) {
    this.emitter.on('event', listener);
    return () => {
      this.emitter.off('event', listener);
    };
  }

  private broadcast(event: FtpEventEnvelope) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('ftp:event', event);
      }
    }
  }

  private registerExternalDraftWatcher(tempPath: string, sessionId: string, remotePath: string) {
    this.externalDraftWatchers.get(tempPath)?.watcher.close();
    const state = { watcher: fsWatch(tempPath, () => {
      if (state.timer) {
        clearTimeout(state.timer);
      }
      state.timer = setTimeout(async () => {
        try {
          const content = await fs.readFile(tempPath, 'utf8');
          await this.host.saveRemoteTextFile(sessionId, remotePath, content);
        } catch (error) {
          console.error('[FtpHost] External editor draft sync failed:', error);
        }
      }, 500);
    }), timer: null as NodeJS.Timeout | null };
    this.externalDraftWatchers.set(tempPath, state);
  }

  private launchExternalEditor(editorPath: string, tempPath: string, cleanupOnClose: boolean) {
    const needsShell = /\.(cmd|bat)$/i.test(editorPath);
    const child = spawn(editorPath, [tempPath], {
      shell: needsShell,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (error) => {
      console.error('[FtpHost] Failed to launch external editor:', error);
    });
    if (cleanupOnClose) {
      child.on('exit', () => {
        void this.disposeExternalDraft(tempPath, true);
      });
    }
    child.unref();
  }

  private async disposeExternalDraft(tempPath: string, removeFile: boolean) {
    const draft = this.externalDraftWatchers.get(tempPath);
    if (draft) {
      if (draft.timer) {
        clearTimeout(draft.timer);
      }
      draft.watcher.close();
      this.externalDraftWatchers.delete(tempPath);
    }
    if (removeFile) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore missing draft files during cleanup.
      }
    }
  }

  private async cleanupStaleDragExports() {
    const root = path.join(os.tmpdir(), 'guyantools-ftp-drag');
    let entries: string[] = [];
    try {
      entries = await fs.readdir(root);
    } catch {
      return;
    }
    const expireBefore = Date.now() - 24 * 60 * 60 * 1000;
    for (const entry of entries) {
      const fullPath = path.join(root, entry);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.mtimeMs < expireBefore && !this.dragExportRoots.has(fullPath)) {
          await fs.rm(fullPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore stale cleanup failures.
      }
    }
  }
}

export const ftpHost = new FtpHost();

function sanitizeDraftFileName(fileName: string) {
  const reservedChars = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
  return [...fileName]
    .map((char) => (reservedChars.has(char) || char.charCodeAt(0) < 32 ? '_' : char))
    .join('');
}

function uniqueLocalName(baseName: string, usedNames: Set<string>) {
  const ext = path.extname(baseName);
  const stem = ext ? baseName.slice(0, -ext.length) : baseName;
  let candidate = baseName;
  let index = 1;
  while (usedNames.has(candidate)) {
    candidate = `${stem}-${index}${ext}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}
