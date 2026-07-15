<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ScreenshotUiBlock, ScreenshotUiBlockKind } from '@/contracts/screenshot';
import IconRenderer from '../ui/IconRenderer.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import { useScreenshotStore } from '../../stores/screenshot_store';

const store = useScreenshotStore();
const previewSize = ref({ width: 0, height: 0 });

const latestResult = computed(() => store.latestResult);
const showPanel = computed(() => store.panelOpen && Boolean(latestResult.value));
const imageSrc = computed(() => (
  latestResult.value ? `data:image/png;base64,${latestResult.value.image.pngBase64}` : ''
));
const previewFrameStyle = computed(() => {
  const { width, height } = previewSize.value;
  return width > 0 && height > 0
    ? { aspectRatio: `${width} / ${height}` }
    : { aspectRatio: '16 / 9' };
});
const topBlocks = computed(() => (
  latestResult.value?.blocks
    .slice()
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 6) ?? []
));
const capturedAtText = computed(() => {
  const capturedAt = latestResult.value?.image.capturedAt;
  if (!capturedAt) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(capturedAt));
});

onMounted(() => {
  store.ensureCaptureSubscription();
});

onBeforeUnmount(() => {
  store.disposeCaptureSubscription();
});

function blockKindLabel(kind: ScreenshotUiBlockKind) {
  const labels: Record<ScreenshotUiBlockKind, string> = {
    button: '按钮',
    input: '输入框',
    card: '卡片',
    list_item: '列表项',
    navigation: '导航',
    image: '图片',
    group: '分组',
    unknown: '未知',
  };
  return labels[kind];
}

function blockIcon(kind: ScreenshotUiBlockKind) {
  const icons: Record<ScreenshotUiBlockKind, string> = {
    button: 'iconify:lucide:mouse-pointer-click',
    input: 'iconify:lucide:text-cursor-input',
    card: 'iconify:lucide:panel-top',
    list_item: 'iconify:lucide:list',
    navigation: 'iconify:lucide:navigation',
    image: 'iconify:lucide:image',
    group: 'iconify:lucide:boxes',
    unknown: 'iconify:lucide:square-dashed',
  };
  return icons[kind];
}

function blockOverlayStyle(block: ScreenshotUiBlock) {
  const width = previewSize.value.width || latestResult.value?.image.region.width || 1;
  const height = previewSize.value.height || latestResult.value?.image.region.height || 1;
  return {
    left: `${(block.rect.x / width) * 100}%`,
    top: `${(block.rect.y / height) * 100}%`,
    width: `${(block.rect.width / width) * 100}%`,
    height: `${(block.rect.height / height) * 100}%`,
  };
}

function handlePreviewLoad(event: Event) {
  const image = event.target as HTMLImageElement;
  previewSize.value = {
    width: image.naturalWidth || 1,
    height: image.naturalHeight || 1,
  };
}

async function startCapture() {
  await store.startRegionCapture();
}

async function saveToKnowledge() {
  await store.saveLatestToKnowledge();
}

async function createAiAttachment() {
  await store.createLatestAiAttachment();
}
</script>

