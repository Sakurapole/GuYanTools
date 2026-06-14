<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { AiCanvasPreviewPayload } from '@/contracts/ai';
import AiCanvasPreview from '@/windows/main/pages/AI/components/AiCanvasPreview.vue';

const payload = ref<AiCanvasPreviewPayload | null>(null);
let unsubscribe: (() => void) | undefined;

onMounted(() => {
  unsubscribe = window.aiCanvasPreviewWindowApi?.onPayload((nextPayload) => {
    payload.value = nextPayload;
    document.title = nextPayload.title || 'Canvas 预览';
  });
});

onBeforeUnmount(() => {
  unsubscribe?.();
});
</script>

<template>
  <main class="ai-canvas-preview-window">
    <header class="ai-canvas-preview-window__header">
      <div>
        <span>Canvas Preview</span>
        <h1>{{ payload?.title || '等待预览内容' }}</h1>
      </div>
      <p v-if="payload">{{ payload.mode }} / {{ payload.files.length }} 文件</p>
    </header>

    <section class="ai-canvas-preview-window__stage">
      <AiCanvasPreview
        v-if="payload"
        :mode="payload.mode"
        :files="payload.files"
        :active-path="payload.activePath"
      />
      <div v-else class="ai-canvas-preview-window__empty">
        正在等待 Canvas 内容...
      </div>
    </section>
  </main>
</template>

<style lang="scss" scoped>
.ai-canvas-preview-window {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100vw;
  height: 100vh;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--ui-text-primary);
  background: var(--ui-surface-bg);
}

.ai-canvas-preview-window__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-base);

  span {
    color: var(--ui-text-muted);
    font-size: 0.68rem;
    font-weight: 750;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1 {
    margin: 3px 0 0;
    overflow: hidden;
    color: var(--ui-text-primary);
    font-size: 1rem;
    font-weight: 760;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
    color: var(--ui-text-muted);
    font-size: 0.78rem;
    white-space: nowrap;
  }
}

.ai-canvas-preview-window__stage {
  min-width: 0;
  min-height: 0;
  background: #fff;
}

.ai-canvas-preview-window__empty {
  display: grid;
  height: 100%;
  place-items: center;
  color: var(--ui-text-muted);
  background: var(--ui-surface-muted);
  font-size: 0.9rem;
}
</style>
