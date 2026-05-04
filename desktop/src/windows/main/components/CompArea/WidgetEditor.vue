<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { GridItem, WidgetConfig, WidgetEditPayload, BackgroundStyleConfig, WidgetAction, WidgetActionType, WebpageOpenMode } from '../../types/grid';
import type { InstalledPluginRecord, PluginPageDescriptor, PluginCommandContribution } from '@/contracts/plugin_host';
import type { CompressQuality } from '@/contracts/media';
import { useAppConfigStore } from '../../stores/app_config_store';
import UiButton from '../ui/UiButton.vue';
import UiDialog from '../ui/UiDialog.vue';
import UiField from '../ui/UiField.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiInput from '../ui/UiInput.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTabs from '../ui/UiTabs.vue';
import IconPicker from '../ui/IconPicker.vue';
import IconRenderer from '../ui/IconRenderer.vue';
import HomeWidgetConfigFields from '../../widgets/home/HomeWidgetConfigFields.vue';
import { findWidgetSizePreset, getHomeWidgetDefinition, getWidgetSizeDefinition, normalizeWidgetConfig } from '../../widgets/home/registry';

const props = withDefaults(defineProps<{
  visible: boolean;
  item: GridItem;
  previewWidth?: number;
  previewHeight?: number;
}>(), {
  previewWidth: 320,
  previewHeight: 200,
});

const emit = defineEmits<{
  close: [];
  confirm: [payload: WidgetEditPayload];
}>();

type EditorTab = 'basic' | 'size' | 'background';

const activeTab = ref<EditorTab>('basic');
const editorTabTransition = ref('ui-tab-forward');
const editorTabOrder: EditorTab[] = ['basic', 'size', 'background'];

// ─── 基础信息 ───
const editLabel = ref('');
const editIcon = ref('');

// ─── 动作配置 ───
const editActionType = ref<WidgetActionType>('none');
const editActionTarget = ref('');
const editActionPluginId = ref('');
const editActionPageId = ref('');
const editActionCommandId = ref('');
const editActionUrl = ref('');
const editActionOpenMode = ref<WebpageOpenMode>('main_window');

// ─── 插件数据（用于选择器） ───
const pluginList = ref<InstalledPluginRecord[]>([]);
const pluginPageList = ref<PluginPageDescriptor[]>([]);
const pluginCommandList = ref<PluginCommandContribution[]>([]);

// ─── 尺寸 ───
const editColSpan = ref(1);
const editRowSpan = ref(1);
const editSizePreset = ref<'2x2' | '4x2' | '4x3' | 'custom'>('custom');
const editWidgetConfig = ref<WidgetConfig | undefined>(undefined);

// ─── 背景 ───
type BackgroundTab = 'color' | 'image' | 'video';
const bgTab = ref<BackgroundTab>('color');
const bgTabTransition = ref('ui-tab-forward');
const bgTabOrder: BackgroundTab[] = ['color', 'image', 'video'];
const selectedColor = ref('');
const selectedImage = ref('');
const selectedVideo = ref('');
const bgSize = ref('cover');
const bgPosition = ref('center');
const bgRepeat = ref('no-repeat');
const bgOpacity = ref(1);

const imageInput = ref<HTMLInputElement | null>(null);
const videoInput = ref<HTMLInputElement | null>(null);

// 图片裁剪
const showCropper = ref(false);
const originalImage = ref('');

// 视频裁剪
const showVideoCropper = ref(false);
const originalVideoUrl = ref('');
const originalVideoFilePath = ref('');

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

const editorTabs = [
  { key: 'basic', label: '基础信息' },
  { key: 'size', label: '尺寸配置' },
  { key: 'background', label: '背景设置' },
];

