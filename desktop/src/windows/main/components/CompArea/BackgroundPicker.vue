<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import ImageCropper from './ImageCropper.vue';
import UiButton from '../ui/UiButton.vue';
import UiDialog from '../ui/UiDialog.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTabs from '../ui/UiTabs.vue';

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

// ─── 自定义颜色 (画板 + 取色器 + 直接输入) ───
const showCustomPicker = ref(false);
const satBrightCanvas = ref<HTMLCanvasElement | null>(null);
const hueSlider = ref<HTMLCanvasElement | null>(null);
const customHue = ref(0);
const customSat = ref(100);
const customBright = ref(100);
const customAlpha = ref(1);
const hexInput = ref('#667eea');
const rgbaInput = ref('rgba(102, 126, 234, 1)');
const colorInputMode = ref<'hex' | 'rgba'>('hex');
const isDraggingSB = ref(false);
const isDraggingHue = ref(false);
const eyeDropperSupported = ref(typeof (window as any).EyeDropper !== 'undefined');

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)      { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : Math.round((d / max) * 100);
  const v = Math.round(max * 100);
  return [h, s, v];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) {
    const short = hex.replace('#', '').match(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (!short) return null;
    return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16)];
  }
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function parseRgba(str: string): { r: number; g: number; b: number; a: number } | null {
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
}

function getCustomColorCss(): string {
  const [r, g, b] = hsvToRgb(customHue.value, customSat.value, customBright.value);
  if (customAlpha.value < 1) return `rgba(${r}, ${g}, ${b}, ${customAlpha.value})`;
  return rgbToHex(r, g, b);
}

function syncInputsFromHSV() {
  const [r, g, b] = hsvToRgb(customHue.value, customSat.value, customBright.value);
  hexInput.value = rgbToHex(r, g, b);
  rgbaInput.value = `rgba(${r}, ${g}, ${b}, ${customAlpha.value})`;
}

function drawSatBrightCanvas() {
  const canvas = satBrightCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  const [hr, hg, hb] = hsvToRgb(customHue.value, 100, 100);
  ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
  ctx.fillRect(0, 0, w, h);
  const wGrad = ctx.createLinearGradient(0, 0, w, 0);
  wGrad.addColorStop(0, 'rgba(255,255,255,1)');
  wGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = wGrad;
  ctx.fillRect(0, 0, w, h);
  const bGrad = ctx.createLinearGradient(0, 0, 0, h);
  bGrad.addColorStop(0, 'rgba(0,0,0,0)');
  bGrad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = bGrad;
  ctx.fillRect(0, 0, w, h);
}

