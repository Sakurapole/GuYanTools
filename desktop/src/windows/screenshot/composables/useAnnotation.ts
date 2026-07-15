import { computed, readonly, ref } from 'vue';
import type {
  ScreenshotAnnotationElement,
  ScreenshotAnnotationStyle,
  ScreenshotAnnotationTool,
} from '@/contracts/screenshot';

const DEFAULT_STYLE: ScreenshotAnnotationStyle = {
  color: '#ef4444',
  strokeWidth: 3,
  fontSize: 16,
};

const COLOR_PRESETS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff'] as const;
const STROKE_WIDTHS = [2, 4, 6] as const;

let nextElementId = 1;

export function useAnnotation() {
  const elements = ref<ScreenshotAnnotationElement[]>([]);
  const activeTool = ref<ScreenshotAnnotationTool | null>(null);
  const style = ref<ScreenshotAnnotationStyle>({ ...DEFAULT_STYLE });
  const undoStack = ref<ScreenshotAnnotationElement[][]>([]);
  const redoStack = ref<ScreenshotAnnotationElement[][]>([]);
  let numberCounter = 0;

  // 当前正在绘制的临时元素
  const drawingElement = ref<ScreenshotAnnotationElement | null>(null);

  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  const hasElements = computed(() => elements.value.length > 0);

  function setActiveTool(tool: ScreenshotAnnotationTool | null) {
    activeTool.value = tool;
    drawingElement.value = null;
  }

  function setColor(color: string) {
    style.value = { ...style.value, color };
  }

  function setStrokeWidth(width: number) {
    style.value = { ...style.value, strokeWidth: width };
  }

  function createTemporaryElement(points: Array<{ x: number; y: number }>): ScreenshotAnnotationElement {
    return {
      id: `tmp-${nextElementId++}`,
      tool: activeTool.value ?? 'rect',
      points,
      color: style.value.color,
      strokeWidth: style.value.strokeWidth,
      fontSize: style.value.fontSize,
    };
  }

  function updateDrawingElement(element: ScreenshotAnnotationElement | null) {
    drawingElement.value = element;
  }

  function commitDrawing() {
    const el = drawingElement.value;
    if (!el || !activeTool.value) return;

    // 过滤掉太小的元素（误触）
    if (el.points.length >= 2) {
      const minX = Math.min(...el.points.map((p) => p.x));
      const maxX = Math.max(...el.points.map((p) => p.x));
      const minY = Math.min(...el.points.map((p) => p.y));
      const maxY = Math.max(...el.points.map((p) => p.y));
      const w = maxX - minX;
      const h = maxY - minY;
      if (['rect', 'ellipse', 'arrow', 'line'].includes(el.tool) && w < 4 && h < 4) {
        drawingElement.value = null;
        return;
      }
    }

    pushUndo();
    const finalEl: ScreenshotAnnotationElement = { ...el, id: `ann-${nextElementId++}` };
    // 编号工具：分配递增序号并存储在 text 字段，渲染时读取
    if (finalEl.tool === 'number') {
      numberCounter++;
      finalEl.text = String(numberCounter);
    }
    elements.value = [...elements.value, finalEl];
    drawingElement.value = null;
  }

  function addTextElement(
    position: { x: number; y: number },
    text: string,
  ) {
    if (!text.trim()) return;
    pushUndo();
    elements.value = [
      ...elements.value,
      {
        id: `ann-${nextElementId++}`,
        tool: 'text',
        points: [position],
        color: style.value.color,
        strokeWidth: style.value.strokeWidth,
        text,
        fontSize: style.value.fontSize,
      },
    ];
  }

  function pushUndo() {
    undoStack.value = [...undoStack.value, elements.value.slice()];
    redoStack.value = [];
  }

  function undo() {
    if (undoStack.value.length === 0) return;
    const previous = undoStack.value[undoStack.value.length - 1];
    redoStack.value = [...redoStack.value, elements.value.slice()];
    undoStack.value = undoStack.value.slice(0, -1);
    elements.value = previous;
  }

  function redo() {
    if (redoStack.value.length === 0) return;
    const next = redoStack.value[redoStack.value.length - 1];
    undoStack.value = [...undoStack.value, elements.value.slice()];
    redoStack.value = redoStack.value.slice(0, -1);
    elements.value = next;
  }

  function clearAll() {
    if (elements.value.length === 0) return;
    pushUndo();
    elements.value = [];
  }

  function reset() {
    elements.value = [];
    undoStack.value = [];
    redoStack.value = [];
    drawingElement.value = null;
    activeTool.value = null;
    style.value = { ...DEFAULT_STYLE };
    numberCounter = 0;
  }

  return {
    elements: readonly(elements),
    drawingElement: readonly(drawingElement),
    activeTool: readonly(activeTool),
    style: readonly(style),
    canUndo,
    canRedo,
    hasElements,
    colorPresets: COLOR_PRESETS,
    strokeWidthes: STROKE_WIDTHS,
    setActiveTool,
    setColor,
    setStrokeWidth,
    createTemporaryElement,
    updateDrawingElement,
    commitDrawing,
    addTextElement,
    undo,
    redo,
    clearAll,
    reset,
  };
}
