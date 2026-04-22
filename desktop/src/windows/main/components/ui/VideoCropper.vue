<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CompressQuality } from '@/contracts/media';
import UiButton from './UiButton.vue';
import UiDialog from './UiDialog.vue';
import UiIconButton from './UiIconButton.vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  videoUrl: string;
  /** 视频文件的真实磁盘路径（Electron File.path），FFmpeg 模式需要 */
  filePath?: string;
  targetWidth: number;
  targetHeight: number;
  processingMode?: 'browser' | 'ffmpeg';
  quality?: CompressQuality;
}>(), {
  filePath: '',
  processingMode: 'browser',
  quality: 'high',
});

const emit = defineEmits<{
  close: [];
  confirm: [videoDataUrl: string];
}>();

const cropperContainer = ref<HTMLElement | null>(null);
const videoElement = ref<HTMLVideoElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

const cropBox = ref({ x: 0, y: 0, width: 200, height: 200 });
const isDragging = ref(false);
const isResizing = ref(false);
const resizeHandle = ref<'tl' | 'tr' | 'bl' | 'br' | null>(null);
const dragStart = ref({ x: 0, y: 0 });

const containerSize = ref({ width: 0, height: 0 });
const videoDisplaySize = ref({ width: 0, height: 0 });
const videoOffset = ref({ x: 0, y: 0 });
const videoNaturalSize = ref({ width: 0, height: 0 });

const isProcessing = ref(false);
const processingProgress = ref(0);
const needsCrop = ref(false);

const cropBoxStyle = computed(() => ({
  left: `${cropBox.value.x}px`,
  top: `${cropBox.value.y}px`,
  width: `${cropBox.value.width}px`,
  height: `${cropBox.value.height}px`,
}));

const maskPath = computed(() => {
  const { x, y, width, height } = cropBox.value;
  const { width: cW, height: cH } = containerSize.value;
  return `M 0,0 L ${cW},0 L ${cW},${cH} L 0,${cH} Z M ${x},${y} L ${x + width},${y} L ${x + width},${y + height} L ${x},${y + height} Z`;
});

function initializeVideo() {
  if (!cropperContainer.value || !videoElement.value) return;

  const video = videoElement.value;
  const container = cropperContainer.value;
  const cW = container.clientWidth;
  const cH = container.clientHeight;

  containerSize.value = { width: cW, height: cH };

  const natW = video.videoWidth;
  const natH = video.videoHeight;
  videoNaturalSize.value = { width: natW, height: natH };

  // 检查是否需要裁剪
  needsCrop.value = natW > props.targetWidth || natH > props.targetHeight;

  // 缩放以适配容器
  const vRatio = natW / natH;
  const cRatio = cW / cH;
  let dW: number, dH: number;

  if (vRatio > cRatio) {
    dW = cW;
    dH = cW / vRatio;
  } else {
    dH = cH;
    dW = cH * vRatio;
  }

  videoDisplaySize.value = { width: dW, height: dH };
  videoOffset.value = { x: (cW - dW) / 2, y: (cH - dH) / 2 };

  // 初始化裁剪框 — 使用目标区域的宽高比
  const targetAspect = props.targetWidth / props.targetHeight;
  let boxW: number, boxH: number;

  if (needsCrop.value) {
    // 按目标比例设置裁剪框，占显示区域 70%
    const maxDim = Math.min(dW, dH) * 0.7;
    if (targetAspect > 1) {
      boxW = maxDim;
      boxH = maxDim / targetAspect;
    } else {
      boxH = maxDim;
      boxW = maxDim * targetAspect;
    }
  } else {
    boxW = dW;
    boxH = dH;
  }

  cropBox.value = {
    x: videoOffset.value.x + (dW - boxW) / 2,
    y: videoOffset.value.y + (dH - boxH) / 2,
    width: boxW,
    height: boxH,
  };
}

