<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMarkdownSegmentedPreview } from '../../composables/useMarkdownSegmentedPreview';

const props = defineProps<{
  markdown: string;
}>();

const emit = defineEmits<{
  (event: 'preview-click', value: MouseEvent): void;
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

watch(
  () => props.markdown,
  () => {
    nextTick(syncViewport);
  },
);

watch(visibleSegments, () => {
  nextTick(syncViewport);
});

onMounted(() => {
  resizeObserver = new ResizeObserver(measureObservedSegments);
  for (const [segmentId, element] of segmentElements) {
    resizeObserver.observe(element);
    measureSegment(segmentId, element.getBoundingClientRect().height);
  }
  syncViewport();
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
    @scroll="syncViewport"
    @click="emit('preview-click', $event)"
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
  height: 100%;
  overflow: auto;
  color: var(--ui-text-primary);
  background: var(--knowledge-editor-preview-bg, transparent);
  line-height: 1.72;
}

.markdown-preview-virtual-list__spacer {
  position: relative;
  max-width: 920px;
  min-height: 100%;
}

.markdown-preview-virtual-list__segment {
  position: absolute;
  top: 0;
  display: flow-root;
  will-change: transform;
}
</style>
