<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import type { GridItem, HomeWidgetType, WidgetConfig, WidgetCreatePayload, WidgetSizePreset, BackgroundConfirmPayload, BackgroundStyleConfig } from '../../types/grid';
import UiButton from '../ui/UiButton.vue';
import UiDialog from '../ui/UiDialog.vue';
import UiField from '../ui/UiField.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiInput from '../ui/UiInput.vue';
import UiScrollbar from '../ui/UiScrollbar.vue';
import UiSelect from '../ui/UiSelect.vue';
import IconPicker from '../ui/IconPicker.vue';
import UiPersonalizationConfig from '../ui/UiPersonalizationConfig.vue';
import HomeWidgetRenderer from '../../widgets/home/HomeWidgetRenderer.vue';
import HomeWidgetConfigFields from '../../widgets/home/HomeWidgetConfigFields.vue';
import { HOME_WIDGET_DEFINITIONS, getHomeWidgetDefinition, getWidgetSizeDefinition, normalizeWidgetConfig } from '../../widgets/home/registry';
import { useAppConfigStore } from '../../stores/app_config_store';
import { resolveThemeBackground, withThemeBackground } from '@/contracts/background';
import { buildBackgroundTextVars } from '../../utils/backgroundTextColor';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [payload: WidgetCreatePayload];
}>();

const selectedWidgetType = ref<HomeWidgetType>('pomodoro');
const selectedSizePreset = ref<WidgetSizePreset>('2x2');
const editColSpan = ref(2);
const editRowSpan = ref(2);
const editLabel = ref('');
const editIcon = ref('');
const editColor = ref('');
const editBackgroundImage = ref('');
const editBackgroundVideo = ref('');
const editBackgroundStyle = ref<BackgroundStyleConfig>({ opacity: 1 });
const widgetConfig = ref<WidgetConfig | undefined>(undefined);
const showIconPicker = ref(false);
const showBackgroundPicker = ref(false);
const appConfigStore = useAppConfigStore();

const selectedDefinition = computed(() => getHomeWidgetDefinition(selectedWidgetType.value));
const sizeOptions = computed(() => selectedDefinition.value.supportedSizes);
const isShortcutWidget = computed(() => selectedWidgetType.value === 'shortcut');
const hasWidgetConfig = computed(() => !isShortcutWidget.value && selectedWidgetType.value !== 'webview_keepalive');
const currentBackgroundTheme = computed(() => appConfigStore.config.appearance.theme);
const activeCreateBackground = computed(() => resolveThemeBackground({
  type: editBackgroundVideo.value ? 'video' : editBackgroundImage.value ? 'image' : 'color',
  color: editColor.value,
  image: editBackgroundImage.value,
  video: editBackgroundVideo.value,
  backgroundStyle: editBackgroundStyle.value,
}, currentBackgroundTheme.value));
const widgetTypeOptions = computed(() =>
  HOME_WIDGET_DEFINITIONS.map((definition) => ({
    label: definition.title,
    value: definition.widgetType,
  })),
);

const PRESET_GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
];

const PRESET_COLORS = [
  '#667eea', '#f093fb', '#4facfe', '#43e97b',
  '#fa709a', '#30cfd0', '#a8edea', '#ff9a9e',
  '#ffecd2', '#ff6e7f', '#e0c3fc', '#f8b500',
];

function applyWidgetDefaults(widgetType: HomeWidgetType) {
  const definition = getHomeWidgetDefinition(widgetType);
  selectedWidgetType.value = widgetType;
  selectedSizePreset.value = definition.supportedSizes[0]?.preset ?? 'custom';
  editColSpan.value = definition.supportedSizes[0]?.colSpan ?? 2;
  editRowSpan.value = definition.supportedSizes[0]?.rowSpan ?? 2;
  editLabel.value = definition.defaultLabel;
  editIcon.value = definition.defaultIcon || '';
  editColor.value = definition.defaultColor;
  editBackgroundImage.value = '';
  editBackgroundVideo.value = '';
  editBackgroundStyle.value = withThemeBackground({}, appConfigStore.config.appearance.theme, {
    type: 'color',
    color: definition.defaultColor,
    backgroundStyle: { opacity: 1 },
  }).backgroundStyle;
  widgetConfig.value = normalizeWidgetConfig(widgetType, definition.createDefaultConfig());
}

