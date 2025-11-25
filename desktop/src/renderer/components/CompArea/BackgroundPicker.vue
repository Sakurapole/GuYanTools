<script lang="ts" setup>
import { computed, ref } from 'vue';
import ImageCropper from './ImageCropper.vue';

const props = defineProps<{
  visible: boolean;
  currentBackground?: string;
  currentBackgroundImage?: string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [background: { color?: string; image?: string }];
}>();

const activeTab = ref<'color' | 'image'>('color');
const selectedColor = ref(props.currentBackground || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)');
const selectedImage = ref(props.currentBackgroundImage || '');
const imageInput = ref<HTMLInputElement | null>(null);

// 图片裁剪相关
const showCropper = ref(false);
const originalImage = ref('');

// 预设的渐变色
const presetGradients = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)',
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  'linear-gradient(135deg, #f8b500 0%, #fceabb 100%)',
];

// 预设的纯色
const presetColors = [
  '#667eea',
  '#f093fb',
  '#4facfe',
  '#43e97b',
  '#fa709a',
  '#30cfd0',
  '#a8edea',
  '#ff9a9e',
  '#ffecd2',
  '#ff6e7f',
  '#e0c3fc',
  '#f8b500',
];

const handleColorSelect = (color: string) => {
  selectedColor.value = color;
};

const handleImageSelect = () => {
  imageInput.value?.click();
};

const handleImageChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      originalImage.value = e.target?.result as string;
      showCropper.value = true;
    };
    reader.readAsDataURL(file);
  }
};

const handleCropperClose = () => {
  showCropper.value = false;
  originalImage.value = '';
  // 清空文件选择
  if (imageInput.value) {
    imageInput.value.value = '';
  }
};

const handleCropperConfirm = (croppedImage: string) => {
  selectedImage.value = croppedImage;
  showCropper.value = false;
  originalImage.value = '';
};

const handleClearImage = () => {
  selectedImage.value = '';
  if (imageInput.value) {
    imageInput.value.value = '';
  }
};

const handleConfirm = () => {
  if (activeTab.value === 'color') {
    emit('confirm', { color: selectedColor.value, image: '' });
  } else {
    emit('confirm', { color: '', image: selectedImage.value });
  }
  emit('close');
};

const handleClose = () => {
  emit('close');
};

