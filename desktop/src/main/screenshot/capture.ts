import { desktopCapturer, screen, type NativeImage } from 'electron';
import type { ScreenshotCaptureImage, ScreenshotRect } from '@/contracts/screenshot';

// ── 预截取缓存 ────────────────────────────────────
// 在截图窗口显示前预先截取屏幕，框选后直接从内存裁剪，
// 避免 隐藏窗口→等待→desktopCapturer→恢复窗口 的链路延迟
const preloadedScreens = new Map<number, NativeImage>();

export async function preloadScreenCaptures(displayId?: number): Promise<void> {
  preloadedScreens.clear();
  const allDisplays = screen.getAllDisplays();
  if (allDisplays.length === 0) return;

  // 如果指定了显示器 ID，只截取该显示器；否则截取所有显示器
  const displays = displayId != null
    ? allDisplays.filter((d) => d.id === displayId)
    : allDisplays;
  if (displays.length === 0) return;

  const maxWidth = Math.max(...displays.map((d) => Math.ceil(d.bounds.width * d.scaleFactor)));
  const maxHeight = Math.max(...displays.map((d) => Math.ceil(d.bounds.height * d.scaleFactor)));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: maxWidth, height: maxHeight },
  });

  for (const display of displays) {
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
    if (source && !source.thumbnail.isEmpty()) {
      preloadedScreens.set(display.id, source.thumbnail);
    }
  }
}

export function clearPreloadedScreens(): void {
  preloadedScreens.clear();
}

export function hasPreloadedScreen(displayId: number): boolean {
  return preloadedScreens.has(displayId);
}

/** 从预截取缓存中裁剪区域，无需隐藏窗口和重新调用 desktopCapturer */
export function captureRegionFromPreloaded(region: ScreenshotRect, displayId: number): ScreenshotCaptureImage {
  const display = screen.getAllDisplays().find((item) => item.id === displayId)
    ?? screen.getDisplayMatching(region);
  const fullImage = preloadedScreens.get(display.id);
  if (!fullImage || fullImage.isEmpty()) {
    throw new Error('预截取屏幕数据不可用');
  }

  const scaleFactor = display.scaleFactor || 1;
  const cropRect = {
    x: Math.round((region.x - display.bounds.x) * scaleFactor),
    y: Math.round((region.y - display.bounds.y) * scaleFactor),
    width: Math.round(region.width * scaleFactor),
    height: Math.round(region.height * scaleFactor),
  };

  console.log('[screenshot] captureRegionFromPreloaded:', {
    displayId: display.id,
    scaleFactor,
    region,
    displayBounds: display.bounds,
    fullImageSize: fullImage.getSize(),
    cropRect,
  });

  const cropped = fullImage.crop(cropRect);
  const png = cropped.toPNG();
  if (!png.length) {
    throw new Error('区域截图编码失败');
  }

  return {
    pngBase64: png.toString('base64'),
    mimeType: 'image/png',
    byteSize: png.length,
    displayId: display.id,
    region,
    capturedAt: new Date().toISOString(),
  };
}

// ── 原始截图方式（回退用） ────────────────────────

export async function captureScreenshotRegion(region: ScreenshotRect, displayId: number): Promise<ScreenshotCaptureImage> {
  const display = screen.getAllDisplays().find((item) => item.id === displayId)
    ?? screen.getDisplayMatching(region);
  const source = await getScreenSource(display.id);
  const fullImage = source.thumbnail;
  if (fullImage.isEmpty()) {
    throw new Error('无法读取屏幕截图');
  }

  const scaleFactor = display.scaleFactor || 1;
  const cropRect = {
    x: Math.round((region.x - display.bounds.x) * scaleFactor),
    y: Math.round((region.y - display.bounds.y) * scaleFactor),
    width: Math.round(region.width * scaleFactor),
    height: Math.round(region.height * scaleFactor),
  };

  const cropped = fullImage.crop(cropRect);
  const png = cropped.toPNG();
  if (!png.length) {
    throw new Error('区域截图编码失败');
  }

  return {
    pngBase64: png.toString('base64'),
    mimeType: 'image/png',
    byteSize: png.length,
    displayId: display.id,
    region,
    capturedAt: new Date().toISOString(),
  };
}

async function getScreenSource(displayId: number) {
  const displays = screen.getAllDisplays();
  const maxWidth = Math.max(...displays.map((display) => Math.ceil(display.bounds.width * display.scaleFactor)));
  const maxHeight = Math.max(...displays.map((display) => Math.ceil(display.bounds.height * display.scaleFactor)));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: maxWidth, height: maxHeight },
  });
  const source = sources.find((item) => item.display_id === String(displayId)) ?? sources[0];
  if (!source) {
    throw new Error('未找到可用屏幕源');
  }
  return source;
}