function handleWidgetTypeChange(value: string | number) {
  applyWidgetDefaults(String(value) as HomeWidgetType);
}

function handleConfirm() {
  const selectedSize = isShortcutWidget.value
    ? { colSpan: Math.max(1, editColSpan.value), rowSpan: Math.max(1, editRowSpan.value) }
    : getWidgetSizeDefinition(selectedWidgetType.value, selectedSizePreset.value);
  if (!selectedSize || selectedSize.colSpan <= 0 || selectedSize.rowSpan <= 0) {
    return;
  }

  const background = activeCreateBackground.value;

  emit('confirm', {
    label: editLabel.value.trim() || selectedDefinition.value.defaultLabel,
    icon: editIcon.value || undefined,
    action: undefined,
    sourceType: selectedDefinition.value.sourceType,
    widgetType: selectedWidgetType.value,
    sizePreset: isShortcutWidget.value ? 'custom' : selectedSizePreset.value,
    widgetConfig: widgetConfig.value,
    colSpan: selectedSize.colSpan,
    rowSpan: selectedSize.rowSpan,
    color: background.color || selectedDefinition.value.defaultColor,
    backgroundImage: background.image,
    backgroundVideo: background.video,
    backgroundStyle: editBackgroundStyle.value,
  });
  emit('close');
}

function handleBackgroundConfirm(payload: BackgroundConfirmPayload) {
  const background = withThemeBackground({
    type: editBackgroundVideo.value ? 'video' : editBackgroundImage.value ? 'image' : 'color',
    color: editColor.value,
    image: editBackgroundImage.value,
    video: editBackgroundVideo.value,
    backgroundStyle: editBackgroundStyle.value,
  }, currentBackgroundTheme.value, {
    type: payload.type,
    color: payload.color ?? '',
    image: payload.image ?? '',
    video: payload.video ?? '',
    backgroundStyle: payload.backgroundStyle ?? {},
  });

  editColor.value = background.color;
  editBackgroundImage.value = background.image;
  editBackgroundVideo.value = background.video;
  editBackgroundStyle.value = background.backgroundStyle;
  showBackgroundPicker.value = false;
}

function updateShortcutColSpan(value: string) {
  editColSpan.value = Math.max(1, Number.parseInt(value || '1', 10) || 1);
}

function updateShortcutRowSpan(value: string) {
  editRowSpan.value = Math.max(1, Number.parseInt(value || '1', 10) || 1);
}

function selectPresetColor(color: string) {
  editColor.value = color;
  editBackgroundImage.value = '';
  editBackgroundVideo.value = '';
  editBackgroundStyle.value = withThemeBackground({
    type: 'color',
    color: editColor.value,
    backgroundStyle: editBackgroundStyle.value,
  }, currentBackgroundTheme.value, {
    type: 'color',
    color,
    backgroundStyle: {
      ...activeCreateBackground.value.backgroundStyle,
      opacity: activeCreateBackground.value.backgroundStyle.opacity ?? 1,
    },
  }).backgroundStyle;
}

function handleClose() {
  emit('close');
}

function handleDialogModelValueChange(value: boolean) {
  if (!value) handleClose();
}

const previewItem = computed<GridItem>(() => {
  const selectedSize = isShortcutWidget.value
    ? { colSpan: Math.max(1, editColSpan.value), rowSpan: Math.max(1, editRowSpan.value) }
    : getWidgetSizeDefinition(selectedWidgetType.value, selectedSizePreset.value);
  const background = activeCreateBackground.value;
  return {
    id: 'widget-preview',
    label: editLabel.value.trim() || selectedDefinition.value.defaultLabel,
    icon: editIcon.value || undefined,
    action: undefined,
    sourceType: selectedDefinition.value.sourceType,
    widgetType: selectedWidgetType.value,
    sizePreset: isShortcutWidget.value ? 'custom' : selectedSizePreset.value,
    widgetConfig: widgetConfig.value,
    col: 1,
    row: 1,
    colSpan: selectedSize?.colSpan ?? 2,
    rowSpan: selectedSize?.rowSpan ?? 2,
    color: background.color || selectedDefinition.value.defaultColor,
    backgroundImage: background.image,
    backgroundVideo: background.video,
    backgroundStyle: background.backgroundStyle,
    isDragging: false,
    preferredCol: 1,
    preferredRow: 1,
    priority: 1,
    hidden: false,
  };
});

