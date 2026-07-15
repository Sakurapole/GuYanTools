import { readonly, ref } from 'vue';
import type { ScreenshotDetectedWindow } from '@/contracts/screenshot';

const DETECT_DEBOUNCE_MS = 16;

export function useWindowDetection() {
  const detectedWindows = ref<ScreenshotDetectedWindow[]>([]);
  const hoveredWindow = ref<ScreenshotDetectedWindow | null>(null);
  const loading = ref(false);
  let detectTimer: ReturnType<typeof setTimeout> | null = null;

  async function loadWindows() {
    if (!window.screenshotApi?.detectWindows) return;
    loading.value = true;
    try {
      detectedWindows.value = await window.screenshotApi.detectWindows();
    } catch {
      detectedWindows.value = [];
    } finally {
      loading.value = false;
    }
  }

  function updateHoveredWindow(screenX: number, screenY: number) {
    if (detectTimer) clearTimeout(detectTimer);

    detectTimer = setTimeout(() => {
      const match = detectedWindows.value.find((win) => {
        const b = win.bounds;
        return (
          screenX >= b.x
          && screenY >= b.y
          && screenX <= b.x + b.width
          && screenY <= b.y + b.height
        );
      }) ?? null;

      hoveredWindow.value = match;
    }, DETECT_DEBOUNCE_MS);
  }

  function clearHoveredWindow() {
    if (detectTimer) clearTimeout(detectTimer);
    hoveredWindow.value = null;
  }

  function reset() {
    detectedWindows.value = [];
    hoveredWindow.value = null;
    if (detectTimer) clearTimeout(detectTimer);
  }

  return {
    detectedWindows: readonly(detectedWindows),
    hoveredWindow: readonly(hoveredWindow),
    loading,
    loadWindows,
    updateHoveredWindow,
    clearHoveredWindow,
    reset,
  };
}
