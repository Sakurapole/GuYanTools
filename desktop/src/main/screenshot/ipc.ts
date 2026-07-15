import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, clipboard, desktopCapturer, dialog, ipcMain, nativeImage, screen } from 'electron';
import type {
  ScreenshotCaptureImage,
  ScreenshotCaptureRequest,
  ScreenshotRecognitionOptions,
  ScreenshotRecognitionResult,
} from '@/contracts/screenshot';
import type { AiChatAttachment } from '@/contracts/ai';
import type { CreateKnowledgeAssetPayload, KnowledgeAsset } from '@/contracts/knowledge';
import { dbManager } from '@/core/database';
import { captureScreenshotRegion, captureRegionFromPreloaded } from './capture';
import { recognizeScreenshotUiBlocksNative } from './native_recognition';
import { closeScreenshotWindow, isScreenshotWindow, registerScreenshotWindowEvents, showScreenshotWindow } from './window';
import { detectVisibleWindows } from './window_detection';

let registered = false;

export function registerScreenshotIpcHandlers() {
  if (registered) return;
  registered = true;

  registerScreenshotWindowEvents();

  ipcMain.handle('screenshot:start-capture', async (_event, input?: ScreenshotCaptureRequest) =>
    showScreenshotWindow(input ?? { mode: 'region', recognize: true }));

  ipcMain.handle('screenshot:capture-region', async (event, region, displayId: number) => {
    // 优先使用预截取缓存，避免隐藏窗口→等待→desktopCapturer→恢复窗口的链路延迟
    try {
      return captureRegionFromPreloaded(region, displayId);
    } catch {
      // 预截取不可用时回退到原始方式
      return captureRegionWithoutOverlay(region, displayId, BrowserWindow.fromWebContents(event.sender));
    }
  });

  ipcMain.handle('screenshot:recognize-image', async (_event, image: ScreenshotCaptureImage, options?: ScreenshotRecognitionOptions) =>
    recognizeImage(image, options));

  ipcMain.handle('screenshot-overlay:complete', async (event, result: ScreenshotRecognitionResult) => {
    closeScreenshotWindow();
    broadcastCaptureResult(result, BrowserWindow.fromWebContents(event.sender));
  });

  ipcMain.handle('screenshot:save-to-knowledge', async (_event, result: ScreenshotRecognitionResult) =>
    saveCaptureToKnowledge(result));

  ipcMain.handle('screenshot:create-ai-attachment', async (_event, result: ScreenshotRecognitionResult): Promise<AiChatAttachment> => ({
    id: randomUUID(),
    kind: 'image',
    source: 'clipboard',
    name: `screenshot-${result.image.capturedAt.replace(/[:.]/g, '-')}.png`,
    mimeType: 'image/png',
    size: result.image.byteSize,
    data: result.image.pngBase64,
    metadata: {
      screenshotRecognition: {
        region: result.image.region,
        blocks: result.blocks,
        elapsedMs: result.elapsedMs,
      },
    },
  }));

  registerScreenshotOutputHandlers();
}

async function recognizeImage(
  image: ScreenshotCaptureImage,
  options?: ScreenshotRecognitionOptions,
): Promise<ScreenshotRecognitionResult> {
  const startedAt = Date.now();
  const pngBytes = Buffer.from(image.pngBase64, 'base64');
  const blocks = await recognizeScreenshotUiBlocksNative(pngBytes, options);
  return {
    image,
    blocks,
    elapsedMs: Date.now() - startedAt,
    warnings: [],
  };
}

async function captureRegionWithoutOverlay(
  region: ScreenshotCaptureImage['region'],
  displayId: number,
  sourceWindow: BrowserWindow | null,
) {
  const shouldRestoreWindow = Boolean(isScreenshotWindow(sourceWindow) && sourceWindow?.isVisible());
  if (sourceWindow && shouldRestoreWindow) {
    sourceWindow.hide();
    await waitForWindowCompositor();
  }

  try {
    return await captureScreenshotRegion(region, displayId);
  } finally {
    if (sourceWindow && shouldRestoreWindow && !sourceWindow.isDestroyed()) {
      sourceWindow.show();
      sourceWindow.focus();
    }
  }
}

function waitForWindowCompositor() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 80);
  });
}

