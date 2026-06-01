import type {
  KnowledgeAsset,
  KnowledgeCanvasDocument,
  KnowledgeCanvasElement,
  KnowledgeCanvasElementType,
  KnowledgeCanvasPoint,
} from '@/contracts/knowledge';
import { createCanvasElement, normalizeCanvasDocument } from './knowledge_canvas';

export type KnowledgeCanvasElementV2Type =
  | 'rich_text'
  | 'image'
  | 'rect'
  | 'arrow'
  | 'path'
  | 'file'
  | 'page_card'
  | 'todo_card'
  | 'group';

export interface KnowledgeCanvasElementV2 {
  id: string;
  type: KnowledgeCanvasElementV2Type;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation?: number;
  locked?: boolean;
  text?: string;
  title?: string;
  points?: KnowledgeCanvasPoint[];
  style?: Record<string, unknown>;
  refs?: {
    assetId?: string;
    pageId?: string;
    todoId?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeCanvasViewportV2 {
  x: number;
  y: number;
  zoom: number;
}

export interface KnowledgeCanvasDocumentV2 {
  type: 'guyantools.canvas-page';
  version: 2;
  width: number;
  height: number;
  viewport: KnowledgeCanvasViewportV2;
  elements: KnowledgeCanvasElementV2[];
  updatedAt: string;
}

export function createDefaultCanvasDocumentV2(title = '画布页面'): KnowledgeCanvasDocumentV2 {
  return normalizeCanvasDocumentV2({
    type: 'guyantools.canvas-page',
    version: 2,
    width: 1800,
    height: 1200,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    updatedAt: new Date().toISOString(),
    elements: [
      createCanvasElementV2('rich_text', {
        x: 120,
        y: 120,
        width: 360,
        height: 90,
        text: title,
        title: '标题',
      }),
    ],
  });
}

export function createCanvasElementV2(
  type: KnowledgeCanvasElementV2Type,
  input: Partial<KnowledgeCanvasElementV2> = {},
): KnowledgeCanvasElementV2 {
  const now = new Date().toISOString();
  return {
    id: input.id || createCanvasElement(toV1CanvasElementType(type)).id,
    type,
    x: input.x ?? 120,
    y: input.y ?? 120,
    width: input.width ?? defaultWidthForType(type),
    height: input.height ?? defaultHeightForType(type),
    zIndex: input.zIndex ?? 0,
    rotation: input.rotation,
    locked: input.locked,
    text: input.text ?? defaultTextForType(type),
    title: input.title,
    points: input.points,
    style: input.style,
    refs: input.refs,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function migrateCanvasDocumentToV2(document: KnowledgeCanvasDocument): KnowledgeCanvasDocumentV2 {
  const normalized = normalizeCanvasDocument(document);
  return normalizeCanvasDocumentV2({
    type: 'guyantools.canvas-page',
    version: 2,
    width: normalized.width,
    height: normalized.height,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    updatedAt: normalized.updatedAt,
    elements: normalized.elements.map((element, index) => migrateElement(element, index)),
  });
}

export function canvasDocumentV2ToV1Document(document: KnowledgeCanvasDocumentV2): KnowledgeCanvasDocument {
  const normalized = normalizeCanvasDocumentV2(document);
  return normalizeCanvasDocument({
    type: 'guyantools.canvas-page',
    version: 1,
    width: normalized.width,
    height: normalized.height,
    updatedAt: normalized.updatedAt,
    elements: normalized.elements.map(elementV2ToV1),
  });
}

export function parseKnowledgeCanvasDocumentV2(value?: string | null, fallbackTitle?: string): KnowledgeCanvasDocumentV2 {
  if (!value) return createDefaultCanvasDocumentV2(fallbackTitle);
  try {
    return normalizeCanvasDocumentV2(JSON.parse(value) as unknown, fallbackTitle);
  } catch {
    return createDefaultCanvasDocumentV2(fallbackTitle);
  }
}

export function normalizeCanvasDocumentV2(value: unknown, fallbackTitle?: string): KnowledgeCanvasDocumentV2 {
  const source = isRecord(value) ? value : {};
  if (source.version !== 2) return migrateCanvasDocumentToV2(normalizeCanvasDocument(value, fallbackTitle));

  const elements = Array.isArray(source.elements)
    ? source.elements
      .map((element) => normalizeCanvasElementV2(element))
      .filter((element): element is KnowledgeCanvasElementV2 => Boolean(element))
    : [];

  return {
    type: 'guyantools.canvas-page',
    version: 2,
    width: normalizeNumber(source.width, 1800, 640, 6000),
    height: normalizeNumber(source.height, 1200, 480, 6000),
    viewport: normalizeViewport(source.viewport),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    elements: elements.length ? elements.sort((a, b) => a.zIndex - b.zIndex) : createDefaultCanvasDocumentV2(fallbackTitle).elements,
  };
}

export function serializeCanvasDocumentV2(document: KnowledgeCanvasDocumentV2): string {
  return JSON.stringify({
    ...normalizeCanvasDocumentV2(document),
    updatedAt: new Date().toISOString(),
  });
}

export function canvasDocumentV2ToPlainText(document: KnowledgeCanvasDocumentV2): string {
  return normalizeCanvasDocumentV2(document).elements
    .map((element) => canvasElementV2ToPlainText(element))
    .filter(Boolean)
    .join('\n');
}

export function canvasDocumentV2ToMarkdown(document: KnowledgeCanvasDocumentV2): string {
  return normalizeCanvasDocumentV2(document).elements
    .map((element) => canvasElementV2ToMarkdown(element))
    .filter(Boolean)
    .join('\n\n');
}

export function updateCanvasElementV2(
  document: KnowledgeCanvasDocumentV2,
  elementId: string,
  patch: Partial<KnowledgeCanvasElementV2>,
): KnowledgeCanvasDocumentV2 {
  return normalizeCanvasDocumentV2({
    ...document,
    updatedAt: new Date().toISOString(),
    elements: document.elements.map((element) =>
      element.id === elementId
        ? {
            ...element,
            ...patch,
            style: patch.style ? patch.style : element.style,
            refs: patch.refs ? patch.refs : element.refs,
            updatedAt: new Date().toISOString(),
          }
        : element,
    ),
  });
}

export function attachAssetToCanvasElementV2(
  document: KnowledgeCanvasDocumentV2,
  elementId: string | null,
  asset: KnowledgeAsset,
  position?: { x: number; y: number },
): KnowledgeCanvasDocumentV2 {
  const assetPatch = {
    refs: { assetId: asset.id },
    title: asset.originalName,
    style: {
      assetName: asset.originalName,
      assetMimeType: asset.mimeType,
      assetUrl: `app://knowledge-assets/id/${encodeURIComponent(asset.id)}/${encodeURIComponent(asset.originalName)}`,
    },
  };

  if (elementId && document.elements.some((element) => element.id === elementId && element.type === 'image')) {
    return updateCanvasElementV2(document, elementId, assetPatch);
  }

  return normalizeCanvasDocumentV2({
    ...document,
    elements: [
      ...document.elements,
      createCanvasElementV2('image', {
        ...assetPatch,
        x: position?.x ?? 160,
        y: position?.y ?? 160,
        width: 420,
        height: 280,
        zIndex: nextZIndex(document.elements),
      }),
    ],
  });
}

export function findCanvasElementV2(
  elements: KnowledgeCanvasElementV2[],
  elementId: string,
): KnowledgeCanvasElementV2 | null {
  return elements.find((element) => element.id === elementId) ?? null;
}

export function duplicateCanvasElementsV2(
  elements: KnowledgeCanvasElementV2[],
  selectedIds: Set<string>,
): KnowledgeCanvasElementV2[] {
  const copies = elements
    .filter((element) => selectedIds.has(element.id))
    .map((element, offset) => ({
      ...element,
      id: createCanvasElementV2(element.type).id,
      x: element.x + 28,
      y: element.y + 28,
      zIndex: nextZIndex(elements) + offset,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  return [...elements, ...copies];
}

function migrateElement(element: KnowledgeCanvasElement, index: number): KnowledgeCanvasElementV2 {
  return createCanvasElementV2(element.type === 'text' ? 'rich_text' : element.type, {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width ?? defaultWidthForType(element.type === 'text' ? 'rich_text' : element.type),
    height: element.height ?? defaultHeightForType(element.type === 'text' ? 'rich_text' : element.type),
    zIndex: index,
    text: element.text,
    title: element.title,
    points: element.points,
    style: compactRecord({
      stroke: element.stroke,
      fill: element.fill,
      strokeWidth: element.strokeWidth,
      assetName: element.assetName,
      assetMimeType: element.assetMimeType,
      assetUrl: element.assetUrl,
    }),
    refs: compactRecord({
      assetId: element.assetId,
      pageId: element.pageId,
      todoId: element.todoId,
    }),
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
  });
}

function elementV2ToV1(element: KnowledgeCanvasElementV2): KnowledgeCanvasElement {
  const type = toV1CanvasElementType(element.type);
  return {
    ...createCanvasElement(type),
    id: element.id,
    type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    text: element.text,
    stroke: typeof element.style?.stroke === 'string' ? element.style.stroke : undefined,
    fill: typeof element.style?.fill === 'string' ? element.style.fill : undefined,
    strokeWidth: typeof element.style?.strokeWidth === 'number' ? element.style.strokeWidth : undefined,
    points: element.points,
    assetId: element.refs?.assetId,
    assetName: typeof element.style?.assetName === 'string' ? element.style.assetName : undefined,
    assetMimeType: typeof element.style?.assetMimeType === 'string' ? element.style.assetMimeType : undefined,
    assetUrl: typeof element.style?.assetUrl === 'string' ? element.style.assetUrl : undefined,
    pageId: element.refs?.pageId,
    todoId: element.refs?.todoId,
    title: element.title,
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
  };
}

function normalizeCanvasElementV2(value: unknown): KnowledgeCanvasElementV2 | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.type !== 'string') return null;
  const type = normalizeCanvasElementV2Type(value.type);
  return createCanvasElementV2(type, {
    id: value.id,
    x: normalizeNumber(value.x, 120, -10000, 10000),
    y: normalizeNumber(value.y, 120, -10000, 10000),
    width: normalizeNumber(value.width, defaultWidthForType(type), 1, 4000),
    height: normalizeNumber(value.height, defaultHeightForType(type), 1, 4000),
    zIndex: normalizeNumber(value.zIndex, 0, -100000, 100000),
    rotation: typeof value.rotation === 'number' ? value.rotation : undefined,
    locked: value.locked === true,
    text: typeof value.text === 'string' ? value.text : defaultTextForType(type),
    title: typeof value.title === 'string' ? value.title : undefined,
    points: normalizePoints(value.points),
    style: isRecord(value.style) ? value.style : undefined,
    refs: normalizeRefs(value.refs),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
  });
}

function canvasElementV2ToPlainText(element: KnowledgeCanvasElementV2): string {
  const parts = [
    element.text,
    element.title,
    typeof element.style?.assetName === 'string' ? `[附件] ${element.style.assetName}` : '',
    element.refs?.pageId ? `[页面] ${element.refs.pageId}` : '',
    element.refs?.todoId ? `[Todo] ${element.refs.todoId}` : '',
  ];
  return parts.map((part) => part?.trim()).filter(Boolean).join(' ');
}

function canvasElementV2ToMarkdown(element: KnowledgeCanvasElementV2): string {
  const text = canvasElementV2ToPlainText(element);
  const assetUrl = typeof element.style?.assetUrl === 'string' ? element.style.assetUrl : '';
  const assetName = typeof element.style?.assetName === 'string' ? element.style.assetName : element.title;
  if (element.type === 'image' && assetUrl) return `![${assetName || 'canvas image'}](${assetUrl})`;
  if (element.type === 'file' && assetUrl) return `[${assetName || 'canvas file'}](${assetUrl})`;
  if (element.type === 'rich_text') return text;
  if (element.type === 'rect') return text ? `> ${text}` : '[矩形标注]';
  if (element.type === 'arrow') return text ? `[箭头] ${text}` : '[箭头标注]';
  if (element.type === 'path') return text ? `[线条] ${text}` : '[自由线条]';
  if (element.type === 'page_card') return element.refs?.pageId ? `[[${text || element.refs.pageId}]]` : text;
  if (element.type === 'todo_card') return element.refs?.todoId ? `- [ ] ${text || element.refs.todoId}` : text;
  return text;
}

function normalizeCanvasElementV2Type(value: string): KnowledgeCanvasElementV2Type {
  if (
    value === 'rich_text'
    || value === 'image'
    || value === 'rect'
    || value === 'arrow'
    || value === 'path'
    || value === 'file'
    || value === 'page_card'
    || value === 'todo_card'
    || value === 'group'
  ) {
    return value;
  }
  if (value === 'text') return 'rich_text';
  return 'rich_text';
}

function toV1CanvasElementType(value: KnowledgeCanvasElementV2Type): KnowledgeCanvasElementType {
  if (value === 'rich_text') return 'text';
  if (value === 'file' || value === 'page_card' || value === 'todo_card' || value === 'group') return 'rect';
  return value;
}

function normalizeViewport(value: unknown): KnowledgeCanvasViewportV2 {
  const source = isRecord(value) ? value : {};
  return {
    x: normalizeNumber(source.x, 0, -10000, 10000),
    y: normalizeNumber(source.y, 0, -10000, 10000),
    zoom: normalizeNumber(source.zoom, 0.85, 0.1, 4),
  };
}

function normalizeRefs(value: unknown): KnowledgeCanvasElementV2['refs'] | undefined {
  if (!isRecord(value)) return undefined;
  const refs = compactRecord({
    assetId: typeof value.assetId === 'string' ? value.assetId : undefined,
    pageId: typeof value.pageId === 'string' ? value.pageId : undefined,
    todoId: typeof value.todoId === 'string' ? value.todoId : undefined,
  });
  return Object.keys(refs).length ? refs : undefined;
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

function defaultWidthForType(type: KnowledgeCanvasElementV2Type) {
  if (type === 'rich_text') return 260;
  if (type === 'image') return 360;
  if (type === 'arrow') return 220;
  if (type === 'path') return 180;
  return 220;
}

function defaultHeightForType(type: KnowledgeCanvasElementV2Type) {
  if (type === 'rich_text') return 96;
  if (type === 'image') return 240;
  if (type === 'arrow') return 1;
  if (type === 'path') return 120;
  return 130;
}

function defaultTextForType(type: KnowledgeCanvasElementV2Type) {
  if (type === 'rich_text') return '文本框';
  if (type === 'rect') return '标注';
  return '';
}

function nextZIndex(elements: KnowledgeCanvasElementV2[]) {
  return elements.reduce((max, element) => Math.max(max, element.zIndex), 0) + 1;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function compactRecord<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