function handleMouseDown(e: MouseEvent, handle?: 'tl' | 'tr' | 'bl' | 'br') {
  e.preventDefault();
  e.stopPropagation();

  if (handle) {
    isResizing.value = true;
    resizeHandle.value = handle;
  } else {
    isDragging.value = true;
  }
  dragStart.value = { x: e.clientX, y: e.clientY };
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value && !isResizing.value) return;

  const dx = e.clientX - dragStart.value.x;
  const dy = e.clientY - dragStart.value.y;

  if (isDragging.value) {
    const newX = cropBox.value.x + dx;
    const newY = cropBox.value.y + dy;
    const minX = videoOffset.value.x;
    const minY = videoOffset.value.y;
    const maxX = videoOffset.value.x + videoDisplaySize.value.width - cropBox.value.width;
    const maxY = videoOffset.value.y + videoDisplaySize.value.height - cropBox.value.height;

    cropBox.value.x = Math.max(minX, Math.min(maxX, newX));
    cropBox.value.y = Math.max(minY, Math.min(maxY, newY));
  } else if (isResizing.value && resizeHandle.value) {
    const handle = resizeHandle.value;
    let newX = cropBox.value.x;
    let newY = cropBox.value.y;
    let newW = cropBox.value.width;
    let newH = cropBox.value.height;

    if (handle.includes('l')) { newX += dx; newW -= dx; }
    else if (handle.includes('r')) { newW += dx; }

    if (handle.includes('t')) { newY += dy; newH -= dy; }
    else if (handle.includes('b')) { newH += dy; }

    const minSize = 40;
    if (newW >= minSize && newH >= minSize) {
      const minX = videoOffset.value.x;
      const minY = videoOffset.value.y;
      const maxX = videoOffset.value.x + videoDisplaySize.value.width;
      const maxY = videoOffset.value.y + videoDisplaySize.value.height;

      if (newX >= minX && newX + newW <= maxX) {
        cropBox.value.x = newX;
        cropBox.value.width = newW;
      }
      if (newY >= minY && newY + newH <= maxY) {
        cropBox.value.y = newY;
        cropBox.value.height = newH;
      }
    }
  }

  dragStart.value = { x: e.clientX, y: e.clientY };
}

function handleMouseUp() {
  isDragging.value = false;
  isResizing.value = false;
  resizeHandle.value = null;
}