const previewBoxStyle = computed<CSSProperties>(() => {
  const colSpan = Math.max(1, previewItem.value.colSpan);
  const rowSpan = Math.max(1, previewItem.value.rowSpan);
  const maxWidth = 320;
  const maxHeight = 248;
  const unit = Math.min(72, Math.floor(Math.min(maxWidth / colSpan, maxHeight / rowSpan)));
  return {
    width: `${Math.max(44, colSpan * unit)}px`,
    height: `${Math.max(44, rowSpan * unit)}px`,
  };
});

function toObjectFit(backgroundSizeValue: string): 'contain' | 'cover' | 'fill' {
  if (backgroundSizeValue === 'contain') return 'contain';
  if (backgroundSizeValue === '100% 100%') return 'fill';
  return 'cover';
}

const previewBackgroundSize = computed(() => activeCreateBackground.value.backgroundStyle.backgroundSize || 'cover');
const previewBackgroundPosition = computed(() => activeCreateBackground.value.backgroundStyle.backgroundPosition || 'center');
const previewBackgroundRepeat = computed(() => activeCreateBackground.value.backgroundStyle.backgroundRepeat || 'no-repeat');
const previewBackgroundOpacity = computed(() => {
  const opacity = activeCreateBackground.value.backgroundStyle.opacity;
  return opacity != null && Number.isFinite(opacity) ? opacity : 1;
});
const previewUsesImgTag = computed(() => {
  return Boolean(activeCreateBackground.value.image)
    && !activeCreateBackground.value.video
    && previewBackgroundRepeat.value === 'no-repeat';
});
const previewBackgroundLayerStyle = computed<CSSProperties>(() => {
  const background = activeCreateBackground.value;
  const style: CSSProperties = {
    background: background.color || selectedDefinition.value.defaultColor || 'transparent',
    opacity: String(previewBackgroundOpacity.value),
  };

  if (background.image && !previewUsesImgTag.value) {
    style.backgroundImage = `url(${background.image})`;
    style.backgroundSize = previewBackgroundSize.value;
    style.backgroundPosition = previewBackgroundPosition.value;
    style.backgroundRepeat = previewBackgroundRepeat.value;
  }

  return style;
});
const previewBackgroundMediaStyle = computed<CSSProperties>(() => ({
  width: '100%',
  height: '100%',
  objectFit: toObjectFit(previewBackgroundSize.value),
  objectPosition: previewBackgroundPosition.value,
}));
const previewContentStyle = computed<CSSProperties>(() => buildBackgroundTextVars(
  activeCreateBackground.value.backgroundStyle.textColor,
  {
    aliases: {
      primary: ['--widget-text-primary', '--ui-text-primary'],
      secondary: ['--widget-text-secondary', '--ui-text-secondary'],
      muted: ['--widget-text-muted', '--ui-text-muted'],
      subtle: ['--widget-text-subtle', '--ui-text-subtle'],
    },
  },
));

watch(() => props.visible, (visible) => {
  if (visible) {
    applyWidgetDefaults('pomodoro');
  }
});
</script>

