<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMarkdownSegmentedPreview } from '../../composables/useMarkdownSegmentedPreview';
import { renderMarkdownMermaidElements } from '../../utils/markdown_enhanced_render';

const props = defineProps<{
  markdown: string;
  selectionBackgroundColor?: string;
}>();

const emit = defineEmits<{
  (event: 'preview-click', value: MouseEvent): void;
  (event: 'preview-keydown', value: KeyboardEvent): void;
}>();

const scrollHost = ref<HTMLElement | null>(null);
const markdownSource = computed(() => props.markdown);
const { visibleSegments, totalHeight, setViewport, measureSegment, clear } =
  useMarkdownSegmentedPreview(markdownSource);
const previewInsetTop = 22;
const previewInsetX = 28;
const previewInsetBottom = 44;

const spacerStyle = computed(() => ({
  height: `${totalHeight.value + previewInsetTop + previewInsetBottom}px`,
}));

const segmentElements = new Map<string, HTMLElement>();
let resizeObserver: ResizeObserver | null = null;

function syncViewport() {
  const host = scrollHost.value;
  if (!host) return;
  setViewport(host.scrollTop, host.clientHeight);
}

function registerSegmentElement(segmentId: string, element: Element | null) {
  const previousElement = segmentElements.get(segmentId);
  if (previousElement) {
    resizeObserver?.unobserve(previousElement);
    segmentElements.delete(segmentId);
  }

  if (!(element instanceof HTMLElement)) return;

  segmentElements.set(segmentId, element);
  resizeObserver?.observe(element);
  measureSegment(segmentId, element.getBoundingClientRect().height);
  renderVisibleMermaid();
}

function measureObservedSegments(entries: ResizeObserverEntry[]) {
  for (const entry of entries) {
    const element = entry.target as HTMLElement;
    const segmentId = element.dataset.segmentId;
    if (!segmentId) continue;
    measureSegment(segmentId, entry.contentRect.height);
  }
}

function getSegmentStyle(top: number) {
  return {
    left: `${previewInsetX}px`,
    right: `${previewInsetX}px`,
    transform: `translateY(${top + previewInsetTop}px)`,
  };
}

function renderVisibleMermaid() {
  nextTick(() => {
    const host = scrollHost.value;
    if (!host) return;
    renderMarkdownMermaidElements(host);
  });
}

watch(
  () => props.markdown,
  () => {
    nextTick(() => {
      syncViewport();
      renderVisibleMermaid();
    });
  },
);

watch(visibleSegments, () => {
  nextTick(() => {
    syncViewport();
    renderVisibleMermaid();
  });
});

onMounted(() => {
  resizeObserver = new ResizeObserver(measureObservedSegments);
  for (const [segmentId, element] of segmentElements) {
    resizeObserver.observe(element);
    measureSegment(segmentId, element.getBoundingClientRect().height);
  }
  syncViewport();
  renderVisibleMermaid();
});

onBeforeUnmount(() => {
  clear();
  resizeObserver?.disconnect();
  segmentElements.clear();
});
</script>

<template>
  <div
    ref="scrollHost"
    class="markdown-body markdown-preview-virtual-list"
    :style="{ '--knowledge-selection-bg': props.selectionBackgroundColor || 'color-mix(in srgb, var(--ui-primary-color) 30%, transparent)' }"
    tabindex="0"
    @scroll="syncViewport"
    @click="emit('preview-click', $event)"
    @keydown="emit('preview-keydown', $event)"
  >
    <div class="markdown-preview-virtual-list__spacer" :style="spacerStyle">
      <article
        v-for="segment in visibleSegments"
        :key="segment.id"
        :ref="(element) => registerSegmentElement(segment.id, element)"
        class="markdown-preview-virtual-list__segment"
        :data-segment-id="segment.id"
        :style="getSegmentStyle(segment.top)"
        v-html="segment.html"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.markdown-preview-virtual-list {
  --knowledge-md-default-block-bg: color-mix(in srgb, var(--ui-surface-panel-muted) 72%, transparent);
  --knowledge-md-block-border: color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  --knowledge-md-block-strong-border: color-mix(in srgb, var(--ui-text-muted) 30%, transparent);

  height: 100%;
  overflow: auto;
  color: var(--ui-text-primary);
  background: var(--knowledge-editor-preview-bg, transparent);
  line-height: 1.72;
}

.markdown-preview-virtual-list :deep(::selection) {
  background: var(--knowledge-selection-bg, color-mix(in srgb, var(--ui-primary-color) 30%, transparent));
}

.markdown-preview-virtual-list__spacer {
  position: relative;
  width: 100%;
  max-width: 920px;
  min-height: 100%;
}

.markdown-preview-virtual-list__segment {
  position: absolute;
  top: 0;
  display: flow-root;
  min-width: 0;
  will-change: transform;
}

.markdown-preview-virtual-list :deep(h1),
.markdown-preview-virtual-list :deep(h2),
.markdown-preview-virtual-list :deep(h3) {
  margin: 1.15em 0 0.55em;
  line-height: 1.25;
}

