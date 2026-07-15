import { randomUUID } from 'node:crypto';
import * as nativeCore from '@guyantools/core';
import type { ScreenshotRecognitionOptions, ScreenshotUiBlock } from '@/contracts/screenshot';

type NativeRecognitionModule = typeof nativeCore & {
  recognizeScreenshotUiBlocks?: (pngBytes: Buffer, optionsJson?: string) => Promise<string>;
};

export async function recognizeScreenshotUiBlocksNative(
  pngBytes: Buffer,
  options: ScreenshotRecognitionOptions = {},
): Promise<ScreenshotUiBlock[]> {
  const recognizer = (nativeCore as NativeRecognitionModule).recognizeScreenshotUiBlocks;
  if (!recognizer) {
    throw new Error('当前原生核心未暴露截图 UI 块识别能力');
  }

  const raw = await recognizer(pngBytes, JSON.stringify(options));
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('截图 UI 块识别结果格式无效');
  }

  return parsed.map(normalizeNativeBlock);
}

function normalizeNativeBlock(value: unknown): ScreenshotUiBlock {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rect = record.rect && typeof record.rect === 'object' ? record.rect as Record<string, unknown> : {};
  const features = record.features && typeof record.features === 'object' ? record.features as Record<string, unknown> : {};

  return {
    id: typeof record.id === 'string' ? record.id : randomUUID(),
    kind: normalizeKind(record.kind),
    rect: {
      x: numeric(rect.x),
      y: numeric(rect.y),
      width: numeric(rect.width),
      height: numeric(rect.height),
    },
    confidence: clamp(numeric(record.confidence), 0, 1),
    parentId: typeof record.parentId === 'string' ? record.parentId : undefined,
    childIds: Array.isArray(record.childIds) ? record.childIds.filter((item): item is string => typeof item === 'string') : [],
    source: 'local-heuristic',
    features: {
      edgeDensity: numeric(features.edgeDensity),
      fillRatio: numeric(features.fillRatio),
      aspectRatio: numeric(features.aspectRatio),
      horizontalAlignmentScore: numeric(features.horizontalAlignmentScore),
      repeatedSiblingScore: numeric(features.repeatedSiblingScore),
    },
    text: typeof record.text === 'string' ? record.text : undefined,
    textConfidence: typeof record.textConfidence === 'number' ? record.textConfidence : undefined,
    metadata: record.metadata && typeof record.metadata === 'object' ? record.metadata as Record<string, unknown> : undefined,
  };
}

function normalizeKind(value: unknown): ScreenshotUiBlock['kind'] {
  if (
    value === 'button'
    || value === 'input'
    || value === 'card'
    || value === 'list_item'
    || value === 'navigation'
    || value === 'image'
    || value === 'group'
    || value === 'unknown'
  ) {
    return value;
  }
  return 'unknown';
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
