<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import UiDialog from './UiDialog.vue';
import UiIconButton from './UiIconButton.vue';
import IconRenderer from './IconRenderer.vue';

interface ImagePreviewItem {
  src: string;
  title?: string;
  alt?: string;
}

const props = withDefaults(defineProps<{
  modelValue: boolean;
  images: Array<string | ImagePreviewItem>;
  initialIndex?: number;
}>(), {
  initialIndex: 0,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:index': [value: number];
}>();

const currentIndex = ref(0);
const scale = ref(1);
const rotation = ref(0);

const normalizedImages = computed<ImagePreviewItem[]>(() =>
  props.images
    .map((item) => typeof item === 'string' ? { src: item } : item)
    .filter((item) => Boolean(item.src)),
);

const currentImage = computed(() => normalizedImages.value[currentIndex.value] ?? null);
const hasMultiple = computed(() => normalizedImages.value.length > 1);
const imageTitle = computed(() =>
  currentImage.value?.title || `图片 ${currentIndex.value + 1}/${Math.max(normalizedImages.value.length, 1)}`,
);
const imageTransform = computed(() => ({
  transform: `scale(${scale.value}) rotate(${rotation.value}deg)`,
}));

watch(() => props.modelValue, (visible) => {
  if (!visible) return;
  currentIndex.value = clampIndex(props.initialIndex);
  resetView();
});

watch(() => props.initialIndex, (index) => {
  if (!props.modelValue) return;
  currentIndex.value = clampIndex(index);
  resetView();
});

function clampIndex(index: number) {
  const last = normalizedImages.value.length - 1;
  if (last < 0) return 0;
  return Math.min(Math.max(index, 0), last);
}

function close() {
  emit('update:modelValue', false);
}

function setIndex(index: number) {
  if (!normalizedImages.value.length) return;
  currentIndex.value = (index + normalizedImages.value.length) % normalizedImages.value.length;
  resetView();
  emit('update:index', currentIndex.value);
}

function previous() {
  setIndex(currentIndex.value - 1);
}

function next() {
  setIndex(currentIndex.value + 1);
}

function zoomIn() {
  scale.value = Math.min(Number((scale.value + 0.2).toFixed(2)), 4);
}

function zoomOut() {
  scale.value = Math.max(Number((scale.value - 0.2).toFixed(2)), 0.2);
}

function rotateClockwise() {
  rotation.value = (rotation.value + 90) % 360;
}

function resetView() {
  scale.value = 1;
  rotation.value = 0;
}

function openOriginal() {
  const src = currentImage.value?.src;
  if (!src) return;
  window.open(src, '_blank', 'noopener,noreferrer');
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.modelValue) return;
  if (event.key === 'ArrowLeft') {
    previous();
  } else if (event.key === 'ArrowRight') {
    next();
  } else if (event.key === '+' || event.key === '=') {
    zoomIn();
  } else if (event.key === '-') {
    zoomOut();
  } else if (event.key === '0') {
    resetView();
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <UiDialog
    :model-value="modelValue"
    width="min(92vw, 1040px)"
    max-width="1040px"
    aria-label="图片预览"
    class="image-preview-dialog"
    @update:modelValue="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="image-preview__header">
        <div class="image-preview__title-group">
          <h3 class="image-preview__title">{{ imageTitle }}</h3>
          <span v-if="hasMultiple" class="image-preview__counter">
            {{ currentIndex + 1 }} / {{ normalizedImages.length }}
          </span>
        </div>
        <div class="image-preview__actions">
          <UiIconButton size="sm" variant="ghost" title="缩小" @click="zoomOut">
            <IconRenderer icon="iconify:lucide:zoom-out" :size="17" />
          </UiIconButton>
          <UiIconButton size="sm" variant="ghost" title="放大" @click="zoomIn">
            <IconRenderer icon="iconify:lucide:zoom-in" :size="17" />
          </UiIconButton>
          <UiIconButton size="sm" variant="ghost" title="旋转" @click="rotateClockwise">
            <IconRenderer icon="iconify:lucide:rotate-cw" :size="17" />
          </UiIconButton>
          <UiIconButton size="sm" variant="ghost" title="重置视图" @click="resetView">
            <IconRenderer icon="iconify:lucide:scan" :size="17" />
          </UiIconButton>
          <UiIconButton size="sm" variant="ghost" title="打开原图" @click="openOriginal">
            <IconRenderer icon="iconify:lucide:external-link" :size="17" />
          </UiIconButton>
          <UiIconButton size="sm" variant="ghost" title="关闭" @click="close">
            <IconRenderer icon="iconify:lucide:x" :size="18" />
          </UiIconButton>
        </div>
      </div>
    </template>

    <div class="image-preview__body">
      <button
        v-if="hasMultiple"
        class="image-preview__nav image-preview__nav--prev"
        title="上一张"
        @click="previous"
      >
        <IconRenderer icon="iconify:lucide:chevron-left" :size="24" />
      </button>

      <div class="image-preview__stage">
        <img
          v-if="currentImage"
          class="image-preview__image"
          :src="currentImage.src"
          :alt="currentImage.alt || currentImage.title || '图片预览'"
          :style="imageTransform"
          draggable="false"
        />
        <div v-else class="image-preview__empty">暂无图片</div>
      </div>

      <button
        v-if="hasMultiple"
        class="image-preview__nav image-preview__nav--next"
        title="下一张"
        @click="next"
      >
        <IconRenderer icon="iconify:lucide:chevron-right" :size="24" />
      </button>
    </div>
  </UiDialog>
</template>

<style scoped>
.image-preview-dialog :deep(.ui-dialog) {
  background: var(--ui-surface-dialog, var(--ui-surface-panel));
}

.image-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px 12px 18px;
}

.image-preview__title-group {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.image-preview__title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.98rem;
  color: var(--ui-text-primary);
}

.image-preview__counter {
  flex: 0 0 auto;
  font-size: 0.78rem;
  color: var(--ui-text-muted);
}

.image-preview__actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.image-preview__body {
  position: relative;
  height: min(72vh, 720px);
  min-height: 360px;
  background:
    linear-gradient(45deg, rgba(127, 127, 127, 0.09) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(127, 127, 127, 0.09) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(127, 127, 127, 0.09) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(127, 127, 127, 0.09) 75%),
    var(--ui-surface-overlay);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
  overflow: hidden;
}

.image-preview__stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 64px;
  box-sizing: border-box;
  overflow: hidden;
}

.image-preview__image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center center;
  transition: transform 0.16s ease;
  user-select: none;
}

.image-preview__empty {
  color: var(--ui-text-muted);
  font-size: 0.9rem;
}

.image-preview__nav {
  position: absolute;
  top: 50%;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 50%;
  background: var(--ui-surface-glass-strong);
  color: var(--ui-text-primary);
  box-shadow: var(--todo-popup-shadow);
  cursor: pointer;
  transform: translateY(-50%);
}

.image-preview__nav:hover {
  color: var(--ui-input-focus-border);
  border-color: var(--ui-border-accent-soft);
}

.image-preview__nav--prev {
  left: 16px;
}

.image-preview__nav--next {
  right: 16px;
}
</style>
