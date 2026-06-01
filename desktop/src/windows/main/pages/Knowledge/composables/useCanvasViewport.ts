import { computed, ref } from 'vue';
import type { KnowledgeCanvasViewportV2 } from '@/windows/main/utils/knowledge_canvas_v2';

export function useCanvasViewport(initial: KnowledgeCanvasViewportV2 = { x: 0, y: 0, zoom: 0.85 }) {
  const viewport = ref<KnowledgeCanvasViewportV2>({ ...initial });
  const transform = computed(() => `translate(${viewport.value.x} ${viewport.value.y}) scale(${viewport.value.zoom})`);

  function setViewport(next: KnowledgeCanvasViewportV2) {
    viewport.value = {
      x: clamp(next.x, -10000, 10000),
      y: clamp(next.y, -10000, 10000),
      zoom: clamp(next.zoom, 0.1, 4),
    };
  }

  function zoomAt(delta: number, anchor?: { canvasX: number; canvasY: number }) {
    const current = viewport.value;
    const zoom = clamp(current.zoom + delta, 0.1, 4);
    if (!anchor || zoom === current.zoom) {
      setViewport({ ...current, zoom });
      return;
    }

    setViewport({
      x: current.x + anchor.canvasX * (current.zoom - zoom),
      y: current.y + anchor.canvasY * (current.zoom - zoom),
      zoom,
    });
  }

  function panBy(dx: number, dy: number) {
    setViewport({
      ...viewport.value,
      x: viewport.value.x + dx,
      y: viewport.value.y + dy,
    });
  }

  function clientToCanvas(rect: DOMRect, clientX: number, clientY: number) {
    return {
      x: (clientX - rect.left - viewport.value.x) / viewport.value.zoom,
      y: (clientY - rect.top - viewport.value.y) / viewport.value.zoom,
    };
  }

  function viewportCenterToCanvas(rect: DOMRect) {
    return clientToCanvas(rect, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  return { viewport, transform, setViewport, zoomAt, panBy, clientToCanvas, viewportCenterToCanvas };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