const backgroundSubTabs = [
  { key: 'color', label: '颜色' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
];

watch(activeTab, (next, previous) => {
  editorTabTransition.value = editorTabOrder.indexOf(next) >= editorTabOrder.indexOf(previous)
    ? 'ui-tab-forward'
    : 'ui-tab-back';
});

watch(bgTab, (next, previous) => {
  bgTabTransition.value = bgTabOrder.indexOf(next) >= bgTabOrder.indexOf(previous)
    ? 'ui-tab-forward'
    : 'ui-tab-back';
});

const showIconPicker = ref(false);
const widgetDefinition = computed(() => getHomeWidgetDefinition(props.item.widgetType));
const isShortcutWidget = computed(() => props.item.widgetType === 'shortcut');
const sizePresetOptions = computed(() => widgetDefinition.value.supportedSizes);

const actionTypeOptions = [
  { label: '无动作', value: 'none' },
  { label: '打开外部应用', value: 'external_app' },
  { label: '打开内部功能', value: 'internal_route' },
  { label: '打开网页', value: 'open_webpage' },
  { label: '打开插件页面', value: 'plugin_page' },
  { label: '执行插件命令', value: 'plugin_command' },
];

const openModeOptions = [
  { label: '主窗口内打开', value: 'main_window' },
  { label: '新窗口打开', value: 'new_window' },
];

const internalRouteOptions = [
  { label: '插件平台', value: '/plugins' },
  { label: 'Todo', value: '/todo' },
];

const pluginSelectOptions = computed(() =>
  pluginList.value
    .filter(p => p.enabled)
    .map(p => ({ label: p.manifest.displayName || p.manifest.name, value: p.manifest.id }))
);

const pluginPageSelectOptions = computed(() =>
  pluginPageList.value
    .filter(p => p.pluginId === editActionPluginId.value)
    .map(p => ({ label: p.title, value: p.pageId }))
);

const pluginCommandSelectOptions = computed(() =>
  pluginCommandList.value.map(c => ({ label: c.title, value: c.id }))
);

async function loadPluginData() {
  try {
    pluginList.value = await window.pluginHostApi.listPlugins();
    pluginPageList.value = await window.pluginHostApi.listPages();
  } catch {
    pluginList.value = [];
    pluginPageList.value = [];
  }
}

// 选中插件时更新命令列表
watch(editActionPluginId, (pluginId) => {
  const plugin = pluginList.value.find(p => p.manifest.id === pluginId);
  pluginCommandList.value = plugin?.manifest.contributes.commands ?? [];
  // 切换插件后重置 pageId / commandId
  editActionPageId.value = '';
  editActionCommandId.value = '';
});

watch([editColSpan, editRowSpan], ([colSpan, rowSpan]) => {
  editSizePreset.value = findWidgetSizePreset(props.item.widgetType, colSpan, rowSpan);
});

async function handleBrowseExecutable() {
  const filePath = await window.shellApi.selectFile({
    title: '选择应用程序',
    filters: [
      { name: '可执行文件', extensions: ['exe', 'bat', 'cmd', 'lnk'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (filePath) {
    editActionTarget.value = filePath;
  }
}

const spanOptions = [
  { label: '1 格', value: 1 },
  { label: '2 格', value: 2 },
  { label: '3 格', value: 3 },
  { label: '4 格', value: 4 },
  { label: '5 格', value: 5 },
  { label: '6 格', value: 6 },
];

watch(editSizePreset, (preset) => {
  if (preset === 'custom') {
    return;
  }

  const size = getWidgetSizeDefinition(props.item.widgetType, preset);
  if (!size) {
    return;
  }

  editColSpan.value = size.colSpan;
  editRowSpan.value = size.rowSpan;
});

const bgSizeOptions = [
  { label: '覆盖 (cover)', value: 'cover' },
  { label: '适应 (contain)', value: 'contain' },
  { label: '原始 (auto)', value: 'auto' },
  { label: '拉伸 (100% 100%)', value: '100% 100%' },
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

// ─── 尺寸预览 ───
const sizePreviewStyle = computed(() => {
  const unit = 48;
  const gap = 4;
  return {
    width: `${editColSpan.value * unit + Math.max(0, editColSpan.value - 1) * gap}px`,
    height: `${editRowSpan.value * unit + Math.max(0, editRowSpan.value - 1) * gap}px`,
  };
});

// ─── 背景预览 ───
const bgPreviewBoxStyle = computed(() => {
  const maxW = 500;
  const maxH = 140;
  const aspect = props.previewWidth / props.previewHeight;
  let w = maxW;
  let h = w / aspect;

  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }

  const base: Record<string, string> = {
    width: `${w}px`,
    height: `${h}px`,
    margin: '0 auto',
  };

  if (bgTab.value === 'color') {
    base.background = selectedColor.value || '#2a2a2a';
    if (bgOpacity.value < 1) base.opacity = String(bgOpacity.value);
  } else if (bgTab.value === 'image' && selectedImage.value) {
    base.backgroundImage = `url(${selectedImage.value})`;
    base.backgroundSize = bgSize.value;
    base.backgroundPosition = bgPosition.value;
    base.backgroundRepeat = bgRepeat.value;
    if (bgOpacity.value < 1) base.opacity = String(bgOpacity.value);
  } else if (bgTab.value === 'video') {
    base.background = '#1a1a2e';
    if (bgOpacity.value < 1) base.opacity = String(bgOpacity.value);
  } else {
    base.background = '#2a2a2a';
  }

  return base;
});

// ─── 图片处理 ───
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
    showCropper.value = true;
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

// ─── 视频处理 ───
function handleVideoSelect() {
  videoInput.value?.click();
}

function handleVideoChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

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

// ─── 确认 / 关闭 ───
function buildAction(): WidgetAction | undefined {
  if (editActionType.value === 'none') return undefined;

  const action: WidgetAction = { type: editActionType.value };

  if (editActionType.value === 'external_app' || editActionType.value === 'internal_route') {
    action.target = editActionTarget.value || undefined;
  } else if (editActionType.value === 'open_webpage') {
    action.url = editActionUrl.value || undefined;
    action.openMode = editActionOpenMode.value;
  } else if (editActionType.value === 'plugin_page') {
    action.pluginId = editActionPluginId.value || undefined;
    action.pageId = editActionPageId.value || undefined;
  } else if (editActionType.value === 'plugin_command') {
    action.pluginId = editActionPluginId.value || undefined;
    action.commandId = editActionCommandId.value || undefined;
  }

  return action;
}

function handleConfirm() {
  const backgroundStyle: BackgroundStyleConfig = {
    backgroundSize: bgSize.value,
    backgroundPosition: bgPosition.value,
    backgroundRepeat: bgRepeat.value,
    opacity: bgOpacity.value,
  };

  // 根据当前 bgTab 来决定保留哪些背景数据
  let color = '';
  let backgroundImage = '';
  let backgroundVideo = '';
  let finalBgStyle = backgroundStyle;

  if (bgTab.value === 'color') {
    color = selectedColor.value;
    finalBgStyle = { opacity: bgOpacity.value };
  } else if (bgTab.value === 'image') {
    backgroundImage = selectedImage.value;
  } else if (bgTab.value === 'video') {
    backgroundVideo = selectedVideo.value;
  }

  const payload: WidgetEditPayload = {
    label: editLabel.value,
    icon: isShortcutWidget.value ? (editIcon.value || undefined) : props.item.icon,
    action: isShortcutWidget.value ? buildAction() : props.item.action,
    colSpan: editColSpan.value,
    rowSpan: editRowSpan.value,
    sizePreset: editSizePreset.value === 'custom' ? undefined : editSizePreset.value,
    widgetConfig: normalizeWidgetConfig(props.item.widgetType, editWidgetConfig.value),
    color,
    backgroundImage: backgroundImage || undefined,
    backgroundVideo: backgroundVideo || undefined,
    backgroundStyle: finalBgStyle,
  };

  emit('confirm', payload);
  emit('close');
}

function handleClose() {
  emit('close');
}

function handleDialogModelValueChange(value: boolean) {
  if (!value) handleClose();
}

// ─── 同步 props ───
watch(() => props.visible, (visible) => {
  if (visible) {
    activeTab.value = 'basic';

    // 基础信息
    editLabel.value = props.item.label || '';
    editIcon.value = props.item.icon || '';

    // 动作
    const action = props.item.action;
    editActionType.value = action?.type || 'none';
    editActionTarget.value = action?.target || '';
    editActionPluginId.value = action?.pluginId || '';
    editActionPageId.value = action?.pageId || '';
    editActionCommandId.value = action?.commandId || '';
    editActionUrl.value = action?.url || '';
    editActionOpenMode.value = action?.openMode || 'main_window';

    // 尺寸
    editColSpan.value = props.item.colSpan || 1;
    editRowSpan.value = props.item.rowSpan || 1;
    editSizePreset.value = props.item.sizePreset || findWidgetSizePreset(props.item.widgetType, props.item.colSpan, props.item.rowSpan);
    editWidgetConfig.value = normalizeWidgetConfig(props.item.widgetType, props.item.widgetConfig);

    // 背景
    selectedColor.value = props.item.color || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    selectedImage.value = props.item.backgroundImage || '';
    selectedVideo.value = props.item.backgroundVideo || '';
    bgSize.value = props.item.backgroundStyle?.backgroundSize || 'cover';
    bgPosition.value = props.item.backgroundStyle?.backgroundPosition || 'center';
    bgRepeat.value = props.item.backgroundStyle?.backgroundRepeat || 'no-repeat';
    bgOpacity.value = props.item.backgroundStyle?.opacity ?? 1;

    if (props.item.backgroundVideo) {
      bgTab.value = 'video';
    } else if (props.item.backgroundImage) {
      bgTab.value = 'image';
    } else {
      bgTab.value = 'color';
    }

    // 加载插件数据（用于插件相关动作类型的选择器）
    void loadPluginData();
  }
});
</script>

<template>
  <UiDialog class="widget-editor" :model-value="visible" width="620px" max-width="620px" :close-on-mask="false"
    @update:modelValue="handleDialogModelValueChange">
    <template #header>
      <div class="widget-editor__header">
        <h3>编辑组件</h3>
        <UiIconButton class="close-btn" variant="ghost" size="md" shape="square" title="关闭" @click="handleClose">
          ✕
        </UiIconButton>
      </div>
    </template>

    <div class="widget-editor__tabs">
      <UiTabs v-model="activeTab" :items="editorTabs" variant="line" size="md" stretch />
    </div>

    <div class="widget-editor__content">
      <Transition :name="editorTabTransition" mode="out-in">
      <!-- ═══ 基础信息 ═══ -->
      <div v-if="activeTab === 'basic'" class="widget-editor__section">
        <UiField label="组件名称" required>
          <UiInput v-model="editLabel" placeholder="输入组件名称" size="md" />
        </UiField>
        <UiField v-if="widgetDefinition.allowCustomIcon" label="图标">
          <div class="icon-pick-trigger" @click="showIconPicker = true">
            <div v-if="editIcon" class="icon-pick-trigger__preview">
              <IconRenderer :icon="editIcon" :size="20" color="var(--ui-text-primary)" />
              <span class="icon-pick-trigger__label">更换图标</span>
            </div>
            <span v-else class="icon-pick-trigger__placeholder">点击选择图标</span>
            <span class="icon-pick-trigger__arrow" />
          </div>
        </UiField>

        <IconPicker :visible="showIconPicker" v-model="editIcon" @close="showIconPicker = false" />

        <div v-if="!isShortcutWidget" class="widget-editor__builtin-hint">
          <div class="widget-editor__builtin-title">{{ widgetDefinition.title }}</div>
          <div class="widget-editor__builtin-desc">{{ widgetDefinition.description }}</div>
        </div>

        <HomeWidgetConfigFields v-if="!isShortcutWidget" v-model="editWidgetConfig" :widget-type="props.item.widgetType" />

        <UiField v-if="isShortcutWidget" label="动作类型">
          <UiSelect v-model="editActionType" :options="actionTypeOptions" size="md" />
        </UiField>

        <!-- 外部应用 -->
        <UiField v-if="isShortcutWidget && editActionType === 'external_app'" label="应用程序路径">
          <div class="widget-editor__file-row">
            <UiInput v-model="editActionTarget" placeholder="选择可执行文件路径" size="md" />
            <UiButton variant="secondary" size="md" @click="handleBrowseExecutable">浏览</UiButton>
          </div>
        </UiField>

        <!-- 内部路由 -->
        <UiField v-if="isShortcutWidget && editActionType === 'internal_route'" label="选择功能">
          <UiSelect v-model="editActionTarget" :options="internalRouteOptions" size="md" placeholder="请选择内部功能" />
        </UiField>

        <!-- 插件页面 -->
        <template v-if="isShortcutWidget && editActionType === 'plugin_page'">
          <UiField label="选择插件">
            <UiSelect v-model="editActionPluginId" :options="pluginSelectOptions" size="md" placeholder="请选择插件" />
          </UiField>
          <UiField v-if="editActionPluginId" label="选择页面">
            <UiSelect v-model="editActionPageId" :options="pluginPageSelectOptions" size="md" placeholder="请选择页面" />
          </UiField>
        </template>

        <!-- 插件命令 -->
        <template v-if="isShortcutWidget && editActionType === 'plugin_command'">
          <UiField label="选择插件">
            <UiSelect v-model="editActionPluginId" :options="pluginSelectOptions" size="md" placeholder="请选择插件" />
          </UiField>
          <UiField v-if="editActionPluginId" label="选择命令">
            <UiSelect v-model="editActionCommandId" :options="pluginCommandSelectOptions" size="md"
              placeholder="请选择命令" />
          </UiField>
        </template>

        <!-- 打开网页 -->
        <template v-if="isShortcutWidget && editActionType === 'open_webpage'">
          <UiField label="网页地址">
            <UiInput v-model="editActionUrl" placeholder="输入网页 URL，如 https://github.com" size="md" />
          </UiField>
          <UiField label="打开方式">
            <UiSelect v-model="editActionOpenMode" :options="openModeOptions" size="md" />
          </UiField>
        </template>
      </div>

      <!-- ═══ 尺寸配置 ═══ -->
      <div v-else-if="activeTab === 'size'" class="widget-editor__section">
        <div v-if="sizePresetOptions.length" class="widget-editor__size-preset-grid">
          <button v-for="size in sizePresetOptions" :key="size.preset" type="button" class="widget-editor__size-preset"
            :class="{ 'widget-editor__size-preset--active': editSizePreset === size.preset }"
            @click="editSizePreset = size.preset">
            <strong>{{ size.label }}</strong>
            <span>{{ size.description }}</span>
          </button>
        </div>

        <div v-if="isShortcutWidget" class="widget-editor__size-fields">
          <UiField label="宽度 (列数)">
            <UiSelect v-model="editColSpan" :options="spanOptions" size="md" />
          </UiField>
          <UiField label="高度 (行数)">
            <UiSelect v-model="editRowSpan" :options="spanOptions" size="md" />
          </UiField>
        </div>

        <div class="widget-editor__size-preview">
          <div class="widget-editor__section-title">预览</div>
          <div class="widget-editor__size-preview-area">
            <div class="widget-editor__size-preview-grid">
              <template v-for="r in 6" :key="r">
                <div v-for="c in 6" :key="`${r}-${c}`" class="widget-editor__size-preview-cell"
                  :class="{ 'widget-editor__size-preview-cell--active': c <= editColSpan && r <= editRowSpan }" />
              </template>
            </div>
            <div class="widget-editor__size-preview-label">
              {{ editColSpan }} × {{ editRowSpan }}
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ 背景设置 ═══ -->
      <div v-else class="widget-editor__section">
        <div class="widget-editor__bg-tabs">
          <UiTabs v-model="bgTab" :items="backgroundSubTabs" variant="segmented" size="sm" stretch />
        </div>

        <!-- 背景预览 -->
        <div class="widget-editor__bg-preview">
          <div class="widget-editor__bg-preview-wrapper"
            :class="{ 'widget-editor__bg-preview-wrapper--checker': bgOpacity < 1 }">
            <div class="widget-editor__bg-preview-box" :style="bgPreviewBoxStyle">
              <video v-if="bgTab === 'video' && selectedVideo" :src="selectedVideo"
                class="widget-editor__bg-preview-video" autoplay loop muted playsinline />
              <span v-else class="widget-editor__bg-preview-text">预览</span>
            </div>
          </div>
        </div>

        <Transition :name="bgTabTransition" mode="out-in">
        <!-- 颜色选择 -->
        <div v-if="bgTab === 'color'" class="widget-editor__color-section">
          <div class="widget-editor__section-title">渐变色</div>
          <div class="widget-editor__gradient-grid">
            <div v-for="(gradient, index) in presetGradients" :key="index" class="widget-editor__swatch"
              :class="{ 'widget-editor__swatch--selected': selectedColor === gradient }"
              :style="{ background: gradient }" @click="selectedColor = gradient">
              <div v-if="selectedColor === gradient" class="widget-editor__swatch-check">✓</div>
            </div>
          </div>

          <div class="widget-editor__section-title">纯色</div>
          <div class="widget-editor__color-grid">
            <div v-for="(color, index) in presetColors" :key="index" class="widget-editor__swatch"
              :class="{ 'widget-editor__swatch--selected': selectedColor === color }" :style="{ background: color }"
              @click="selectedColor = color">
              <div v-if="selectedColor === color" class="widget-editor__swatch-check">✓</div>
            </div>
          </div>
        </div>

        <!-- 图片选择 -->
        <div v-else-if="bgTab === 'image'" class="widget-editor__image-section">
          <div class="widget-editor__image-actions">
            <input ref="imageInput" type="file" accept="image/*" style="display: none" @change="handleImageChange" />
            <UiButton class="widget-editor__upload-btn" variant="secondary" size="md" @click="handleImageSelect">
              <span class="upload-icon">📁</span>
              <span>选择图片</span>
            </UiButton>
            <UiButton v-if="selectedImage" variant="danger" size="md" @click="handleClearImage">清除</UiButton>
          </div>

          <div v-if="selectedImage" class="widget-editor__style-panel">
            <div class="widget-editor__section-title">背景样式</div>
            <div class="widget-editor__style-grid">
              <div class="widget-editor__style-field">
                <label>填充模式</label>
                <UiSelect v-model="bgSize" :options="bgSizeOptions" size="sm" />
              </div>
              <div class="widget-editor__style-field">
                <label>重复方式</label>
                <UiSelect v-model="bgRepeat" :options="bgRepeatOptions" size="sm" />
              </div>
            </div>

            <div class="widget-editor__section-title">定位</div>
            <div class="widget-editor__position-grid">
              <button v-for="pos in positionGrid" :key="pos.value" class="widget-editor__pos-cell"
                :class="{ 'widget-editor__pos-cell--active': bgPosition === pos.value }" :title="pos.value"
                @click="bgPosition = pos.value">
                {{ pos.label }}
              </button>
            </div>
          </div>

          <p class="widget-editor__hint">支持 JPG, PNG, GIF, WebP 格式</p>

          <div class="widget-editor__process-options">
            <div class="widget-editor__section-title">处理方式</div>
            <div class="widget-editor__style-grid">
              <div class="widget-editor__style-field">
                <label>处理模式</label>
                <UiSelect v-model="imageProcessMode" :options="imageProcessOptions" size="sm" />
              </div>
              <div v-if="imageProcessMode === 'ffmpeg'" class="widget-editor__style-field">
                <label>压缩质量</label>
                <UiSelect v-model="compressQuality" :options="qualityOptions" size="sm" />
              </div>
            </div>
            <p v-if="!ffmpegAvailable" class="widget-editor__hint widget-editor__hint--warn">⚠️ 未配置 FFmpeg 路径，请前往 设置 → 工具 进行配置</p>
          </div>
        </div>

        <!-- 视频选择 -->
        <div v-else class="widget-editor__video-section">
          <div class="widget-editor__image-actions">
            <input ref="videoInput" type="file" accept="video/*" style="display: none" @change="handleVideoChange" />
            <UiButton class="widget-editor__upload-btn" variant="secondary" size="md" @click="handleVideoSelect">
              <span class="upload-icon">🎬</span>
              <span>选择视频</span>
            </UiButton>
            <UiButton v-if="selectedVideo" variant="danger" size="md" @click="handleClearVideo">清除</UiButton>
          </div>
          <p class="widget-editor__hint">支持 MP4, WebM, MOV 格式</p>

          <div class="widget-editor__process-options">
            <div class="widget-editor__section-title">处理方式</div>
            <div class="widget-editor__style-grid">
              <div class="widget-editor__style-field">
                <label>处理模式</label>
                <UiSelect v-model="videoProcessMode" :options="videoProcessOptions" size="sm" />
              </div>
              <div v-if="videoProcessMode === 'ffmpeg'" class="widget-editor__style-field">
                <label>压缩质量</label>
                <UiSelect v-model="compressQuality" :options="qualityOptions" size="sm" />
              </div>
            </div>
            <p v-if="!ffmpegAvailable" class="widget-editor__hint widget-editor__hint--warn">⚠️ 未配置 FFmpeg 路径，请前往 设置 → 工具 进行配置</p>
          </div>
        </div>
        </Transition>

        <!-- 透明度（通用） -->
        <div class="widget-editor__opacity-panel">
          <div class="widget-editor__section-title">透明度</div>
          <div class="widget-editor__opacity-row">
            <input type="range" class="widget-editor__opacity-slider" :value="Math.round(bgOpacity * 100)" min="0"
              max="100" step="1" @input="bgOpacity = Number(($event.target as HTMLInputElement).value) / 100" />
            <span class="widget-editor__opacity-value">{{ Math.round(bgOpacity * 100) }}%</span>
          </div>
        </div>
      </div>
      </Transition>
    </div>

    <template #footer>
      <div class="widget-editor__footer">
        <UiButton variant="secondary" @click="handleClose">取消</UiButton>
        <UiButton variant="primary" :disabled="!editLabel.trim()" @click="handleConfirm">保存</UiButton>
      </div>
    </template>

    <!-- 图片裁剪器 -->
    <ImageCropper v-if="showCropper" :visible="showCropper" :image="originalImage"
      :processing-mode="imageProcessMode" :quality="compressQuality"
      @close="handleCropperClose" @confirm="handleCropperConfirm" />

    <!-- 视频裁剪器 -->
    <VideoCropper v-if="showVideoCropper" :visible="showVideoCropper" :video-url="originalVideoUrl"
      :file-path="originalVideoFilePath"
      :target-width="props.previewWidth" :target-height="props.previewHeight"
      :processing-mode="videoProcessMode" :quality="compressQuality"
      @close="handleVideoCropperClose" @confirm="handleVideoCropperConfirm" />
  </UiDialog>
</template>

<script lang="ts">
import { defineAsyncComponent } from 'vue';
const ImageCropper = defineAsyncComponent(() => import('./ImageCropper.vue'));
const VideoCropper = defineAsyncComponent(() => import('../ui/VideoCropper.vue'));

export default {
  components: { ImageCropper, VideoCropper },
};
</script>

<style lang="scss" scoped>
@use '../../assets/scroll' as *;

.widget-editor {
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.widget-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;

  h3 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 18px;
    font-weight: 600;
  }
}

.widget-editor__tabs {
  padding: 0 24px;
}

.widget-editor__content {
  flex: 1;
  @include thin-scroll;
  padding: 20px 24px;
  max-height: 420px;
}

.widget-editor__section {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.widget-editor__builtin-hint {
  padding: 14px 16px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.widget-editor__builtin-title {
  color: var(--ui-text-primary);
  font-size: 14px;
  font-weight: 700;
}

.widget-editor__builtin-desc {
  margin-top: 6px;
  color: var(--ui-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.widget-editor__file-row {
  display: flex;
  gap: 8px;
  align-items: center;

  .ui-input {
    flex: 1;
  }
}

.widget-editor__section-title {
  color: var(--modal-section-title-color);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 10px;
  margin-top: 16px;

  &:first-child {
    margin-top: 0;
  }
}

/* ─── 尺寸配置 ─── */
.widget-editor__size-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.widget-editor__size-preset-grid {
  display: grid;
  gap: 10px;
}

.widget-editor__size-preset {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border-radius: var(--ui-radius-sm);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-overlay);
  color: var(--ui-text-primary);
  text-align: left;
  cursor: pointer;

  span {
    color: var(--ui-text-secondary);
    font-size: 12px;
  }
}

.widget-editor__size-preset--active {
  border-color: var(--ui-button-primary-border);
  box-shadow: var(--ui-shadow-sm);
}

.widget-editor__size-preview-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.widget-editor__size-preview-grid {
  display: grid;
  grid-template-columns: repeat(6, 40px);
  grid-template-rows: repeat(6, 40px);
  gap: 4px;
}

.widget-editor__size-preview-cell {
  border-radius: 6px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: transparent;
  transition: all 0.22s ease;

  &--active {
    background: var(--ui-button-primary-bg);
    border-color: var(--ui-button-primary-border);
    box-shadow: var(--ui-shadow-sm);
  }
}

.widget-editor__size-preview-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text-primary);
  font-variant-numeric: tabular-nums;
}

/* ─── 背景设置 ─── */
.widget-editor__bg-tabs {
  margin-bottom: 16px;
}

.widget-editor__bg-preview {
  margin-bottom: 16px;

  .widget-editor__bg-preview-wrapper {
    border-radius: var(--ui-radius-sm);
    overflow: hidden;
    box-shadow: var(--ui-shadow-md);

    &--checker {
      background-image: repeating-conic-gradient(rgba(128, 128, 128, 0.15) 0% 25%,
          transparent 0% 50%);
      background-size: 16px 16px;
    }
  }

  .widget-editor__bg-preview-box {
    border-radius: var(--ui-radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }

  .widget-editor__bg-preview-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .widget-editor__bg-preview-text {
    color: var(--grid-item-text-color);
    font-size: 15px;
    font-weight: 600;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }
}

.widget-editor__gradient-grid,
.widget-editor__color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.widget-editor__swatch {
  aspect-ratio: 1;
  border-radius: var(--ui-radius-sm);
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

.widget-editor__swatch-check {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 20px;
  font-weight: bold;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.widget-editor__image-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.widget-editor__upload-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-style: dashed;
  border-color: var(--modal-upload-border-color);
  background: var(--modal-upload-bg-color);

  .upload-icon {
    font-size: 17px;
  }
}

.widget-editor__hint {
  color: var(--modal-hint-color);
  font-size: 12px;
  margin: 4px 0 0;
  text-align: center;

  &--warn {
    color: var(--ui-warning-color, #e6a23c);
    font-weight: 500;
  }
}

.widget-editor__process-options {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.widget-editor__style-panel {
  margin-top: 4px;
  padding: 14px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.widget-editor__style-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.widget-editor__style-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 12px;
    color: var(--ui-text-muted);
    font-weight: 500;
  }
}

.widget-editor__position-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  max-width: 160px;
}

.widget-editor__pos-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
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

/* ─── 透明度 ─── */
.widget-editor__opacity-panel {
  margin-top: 16px;
  padding: 14px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.widget-editor__opacity-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.widget-editor__opacity-slider {
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
    width: 18px;
    height: 18px;
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
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--primary-color, #667eea);
    border: 2px solid var(--ui-text-inverse);
    box-shadow: var(--ui-shadow-sm);
    cursor: pointer;
  }

  &::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: var(--ui-border-subtle);
  }
}

.widget-editor__opacity-value {
  min-width: 42px;
  text-align: right;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-primary);
  font-variant-numeric: tabular-nums;
}

/* ─── Footer ─── */
.widget-editor__footer {
  display: flex;
  gap: 12px;
  padding: 16px 24px;

  .ui-button {
    flex: 1;
  }
}

/* ─── 图标选择触发器 ─── */
.icon-pick-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  border: var(--ui-border-width-thin) solid var(--ui-select-border);
  background: var(--ui-select-bg);
  color: var(--ui-select-text);
  border-radius: var(--ui-radius-sm);
  min-height: var(--ui-control-height-md);
  padding: var(--ui-control-padding-y-md) 40px var(--ui-control-padding-y-md) var(--ui-control-padding-x-md);
  font-size: 0.95rem;
  position: relative;
  transition:
    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: var(--ui-select-hover-border);
  }
}

.icon-pick-trigger__preview {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-pick-trigger__label {
  color: var(--ui-text-secondary);
  font-size: 0.92rem;
}

.icon-pick-trigger__placeholder {
  color: var(--ui-select-placeholder);
  font-size: 0.92rem;
}

.icon-pick-trigger__arrow {
  position: absolute;
  top: 50%;
  right: var(--ui-control-padding-x-md);
  width: 7px;
  height: 7px;
  border-right: var(--ui-border-width-strong) solid var(--ui-select-arrow);
  border-bottom: var(--ui-border-width-strong) solid var(--ui-select-arrow);
  transform: translateY(-60%) rotate(45deg);
  pointer-events: none;
}
</style>
