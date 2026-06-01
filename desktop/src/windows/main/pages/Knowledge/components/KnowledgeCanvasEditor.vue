<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
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
} from '@/windows/main/utils/knowledge_canvas_v2';

const props = defineProps<{
  modelValue: KnowledgeCanvasDocumentV2;
  dirty?: boolean;
  saving?: boolean;
  pageSuggestions?: string[];
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: KnowledgeCanvasDocumentV2): void;
  (event: 'save'): void;
  (event: 'asset-file', payload: { elementId?: string; file: File; kind: 'image'; position?: { x: number; y: number } }): void;
  (event: 'open-asset', assetId: string): void;
  (event: 'select-asset', assetId: string): void;
  (event: 'open-page-link', pageRef: string): void;
  (event: 'open-todo-link', todoId: string): void;
}>();

const documentDraft = ref<KnowledgeCanvasDocumentV2>(normalizeCanvasDocumentV2(props.modelValue));
const activeTool = ref<CanvasTool>('select');
const fileInputRef = ref<InstanceType<typeof UiFileInput> | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const exportMessage = ref('');
const drawingPathId = ref<string | null>(null);
const dragState = ref<{
  startX: number;
  startY: number;
  origins: Array<{ id: string; x: number; y: number }>;
} | null>(null);
const marqueeState = ref<{ startX: number; startY: number } | null>(null);
const panState = ref<{ clientX: number; clientY: number } | null>(null);
const isSpacePressed = ref(false);
const editingElementId = ref<string | null>(null);
const lastPointerCanvasPoint = ref<{ x: number; y: number } | null>(null);
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

function addElement(type: CanvasTool, input: Partial<KnowledgeCanvasElementV2> = {}) {
  const element = createCanvasElementV2(type === 'text' ? 'rich_text' : type, {
    ...input,
    zIndex: nextZIndex(),
  });
  updateDocument({ elements: [...documentDraft.value.elements, element] });
  selection.replaceSelection(element.id);
  return element;
}

function removeSelectedElements() {
  if (!selection.selectedIds.value.size) return;
  const nextElements = documentDraft.value.elements.filter((element) => !selection.selectedIds.value.has(element.id));
  updateDocument({
    elements: nextElements.length ? nextElements : [createCanvasElementV2('rich_text', { text: '画布页面' })],
  });
  selection.clearSelection();
}

function duplicateSelectedElements() {
  if (!selection.selectedIds.value.size) return;
  const next = duplicateCanvasElementsV2(documentDraft.value.elements, selection.selectedIds.value);
  updateDocument({ elements: next });
  selection.replaceSelectionMany(next.slice(documentDraft.value.elements.length).map((element) => element.id));
}

function bringSelectedToFront() {
  if (!selection.selectedIds.value.size) return;
  const base = documentDraft.value.elements.filter((element) => !selection.selectedIds.value.has(element.id));
  const selected = documentDraft.value.elements.filter((element) => selection.selectedIds.value.has(element.id));
  updateDocument({ elements: [...base, ...selected].map((element, index) => ({ ...element, zIndex: index })) });
}

function sendSelectedToBack() {
  if (!selection.selectedIds.value.size) return;
  const base = documentDraft.value.elements.filter((element) => !selection.selectedIds.value.has(element.id));
  const selected = documentDraft.value.elements.filter((element) => selection.selectedIds.value.has(element.id));
  updateDocument({ elements: [...selected, ...base].map((element, index) => ({ ...element, zIndex: index })) });
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
  addElement(activeTool.value, { x: point.x, y: point.y });
  activeTool.value = 'select';
}

function startElementDrag(event: PointerEvent, element: KnowledgeCanvasElementV2) {
  if (activeTool.value !== 'select') return;
  event.stopPropagation();
  const point = canvasPoint(event);
  if (event.shiftKey) selection.toggleSelection(element.id);
  else if (!selection.isSelected(element.id)) selection.replaceSelection(element.id);

  dragState.value = {
    startX: point.x,
    startY: point.y,
    origins: documentDraft.value.elements
      .filter((item) => selection.selectedIds.value.has(item.id) || item.id === element.id)
      .map((item) => ({ id: item.id, x: item.x, y: item.y })),
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

  if (!dragState.value) return;
  const dx = point.x - dragState.value.startX;
  const dy = point.y - dragState.value.startY;
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
  dragState.value = null;
  drawingPathId.value = null;
  marqueeState.value = null;
  panState.value = null;
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
  activeTool.value = 'image';
  fileInputRef.value?.click();
}

function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  emit('asset-file', {
    elementId: selectedElement.value?.type === 'image' ? selectedElement.value.id : undefined,
    file,
    kind: 'image',
    position: lastPointerCanvasPoint.value ?? centerPoint(),
  });
  activeTool.value = 'select';
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
  if (!selectedElement.value) return;
  updateElement(selectedElement.value.id, { text: value });
}