<template>
  <div v-if="store.supported" class="screenshot-capture">
    <UiIconButton
      v-if="!showPanel"
      class="screenshot-capture__launcher"
      variant="secondary"
      size="lg"
      shape="circle"
      title="截图识别"
      :disabled="store.capturing"
      @click="startCapture"
    >
      <IconRenderer icon="iconify:lucide:scan-line" :size="18" />
    </UiIconButton>

    <section v-else class="screenshot-capture__panel" aria-label="截图识别结果">
      <header class="screenshot-capture__header">
        <div class="screenshot-capture__title">
          <IconRenderer icon="iconify:lucide:scan-line" :size="16" />
          <span>截图识别</span>
        </div>
        <div class="screenshot-capture__header-actions">
          <UiIconButton
            variant="ghost"
            size="sm"
            shape="square"
            title="重新截图"
            :disabled="store.capturing"
            @click="startCapture"
          >
            <IconRenderer icon="iconify:lucide:refresh-cw" :size="14" />
          </UiIconButton>
          <UiIconButton variant="ghost" size="sm" shape="square" title="收起" @click="store.closePanel">
            <IconRenderer icon="iconify:lucide:x" :size="15" />
          </UiIconButton>
        </div>
      </header>

      <div class="screenshot-capture__meta">
        <span>{{ latestResult?.blocks.length ?? 0 }} 个 UI 块</span>
        <span>{{ latestResult?.elapsedMs ?? 0 }} ms</span>
        <span>{{ capturedAtText }}</span>
      </div>

      <div class="screenshot-capture__preview">
        <div class="screenshot-capture__preview-frame" :style="previewFrameStyle">
          <img :src="imageSrc" alt="截图识别预览" draggable="false" @load="handlePreviewLoad" />
          <span
            v-for="block in latestResult?.blocks ?? []"
            :key="block.id"
            class="screenshot-capture__overlay"
            :class="`screenshot-capture__overlay--${block.kind}`"
            :style="blockOverlayStyle(block)"
            :title="`${blockKindLabel(block.kind)} ${Math.round(block.confidence * 100)}%`"
          />
        </div>
      </div>

      <div v-if="store.blockCounts.length" class="screenshot-capture__chips">
        <span v-for="item in store.blockCounts" :key="item.kind" class="screenshot-capture__chip">
          <IconRenderer :icon="blockIcon(item.kind)" :size="12" />
          {{ blockKindLabel(item.kind) }} {{ item.count }}
        </span>
      </div>

      <div v-if="topBlocks.length" class="screenshot-capture__blocks">
        <div v-for="block in topBlocks" :key="block.id" class="screenshot-capture__block-row">
          <span class="screenshot-capture__block-kind">
            <IconRenderer :icon="blockIcon(block.kind)" :size="13" />
            {{ blockKindLabel(block.kind) }}
          </span>
          <span>{{ Math.round(block.confidence * 100) }}%</span>
          <span>{{ Math.round(block.rect.width) }} x {{ Math.round(block.rect.height) }}</span>
        </div>
      </div>

      <p v-if="store.error" class="screenshot-capture__error">{{ store.error }}</p>
      <p v-else-if="store.latestAiAttachment" class="screenshot-capture__hint">
        {{ store.latestAiAttachment.name }}
      </p>

      <!-- OCR 识别结果展示 -->
      <div v-if="store.ocrResult" class="screenshot-capture__ocr">
        <p class="screenshot-capture__ocr-text">{{ store.ocrResult.text }}</p>
        <span class="screenshot-capture__ocr-meta">
          {{ store.ocrResult.blocks.length }} 块 · {{ store.ocrResult.elapsedMs }}ms · {{ store.ocrResult.engine }}
        </span>
      </div>

      <footer class="screenshot-capture__footer">
        <UiButton
          size="sm"
          variant="secondary"
          :disabled="store.copyingToClipboard"
          @click="store.copyToClipboard()"
        >
          <template #prefix>
            <IconRenderer icon="iconify:lucide:clipboard-copy" :size="13" />
          </template>
          {{ store.copyingToClipboard ? '复制中' : '复制' }}
        </UiButton>
        <UiButton
          size="sm"
          variant="secondary"
          :disabled="store.savingToFile"
          @click="store.saveToFile()"
        >
          <template #prefix>
            <IconRenderer icon="iconify:lucide:download" :size="13" />
          </template>
          {{ store.savingToFile ? '保存中' : '保存' }}
        </UiButton>
        <UiButton
          size="sm"
          variant="secondary"
          :disabled="store.performingOcr"
          @click="store.performOcr()"
        >
          <template #prefix>
            <IconRenderer icon="iconify:lucide:scan-text" :size="13" />
          </template>
          {{ store.performingOcr ? '识别中' : 'OCR' }}
        </UiButton>
      </footer>
      <footer class="screenshot-capture__footer">
        <UiButton
          size="sm"
          variant="secondary"
          :disabled="store.savingToKnowledge"
          @click="saveToKnowledge"
        >
          <template #prefix>
            <IconRenderer icon="iconify:lucide:database" :size="13" />
          </template>
          {{ store.savingToKnowledge ? '保存中' : '知识库' }}
        </UiButton>
        <UiButton
          size="sm"
          variant="primary"
          :disabled="store.creatingAiAttachment"
          @click="createAiAttachment"
        >
          <template #prefix>
            <IconRenderer icon="iconify:lucide:paperclip" :size="13" />
          </template>
          {{ store.creatingAiAttachment ? '创建中' : 'AI 附件' }}
        </UiButton>
      </footer>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.screenshot-capture {
  position: fixed;
  right: 18px;
  bottom: 58px;
  z-index: calc(var(--ui-z-sticky) + 8);
  pointer-events: none;
}

.screenshot-capture__launcher.ui-icon-button {
  pointer-events: auto;
  box-shadow: var(--ui-shadow-popover, var(--ui-shadow-lg));
}

