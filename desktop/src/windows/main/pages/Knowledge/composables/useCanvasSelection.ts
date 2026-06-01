import { computed, ref } from 'vue';
import type { KnowledgeCanvasElementV2 } from '@/windows/main/utils/knowledge_canvas_v2';

export interface CanvasMarquee {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useCanvasSelection() {
  const selectedIds = ref<Set<string>>(new Set());
  const marquee = ref<CanvasMarquee | null>(null);
  const selectedIdList = computed(() => Array.from(selectedIds.value));

  function replaceSelection(id: string | null) {
    selectedIds.value = id ? new Set([id]) : new Set();
  }

  function replaceSelectionMany(ids: string[]) {
    selectedIds.value = new Set(ids);
  }

  function toggleSelection(id: string) {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  }

  function clearSelection() {
    selectedIds.value = new Set();
  }

  function isSelected(id: string) {
    return selectedIds.value.has(id);
  }

  function moveSelected(elements: KnowledgeCanvasElementV2[], dx: number, dy: number) {
    return elements.map((element) =>
      selectedIds.value.has(element.id)
        ? { ...element, x: element.x + dx, y: element.y + dy, updatedAt: new Date().toISOString() }
        : element,
    );
  }

  function selectIntersecting(elements: KnowledgeCanvasElementV2[], rect: CanvasMarquee) {
    replaceSelectionMany(elements.filter((element) => intersects(element, rect)).map((element) => element.id));
  }

  return {
    selectedIds,
    selectedIdList,
    marquee,
    replaceSelection,
    replaceSelectionMany,
    toggleSelection,
    clearSelection,
    isSelected,
    moveSelected,
    selectIntersecting,
  };
}

function intersects(element: KnowledgeCanvasElementV2, rect: CanvasMarquee) {
  const left = Math.min(rect.x, rect.x + rect.width);
  const right = Math.max(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  return element.x < right
    && element.x + element.width > left
    && element.y < bottom
    && element.y + element.height > top;
}
