<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiColorPicker from '@/windows/main/components/ui/UiColorPicker.vue';
import UiFileInput from '@/windows/main/components/ui/UiFileInput.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import { useCanvasSelection } from '../composables/useCanvasSelection';
import { useCanvasViewport } from '../composables/useCanvasViewport';
import KnowledgeCanvasElementRenderer from './canvas/KnowledgeCanvasElementRenderer.vue';
import KnowledgeCanvasToolbar, { type CanvasTool } from './canvas/KnowledgeCanvasToolbar.vue';
import {
  createCanvasElementV2,
  duplicateCanvasElementsV2,
  findCanvasElementV2,
  normalizeCanvasDocumentV2,
  updateCanvasElementV2,
  type KnowledgeCanvasDocumentV2,
  type KnowledgeCanvasElementV2,
  type KnowledgeCanvasElementV2Type,
} from '@/windows/main/utils/knowledge_canvas_v2';

type CanvasAlignCommand = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
type CanvasDistributeCommand = 'horizontal' | 'vertical';
type CanvasSnapAxis = 'x' | 'y';
type CanvasRect = { id: string; x: number; y: number; width: number; height: number };
type CanvasSnapGuide = { axis: CanvasSnapAxis; position: number; from: number; to: number };

const props = defineProps<{
  modelValue: KnowledgeCanvasDocumentV2;
  dirty?: boolean;
  saving?: boolean;
  pageSuggestions?: string[];
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: KnowledgeCanvasDocumentV2): void;
  (event: 'save'): void;
  (event: 'asset-file', payload: { elementId?: string; file: File; kind: 'image' | 'file'; position?: { x: number; y: number } }): void;
  (event: 'open-asset', assetId: string): void;
  (event: 'select-asset', assetId: string): void;
  (event: 'open-page-link', pageRef: string): void;
  (event: 'open-todo-link', todoId: string): void;
}>();

const SNAP_THRESHOLD = 8;
const SNAP_GUIDE_PADDING = 24;
const documentDraft = ref<KnowledgeCanvasDocumentV2>(normalizeCanvasDocumentV2(props.modelValue));
const activeTool = ref<CanvasTool>('select');
const canvasStrokeColorOptions = ['#4A90D9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#64748b'];
const fileInputRef = ref<InstanceType<typeof UiFileInput> | null>(null);
const assetInputKind = ref<'image' | 'file'>('image');
const svgRef = ref<SVGSVGElement | null>(null);
const exportMessage = ref('');
const drawingPathId = ref<string | null>(null);
const dragState = ref<{
  startX: number;
  startY: number;
  origins: Array<{ id: string; x: number; y: number }>;
  mergeOnDrop: boolean;
} | null>(null);
const resizeState = ref<{
  elementId: string;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
} | null>(null);
const marqueeState = ref<{ startX: number; startY: number } | null>(null);
const panState = ref<{ clientX: number; clientY: number } | null>(null);
const isSpacePressed = ref(false);
const editingElementId = ref<string | null>(null);
const lastPointerCanvasPoint = ref<{ x: number; y: number } | null>(null);
const snapGuides = ref<CanvasSnapGuide[]>([]);
const viewportApi = useCanvasViewport(documentDraft.value.viewport);
const selection = useCanvasSelection();

const selectedElement = computed(() => {
  const [id] = selection.selectedIdList.value;
  return id ? findCanvasElementV2(documentDraft.value.elements, id) : null;
});
const pageSuggestionOptions = computed(() => [...new Set(props.pageSuggestions ?? [])].slice(0, 30));
const selectedAssetId = computed(() => selectedElement.value?.refs?.assetId ?? '');
const selectedPageId = computed(() => selectedElement.value?.refs?.pageId ?? '');
const selectedTodoId = computed(() => selectedElement.value?.refs?.todoId ?? '');
const fileInputAccept = computed(() => (assetInputKind.value === 'image' ? 'image/*' : undefined));
const selectedEditableIds = computed(() =>
  selection.selectedIdList.value.filter((id) => {
    const element = findCanvasElementV2(documentDraft.value.elements, id);
    return Boolean(element && !element.locked);
  }),
);
const inlineTextEditableElementTypes: KnowledgeCanvasElementV2Type[] = ['rich_text', 'rect', 'file', 'page_card', 'todo_card', 'group'];

watch(
  () => props.modelValue,
  (value) => {
    documentDraft.value = normalizeCanvasDocumentV2(value);
    viewportApi.setViewport(documentDraft.value.viewport);
    const validIds = selection.selectedIdList.value.filter((id) => documentDraft.value.elements.some((element) => element.id === id));
    selection.replaceSelectionMany(validIds);
  },
  { deep: true },
);

function emitDraft(document: KnowledgeCanvasDocumentV2) {
  documentDraft.value = normalizeCanvasDocumentV2(document);
  viewportApi.setViewport(documentDraft.value.viewport);
  emit('update:modelValue', documentDraft.value);
}