async function processCrop() {
  if (!videoElement.value || !canvas.value) return;

  if (!needsCrop.value && props.processingMode !== 'ffmpeg') {
    emit('confirm', props.videoUrl);
    return;
  }

  if (props.processingMode === 'ffmpeg') {
    // ─── FFmpeg 模式 ───
    isProcessing.value = true;
    processingProgress.value = 0;
    try {
      const scaleX = videoNaturalSize.value.width / videoDisplaySize.value.width;
      const scaleY = videoNaturalSize.value.height / videoDisplaySize.value.height;
      const srcX = (cropBox.value.x - videoOffset.value.x) * scaleX;
      const srcY = (cropBox.value.y - videoOffset.value.y) * scaleY;
      const srcW = cropBox.value.width * scaleX;
      const srcH = cropBox.value.height * scaleY;

      processingProgress.value = 30;

      // 根据质量等级动态决定输出最大尺寸
      // 高质量: 保留裁剪区域原始分辨率（上限 1920）
      // 中等:   上限 1280
      // 低:     上限 640
      const cropMaxSide = Math.max(srcW, srcH);
      const qualityMaxSize: Record<string, number> = { high: 1920, medium: 1280, low: 640 };
      const maxAllowed = qualityMaxSize[props.quality] ?? 1920;
      // 仅当裁剪区域实际超出上限时才缩放
      const maxSize = cropMaxSide > maxAllowed ? maxAllowed : undefined;

      // FFmpeg 需要磁盘真实路径，不能使用 blob URL
      const inputPath = props.filePath || props.videoUrl;
      const outputPath = await window.mediaApi.compressVideo(inputPath, {
        crop: needsCrop.value ? { x: Math.round(srcX), y: Math.round(srcY), width: Math.round(srcW), height: Math.round(srcH) } : undefined,
        maxSize,
        quality: props.quality,
      });
      processingProgress.value = 90;

      // 读取输出文件转为 data URL（短视频）
      const response = await fetch(`file://${outputPath}`);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = () => {
        isProcessing.value = false;
        processingProgress.value = 100;
        emit('confirm', reader.result as string);
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('FFmpeg 视频压缩失败，回退到浏览器处理:', error);
      isProcessing.value = false;
      await processCropBrowser();
    }
    return;
  }

  // ─── 浏览器模式（原始逻辑） ───
  await processCropBrowser();
}

async function processCropBrowser() {
  if (!videoElement.value || !canvas.value) return;

  isProcessing.value = true;
  processingProgress.value = 0;

  const video = videoElement.value;
  const scaleX = videoNaturalSize.value.width / videoDisplaySize.value.width;
  const scaleY = videoNaturalSize.value.height / videoDisplaySize.value.height;

  const srcX = (cropBox.value.x - videoOffset.value.x) * scaleX;
  const srcY = (cropBox.value.y - videoOffset.value.y) * scaleY;
  const srcW = cropBox.value.width * scaleX;
  const srcH = cropBox.value.height * scaleY;

  // 根据质量等级动态决定输出最大尺寸（浏览器模式）
  const qualityMaxDim: Record<string, number> = { high: 1920, medium: 1280, low: 640 };
  const maxDim = qualityMaxDim[props.quality] ?? 1920;
  const maxCropSide = Math.max(srcW, srcH);
  const scale = maxCropSide > maxDim ? maxDim / maxCropSide : 1;
  const outW = Math.round(srcW * scale);
  const outH = Math.round(srcH * scale);

  canvas.value.width = outW;
  canvas.value.height = outH;
  const ctx = canvas.value.getContext('2d')!;

  const stream = canvas.value.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });

  video.currentTime = 0;
  video.play();
  recorder.start();

  const duration = video.duration;
  let animId: number;

  function drawFrame() {
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    processingProgress.value = Math.min(99, Math.round((video.currentTime / duration) * 100));
    if (video.currentTime < duration && !video.paused) {
      animId = requestAnimationFrame(drawFrame);
    } else {
      recorder.stop();
      video.pause();
    }
  }

  drawFrame();

  const blob = await recordingDone;
  cancelAnimationFrame(animId!);

  const reader = new FileReader();
  reader.onload = () => {
    isProcessing.value = false;
    processingProgress.value = 100;
    emit('confirm', reader.result as string);
  };
  reader.readAsDataURL(blob);
}

watch(() => props.visible, (visible) => {
  if (visible && props.videoUrl) {
    setTimeout(initializeVideo, 200);
  }
});

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});

function handleDialogModelValueChange(value: boolean) {
  if (!value) emit('close');
}
</script>

