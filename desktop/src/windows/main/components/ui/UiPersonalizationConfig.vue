<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { BackgroundConfirmPayload, BackgroundStyleConfig } from '../../types/grid';
import type { CompressQuality } from '@/contracts/media';
import { useAppConfigStore } from '../../stores/app_config_store';
import UiButton from './UiButton.vue';
import UiDialog from './UiDialog.vue';
import UiIconButton from './UiIconButton.vue';
import UiSelect from './UiSelect.vue';
import UiTabs from './UiTabs.vue';
import { buildBackgroundTextVars } from '../../utils/backgroundTextColor';

const props = withDefaults(defineProps<{
  visible: boolean;
  currentBackground?: string;
  currentBackgroundImage?: string;
  currentBackgroundVideo?: string;
  currentBackgroundStyle?: BackgroundStyleConfig;
  /** 目标区域宽度 (px)，预览框按此比例渲染 */
  previewWidth?: number;
  /** 目标区域高度 (px)，预览框按此比例渲染 */
  previewHeight?: number;
}>(), {
  currentBackground: '',
  currentBackgroundImage: '',
  currentBackgroundVideo: '',
  currentBackgroundStyle: () => ({}),
  previewWidth: 320,
  previewHeight: 200,
});

const emit = defineEmits<{
  close: [];
  confirm: [payload: BackgroundConfirmPayload];
}>();

type BackgroundTab = 'color' | 'image' | 'video';
type BackgroundFitMode = 'crop' | 'style';

const activeTab = ref<BackgroundTab>('color');
const activeTabTransition = ref('ui-tab-forward');
const activeTabOrder: BackgroundTab[] = ['color', 'image', 'video'];
const selectedColor = ref(props.currentBackground || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)');
const selectedImage = ref(props.currentBackgroundImage || '');
const selectedVideo = ref(props.currentBackgroundVideo || '');
const imageInput = ref<HTMLInputElement | null>(null);
const videoInput = ref<HTMLInputElement | null>(null);

// 图片裁剪
const showCropper = ref(false);
const originalImage = ref('');

// 视频裁剪
const showVideoCropper = ref(false);
const originalVideoUrl = ref('');
const originalVideoFilePath = ref('');

// CSS 背景参数
const bgSize = ref(props.currentBackgroundStyle?.backgroundSize || 'cover');
const bgPosition = ref(props.currentBackgroundStyle?.backgroundPosition || 'center');
const bgRepeat = ref(props.currentBackgroundStyle?.backgroundRepeat || 'no-repeat');
const bgOpacity = ref(props.currentBackgroundStyle?.opacity ?? 1);
const bgFitMode = ref<BackgroundFitMode>('crop');
const selectedTextColor = ref(props.currentBackgroundStyle?.textColor || '');

// ─── FFmpeg 处理选项 ───
const appConfigStore = useAppConfigStore();
const imageProcessMode = ref<'canvas' | 'ffmpeg'>('canvas');
const videoProcessMode = ref<'browser' | 'ffmpeg'>('browser');
const compressQuality = ref<CompressQuality>('high');

const ffmpegAvailable = computed(() => {
  return !!(appConfigStore.config.tools?.ffmpegPath);
});

const imageProcessOptions = computed(() => [
  { label: '原始处理', value: 'canvas' },
  { label: 'FFmpeg 压缩', value: 'ffmpeg', disabled: !ffmpegAvailable.value },
]);

const videoProcessOptions = computed(() => [
  { label: '原始处理', value: 'browser' },
  { label: 'FFmpeg 压缩', value: 'ffmpeg', disabled: !ffmpegAvailable.value },
]);

const qualityOptions = [
  { label: '高质量', value: 'high' },
  { label: '中等质量', value: 'medium' },
  { label: '低质量', value: 'low' },
];

const bgSizeOptions = [
  { label: '覆盖 (cover)', value: 'cover' },
  { label: '适应 (contain)', value: 'contain' },
  { label: '原始 (auto)', value: 'auto' },
  { label: '拉伸 (100% 100%)', value: '100% 100%' },
];

const bgFitModeOptions = [
  { label: '按比例裁剪', key: 'crop' },
  { label: '填充模式', key: 'style' },
];

const bgRepeatOptions = [
  { label: '不重复', value: 'no-repeat' },
  { label: '平铺', value: 'repeat' },
  { label: '水平平铺', value: 'repeat-x' },
  { label: '垂直平铺', value: 'repeat-y' },
];

const positionGrid = [
  { label: '↖', value: 'top left' },
  { label: '↑', value: 'top center' },
  { label: '↗', value: 'top right' },
  { label: '←', value: 'center left' },
  { label: '•', value: 'center' },
  { label: '→', value: 'center right' },
  { label: '↙', value: 'bottom left' },
  { label: '↓', value: 'bottom center' },
  { label: '↘', value: 'bottom right' },
];

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

const presetColors = [
  '#667eea', '#f093fb', '#4facfe', '#43e97b',
  '#fa709a', '#30cfd0', '#a8edea', '#ff9a9e',
  '#ffecd2', '#ff6e7f', '#e0c3fc', '#f8b500',
];

