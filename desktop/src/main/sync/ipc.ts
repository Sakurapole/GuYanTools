import { BrowserWindow, ipcMain } from 'electron';
import type {
  SyncConflictResolution,
  SyncEvent,
  SyncServerLoginPayload,
  UpdateSyncServerConfigPayload,
  UpdateSyncWebDavConfigPayload,
} from '@/contracts/sync';
import { syncService } from './sync_service';

let registered = false;

export function registerSyncIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('sync:get-state', async () => syncService.getState());
  ipcMain.handle('sync:list-profiles', async () => syncService.listProfiles());
  ipcMain.handle('sync:list-conflicts', async () => syncService.listConflicts());
  ipcMain.handle('sync:list-pending-items', async () => syncService.listPendingItems());
  ipcMain.handle('sync:get-provider-config', async () => syncService.getProviderConfig());
  ipcMain.handle('sync:update-webdav-config', async (_event, payload: UpdateSyncWebDavConfigPayload) =>
    syncService.updateWebDavConfig(payload));
  ipcMain.handle('sync:update-sync-server-config', async (_event, payload: UpdateSyncServerConfigPayload) =>
    syncService.updateSyncServerConfig(payload));
  ipcMain.handle('sync:login-sync-server', async (_event, payload: SyncServerLoginPayload) =>
    syncService.loginSyncServer(payload));
  ipcMain.handle('sync:logout-sync-server', async () => syncService.logoutSyncServer());
  ipcMain.handle('sync:test-connection', async () => syncService.testConnection());
  ipcMain.handle('sync:sync-now', async () => syncService.syncNow());
  ipcMain.handle('sync:apply-profile', async (_event, profileId: string) => syncService.applyProfile(profileId));
  ipcMain.handle('sync:set-default-profile', async (_event, profileId: string) =>
    syncService.setDefaultProfile(profileId));
  ipcMain.handle('sync:resolve-conflict', async (
    _event,
    conflictId: string,
    resolution: SyncConflictResolution,
  ) => syncService.resolveConflict(conflictId, resolution));

  syncService.subscribe((event) => broadcastSyncEvent(event));
  registered = true;
}

function broadcastSyncEvent(event: SyncEvent) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('sync:event', event);
    }
  }
}