function updateDocument(patch: Partial<KnowledgeCanvasDocumentV2>) {
  emitDraft({
    ...documentDraft.value,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function updateElement(elementId: string, patch: Partial<KnowledgeCanvasElementV2>) {
  emitDraft(updateCanvasElementV2(documentDraft.value, elementId, patch));
}

function addElement(type: Exclude<CanvasTool, 'select'>, input: Partial<KnowledgeCanvasElementV2> = {}) {
  const elementType: KnowledgeCanvasElementV2Type = type === 'text' ? 'rich_text' : type;
  const element = createCanvasElementV2(elementType, {
    ...defaultCanvasElementInput(elementType),
    ...input,
    zIndex: nextZIndex(),
  });
  updateDocument({ elements: [...documentDraft.value.elements, element] });
  selection.replaceSelection(element.id);
  return element;
}

function defaultCanvasElementInput(type: KnowledgeCanvasElementV2Type): Partial<KnowledgeCanvasElementV2> {
  if (type === 'page_card') {
    return {
      title: '页面卡片',
      text: '输入页面标题或选择已有页面',
      width: 260,
      height: 130,
      style: { stroke: '#4A90D9' },
    };
  }
  if (type === 'todo_card') {
    return {
      title: 'Todo 卡片',
      text: '记录待办或关联 Todo ID',
      width: 260,
      height: 130,
      style: { stroke: '#22c55e' },
    };
  }
  if (type === 'file') {
    return {
      title: '文件卡片',
      text: '关联附件后显示文件信息',
      width: 260,
      height: 126,
      style: { stroke: '#64748b' },
    };
  }
  if (type === 'group') {
    return {
      title: '分组',
      text: '用于框住一组画布元素',
      width: 360,
      height: 220,
      style: { stroke: '#4A90D9', strokeWidth: 1 },
    };
  }
  return {};
}

function removeSelectedElements() {
  if (!selectedEditableIds.value.length) return;
  const removableIds = new Set(selectedEditableIds.value);
  const nextElements = documentDraft.value.elements.filter((element) => !removableIds.has(element.id));
  updateDocument({
    elements: nextElements.length ? nextElements : [createCanvasElementV2('rich_text', { text: '画布页面' })],
  });
  selection.replaceSelectionMany(selection.selectedIdList.value.filter((id) => !removableIds.has(id)));
}

function duplicateSelectedElements() {
  if (!selectedEditableIds.value.length) return;
  const next = duplicateCanvasElementsV2(documentDraft.value.elements, new Set(selectedEditableIds.value));
  updateDocument({ elements: next });
  selection.replaceSelectionMany(next.slice(documentDraft.value.elements.length).map((element) => element.id));
}

function bringSelectedToFront() {
  if (!selectedEditableIds.value.length) return;
  const selectedIds = new Set(selectedEditableIds.value);
  const base = documentDraft.value.elements.filter((element) => !selectedIds.has(element.id));
  const selected = documentDraft.value.elements.filter((element) => selectedIds.has(element.id));
  updateDocument({ elements: [...base, ...selected].map((element, index) => ({ ...element, zIndex: index })) });
}

function sendSelectedToBack() {
  if (!selectedEditableIds.value.length) return;
  const selectedIds = new Set(selectedEditableIds.value);
  const base = documentDraft.value.elements.filter((element) => !selectedIds.has(element.id));
  const selected = documentDraft.value.elements.filter((element) => selectedIds.has(element.id));
  updateDocument({ elements: [...selected, ...base].map((element, index) => ({ ...element, zIndex: index })) });
}

function elementRect(element: KnowledgeCanvasElementV2): CanvasRect {
  return {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
}

function rectRight(rect: CanvasRect) {
  return rect.x + rect.width;
}

function rectBottom(rect: CanvasRect) {
  return rect.y + rect.height;
}

function rectCenterX(rect: CanvasRect) {
  return rect.x + rect.width / 2;
}

function rectCenterY(rect: CanvasRect) {
  return rect.y + rect.height / 2;
}

function boundsForRects(rects: CanvasRect[]): CanvasRect | null {
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map(rectRight));
  const bottom = Math.max(...rects.map(rectBottom));
  return {
    id: 'selection',
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function rectsFromDragOrigins(dx: number, dy: number): CanvasRect[] {
  if (!dragState.value) return [];
  return dragState.value.origins.flatMap((origin) => {
    const element = findCanvasElementV2(documentDraft.value.elements, origin.id);
    if (!element) return [];
    return [{
      id: element.id,
      x: origin.x + dx,
      y: origin.y + dy,
      width: element.width,
      height: element.height,
    }];
  });
}

function selectedEditableElements() {
  const selectedIds = new Set(selectedEditableIds.value);
  return documentDraft.value.elements.filter((element) => selectedIds.has(element.id));
}

function moveSelectedElements(offsets: Map<string, { x: number; y: number }>) {
  if (!offsets.size) return;
  updateDocument({
    elements: documentDraft.value.elements.map((element) => {
      const offset = offsets.get(element.id);
      return offset
        ? { ...element, x: offset.x, y: offset.y, updatedAt: new Date().toISOString() }
        : element;
    }),
  });
}

function alignSelectedElements(command: CanvasAlignCommand) {
  const elements = selectedEditableElements();
  if (elements.length < 2) return;
  const bounds = boundsForRects(elements.map(elementRect));
  if (!bounds) return;
  const offsets = new Map<string, { x: number; y: number }>();

  for (const element of elements) {
    let x = element.x;
    let y = element.y;
    if (command === 'left') x = bounds.x;
    if (command === 'center') x = rectCenterX(bounds) - element.width / 2;
    if (command === 'right') x = rectRight(bounds) - element.width;
    if (command === 'top') y = bounds.y;
    if (command === 'middle') y = rectCenterY(bounds) - element.height / 2;
    if (command === 'bottom') y = rectBottom(bounds) - element.height;
    offsets.set(element.id, { x, y });
  }

  moveSelectedElements(offsets);
}

function distributeSelectedElements(command: CanvasDistributeCommand) {
  const elements = selectedEditableElements();
  if (elements.length < 3) return;
  const sorted = [...elements].sort((a, b) => command === 'horizontal' ? a.x - b.x : a.y - b.y);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const offsets = new Map<string, { x: number; y: number }>();

  if (command === 'horizontal') {
    const totalWidth = sorted.reduce((sum, element) => sum + element.width, 0);
    const availableGap = rectRight(elementRect(last)) - first.x - totalWidth;
    const gap = availableGap / (sorted.length - 1);
    let cursor = first.x;
    for (const element of sorted) {
      offsets.set(element.id, { x: cursor, y: element.y });
      cursor += element.width + gap;
    }
  } else {
    const totalHeight = sorted.reduce((sum, element) => sum + element.height, 0);
    const availableGap = rectBottom(elementRect(last)) - first.y - totalHeight;
    const gap = availableGap / (sorted.length - 1);
    let cursor = first.y;
    for (const element of sorted) {
      offsets.set(element.id, { x: element.x, y: cursor });
      cursor += element.height + gap;
    }
  }

  moveSelectedElements(offsets);
}

function canvasElementMergeText(element: KnowledgeCanvasElementV2) {
  return [element.title, element.text].filter((value) => typeof value === 'string' && value.trim()).join('\n');
}

function mergeSelectedContainers() {
  const selectedIds = new Set(selectedEditableIds.value);
  const containers = documentDraft.value.elements.filter((element) =>
    selectedIds.has(element.id) && inlineTextEditableElementTypes.includes(element.type),
  );
  if (containers.length < 2) return;
  const bounds = boundsForRects(containers.map(elementRect));
  if (!bounds) return;
  const ordered = [...containers].sort((a, b) => a.y - b.y || a.x - b.x);
  const mergedText = ordered
    .map(canvasElementMergeText)
    .filter(Boolean)
    .join('\n\n');
  const merged = createCanvasElementV2('rich_text', {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(240, bounds.width),
    height: Math.max(90, bounds.height),
    zIndex: nextZIndex(),
    title: '合并容器',
    text: mergedText || '合并容器',
    style: ordered[0]?.style,
  });
  updateDocument({
    elements: [
      ...documentDraft.value.elements.filter((element) => !selectedIds.has(element.id)),
      merged,
    ],
  });
  selection.replaceSelection(merged.id);
  editingElementId.value = merged.id;
}

function mergeDraggedContainerIfOverlapping() {
  if (!dragState.value?.mergeOnDrop) return;
  const movingIds = new Set(dragState.value.origins.map((origin) => origin.id));
  const movingContainers = documentDraft.value.elements.filter((element) =>
    movingIds.has(element.id) && inlineTextEditableElementTypes.includes(element.type),
  );
  if (movingContainers.length !== 1) return;
  const moving = movingContainers[0];
  const movingRect = elementRect(moving);
  const target = documentDraft.value.elements
    .filter((element) => !movingIds.has(element.id) && inlineTextEditableElementTypes.includes(element.type) && !element.locked)
    .find((element) => rectsOverlap(movingRect, elementRect(element)));
  if (!target) return;
  selection.replaceSelectionMany([moving.id, target.id]);
  mergeSelectedContainers();
}

function rectsOverlap(a: CanvasRect, b: CanvasRect) {
  return a.x < rectRight(b) && rectRight(a) > b.x && a.y < rectBottom(b) && rectBottom(a) > b.y;
}

function nudgeSelectedElements(event: KeyboardEvent) {
  if (!event.key.startsWith('Arrow') || !selectedEditableIds.value.length || editingElementId.value) return false;
  const step = event.shiftKey ? 10 : 1;
  const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
  const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
  if (!dx && !dy) return false;
  const offsets = new Map<string, { x: number; y: number }>();
  for (const element of selectedEditableElements()) {
    offsets.set(element.id, { x: element.x + dx, y: element.y + dy });
  }
  moveSelectedElements(offsets);
  return true;
}

function axisSnapPoints(rect: CanvasRect, axis: CanvasSnapAxis) {
  if (axis === 'x') {
    return [
      { kind: 'start', value: rect.x, from: rect.y, to: rectBottom(rect) },
      { kind: 'center', value: rectCenterX(rect), from: rect.y, to: rectBottom(rect) },
      { kind: 'end', value: rectRight(rect), from: rect.y, to: rectBottom(rect) },
    ];
  }
  return [
    { kind: 'start', value: rect.y, from: rect.x, to: rectRight(rect) },
    { kind: 'center', value: rectCenterY(rect), from: rect.x, to: rectRight(rect) },
    { kind: 'end', value: rectBottom(rect), from: rect.x, to: rectRight(rect) },
  ];
}

function guideForSnap(axis: CanvasSnapAxis, position: number, moving: CanvasRect, target: CanvasRect): CanvasSnapGuide {
  if (axis === 'x') {
    return {
      axis,
      position,
      from: Math.min(moving.y, target.y) - SNAP_GUIDE_PADDING,
      to: Math.max(rectBottom(moving), rectBottom(target)) + SNAP_GUIDE_PADDING,
    };
  }
  return {
    axis,
    position,
    from: Math.min(moving.x, target.x) - SNAP_GUIDE_PADDING,
    to: Math.max(rectRight(moving), rectRight(target)) + SNAP_GUIDE_PADDING,
  };
}

function resolveAxisSnap(movingRects: CanvasRect[], staticRects: CanvasRect[], axis: CanvasSnapAxis) {
  let best: { offset: number; distance: number; guide: CanvasSnapGuide } | null = null;
  const movingBounds = boundsForRects(movingRects);
  const movingCandidates = movingBounds ? [movingBounds, ...movingRects] : movingRects;

  for (const moving of movingCandidates) {
    for (const target of staticRects) {
      for (const movingPoint of axisSnapPoints(moving, axis)) {
        for (const targetPoint of axisSnapPoints(target, axis)) {
          const offset = targetPoint.value - movingPoint.value;
          const distance = Math.abs(offset);
          if (distance > SNAP_THRESHOLD) continue;
          if (!best || distance < best.distance) {
            best = {
              offset,
              distance,
              guide: guideForSnap(axis, targetPoint.value, moving, target),
            };
          }
        }
      }
    }
  }

  return best;
}

function resolveCanvasSnap(movingRects: CanvasRect[], staticRects: CanvasRect[]) {
  const xSnap = resolveAxisSnap(movingRects, staticRects, 'x');
  const ySnap = resolveAxisSnap(movingRects, staticRects, 'y');
  return {
    dx: xSnap?.offset ?? 0,
    dy: ySnap?.offset ?? 0,
    guides: [xSnap?.guide, ySnap?.guide].filter((guide): guide is CanvasSnapGuide => Boolean(guide)),
  };
}

function applyCanvasSnap(dx: number, dy: number, event: PointerEvent) {
  if (!dragState.value || event.altKey) {
    snapGuides.value = [];
    return { dx, dy };
  }
  const movingRects = rectsFromDragOrigins(dx, dy);
  const movingIds = new Set(movingRects.map((rect) => rect.id));
  const staticRects = documentDraft.value.elements
    .filter((element) => !movingIds.has(element.id))
    .map(elementRect);
  const snap = resolveCanvasSnap(movingRects, staticRects);
  snapGuides.value = snap.guides;
  return {
    dx: dx + snap.dx,
    dy: dy + snap.dy,
  };
}

function canvasPoint(event: PointerEvent | MouseEvent) {
  const svg = svgRef.value;
  if (!svg) return { x: 0, y: 0 };
  const point = viewportApi.clientToCanvas(svg.getBoundingClientRect(), event.clientX, event.clientY);
  lastPointerCanvasPoint.value = point;
  return point;
}

function handleCanvasPointerDown(event: PointerEvent) {
  if ((event.target as Element).closest('[data-canvas-element]')) return;
  const point = canvasPoint(event);
  if (event.button === 1 || isSpacePressed.value) {
    panState.value = { clientX: event.clientX, clientY: event.clientY };
    return;
  }
  if (activeTool.value === 'select') {
    selection.clearSelection();
    marqueeState.value = { startX: point.x, startY: point.y };
    selection.marquee.value = { x: point.x, y: point.y, width: 0, height: 0 };
    return;
  }
  if (activeTool.value === 'image') {
    assetInputKind.value = 'image';
    fileInputRef.value?.click();
    return;
  }
  if (activeTool.value === 'path') {
    const element = addElement('path', {
      x: point.x,
      y: point.y,
      width: 1,
      height: 1,
      points: [{ x: 0, y: 0 }],
    });
    drawingPathId.value = element.id;
    return;
  }
  addElement(activeTool.value as Exclude<CanvasTool, 'select'>, { x: point.x, y: point.y });
  activeTool.value = 'select';
}

function startElementDrag(event: PointerEvent, element: KnowledgeCanvasElementV2) {
  if (activeTool.value !== 'select') return;
  event.stopPropagation();
  const point = canvasPoint(event);
  if (event.shiftKey) selection.toggleSelection(element.id);
  else if (!selection.isSelected(element.id)) selection.replaceSelection(element.id);
  if (element.locked) return;

  dragState.value = {
    startX: point.x,
    startY: point.y,
    mergeOnDrop: event.shiftKey,
    origins: documentDraft.value.elements
      .filter((item) => !item.locked && (selection.selectedIds.value.has(item.id) || item.id === element.id))
      .map((item) => ({ id: item.id, x: item.x, y: item.y })),
  };
}

function startElementResize(event: PointerEvent, element: KnowledgeCanvasElementV2) {
  if (element.locked) return;
  event.stopPropagation();
  const point = canvasPoint(event);
  if (!selection.isSelected(element.id)) selection.replaceSelection(element.id);
  resizeState.value = {
    elementId: element.id,
    startX: point.x,
    startY: point.y,
    startWidth: element.width,
    startHeight: element.height,
  };
}

function handlePointerMove(event: PointerEvent) {
  if (panState.value) {
    viewportApi.panBy(event.clientX - panState.value.clientX, event.clientY - panState.value.clientY);
    panState.value = { clientX: event.clientX, clientY: event.clientY };
    persistViewport();
    return;
  }

  const point = canvasPoint(event);
  if (marqueeState.value) {
    selection.marquee.value = {
      x: marqueeState.value.startX,
      y: marqueeState.value.startY,
      width: point.x - marqueeState.value.startX,
      height: point.y - marqueeState.value.startY,
    };
    return;
  }

  if (drawingPathId.value) {
    const element = findCanvasElementV2(documentDraft.value.elements, drawingPathId.value);
    if (!element) return;
    const nextPoint = { x: point.x - element.x, y: point.y - element.y };
    updateElement(element.id, {
      points: [...(element.points ?? []), nextPoint],
      width: Math.max(1, point.x - element.x),
      height: Math.max(1, point.y - element.y),
    });
    return;
  }

  if (resizeState.value) {
    const element = findCanvasElementV2(documentDraft.value.elements, resizeState.value.elementId);
    if (!element || element.locked) return;
    updateElement(element.id, {
      width: Math.max(48, resizeState.value.startWidth + point.x - resizeState.value.startX),
      height: Math.max(32, resizeState.value.startHeight + point.y - resizeState.value.startY),
    });
    return;
  }

  if (!dragState.value) return;
  const rawDx = point.x - dragState.value.startX;
  const rawDy = point.y - dragState.value.startY;
  const { dx, dy } = applyCanvasSnap(rawDx, rawDy, event);
  updateDocument({
    elements: documentDraft.value.elements.map((element) => {
      const origin = dragState.value?.origins.find((item) => item.id === element.id);
      return origin ? { ...element, x: origin.x + dx, y: origin.y + dy, updatedAt: new Date().toISOString() } : element;
    }),
  });
}

function stopPointerAction() {
  if (selection.marquee.value) {
    selection.selectIntersecting(documentDraft.value.elements, selection.marquee.value);
  }
  mergeDraggedContainerIfOverlapping();
  dragState.value = null;
  resizeState.value = null;
  drawingPathId.value = null;
  marqueeState.value = null;
  panState.value = null;
  snapGuides.value = [];
  selection.marquee.value = null;
}

function handleWheel(event: WheelEvent) {
  event.preventDefault();
  const point = canvasPoint(event);
  viewportApi.zoomAt(event.deltaY > 0 ? -0.08 : 0.08, { canvasX: point.x, canvasY: point.y });
  persistViewport();
}

function setZoom(zoom: number) {
  viewportApi.setViewport({ ...viewportApi.viewport.value, zoom });
  persistViewport();
}

function persistViewport() {
  updateDocument({ viewport: viewportApi.viewport.value });
}

function chooseImage() {
  assetInputKind.value = 'image';
  activeTool.value = 'image';
  fileInputRef.value?.click();
}

function chooseFileAsset() {
  if (selectedElement.value?.locked) return;
  assetInputKind.value = 'file';
  fileInputRef.value?.click();
}

function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  emit('asset-file', {
    elementId: selectedElement.value?.type === assetInputKind.value ? selectedElement.value.id : undefined,
    file,
    kind: assetInputKind.value,
    position: lastPointerCanvasPoint.value ?? centerPoint(),
  });
  activeTool.value = 'select';
  assetInputKind.value = 'image';
}

function handlePaste(event: ClipboardEvent) {
  const image = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith('image/'));
  if (!image) return;
  event.preventDefault();
  emit('asset-file', {
    elementId: selectedElement.value?.type === 'image' ? selectedElement.value.id : undefined,
    file: image,
    kind: 'image',
    position: lastPointerCanvasPoint.value ?? centerPoint(),
  });
}

function centerPoint() {
  const svg = svgRef.value;
  if (!svg) return { x: 160, y: 160 };
  return viewportApi.viewportCenterToCanvas(svg.getBoundingClientRect());
}

function updateSelectedText(value: string) {
  if (!selectedElement.value || selectedElement.value.locked) return;
  updateElement(selectedElement.value.id, { text: value });
}

function isInlineTextEditableElement(element: KnowledgeCanvasElementV2 | null) {
  return Boolean(element && inlineTextEditableElementTypes.includes(element.type));
}

function updateSelectedNumber(key: 'x' | 'y' | 'width' | 'height', value: string) {
  if (!selectedElement.value || selectedElement.value.locked) return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  updateElement(selectedElement.value.id, { [key]: numeric });
}

function updateSelectedStyle(key: 'stroke' | 'fill' | 'strokeWidth', value: string) {
  if (!selectedElement.value || selectedElement.value.locked) return;
  const nextValue = key === 'strokeWidth' ? Number(value) : value.trim();
  updateElement(selectedElement.value.id, {
    style: {
      ...(selectedElement.value.style ?? {}),
      [key]: nextValue || undefined,
    },
  });
}

function updateSelectedString(key: 'title' | 'pageId' | 'todoId', value: string) {
  if (!selectedElement.value || selectedElement.value.locked) return;
  if (key === 'title') {
    updateElement(selectedElement.value.id, { title: value.trim() || undefined });
    return;
  }
  updateElement(selectedElement.value.id, {
    refs: {
      ...(selectedElement.value.refs ?? {}),
      [key]: value.trim() || undefined,
    },
  });
}

function updateSelectedBoolean(key: 'locked', value: boolean) {
  if (!selectedElement.value) return;
  updateElement(selectedElement.value.id, { [key]: value });
}

function exportSvg() {
  const svg = svgRef.value;
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(documentDraft.value.width));
  clone.setAttribute('height', String(documentDraft.value.height));
  clone.setAttribute('viewBox', `0 0 ${documentDraft.value.width} ${documentDraft.value.height}`);
  clone.querySelectorAll('.knowledge-canvas-editor__selection,.knowledge-canvas-editor__marquee,.knowledge-canvas-editor__snap-guide').forEach((node) => node.remove());
  downloadText('knowledge-canvas.svg', 'image/svg+xml;charset=utf-8', new XMLSerializer().serializeToString(clone));
  exportMessage.value = '已导出 SVG';
}

function exportPng() {
  const svg = svgRef.value;
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(documentDraft.value.width));
  clone.setAttribute('height', String(documentDraft.value.height));
  clone.setAttribute('viewBox', `0 0 ${documentDraft.value.width} ${documentDraft.value.height}`);
  clone.querySelectorAll('.knowledge-canvas-editor__selection,.knowledge-canvas-editor__marquee,.knowledge-canvas-editor__snap-guide').forEach((node) => node.remove());
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = documentDraft.value.width;
    canvas.height = documentDraft.value.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ui-surface-base') || '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) return;
      downloadBlob('knowledge-canvas.png', pngBlob);
      exportMessage.value = '已导出 PNG';
    }, 'image/png');
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    exportMessage.value = 'PNG 导出失败，可先导出 SVG';
  };
  image.src = url;
}