.screenshot-capture__panel {
  display: grid;
  width: min(360px, calc(100vw - 28px));
  max-height: min(620px, calc(100vh - 90px));
  gap: 10px;
  padding: 12px;
  overflow: auto;
  pointer-events: auto;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 86%, transparent);
  border-radius: var(--ui-radius-lg);
  background: color-mix(in srgb, var(--ui-surface-elevated) 96%, transparent);
  box-shadow: var(--ui-shadow-popover, var(--ui-shadow-lg));
  color: var(--ui-text-primary);
}

.screenshot-capture__header,
.screenshot-capture__title,
.screenshot-capture__header-actions,
.screenshot-capture__meta,
.screenshot-capture__chips,
.screenshot-capture__footer,
.screenshot-capture__block-row,
.screenshot-capture__block-kind {
  display: flex;
  align-items: center;
}

.screenshot-capture__header {
  justify-content: space-between;
  gap: 12px;
}

.screenshot-capture__title {
  min-width: 0;
  gap: 7px;
  font-size: var(--ui-font-size-sm);
  font-weight: 750;
}

.screenshot-capture__header-actions {
  gap: 4px;
}

.screenshot-capture__meta {
  gap: 8px;
  flex-wrap: wrap;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.screenshot-capture__meta span:not(:last-child)::after {
  content: '';
  display: inline-block;
  width: 3px;
  height: 3px;
  margin-left: 8px;
  vertical-align: middle;
  border-radius: var(--ui-radius-full);
  background: currentColor;
  opacity: 0.5;
}

.screenshot-capture__preview {
  max-height: 220px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 78%, transparent);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-panel);
}

.screenshot-capture__preview-frame {
  position: relative;
  width: 100%;
}

.screenshot-capture__preview img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  user-select: none;
}

.screenshot-capture__overlay {
  position: absolute;
  min-width: 4px;
  min-height: 4px;
  border: 1px solid color-mix(in srgb, var(--ui-primary-color) 82%, white 12%);
  background: color-mix(in srgb, var(--ui-primary-color) 16%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, black 18%, transparent);
  pointer-events: none;
}

.screenshot-capture__overlay--button {
  border-color: #4f8cff;
  background: rgba(79, 140, 255, 0.16);
}

.screenshot-capture__overlay--input {
  border-color: #14b8a6;
  background: rgba(20, 184, 166, 0.14);
}

.screenshot-capture__overlay--card {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

.screenshot-capture__overlay--navigation {
  border-color: #a855f7;
  background: rgba(168, 85, 247, 0.13);
}

.screenshot-capture__chips {
  gap: 6px;
  flex-wrap: wrap;
}

.screenshot-capture__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 70%, transparent);
  border-radius: var(--ui-radius-full);
  color: var(--ui-text-secondary);
  background: color-mix(in srgb, var(--ui-surface-panel) 82%, transparent);
  font-size: var(--ui-font-size-xs);
  font-weight: 650;
}

.screenshot-capture__blocks {
  display: grid;
  gap: 5px;
}

.screenshot-capture__block-row {
  justify-content: space-between;
  gap: 8px;
  min-height: 26px;
  padding: 0 8px;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text-secondary);
  background: color-mix(in srgb, var(--ui-surface-panel) 72%, transparent);
  font-size: var(--ui-font-size-xs);
}

.screenshot-capture__block-kind {
  gap: 5px;
  min-width: 88px;
  color: var(--ui-text-primary);
  font-weight: 700;
}

.screenshot-capture__error,
.screenshot-capture__hint {
  margin: 0;
  font-size: var(--ui-font-size-xs);
  line-height: 1.5;
}

.screenshot-capture__error {
  color: var(--ui-danger-color);
}

.screenshot-capture__hint {
  color: var(--ui-text-muted);
  overflow-wrap: anywhere;
}

.screenshot-capture__footer {
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

.screenshot-capture__ocr {
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 70%, transparent);
  border-radius: var(--ui-radius-md);
  background: color-mix(in srgb, var(--ui-surface-panel) 80%, transparent);
}

.screenshot-capture__ocr-text {
  margin: 0 0 4px;
  max-height: 80px;
  overflow: auto;
  font-size: var(--ui-font-size-xs);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ui-text-primary);
}

.screenshot-capture__ocr-meta {
  display: block;
  font-size: 10px;
  color: var(--ui-text-muted);
}

@media (max-width: 720px) {
  .screenshot-capture {
    right: 14px;
    bottom: 54px;
  }
}
</style>
