<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CompressQuality } from '@/contracts/media';
import UiButton from '../ui/UiButton.vue';
import UiDialog from '../ui/UiDialog.vue';
import UiIconButton from '../ui/UiIconButton.vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  image: string;
  targetWidth?: number;
  targetHeight?: number;
  processingMode?: 'canvas' | 'ffmpeg';
  quality?: CompressQuality;
}>(), {
  targetWidth: 1,
  targetHeight: 1,
  processingMode: 'canvas',
  quality: 'high',
});

const emit = defineEmits<{
  close: [];
  confirm: [croppedImage: string];
}>();

const isProcessing = ref(false);

const cropperContainer = ref<HTMLElement | null>(null);
const imageElement = ref<HTMLImageElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

// 裁剪框状态
const cropBox = ref({
  x: 0,
  y: 0,
  width: 200,
  height: 200,
});

const isDragging = ref(false);
const isResizing = ref(false);
const resizeHandle = ref<'tl' | 'tr' | 'bl' | 'br' | null>(null);
const dragStart = ref({ x: 0, y: 0 });

// 图片容器尺寸
const containerSize = ref({ width: 0, height: 0 });
const imageSize = ref({ width: 0, height: 0 });
const imageOffset = ref({ x: 0, y: 0 });
const MAX_CROPPED_OUTPUT_SIZE = 1920;

const targetAspect = computed(() => {
  if (props.targetWidth > 0 && props.targetHeight > 0) {
    return props.targetWidth / props.targetHeight;
  }
  return 1;
});

// 计算裁剪框样式
const cropBoxStyle = computed(() => ({
  left: `${cropBox.value.x}px`,
  top: `${cropBox.value.y}px`,
  width: `${cropBox.value.width}px`,
  height: `${cropBox.value.height}px`,
}));

// 计算遮罩路径
const maskPath = computed(() => {
  const { x, y, width, height } = cropBox.value;
  const { width: cWidth, height: cHeight } = containerSize.value;

  return `
    M 0,0 
    L ${cWidth},0 
    L ${cWidth},${cHeight} 
    L 0,${cHeight} 
    Z
    M ${x},${y}
    L ${x + width},${y}
    L ${x + width},${y + height}
    L ${x},${y + height}
    Z
  `;
});

// 初始化图片
const initializeImage = () => {
  if (!cropperContainer.value || !imageElement.value || !props.image) return;

  const img = new Image();
  img.onload = () => {
    const container = cropperContainer.value!;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    containerSize.value = {
      width: containerWidth,
      height: containerHeight,
    };

    // 计算图片适配尺寸
    const imgRatio = img.width / img.height;
    const containerRatio = containerWidth / containerHeight;

    let displayWidth, displayHeight;
    if (imgRatio > containerRatio) {
      displayWidth = containerWidth;
      displayHeight = containerWidth / imgRatio;
    } else {
      displayHeight = containerHeight;
      displayWidth = containerHeight * imgRatio;
    }

    imageSize.value = {
      width: displayWidth,
      height: displayHeight,
    };

    imageOffset.value = {
      x: (containerWidth - displayWidth) / 2,
      y: (containerHeight - displayHeight) / 2,
    };

    // 初始化裁剪框位置（按目标区域比例居中）
    const { width: initialWidth, height: initialHeight } = getFittedCropSize(displayWidth, displayHeight, targetAspect.value, 0.72);
    cropBox.value = {
      x: imageOffset.value.x + (displayWidth - initialWidth) / 2,
      y: imageOffset.value.y + (displayHeight - initialHeight) / 2,
      width: initialWidth,
      height: initialHeight,
    };
  };
  img.src = props.image;
};

function getFittedCropSize(maxWidth: number, maxHeight: number, aspect: number, scale = 1) {
  const boundedAspect = aspect > 0 ? aspect : 1;
  const scaledMaxWidth = maxWidth * scale;
  const scaledMaxHeight = maxHeight * scale;
  let width = scaledMaxWidth;
  let height = width / boundedAspect;

  if (height > scaledMaxHeight) {
    height = scaledMaxHeight;
    width = height * boundedAspect;
  }

  return { width, height };
}

// 处理拖动开始
const handleMouseDown = (e: MouseEvent, handle?: 'tl' | 'tr' | 'bl' | 'br') => {
  e.preventDefault();
  e.stopPropagation();

  if (handle) {
    isResizing.value = true;
    resizeHandle.value = handle;
  } else {
    isDragging.value = true;
  }

  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
  };
};

