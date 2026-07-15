import { desktopCapturer, screen } from 'electron';
import type { ScreenshotDetectedWindow, ScreenshotRect } from '@/contracts/screenshot';

/**
 * 检测当前屏幕上可见的窗口列表。
 *
 * Phase 1 限制：desktopCapturer 不提供窗口 bounds，
 * 此处使用整个显示器工作区作为粗略近似。
 * Phase 2 可通过 Rust NAPI EnumWindows + GetWindowRect 获取精确矩形。
 */
export async function detectVisibleWindows(): Promise<ScreenshotDetectedWindow[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1, height: 1 },
    fetchWindowIcons: false,
  });

  const displays = screen.getAllDisplays();
  const results: ScreenshotDetectedWindow[] = [];

  for (const source of sources) {
    // 过滤空标题窗口（系统托盘、不可见窗口等）
    if (!source.name || !source.name.trim()) continue;

    const displayId = source.display_id ? Number(source.display_id) : null;
    const display = displayId
      ? displays.find((item) => item.id === displayId)
      : null;

    if (!display) continue;

    const bounds: ScreenshotRect = {
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height,
    };

    results.push({
      id: source.id,
      title: source.name,
      bounds,
      processName: undefined,
    });
  }

  return results;
}
