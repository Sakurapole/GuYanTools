import { ipcMain } from 'electron';
import { ftpHost } from './host';
import {
  clearPendingExternalPaths,
  getPendingExternalPaths,
  getWindowsContextMenuStatus,
  installWindowsContextMenu,
  uninstallWindowsContextMenu,
} from './integration';
import { ftpSchedulerService } from './scheduler';
import type {
  ConnectFtpInput,
  CreateFtpProfileInput,
  CreateFtpSessionFolderInput,
  FtpExternalEditorOptions,
  FtpRetryPolicy,
  FtpTransferOptions,
  UpsertFtpScheduledTaskInput,
  UpdateFtpProfileInput,
  UpdateFtpSessionFolderInput,
} from '@/contracts/ftp';

let registered = false;

export function registerFtpIpcHandlers() {
  if (registered) return;

  ipcMain.handle('ftp:list-profiles', async () => ftpHost.listProfiles());
  ipcMain.handle('ftp:list-folders', async () => ftpHost.listFolders());
  ipcMain.handle('ftp:create-folder', async (_event, input: CreateFtpSessionFolderInput) => ftpHost.createFolder(input));
  ipcMain.handle('ftp:update-folder', async (_event, input: UpdateFtpSessionFolderInput) => ftpHost.updateFolder(input));
  ipcMain.handle('ftp:delete-folder', async (_event, id: string) => ftpHost.deleteFolder(id));
  ipcMain.handle('ftp:create-profile', async (_event, input: CreateFtpProfileInput) => ftpHost.createProfile(input));
  ipcMain.handle('ftp:update-profile', async (_event, input: UpdateFtpProfileInput) => ftpHost.updateProfile(input));
  ipcMain.handle('ftp:delete-profile', async (_event, id: string) => ftpHost.deleteProfile(id));

  ipcMain.handle('ftp:list-sessions', async () => ftpHost.listSessions());
  ipcMain.handle('ftp:list-restore-states', async () => ftpHost.listRestoreStates());
  ipcMain.handle('ftp:upsert-restore-state', async (_event, input) => ftpHost.upsertRestoreState(input));
  ipcMain.handle('ftp:delete-restore-state', async (_event, sessionId: string) => ftpHost.deleteRestoreState(sessionId));
  ipcMain.handle('ftp:connect', async (_event, input: ConnectFtpInput) => ftpHost.connect(input));
  ipcMain.handle('ftp:cancel-auth-challenge', async (_event, authSessionId: string) => ftpHost.cancelAuthChallenge(authSessionId));
  ipcMain.handle('ftp:disconnect', async (_event, sessionId: string) => ftpHost.disconnect(sessionId));

  ipcMain.handle('ftp:list-remote-directory', async (_event, sessionId: string, path: string) =>
    ftpHost.listRemoteDirectory(sessionId, path),
  );
  ipcMain.handle('ftp:compute-remote-file-sha256', async (_event, sessionId: string, path: string) =>
    ftpHost.computeRemoteFileSha256(sessionId, path),
  );
  ipcMain.handle('ftp:load-remote-image-preview', async (_event, sessionId: string, path: string, maxBytes?: number) =>
    ftpHost.loadRemoteImagePreview(sessionId, path, maxBytes),
  );
  ipcMain.handle('ftp:load-remote-text-file', async (_event, sessionId: string, path: string, maxBytes?: number) =>
    ftpHost.loadRemoteTextFile(sessionId, path, maxBytes),
  );
  ipcMain.handle('ftp:save-remote-text-file', async (_event, sessionId: string, path: string, content: string) =>
    ftpHost.saveRemoteTextFile(sessionId, path, content),
  );
  ipcMain.handle('ftp:export-remote-path-to-local', async (_event, sessionId: string, remotePath: string, localPath: string) =>
    ftpHost.exportRemotePathToLocal(sessionId, remotePath, localPath),
  );
  ipcMain.handle('ftp:open-external-editor-draft', async (_event, sessionId: string, path: string, options?: FtpExternalEditorOptions) =>
    ftpHost.openExternalEditorDraft(sessionId, path, options),
  );
  ipcMain.handle('ftp:create-remote-dir', async (_event, sessionId: string, path: string) =>
    ftpHost.createRemoteDir(sessionId, path),
  );
  ipcMain.handle('ftp:rename-remote-path', async (_event, sessionId: string, oldPath: string, newPath: string) =>
    ftpHost.renameRemotePath(sessionId, oldPath, newPath),
  );
  ipcMain.handle('ftp:delete-remote-path', async (_event, sessionId: string, path: string) =>
    ftpHost.deleteRemotePath(sessionId, path),
  );
  ipcMain.handle('ftp:chmod-remote-path', async (_event, sessionId: string, path: string, mode: string) =>
    ftpHost.chmodRemotePath(sessionId, path, mode),
  );

  ipcMain.handle('ftp:list-local-directory', async (_event, path: string) => ftpHost.listLocalDirectory(path));
  ipcMain.handle('ftp:compute-local-file-sha256', async (_event, path: string) =>
    ftpHost.computeLocalFileSha256(path),
  );
  ipcMain.handle('ftp:load-local-image-preview', async (_event, path: string, maxBytes?: number) =>
    ftpHost.loadLocalImagePreview(path, maxBytes),
  );
  ipcMain.handle('ftp:create-local-dir', async (_event, path: string) => ftpHost.createLocalDir(path));
  ipcMain.handle('ftp:rename-local-path', async (_event, oldPath: string, newPath: string) =>
    ftpHost.renameLocalPath(oldPath, newPath),
  );
  ipcMain.handle('ftp:delete-local-path', async (_event, path: string) => ftpHost.deleteLocalPath(path));
  ipcMain.handle('ftp:copy-local-path', async (_event, sourcePath: string, targetPath: string) =>
    ftpHost.copyLocalPath(sourcePath, targetPath),
  );
  ipcMain.handle('ftp:get-default-local-path', async () => ftpHost.getDefaultLocalPath());

  ipcMain.handle('ftp:upload-file', async (_event, sessionId: string, localPath: string, remotePath: string, options?: FtpTransferOptions) =>
    ftpHost.uploadFile(sessionId, localPath, remotePath, options),
  );
  ipcMain.handle('ftp:download-file', async (_event, sessionId: string, remotePath: string, localPath: string, options?: FtpTransferOptions) =>
    ftpHost.downloadFile(sessionId, remotePath, localPath, options),
  );
  ipcMain.handle('ftp:fxp-transfer', async (_event, sourceSessionId: string, sourcePath: string, targetSessionId: string, targetPath: string) =>
    ftpHost.fxpTransfer(sourceSessionId, sourcePath, targetSessionId, targetPath),
  );
  ipcMain.handle('ftp:list-transfer-tasks', async () => ftpHost.listTransferTasks());
  ipcMain.handle('ftp:get-retry-policy', async () => ftpHost.getRetryPolicy());
  ipcMain.handle('ftp:update-retry-policy', async (_event, input: FtpRetryPolicy) => ftpHost.updateRetryPolicy(input));
  ipcMain.handle('ftp:delete-transfer-task', async (_event, taskId: string) => ftpHost.deleteTransferTask(taskId));
  ipcMain.handle('ftp:update-task-priority', async (_event, taskId: string, priority: string) =>
    ftpHost.updateTaskPriority(taskId, priority),
  );
  ipcMain.handle('ftp:pause-task', async (_event, taskId: string) => ftpHost.pauseTask(taskId));
  ipcMain.handle('ftp:resume-task', async (_event, taskId: string) => ftpHost.resumeTask(taskId));
  ipcMain.handle('ftp:retry-task', async (_event, taskId: string) => ftpHost.retryTask(taskId));
  ipcMain.handle('ftp:pause-all-tasks', async () => ftpHost.pauseAllTasks());
  ipcMain.handle('ftp:resume-all-tasks', async () => ftpHost.resumeAllTasks());
  ipcMain.handle('ftp:list-scheduled-tasks', async () => ftpSchedulerService.listTasks());
  ipcMain.handle('ftp:upsert-scheduled-task', async (_event, input: UpsertFtpScheduledTaskInput) =>
    ftpSchedulerService.upsertTask(input),
  );
  ipcMain.handle('ftp:delete-scheduled-task', async (_event, taskId: string) =>
    ftpSchedulerService.deleteTask(taskId),
  );
  ipcMain.handle('ftp:run-scheduled-task-now', async (_event, taskId: string) =>
    ftpSchedulerService.runTaskNow(taskId),
  );
  ipcMain.handle('ftp:get-windows-context-menu-status', async () => getWindowsContextMenuStatus());
  ipcMain.handle('ftp:install-windows-context-menu', async () => {
    await installWindowsContextMenu();
    return getWindowsContextMenuStatus();
  });
  ipcMain.handle('ftp:uninstall-windows-context-menu', async () => {
    await uninstallWindowsContextMenu();
    return getWindowsContextMenuStatus();
  });
  ipcMain.handle('ftp:get-pending-external-paths', async () => getPendingExternalPaths());
  ipcMain.handle('ftp:clear-pending-external-paths', async (_event, paths?: string[]) => clearPendingExternalPaths(paths));
  ipcMain.handle('ftp:prepare-remote-drag-export', async (_event, sessionId: string, remotePaths: string[]) =>
    ftpHost.prepareRemoteDragExport(sessionId, remotePaths),
  );
  ipcMain.on('ftp:start-prepared-drag', (event, localPaths: string[]) => {
    ftpHost.startPreparedDrag(event.sender, localPaths);
  });

  registered = true;
}
