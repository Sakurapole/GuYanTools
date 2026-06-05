import { computed, reactive, ref, watch, type Ref } from 'vue';
import {
  segmentMarkdown,
  type MarkdownSegment,
  type MarkdownSegmentType,
} from '../utils/markdown_segmenter';
import { createMarkdownRenderCache } from '../utils/markdown_render_cache';
import { renderMarkdownPreviewHtml } from '../utils/markdown_enhanced_render';

export interface MarkdownPreviewLayoutSegment extends MarkdownSegment {
  top: number;
  height: number;
  bottom: number;
}

export interface MarkdownPreviewSegment extends MarkdownPreviewLayoutSegment {
  html: string;
}

const overscanPx = 720;
const minSegmentHeight = 24;

const estimatedHeights: Record<MarkdownSegmentType, number> = {
  heading: 48,
  paragraph: 72,
  list: 96,
  blockquote: 92,
  code_fence: 132,
  table: 150,
  html: 96,
  blank: 24,
};

export function useMarkdownSegmentedPreview(source: Ref<string>) {
  const scrollTop = ref(0);
  const viewportHeight = ref(0);
  const measuredHeights = reactive(new Map<string, number>());
  const renderCache = createMarkdownRenderCache({
    rendererVersion: 'knowledge-segmented-preview-v2-enhanced-render',
    renderMarkdown(markdownSource) {
      return renderMarkdownPreviewHtml(markdownSource);
    },
    sanitizeHtml: (html) => html,
  });

  const segments = computed<MarkdownPreviewLayoutSegment[]>(() => {
    let top = 0;

    return segmentMarkdown(source.value || '').map((segment) => {
      const height = measuredHeights.get(segment.id) ?? estimateSegmentHeight(segment);
      const previewSegment = {
        ...segment,
        top,
        height,
        bottom: top + height,
      };
      top += height;
      return previewSegment;
    });
  });

  const totalHeight = computed(() => {
    const lastSegment = segments.value[segments.value.length - 1];
    if (!lastSegment) return 0;
    return lastSegment.top + lastSegment.height;
  });

  const visibleSegments = computed(() => {
    const start = Math.max(0, scrollTop.value - overscanPx);
    const end = scrollTop.value + viewportHeight.value + overscanPx;
    const layoutSegments = segments.value;
    const firstIndex = findFirstSegmentIndexAtOrAfterBottom(layoutSegments, start);
    const lastIndex = findLastSegmentIndexAtOrBeforeTop(layoutSegments, end);

    if (firstIndex > lastIndex) return [];

    return layoutSegments.slice(firstIndex, lastIndex + 1).map((segment) => {
      const rendered = renderCache.render(segment);
      return {
        ...segment,
        html: rendered.html,
      };
    });
  });

  function setViewport(nextScrollTop: number, nextViewportHeight: number) {
    scrollTop.value = Math.max(0, nextScrollTop);
    viewportHeight.value = Math.max(0, nextViewportHeight);
  }

  function measureSegment(segmentId: string, height: number) {
    if (!Number.isFinite(height) || height <= 0) return;
    const normalizedHeight = Math.max(minSegmentHeight, Math.ceil(height));
    if (measuredHeights.get(segmentId) === normalizedHeight) return;
    measuredHeights.set(segmentId, normalizedHeight);
  }

  function clear() {
    renderCache.clear();
    measuredHeights.clear();
  }

  watch(source, () => {
    clear();
  });

  return {
    segments,
    visibleSegments,
    totalHeight,
    setViewport,
    measureSegment,
    clear,
  };
}

function findFirstSegmentIndexAtOrAfterBottom(
  segments: MarkdownPreviewLayoutSegment[],
  viewportStart: number,
): number {
  let low = 0;
  let high = segments.length - 1;
  let result = segments.length;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);

    if (segments[middle].bottom >= viewportStart) {
      result = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return result;
}

function findLastSegmentIndexAtOrBeforeTop(
  segments: MarkdownPreviewLayoutSegment[],
  viewportEnd: number,
): number {
  let low = 0;
  let high = segments.length - 1;
  let result = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);

    if (segments[middle].top <= viewportEnd) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}

function estimateSegmentHeight(segment: MarkdownSegment): number {
  const lineCount = Math.max(1, segment.endLine - segment.startLine + 1);
  const baseHeight = estimatedHeights[segment.type] ?? estimatedHeights.paragraph;

  if (segment.type === 'heading') return baseHeight;
  if (segment.type === 'code_fence') return Math.max(baseHeight, lineCount * 22 + 36);
  if (segment.type === 'table') return Math.max(baseHeight, lineCount * 38 + 36);
  if (segment.type === 'list') return Math.max(baseHeight, lineCount * 30 + 24);

  const characterRows = Math.ceil(segment.source.length / 86);
  return Math.max(baseHeight, Math.max(lineCount, characterRows) * 26 + 24);
}