<template>
  <UiDialog class="video-cropper" :model-value="visible" width="800px" max-width="800px"
    @update:modelValue="handleDialogModelValueChange">
    <template #header>
      <div class="vc-header">
        <h3>{{ needsCrop ? '裁剪视频' : '视频预览' }}</h3>
        <UiIconButton class="close-btn" variant="ghost" size="md" shape="square" title="关闭"
          @click="emit('close')">
          ✕
        </UiIconButton>
      </div>
    </template>

    <div class="vc-body">
      <div ref="cropperContainer" class="vc-container">
        <video
          ref="videoElement"
          :src="videoUrl"
          class="vc-video"
          :style="{
            width: `${videoDisplaySize.width}px`,
            height: `${videoDisplaySize.height}px`,
            left: `${videoOffset.x}px`,
            top: `${videoOffset.y}px`,
          }"
          autoplay
          loop
          muted
          playsinline
          @loadedmetadata="initializeVideo"
        />

        <template v-if="needsCrop">
          <svg class="vc-mask" :width="containerSize.width" :height="containerSize.height">
            <path :d="maskPath" fill="rgba(0, 0, 0, 0.5)" fill-rule="evenodd" />
          </svg>

          <div class="vc-crop-box" :style="cropBoxStyle" @mousedown="handleMouseDown($event)">
            <div class="vc-grid-lines">
              <div class="vc-grid-line vc-grid-line-h" style="top: 33.33%" />
              <div class="vc-grid-line vc-grid-line-h" style="top: 66.66%" />
              <div class="vc-grid-line vc-grid-line-v" style="left: 33.33%" />
              <div class="vc-grid-line vc-grid-line-v" style="left: 66.66%" />
            </div>
            <div class="vc-handle vc-handle-tl" @mousedown.stop="handleMouseDown($event, 'tl')" />
            <div class="vc-handle vc-handle-tr" @mousedown.stop="handleMouseDown($event, 'tr')" />
            <div class="vc-handle vc-handle-bl" @mousedown.stop="handleMouseDown($event, 'bl')" />
            <div class="vc-handle vc-handle-br" @mousedown.stop="handleMouseDown($event, 'br')" />
          </div>
        </template>
      </div>

      <div class="vc-tips">
        <p v-if="isProcessing">
          ⏳ 正在处理视频… {{ processingProgress }}%
        </p>
        <p v-else-if="needsCrop">
          💡 拖动裁剪框移动位置，拖动四角调整大小
        </p>
        <p v-else>
          ✅ 视频尺寸适合目标区域，无需裁剪
        </p>
      </div>
    </div>

    <template #footer>
      <div class="vc-footer">
        <UiButton variant="secondary" @click="emit('close')" :disabled="isProcessing">取消</UiButton>
        <UiButton variant="primary" @click="processCrop" :disabled="isProcessing">
          {{ isProcessing ? '处理中…' : needsCrop ? '确认裁剪' : '确认使用' }}
        </UiButton>
      </div>
    </template>

    <canvas ref="canvas" style="display: none" />
  </UiDialog>
</template>

<style lang="scss" scoped>
.video-cropper {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.vc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: var(--ui-border-width-thin) solid var(--modal-header-border-color);

  h3 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 18px;
    font-weight: 600;
  }
}

.vc-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.vc-container {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: var(--modal-preview-bg-color);
  min-height: 360px;
  user-select: none;
}

.vc-video {
  position: absolute;
  pointer-events: none;
  max-width: none;
}

.vc-mask {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.vc-crop-box {
  position: absolute;
  border: var(--ui-border-width-strong) solid var(--primary-color);
  cursor: move;

  &:hover .vc-grid-lines {
    opacity: 1;
  }
}

.vc-grid-lines {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.vc-grid-line {
  position: absolute;
  background: rgba(255, 255, 255, 0.3);

  &-h {
    left: 0;
    right: 0;
    height: 1px;
  }

  &-v {
    top: 0;
    bottom: 0;
    width: 1px;
  }
}

.vc-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--ui-text-inverse);
  border: var(--ui-border-width-strong) solid var(--primary-color);
  border-radius: 50%;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.3);
    box-shadow: var(--ui-shadow-sm);
  }

  &-tl { top: -6px; left: -6px; cursor: nwse-resize; }
  &-tr { top: -6px; right: -6px; cursor: nesw-resize; }
  &-bl { bottom: -6px; left: -6px; cursor: nesw-resize; }
  &-br { bottom: -6px; right: -6px; cursor: nwse-resize; }
}

.vc-tips {
  padding: 12px 24px;
  background: var(--modal-preview-bg-color);
  border-top: var(--ui-border-width-thin) solid var(--modal-header-border-color);

  p {
    margin: 0;
    color: var(--modal-hint-color);
    font-size: 13px;
    text-align: center;
  }
}

.vc-footer {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  border-top: var(--ui-border-width-thin) solid var(--modal-header-border-color);

  .ui-button {
    flex: 1;
  }
}
</style>