// 处理鼠标移动
const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value && !isResizing.value) return;

  const deltaX = e.clientX - dragStart.value.x;
  const deltaY = e.clientY - dragStart.value.y;

  if (isDragging.value) {
    // 拖动裁剪框
    const newX = cropBox.value.x + deltaX;
    const newY = cropBox.value.y + deltaY;

    // 限制在图片范围内
    const minX = imageOffset.value.x;
    const minY = imageOffset.value.y;
    const maxX = imageOffset.value.x + imageSize.value.width - cropBox.value.width;
    const maxY = imageOffset.value.y + imageSize.value.height - cropBox.value.height;

    cropBox.value.x = Math.max(minX, Math.min(maxX, newX));
    cropBox.value.y = Math.max(minY, Math.min(maxY, newY));
  } else if (isResizing.value && resizeHandle.value) {
    // 调整裁剪框大小
    const handle = resizeHandle.value;
    const aspect = targetAspect.value;
    const minX = imageOffset.value.x;
    const minY = imageOffset.value.y;
    const maxX = imageOffset.value.x + imageSize.value.width;
    const maxY = imageOffset.value.y + imageSize.value.height;
    const fromLeft = handle.includes('l');
    const fromTop = handle.includes('t');
    const anchorX = fromLeft ? cropBox.value.x + cropBox.value.width : cropBox.value.x;
    const anchorY = fromTop ? cropBox.value.y + cropBox.value.height : cropBox.value.y;
    const maxWidth = fromLeft ? anchorX - minX : maxX - anchorX;
    const maxHeight = fromTop ? anchorY - minY : maxY - anchorY;
    const proposedWidth = fromLeft ? cropBox.value.width - deltaX : cropBox.value.width + deltaX;
    const proposedHeight = fromTop ? cropBox.value.height - deltaY : cropBox.value.height + deltaY;
    const minWidth = Math.min(50, maxWidth);
    const minHeight = Math.min(minWidth / aspect, maxHeight);
    let nextWidth = Math.abs(deltaX) >= Math.abs(deltaY)
      ? proposedWidth
      : proposedHeight * aspect;
    nextWidth = Math.max(minWidth, Math.min(maxWidth, nextWidth));
    let nextHeight = nextWidth / aspect;

    if (nextHeight > maxHeight) {
      nextHeight = Math.max(minHeight, maxHeight);
      nextWidth = nextHeight * aspect;
      if (nextWidth > maxWidth) {
        nextWidth = maxWidth;
        nextHeight = nextWidth / aspect;
      }
    }

    cropBox.value = {
      x: fromLeft ? anchorX - nextWidth : anchorX,
      y: fromTop ? anchorY - nextHeight : anchorY,
      width: nextWidth,
      height: nextHeight,
    };
  }

  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
  };
};

// 处理鼠标释放
const handleMouseUp = () => {
  isDragging.value = false;
  isResizing.value = false;
  resizeHandle.value = null;
};

// 裁剪图片
const cropImage = async () => {
  if (!canvas.value || !imageElement.value) return;

  const img = imageElement.value;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  const scaleX = img.naturalWidth / imageSize.value.width;
  const scaleY = img.naturalHeight / imageSize.value.height;
  const sourceX = (cropBox.value.x - imageOffset.value.x) * scaleX;
  const sourceY = (cropBox.value.y - imageOffset.value.y) * scaleY;
  const sourceWidth = cropBox.value.width * scaleX;
  const sourceHeight = cropBox.value.height * scaleY;

  if (props.processingMode === 'ffmpeg') {
    isProcessing.value = true;
    try {
      const result = await window.mediaApi.compressImage(props.image, {
        crop: { x: Math.round(sourceX), y: Math.round(sourceY), width: Math.round(sourceWidth), height: Math.round(sourceHeight) },
        maxSize: MAX_CROPPED_OUTPUT_SIZE,
        quality: props.quality,
        format: 'jpeg',
      });
      emit('confirm', result);
    } catch (error) {
      console.error('FFmpeg 图片压缩失败，回退到 Canvas:', error);
      cropImageCanvas(ctx, img, sourceX, sourceY, sourceWidth, sourceHeight);
    } finally {
      isProcessing.value = false;
    }
  } else {
    cropImageCanvas(ctx, img, sourceX, sourceY, sourceWidth, sourceHeight);
  }
};

function cropImageCanvas(ctx: CanvasRenderingContext2D, img: HTMLImageElement, sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number) {
  const maxSourceSide = Math.max(sourceWidth, sourceHeight);
  const outputScale = maxSourceSide > MAX_CROPPED_OUTPUT_SIZE ? MAX_CROPPED_OUTPUT_SIZE / maxSourceSide : 1;
  const outputWidth = Math.max(1, Math.round(sourceWidth * outputScale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * outputScale));
  canvas.value!.width = outputWidth;
  canvas.value!.height = outputHeight;
  ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
  const croppedImage = canvas.value!.toDataURL('image/jpeg', 0.92);
  emit('confirm', croppedImage);
};

// 处理窗口大小变化
const handleResize = () => {
  initializeImage();
};

// 监听图片变化
watch(() => props.image, (newImage) => {
  if (newImage && props.visible) {
    setTimeout(initializeImage, 100);
  }
});

watch(() => props.visible, (visible) => {
  if (visible && props.image) {
    setTimeout(initializeImage, 100);
  }
});

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('resize', handleResize);

  if (props.image && props.visible) {
    setTimeout(initializeImage, 100);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('resize', handleResize);
});

const handleDialogModelValueChange = (value: boolean) => {
  if (!value) {
    emit('close');
  }
};
</script>

