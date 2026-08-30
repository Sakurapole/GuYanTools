import { BrowserWindow, ipcMain } from 'electron';
import type {
  SyncConflictResolution,
  SyncEvent,
  SyncServerLoginPayload,
  UpdateSyncServerConfigPayload,
  UpdateSyncWebDavConfigPayload,
} from '@/contracts/sync';
import { syncWorkerClient } from './sync_worker_client';

let registered = false;

export function registerSyncIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('sync:get-state', async () => syncWorkerClient.call('getState'));
  ipcMain.handle('sync:list-profiles', async () => syncWorkerClient.call('listProfiles'));
  ipcMain.handle('sync:list-conflicts', async () => syncWorkerClient.call('listConflicts'));
  ipcMain.handle('sync:list-pending-items', async () => syncWorkerClient.call('listPendingItems'));
  ipcMain.handle('sync:get-provider-config', async () => syncWorkerClient.call('getProviderConfig'));
  ipcMain.handle('sync:update-webdav-config', async (_event, payload: UpdateSyncWebDavConfigPayload) =>
    syncWorkerClient.call('updateWebDavConfig', payload));
  ipcMain.handle('sync:update-sync-server-config', async (_event, payload: UpdateSyncServerConfigPayload) =>
    syncWorkerClient.call('updateSyncServerConfig', payload));
  ipcMain.handle('sync:login-sync-server', async (_event, payload: SyncServerLoginPayload) =>
    syncWorkerClient.call('loginSyncServer', payload));
  ipcMain.handle('sync:logout-sync-server', async () => syncWorkerClient.call('logoutSyncServer'));
  ipcMain.handle('sync:test-connection', async () => syncWorkerClient.call('testConnection'));
  ipcMain.handle('sync:sync-now', async () => syncWorkerClient.call('syncNow'));
  ipcMain.handle('sync:apply-profile', async (_event, profileId: string) => syncWorkerClient.call('applyProfile', profileId));
  ipcMain.handle('sync:set-default-profile', async (_event, profileId: string) =>
    syncWorkerClient.call('setDefaultProfile', profileId));
  ipcMain.handle('sync:resolve-conflict', async (
    _event,
    conflictId: string,
    resolution: SyncConflictResolution,
  ) => syncWorkerClient.call('resolveConflict', conflictId, resolution));

  syncWorkerClient.subscribe((event) => broadcastSyncEvent(event));
  registered = true;
}

function broadcastSyncEvent(event: SyncEvent) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('sync:event', event);
    }
  }
}
