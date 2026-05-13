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
let scheduledSnapshotTimer: number | undefined;
let scheduledSnapshotRoutePath = '';

function isRenderBusy() {
  const root = document.documentElement;
  return root.classList.contains('theme-transitioning')
    || root.classList.contains('app-rendering-busy');
}

function requestIdleTask(callback: () => void) {
  const requestIdleCallback = window.requestIdleCallback ?? ((handler: IdleRequestCallback) => {
    const startedAt = window.performance.now();
    return window.setTimeout(() => {
      handler({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 16 - (window.performance.now() - startedAt)),
      });
    }, 1);
  });

  requestIdleCallback(() => callback(), { timeout: 1200 });
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('页面快照编码失败'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('页面快照读取失败'));
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.55);
  });
}

/**
 * 对当前页面内容区域截图，并缓存到指定路由路径下
 */
export async function capturePageSnapshot(routePath: string): Promise<void> {
  if (isCapturing) return;
  if (isRenderBusy()) return;

  const pageContainer = document.querySelector('.page-container');
  if (!pageContainer) return;

  isCapturing = true;
  try {
    const canvas = await html2canvas(pageContainer as HTMLElement, {
      scale: 0.25,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      width: pageContainer.clientWidth,
      height: pageContainer.clientHeight,
      windowWidth: pageContainer.clientWidth,
      windowHeight: pageContainer.clientHeight,
    });

    snapshots[routePath] = await canvasToDataUrl(canvas);
  } catch (err) {
    console.warn('[useTabSnapshot] 截图失败:', err);
  } finally {
    isCapturing = false;
  }
}

export function schedulePageSnapshot(routePath: string, delay = 650): void {
  if (!routePath || routePath === '/') return;

  scheduledSnapshotRoutePath = routePath;
  window.clearTimeout(scheduledSnapshotTimer);
  scheduledSnapshotTimer = window.setTimeout(() => {
    requestIdleTask(() => {
      const targetRoute = scheduledSnapshotRoutePath;
      scheduledSnapshotRoutePath = '';
      void capturePageSnapshot(targetRoute);
    });
  }, delay);
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