<template>
  <UiDialog class="widget-size-picker" :model-value="visible" width="940px" max-width="940px" :close-on-mask="false"
    @update:modelValue="handleDialogModelValueChange">
    <template #header>
      <div class="widget-size-picker__header">
        <h3>创建组件</h3>
        <UiIconButton class="close-btn" variant="ghost" size="md" shape="square" title="关闭" @click="handleClose">
          ✕
        </UiIconButton>
      </div>
    </template>

    <UiScrollbar class="widget-size-picker__scroll" :x="false" :y="true" :size="6">
      <div class="widget-size-picker__body">
        <div class="widget-size-picker__form">
          <section class="widget-size-picker__panel widget-size-picker__panel--primary">
            <div class="widget-size-picker__section-title">组件类型</div>
            <UiField label="类型">
              <UiSelect :model-value="selectedWidgetType" :options="widgetTypeOptions" size="md"
                @update:modelValue="handleWidgetTypeChange" />
            </UiField>
            <div class="widget-size-picker__type-summary">
              <strong>{{ selectedDefinition.title }}</strong>
              <span>{{ selectedDefinition.description }}</span>
            </div>
          </section>

          <section class="widget-size-picker__panel">
            <div v-if="!isShortcutWidget" class="widget-size-picker__section-title">尺寸</div>
            <div v-if="!isShortcutWidget" class="widget-size-picker__size-grid">
              <button v-for="size in sizeOptions" :key="size.preset" type="button" class="widget-size-picker__size-card"
                :class="{ 'widget-size-picker__size-card--active': selectedSizePreset === size.preset }"
                @click="selectedSizePreset = size.preset">
                <strong>{{ size.label }}</strong>
                <span>{{ size.description }}</span>
              </button>
            </div>

            <div v-else class="widget-size-picker__shortcut-size">
              <div class="widget-size-picker__section-title">尺寸</div>
              <div class="widget-size-picker__size-fields">
                <UiField label="宽度 (列数)">
                  <UiInput :model-value="String(editColSpan)" type="number" :min="1" :max="6" size="md"
                    @update:modelValue="updateShortcutColSpan" />
                </UiField>
                <UiField label="高度 (行数)">
                  <UiInput :model-value="String(editRowSpan)" type="number" :min="1" :max="6" size="md"
                    @update:modelValue="updateShortcutRowSpan" />
                </UiField>
              </div>
            </div>
          </section>

          <section class="widget-size-picker__panel">
            <div class="widget-size-picker__section-title">基础信息</div>
            <UiField label="名称" required>
              <UiInput v-model="editLabel" size="md" placeholder="输入组件名称" />
            </UiField>

            <UiField v-if="selectedDefinition.allowCustomIcon" label="图标">
              <div class="widget-size-picker__icon-trigger" @click="showIconPicker = true">
                <span>{{ editIcon ? '更换图标' : '点击选择图标' }}</span>
              </div>
            </UiField>

            <template v-if="selectedWidgetType === 'shortcut'">
              <div class="widget-size-picker__section-title">卡片颜色</div>
              <div class="widget-size-picker__swatch-grid">
                <button v-for="gradient in PRESET_GRADIENTS" :key="gradient" type="button" class="widget-size-picker__swatch"
                  :class="{ 'widget-size-picker__swatch--selected': editColor === gradient }"
                  :style="{ background: gradient }" @click="selectPresetColor(gradient)" />
              </div>
              <div class="widget-size-picker__swatch-grid widget-size-picker__swatch-grid--solid">
                <button v-for="color in PRESET_COLORS" :key="color" type="button" class="widget-size-picker__swatch"
                  :class="{ 'widget-size-picker__swatch--selected': editColor === color }"
                  :style="{ background: color }" @click="selectPresetColor(color)" />
              </div>
            </template>

            <div class="widget-size-picker__section-title">个性化配置</div>
            <div class="widget-size-picker__personalization">
              <div class="widget-size-picker__personalization-summary">
                <strong>当前主题</strong>
                <span>{{ activeCreateBackground.type === 'image' ? '图片背景' : activeCreateBackground.type === 'video' ? '视频背景' : '颜色背景' }}</span>
              </div>
              <UiButton variant="secondary" size="sm" @click="showBackgroundPicker = true">配置</UiButton>
            </div>

            <div v-if="hasWidgetConfig" class="widget-size-picker__section-title">组件配置</div>
            <HomeWidgetConfigFields v-if="hasWidgetConfig" v-model="widgetConfig"
              :widget-type="selectedWidgetType" />
          </section>
        </div>

        <aside class="widget-size-picker__preview-column">
          <div class="widget-size-picker__section-title">预览</div>
          <div class="widget-size-picker__preview-shell">
            <div class="widget-size-picker__preview-box" :style="previewBoxStyle">
              <div class="widget-size-picker__preview-bg" :style="previewBackgroundLayerStyle">
                <img
                  v-if="previewUsesImgTag"
                  class="widget-size-picker__preview-bg-media"
                  :src="activeCreateBackground.image"
                  alt=""
                  :style="previewBackgroundMediaStyle"
                  decoding="async"
                  draggable="false"
                />
                <video
                  v-if="activeCreateBackground.video"
                  class="widget-size-picker__preview-bg-media"
                  :src="activeCreateBackground.video"
                  autoplay
                  loop
                  muted
                  playsinline
                  :style="previewBackgroundMediaStyle"
                />
              </div>
              <div class="widget-size-picker__preview-content" :style="previewContentStyle">
                <HomeWidgetRenderer :item="previewItem" :interactive="false" />
              </div>
            </div>
            <div class="widget-size-picker__preview-meta">
              <strong>{{ selectedDefinition.title }}</strong>
              <span>{{ previewItem.colSpan }} × {{ previewItem.rowSpan }}</span>
            </div>
          </div>
        </aside>
      </div>
    </UiScrollbar>

    <template #footer>
      <div class="widget-size-picker__footer">
        <UiButton variant="secondary" @click="handleClose">取消</UiButton>
        <UiButton variant="primary" :disabled="!editLabel.trim()" @click="handleConfirm">确认创建</UiButton>
      </div>
    </template>

    <IconPicker :visible="showIconPicker" v-model="editIcon" @close="showIconPicker = false" />
    <UiPersonalizationConfig
      :visible="showBackgroundPicker"
      :current-background="activeCreateBackground.color"
      :current-background-image="activeCreateBackground.image"
      :current-background-video="activeCreateBackground.video"
      :current-background-style="activeCreateBackground.backgroundStyle"
      :preview-width="Number.parseInt(String(previewBoxStyle.width), 10) || 320"
      :preview-height="Number.parseInt(String(previewBoxStyle.height), 10) || 200"
      @close="showBackgroundPicker = false"
      @confirm="handleBackgroundConfirm"
    />
  </UiDialog>
