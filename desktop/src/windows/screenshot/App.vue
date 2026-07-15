<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type {
  ScreenshotCaptureImage,
  ScreenshotOverlayPayload,
  ScreenshotRecognitionResult,
  ScreenshotRect,
  ScreenshotUiBlock,
} from '@/contracts/screenshot';
import AnnotationCanvas from './components/AnnotationCanvas.vue';
import AnnotationToolbar from './components/AnnotationToolbar.vue';
import { useAnnotation } from './composables/useAnnotation';
import { useWindowDetection } from './composables/useWindowDetection';

// ── 状态机 ────────────────────────────────────────
type CapturePhase = 'select' | 'annotate' | 'confirm' | 'recognize';
const phase = ref<CapturePhase>('select');

// ── 基础状态 ──────────────────────────────────────
const payload = ref<ScreenshotOverlayPayload | null>(null);
const dragStart = ref<{ x: number; y: number } | null>(null);
const dragCurrent = ref<{ x: number; y: number } | null>(null);
const capturedImage = ref<ScreenshotCaptureImage | null>(null);
const recognitionResult = ref<ScreenshotRecognitionResult | null>(null);
const busy = ref(false);
const error = ref('');
let unsubscribeCaptureOptions: (() => void) | undefined;

// ── 选区拖拽/调整 ──────────────────────────────────
type DragMode = 'new' | 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-w' | 'resize-e';
const dragMode = ref<DragMode>('new');
const dragOffset = ref<{ x: number; y: number } | null>(null);
const overlayCursor = ref('crosshair');
const RESIZE_HANDLE = 8; // 选区边缘调整手柄的检测宽度（DIP）

// 已确认的选区（拖拽结束后保存，与拖拽中的临时状态分离）
const selectionRect = ref<ScreenshotRect | null>(null);
// 是否正在拖拽（pointerdown → pointerup 期间）
const isDragging = ref(false);

// ── 标注系统 ──────────────────────────────────────
const annotation = useAnnotation();
const annotationCanvasRef = ref<InstanceType<typeof AnnotationCanvas> | null>(null);

// ── 窗口检测 ──────────────────────────────────────
const windowDetection = useWindowDetection();

// ── 选区计算 ──────────────────────────────────────
const selection = computed<ScreenshotRect | null>(() => {
  // 拖拽中：从 dragStart/dragCurrent 实时计算
  if (isDragging.value && dragStart.value && dragCurrent.value) {
    const x = Math.min(dragStart.value.x, dragCurrent.value.x);
    const y = Math.min(dragStart.value.y, dragCurrent.value.y);
    const width = Math.abs(dragStart.value.x - dragCurrent.value.x);
    const height = Math.abs(dragStart.value.y - dragCurrent.value.y);
    if (width < 8 || height < 8) return null;
    return { x, y, width, height };
  }
  // 非拖拽时：返回已确认的选区
  return selectionRect.value;
});

// ── 选区拖拽模式检测 ──────────────────────────────
function getDragMode(x: number, y: number, sel: ScreenshotRect): DragMode {
  const h = RESIZE_HANDLE;
  const nearLeft = Math.abs(x - sel.x) <= h;
  const nearRight = Math.abs(x - (sel.x + sel.width)) <= h;
  const nearTop = Math.abs(y - sel.y) <= h;
  const nearBottom = Math.abs(y - (sel.y + sel.height)) <= h;
  const inside = x > sel.x + h && x < sel.x + sel.width - h && y > sel.y + h && y < sel.y + sel.height - h;

  if (nearLeft && nearTop) return 'resize-nw';
  if (nearRight && nearTop) return 'resize-ne';
  if (nearLeft && nearBottom) return 'resize-sw';
  if (nearRight && nearBottom) return 'resize-se';
  if (nearTop) return 'resize-n';
  if (nearBottom) return 'resize-s';
  if (nearLeft) return 'resize-w';
  if (nearRight) return 'resize-e';
  if (inside) return 'move';
  return 'new';
}

function updateCursorStyle(x: number, y: number) {
  const sel = selection.value;
  if (!sel) {
    overlayCursor.value = 'crosshair';
    return;
  }
  const mode = getDragMode(x, y, sel);
  switch (mode) {
    case 'move': overlayCursor.value = 'move'; break;
    case 'resize-nw':
    case 'resize-se': overlayCursor.value = 'nwse-resize'; break;
    case 'resize-ne':
    case 'resize-sw': overlayCursor.value = 'nesw-resize'; break;
    case 'resize-n':
    case 'resize-s': overlayCursor.value = 'ns-resize'; break;
    case 'resize-w':
    case 'resize-e': overlayCursor.value = 'ew-resize'; break;
    default: overlayCursor.value = 'crosshair';
  }
}

