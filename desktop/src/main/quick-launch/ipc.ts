import { ipcMain } from 'electron';
import type {
  QuickLaunchExecuteOptions,
  QuickLaunchRefreshInput,
  QuickLaunchResizeInput,
  QuickLaunchResult,
  QuickLaunchSearchInput,
} from '@/contracts/quick_launch';
import { quickLaunchService } from './service';
import { closeQuickLaunchWindow, notifyQuickLaunchRendererReady, showQuickLaunchWindow } from './window';

let registered = false;

export function registerQuickLaunchIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('quick-launch:search', async (_event, input: QuickLaunchSearchInput) =>
    quickLaunchService.search(input, (progress) => {
      _event.sender.send('quick-launch:search-progress', progress);
    }),
  );
  ipcMain.handle('quick-launch:execute', async (
    _event,
    result: QuickLaunchResult,
    options?: QuickLaunchExecuteOptions,
  ) => {
    await quickLaunchService.execute(result, options);
    if (options?.mode !== 'copy' && options?.mode !== 'copy-path') {
      closeQuickLaunchWindow();
    }
  });
  ipcMain.handle('quick-launch:refresh-index', async (_event, input?: QuickLaunchRefreshInput) =>
    quickLaunchService.refreshIndex(input),
  );
  ipcMain.handle('quick-launch:start-everything', async () =>
    quickLaunchService.startEverything(),
  );
  ipcMain.handle('quick-launch:set-game-mode', async (_event, enabled: boolean) =>
    quickLaunchService.setGameMode(Boolean(enabled)),
  );
  ipcMain.handle('quick-launch:get-game-mode-status', async () =>
    quickLaunchService.getGameModeStatus(),
  );
  ipcMain.handle('quick-launch:resize-window', async (_event, input: QuickLaunchResizeInput) => {
    quickLaunchService.resizeWindow(input);
  });
  ipcMain.handle('quick-launch:show', async () => {
    await showQuickLaunchWindow();
  });
  ipcMain.handle('quick-launch:close', async () => {
    closeQuickLaunchWindow();
  });
  ipcMain.handle('quick-launch:renderer-ready', async (event) => {
    notifyQuickLaunchRendererReady(event.sender.id);
  });

  registered = true;
}
