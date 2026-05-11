import { ipcMain } from 'electron';
import { multiDeviceClipboardService } from './service';
import {
  closeMultiDeviceClipboardWindow,
  openMultiDeviceClipboardDevTools,
  pasteMultiDeviceClipboardIntoActiveTarget,
  showMultiDeviceClipboardWindow,
  showMultiDeviceClipboardTextPreviewWindow,
} from './window';

let registered = false;

export function registerMultiDeviceClipboardIpcHandlers() {
  if (registered) return;

  ipcMain.handle('multi-device-clipboard:list-items', async () =>
    multiDeviceClipboardService.listItems());
  ipcMain.handle('multi-device-clipboard:apply-item', async (_event, itemId: string) => {
    await multiDeviceClipboardService.applyItem(itemId);
    await pasteMultiDeviceClipboardIntoActiveTarget();
  });
  ipcMain.handle('multi-device-clipboard:show-item-preview', async (_event, itemId: string) => {
    const item = await multiDeviceClipboardService.getItem(itemId);
    await showMultiDeviceClipboardTextPreviewWindow(item);
  });
  ipcMain.handle('multi-device-clipboard:delete-item', async (_event, itemId: string) =>
    multiDeviceClipboardService.deleteItem(itemId));
  ipcMain.handle('multi-device-clipboard:clear-history', async () =>
    multiDeviceClipboardService.clearHistory());
  ipcMain.handle('multi-device-clipboard:list-devices', async () =>
    multiDeviceClipboardService.listDevices());
  ipcMain.handle('multi-device-clipboard:list-device-statuses', async (_event, onlineWindowSeconds: number) =>
    multiDeviceClipboardService.listDeviceStatuses(onlineWindowSeconds));
  ipcMain.handle('multi-device-clipboard:list-discovered-devices', async () =>
    multiDeviceClipboardService.listDiscoveredDevices());
  ipcMain.handle('multi-device-clipboard:list-pairing-requests', async () =>
    multiDeviceClipboardService.listPairingRequests());
  ipcMain.handle('multi-device-clipboard:start-pairing', async (_event, deviceId: string) =>
    multiDeviceClipboardService.startPairing(deviceId));
  ipcMain.handle('multi-device-clipboard:start-pairing-by-address', async (_event, endpoint: string) =>
    multiDeviceClipboardService.startPairingByAddress(endpoint));
  ipcMain.handle('multi-device-clipboard:approve-pairing', async (_event, requestId: string) =>
    multiDeviceClipboardService.approvePairing(requestId));
  ipcMain.handle('multi-device-clipboard:reject-pairing', async (_event, requestId: string) =>
    multiDeviceClipboardService.rejectPairing(requestId));
  ipcMain.handle('multi-device-clipboard:forget-device', async (_event, deviceId: string) =>
    multiDeviceClipboardService.forgetDevice(deviceId));
  ipcMain.handle('multi-device-clipboard:show-window', async () => showMultiDeviceClipboardWindow());
  ipcMain.handle('multi-device-clipboard:close-window', async () => closeMultiDeviceClipboardWindow());
  ipcMain.handle('multi-device-clipboard:open-devtools', async () => openMultiDeviceClipboardDevTools());

  registered = true;
}
