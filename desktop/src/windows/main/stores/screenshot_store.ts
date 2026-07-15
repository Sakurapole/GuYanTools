import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, readonly, ref } from 'vue';
import type { AiChatAttachment } from '@/contracts/ai';
import type {
  ScreenshotCaptureRequest,
  ScreenshotOcrResult,
  ScreenshotRecognitionResult,
  ScreenshotUiBlockKind,
} from '@/contracts/screenshot';
import { useInAppNotificationStore } from './in_app_notification_store';

const DEFAULT_CAPTURE_REQUEST: ScreenshotCaptureRequest = {
  mode: 'region',
  recognize: true,
};

const BLOCK_KIND_ORDER: ScreenshotUiBlockKind[] = [
  'navigation',
  'card',
  'list_item',
  'button',
  'input',
  'image',
  'group',
  'unknown',
];

export const useScreenshotStore = defineStore('screenshot', () => {
  const latestResult = ref<ScreenshotRecognitionResult | null>(null);
  const latestAiAttachment = ref<AiChatAttachment | null>(null);
  const lastAnnotatedPng = ref<string | null>(null);
  const ocrResult = ref<ScreenshotOcrResult | null>(null);
  const panelOpen = ref(false);
  const capturing = ref(false);
  const savingToKnowledge = ref(false);
  const creatingAiAttachment = ref(false);
  const copyingToClipboard = ref(false);
  const savingToFile = ref(false);
  const performingOcr = ref(false);
  const error = ref('');
  let unsubscribeCaptureResult: (() => void) | undefined;

  const supported = computed(() => Boolean(window.screenshotApi));
  const blockCounts = computed(() => {
    const counts = new Map<ScreenshotUiBlockKind, number>();
    for (const block of latestResult.value?.blocks ?? []) {
      counts.set(block.kind, (counts.get(block.kind) ?? 0) + 1);
    }
    return BLOCK_KIND_ORDER
      .map((kind) => ({ kind, count: counts.get(kind) ?? 0 }))
      .filter((item) => item.count > 0);
  });

  function ensureCaptureSubscription() {
    if (unsubscribeCaptureResult || !window.screenshotApi) {
      return;
    }

    unsubscribeCaptureResult = window.screenshotApi.onCaptureResult((result) => {
      receiveCaptureResult(result);
    });
  }

  function disposeCaptureSubscription() {
    unsubscribeCaptureResult?.();
    unsubscribeCaptureResult = undefined;
  }

  function receiveCaptureResult(result: ScreenshotRecognitionResult) {
    latestResult.value = result;
    // 存储带标注的图像，供复制/保存/OCR 使用
    lastAnnotatedPng.value = result.image.pngBase64;
    latestAiAttachment.value = null;
    panelOpen.value = true;
    error.value = '';
    useInAppNotificationStore().notify({
      tone: 'success',
      title: '截图识别完成',
      message: `识别到 ${result.blocks.length} 个结构化 UI 块。`,
      duration: 2600,
      dedupeKey: 'screenshot:capture-result',
    });
  }

  async function startRegionCapture(input: ScreenshotCaptureRequest = DEFAULT_CAPTURE_REQUEST) {
    if (!window.screenshotApi) {
      throw new Error('当前运行环境不支持截图识别 API');
    }

    capturing.value = true;
    error.value = '';
    try {
      return await window.screenshotApi.startCapture(input);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      error.value = message;
      useInAppNotificationStore().notify({
        tone: 'error',
        title: '截图启动失败',
        message,
        duration: 3600,
        dedupeKey: 'screenshot:start-error',
      });
      throw cause;
    } finally {
      capturing.value = false;
    }
  }

  async function saveLatestToKnowledge() {
    if (!window.screenshotApi) {
      throw new Error('当前运行环境不支持截图识别 API');
    }
    if (!latestResult.value) {
      throw new Error('没有可保存的截图识别结果');
    }

    savingToKnowledge.value = true;
    error.value = '';
    try {
      const result = await window.screenshotApi.saveCaptureToKnowledge(latestResult.value);
      useInAppNotificationStore().notify({
        tone: 'success',
        title: '已保存到知识库',
        message: `资源 ${result.assetId} 已写入知识库附件。`,
        duration: 3200,
        dedupeKey: `screenshot:knowledge:${result.assetId}`,
      });
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      error.value = message;
      useInAppNotificationStore().notify({
        tone: 'error',
        title: '保存失败',
        message,
        duration: 4200,
        dedupeKey: 'screenshot:knowledge-error',
      });
      throw cause;
    } finally {
      savingToKnowledge.value = false;
    }
  }

  async function createLatestAiAttachment() {
    if (!window.screenshotApi) {
      throw new Error('当前运行环境不支持截图识别 API');
    }
    if (!latestResult.value) {
      throw new Error('没有可创建附件的截图识别结果');
    }

    creatingAiAttachment.value = true;
    error.value = '';
    try {
      latestAiAttachment.value = await window.screenshotApi.createAiAttachment(latestResult.value);
      useInAppNotificationStore().notify({
        tone: 'success',
        title: 'AI 附件已创建',
        message: latestAiAttachment.value.name,
        duration: 3200,
        dedupeKey: `screenshot:ai:${latestAiAttachment.value.id}`,
      });
      return latestAiAttachment.value;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      error.value = message;
      useInAppNotificationStore().notify({
        tone: 'error',
        title: 'AI 附件创建失败',
        message,
        duration: 4200,
        dedupeKey: 'screenshot:ai-error',
      });
      throw cause;
    } finally {
      creatingAiAttachment.value = false;
    }
  }

  function openPanel() {
    panelOpen.value = true;
  }

  function closePanel() {
    panelOpen.value = false;
  }

  // ── Phase 1 新增 actions ──────────────────────

  async function copyToClipboard() {
    const base64 = lastAnnotatedPng.value ?? latestResult.value?.image.pngBase64;
    if (!base64 || !window.screenshotApi?.saveToClipboard) return;

    copyingToClipboard.value = true;
    error.value = '';
    try {
      await window.screenshotApi.saveToClipboard(base64);
      useInAppNotificationStore().notify({
        tone: 'success',
        title: '已复制到剪贴板',
        message: '截图图像已复制。',
        duration: 2000,
        dedupeKey: 'screenshot:clipboard-copy',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      error.value = message;
      useInAppNotificationStore().notify({
        tone: 'error',
        title: '复制失败',
        message,
        duration: 3000,
        dedupeKey: 'screenshot:clipboard-error',
      });
    } finally {
      copyingToClipboard.value = false;
    }
  }

  async function saveToFile() {
    const base64 = lastAnnotatedPng.value ?? latestResult.value?.image.pngBase64;
    if (!base64 || !window.screenshotApi?.saveToFile) return;

    savingToFile.value = true;
    error.value = '';
    try {
      const result = await window.screenshotApi.saveToFile(base64);
      if (result) {
        useInAppNotificationStore().notify({
          tone: 'success',
          title: '已保存文件',
          message: result.filePath,
          duration: 3000,
          dedupeKey: `screenshot:file:${result.filePath}`,
        });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      error.value = message;
      useInAppNotificationStore().notify({
        tone: 'error',
        title: '保存失败',
        message,
        duration: 3000,
        dedupeKey: 'screenshot:file-error',
      });
    } finally {
      savingToFile.value = false;
    }
  }

  async function performOcr() {
    const base64 = lastAnnotatedPng.value ?? latestResult.value?.image.pngBase64;
    if (!base64 || !window.screenshotApi?.performOcr) return;

    performingOcr.value = true;
    error.value = '';
    try {
      ocrResult.value = await window.screenshotApi.performOcr(base64);
      useInAppNotificationStore().notify({
        tone: 'success',
        title: 'OCR 识别完成',
        message: `提取到 ${ocrResult.value.blocks.length} 个文字块。`,
        duration: 2600,
        dedupeKey: 'screenshot:ocr-result',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      error.value = message;
      useInAppNotificationStore().notify({
        tone: 'error',
        title: 'OCR 识别失败',
        message,
        duration: 3000,
        dedupeKey: 'screenshot:ocr-error',
      });
    } finally {
      performingOcr.value = false;
    }
  }

  return {
    latestResult: readonly(latestResult),
    latestAiAttachment: readonly(latestAiAttachment),
    lastAnnotatedPng: readonly(lastAnnotatedPng),
    ocrResult: readonly(ocrResult),
    panelOpen,
    capturing: readonly(capturing),
    savingToKnowledge: readonly(savingToKnowledge),
    creatingAiAttachment: readonly(creatingAiAttachment),
    copyingToClipboard: readonly(copyingToClipboard),
    savingToFile: readonly(savingToFile),
    performingOcr: readonly(performingOcr),
    error: readonly(error),
    supported,
    blockCounts,
    ensureCaptureSubscription,
    disposeCaptureSubscription,
    receiveCaptureResult,
    startRegionCapture,
    saveLatestToKnowledge,
    createLatestAiAttachment,
    copyToClipboard,
    saveToFile,
    performOcr,
    openPanel,
    closePanel,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useScreenshotStore, import.meta.hot));
}