// 选区调整手柄位置
const resizeHandles = computed(() => {
  const sel = selection.value;
  if (!sel) return [];
  const root = payload.value?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  const left = sel.x - root.x;
  const top = sel.y - root.y;
  const w = sel.width;
  const h = sel.height;
  const s = 8;
  return [
    { pos: 'nw', style: { left: `${left - s / 2}px`, top: `${top - s / 2}px`, cursor: 'nwse-resize' } },
    { pos: 'n', style: { left: `${left + w / 2 - s / 2}px`, top: `${top - s / 2}px`, cursor: 'ns-resize' } },
    { pos: 'ne', style: { left: `${left + w - s / 2}px`, top: `${top - s / 2}px`, cursor: 'nesw-resize' } },
    { pos: 'e', style: { left: `${left + w - s / 2}px`, top: `${top + h / 2 - s / 2}px`, cursor: 'ew-resize' } },
    { pos: 'se', style: { left: `${left + w - s / 2}px`, top: `${top + h - s / 2}px`, cursor: 'nwse-resize' } },
    { pos: 's', style: { left: `${left + w / 2 - s / 2}px`, top: `${top + h - s / 2}px`, cursor: 'ns-resize' } },
    { pos: 'sw', style: { left: `${left - s / 2}px`, top: `${top + h - s / 2}px`, cursor: 'nesw-resize' } },
    { pos: 'w', style: { left: `${left - s / 2}px`, top: `${top + h / 2 - s / 2}px`, cursor: 'ew-resize' } },
  ].map((item) => ({ ...item, style: { ...item.style, width: `${s}px`, height: `${s}px` } }));
});