function updateSelectedNumber(key: 'x' | 'y' | 'width' | 'height', value: string) {
  if (!selectedElement.value) return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  updateElement(selectedElement.value.id, { [key]: numeric });
}

function updateSelectedStyle(key: 'stroke' | 'fill' | 'strokeWidth', value: string) {
  if (!selectedElement.value) return;
  const nextValue = key === 'strokeWidth' ? Number(value) : value.trim();
  updateElement(selectedElement.value.id, {
    style: {
      ...(selectedElement.value.style ?? {}),
      [key]: nextValue || undefined,
    },
  });
}

function updateSelectedString(key: 'title' | 'pageId' | 'todoId', value: string) {
  if (!selectedElement.value) return;
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

function exportSvg() {
  const svg = svgRef.value;
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(documentDraft.value.width));
  clone.setAttribute('height', String(documentDraft.value.height));
  clone.setAttribute('viewBox', `0 0 ${documentDraft.value.width} ${documentDraft.value.height}`);
  clone.querySelectorAll('.knowledge-canvas-editor__selection,.knowledge-canvas-editor__marquee').forEach((node) => node.remove());
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
  clone.querySelectorAll('.knowledge-canvas-editor__selection,.knowledge-canvas-editor__marquee').forEach((node) => node.remove());
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
  if ((event.key === 'Delete' || event.key === 'Backspace') && selection.selectedIds.value.size && !editingElementId.value) {
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
      :has-selection="selection.selectedIds.value.size > 0"
      @tool="value => activeTool = value"
      @zoom="setZoom"
      @delete="removeSelectedElements"
      @duplicate="duplicateSelectedElements"
      @front="bringSelectedToFront"
      @back="sendSelectedToBack"
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
              @double-click="elementId => editingElementId = elementId"
              @commit-text="payload => updateElement(payload.elementId, { text: payload.text })"
              @stop-editing="editingElementId = null"
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
          <label v-if="selectedElement.type === 'rich_text' || selectedElement.type === 'rect'">
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
          <div class="knowledge-canvas-editor__swatches">
            <UiIconButton
              v-for="color in ['#4A90D9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#64748b']"
              :key="color"
              type="button"
              class="knowledge-canvas-editor__swatch"
              shape="circle"
              size="sm"
              :style="{ background: color }"
              :title="color"
              :aria-label="`选择描边颜色 ${color}`"
              @click="updateSelectedStyle('stroke', color)"
            />
          </div>
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
        </template>
        <div v-else class="knowledge-canvas-editor__empty">
          选择画布元素查看属性。可拖动画布框选，按住空格拖动画布，滚轮缩放。
        </div>
        <p v-if="exportMessage" class="knowledge-canvas-editor__export-message">{{ exportMessage }}</p>
      </aside>
    </div>
    <UiFileInput ref="fileInputRef" accept="image/*" @change="handleFileSelected" />
  </section>
</template>

<style scoped lang="scss">
.knowledge-canvas-editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  color: var(--ui-text-primary);
  background: var(--ui-surface-panel-muted);
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
  background: var(--ui-surface-base);
  cursor: crosshair;
}

.knowledge-canvas-editor__grid {
  fill: url('#knowledge-canvas-grid');
}

.knowledge-canvas-editor__marquee {
  fill: color-mix(in srgb, var(--ui-primary-color) 12%, transparent);
  stroke: var(--ui-primary-color);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
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

.knowledge-canvas-editor__field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.knowledge-canvas-editor__swatches,
.knowledge-canvas-editor__link-actions,
.knowledge-canvas-editor__asset {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.knowledge-canvas-editor__swatch {
  border: 1px solid var(--ui-border-subtle);
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
