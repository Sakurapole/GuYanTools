import { ipcMain } from 'electron';
import type { RetrySystemShortcutInput, ValidateSystemShortcutInput } from '@/contracts/shortcuts';
import { shortcutService } from './service';

let registered = false;

export function registerShortcutIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('shortcuts:inspect-system', async () => shortcutService.inspectSystemShortcuts());
  ipcMain.handle('shortcuts:validate-system', async (_event, input: ValidateSystemShortcutInput) =>
    shortcutService.validateSystemShortcut(input));
  ipcMain.handle('shortcuts:retry-system', async (_event, input: RetrySystemShortcutInput) =>
    shortcutService.retrySystemShortcut(input));

  registered = true;
}
