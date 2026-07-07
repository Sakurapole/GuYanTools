import { BrowserWindow, ipcMain } from 'electron';
import type {
  WorkspaceDetachedOpenOptions,
  WorkspaceWindowKey,
  WorkspaceWindowPageState,
} from '@/contracts/workspace_window';
import { workspaceWindowManager } from './manager';

let registered = false;

function assertWorkspaceWindowKey(key: WorkspaceWindowKey) {
  if (!workspaceWindowManager.isValidKey(key)) {
    throw new Error(`未知独立窗口页面: ${String(key)}`);
  }
}

export function registerWorkspaceWindowIpcHandlers() {
  if (registered) return;

  ipcMain.handle('workspace-window:open-detached', async (_event, key: WorkspaceWindowKey, options?: WorkspaceDetachedOpenOptions) => {
    assertWorkspaceWindowKey(key);
    return workspaceWindowManager.openDetached(key, options);
  });

  ipcMain.handle('workspace-window:return-to-main', async (_event, key: WorkspaceWindowKey) => {
    assertWorkspaceWindowKey(key);
    return workspaceWindowManager.returnToMain(key);
  });

  ipcMain.handle('workspace-window:get-state', async () => workspaceWindowManager.getState());

  ipcMain.handle('workspace-window:get-context', async (event) =>
    workspaceWindowManager.getContext(BrowserWindow.fromWebContents(event.sender)));

  ipcMain.handle('workspace-window:get-page-state', async (_event, key: WorkspaceWindowKey) => {
    assertWorkspaceWindowKey(key);
    return workspaceWindowManager.getPageState(key);
  });

  ipcMain.handle('workspace-window:set-page-state', async (_event, key: WorkspaceWindowKey, state: WorkspaceWindowPageState) => {
    assertWorkspaceWindowKey(key);
    workspaceWindowManager.setPageState(key, state);
  });

  registered = true;
}