</template>

<style lang="scss" scoped>
.widget-size-picker__header {
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

.widget-size-picker__scroll {
  height: min(62vh, 680px);
  min-height: 420px;
}

.widget-size-picker__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: 18px;
  padding: 0 24px 20px;
}

.widget-size-picker__form,
.widget-size-picker__preview-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.widget-size-picker__preview-column {
  position: sticky;
  top: 0;
  align-self: start;
}

.widget-size-picker__panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 16px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.widget-size-picker__panel--primary {
  gap: 12px;
}

.widget-size-picker__section-title {
  color: var(--modal-section-title-color);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.widget-size-picker__type-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-panel-muted);
  color: var(--ui-text-primary);

  strong {
    font-size: 13px;
    font-weight: 700;
  }

  span {
    color: var(--ui-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
}

.widget-size-picker__size-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.widget-size-picker__size-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.widget-size-picker__size-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 70px;
  padding: 12px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-panel-muted);
  color: var(--ui-text-primary);
  text-align: left;
  cursor: pointer;

  span {
    color: var(--ui-text-secondary);
    font-size: 12px;
    line-height: 1.4;
  }

  &--active {
    border-color: var(--ui-button-primary-border);
    background: var(--ui-button-ghost-hover-bg);
    box-shadow: var(--ui-shadow-sm);
  }
}

.widget-size-picker__icon-trigger {
  display: flex;
  align-items: center;
  min-height: var(--ui-control-height-md);
  padding: 0 var(--ui-control-padding-x-md);
  border-radius: var(--ui-radius-sm);
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  background: var(--ui-input-bg);
  color: var(--ui-text-primary);
  cursor: pointer;
}

.widget-size-picker__swatch-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.widget-size-picker__swatch {
  height: 34px;
  border-radius: 10px;
  border: var(--ui-border-width-thin) solid transparent;
  cursor: pointer;
  box-shadow: var(--ui-shadow-xs);
}

.widget-size-picker__swatch--selected {
  border-color: var(--ui-button-primary-border);
  box-shadow: var(--ui-shadow-sm);
}

.widget-size-picker__personalization {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-panel-muted);
}

.widget-size-picker__personalization-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--ui-text-primary);

  strong {
    font-size: 13px;
    font-weight: 700;
  }

  span {
    color: var(--ui-text-secondary);
    font-size: 12px;
  }
}

.widget-size-picker__preview-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.widget-size-picker__preview-box {
  position: relative;
  max-width: 100%;
  margin: 0 auto;
  border-radius: var(--ui-radius-sm);
  overflow: hidden;
  box-shadow: var(--ui-shadow-md);
  isolation: isolate;
}

.widget-size-picker__preview-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.widget-size-picker__preview-bg-media {
  display: block;
}

.widget-size-picker__preview-content {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  color: var(--widget-text-primary, inherit);
}

.widget-size-picker__preview-meta {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--ui-text-secondary);
}

.widget-size-picker__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
}
</style>