function drawHueSlider() {
  const canvas = hueSlider.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, '#ff0000');
  gradient.addColorStop(1/6, '#ffff00');
  gradient.addColorStop(2/6, '#00ff00');
  gradient.addColorStop(3/6, '#00ffff');
  gradient.addColorStop(4/6, '#0000ff');
  gradient.addColorStop(5/6, '#ff00ff');
  gradient.addColorStop(1, '#ff0000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

const sbPointerStyle = computed(() => ({
  left: `${(customSat.value / 100) * 100}%`,
  top: `${((100 - customBright.value) / 100) * 100}%`,
}));

const huePointerStyle = computed(() => ({
  left: `${(customHue.value / 360) * 100}%`,
}));

const customColorPreview = computed(() => getCustomColorCss());

function handleSBMouseDown(e: MouseEvent) {
  isDraggingSB.value = true;
  updateSBFromEvent(e);
  window.addEventListener('mousemove', handleSBMouseMove);
  window.addEventListener('mouseup', handleSBMouseUp);
}
function handleSBMouseMove(e: MouseEvent) { if (isDraggingSB.value) updateSBFromEvent(e); }
function handleSBMouseUp() {
  isDraggingSB.value = false;
  window.removeEventListener('mousemove', handleSBMouseMove);
  window.removeEventListener('mouseup', handleSBMouseUp);
}
function updateSBFromEvent(e: MouseEvent) {
  const canvas = satBrightCanvas.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
  customSat.value = Math.round((x / rect.width) * 100);
  customBright.value = Math.round((1 - y / rect.height) * 100);
  syncInputsFromHSV();
  selectedColor.value = getCustomColorCss();
}

function handleHueMouseDown(e: MouseEvent) {
  isDraggingHue.value = true;
  updateHueFromEvent(e);
  window.addEventListener('mousemove', handleHueMouseMove);
  window.addEventListener('mouseup', handleHueMouseUp);
}
function handleHueMouseMove(e: MouseEvent) { if (isDraggingHue.value) updateHueFromEvent(e); }
function handleHueMouseUp() {
  isDraggingHue.value = false;
  window.removeEventListener('mousemove', handleHueMouseMove);
  window.removeEventListener('mouseup', handleHueMouseUp);
}
function updateHueFromEvent(e: MouseEvent) {
  const canvas = hueSlider.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  customHue.value = Math.round((x / rect.width) * 360);
  drawSatBrightCanvas();
  syncInputsFromHSV();
  selectedColor.value = getCustomColorCss();
}

function handleAlphaInput(e: Event) {
  customAlpha.value = Number((e.target as HTMLInputElement).value) / 100;
  syncInputsFromHSV();
  selectedColor.value = getCustomColorCss();
}

function handleHexInput() {
  const rgb = hexToRgb(hexInput.value);
  if (!rgb) return;
  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  customHue.value = h; customSat.value = s; customBright.value = v;
  drawSatBrightCanvas();
  rgbaInput.value = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${customAlpha.value})`;
  selectedColor.value = getCustomColorCss();
}

function handleRgbaInput() {
  const parsed = parseRgba(rgbaInput.value);
  if (!parsed) return;
  const [h, s, v] = rgbToHsv(parsed.r, parsed.g, parsed.b);
  customHue.value = h; customSat.value = s; customBright.value = v;
  customAlpha.value = parsed.a;
  drawSatBrightCanvas();
  hexInput.value = rgbToHex(parsed.r, parsed.g, parsed.b);
  selectedColor.value = getCustomColorCss();
}

async function handleEyeDropper() {
  try {
    const eyeDropper = new (window as any).EyeDropper();
    const result = await eyeDropper.open();
    const rgb = hexToRgb(result.sRGBHex);
    if (rgb) {
      const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      customHue.value = h; customSat.value = s; customBright.value = v;
      customAlpha.value = 1;
      drawSatBrightCanvas();
      syncInputsFromHSV();
      selectedColor.value = getCustomColorCss();
      showCustomPicker.value = true;
    }
  } catch { /* user cancelled */ }
}

function toggleCustomPicker() {
  showCustomPicker.value = !showCustomPicker.value;
  if (showCustomPicker.value) {
    if (selectedColor.value.startsWith('#')) {
      const rgb = hexToRgb(selectedColor.value);
      if (rgb) {
        const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        customHue.value = h; customSat.value = s; customBright.value = v;
        customAlpha.value = 1;
      }
    } else if (selectedColor.value.startsWith('rgba')) {
      const parsed = parseRgba(selectedColor.value);
      if (parsed) {
        const [h, s, v] = rgbToHsv(parsed.r, parsed.g, parsed.b);
        customHue.value = h; customSat.value = s; customBright.value = v;
        customAlpha.value = parsed.a;
      }
    }
    syncInputsFromHSV();
    nextTick(() => { drawSatBrightCanvas(); drawHueSlider(); });
  }
}

function applyCustomColor() {
  selectedColor.value = getCustomColorCss();
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleSBMouseMove);
  window.removeEventListener('mouseup', handleSBMouseUp);
  window.removeEventListener('mousemove', handleHueMouseMove);
  window.removeEventListener('mouseup', handleHueMouseUp);
});

const backgroundPickerTabs = [
  { key: 'color', label: '颜色' },
  { key: 'image', label: '图片' },
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

const handleDialogModelValueChange = (value: boolean) => {
  if (!value) {
    handleClose();
  }
};

// 对话框重新打开时，若画板已展开，重新绘制 canvas
watch(() => props.visible, (visible) => {
  if (visible && showCustomPicker.value) {
    nextTick(() => {
      drawSatBrightCanvas();
      drawHueSlider();
    });
  }
});

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
  <UiDialog class="background-picker" :model-value="visible" width="600px" max-width="600px" :close-on-mask="false"
    @update:modelValue="handleDialogModelValueChange">
    <template #header>
        <div class="picker-header">
          <h3>更换背景</h3>
          <UiIconButton class="close-btn" variant="ghost" size="md" shape="square" title="关闭" @click="handleClose">
            ✕
          </UiIconButton>
        </div>
    </template>

    <div class="picker-tabs">
      <UiTabs v-model="activeTab" :items="backgroundPickerTabs" variant="line" size="md" stretch />
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

        <!-- 自定义颜色区域 -->
        <div class="custom-section">
          <div class="custom-header">
            <div class="section-title">自定义颜色</div>
            <div class="custom-actions">
              <button v-if="eyeDropperSupported" class="tool-btn" title="从屏幕拾取颜色" @click="handleEyeDropper">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m2 22 1-1h3l9-9"/>
                  <path d="M3 21v-3l9-9"/>
                  <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3L15 6"/>
                </svg>
                <span>取色</span>
              </button>
              <button class="tool-btn" :class="{ 'tool-btn--active': showCustomPicker }" @click="toggleCustomPicker">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
                  <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
                  <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
                  <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
                </svg>
                <span>画板</span>
              </button>
            </div>
          </div>

          <div v-if="showCustomPicker" class="palette-panel">
            <div class="palette-row">
              <div class="sb-wrapper">
                <canvas ref="satBrightCanvas" class="sb-canvas" width="260" height="160" @mousedown="handleSBMouseDown"></canvas>
                <div class="sb-pointer" :style="sbPointerStyle"></div>
              </div>
              <div class="color-preview-col">
                <div class="color-swatch-preview" :style="{ background: customColorPreview }"></div>
                <button class="apply-color-btn" @click="applyCustomColor">应用</button>
              </div>
            </div>

            <div class="hue-wrapper">
              <canvas ref="hueSlider" class="hue-canvas" width="260" height="14" @mousedown="handleHueMouseDown"></canvas>
              <div class="hue-pointer" :style="huePointerStyle"></div>
            </div>

            <div class="alpha-wrapper">
              <label class="alpha-label">不透明度</label>
              <input type="range" class="alpha-range" :value="Math.round(customAlpha * 100)" min="0" max="100" step="1" @input="handleAlphaInput" />
              <span class="alpha-val">{{ Math.round(customAlpha * 100) }}%</span>
            </div>

            <div class="input-row">
              <div class="input-tabs">
                <button class="input-tab" :class="{ 'input-tab--active': colorInputMode === 'hex' }" @click="colorInputMode = 'hex'">HEX</button>
                <button class="input-tab" :class="{ 'input-tab--active': colorInputMode === 'rgba' }" @click="colorInputMode = 'rgba'">RGBA</button>
              </div>
              <div class="input-field">
                <input v-if="colorInputMode === 'hex'" v-model="hexInput" class="color-input" placeholder="#667eea" @change="handleHexInput" @keyup.enter="handleHexInput" />
                <input v-else v-model="rgbaInput" class="color-input" placeholder="rgba(102, 126, 234, 1)" @change="handleRgbaInput" @keyup.enter="handleRgbaInput" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 图片选择 -->
      <div v-if="activeTab === 'image'" class="image-section">
        <div class="image-upload">
          <input ref="imageInput" type="file" accept="image/*" style="display: none" @change="handleImageChange" />
          <UiButton class="upload-btn" variant="secondary" size="md" @click="handleImageSelect">
            <span class="upload-icon">📁</span>
            <span>选择图片</span>
          </UiButton>
          <UiButton v-if="selectedImage" class="clear-btn" variant="danger" size="md" @click="handleClearImage">
            清除
          </UiButton>
        </div>
        <p class="upload-hint">支持 JPG, PNG, GIF 格式</p>
      </div>
    </div>

    <template #footer>
        <div class="picker-footer">
          <UiButton variant="secondary" @click="handleClose">取消</UiButton>
          <UiButton variant="primary" @click="handleConfirm">确认</UiButton>
        </div>
    </template>

    <!-- 图片裁剪器 -->
    <ImageCropper :visible="showCropper" :image="originalImage" @close="handleCropperClose"
      @confirm="handleCropperConfirm" />
  </UiDialog>
</template>

<style lang="scss" scoped>
.background-picker {
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.picker-header {
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

.picker-tabs {
  padding: 16px 24px 0;
}

.picker-preview {
  padding: 20px 24px;
  background: var(--modal-preview-bg-color);
  transition: background 0.3s ease;

  .preview-box {
    width: 100%;
    height: 120px;
    border-radius: var(--ui-radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--ui-shadow-md);

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
    border-radius: var(--ui-radius-sm);
    cursor: pointer;
    position: relative;
    transition: all 0.2s;
    border: var(--ui-border-width-strong) solid transparent;

    &:hover {
      transform: scale(1.05);
      box-shadow: var(--ui-shadow-sm);
    }

    &.selected {
      border-color: var(--ui-text-inverse);
      box-shadow: var(--ui-shadow-sm);
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

  /* ─── 自定义颜色区域 ─── */
  .custom-section {
    margin-top: 8px;
  }

  .custom-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .custom-actions {
    display: flex;
    gap: 6px;
  }

  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: var(--ui-radius-sm);
    border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
    background: var(--ui-surface-overlay);
    color: var(--ui-text-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.18s ease;

    &:hover {
      background: var(--ui-select-option-hover-bg);
      color: var(--ui-text-primary);
      border-color: var(--ui-select-focus-border);
    }

    &--active {
      background: var(--ui-select-option-selected-bg);
      color: var(--ui-select-option-selected-text);
      border-color: var(--ui-select-focus-border);
    }

    svg { flex-shrink: 0; }
  }

  .palette-panel {
    margin-top: 12px;
    padding: 14px;
    border-radius: var(--ui-radius-sm);
    background: var(--ui-surface-overlay);
    animation: fadeSlideIn 0.2s ease;
  }

  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .palette-row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .sb-wrapper {
    position: relative;
    flex: 1;
    border-radius: var(--ui-radius-xs);
    overflow: hidden;
    cursor: crosshair;

    .sb-canvas {
      display: block;
      width: 100%;
      height: 160px;
      border-radius: var(--ui-radius-xs);
    }
  }

  .sb-pointer {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.2);
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 1;
  }

  .color-preview-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }

  .color-swatch-preview {
    width: 48px;
    height: 48px;
    border-radius: var(--ui-radius-sm);
    border: 2px solid var(--ui-border-subtle);
    box-shadow: var(--ui-shadow-sm);
    transition: background 0.15s ease;
  }

  .apply-color-btn {
    padding: 4px 12px;
    border-radius: var(--ui-radius-sm);
    border: var(--ui-border-width-thin) solid var(--ui-select-focus-border);
    background: var(--ui-button-primary-bg);
    color: var(--ui-button-primary-text);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s ease;

    &:hover {
      background: var(--ui-button-primary-hover-bg);
      transform: translateY(-1px);
    }
  }

  .hue-wrapper {
    position: relative;
    margin-top: 10px;
    cursor: crosshair;

    .hue-canvas {
      display: block;
      width: 100%;
      height: 14px;
      border-radius: 7px;
    }
  }

  .hue-pointer {
    position: absolute;
    top: 50%;
    width: 8px;
    height: 18px;
    border-radius: 3px;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.3);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .alpha-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }

  .alpha-label {
    font-size: 12px;
    color: var(--ui-text-muted);
    white-space: nowrap;
    min-width: 50px;
  }

  .alpha-range {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 3px;
    background: var(--ui-border-subtle);
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--primary-color, #667eea);
      border: 2px solid #fff;
      box-shadow: var(--ui-shadow-sm);
      cursor: pointer;
    }

    &::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--primary-color, #667eea);
      border: 2px solid #fff;
      box-shadow: var(--ui-shadow-sm);
      cursor: pointer;
    }
  }

  .alpha-val {
    min-width: 36px;
    text-align: right;
    font-size: 12px;
    font-weight: 600;
    color: var(--ui-text-primary);
    font-variant-numeric: tabular-nums;
  }

  .input-row {
    margin-top: 10px;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .input-tabs {
    display: flex;
    border-radius: var(--ui-radius-xs);
    overflow: hidden;
    border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
    flex-shrink: 0;
  }

  .input-tab {
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    border: none;
    background: transparent;
    color: var(--ui-text-muted);
    cursor: pointer;
    transition: all 0.15s ease;

    &--active {
      background: var(--ui-select-option-selected-bg);
      color: var(--ui-select-option-selected-text);
    }

    &:hover:not(&--active) {
      background: var(--ui-select-option-hover-bg);
    }
  }

  .input-field {
    flex: 1;
  }

  .color-input {
    width: 100%;
    padding: 5px 10px;
    border-radius: var(--ui-radius-xs);
    border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
    background: var(--ui-input-bg, transparent);
    color: var(--ui-text-primary);
    font-size: 12px;
    font-family: 'Consolas', 'Monaco', monospace;
    outline: none;
    transition: border-color 0.18s ease;

    &:focus {
      border-color: var(--ui-select-focus-border);
      box-shadow: var(--ui-focus-ring);
    }

    &::placeholder {
      color: var(--ui-text-muted);
      opacity: 0.6;
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
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-style: dashed;
        border-color: var(--modal-upload-border-color);
        background: var(--modal-upload-bg-color);

        .upload-icon {
          font-size: 18px;
        }
      }

      .clear-btn {
        flex: 0 0 auto;
        border-style: solid;
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
  border-top: var(--ui-border-width-thin) solid var(--modal-header-border-color);
  transition: border 0.3s ease;

  .ui-button {
    flex: 1;
  }
}
</style>
