<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ScreenshotAnnotationElement, ScreenshotAnnotationTool } from '@/contracts/screenshot';
import { useAnnotation } from '../composables/useAnnotation';

const props = defineProps<{
  imageBase64: string;
  imageWidth: number;
  imageHeight: number;
  annotation: ReturnType<typeof useAnnotation>;
  scaleFactor?: number;
}>();

const emit = defineEmits<{
  (e: 'ready'): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const textInputRef = ref<HTMLInputElement | null>(null);
const textInputVisible = ref(false);
const textInputPosition = ref({ x: 0, y: 0 });
const textInputValue = ref('');
const isDrawing = ref(false);
const drawStart = ref<{ x: number; y: number } | null>(null);

// 优先使用传入的 scaleFactor（来自目标显示器），避免透明窗口 devicePixelRatio 不准确导致图片模糊
const dpr = computed(() => (props.scaleFactor ?? window.devicePixelRatio) || 1);
const canvasStyleWidth = computed(() => `${props.imageWidth}px`);
const canvasStyleHeight = computed(() => `${props.imageHeight}px`);

let backgroundImage: HTMLImageElement | null = null;
let animationFrameId: number | null = null;

// ── 图像加载 ──────────────────────────────────────

function loadBackgroundImage() {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      backgroundImage = img;
      resolve();
    };
    img.src = `data:image/png;base64,${props.imageBase64}`;
  });
}

// ── 渲染（事件驱动，避免持续 rAF 浪费资源） ──────

let renderRequested = false;

function requestRender() {
  if (renderRequested || !backgroundImage) return;
  renderRequested = true;
  animationFrameId = requestAnimationFrame(() => {
    renderRequested = false;
    animationFrameId = null;
    render();
  });
}

function cancelPendingRender() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  renderRequested = false;
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas || !backgroundImage) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scale = dpr.value;
  ctx.save();
  ctx.scale(scale, scale);

  // 底图
  ctx.drawImage(backgroundImage, 0, 0, props.imageWidth, props.imageHeight);

  // 已确认的标注元素
  for (const element of props.annotation.elements.value) {
    renderElement(ctx, element);
  }

  // 正在绘制的临时元素
  const drawing = props.annotation.drawingElement.value;
  if (drawing) {
    renderElement(ctx, drawing);
  }

  ctx.restore();
}

// ── 元素渲染 ──────────────────────────────────────

function renderElement(ctx: CanvasRenderingContext2D, element: ScreenshotAnnotationElement) {
  ctx.strokeStyle = element.color;
  ctx.fillStyle = element.color;
  ctx.lineWidth = element.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (element.opacity !== undefined) {
    ctx.globalAlpha = element.opacity;
  }

  switch (element.tool) {
    case 'rect':
      renderRect(ctx, element);
      break;
    case 'ellipse':
      renderEllipse(ctx, element);
      break;
    case 'arrow':
      renderArrow(ctx, element);
      break;
    case 'line':
      renderLine(ctx, element);
      break;
    case 'pen':
      renderPen(ctx, element);
      break;
    case 'text':
      renderText(ctx, element);
      break;
    case 'mosaic':
      renderMosaic(ctx, element);
      break;
    case 'highlight':
      renderHighlight(ctx, element);
      break;
    case 'number':
      renderNumber(ctx, element);
      break;
  }

  ctx.globalAlpha = 1;
}

function renderRect(ctx: CanvasRenderingContext2D, el: ScreenshotAnnotationElement) {
  if (el.points.length < 2) return;
  const [p1, p2] = el.points;
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const w = Math.abs(p2.x - p1.x);
  const h = Math.abs(p2.y - p1.y);
  ctx.strokeRect(x, y, w, h);
}