async function saveCaptureToKnowledge(result: ScreenshotRecognitionResult) {
  const database = dbManager.getDatabase() as unknown as {
    createKnowledgeAsset: (input: CreateKnowledgeAssetPayload) => Promise<KnowledgeAsset>;
  };
  const bytes = Buffer.from(result.image.pngBase64, 'base64');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const originalName = `screenshot-${result.image.capturedAt.replace(/[:.]/g, '-')}.png`;
  const storagePath = await writeScreenshotKnowledgeAsset(hash, bytes);
  const asset = await database.createKnowledgeAsset({
    hash,
    originalName,
    mimeType: 'image/png',
    extension: '.png',
    sizeBytes: bytes.length,
    storagePath,
    extractedText: '',
    metadataJson: JSON.stringify({
      screenshotRecognition: {
        region: result.image.region,
        blocks: result.blocks,
        elapsedMs: result.elapsedMs,
      },
    }),
    importStatus: 'ready',
  });
  return { assetId: asset.id };
}

async function writeScreenshotKnowledgeAsset(hash: string, bytes: Buffer) {
  const assetDir = path.join(app.getPath('userData'), 'knowledge-assets', 'screenshots', hash.slice(0, 2));
  await fs.mkdir(assetDir, { recursive: true });
  const storagePath = path.join(assetDir, `${hash}.png`);
  try {
    await fs.writeFile(storagePath, bytes, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
  return storagePath;
}

function broadcastCaptureResult(result: ScreenshotRecognitionResult, sourceWindow: BrowserWindow | null) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win === sourceWindow) continue;
    win.webContents.send('screenshot:capture-result', result);
  }
}

// ── Phase 1: 剪贴板写入 + 文件保存 + 窗口检测 ──────────────

function registerScreenshotOutputHandlers() {
  ipcMain.handle('screenshot:save-to-clipboard', async (_event, pngBase64: string) => {
    const buffer = Buffer.from(pngBase64, 'base64');
    const img = nativeImage.createFromBuffer(buffer);
    if (img.isEmpty()) {
      throw new Error('截图图像解码失败');
    }
    clipboard.writeImage(img);
  });

  ipcMain.handle(
    'screenshot:save-to-file',
    async (_event, pngBase64: string, defaultName?: string) => {
      const result = await dialog.showSaveDialog({
        defaultPath: defaultName ?? `screenshot-${Date.now()}.png`,
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      });
      if (result.canceled || !result.filePath) return null;
      const buffer = Buffer.from(pngBase64, 'base64');
      await fs.writeFile(result.filePath, buffer);
      return { filePath: result.filePath };
    },
  );

  ipcMain.handle('screenshot:detect-windows', async () => detectVisibleWindows());

  // ── OCR 短期方案：从现有识别结果中提取文字 ────
  ipcMain.handle('screenshot:ocr', async (_event, pngBase64: string) => {
    const startedAt = Date.now();
    const pngBytes = Buffer.from(pngBase64, 'base64');

    // 使用现有的 UI 块识别能力提取文字
    let blocks: import('@/contracts/screenshot').ScreenshotOcrBlock[] = [];
    let fullText = '';
    try {
      const recognitionResult = await recognizeScreenshotUiBlocksNative(pngBytes, {
        minBlockWidth: 8,
        minBlockHeight: 8,
        mergeGap: 4,
        maxBlocks: 200,
      });
      blocks = recognitionResult
        .filter((block) => block.text && block.text.trim())
        .map((block) => ({
          text: block.text ?? '',
          confidence: block.textConfidence ?? block.confidence,
          rect: block.rect,
        }));
      fullText = blocks.map((b) => b.text).join('\n');
    } catch {
      // 识别失败时返回空结果
    }

    return {
      text: fullText,
      blocks,
      elapsedMs: Date.now() - startedAt,
      engine: 'local-heuristic' as const,
    };
  });

  // ── 取色器 ───────────────────────────────────
  ipcMain.handle(
    'screenshot:pick-color',
    async (_event, x: number, y: number, displayId: number) => {
      const display = screen.getAllDisplays().find((item) => item.id === displayId)
        ?? screen.getDisplayNearestPoint({ x, y });
      const scaleFactor = display.scaleFactor || 1;

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.ceil(display.bounds.width * scaleFactor),
          height: Math.ceil(display.bounds.height * scaleFactor),
        },
      });

      const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
      if (!source) {
        throw new Error('无法获取屏幕源');
      }

      const bitmap = source.thumbnail.getBitmap() as unknown as Buffer;
      const px = Math.round((x - display.bounds.x) * scaleFactor);
      const py = Math.round((y - display.bounds.y) * scaleFactor);
      const stride = Math.ceil(display.bounds.width * scaleFactor) * 4;
      const offset = py * stride + px * 4;

      // BGRA format from getBitmap
      const b = bitmap[offset];
      const g = bitmap[offset + 1];
      const r = bitmap[offset + 2];

      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      const rgb = `rgb(${r}, ${g}, ${b})`;

      return { hex, rgb, position: { x, y } };
    },
  );
}
