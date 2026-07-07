import type {
  KnowledgeBlockDocument,
  KnowledgeCanvasDocument,
  UpdateKnowledgePagePayload,
} from '@/contracts/knowledge';
import type { KnowledgeBlockDocumentV2 } from '../../../utils/knowledge_blocks_v2';
import type { KnowledgeCanvasDocumentV2 } from '../../../utils/knowledge_canvas_v2';
import {
  blockDocumentV2ToMarkdown,
  blockDocumentV2ToPlainText,
  normalizeBlockDocumentV2,
  serializeBlockDocumentV2,
} from '../../../utils/knowledge_blocks_v2';
import {
  canvasDocumentV2ToMarkdown,
  canvasDocumentV2ToPlainText,
  normalizeCanvasDocumentV2,
  serializeCanvasDocumentV2,
} from '../../../utils/knowledge_canvas_v2';

const defaultBlockProperties = {
  editor: 'guyantools-block-editor',
  schema: 'guyantools.block-page',
  schemaVersion: 1,
};

const defaultCanvasProperties = {
  editor: 'guyantools-canvas-editor',
  schema: 'guyantools.canvas-page',
  schemaVersion: 1,
};

export function createMarkdownSavePayload(markdown: string): UpdateKnowledgePagePayload {
  return {
    contentMarkdown: markdown,
    contentText: markdown,
  };
}

export function createBlockSavePayload(
  document: KnowledgeBlockDocument | KnowledgeBlockDocumentV2,
  existingPropertiesJson?: string,
): UpdateKnowledgePagePayload {
  const normalized = normalizeBlockDocumentV2(document);

  return {
    contentJson: serializeBlockDocumentV2(normalized),
    contentText: blockDocumentV2ToPlainText(normalized),
    contentMarkdown: blockDocumentV2ToMarkdown(normalized),
    propertiesJson: existingPropertiesJson || JSON.stringify(defaultBlockProperties),
  };
}

export function createCanvasSavePayload(
  document: KnowledgeCanvasDocument | KnowledgeCanvasDocumentV2,
  existingPropertiesJson?: string,
): UpdateKnowledgePagePayload {
  const normalized = normalizeCanvasDocumentV2(document);
  return {
    contentJson: serializeCanvasDocumentV2(normalized),
    contentText: canvasDocumentV2ToPlainText(normalized),
    contentMarkdown: canvasDocumentV2ToMarkdown(normalized),
    propertiesJson: existingPropertiesJson || JSON.stringify(defaultCanvasProperties),
  };
}
