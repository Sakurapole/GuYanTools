<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  image: string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [croppedImage: string];
}>();

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

    // 初始化裁剪框位置（居中，占图片60%）
    const initialSize = Math.min(displayWidth, displayHeight) * 0.6;
    cropBox.value = {
      x: imageOffset.value.x + (displayWidth - initialSize) / 2,
      y: imageOffset.value.y + (displayHeight - initialSize) / 2,
      width: initialSize,
      height: initialSize,
    };
  };
  img.src = props.image;
};

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
    let newX = cropBox.value.x;
    let newY = cropBox.value.y;
    let newWidth = cropBox.value.width;
    let newHeight = cropBox.value.height;

    if (handle.includes('l')) {
      newX += deltaX;
      newWidth -= deltaX;
    } else if (handle.includes('r')) {
      newWidth += deltaX;
    }

    if (handle.includes('t')) {
      newY += deltaY;
      newHeight -= deltaY;
    } else if (handle.includes('b')) {
      newHeight += deltaY;
    }

    // 限制最小尺寸
    const minSize = 50;
    if (newWidth >= minSize && newHeight >= minSize) {
      // 限制在图片范围内
      const minX = imageOffset.value.x;
      const minY = imageOffset.value.y;
      const maxX = imageOffset.value.x + imageSize.value.width;
      const maxY = imageOffset.value.y + imageSize.value.height;

      if (newX >= minX && newX + newWidth <= maxX) {
        cropBox.value.x = newX;
        cropBox.value.width = newWidth;
      }

      if (newY >= minY && newY + newHeight <= maxY) {
        cropBox.value.y = newY;
        cropBox.value.height = newHeight;
      }
    }
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
const cropImage = () => {
  if (!canvas.value || !imageElement.value) return;

  const img = imageElement.value;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  // 计算实际图片上的裁剪区域
  const scaleX = img.naturalWidth / imageSize.value.width;
  const scaleY = img.naturalHeight / imageSize.value.height;

  const sourceX = (cropBox.value.x - imageOffset.value.x) * scaleX;
  const sourceY = (cropBox.value.y - imageOffset.value.y) * scaleY;
  const sourceWidth = cropBox.value.width * scaleX;
  const sourceHeight = cropBox.value.height * scaleY;

  // 设置画布尺寸
  canvas.value.width = sourceWidth;
  canvas.value.height = sourceHeight;

  // 裁剪图片
  ctx.drawImage(
    img,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight
  );

  // 转换为base64
  const croppedImage = canvas.value.toDataURL('image/png');
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
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="image-cropper-overlay" @click="emit('close')">
      <div class="image-cropper" @click.stop>
        <div class="cropper-header">
          <h3>裁剪图片</h3>
          <button class="close-btn" @click="emit('close')">✕</button>
        </div>

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

        <div class="cropper-footer">
          <button class="btn btn-cancel" @click="emit('close')">取消</button>
          <button class="btn btn-confirm" @click="cropImage">确认裁剪</button>
        </div>

        <!-- 隐藏的canvas用于裁剪 -->
        <canvas ref="canvas" style="display: none"></canvas>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.image-cropper-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--modal-overlay-bg-color);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  animation: fadeIn 0.2s ease-out;
  transition: background 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.image-cropper {
  background: var(--modal-bg-color);
  border-radius: 16px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px var(--modal-shadow-color);
  border: 1px solid var(--modal-border-color);
  animation: slideUp 0.3s ease-out;
  transition: background 0.3s ease, box-shadow 0.3s ease, border 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.cropper-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--modal-header-border-color);
  transition: border 0.3s ease;

  h3 {
    margin: 0;
    color: var(--text-primary-color);
    font-size: 18px;
    font-weight: 600;
    transition: color 0.3s ease;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--modal-close-btn-color);
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: all 0.2s;

    &:hover {
      background: var(--modal-close-btn-hover-bg-color);
      color: var(--text-primary-color);
    }
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
  border: 2px solid var(--primary-color);
  cursor: move;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
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
  background: white;
  border: 2px solid var(--primary-color);
  border-radius: 50%;
  transition: all 0.2s;

  &:hover {
    transform: scale(1.3);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
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
  border-top: 1px solid var(--modal-header-border-color);
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
  border-top: 1px solid var(--modal-header-border-color);
  transition: border 0.3s ease;

  .btn {
    flex: 1;
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    &:active {
      transform: scale(0.98);
    }

    &.btn-cancel {
      background: var(--modal-btn-cancel-bg-color);
      color: var(--text-primary-color);

      &:hover {
        background: var(--modal-btn-cancel-hover-bg-color);
      }
    }

    &.btn-confirm {
      background: linear-gradient(135deg, var(--primary-color) 0%, #764ba2 100%);
      color: white;

      &:hover {
        box-shadow: 0 4px 12px var(--modal-btn-confirm-shadow-color);
      }
    }
  }
}
</style>