function downloadText(filename: string, mimeType: string, content: string) {
  downloadBlob(filename, new Blob([content], { type: mimeType }));
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.code === 'Space') {
    isSpacePressed.value = true;
    return;
  }
  if (nudgeSelectedElements(event)) {
    event.preventDefault();
    return;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEditableIds.value.length && !editingElementId.value) {
    event.preventDefault();
    removeSelectedElements();
  }
  if (event.key === 'Escape') {
    editingElementId.value = null;
    selection.clearSelection();
  }
}

function handleKeyup(event: KeyboardEvent) {
  if (event.code === 'Space') {
    isSpacePressed.value = false;
  }
}

function nextZIndex() {
  return documentDraft.value.elements.reduce((max, element) => Math.max(max, element.zIndex), 0) + 1;
}
</script>

<template>
  <section
    class="knowledge-canvas-editor"
    aria-label="画布页面编辑器"
    tabindex="0"
    @keydown="handleKeydown"
    @keyup="handleKeyup"
    @paste="handlePaste"
  >
    <KnowledgeCanvasToolbar
      :active-tool="activeTool"
      :zoom="viewportApi.viewport.value.zoom"
      :dirty="dirty"
      :saving="saving"
      :has-selection="selectedEditableIds.length > 0"
      @tool="value => activeTool = value"
      @zoom="setZoom"
      @delete="removeSelectedElements"
      @duplicate="duplicateSelectedElements"
      @front="bringSelectedToFront"
      @back="sendSelectedToBack"
      @align="alignSelectedElements"
      @distribute="distributeSelectedElements"
      @merge="mergeSelectedContainers"
      @image="chooseImage"
      @export-svg="exportSvg"
      @export-png="exportPng"
      @save="emit('save')"
    />

    <div class="knowledge-canvas-editor__body">
      <div class="knowledge-canvas-editor__stage-wrap">
        <svg
          ref="svgRef"
          class="knowledge-canvas-editor__stage"
          :viewBox="`0 0 ${documentDraft.width} ${documentDraft.height}`"
          :width="documentDraft.width"
          :height="documentDraft.height"
          @wheel="handleWheel"
          @pointerdown="handleCanvasPointerDown"
          @pointermove="handlePointerMove"
          @pointerup="stopPointerAction"
          @pointerleave="stopPointerAction"
        >
          <defs>
            <marker id="knowledge-canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
            <pattern id="knowledge-canvas-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.16" />
            </pattern>
          </defs>
          <g :transform="viewportApi.transform.value">
            <rect :width="documentDraft.width" :height="documentDraft.height" class="knowledge-canvas-editor__grid" />
            <KnowledgeCanvasElementRenderer
              v-for="element in documentDraft.elements"
              :key="element.id"
              :element="element"
              :selected="selection.isSelected(element.id)"
              :editing="editingElementId === element.id"
              @pointerdown="event => startElementDrag(event, element)"
              @resize-start="event => startElementResize(event, element)"
              @double-click="elementId => editingElementId = elementId"
              @commit-text="payload => updateElement(payload.elementId, { text: payload.text })"
              @stop-editing="editingElementId = null"
            />
            <line
              v-for="(guide, index) in snapGuides"
              :key="`${guide.axis}-${guide.position}-${index}`"
              class="knowledge-canvas-editor__snap-guide"
              :class="`knowledge-canvas-editor__snap-guide--${guide.axis}`"
              :x1="guide.axis === 'x' ? guide.position : guide.from"
              :x2="guide.axis === 'x' ? guide.position : guide.to"
              :y1="guide.axis === 'x' ? guide.from : guide.position"
              :y2="guide.axis === 'x' ? guide.to : guide.position"
            />
            <rect
              v-if="selection.marquee.value"
              class="knowledge-canvas-editor__marquee"
              :x="Math.min(selection.marquee.value.x, selection.marquee.value.x + selection.marquee.value.width)"
              :y="Math.min(selection.marquee.value.y, selection.marquee.value.y + selection.marquee.value.height)"
              :width="Math.abs(selection.marquee.value.width)"
              :height="Math.abs(selection.marquee.value.height)"
            />
          </g>
        </svg>
      </div>

      <aside class="knowledge-canvas-editor__panel">
        <template v-if="selectedElement">
          <div class="knowledge-canvas-editor__panel-head">
            <strong>{{ selectedElement.type }}</strong>
            <span>{{ selectedElement.id }}</span>
          </div>
          <label v-if="isInlineTextEditableElement(selectedElement)">
            文本
            <UiTextarea :model-value="selectedElement.text || ''" @update:model-value="updateSelectedText" />
          </label>
          <div class="knowledge-canvas-editor__field-grid">
            <label>
              X
              <UiInput :model-value="String(Math.round(selectedElement.x))" type="number" size="sm" @update:model-value="value => updateSelectedNumber('x', value)" />
            </label>
            <label>
              Y
              <UiInput :model-value="String(Math.round(selectedElement.y))" type="number" size="sm" @update:model-value="value => updateSelectedNumber('y', value)" />
            </label>
            <label>
              宽
              <UiInput :model-value="String(Math.round(selectedElement.width))" type="number" size="sm" :min="1" @update:model-value="value => updateSelectedNumber('width', value)" />
            </label>
            <label>
              高
              <UiInput :model-value="String(Math.round(selectedElement.height))" type="number" size="sm" :min="1" @update:model-value="value => updateSelectedNumber('height', value)" />
            </label>
          </div>
          <label class="knowledge-canvas-editor__lock">
            <UiCheckbox
              size="sm"
              :checked="Boolean(selectedElement.locked)"
              @change="checked => updateSelectedBoolean('locked', checked)"
            />
            锁定元素
          </label>
          <UiColorPicker
            class="knowledge-canvas-editor__stroke-picker"
            :model-value="selectedElement.style?.stroke || '#4A90D9'"
            :swatches="canvasStrokeColorOptions"
            label="描边颜色"
            aria-label="选择描边颜色"
            placeholder="#4A90D9"
            @update:model-value="value => updateSelectedStyle('stroke', value)"
          />
          <label>
            标题
            <UiInput :model-value="selectedElement.title || ''" size="sm" @update:model-value="value => updateSelectedString('title', value)" />
          </label>
          <label>
            页面链接
            <UiInput list="knowledge-canvas-page-suggestions" :model-value="selectedPageId" size="sm" @update:model-value="value => updateSelectedString('pageId', value)" />
          </label>
          <datalist id="knowledge-canvas-page-suggestions">
            <option v-for="title in pageSuggestionOptions" :key="title" :value="title" />
          </datalist>
          <label>
            Todo ID
            <UiInput :model-value="selectedTodoId" size="sm" @update:model-value="value => updateSelectedString('todoId', value)" />
          </label>
          <div v-if="selectedPageId || selectedTodoId" class="knowledge-canvas-editor__link-actions">
            <UiButton v-if="selectedPageId" type="button" variant="secondary" size="sm" @click="emit('open-page-link', selectedPageId)">
              打开页面
            </UiButton>
            <UiButton v-if="selectedTodoId" type="button" variant="secondary" size="sm" @click="emit('open-todo-link', selectedTodoId)">
              打开 Todo
            </UiButton>
          </div>
          <div v-if="selectedAssetId" class="knowledge-canvas-editor__asset">
            <span>{{ selectedElement.style?.assetName || selectedAssetId }}</span>
            <UiButton type="button" variant="secondary" size="sm" @click="emit('open-asset', selectedAssetId)">打开</UiButton>
            <UiButton type="button" variant="secondary" size="sm" @click="emit('select-asset', selectedAssetId)">标记</UiButton>
          </div>
          <UiButton
            v-if="selectedElement.type === 'file'"
            type="button"
            variant="secondary"
            size="sm"
            :disabled="Boolean(selectedElement.locked)"
            @click="chooseFileAsset"
          >
            选择文件
          </UiButton>
        </template>
        <div v-else class="knowledge-canvas-editor__empty">
          选择画布元素查看属性。可拖动画布框选，按住空格拖动画布，滚轮缩放。
        </div>
        <p v-if="exportMessage" class="knowledge-canvas-editor__export-message">{{ exportMessage }}</p>
      </aside>
    </div>
    <UiFileInput ref="fileInputRef" :accept="fileInputAccept" @change="handleFileSelected" />
  </section>
