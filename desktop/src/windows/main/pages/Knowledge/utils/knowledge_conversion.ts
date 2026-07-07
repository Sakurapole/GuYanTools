import type { CreateKnowledgePagePayload, KnowledgePageType } from '@/contracts/knowledge';
import {
  blockDocumentV2ToMarkdown,
  blockDocumentV2ToPlainText,
  markdownToBlockDocumentV2,
  type KnowledgeBlockDocumentV2,
} from '../../../utils/knowledge_blocks_v2';
import {
  canvasDocumentV2ToMarkdown,
  canvasDocumentV2ToPlainText,
  createCanvasElementV2,
  createDefaultCanvasDocumentV2,
  serializeCanvasDocumentV2,
  type KnowledgeCanvasDocumentV2,
} from '../../../utils/knowledge_canvas_v2';
import {
  createBlockSavePayload,
  createCanvasSavePayload,
} from './knowledge_document_codec';

export interface KnowledgeConversionResult {
  pageType: KnowledgePageType;
  title: string;
  warning: string;
  payload: Pick<CreateKnowledgePagePayload, 'pageType' | 'contentMarkdown' | 'contentJson' | 'contentText' | 'propertiesJson'>;
}

export function createMarkdownToBlockConversion(input: {
  title: string;
  markdown: string;
  sourcePageId?: string;
}): KnowledgeConversionResult {
  const document = markdownToBlockDocumentV2(input.markdown, input.title);
  return {
    pageType: 'block',
    title: `${input.title} - 块副本`,
    warning: 'Markdown 转块页面可能有损，原页面会保留并创建副本。',
    payload: {
      pageType: 'block',
      ...createBlockSavePayload(document, conversionProperties('markdown', 'block', input.sourcePageId, true, input.title)),
    },
  };
}

export function createBlockToMarkdownConversion(input: {
  title: string;
  document: KnowledgeBlockDocumentV2;
  sourcePageId?: string;
}): KnowledgeConversionResult {
  const markdown = withProvenance(input.title, blockDocumentV2ToMarkdown(input.document));
  return {
    pageType: 'markdown',
    title: `${input.title} - Markdown 副本`,
    warning: '将创建 Markdown 副本，原块页面不会被覆盖。',
    payload: {
      pageType: 'markdown',
      contentMarkdown: markdown,
      contentText: [input.title, blockDocumentV2ToPlainText(input.document)].filter(Boolean).join('\n'),
      propertiesJson: conversionProperties('block', 'markdown', input.sourcePageId, true, input.title),
    },
  };
}

export function createCanvasToMarkdownConversion(input: {
  title: string;
  document: KnowledgeCanvasDocumentV2;
  sourcePageId?: string;
}): KnowledgeConversionResult {
  const markdown = withProvenance(input.title, canvasDocumentV2ToMarkdown(input.document));
  return {
    pageType: 'markdown',
    title: `${input.title} - 画布摘要`,
    warning: '画布只能转换为空间内容摘要，布局不会无损保留。',
    payload: {
      pageType: 'markdown',
      contentMarkdown: markdown,
      contentText: [input.title, canvasDocumentV2ToPlainText(input.document)].filter(Boolean).join('\n'),
      propertiesJson: conversionProperties('canvas', 'markdown', input.sourcePageId, true, input.title),
    },
  };
}

export function createMarkdownToCanvasConversion(input: {
  title: string;
  markdown: string;
  sourcePageId?: string;
}): KnowledgeConversionResult {
  const document = markdownToCanvasDocument(input.markdown, input.title);
  return {
    pageType: 'canvas',
    title: `${input.title} - 画布副本`,
    warning: 'Markdown 会转换为画布卡片摘要，复杂格式可能有损。',
    payload: {
      pageType: 'canvas',
      ...createCanvasSavePayload(document, conversionProperties('markdown', 'canvas', input.sourcePageId, true, input.title)),
    },
  };
}

export function createBlockToCanvasConversion(input: {
  title: string;
  document: KnowledgeBlockDocumentV2;
  sourcePageId?: string;
}): KnowledgeConversionResult {
  const document = markdownToCanvasDocument(blockDocumentV2ToMarkdown(input.document), input.title);
  return {
    pageType: 'canvas',
    title: `${input.title} - 画布副本`,
    warning: '块页面会转换为画布卡片摘要，嵌套和富文本不会无损保留。',
    payload: {
      pageType: 'canvas',
      ...createCanvasSavePayload(document, conversionProperties('block', 'canvas', input.sourcePageId, true, input.title)),
    },
  };
}

export function createCanvasSummaryPayload(document: KnowledgeCanvasDocumentV2) {
  return {
    contentJson: serializeCanvasDocumentV2(document),
    contentMarkdown: canvasDocumentV2ToMarkdown(document),
    contentText: canvasDocumentV2ToPlainText(document),
  };
}

function markdownToCanvasDocument(markdown: string, title: string): KnowledgeCanvasDocumentV2 {
  const lines = markdown
    .replace(/\r\n/gu, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 48);
  const document = createDefaultCanvasDocumentV2(title);
  const elements = lines.length
    ? lines.map((line, index) => {
        const isTask = /^[-*]\s+\[( |x|X)\]\s+/u.test(line);
        const heading = line.match(/^(#{1,6})\s+(.+)$/u);
        const image = line.match(/!\[([^\]]*)\]\(([^)]+)\)/u);
        const normalizedText = heading?.[2] ?? line.replace(/^[-*]\s+\[( |x|X)\]\s+/u, '').replace(/^[-*]\s+/u, '');
        return createCanvasElementV2(image ? 'image' : isTask ? 'todo_card' : 'rich_text', {
          x: 120 + (index % 3) * 300,
          y: 120 + Math.floor(index / 3) * 160,
          width: image ? 260 : 240,
          height: image ? 160 : 110,
          zIndex: index,
          text: image ? image[1] || '图片' : normalizedText,
          title: heading ? `H${heading[1].length}` : isTask ? '任务' : undefined,
          style: image ? { assetUrl: image[2], assetName: image[1] || 'image' } : undefined,
        });
      })
    : document.elements;
  return {
    ...document,
    elements,
    updatedAt: new Date().toISOString(),
  };
}

function withProvenance(sourceTitle: string, markdown: string) {
  const date = new Date().toISOString().slice(0, 10);
  return [
    '> [!INFO]',
    `> Converted from [[${sourceTitle}]] on ${date}.`,
    '',
    markdown,
  ].join('\n');
}

function conversionProperties(
  sourceType: KnowledgePageType | 'markdown' | 'block' | 'canvas',
  targetType: KnowledgePageType | 'markdown' | 'block' | 'canvas',
  sourcePageId: string | undefined,
  lossy: boolean,
  sourceTitle: string,
) {
  return JSON.stringify({
    conversion: {
      sourceType,
      targetType,
      sourcePageId,
      sourceTitle,
      lossy,
      convertedAt: new Date().toISOString(),
    },
  });
}
