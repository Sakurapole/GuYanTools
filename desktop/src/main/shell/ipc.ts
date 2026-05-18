import { ipcMain, shell, dialog, clipboard } from 'electron';
import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import type { SaveFileOptions, SelectFileOptions } from '@/contracts/shell';

let registered = false;
const DEFAULT_TEXT_FILE_LIMIT_BYTES = 2_000_000;

export function registerShellIpcHandlers() {
  if (registered) return;

  ipcMain.handle('shell:open-path', async (_event, targetPath: string) => {
    return shell.openPath(targetPath);
  });

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('shell:list-local-roots', async () => {
    if (process.platform !== 'win32') {
      return ['/'];
    }

    const roots: string[] = [];
    for (let code = 65; code <= 90; code += 1) {
      const root = `${String.fromCharCode(code)}:\\`;
      if (existsSync(root)) {
        roots.push(root);
      }
    }
    return roots;
  });

  ipcMain.handle('shell:select-file', async (_event, options?: SelectFileOptions) => {
    const result = await dialog.showOpenDialog({
      title: options?.title ?? '选择文件',
      filters: options?.filters,
      defaultPath: options?.defaultPath,
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('shell:save-file', async (_event, options?: SaveFileOptions) => {
    const result = await dialog.showSaveDialog({
      title: options?.title ?? '保存文件',
      filters: options?.filters,
      defaultPath: options?.defaultPath,
      buttonLabel: options?.buttonLabel,
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  });

  ipcMain.handle('shell:select-directory', async (_event, title?: string) => {
    const result = await dialog.showOpenDialog({
      title: title ?? '选择目录',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('shell:clipboard-read-text', async () => clipboard.readText());

  ipcMain.handle('shell:read-text-file', async (_event, targetPath: string, maxBytes?: number) => {
    const limit = Math.max(1, maxBytes ?? DEFAULT_TEXT_FILE_LIMIT_BYTES);
    const fileStats = await stat(targetPath);
    if (fileStats.size > limit) {
      throw new Error(`文件超过 ${Math.round(limit / 1024)} KB，无法直接在内置编辑器中打开`);
    }
    return readFile(targetPath, 'utf8');
  });

  ipcMain.handle('shell:write-text-file', async (_event, targetPath: string, content: string) => {
    await writeFile(targetPath, content ?? '', 'utf8');
  });

  ipcMain.handle('shell:clipboard-write-text', async (_event, text: string) => {
    clipboard.writeText(text ?? '');
  });

  ipcMain.handle('shell:clipboard-read-paths', async () => {
    const formats = clipboard.availableFormats();
    if (formats.includes('FileNameW')) {
      const buffer = clipboard.readBuffer('FileNameW');
      const paths = buffer
        .toString('utf16le')
        .split('\u0000')
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => existsSync(item));
      if (paths.length) {
        return paths;
      }
    }

    const text = clipboard.readText();
    return text
      .split(/\r?\n/)
      .map((item) => item.trim().replace(/^"|"$/g, ''))
      .filter(Boolean)
      .filter((item) => existsSync(item));
  });

  registered = true;
}