</template>

<style scoped lang="scss">
.knowledge-canvas-editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  color: var(--ui-text-primary);
  background: transparent;
  outline: 0;
}

.knowledge-canvas-editor__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  min-height: 0;
}

.knowledge-canvas-editor__stage-wrap {
  overflow: hidden;
  min-height: 0;
  padding: 0;
}

.knowledge-canvas-editor__stage {
  display: block;
  width: 100%;
  height: 100%;
  color: var(--ui-text-muted);
  background: transparent;
  cursor: crosshair;
}

.knowledge-canvas-editor__grid {
  fill: url('#knowledge-canvas-grid');
}

.knowledge-canvas-editor__marquee {
  fill: var(--knowledge-selection-bg, color-mix(in srgb, var(--ui-primary-color) 12%, transparent));
  stroke: var(--ui-primary-color);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}

.knowledge-canvas-editor__snap-guide {
  stroke: var(--ui-primary-color);
  stroke-width: 1.25;
  stroke-dasharray: 8 5;
  opacity: 0.9;
  pointer-events: none;
  vector-effect: non-scaling-stroke;
}

.knowledge-canvas-editor__snap-guide--x,
.knowledge-canvas-editor__snap-guide--y {
  filter: drop-shadow(0 0 2px color-mix(in srgb, var(--ui-primary-color) 40%, transparent));
}

.knowledge-canvas-editor__panel {
  min-width: 0;
  overflow: auto;
  border-left: 1px solid var(--ui-border-subtle);
  padding: 14px;
  background: var(--ui-surface-panel);
}

.knowledge-canvas-editor__panel-head {
  display: grid;
  gap: 3px;
  margin-bottom: 12px;

  span {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }
}

.knowledge-canvas-editor__panel label {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-canvas-editor__lock {
  display: flex !important;
  grid-template-columns: none;
  align-items: center;
  color: var(--ui-text-primary) !important;
}

.knowledge-canvas-editor__field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.knowledge-canvas-editor__stroke-picker,
.knowledge-canvas-editor__link-actions,
.knowledge-canvas-editor__asset {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.knowledge-canvas-editor__asset {
  padding: 9px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--ui-surface-panel-muted);
}

.knowledge-canvas-editor__empty,
.knowledge-canvas-editor__export-message {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-sm);
}
</style>
