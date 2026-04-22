<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { GridItem, HomeWidgetType, WidgetConfig, WidgetCreatePayload, WidgetSizePreset } from '../../types/grid';
import UiButton from '../ui/UiButton.vue';
import UiDialog from '../ui/UiDialog.vue';
import UiField from '../ui/UiField.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiInput from '../ui/UiInput.vue';
import IconPicker from '../ui/IconPicker.vue';
import HomeWidgetRenderer from '../../widgets/home/HomeWidgetRenderer.vue';
import HomeWidgetConfigFields from '../../widgets/home/HomeWidgetConfigFields.vue';
import { HOME_WIDGET_DEFINITIONS, getHomeWidgetDefinition, getWidgetSizeDefinition, normalizeWidgetConfig } from '../../widgets/home/registry';

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
const widgetConfig = ref<WidgetConfig | undefined>(undefined);
const showIconPicker = ref(false);

const selectedDefinition = computed(() => getHomeWidgetDefinition(selectedWidgetType.value));
const sizeOptions = computed(() => selectedDefinition.value.supportedSizes);
const isShortcutWidget = computed(() => selectedWidgetType.value === 'shortcut');

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
  widgetConfig.value = normalizeWidgetConfig(widgetType, definition.createDefaultConfig());
}

function handleConfirm() {
  const selectedSize = isShortcutWidget.value
    ? { colSpan: Math.max(1, editColSpan.value), rowSpan: Math.max(1, editRowSpan.value) }
    : getWidgetSizeDefinition(selectedWidgetType.value, selectedSizePreset.value);
  if (!selectedSize || selectedSize.colSpan <= 0 || selectedSize.rowSpan <= 0) {
    return;
  }

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
    color: editColor.value || selectedDefinition.value.defaultColor,
    backgroundStyle: { opacity: 1 },
  });
  emit('close');
}

function updateShortcutColSpan(value: string) {
  editColSpan.value = Math.max(1, Number.parseInt(value || '1', 10) || 1);
}

function updateShortcutRowSpan(value: string) {
  editRowSpan.value = Math.max(1, Number.parseInt(value || '1', 10) || 1);
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
    color: editColor.value || selectedDefinition.value.defaultColor,
    backgroundImage: '',
    backgroundVideo: '',
    backgroundStyle: { opacity: 1 },
    isDragging: false,
    preferredCol: 1,
    preferredRow: 1,
    priority: 1,
    hidden: false,
  };
});

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

    <div class="widget-size-picker__body">
      <div class="widget-size-picker__column">
        <div class="widget-size-picker__section-title">组件类型</div>
        <div class="widget-size-picker__type-grid">
          <button v-for="definition in HOME_WIDGET_DEFINITIONS" :key="definition.widgetType" type="button"
            class="widget-size-picker__type-card"
            :class="{ 'widget-size-picker__type-card--active': selectedWidgetType === definition.widgetType }"
            @click="applyWidgetDefaults(definition.widgetType)">
            <strong>{{ definition.title }}</strong>
            <span>{{ definition.description }}</span>
          </button>
        </div>

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
      </div>

      <div class="widget-size-picker__column">
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
              :style="{ background: gradient }" @click="editColor = gradient" />
          </div>
          <div class="widget-size-picker__swatch-grid widget-size-picker__swatch-grid--solid">
            <button v-for="color in PRESET_COLORS" :key="color" type="button" class="widget-size-picker__swatch"
              :class="{ 'widget-size-picker__swatch--selected': editColor === color }"
              :style="{ background: color }" @click="editColor = color" />
          </div>
        </template>

        <div v-if="selectedWidgetType !== 'shortcut'" class="widget-size-picker__section-title">组件配置</div>
        <HomeWidgetConfigFields v-if="selectedWidgetType !== 'shortcut'" v-model="widgetConfig"
          :widget-type="selectedWidgetType" />
      </div>

      <div class="widget-size-picker__column">
        <div class="widget-size-picker__section-title">预览</div>
        <div class="widget-size-picker__preview-shell">
          <div class="widget-size-picker__preview-box" :class="{
            'widget-size-picker__preview-box--wide': previewItem.colSpan >= 4 && previewItem.rowSpan === 2,
            'widget-size-picker__preview-box--large': previewItem.colSpan >= 4 && previewItem.rowSpan >= 3,
          }">
            <HomeWidgetRenderer :item="previewItem" :interactive="false" />
          </div>
          <div class="widget-size-picker__preview-meta">
            <strong>{{ selectedDefinition.title }}</strong>
            <span>{{ previewItem.colSpan }} × {{ previewItem.rowSpan }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="widget-size-picker__footer">
        <UiButton variant="secondary" @click="handleClose">取消</UiButton>
        <UiButton variant="primary" :disabled="!editLabel.trim()" @click="handleConfirm">确认创建</UiButton>
      </div>
    </template>

    <IconPicker :visible="showIconPicker" v-model="editIcon" @close="showIconPicker = false" />
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

.widget-size-picker__body {
  display: grid;
  grid-template-columns: 1.1fr 1fr 0.9fr;
  gap: 18px;
  padding: 0 24px 20px;
  max-height: min(60vh, 680px);
  overflow-y: auto;
}

.widget-size-picker__column {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.widget-size-picker__section-title {
  color: var(--modal-section-title-color);
  font-size: 13px;
  font-weight: 600;
}

.widget-size-picker__type-grid,
.widget-size-picker__size-grid {
  display: grid;
  gap: 10px;
}

.widget-size-picker__size-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.widget-size-picker__type-card,
.widget-size-picker__size-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: var(--ui-radius-sm);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-overlay);
  color: var(--ui-text-primary);
  text-align: left;
  cursor: pointer;

  span {
    font-size: 12px;
    color: var(--ui-text-secondary);
  }

  &--active {
    border-color: var(--ui-button-primary-border);
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

.widget-size-picker__preview-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.widget-size-picker__preview-box {
  width: 176px;
  height: 176px;
  margin: 0 auto;
  border-radius: var(--ui-radius-sm);
  overflow: hidden;
  box-shadow: var(--ui-shadow-md);

  &--wide {
    width: 320px;
    height: 164px;
  }

  &--large {
    width: 320px;
    height: 248px;
  }
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
