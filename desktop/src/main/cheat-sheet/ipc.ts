import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { CheatSheetBank } from './bank';
import { CheatSheetWindow } from './window';
import type { CheatSheetSettingsPatch, SaveCheatSheetQuestion, CheatSheetCommand } from '@/contracts/cheat_sheet';
import { renderMarkdownPreviewHtml } from '@/windows/main/pages/Knowledge/utils/markdown_enhanced_render';

const bank = new CheatSheetBank(path.join(app.getPath('userData'), 'cheat_sheet_bank.json'));
export const cheatSheetWindow = new CheatSheetWindow(bank);
let registered = false;
function assertSender(event: Electron.IpcMainInvokeEvent) {
  if (BrowserWindow.fromWebContents(event.sender) !== cheatSheetWindow.getWindow()) throw new Error('小抄窗口调用方无效。');
}
export function registerCheatSheetIpcHandlers() {
  if (registered) return;
  ipcMain.handle('cheat-sheet:open', () => cheatSheetWindow.open());
  ipcMain.handle('cheat-sheet:get-state', async (event) => { assertSender(event); const doc = await bank.load(); return { questions: doc.questions.map(({ markdown: _markdown, ...summary }) => summary), settings: doc.settings, protected: cheatSheetWindow.getWindow()?.isContentProtected() ?? false, shortcutStatus: [] }; });
  ipcMain.handle('cheat-sheet:get-question', async (event, id: string) => { assertSender(event); if (typeof id !== 'string' || id.length > 100) throw new Error('题目 ID 无效。'); const question = (await bank.load()).questions.find((item) => item.id === id); return question ? { ...question, html: renderMarkdownPreviewHtml(question.markdown.replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')) } : null; });
  ipcMain.handle('cheat-sheet:save-question', async (event, input: SaveCheatSheetQuestion) => { assertSender(event); return bank.saveQuestion(input); });
  ipcMain.handle('cheat-sheet:delete-question', async (event, id: string) => { assertSender(event); if (typeof id !== 'string' || id.length > 100) throw new Error('题目 ID 无效。'); return bank.deleteQuestion(id); });
  ipcMain.handle('cheat-sheet:import-markdown', async (event) => { assertSender(event); const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] }); if (result.canceled) return 0; return bank.importMarkdown(await Promise.all(result.filePaths.map(async (filePath) => ({ name: path.basename(filePath), markdown: await readFile(filePath, 'utf8') })))); });
  ipcMain.handle('cheat-sheet:export-markdown', async (event, id: string) => { assertSender(event); const question = (await bank.load()).questions.find((item) => item.id === id); if (!question) throw new Error('题目不存在。'); const result = await dialog.showSaveDialog({ defaultPath: `${question.title.replace(/[<>:"/\\|?*]/g, '_')}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] }); if (result.canceled || !result.filePath) return false; await writeFile(result.filePath, question.markdown, 'utf8'); return true; });
  ipcMain.handle('cheat-sheet:update-settings', async (event, patch: CheatSheetSettingsPatch) => { assertSender(event); const settings = await bank.updateSettings(patch); const win = cheatSheetWindow.getWindow(); if (win && !win.isDestroyed()) { win.setOpacity(1); win.setAlwaysOnTop(settings.alwaysOnTop); win.webContents.send('cheat-sheet:state-changed'); } return bank.load(); });
  ipcMain.handle('cheat-sheet:command', async (event, command: CheatSheetCommand) => { assertSender(event); return cheatSheetWindow.execute(command); });
  ipcMain.handle('cheat-sheet:set-dirty', (event, dirty: boolean) => { assertSender(event); cheatSheetWindow.setDirty(Boolean(dirty)); });
  ipcMain.handle('cheat-sheet:ready', (event) => { assertSender(event); cheatSheetWindow.ready(); });
  registered = true;
}