// ── 选区样式 ──────────────────────────────────────
function selectionStyle() {
  const rect = selection.value;
  const root = payload.value?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  if (!rect) return {};
  return {
    left: `${rect.x - root.x}px`,
    top: `${rect.y - root.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

// 窗口检测高亮样式
function hoveredWindowStyle() {
  const win = windowDetection.hoveredWindow.value;
  if (!win) return null;
  const root = payload.value?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    left: `${win.bounds.x - root.x}px`,
    top: `${win.bounds.y - root.y}px`,
    width: `${win.bounds.width}px`,
    height: `${win.bounds.height}px`,
  };
}

// ── 标注画布位置和尺寸 ────────────────────────────
const annotateRegion = computed(() => {
  const sel = selection.value;
  if (!sel) return null;
  const root = payload.value?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    left: sel.x - root.x,
    top: sel.y - root.y,
    width: sel.width,
    height: sel.height,
  };
});

// ── SELECT 阶段：拖拽选区 + 移动/调整 ──────────

function onPointerDown(event: PointerEvent) {
  if (phase.value !== 'select' || busy.value) return;
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
  isDragging.value = true;

  const x = event.screenX;
  const y = event.screenY;

  // 如果已有选区，检测拖拽模式（移动或调整大小）
  const sel = selectionRect.value;
  if (sel) {
    const mode = getDragMode(x, y, sel);
    dragMode.value = mode;

    if (mode === 'move') {
      // 移动：以选区左上角为基准，记录鼠标偏移
      dragOffset.value = { x: x - sel.x, y: y - sel.y };
      dragStart.value = { x: sel.x, y: sel.y };
      dragCurrent.value = { x: sel.x + sel.width, y: sel.y + sel.height };
      return;
    }

    if (mode.startsWith('resize')) {
      // 调整大小：以当前选区为起始状态
      dragStart.value = { x: sel.x, y: sel.y };
      dragCurrent.value = { x: sel.x + sel.width, y: sel.y + sel.height };
      return;
    }
    // 在选区外点击，开始新选择
  }

  // 创建新选区
  dragMode.value = 'new';
  dragStart.value = { x, y };
  dragCurrent.value = { x, y };
}

function onPointerMove(event: PointerEvent) {
  if (phase.value !== 'select') return;

  const x = event.screenX;
  const y = event.screenY;

  // 非拖拽时：更新窗口检测高亮和光标样式
  if (!isDragging.value) {
    windowDetection.updateHoveredWindow(x, y);
    updateCursorStyle(x, y);
    return;
  }

  const mode = dragMode.value;

  if (mode === 'new') {
    dragCurrent.value = { x, y };
    return;
  }

  if (mode === 'move') {
    const offset = dragOffset.value;
    if (!offset) return;
    // 用 selectionRect（拖拽前的选区）的宽高
    const sel = selectionRect.value;
    if (!sel) return;
    dragStart.value = { x: x - offset.x, y: y - offset.y };
    dragCurrent.value = { x: x - offset.x + sel.width, y: y - offset.y + sel.height };
    return;
  }

  // 调整选区大小
  if (mode.startsWith('resize')) {
    const sel = selectionRect.value;
    if (!sel) return;
    let left = sel.x;
    let top = sel.y;
    let right = sel.x + sel.width;
    let bottom = sel.y + sel.height;

    if (mode.includes('w')) left = x;
    if (mode.includes('e')) right = x;
    if (mode.includes('n')) top = y;
    if (mode.includes('s')) bottom = y;

    dragStart.value = { x: left, y: top };
    dragCurrent.value = { x: right, y: bottom };
  }
}

async function onPointerUp(event: PointerEvent) {
  try { (event.currentTarget as Element).releasePointerCapture(event.pointerId); } catch { /* ignore */ }
  if (phase.value !== 'select' || busy.value) return;

  // 拖拽结束：将结果保存到 selectionRect
  const sel = selection.value;
  if (sel) {
    selectionRect.value = sel;
  } else if (dragMode.value === 'new') {
    // 新建选区但拖拽距离不足，尝试窗口检测
    const hovered = windowDetection.hoveredWindow.value;
    if (hovered) {
      selectionRect.value = {
        x: hovered.bounds.x,
        y: hovered.bounds.y,
        width: hovered.bounds.width,
        height: hovered.bounds.height,
      };
    } else {
      selectionRect.value = null;
    }
  } else {
    // move/resize 后选区无效（如缩到太小），保持原选区
    selectionRect.value = sel ?? selectionRect.value;
  }

  // 清空拖拽临时状态
  isDragging.value = false;
  dragStart.value = null;
  dragCurrent.value = null;
  dragMode.value = 'new';
  dragOffset.value = null;
}

function onPointerCancel(event: PointerEvent) {
  try { (event.currentTarget as Element).releasePointerCapture(event.pointerId); } catch { /* ignore */ }
  isDragging.value = false;
  dragStart.value = null;
  dragCurrent.value = null;
  dragMode.value = 'new';
  dragOffset.value = null;
}

// 双击选区进入标注阶段
function onDoubleClick() {
  if (phase.value !== 'select') return;
  if (selection.value) {
    void enterAnnotatePhase();
  }
}

async function enterAnnotatePhase() {
  const sel = selection.value;
  if (!sel) return;

  busy.value = true;
  error.value = '';
  windowDetection.clearHoveredWindow();

  try {
    const display = displayForRect(sel);
    // 转为普通对象，避免 Vue 响应式 Proxy 无法被 IPC structured clone 序列化
    const plainRegion = { x: sel.x, y: sel.y, width: sel.width, height: sel.height };
    const image = await window.screenshotApi?.captureRegion(plainRegion, display.id);
    if (!image) {
      throw new Error('截图 API 不可用');
    }
    capturedImage.value = image;
    phase.value = 'annotate';
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    dragStart.value = null;
    dragCurrent.value = null;
  } finally {
    busy.value = false;
  }
}

// ── 标注工具栏事件 ────────────────────────────────

async function onAnnotationConfirm() {
  // 合成带标注的图像
  const annotatedBase64 = annotationCanvasRef.value?.exportAnnotatedImage();
  if (annotatedBase64 && capturedImage.value) {
    capturedImage.value = {
      ...capturedImage.value,
      pngBase64: annotatedBase64,
    };
  } else if (!annotatedBase64 && capturedImage.value) {
    // 标注合成失败时保留原始截图，不影响后续操作
    error.value = '标注合成失败，将使用原始截图';
  }
  phase.value = 'confirm';
}

function onAnnotationCancel() {
  annotation.reset();
  capturedImage.value = null;
  dragStart.value = null;
  dragCurrent.value = null;
  // 直接退出截图窗口，而非回到选择阶段
  void cancel();
}

async function onAnnotationRecognize() {
  if (!capturedImage.value) return;
  busy.value = true;
  error.value = '';
  try {
    phase.value = 'recognize';
    recognitionResult.value = await window.screenshotApi.recognizeImage(JSON.parse(JSON.stringify(capturedImage.value)), {
      minBlockWidth: 14,
      minBlockHeight: 10,
      mergeGap: 6,
      maxBlocks: 160,
    });
    phase.value = 'confirm';
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    phase.value = 'annotate';
  } finally {
    busy.value = false;
  }
}

// ── CONFIRM 阶段：输出操作 ────────────────────────

async function copyToClipboard() {
  if (!capturedImage.value) return;
  try {
    await window.screenshotApi?.saveToClipboard?.(capturedImage.value.pngBase64);
    await cancel();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function saveToFile() {
  if (!capturedImage.value) return;
  try {
    await window.screenshotApi?.saveToFile?.(capturedImage.value.pngBase64);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function pinToScreen() {
  if (!capturedImage.value) return;
  try {
    await window.screenshotApi?.pinImage?.(capturedImage.value.pngBase64);
    await cancel();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function sendToKnowledgeOrAi() {
  if (!recognitionResult.value) {
    // 如果没有识别结果，先执行识别
    if (!capturedImage.value) return;
    busy.value = true;
    try {
      recognitionResult.value = await window.screenshotApi.recognizeImage(JSON.parse(JSON.stringify(capturedImage.value)), {
        minBlockWidth: 14,
        minBlockHeight: 10,
        mergeGap: 6,
        maxBlocks: 160,
      });
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return;
    } finally {
      busy.value = false;
    }
  }
  await window.screenshotApi?.completeOverlayCapture(JSON.parse(JSON.stringify(recognitionResult.value)));
}

// ── 通用操作 ──────────────────────────────────────

async function cancel() {
  annotation.reset();
  windowDetection.reset();
  selectionRect.value = null;
  isDragging.value = false;
  dragStart.value = null;
  dragCurrent.value = null;
  await window.screenshotApi?.closeOverlay();
}

function displayForRect(rect: ScreenshotRect) {
  const displays = payload.value?.displays ?? [];
  return displays.find((display) =>
    rect.x >= display.bounds.x
    && rect.y >= display.bounds.y
    && rect.x <= display.bounds.x + display.bounds.width
    && rect.y <= display.bounds.y + display.bounds.height,
  ) ?? displays[0] ?? {
    id: 0,
    scaleFactor: 1,
    bounds: rect,
    workArea: rect,
  };
}

// ── UI 块样式（保留旧功能） ──────────────────────

function blockStyle(block: ScreenshotUiBlock) {
  const root = payload.value?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    left: `${block.rect.x + (recognitionResult.value?.image.region.x ?? 0) - root.x}px`,
    top: `${block.rect.y + (recognitionResult.value?.image.region.y ?? 0) - root.y}px`,
    width: `${block.rect.width}px`,
    height: `${block.rect.height}px`,
  };
}

// ── 键盘事件 ──────────────────────────────────────

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (phase.value === 'annotate') {
      onAnnotationCancel();
    } else {
      void cancel();
    }
  }
  // select 阶段按 Enter 进入标注
  if (event.key === 'Enter' && phase.value === 'select') {
    if (selection.value) {
      void enterAnnotatePhase();
    }
  }
  if (event.key === 'Enter' && phase.value === 'confirm') {
    void copyToClipboard();
  }
  // Ctrl+Z / Ctrl+Y 快捷键
  if (event.ctrlKey && event.key === 'z') {
    event.preventDefault();
    annotation.undo();
  }
  if (event.ctrlKey && event.key === 'y') {
    event.preventDefault();
    annotation.redo();
  }
}

// ── 生命周期 ──────────────────────────────────────

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  unsubscribeCaptureOptions = window.screenshotApi?.onCaptureOptions((nextPayload) => {
    payload.value = nextPayload;
    // 加载窗口检测数据
    windowDetection.loadWindows();
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  unsubscribeCaptureOptions?.();
  windowDetection.reset();
});
</script>

<template>
  <main
    class="screenshot-overlay"
    :class="{ 'screenshot-overlay--annotate': phase === 'annotate' || phase === 'confirm' }"
    :style="{ cursor: overlayCursor }"
    @pointerdown="phase === 'select' ? onPointerDown($event) : undefined"
    @pointermove="phase === 'select' ? onPointerMove($event) : undefined"
    @pointerup="phase === 'select' ? onPointerUp($event) : undefined"
    @pointercancel="phase === 'select' ? onPointerCancel($event) : undefined"
    @dblclick="phase === 'select' ? onDoubleClick() : undefined"
  >
    <!-- 半透明遮罩（仅选择阶段且无选区时全屏暗化） -->
    <div v-if="phase === 'select' && !selection" class="screenshot-overlay__shade" />

    <!-- 窗口检测高亮 -->
    <div
      v-if="phase === 'select' && hoveredWindowStyle()"
      class="screenshot-overlay__window-highlight"
      :style="hoveredWindowStyle()!"
    >
      <span v-if="windowDetection.hoveredWindow.value?.title">
        {{ windowDetection.hoveredWindow.value.title }}
      </span>
    </div>

    <!-- 拖拽选区框 -->
    <div
      v-if="phase === 'select' && selection"
      class="screenshot-overlay__selection"
      :style="selectionStyle()"
    >
      <span class="screenshot-overlay__selection-size">
        {{ selection!.width }} × {{ selection!.height }}
      </span>
    </div>

    <!-- 选区调整手柄（已有选区时显示） -->
    <template v-if="phase === 'select' && selection">
      <div
        v-for="handle in resizeHandles"
        :key="handle.pos"
        class="screenshot-overlay__resize-handle"
        :style="handle.style"
      />
    </template>

    <!-- 选区确认提示 -->
    <div v-if="phase === 'select' && selection" class="screenshot-overlay__select-tip">
      双击或按 Enter 确认选区 · 拖动可移动 · 拖边缘可调整
    </div>

    <!-- 取消按钮（选择阶段） -->
    <button
      v-if="phase === 'select'"
      class="screenshot-overlay__cancel"
      type="button"
      @click.stop="cancel"
    >
      取消 (Esc)
    </button>

    <!-- ── 标注阶段 ──────────────────────────── -->
    <div
      v-if="(phase === 'annotate' || phase === 'confirm') && annotateRegion && capturedImage"
      class="screenshot-overlay__annotate-area"
      :style="{
        left: `${annotateRegion.left}px`,
        top: `${annotateRegion.top}px`,
      }"
      @pointerdown.stop
    >
      <AnnotationCanvas
        ref="annotationCanvasRef"
        :image-base64="capturedImage.pngBase64"
        :image-width="annotateRegion.width"
        :image-height="annotateRegion.height"
        :annotation="annotation"
        :scale-factor="payload?.displays?.[0]?.scaleFactor ?? 1"
      />

      <!-- 标注工具栏（仅标注阶段显示） -->
      <AnnotationToolbar
        v-if="phase === 'annotate'"
        :annotation="annotation"
        class="screenshot-overlay__toolbar"
        @confirm="onAnnotationConfirm"
        @cancel="onAnnotationCancel"
        @recognize="onAnnotationRecognize"
      />
    </div>

    <!-- ── 确认阶段：输出操作面板 ────────────── -->
    <section
      v-if="phase === 'confirm'"
      class="screenshot-overlay__output"
      @pointerdown.stop
    >
      <button
        class="screenshot-overlay__output-btn screenshot-overlay__output-btn--primary"
        type="button"
        @click="copyToClipboard"
      >
        📋 复制到剪贴板
      </button>
      <button
        class="screenshot-overlay__output-btn"
        type="button"
        @click="saveToFile"
      >
        💾 保存文件
      </button>
      <button
        class="screenshot-overlay__output-btn"
        type="button"
        @click="pinToScreen"
      >
        📌 贴图
      </button>
      <button
        class="screenshot-overlay__output-btn"
        type="button"
        @click="sendToKnowledgeOrAi"
      >
        📎 发送到知识库/AI
      </button>
      <button
        class="screenshot-overlay__output-btn screenshot-overlay__output-btn--back"
        type="button"
        @click="phase = 'annotate'"
      >
        ↩ 返回标注
      </button>
      <button
        class="screenshot-overlay__output-btn screenshot-overlay__output-btn--cancel"
        type="button"
        @click="cancel"
      >
        ✕ 取消
      </button>

      <!-- UI 块识别结果摘要 -->
      <div v-if="recognitionResult" class="screenshot-overlay__recognize-summary">
        <span>{{ recognitionResult.blocks.length }} 个 UI 块</span>
        <span>{{ recognitionResult.elapsedMs }}ms</span>
      </div>
    </section>

    <!-- 识别出的 UI 块覆盖（确认阶段） -->
    <div
      v-for="block in recognitionResult?.blocks ?? []"
      :key="block.id"
      class="screenshot-overlay__block"
      :class="`screenshot-overlay__block--${block.kind}`"
      :style="blockStyle(block)"
    >
      <span>{{ block.kind }}</span>
    </div>

    <!-- 状态提示 -->
    <p v-if="busy" class="screenshot-overlay__status">
      {{ phase === 'recognize' ? '正在识别 UI 块…' : '正在截图…' }}
    </p>
    <p v-if="error" class="screenshot-overlay__error">{{ error }}</p>
  </main>
</template>

<style scoped>
.screenshot-overlay {
  position: fixed;
  inset: 0;
  overflow: hidden;
  color: #f8fafc;
  font: 12px/1.4 system-ui, sans-serif;
  cursor: crosshair;
  user-select: none;
}

.screenshot-overlay--annotate {
  cursor: default;
}

.screenshot-overlay__shade {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 23, 0.5);
}

.screenshot-overlay__selection {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid #38bdf8;
  background: transparent;
  box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.5);
}

.screenshot-overlay__resize-handle {
  position: absolute;
  z-index: 3;
  background: #38bdf8;
  border: 1px solid #fff;
  border-radius: 2px;
}

.screenshot-overlay__select-tip {
  position: absolute;
  z-index: 3;
  padding: 3px 8px;
  font-size: 11px;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.85);
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  bottom: -24px;
  left: 0;
}

.screenshot-overlay__selection-size {
  position: absolute;
  bottom: -22px;
  left: 0;
  padding: 2px 6px;
  font-size: 11px;
  background: rgba(15, 23, 42, 0.85);
  border-radius: 3px;
  color: #94a3b8;
  white-space: nowrap;
}

.screenshot-overlay__window-highlight {
  position: absolute;
  box-sizing: border-box;
  border: 2px dashed #a78bfa;
  background: rgba(167, 139, 250, 0.06);
  transition: all 0.1s ease;
}

.screenshot-overlay__window-highlight span {
  position: absolute;
  top: -20px;
  left: 0;
  padding: 2px 6px;
  font-size: 11px;
  background: rgba(124, 58, 237, 0.85);
  border-radius: 3px;
  color: #fff;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.screenshot-overlay__annotate-area {
  position: absolute;
  z-index: 5;
}

.screenshot-overlay__toolbar {
  margin-top: 8px;
}

/* 确认阶段输出面板 */
.screenshot-overlay__output {
  position: fixed;
  bottom: 24px;
  left: 50%;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  transform: translateX(-50%);
}

.screenshot-overlay__output-btn {
  padding: 6px 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.screenshot-overlay__output-btn:hover {
  background: rgba(148, 163, 184, 0.2);
}

.screenshot-overlay__output-btn--primary {
  background: #38bdf8;
  color: #0f172a;
  border-color: #38bdf8;
  font-weight: 600;
}

.screenshot-overlay__output-btn--primary:hover {
  background: #7dd3fc;
}

.screenshot-overlay__output-btn--back,
.screenshot-overlay__output-btn--cancel {
  border-color: rgba(148, 163, 184, 0.15);
  background: transparent;
  color: #94a3b8;
}

.screenshot-overlay__output-btn--cancel:hover {
  color: #fca5a5;
  border-color: rgba(252, 165, 165, 0.3);
}

.screenshot-overlay__recognize-summary {
  display: flex;
  gap: 8px;
  padding: 4px 8px;
  font-size: 11px;
  color: #64748b;
}

/* 旧 UI 块覆盖 */
.screenshot-overlay__cancel {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 10;
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.85);
  color: #e2e8f0;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.screenshot-overlay__cancel:hover {
  background: rgba(30, 41, 59, 0.95);
}

.screenshot-overlay__block {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.screenshot-overlay__block span {
  position: absolute;
  top: -18px;
  left: 0;
  padding: 1px 5px;
  background: #16a34a;
  color: #fff;
}

.screenshot-overlay__status,
.screenshot-overlay__error {
  position: fixed;
  bottom: 18px;
  left: 18px;
  z-index: 10;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.92);
}

.screenshot-overlay__error {
  color: #fecaca;
}
</style>