function renderEllipse(ctx: CanvasRenderingContext2D, el: ScreenshotAnnotationElement) {
  if (el.points.length < 2) return;
  const [p1, p2] = el.points;
  const cx = (p1.x + p2.x) / 2;
  const cy = (p1.y + p2.y) / 2;
  const rx = Math.abs(p2.x - p1.x) / 2;
  const ry = Math.abs(p2.y - p1.y) / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function renderArrow(ctx: CanvasRenderingContext2D, el: ScreenshotAnnotationElement) {
  if (el.points.length < 2) return;
  const [start, end] = el.points;

  // 线段
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // 箭头三角形
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = Math.max(12, el.strokeWidth * 4);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function renderLine(ctx: CanvasRenderingContext2D, el: ScreenshotAnnotationElement) {
  if (el.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(el.points[0].x, el.points[0].y);
  ctx.lineTo(el.points[1].x, el.points[1].y);
  ctx.stroke();
}

function renderPen(ctx: CanvasRenderingContext2D, el: ScreenshotAnnotationElement) {
  if (el.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(el.points[0].x, el.points[0].y);

  if (el.points.length === 2) {
    ctx.lineTo(el.points[1].x, el.points[1].y);
  } else {
    // 平滑曲线
    for (let i = 1; i < el.points.length - 1; i++) {
      const cpx = (el.points[i].x + el.points[i + 1].x) / 2;
      const cpy = (el.points[i].y + el.points[i + 1].y) / 2;
      ctx.quadraticCurveTo(el.points[i].x, el.points[i].y, cpx, cpy);
    }
    const last = el.points[el.points.length - 1];
    ctx.lineTo(last.x, last.y);
  }
  ctx.stroke();
}

function renderText(ctx: CanvasRenderingContext2D, el: ScreenshotAnnotationElement) {
  if (!el.text || el.points.length < 1) return;
  const size = el.fontSize ?? 16;
  ctx.font = `${size}px system-ui, sans-serif`;
  ctx.fillText(el.text, el.points[0].x, el.points[0].y + size);
}

function renderMosaic(ctx: CanvasRenderingContext2D, el: ScreenshotAnnotationElement) {
  if (el.points.length < 2 || !backgroundImage) return;
  const blockSize = Math.max(6, el.strokeWidth * 3);
  const [p1, p2] = el.points;
  const x1 = Math.min(p1.x, p2.x);
  const y1 = Math.min(p1.y, p2.y);
  const x2 = Math.max(p1.x, p2.x);
  const y2 = Math.max(p1.y, p2.y);

  // 在底图上取像素并分块填充平均色
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = props.imageWidth;
  tempCanvas.height = props.imageHeight;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;
  tempCtx.drawImage(backgroundImage, 0, 0);

  for (let bx = x1; bx < x2; bx += blockSize) {
    for (let by = y1; by < y2; by += blockSize) {
      const bw = Math.min(blockSize, x2 - bx);
      const bh = Math.min(blockSize, y2 - by);
      const imageData = tempCtx.getImageData(bx, by, bw, bh);
      const data = imageData.data;
      let r = 0;
      let g = 0;
      let b = 0;
      const pixelCount = bw * bh;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      ctx.fillStyle = `rgb(${Math.round(r / pixelCount)},${Math.round(g / pixelCount)},${Math.round(b / pixelCount)})`;
      ctx.fillRect(bx, by, bw, bh);
    }
  }
}

function renderHighlight(ctx: CanvasRenderingContext2D, el: ScreenshotAnnotationElement) {
  if (el.points.length < 2) return;
  const [p1, p2] = el.points;
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = el.color;
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  ctx.fillRect(x, y, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
  ctx.globalAlpha = 1;
}

function renderNumber(ctx: CanvasRenderingContext2D, el: ScreenshotAnnotationElement) {
  if (el.points.length < 1) return;
  const p = el.points[0];
  const radius = Math.max(10, el.strokeWidth * 4);

  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = el.color;
  ctx.fill();

  const size = Math.max(10, radius);
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(el.text || '1', p.x, p.y);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// ── 鼠标事件处理 ──────────────────────────────────

function getCanvasPosition(event: PointerEvent): { x: number; y: number } {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function shouldHandleDraw(): boolean {
  return Boolean(props.annotation.activeTool.value) && !textInputVisible.value;
}

function onPointerDown(event: PointerEvent) {
  if (!shouldHandleDraw()) return;
  event.preventDefault();
  event.stopPropagation();
  (event.currentTarget as Element).setPointerCapture(event.pointerId);

  const pos = getCanvasPosition(event);
  const tool = props.annotation.activeTool.value!;

  if (tool === 'text') {
    showTextInput(pos, event);
    return;
  }

  isDrawing.value = true;
  drawStart.value = pos;

  // number 工具只需单点；pen/mosaic/highlight 追加路径点；其余两点型工具
  if (tool === 'pen' || tool === 'mosaic' || tool === 'highlight' || tool === 'number') {
    props.annotation.updateDrawingElement(props.annotation.createTemporaryElement([pos]));
  } else {
    props.annotation.updateDrawingElement(props.annotation.createTemporaryElement([pos, pos]));
  }
}

function onPointerMove(event: PointerEvent) {
  if (!isDrawing.value || !drawStart.value) return;
  event.preventDefault();

  const pos = getCanvasPosition(event);
  const tool = props.annotation.activeTool.value;
  const drawing = props.annotation.drawingElement.value;
  if (!drawing || !tool) return;

  if (tool === 'pen' || tool === 'mosaic' || tool === 'highlight') {
    props.annotation.updateDrawingElement({
      ...drawing,
      points: [...drawing.points, pos],
    });
  } else {
    props.annotation.updateDrawingElement({
      ...drawing,
      points: [drawing.points[0], pos],
    });
  }
  requestRender();
}

function onPointerUp(event: PointerEvent) {
  try { (event.currentTarget as Element).releasePointerCapture(event.pointerId); } catch { /* ignore */ }
  if (!isDrawing.value) return;
  isDrawing.value = false;
  drawStart.value = null;
  props.annotation.commitDrawing();
  requestRender();
}

// ── 文字输入 ──────────────────────────────────────

function showTextInput(pos: { x: number; y: number }, event: PointerEvent) {
  textInputPosition.value = {
    x: event.clientX,
    y: event.clientY,
  };
  textInputValue.value = '';
  textInputVisible.value = true;
  nextTick(() => {
    textInputRef.value?.focus();
  });
}

function confirmTextInput() {
  if (textInputValue.value.trim()) {
    props.annotation.addTextElement(textInputPosition.value, textInputValue.value);
  }
  textInputVisible.value = false;
  textInputValue.value = '';
}

function onTextInputKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    confirmTextInput();
  } else if (event.key === 'Escape') {
    textInputVisible.value = false;
    textInputValue.value = '';
  }
}

// ── 导出合成图像 ──────────────────────────────────

function exportAnnotatedImage(): string | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;

  // 创建导出用的高分辨率 canvas
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = props.imageWidth * dpr.value;
  exportCanvas.height = props.imageHeight * dpr.value;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return null;

  // 绘制底图
  if (backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0, exportCanvas.width, exportCanvas.height);
  }

  // 绘制标注
  ctx.save();
  ctx.scale(dpr.value, dpr.value);
  for (const element of props.annotation.elements.value) {
    renderElement(ctx, element);
  }
  ctx.restore();

  return exportCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

defineExpose({ exportAnnotatedImage });

// ── 生命周期 ──────────────────────────────────────

onMounted(async () => {
  await loadBackgroundImage();
  requestRender();
  emit('ready');
});

onBeforeUnmount(() => {
  cancelPendingRender();
  backgroundImage = null;
});

// 标注元素或绘制中元素变化时触发重绘
watch(() => props.annotation.elements.value, () => requestRender(), { deep: true });
watch(() => props.annotation.drawingElement.value, () => requestRender());
</script>

<template>
  <div ref="containerRef" class="annotation-canvas">
    <canvas
      ref="canvasRef"
      :width="imageWidth * dpr"
      :height="imageHeight * dpr"
      :style="{ width: canvasStyleWidth, height: canvasStyleHeight }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    />
    <input
      v-if="textInputVisible"
      ref="textInputRef"
      v-model="textInputValue"
      class="annotation-canvas__text-input"
      :style="{
        left: `${textInputPosition.x}px`,
        top: `${textInputPosition.y}px`,
        color: annotation.style.value.color,
        fontSize: `${annotation.style.value.fontSize}px`,
      }"
      placeholder="输入文字…"
      @keydown="onTextInputKeyDown"
      @blur="confirmTextInput"
    />
  </div>
</template>

<style scoped>
.annotation-canvas {
  position: relative;
  display: inline-block;
  overflow: hidden;
  border-radius: 4px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.annotation-canvas canvas {
  display: block;
  cursor: crosshair;
}

.annotation-canvas__text-input {
  position: fixed;
  z-index: 20;
  min-width: 120px;
  padding: 4px 8px;
  border: 2px solid currentColor;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.95);
  outline: none;
  font-family: system-ui, sans-serif;
  transform: translateY(-50%);
}
</style>
