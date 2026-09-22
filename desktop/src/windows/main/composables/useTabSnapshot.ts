import { reactive } from 'vue';

/**
 * 全局页面快照缓存
 * 路由切换后通过 Electron capturePage 生成缩略图，供 TabPreview 读取。
 * 不可用 html2canvas：它会在 renderer 主线程遍历整页 DOM，首页含背景
 * 视频/base64 图/多 widget 时会长时间阻塞交互（点击无响应）。
 */
const snapshots = reactive<Record<string, string>>({});
const capturedAt = new Map<string, number>();
let isCapturing = false;
let scheduledSnapshotTimer: number | undefined;
let scheduledSnapshotRoutePath = '';
let scheduledSnapshotForce = false;
let interactionUntil = 0;
let interactionListenersInstalled = false;

const SNAPSHOT_TTL_MS = 30_000;
const MAX_SNAPSHOT_ENTRIES = 8;

function isRenderBusy() {
  const root = document.documentElement;
  return root.classList.contains('theme-transitioning')
    || root.classList.contains('app-rendering-busy');
}

function installInteractionPause() {
  if (interactionListenersInstalled) return;
  interactionListenersInstalled = true;
  const pause = () => { interactionUntil = Date.now() + 800; };
  window.addEventListener('pointerdown', pause, { passive: true });
  window.addEventListener('keydown', pause, { passive: true });
  window.addEventListener('wheel', pause, { passive: true });
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

  requestIdleCallback((deadline) => {
    if (interactionUntil > Date.now() || deadline.timeRemaining() < 8) {
      schedulePageSnapshot(scheduledSnapshotRoutePath, 1200, scheduledSnapshotForce);
      return;
    }
    callback();
  }, { timeout: 3000 });
}

function pruneSnapshots() {
  const keys = Object.keys(snapshots);
  if (keys.length <= MAX_SNAPSHOT_ENTRIES) return;

  const sorted = keys
    .map(key => ({ key, at: capturedAt.get(key) ?? 0 }))
    .sort((a, b) => a.at - b.at);
  const dropCount = keys.length - MAX_SNAPSHOT_ENTRIES;
  for (let i = 0; i < dropCount; i += 1) {
    const key = sorted[i]?.key;
    if (!key) continue;
    delete snapshots[key];
    capturedAt.delete(key);
  }
}

/**
 * 对当前窗口截图，并缓存到指定路由路径下
 */
export async function capturePageSnapshot(routePath: string, options: { force?: boolean } = {}): Promise<void> {
  if (!routePath || routePath === '/') return;
  if (isCapturing) return;
  if (isRenderBusy()) return;
  if (interactionUntil > Date.now()) return;

  const lastCapturedAt = capturedAt.get(routePath) ?? 0;
  if (!options.force && snapshots[routePath] && Date.now() - lastCapturedAt < SNAPSHOT_TTL_MS) {
    return;
  }

  isCapturing = true;
  try {
    const dataUrl = await window.tabPreviewApi?.captureWindow();
    if (dataUrl) {
      snapshots[routePath] = dataUrl;
      capturedAt.set(routePath, Date.now());
      pruneSnapshots();
    }
  } catch (err) {
    console.warn('[useTabSnapshot] 截图失败:', err);
  } finally {
    isCapturing = false;
  }
}

export function schedulePageSnapshot(routePath: string, delay = 650, force = false): void {
  if (!routePath || routePath === '/') return;
  installInteractionPause();

  scheduledSnapshotRoutePath = routePath;
  scheduledSnapshotForce = force;
  window.clearTimeout(scheduledSnapshotTimer);
  scheduledSnapshotTimer = window.setTimeout(() => {
    requestIdleTask(() => {
      const targetRoute = scheduledSnapshotRoutePath;
      const shouldForce = scheduledSnapshotForce;
      scheduledSnapshotRoutePath = '';
      scheduledSnapshotForce = false;
      void capturePageSnapshot(targetRoute, { force: shouldForce });
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
