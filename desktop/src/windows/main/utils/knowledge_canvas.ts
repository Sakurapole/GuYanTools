import type {
  KnowledgeAsset,
  KnowledgeCanvasDocument,
  KnowledgeCanvasElement,
  KnowledgeCanvasElementType,
  KnowledgeCanvasPoint,
} from '@/contracts/knowledge';

const DOCUMENT_TYPE = 'guyantools.canvas-page';
const DOCUMENT_VERSION = 1;
const DEFAULT_WIDTH = 1800;
const DEFAULT_HEIGHT = 1200;

export function createCanvasElement(
  type: KnowledgeCanvasElementType,
  input: Partial<KnowledgeCanvasElement> = {},
): KnowledgeCanvasElement {
  const now = new Date().toISOString();
  return normalizeCanvasElement({
    id: input.id || createCanvasElementId(),
    type,
    x: input.x ?? 120,
    y: input.y ?? 120,
    width: input.width ?? defaultWidthForType(type),
    height: input.height ?? defaultHeightForType(type),
    text: input.text ?? defaultTextForType(type),
    stroke: input.stroke ?? '#4A90D9',
    fill: input.fill ?? defaultFillForType(type),
    strokeWidth: input.strokeWidth ?? (type === 'path' ? 3 : 2),
    points: input.points,
    assetId: input.assetId,
    assetName: input.assetName,
    assetMimeType: input.assetMimeType,
    assetUrl: input.assetUrl,
    pageId: input.pageId,
    todoId: input.todoId,
    title: input.title,
    createdAt: input.createdAt || now,
    updatedAt: now,
  }) as KnowledgeCanvasElement;
}

export function createDefaultCanvasDocument(title?: string): KnowledgeCanvasDocument {
  return normalizeCanvasDocument({
    type: DOCUMENT_TYPE,
    version: DOCUMENT_VERSION,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    updatedAt: new Date().toISOString(),
    elements: [
      createCanvasElement('text', {
        x: 120,
        y: 120,
        width: 360,
        height: 90,
        text: title || '画布页面',
        title: '标题',
      }),
    ],
  });
}

export function parseKnowledgeCanvasDocument(value?: string | null, fallbackTitle?: string): KnowledgeCanvasDocument {
  if (!value) return createDefaultCanvasDocument(fallbackTitle);
  try {
    return normalizeCanvasDocument(JSON.parse(value) as unknown, fallbackTitle);
  } catch {
    return createDefaultCanvasDocument(fallbackTitle);
  }
}

export function normalizeCanvasDocument(value: unknown, fallbackTitle?: string): KnowledgeCanvasDocument {
  const source = isRecord(value) ? value : {};
  const elements = Array.isArray(source.elements)
    ? source.elements
      .map((element) => normalizeCanvasElement(element))
      .filter((element): element is KnowledgeCanvasElement => Boolean(element))
    : [];

  return {
    type: DOCUMENT_TYPE,
    version: DOCUMENT_VERSION,
    width: normalizeNumber(source.width, DEFAULT_WIDTH, 640, 6000),
    height: normalizeNumber(source.height, DEFAULT_HEIGHT, 480, 6000),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    elements: elements.length ? elements : createDefaultCanvasDocument(fallbackTitle).elements,
  };
}

export function serializeCanvasDocument(document: KnowledgeCanvasDocument) {
  return JSON.stringify({
    ...normalizeCanvasDocument(document),
    updatedAt: new Date().toISOString(),
  });
}

export function canvasDocumentToPlainText(document: KnowledgeCanvasDocument) {
  return normalizeCanvasDocument(document).elements
    .map((element) => canvasElementToPlainText(element))
    .filter(Boolean)
    .join('\n');
}

export function canvasDocumentToMarkdown(document: KnowledgeCanvasDocument) {
  return normalizeCanvasDocument(document).elements
    .map((element) => canvasElementToMarkdown(element))
    .filter(Boolean)
    .join('\n\n');
}

export function updateCanvasElement(
  document: KnowledgeCanvasDocument,
  elementId: string,
  patch: Partial<KnowledgeCanvasElement>,
): KnowledgeCanvasDocument {
  return normalizeCanvasDocument({
    ...document,
    updatedAt: new Date().toISOString(),
    elements: document.elements.map((element) =>
      element.id === elementId
        ? { ...element, ...patch, updatedAt: new Date().toISOString() }
        : element,
    ),
  });
}