.markdown-preview-virtual-list :deep(p),
.markdown-preview-virtual-list :deep(ul),
.markdown-preview-virtual-list :deep(ol),
.markdown-preview-virtual-list :deep(blockquote),
.markdown-preview-virtual-list :deep(pre),
.markdown-preview-virtual-list :deep(table) {
  margin: 0 0 1em;
}

.markdown-preview-virtual-list :deep(a) {
  color: var(--ui-primary-color);
}

.markdown-preview-virtual-list :deep(code) {
  padding: 0.12em 0.32em;
  border-radius: 4px;
  background: var(--knowledge-md-inline-code-bg, var(--knowledge-md-block-bg, var(--knowledge-md-default-block-bg)));
  font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace);
}

.markdown-preview-virtual-list :deep(pre) {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-height: none;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid var(--knowledge-md-block-border);
  border-radius: 7px;
  background: var(--knowledge-md-code-bg, var(--knowledge-md-block-bg, var(--knowledge-md-default-block-bg)));
  line-height: 1.55;
}

.markdown-preview-virtual-list :deep(pre code) {
  display: block;
  padding: 0;
  background: transparent;
  white-space: pre;
}

.markdown-preview-virtual-list :deep(blockquote) {
  padding: 8px 12px;
  border: 1px solid var(--knowledge-md-block-border);
  border-left: 3px solid var(--knowledge-md-block-strong-border);
  border-radius: 7px;
  color: var(--ui-text-muted);
  background: var(--knowledge-md-quote-bg, var(--knowledge-md-block-bg, var(--knowledge-md-default-block-bg)));
}

.markdown-preview-virtual-list :deep(.knowledge-md-callout) {
  margin: 0 0 1em;
  padding: 10px 12px;
  border: 1px solid var(--knowledge-md-block-border);
  border-left: 3px solid var(--knowledge-md-block-strong-border);
  border-radius: 7px;
  color: var(--ui-text-primary);
  background: var(--knowledge-md-callout-bg, var(--knowledge-md-block-bg, var(--knowledge-md-default-block-bg)));
}

.markdown-preview-virtual-list :deep(.knowledge-md-callout__title) {
  margin-bottom: 6px;
  color: var(--ui-text-primary);
  font-size: var(--ui-font-size-xs);
  font-weight: 800;
  letter-spacing: 0;
}

.markdown-preview-virtual-list :deep(.knowledge-md-math) {
  border: 1px solid var(--knowledge-md-block-border);
  border-radius: 7px;
  color: var(--ui-text-primary);
  background: var(--knowledge-md-diagram-bg, var(--knowledge-md-block-bg, var(--knowledge-md-default-block-bg)));
  font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace);
}

.markdown-preview-virtual-list :deep(.knowledge-md-math--inline) {
  display: inline-flex;
  padding: 0.08em 0.38em;
}

.markdown-preview-virtual-list :deep(.knowledge-md-math--block) {
  display: block;
  margin: 0 0 1em;
  padding: 10px 12px;
}

.markdown-preview-virtual-list :deep(.knowledge-md-mermaid) {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  min-height: 0;
  margin: 0 0 1em;
  overflow: auto;
  padding: 6px 8px;
  border: 1px solid var(--knowledge-md-block-border);
  border-radius: 7px;
  background: var(--knowledge-md-diagram-bg, var(--knowledge-md-block-bg, var(--knowledge-md-default-block-bg)));
  text-align: center;
}

.markdown-preview-virtual-list :deep(.knowledge-md-mermaid svg) {
  display: block;
  width: auto !important;
  max-width: min(100%, 680px);
  height: auto !important;
  max-height: min(24vh, 280px);
  margin: auto;
}

.markdown-preview-virtual-list :deep(.knowledge-md-mermaid__title) {
  align-self: stretch;
  margin: -6px -8px 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--knowledge-md-block-border);
  color: var(--ui-text-primary);
  font-size: var(--ui-font-size-xs);
  font-weight: 800;
}

.markdown-preview-virtual-list :deep(.knowledge-md-mermaid pre) {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
}

.markdown-preview-virtual-list :deep(table) {
  display: table;
  box-sizing: border-box;
  width: 100%;
  min-width: 100%;
  height: 100%;
  overflow: hidden;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid var(--knowledge-md-block-border);
  border-radius: 7px;
  background: var(--knowledge-md-table-bg, var(--knowledge-md-block-bg, var(--knowledge-md-default-block-bg)));
}

.markdown-preview-virtual-list :deep(th),
.markdown-preview-virtual-list :deep(td) {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--knowledge-md-block-border);
  overflow-wrap: anywhere;
  vertical-align: top;
}

.markdown-preview-virtual-list :deep(th) {
  color: var(--ui-text-primary);
  background: var(--knowledge-md-table-bg, color-mix(in srgb, var(--ui-surface-panel-muted) 86%, transparent));
  font-weight: 750;
}

.markdown-preview-virtual-list :deep(img) {
  max-width: 100%;
  border-radius: 7px;
}
</style>