<template>
  <UiDialog class="image-cropper" :model-value="visible" width="800px" max-width="800px" :close-on-mask="false"
    @update:modelValue="handleDialogModelValueChange">
    <template #header>
        <div class="cropper-header">
          <h3>裁剪图片</h3>
          <UiIconButton class="close-btn" variant="ghost" size="md" shape="square" title="关闭"
            @click="emit('close')">
            ✕
          </UiIconButton>
        </div>
    </template>

    <div class="cropper-body">
      <div ref="cropperContainer" class="cropper-container">
        <!-- 图片 -->
        <img ref="imageElement" :src="image" class="cropper-image" :style="{
          width: `${imageSize.width}px`,
          height: `${imageSize.height}px`,
          left: `${imageOffset.x}px`,
          top: `${imageOffset.y}px`,
        }" draggable="false" />

        <!-- 遮罩 -->
        <svg class="cropper-mask" :width="containerSize.width" :height="containerSize.height">
          <path :d="maskPath" fill="rgba(0, 0, 0, 0.5)" fill-rule="evenodd" />
        </svg>

        <!-- 裁剪框 -->
        <div class="crop-box" :style="cropBoxStyle" @mousedown="handleMouseDown($event)">
          <!-- 网格线 -->
          <div class="grid-lines">
            <div class="grid-line grid-line-h" style="top: 33.33%"></div>
            <div class="grid-line grid-line-h" style="top: 66.66%"></div>
            <div class="grid-line grid-line-v" style="left: 33.33%"></div>
            <div class="grid-line grid-line-v" style="left: 66.66%"></div>
          </div>

          <!-- 调整手柄 -->
          <div class="resize-handle handle-tl" @mousedown.stop="handleMouseDown($event, 'tl')"></div>
          <div class="resize-handle handle-tr" @mousedown.stop="handleMouseDown($event, 'tr')"></div>
          <div class="resize-handle handle-bl" @mousedown.stop="handleMouseDown($event, 'bl')"></div>
          <div class="resize-handle handle-br" @mousedown.stop="handleMouseDown($event, 'br')"></div>
        </div>
      </div>

      <div class="cropper-tips">
        <p>💡 拖动裁剪框移动位置，拖动四角调整大小</p>
      </div>
    </div>

    <template #footer>
      <div class="cropper-footer">
        <UiButton variant="secondary" @click="emit('close')">取消</UiButton>
        <UiButton variant="primary" @click="cropImage">确认裁剪</UiButton>
      </div>
    </template>

    <!-- 隐藏的canvas用于裁剪 -->
    <canvas ref="canvas" style="display: none"></canvas>
  </UiDialog>
</template>

<style lang="scss" scoped>
.image-cropper {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.cropper-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: var(--ui-border-width-thin) solid var(--modal-header-border-color);
  transition: border 0.3s ease;

  h3 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 18px;
    font-weight: 600;
    transition: color 0.3s ease;
  }

  .close-btn {
    font-size: 20px;
  }
}

.cropper-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cropper-container {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: var(--modal-preview-bg-color);
  min-height: 400px;
  user-select: none;
  transition: background 0.3s ease;
}

.cropper-image {
  position: absolute;
  pointer-events: none;
  max-width: none;
}

.cropper-mask {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.crop-box {
  position: absolute;
  border: var(--ui-border-width-strong) solid var(--primary-color);
  cursor: move;
  box-shadow: 0 0 0 9999px var(--ui-overlay-mask-medium);
  transition: border-color 0.3s ease;

  &:hover {
    .grid-lines {
      opacity: 1;
    }
  }
}

.grid-lines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0;
  transition: opacity 0.2s;

  .grid-line {
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
}

.resize-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--ui-text-inverse);
  border: var(--ui-border-width-strong) solid var(--primary-color);
  border-radius: 50%;
  transition: all 0.2s;

  &:hover {
    transform: scale(1.3);
    box-shadow: var(--ui-shadow-sm);
  }

  &.handle-tl {
    top: -6px;
    left: -6px;
    cursor: nwse-resize;
  }

  &.handle-tr {
    top: -6px;
    right: -6px;
    cursor: nesw-resize;
  }

  &.handle-bl {
    bottom: -6px;
    left: -6px;
    cursor: nesw-resize;
  }

  &.handle-br {
    bottom: -6px;
    right: -6px;
    cursor: nwse-resize;
  }
}

.cropper-tips {
  padding: 12px 24px;
  background: var(--modal-preview-bg-color);
  border-top: var(--ui-border-width-thin) solid var(--modal-header-border-color);
  transition: background 0.3s ease, border 0.3s ease;

  p {
    margin: 0;
    color: var(--modal-hint-color);
    font-size: 13px;
    text-align: center;
    transition: color 0.3s ease;
  }
}

.cropper-footer {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  border-top: var(--ui-border-width-thin) solid var(--modal-header-border-color);
  transition: border 0.3s ease;

  .ui-button {
    flex: 1;
  }
}
</style>