export function attachAssetToCanvasElement(
  document: KnowledgeCanvasDocument,
  elementId: string | null,
  asset: KnowledgeAsset,
): KnowledgeCanvasDocument {
  const assetPatch = {
    assetId: asset.id,
    assetName: asset.originalName,
    assetMimeType: asset.mimeType,
    assetUrl: `app://knowledge-assets/id/${encodeURIComponent(asset.id)}/${encodeURIComponent(asset.originalName)}`,
  };

  if (elementId && document.elements.some((element) => element.id === elementId && element.type === 'image')) {
    return updateCanvasElement(document, elementId, assetPatch);
  }

  return normalizeCanvasDocument({
    ...document,
    elements: [
      ...document.elements,
      createCanvasElement('image', {
        ...assetPatch,
        x: 160,
        y: 160,
        width: 420,
        height: 280,
        title: asset.originalName,
      }),
    ],
  });
}

function normalizeCanvasElement(value: unknown): KnowledgeCanvasElement | null {
  if (!isRecord(value)) return null;
  const type = normalizeCanvasElementType(value.type);
  if (!type) return null;

  const now = new Date().toISOString();
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createCanvasElementId(),
    type,
    x: normalizeNumber(value.x, 120, -10000, 10000),
    y: normalizeNumber(value.y, 120, -10000, 10000),
    width: normalizeNumber(value.width, defaultWidthForType(type), 1, 4000),
    height: normalizeNumber(value.height, defaultHeightForType(type), 1, 4000),
    text: typeof value.text === 'string' ? value.text : defaultTextForType(type),
    stroke: typeof value.stroke === 'string' && value.stroke ? value.stroke : '#4A90D9',
    fill: typeof value.fill === 'string' && value.fill ? value.fill : defaultFillForType(type),
    strokeWidth: normalizeNumber(value.strokeWidth, type === 'path' ? 3 : 2, 1, 32),
    points: normalizePoints(value.points),
    assetId: typeof value.assetId === 'string' ? value.assetId : undefined,
    assetName: typeof value.assetName === 'string' ? value.assetName : undefined,
    assetMimeType: typeof value.assetMimeType === 'string' ? value.assetMimeType : undefined,
    assetUrl: typeof value.assetUrl === 'string' ? value.assetUrl : undefined,
    pageId: typeof value.pageId === 'string' ? value.pageId : undefined,
    todoId: typeof value.todoId === 'string' ? value.todoId : undefined,
    title: typeof value.title === 'string' ? value.title : undefined,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now,
  };
}

function normalizeCanvasElementType(value: unknown): KnowledgeCanvasElementType | null {
  if (value === 'text' || value === 'image' || value === 'rect' || value === 'arrow' || value === 'path') {
    return value;
  }
  return null;
}

function normalizePoints(value: unknown): KnowledgeCanvasPoint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const points = value
    .map((point) => {
      if (!isRecord(point)) return null;
      return {
        x: normalizeNumber(point.x, 0, -10000, 10000),
        y: normalizeNumber(point.y, 0, -10000, 10000),
      };
    })
    .filter((point): point is KnowledgeCanvasPoint => Boolean(point));
  return points.length ? points.slice(0, 2000) : undefined;
}

function canvasElementToPlainText(element: KnowledgeCanvasElement) {
  const parts = [
    element.text,
    element.title,
    element.assetName ? `[附件] ${element.assetName}` : '',
    element.pageId ? `[页面] ${element.pageId}` : '',
    element.todoId ? `[Todo] ${element.todoId}` : '',
  ];
  return parts.map((part) => part?.trim()).filter(Boolean).join(' ');
}

function canvasElementToMarkdown(element: KnowledgeCanvasElement) {
  const text = canvasElementToPlainText(element);
  if (element.type === 'image' && element.assetUrl) {
    return `![${element.assetName || element.title || 'canvas image'}](${element.assetUrl})`;
  }
  if (element.type === 'text') return text;
  if (element.type === 'rect') return text ? `> ${text}` : '[矩形标注]';
  if (element.type === 'arrow') return text ? `[箭头] ${text}` : '[箭头标注]';
  if (element.type === 'path') return text ? `[线条] ${text}` : '[自由线条]';
  return text;
}

function defaultWidthForType(type: KnowledgeCanvasElementType) {
  if (type === 'text') return 260;
  if (type === 'image') return 360;
  if (type === 'arrow') return 220;
  if (type === 'path') return 180;
  return 220;
}

function defaultHeightForType(type: KnowledgeCanvasElementType) {
  if (type === 'text') return 96;
  if (type === 'image') return 240;
  if (type === 'arrow') return 1;
  if (type === 'path') return 120;
  return 130;
}

function defaultTextForType(type: KnowledgeCanvasElementType) {
  if (type === 'text') return '文本框';
  if (type === 'rect') return '标注';
  return '';
}

function defaultFillForType(type: KnowledgeCanvasElementType) {
  if (type === 'text') return 'rgba(74, 144, 217, 0.10)';
  if (type === 'rect') return 'rgba(74, 144, 217, 0.12)';
  return 'transparent';
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function createCanvasElementId() {
  return `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
