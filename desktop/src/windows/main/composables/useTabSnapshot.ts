import { reactive } from 'vue';
import * as html2canvasModule from 'html2canvas-pro';

const html2canvas = ('default' in html2canvasModule
  ? html2canvasModule.default
  : html2canvasModule) as typeof import('html2canvas-pro').default;

/**
 * 全局页面快照缓存
 * 在路由切换时自动截图并缓存，供 TabPreview 读取
 */
const snapshots = reactive<Record<string, string>>({});
let isCapturing = false;

/**
 * 对当前页面内容区域截图，并缓存到指定路由路径下
 */
export async function capturePageSnapshot(routePath: string): Promise<void> {
  if (isCapturing) return;

  const pageContainer = document.querySelector('.page-container');
  if (!pageContainer) return;

  isCapturing = true;
  try {
    const canvas = await html2canvas(pageContainer as HTMLElement, {
      scale: 0.4,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      width: pageContainer.clientWidth,
      height: pageContainer.clientHeight,
      windowWidth: pageContainer.clientWidth,
      windowHeight: pageContainer.clientHeight,
    });

    snapshots[routePath] = canvas.toDataURL('image/jpeg', 0.65);
  } catch (err) {
    console.warn('[useTabSnapshot] 截图失败:', err);
  } finally {
    isCapturing = false;
  }
}

/**
 * 获取指定路由路径的快照 URL
 */
export function getSnapshot(routePath: string): string | null {
  return snapshots[routePath] ?? null;
}

/**
 * 判断是否正在截图中
 */
export function isSnapshotCapturing(): boolean {
  return isCapturing;
}