// ─── 自定义颜色 (画板 + 取色器 + 直接输入) ───
const showCustomPicker = ref(false);
const satBrightCanvas = ref<HTMLCanvasElement | null>(null);
const hueSlider = ref<HTMLCanvasElement | null>(null);
const customHue = ref(0);        // 0~360
const customSat = ref(100);      // 0~100
const customBright = ref(100);   // 0~100
const customAlpha = ref(1);      // 0~1
const hexInput = ref('#667eea');
const rgbaInput = ref('rgba(102, 126, 234, 1)');
const colorInputMode = ref<'hex' | 'rgba'>('hex');
const isDraggingSB = ref(false);
const isDraggingHue = ref(false);
const eyeDropperSupported = ref(typeof (window as any).EyeDropper !== 'undefined');

// ── HSV → RGB ──
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

// ── RGB → HSV ──
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

// ── RGB → HEX ──
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// ── HEX → RGB ──
function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) {
    // 尝试3位短格式
    const short = hex.replace('#', '').match(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (!short) return null;
    return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16)];
  }
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

// ── 解析 rgba 字符串 ──
function parseRgba(str: string): { r: number; g: number; b: number; a: number } | null {
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
}

// ── 获取当前自定义颜色的 CSS 值 ──
function getCustomColorCss(): string {
  const [r, g, b] = hsvToRgb(customHue.value, customSat.value, customBright.value);
  if (customAlpha.value < 1) {
    return `rgba(${r}, ${g}, ${b}, ${customAlpha.value})`;
  }
  return rgbToHex(r, g, b);
}

// ── 同步各输入框 ──
function syncInputsFromHSV() {
  const [r, g, b] = hsvToRgb(customHue.value, customSat.value, customBright.value);
  hexInput.value = rgbToHex(r, g, b);
  rgbaInput.value = `rgba(${r}, ${g}, ${b}, ${customAlpha.value})`;
}

// ── 绘制饱和度/明度画板 ──
function drawSatBrightCanvas() {
  const canvas = satBrightCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  // 用色相色填充背景
  const [hr, hg, hb] = hsvToRgb(customHue.value, 100, 100);
  ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
  ctx.fillRect(0, 0, w, h);

  // 白色渐变（从左到右）
  const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
  whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
  whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = whiteGrad;
  ctx.fillRect(0, 0, w, h);

  // 黑色渐变（从上到下）
  const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
  blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
  blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = blackGrad;
  ctx.fillRect(0, 0, w, h);
}

