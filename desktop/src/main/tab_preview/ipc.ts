import { ipcMain } from 'electron';

const THUMB_MAX_WIDTH = 360;
const JPEG_QUALITY = 55;

let registered = false;

/**
 * Tab 预览截图走 Electron capturePage，避免 renderer 侧 html2canvas
 * 遍历复杂首页 DOM（背景视频、base64 图、多 widget）导致主线程长时间卡死。
 */
export function registerTabPreviewIpcHandlers() {
  if (registered) return;
  registered = true;

  ipcMain.handle('tab-preview:capture-window', async (event) => {
    try {
      const image = await event.sender.capturePage();
      if (image.isEmpty()) {
        return null;
      }

      const { width, height } = image.getSize();
      if (width <= 0 || height <= 0) {
        return null;
      }

      const scale = Math.min(1, THUMB_MAX_WIDTH / width);
      const thumb = scale < 1
        ? image.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: 'good',
        })
        : image;

      return `data:image/jpeg;base64,${thumb.toJPEG(JPEG_QUALITY).toString('base64')}`;
    } catch (error) {
      console.warn('[tab-preview] captureWindow failed:', error);
      return null;
    }
  });
}
