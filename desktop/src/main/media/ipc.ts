import { ipcMain } from 'electron';
import type { CompressImageOptions, CompressVideoOptions } from '@/contracts/media';
import * as mediaService from './service';

let registered = false;

export function registerMediaIpcHandlers() {
  if (registered) return;

  ipcMain.handle('media:check-ffmpeg', async () => {
    return mediaService.checkFfmpeg();
  });

  ipcMain.handle('media:compress-image', async (_event, dataUrl: string, options: CompressImageOptions) => {
    return mediaService.compressImage(dataUrl, options);
  });

  ipcMain.handle('media:compress-video', async (_event, filePath: string, options: CompressVideoOptions) => {
    return mediaService.compressVideo(filePath, options);
  });

  registered = true;
}