const previewStyle = computed(() => {
  if (activeTab.value === 'color') {
    return {
      background: selectedColor.value,
    };
  } else {
    return selectedImage.value
      ? {
        backgroundImage: `url(${selectedImage.value})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
      : {
        background: '#2a2a2a',
      };
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="background-picker-overlay" @click="handleClose">
      <div class="background-picker" @click.stop>
        <div class="picker-header">
          <h3>更换背景</h3>
          <button class="close-btn" @click="handleClose">✕</button>
        </div>

        <div class="picker-tabs">
          <button class="tab-btn" :class="{ active: activeTab === 'color' }" @click="activeTab = 'color'">
            颜色
          </button>
          <button class="tab-btn" :class="{ active: activeTab === 'image' }" @click="activeTab = 'image'">
            图片
          </button>
        </div>

        <div class="picker-preview">
          <div class="preview-box" :style="previewStyle">
            <span class="preview-text">预览</span>
          </div>
        </div>

        <div class="picker-content">
          <!-- 颜色选择 -->
          <div v-if="activeTab === 'color'" class="color-section">
            <div class="section-title">渐变色</div>
            <div class="gradient-grid">
              <div v-for="(gradient, index) in presetGradients" :key="index" class="gradient-item"
                :class="{ selected: selectedColor === gradient }" :style="{ background: gradient }"
                @click="handleColorSelect(gradient)">
                <div v-if="selectedColor === gradient" class="selected-icon">✓</div>
              </div>
            </div>

            <div class="section-title">纯色</div>
            <div class="color-grid">
              <div v-for="(color, index) in presetColors" :key="index" class="color-item"
                :class="{ selected: selectedColor === color }" :style="{ background: color }"
                @click="handleColorSelect(color)">
                <div v-if="selectedColor === color" class="selected-icon">✓</div>
              </div>
            </div>
          </div>

          <!-- 图片选择 -->
          <div v-if="activeTab === 'image'" class="image-section">
            <div class="image-upload">
              <input ref="imageInput" type="file" accept="image/*" style="display: none" @change="handleImageChange" />
              <button class="upload-btn" @click="handleImageSelect">
                <span class="upload-icon">📁</span>
                <span>选择图片</span>
              </button>
              <button v-if="selectedImage" class="clear-btn" @click="handleClearImage">
                清除
              </button>
            </div>
            <p class="upload-hint">支持 JPG, PNG, GIF 格式</p>
          </div>
        </div>

        <div class="picker-footer">
          <button class="btn btn-cancel" @click="handleClose">取消</button>
          <button class="btn btn-confirm" @click="handleConfirm">确认</button>
        </div>
      </div>

      <!-- 图片裁剪器 -->
      <ImageCropper :visible="showCropper" :image="originalImage" @close="handleCropperClose"
        @confirm="handleCropperConfirm" />
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.background-picker-overlay {
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
  z-index: 10000;
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

.background-picker {
  background: var(--modal-bg-color);
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
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

.picker-header {
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

.picker-tabs {
  display: flex;
  padding: 16px 24px 0;
  gap: 8px;
  border-bottom: 1px solid var(--modal-header-border-color);
  transition: border 0.3s ease;

  .tab-btn {
    flex: 1;
    padding: 10px 16px;
    background: none;
    border: none;
    color: var(--modal-tab-text-color);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 8px 8px 0 0;
    transition: all 0.2s;
    position: relative;

    &:hover {
      background: var(--surface-hover-color);
      color: var(--text-primary-color);
    }

    &.active {
      color: var(--modal-tab-active-color);
      background: var(--modal-tab-active-bg-color);

      &::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--primary-color);
      }
    }
  }
}

.picker-preview {
  padding: 20px 24px;
  background: var(--modal-preview-bg-color);
  transition: background 0.3s ease;

  .preview-box {
    width: 100%;
    height: 120px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px var(--grid-item-shadow-color);

    .preview-text {
      color: var(--grid-item-text-color);
      font-size: 16px;
      font-weight: 600;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      transition: color 0.3s ease;
    }
  }
}

.picker-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;

  .section-title {
    color: var(--modal-section-title-color);
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 12px;
    transition: color 0.3s ease;
  }

  .gradient-grid,
  .color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }

  .gradient-item,
  .color-item {
    aspect-ratio: 1;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
    transition: all 0.2s;
    border: 2px solid transparent;

    &:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    &.selected {
      border-color: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .selected-icon {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 24px;
      font-weight: bold;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }
  }

  .image-section {
    .image-upload {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;

      .upload-btn,
      .clear-btn {
        flex: 1;
        padding: 12px 20px;
        border: 2px dashed var(--modal-upload-border-color);
        background: var(--modal-upload-bg-color);
        color: var(--text-primary-color);
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s;

        &:hover {
          background: var(--modal-upload-hover-bg-color);
          border-color: var(--primary-color);
        }

        .upload-icon {
          font-size: 18px;
        }
      }

      .clear-btn {
        flex: 0 0 auto;
        border-style: solid;
        background: var(--menu-danger-hover-bg-color);
        border-color: rgba(239, 68, 68, 0.3);

        &:hover {
          background: rgba(239, 68, 68, 0.25);
          border-color: rgba(239, 68, 68, 0.5);
        }
      }
    }

    .upload-hint {
      color: var(--modal-hint-color);
      font-size: 12px;
      margin: 0;
      text-align: center;
      transition: color 0.3s ease;
    }
  }
}

.picker-footer {
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