// ── 绘制色相滑杆 ──
function drawHueSlider() {
  const canvas = hueSlider.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, '#ff0000');
  gradient.addColorStop(1 / 6, '#ffff00');
  gradient.addColorStop(2 / 6, '#00ff00');
  gradient.addColorStop(3 / 6, '#00ffff');
  gradient.addColorStop(4 / 6, '#0000ff');
  gradient.addColorStop(5 / 6, '#ff00ff');
  gradient.addColorStop(1, '#ff0000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

// ── 画板选色指示器位置 ──
const sbPointerStyle = computed(() => ({
  left: `${(customSat.value / 100) * 100}%`,
  top: `${((100 - customBright.value) / 100) * 100}%`,
}));

// ── 色相滑杆指示器位置 ──
const huePointerStyle = computed(() => ({
  left: `${(customHue.value / 360) * 100}%`,
}));

// ── 自定义颜色预览 ──
const customColorPreview = computed(() => getCustomColorCss());

// ── 画板鼠标事件 ──
function handleSBMouseDown(e: MouseEvent) {
  isDraggingSB.value = true;
  updateSBFromEvent(e);
  window.addEventListener('mousemove', handleSBMouseMove);
  window.addEventListener('mouseup', handleSBMouseUp);
}

function handleSBMouseMove(e: MouseEvent) {
  if (!isDraggingSB.value) return;
  updateSBFromEvent(e);
}

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

// ── 色相滑杆鼠标事件 ──
function handleHueMouseDown(e: MouseEvent) {
  isDraggingHue.value = true;
  updateHueFromEvent(e);
  window.addEventListener('mousemove', handleHueMouseMove);
  window.addEventListener('mouseup', handleHueMouseUp);
}

function handleHueMouseMove(e: MouseEvent) {
  if (!isDraggingHue.value) return;
  updateHueFromEvent(e);
}

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

// ── 透明度滑杆事件 ──
function handleAlphaInput(e: Event) {
  customAlpha.value = Number((e.target as HTMLInputElement).value) / 100;
  syncInputsFromHSV();
  selectedColor.value = getCustomColorCss();
}

// ── HEX 输入 ──
function handleHexInput() {
  const rgb = hexToRgb(hexInput.value);
  if (!rgb) return;
  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  customHue.value = h;
  customSat.value = s;
  customBright.value = v;
  drawSatBrightCanvas();
  rgbaInput.value = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${customAlpha.value})`;
  selectedColor.value = getCustomColorCss();
}

// ── RGBA 输入 ──
function handleRgbaInput() {
  const parsed = parseRgba(rgbaInput.value);
  if (!parsed) return;
  const [h, s, v] = rgbToHsv(parsed.r, parsed.g, parsed.b);
  customHue.value = h;
  customSat.value = s;
  customBright.value = v;
  customAlpha.value = parsed.a;
  drawSatBrightCanvas();
  hexInput.value = rgbToHex(parsed.r, parsed.g, parsed.b);
  selectedColor.value = getCustomColorCss();
}

// ── 屏幕取色器 ──
async function handleEyeDropper() {
  try {
    const eyeDropper = new (window as any).EyeDropper();
    const result = await eyeDropper.open();
    const color: string = result.sRGBHex;
    const rgb = hexToRgb(color);
    if (rgb) {
      const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      customHue.value = h;
      customSat.value = s;
      customBright.value = v;
      customAlpha.value = 1;
      drawSatBrightCanvas();
      syncInputsFromHSV();
      selectedColor.value = getCustomColorCss();
      showCustomPicker.value = true;
    }
  } catch {
    // 用户取消了取色
  }
}

// ── 切换自定义画板时初始化 ──
function toggleCustomPicker() {
  showCustomPicker.value = !showCustomPicker.value;
  if (showCustomPicker.value) {
    // 若当前选中是纯色，同步到画板
    if (selectedColor.value.startsWith('#')) {
      const rgb = hexToRgb(selectedColor.value);
      if (rgb) {
        const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        customHue.value = h;
        customSat.value = s;
        customBright.value = v;
        customAlpha.value = 1;
      }
    } else if (selectedColor.value.startsWith('rgba')) {
      const parsed = parseRgba(selectedColor.value);
      if (parsed) {
        const [h, s, v] = rgbToHsv(parsed.r, parsed.g, parsed.b);
        customHue.value = h;
        customSat.value = s;
        customBright.value = v;
        customAlpha.value = parsed.a;
      }
    }
    syncInputsFromHSV();
    nextTick(() => {
      drawSatBrightCanvas();
      drawHueSlider();
    });
  }
}

// ── 应用自定义颜色 ──
function applyCustomColor() {
  selectedColor.value = getCustomColorCss();
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleSBMouseMove);
  window.removeEventListener('mouseup', handleSBMouseUp);
  window.removeEventListener('mousemove', handleHueMouseMove);
  window.removeEventListener('mouseup', handleHueMouseUp);
});

const personalizationTabs = [
  { key: 'color', label: '颜色' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
];

watch(activeTab, (next, previous) => {
  activeTabTransition.value = activeTabOrder.indexOf(next) >= activeTabOrder.indexOf(previous)
    ? 'ui-tab-forward'
    : 'ui-tab-back';
});

const targetPreviewSize = computed(() => {
  const width = Number.isFinite(props.previewWidth) && props.previewWidth > 0 ? props.previewWidth : 320;
  const height = Number.isFinite(props.previewHeight) && props.previewHeight > 0 ? props.previewHeight : 200;
  return { width, height };
});

// 预览框按目标区域等比缩放，外层框本身保持真实区域比例。
const previewFrameStyle = computed(() => {
  const maxW = 500;
  const maxH = 130;
  const aspect = targetPreviewSize.value.width / targetPreviewSize.value.height;
  let w = maxW;
  let h = w / aspect;

  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }

  return {
    width: `${w}px`,
    height: `${h}px`,
    margin: '0 auto',
  };
});

const previewBoxStyle = computed(() => {
  const base: Record<string, string> = {
    width: '100%',
    height: '100%',
    ...buildBackgroundTextVars(selectedTextColor.value, {
      aliases: {
        primary: ['--grid-item-text-color'],
      },
    }),
  };
  const effectiveSize = bgFitMode.value === 'crop' ? 'cover' : bgSize.value;
  const effectivePosition = bgFitMode.value === 'crop' ? 'center' : bgPosition.value;
  const effectiveRepeat = bgFitMode.value === 'crop' ? 'no-repeat' : bgRepeat.value;

  if (activeTab.value === 'color') {
    base.background = selectedColor.value;
    if (bgOpacity.value < 1) base.opacity = String(bgOpacity.value);
  } else if (activeTab.value === 'image' && selectedImage.value) {
    base.backgroundImage = `url(${selectedImage.value})`;
    base.backgroundSize = effectiveSize;
    base.backgroundPosition = effectivePosition;
    base.backgroundRepeat = effectiveRepeat;
    if (bgOpacity.value < 1) base.opacity = String(bgOpacity.value);
  } else if (activeTab.value === 'video') {
    base.background = '#1a1a2e';
    if (bgOpacity.value < 1) base.opacity = String(bgOpacity.value);
  } else {
    base.background = '#2a2a2a';
  }

  return base;
});

function toObjectFit(backgroundSizeValue: string): 'contain' | 'cover' | 'fill' | 'none' {
  switch (backgroundSizeValue) {
    case 'contain':
      return 'contain';
    case '100% 100%':
      return 'fill';
    case 'auto':
      return 'none';
    default:
      return 'cover';
  }
}

const previewVideoStyle = computed(() => ({
  objectFit: toObjectFit(bgFitMode.value === 'crop' ? 'cover' : bgSize.value),
  objectPosition: bgFitMode.value === 'crop' ? 'center' : bgPosition.value,
}));

function handleColorSelect(color: string) {
  selectedColor.value = color;
}

function handleImageSelect() {
  imageInput.value?.click();
}

function handleImageChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    originalImage.value = e.target?.result as string;
    if (bgFitMode.value === 'crop') {
      showCropper.value = true;
    } else {
      selectedImage.value = originalImage.value;
      originalImage.value = '';
      if (imageInput.value) imageInput.value.value = '';
    }
  };
  reader.readAsDataURL(file);
}

function handleCropperClose() {
  showCropper.value = false;
  originalImage.value = '';
  if (imageInput.value) imageInput.value.value = '';
}

function handleCropperConfirm(croppedImage: string) {
  selectedImage.value = croppedImage;
  showCropper.value = false;
  originalImage.value = '';
}

function handleClearImage() {
  selectedImage.value = '';
  if (imageInput.value) imageInput.value.value = '';
}

function handleVideoSelect() {
  videoInput.value?.click();
}

function handleVideoChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  if (bgFitMode.value === 'style') {
    const reader = new FileReader();
    reader.onload = (e) => {
      selectedVideo.value = e.target?.result as string;
      if (videoInput.value) videoInput.value.value = '';
    };
    reader.readAsDataURL(file);
    return;
  }

  const url = URL.createObjectURL(file);
  originalVideoUrl.value = url;
  // Electron 的 File 对象有 path 属性，存储真实磁盘路径供 FFmpeg 使用
  originalVideoFilePath.value = (file as any).path || '';
  showVideoCropper.value = true;
}

function handleVideoCropperClose() {
  showVideoCropper.value = false;
  if (originalVideoUrl.value) {
    URL.revokeObjectURL(originalVideoUrl.value);
    originalVideoUrl.value = '';
  }
  originalVideoFilePath.value = '';
  if (videoInput.value) videoInput.value.value = '';
}

function handleVideoCropperConfirm(videoDataUrl: string) {
  selectedVideo.value = videoDataUrl;
  showVideoCropper.value = false;
  if (originalVideoUrl.value) {
    URL.revokeObjectURL(originalVideoUrl.value);
    originalVideoUrl.value = '';
  }
  originalVideoFilePath.value = '';
}

function handleClearVideo() {
  selectedVideo.value = '';
  if (videoInput.value) videoInput.value.value = '';
}

function handleConfirm() {
  const usesCropMode = bgFitMode.value === 'crop' && activeTab.value !== 'color';
  const textColor = selectedTextColor.value.trim() || undefined;
  const backgroundStyle: BackgroundStyleConfig = {
    backgroundSize: usesCropMode ? 'cover' : bgSize.value,
    backgroundPosition: usesCropMode ? 'center' : bgPosition.value,
    backgroundRepeat: usesCropMode || activeTab.value === 'video' ? 'no-repeat' : bgRepeat.value,
    opacity: bgOpacity.value,
    fitMode: activeTab.value === 'color' ? undefined : bgFitMode.value,
    textColor,
  };

  if (activeTab.value === 'color') {
    const colorStyle: BackgroundStyleConfig = { opacity: bgOpacity.value, textColor };
    emit('confirm', { type: 'color', color: selectedColor.value, image: '', video: '', backgroundStyle: colorStyle });
  } else if (activeTab.value === 'image') {
    emit('confirm', { type: 'image', color: '', image: selectedImage.value, video: '', backgroundStyle });
  } else {
    emit('confirm', { type: 'video', color: '', image: '', video: selectedVideo.value, backgroundStyle });
  }
  emit('close');
}

function handleClose() {
  emit('close');
}

function handleDialogModelValueChange(value: boolean) {
  if (!value) handleClose();
}

// 同步 props 到本地状态
watch(() => props.visible, (visible) => {
  if (visible) {
    selectedColor.value = props.currentBackground || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    selectedImage.value = props.currentBackgroundImage || '';
    selectedVideo.value = props.currentBackgroundVideo || '';
    bgSize.value = props.currentBackgroundStyle?.backgroundSize || 'cover';
    bgPosition.value = props.currentBackgroundStyle?.backgroundPosition || 'center';
    bgRepeat.value = props.currentBackgroundStyle?.backgroundRepeat || 'no-repeat';
    bgOpacity.value = props.currentBackgroundStyle?.opacity ?? 1;
    selectedTextColor.value = props.currentBackgroundStyle?.textColor || '';
    bgFitMode.value = props.currentBackgroundStyle?.fitMode
      ?? (
        props.currentBackgroundStyle?.backgroundSize && props.currentBackgroundStyle.backgroundSize !== 'cover'
          ? 'style'
          : 'crop'
      );

    // 自动选择合适的 tab
    if (props.currentBackgroundVideo) {
      activeTab.value = 'video';
    } else if (props.currentBackgroundImage) {
      activeTab.value = 'image';
    } else {
      activeTab.value = 'color';
    }

    // 对话框重新打开时，若画板已展开，重新绘制 canvas
    if (showCustomPicker.value) {
      nextTick(() => {
        drawSatBrightCanvas();
        drawHueSlider();
      });
    }
  }
});
</script>

<template>
  <UiDialog class="bg-picker" :model-value="visible" width="580px" max-width="580px" :close-on-mask="false"
    @update:modelValue="handleDialogModelValueChange">
    <template #header>
      <div class="bg-picker__header">
        <h3>个性化配置</h3>
        <UiIconButton class="close-btn" variant="ghost" size="sm" shape="square" title="关闭" @click="handleClose">
          ✕
        </UiIconButton>
      </div>
    </template>

    <div class="bg-picker__tabs">
      <UiTabs v-model="activeTab" :items="personalizationTabs" variant="line" size="sm" stretch />
    </div>

    <!-- 预览区域 -->
    <div class="bg-picker__preview">
      <div
        class="bg-picker__preview-wrapper"
        :class="{ 'bg-picker__preview-wrapper--checker': bgOpacity < 1 }"
        :style="previewFrameStyle"
      >
        <div class="bg-picker__preview-box" :style="previewBoxStyle">
          <video v-if="activeTab === 'video' && selectedVideo" :src="selectedVideo" class="bg-picker__preview-video"
            :style="previewVideoStyle" autoplay loop muted playsinline />
          <span v-else class="bg-picker__preview-text">预览</span>
        </div>
      </div>
    </div>

    <div class="bg-picker__content">
      <Transition :name="activeTabTransition" mode="out-in">
      <!-- 颜色选择 -->
      <div v-if="activeTab === 'color'" class="bg-picker__color-section">
        <div class="bg-picker__section-title">渐变色</div>
        <div class="bg-picker__gradient-grid">
          <div v-for="(gradient, index) in presetGradients" :key="index" class="bg-picker__swatch"
            :class="{ 'bg-picker__swatch--selected': selectedColor === gradient }" :style="{ background: gradient }"
            @click="handleColorSelect(gradient)">
            <div v-if="selectedColor === gradient" class="bg-picker__swatch-check">✓</div>
          </div>
        </div>

        <div class="bg-picker__section-title">纯色</div>
        <div class="bg-picker__color-grid">
          <div v-for="(color, index) in presetColors" :key="index" class="bg-picker__swatch"
            :class="{ 'bg-picker__swatch--selected': selectedColor === color }" :style="{ background: color }"
            @click="handleColorSelect(color)">
            <div v-if="selectedColor === color" class="bg-picker__swatch-check">✓</div>
          </div>
        </div>

        <!-- 自定义颜色区域 -->
        <div class="bg-picker__custom-section">
          <div class="bg-picker__custom-header">
            <div class="bg-picker__section-title">自定义颜色</div>
            <div class="bg-picker__custom-actions">
              <button v-if="eyeDropperSupported" class="bg-picker__tool-btn" title="从屏幕拾取颜色" @click="handleEyeDropper">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m2 22 1-1h3l9-9"/>
                  <path d="M3 21v-3l9-9"/>
                  <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3L15 6"/>
                </svg>
                <span>取色</span>
              </button>
              <button class="bg-picker__tool-btn" :class="{ 'bg-picker__tool-btn--active': showCustomPicker }" @click="toggleCustomPicker">
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

          <!-- 颜色画板 -->
          <div v-if="showCustomPicker" class="bg-picker__palette-panel">
            <div class="bg-picker__palette-row">
              <!-- 饱和度/明度画板 -->
              <div class="bg-picker__sb-wrapper">
                <canvas ref="satBrightCanvas" class="bg-picker__sb-canvas" width="260" height="160" @mousedown="handleSBMouseDown"></canvas>
                <div class="bg-picker__sb-pointer" :style="sbPointerStyle"></div>
              </div>
              <!-- 颜色预览 -->
              <div class="bg-picker__color-preview-col">
                <div class="bg-picker__color-swatch-preview" :style="{ background: customColorPreview }"></div>
                <button class="bg-picker__apply-color-btn" @click="applyCustomColor">应用</button>
              </div>
            </div>

            <!-- 色相滑杆 -->
            <div class="bg-picker__hue-wrapper">
              <canvas ref="hueSlider" class="bg-picker__hue-canvas" width="260" height="14" @mousedown="handleHueMouseDown"></canvas>
              <div class="bg-picker__hue-pointer" :style="huePointerStyle"></div>
            </div>

            <!-- 透明度滑杆 -->
            <div class="bg-picker__alpha-wrapper">
              <label class="bg-picker__alpha-label">不透明度</label>
              <input type="range" class="bg-picker__alpha-range" :value="Math.round(customAlpha * 100)" min="0" max="100" step="1" @input="handleAlphaInput" />
              <span class="bg-picker__alpha-val">{{ Math.round(customAlpha * 100) }}%</span>
            </div>

            <!-- 颜色值输入 -->
            <div class="bg-picker__input-row">
              <div class="bg-picker__input-tabs">
                <button class="bg-picker__input-tab" :class="{ 'bg-picker__input-tab--active': colorInputMode === 'hex' }" @click="colorInputMode = 'hex'">HEX</button>
                <button class="bg-picker__input-tab" :class="{ 'bg-picker__input-tab--active': colorInputMode === 'rgba' }" @click="colorInputMode = 'rgba'">RGBA</button>
              </div>
              <div class="bg-picker__input-field">
                <input v-if="colorInputMode === 'hex'" v-model="hexInput" class="bg-picker__color-input" placeholder="#667eea" @change="handleHexInput" @keyup.enter="handleHexInput" />
                <input v-else v-model="rgbaInput" class="bg-picker__color-input" placeholder="rgba(102, 126, 234, 1)" @change="handleRgbaInput" @keyup.enter="handleRgbaInput" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 图片选择 + CSS 参数 -->
      <div v-else-if="activeTab === 'image'" class="bg-picker__image-section">
        <div class="bg-picker__fit-panel">
          <div class="bg-picker__section-title">适配方式</div>
          <UiTabs v-model="bgFitMode" :items="bgFitModeOptions" variant="segmented" size="sm" stretch />
        </div>

        <div class="bg-picker__image-actions">
          <input ref="imageInput" type="file" accept="image/*" style="display: none" @change="handleImageChange" />
          <UiButton class="bg-picker__upload-btn" variant="secondary" size="sm" @click="handleImageSelect">
            <span class="upload-icon">📁</span>
            <span>选择图片</span>
          </UiButton>
          <UiButton v-if="selectedImage" variant="danger" size="sm" @click="handleClearImage">
            清除
          </UiButton>
        </div>

        <!-- CSS 背景参数面板 -->
        <div v-if="selectedImage && bgFitMode === 'style'" class="bg-picker__style-panel">
          <div class="bg-picker__section-title">背景样式</div>
          <div class="bg-picker__style-grid">
            <div class="bg-picker__style-field">
              <label>填充模式</label>
              <UiSelect v-model="bgSize" :options="bgSizeOptions" size="sm" />
            </div>
            <div class="bg-picker__style-field">
              <label>重复方式</label>
              <UiSelect v-model="bgRepeat" :options="bgRepeatOptions" size="sm" />
            </div>
          </div>

          <div class="bg-picker__section-title">定位</div>
          <div class="bg-picker__position-grid">
            <button v-for="pos in positionGrid" :key="pos.value" class="bg-picker__pos-cell"
              :class="{ 'bg-picker__pos-cell--active': bgPosition === pos.value }" :title="pos.value"
              @click="bgPosition = pos.value">
              {{ pos.label }}
            </button>
          </div>
        </div>

        <p class="bg-picker__hint">支持 JPG, PNG, GIF, WebP 格式</p>

        <div v-if="bgFitMode === 'crop'" class="bg-picker__process-options">
          <div class="bg-picker__section-title">处理方式</div>
          <div class="bg-picker__style-grid">
            <div class="bg-picker__style-field">
              <label>处理模式</label>
              <UiSelect v-model="imageProcessMode" :options="imageProcessOptions" size="sm" />
            </div>
            <div v-if="imageProcessMode === 'ffmpeg'" class="bg-picker__style-field">
              <label>压缩质量</label>
              <UiSelect v-model="compressQuality" :options="qualityOptions" size="sm" />
            </div>
          </div>
          <p v-if="!ffmpegAvailable" class="bg-picker__hint bg-picker__hint--warn">⚠️ 未配置 FFmpeg 路径，请前往 设置 → 工具 进行配置</p>
        </div>
      </div>

      <!-- 视频选择 -->
      <div v-else class="bg-picker__video-section">
        <div class="bg-picker__fit-panel">
          <div class="bg-picker__section-title">适配方式</div>
          <UiTabs v-model="bgFitMode" :items="bgFitModeOptions" variant="segmented" size="sm" stretch />
        </div>

        <div class="bg-picker__image-actions">
          <input ref="videoInput" type="file" accept="video/*" style="display: none" @change="handleVideoChange" />
          <UiButton class="bg-picker__upload-btn" variant="secondary" size="sm" @click="handleVideoSelect">
            <span class="upload-icon">🎬</span>
            <span>选择视频</span>
          </UiButton>
          <UiButton v-if="selectedVideo" variant="danger" size="sm" @click="handleClearVideo">
            清除
          </UiButton>
        </div>
        <p class="bg-picker__hint">支持 MP4, WebM, MOV 格式</p>

        <div v-if="selectedVideo && bgFitMode === 'style'" class="bg-picker__style-panel">
          <div class="bg-picker__section-title">背景样式</div>
          <div class="bg-picker__style-grid">
            <div class="bg-picker__style-field">
              <label>填充模式</label>
              <UiSelect v-model="bgSize" :options="bgSizeOptions" size="sm" />
            </div>
          </div>

          <div class="bg-picker__section-title">定位</div>
          <div class="bg-picker__position-grid">
            <button v-for="pos in positionGrid" :key="pos.value" class="bg-picker__pos-cell"
              :class="{ 'bg-picker__pos-cell--active': bgPosition === pos.value }" :title="pos.value"
              @click="bgPosition = pos.value">
              {{ pos.label }}
            </button>
          </div>
        </div>

        <div v-if="bgFitMode === 'crop'" class="bg-picker__process-options">
          <div class="bg-picker__section-title">处理方式</div>
          <div class="bg-picker__style-grid">
            <div class="bg-picker__style-field">
              <label>处理模式</label>
              <UiSelect v-model="videoProcessMode" :options="videoProcessOptions" size="sm" />
            </div>
            <div v-if="videoProcessMode === 'ffmpeg'" class="bg-picker__style-field">
              <label>压缩质量</label>
              <UiSelect v-model="compressQuality" :options="qualityOptions" size="sm" />
            </div>
          </div>
          <p v-if="!ffmpegAvailable" class="bg-picker__hint bg-picker__hint--warn">⚠️ 未配置 FFmpeg 路径，请前往 设置 → 工具 进行配置</p>
        </div>
      </div>
      </Transition>

      <!-- 透明度设置（所有 tab 通用） -->
      <div class="bg-picker__opacity-panel">
        <div class="bg-picker__section-title">透明度</div>
        <div class="bg-picker__opacity-row">
          <input type="range" class="bg-picker__opacity-slider" :value="Math.round(bgOpacity * 100)" min="0" max="100"
            step="1" @input="bgOpacity = Number(($event.target as HTMLInputElement).value) / 100" />
          <span class="bg-picker__opacity-value">{{ Math.round(bgOpacity * 100) }}%</span>
        </div>
      </div>

      <div class="bg-picker__text-color-panel">
        <div class="bg-picker__section-title">文字颜色</div>
        <div class="bg-picker__text-color-row">
          <input
            class="bg-picker__text-color-swatch"
            type="color"
            :value="selectedTextColor || '#ffffff'"
            @input="selectedTextColor = ($event.target as HTMLInputElement).value"
          />
          <input
            v-model="selectedTextColor"
            class="bg-picker__text-color-input"
            placeholder="默认文字颜色"
          />
          <button class="bg-picker__text-color-reset" type="button" @click="selectedTextColor = ''">
            重置
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="bg-picker__footer">
        <UiButton variant="secondary" size="sm" @click="handleClose">取消</UiButton>
        <UiButton variant="primary" size="sm" @click="handleConfirm">确认</UiButton>
      </div>
    </template>

    <!-- 图片裁剪器（保留原有组件） -->
    <ImageCropper v-if="showCropper" :visible="showCropper" :image="originalImage"
      :target-width="targetPreviewSize.width" :target-height="targetPreviewSize.height"
      :processing-mode="imageProcessMode" :quality="compressQuality"
      @close="handleCropperClose" @confirm="handleCropperConfirm" />

    <!-- 视频裁剪器 -->
    <VideoCropper v-if="showVideoCropper" :visible="showVideoCropper" :video-url="originalVideoUrl"
      :file-path="originalVideoFilePath"
      :target-width="targetPreviewSize.width" :target-height="targetPreviewSize.height"
      :processing-mode="videoProcessMode" :quality="compressQuality"
      @close="handleVideoCropperClose"
      @confirm="handleVideoCropperConfirm" />
  </UiDialog>
</template>

<script lang="ts">
// 懒加载子组件
import { defineAsyncComponent } from 'vue';
const ImageCropper = defineAsyncComponent(() => import('../CompArea/ImageCropper.vue'));
const VideoCropper = defineAsyncComponent(() => import('./VideoCropper.vue'));

export default {
  components: { ImageCropper, VideoCropper },
};
</script>

<style lang="scss" scoped>
@use '../../assets/scroll' as *;

.bg-picker,
.bg-picker.ui-card {
  max-height: 74vh;
  display: flex;
  flex-direction: column;
  border-radius: var(--ui-radius-md);
}

.bg-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: var(--ui-border-width-thin) solid var(--modal-header-border-color);

  h3 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 16px;
    font-weight: 600;
  }
}

.bg-picker__tabs {
  padding: 10px 18px 0;
}

.bg-picker__preview {
  padding: 12px 18px;
  background: var(--modal-preview-bg-color);

  .bg-picker__preview-wrapper {
    border-radius: var(--ui-radius-xs);
    overflow: hidden;
    box-shadow: var(--ui-shadow-sm);

    &--checker {
      background-image: repeating-conic-gradient(rgba(128, 128, 128, 0.15) 0% 25%,
          transparent 0% 50%);
      background-size: 16px 16px;
    }
  }

  .bg-picker__preview-box {
    border-radius: var(--ui-radius-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }

  .bg-picker__preview-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .bg-picker__preview-text {
    color: var(--grid-item-text-color);
    font-size: 13px;
    font-weight: 600;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }
}

.bg-picker__content {
  flex: 1;
  @include thin-scroll;
  padding: 14px 18px;
  max-height: calc(74vh - 300px);
}

.bg-picker__section-title {
  color: var(--modal-section-title-color);
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 8px;
  margin-top: 12px;

  &:first-child {
    margin-top: 0;
  }
}

.bg-picker__gradient-grid,
.bg-picker__color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.bg-picker__swatch {
  aspect-ratio: 1;
  border-radius: var(--ui-radius-xs);
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  border: var(--ui-border-width-strong) solid transparent;

  &:hover {
    transform: scale(1.06);
    box-shadow: var(--ui-shadow-sm);
  }

  &--selected {
    border-color: var(--ui-text-inverse);
    box-shadow: var(--ui-shadow-sm);
  }
}

.bg-picker__swatch-check {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 18px;
  font-weight: bold;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

/* ─── 自定义颜色区域 ─── */
.bg-picker__custom-section {
  margin-top: 8px;
}

.bg-picker__custom-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.bg-picker__custom-actions {
  display: flex;
  gap: 6px;
}

.bg-picker__tool-btn {
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

  svg {
    flex-shrink: 0;
  }
}

.bg-picker__palette-panel {
  margin-top: 8px;
  padding: 10px;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-surface-overlay);
  animation: fadeSlideIn 0.2s ease;
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.bg-picker__palette-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.bg-picker__sb-wrapper {
  position: relative;
  flex: 1;
  border-radius: var(--ui-radius-xs);
  overflow: hidden;
  cursor: crosshair;

  .bg-picker__sb-canvas {
    display: block;
    width: 100%;
    height: 132px;
    border-radius: var(--ui-radius-xs);
  }
}

.bg-picker__sb-pointer {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(0, 0, 0, 0.2);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1;
}

.bg-picker__color-preview-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.bg-picker__color-swatch-preview {
  width: 40px;
  height: 40px;
  border-radius: var(--ui-radius-xs);
  border: 2px solid var(--ui-border-subtle);
  box-shadow: var(--ui-shadow-sm);
  transition: background 0.15s ease;
}

.bg-picker__apply-color-btn {
  padding: 3px 10px;
  border-radius: var(--ui-radius-xs);
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

.bg-picker__hue-wrapper {
  position: relative;
  margin-top: 8px;
  cursor: crosshair;

  .bg-picker__hue-canvas {
    display: block;
    width: 100%;
    height: 12px;
    border-radius: 6px;
  }
}

.bg-picker__hue-pointer {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 18px;
  border-radius: 3px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.bg-picker__alpha-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.bg-picker__alpha-label {
  font-size: 12px;
  color: var(--ui-text-muted);
  white-space: nowrap;
  min-width: 50px;
}

.bg-picker__alpha-range {
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

.bg-picker__alpha-val {
  min-width: 36px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-primary);
  font-variant-numeric: tabular-nums;
}

.bg-picker__input-row {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.bg-picker__input-tabs {
  display: flex;
  border-radius: var(--ui-radius-xs);
  overflow: hidden;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  flex-shrink: 0;
}

.bg-picker__input-tab {
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

.bg-picker__input-field {
  flex: 1;
}

.bg-picker__color-input {
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

.bg-picker__image-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.bg-picker__upload-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-style: dashed;
  border-color: var(--modal-upload-border-color);
  background: var(--modal-upload-bg-color);

  .upload-icon {
    font-size: 15px;
  }
}

.bg-picker__hint {
  color: var(--modal-hint-color);
  font-size: 12px;
  margin: 4px 0 0;
  text-align: center;

  &--warn {
    color: var(--ui-text-warning, #e2a33e);
    margin-top: 8px;
  }
}

.bg-picker__process-options {
  margin-top: 10px;
  padding: 10px;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-surface-overlay);
}

.bg-picker__fit-panel {
  margin-bottom: 10px;
  padding: 10px;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-surface-overlay);
}

/* ─── CSS 背景参数面板 ─── */
.bg-picker__style-panel {
  margin-top: 4px;
  padding: 10px;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-surface-overlay);
}

.bg-picker__style-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.bg-picker__style-field {
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-size: 12px;
    color: var(--ui-text-muted);
    font-weight: 500;
  }
}

.bg-picker__position-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 132px;
  max-width: 132px;
  margin: 0 auto;
}

.bg-picker__pos-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: calc(var(--ui-radius-xs) - 2px);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--ui-select-option-hover-bg);
    color: var(--ui-text-primary);
  }

  &--active {
    background: var(--ui-select-option-selected-bg);
    color: var(--ui-select-option-selected-text);
    border-color: var(--ui-select-focus-border);
    font-weight: 600;
  }
}

/* ─── 透明度面板 ─── */
.bg-picker__opacity-panel {
  margin-top: 12px;
  padding: 10px;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-surface-overlay);
}

.bg-picker__text-color-panel {
  margin-top: 12px;
  padding: 10px;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-surface-overlay);
}

.bg-picker__text-color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bg-picker__text-color-swatch {
  flex: 0 0 36px;
  width: 36px;
  height: 30px;
  padding: 0;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-xs);
  background: transparent;
  cursor: pointer;
}

.bg-picker__text-color-input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 5px 10px;
  border-radius: var(--ui-radius-xs);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-input-bg, transparent);
  color: var(--ui-text-primary);
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  outline: none;

  &:focus {
    border-color: var(--ui-select-focus-border);
    box-shadow: var(--ui-focus-ring);
  }

  &::placeholder {
    color: var(--ui-text-muted);
    opacity: 0.65;
  }
}

.bg-picker__text-color-reset {
  flex: 0 0 auto;
  height: 30px;
  padding: 0 10px;
  border-radius: var(--ui-radius-xs);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    border-color: var(--ui-select-focus-border);
    color: var(--ui-text-primary);
    background: var(--ui-select-option-hover-bg);
  }
}

.bg-picker__opacity-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bg-picker__opacity-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 3px;
  background: var(--ui-border-subtle);
  outline: none;
  cursor: pointer;
  transition: background 0.2s ease;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--primary-color, #667eea);
    border: 2px solid var(--ui-text-inverse);
    box-shadow: var(--ui-shadow-sm);
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  &::-webkit-slider-thumb:hover {
    transform: scale(1.15);
    box-shadow: var(--ui-shadow-md);
  }

  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--primary-color, #667eea);
    border: 2px solid var(--ui-text-inverse);
    box-shadow: var(--ui-shadow-sm);
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  &::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: var(--ui-border-subtle);
  }
}

.bg-picker__opacity-value {
  min-width: 38px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-primary);
  font-variant-numeric: tabular-nums;
}

.bg-picker__footer {
  display: flex;
  gap: 10px;
  padding: 12px 18px;
  border-top: var(--ui-border-width-thin) solid var(--modal-header-border-color);

  .ui-button {
    flex: 1;
  }
}
</style>
