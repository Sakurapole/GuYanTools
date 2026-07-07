import type { KnowledgeAsset, KnowledgeBlock, KnowledgeBlockDocument, KnowledgeBlockType } from '@/contracts/knowledge';

const DOCUMENT_TYPE = 'guyantools.block-page';
const DOCUMENT_VERSION = 1;

const TEXT_BLOCK_TYPES = new Set<KnowledgeBlockType>([
  'paragraph',
  'heading',
  'bullet_list',
  'ordered_list',
  'task_list',
  'code',
  'quote',
  'callout',
]);

export function createKnowledgeBlock(type: KnowledgeBlockType, input: Partial<KnowledgeBlock> = {}): KnowledgeBlock {
  const now = new Date().toISOString();
  return {
    id: input.id || createBlockId(),
    type,
    text: input.text ?? defaultTextForType(type),
    level: type === 'heading' ? input.level ?? 2 : input.level,
    language: type === 'code' ? input.language ?? 'text' : input.language,
    checked: type === 'task_list' ? input.checked ?? false : input.checked,
    assetId: input.assetId,
    assetName: input.assetName,
    assetMimeType: input.assetMimeType,
    assetUrl: input.assetUrl,
    todoId: input.todoId,
    pageId: input.pageId,
    title: input.title,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

export function createDefaultBlockDocument(title?: string): KnowledgeBlockDocument {
  return normalizeBlockDocument({
    type: DOCUMENT_TYPE,
    version: DOCUMENT_VERSION,
    blocks: [
      createKnowledgeBlock('heading', { text: title || '块笔记', level: 1 }),
      createKnowledgeBlock('paragraph', { text: '' }),
    ],
    updatedAt: new Date().toISOString(),
  });
}

export function parseKnowledgeBlockDocument(value?: string | null, fallbackTitle?: string): KnowledgeBlockDocument {
  if (!value) return createDefaultBlockDocument(fallbackTitle);
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeBlockDocument(parsed, fallbackTitle);
  } catch {
    return createDefaultBlockDocument(fallbackTitle);
  }
}

export function normalizeBlockDocument(value: unknown, fallbackTitle?: string): KnowledgeBlockDocument {
  const source = isRecord(value) ? value : {};
  const rawBlocks = Array.isArray(source.blocks) ? source.blocks : [];
  const blocks = rawBlocks
    .map((block) => normalizeBlock(block))
    .filter((block): block is KnowledgeBlock => Boolean(block));

  return {
    type: DOCUMENT_TYPE,
    version: DOCUMENT_VERSION,
    importedFromMarkdown: source.importedFromMarkdown === true,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    blocks: blocks.length ? blocks : createDefaultBlockDocument(fallbackTitle).blocks,
  };
}

export function serializeBlockDocument(document: KnowledgeBlockDocument) {
  return JSON.stringify({
    ...normalizeBlockDocument(document),
    updatedAt: new Date().toISOString(),
  });
}

export function blockDocumentToPlainText(document: KnowledgeBlockDocument) {
  return normalizeBlockDocument(document).blocks
    .map((block) => blockToPlainText(block))
    .filter(Boolean)
    .join('\n');
}

export function blockDocumentToMarkdown(document: KnowledgeBlockDocument) {
  return normalizeBlockDocument(document).blocks
    .map((block) => blockToMarkdown(block))
    .filter(Boolean)
    .join('\n\n');
}

export function markdownToBlockDocument(markdown: string, title = 'Markdown 导入'): KnowledgeBlockDocument {
  const blocks: KnowledgeBlock[] = [];
  const lines = markdown.replace(/\r\n/gu, '\n').split('\n');
  let codeBuffer: string[] = [];
  let codeLanguage = 'text';
  let inCode = false;

  for (const line of lines) {
    const codeMatch = line.match(/^```(\w+)?\s*$/u);
    if (codeMatch) {
      if (inCode) {
        blocks.push(createKnowledgeBlock('code', { text: codeBuffer.join('\n'), language: codeLanguage }));
        codeBuffer = [];
        codeLanguage = 'text';
        inCode = false;
      } else {
        inCode = true;
        codeLanguage = codeMatch[1] || 'text';
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/u);
    if (heading) {
      blocks.push(createKnowledgeBlock('heading', { level: heading[1].length, text: heading[2].trim() }));
      continue;
    }

    const task = line.match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/u);
    if (task) {
      blocks.push(createKnowledgeBlock('task_list', { checked: task[1].toLowerCase() === 'x', text: task[2].trim() }));
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/u);
    if (bullet) {
      blocks.push(createKnowledgeBlock('bullet_list', { text: bullet[1].trim() }));
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/u);
    if (ordered) {
      blocks.push(createKnowledgeBlock('ordered_list', { text: ordered[1].trim() }));
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/u);
    if (quote) {
      blocks.push(createKnowledgeBlock('quote', { text: quote[1].trim() }));
      continue;
    }

    blocks.push(createKnowledgeBlock('paragraph', { text: line.trim() }));
  }

  if (codeBuffer.length) {
    blocks.push(createKnowledgeBlock('code', { text: codeBuffer.join('\n'), language: codeLanguage }));
  }

  return normalizeBlockDocument({
    type: DOCUMENT_TYPE,
    version: DOCUMENT_VERSION,
    importedFromMarkdown: true,
    updatedAt: new Date().toISOString(),
    blocks: blocks.length ? blocks : [createKnowledgeBlock('paragraph', { text: title })],
  }, title);
}

export function attachAssetToBlock(
  document: KnowledgeBlockDocument,
  blockId: string,
  asset: KnowledgeAsset,
): KnowledgeBlockDocument {
  return updateBlock(document, blockId, {
    assetId: asset.id,
    assetName: asset.originalName,
    assetMimeType: asset.mimeType,
    assetUrl: `app://knowledge-assets/id/${encodeURIComponent(asset.id)}/${encodeURIComponent(asset.originalName)}`,
  });
}

export function updateBlock(
  document: KnowledgeBlockDocument,
  blockId: string,
  patch: Partial<KnowledgeBlock>,
): KnowledgeBlockDocument {
  return normalizeBlockDocument({
    ...document,
    updatedAt: new Date().toISOString(),
    blocks: document.blocks.map((block) =>
      block.id === blockId
        ? { ...block, ...patch, updatedAt: new Date().toISOString() }
        : block,
    ),
  });
}

function normalizeBlock(value: unknown): KnowledgeBlock | null {
  if (!isRecord(value)) return null;
  const type = normalizeBlockType(value.type);
  if (!type) return null;

  const now = new Date().toISOString();
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createBlockId(),
    type,
    text: typeof value.text === 'string' ? value.text : defaultTextForType(type),
    level: typeof value.level === 'number' ? Math.min(Math.max(Math.round(value.level), 1), 6) : type === 'heading' ? 2 : undefined,
    language: typeof value.language === 'string' ? value.language : type === 'code' ? 'text' : undefined,
    checked: typeof value.checked === 'boolean' ? value.checked : type === 'task_list' ? false : undefined,
    assetId: typeof value.assetId === 'string' ? value.assetId : undefined,
    assetName: typeof value.assetName === 'string' ? value.assetName : undefined,
    assetMimeType: typeof value.assetMimeType === 'string' ? value.assetMimeType : undefined,
    assetUrl: typeof value.assetUrl === 'string' ? value.assetUrl : undefined,
    todoId: typeof value.todoId === 'string' ? value.todoId : undefined,
    pageId: typeof value.pageId === 'string' ? value.pageId : undefined,
    title: typeof value.title === 'string' ? value.title : undefined,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now,
  };
}

function blockToPlainText(block: KnowledgeBlock) {
  if (TEXT_BLOCK_TYPES.has(block.type)) return block.text?.trim() ?? '';
  if (block.type === 'image') return block.assetName ? `[图片] ${block.assetName}` : '';
  if (block.type === 'attachment') return block.assetName ? `[附件] ${block.assetName}` : '';
  if (block.type === 'todo_reference') return block.title ? `[Todo] ${block.title}` : '';
  if (block.type === 'page_reference') return block.title ? `[页面] ${block.title}` : '';
  return '';
}

function blockToMarkdown(block: KnowledgeBlock) {
  const text = block.text ?? '';
  if (block.type === 'heading') return `${'#'.repeat(Math.min(Math.max(block.level ?? 2, 1), 6))} ${text}`;
  if (block.type === 'bullet_list') return text.split('\n').filter(Boolean).map((line) => `- ${line}`).join('\n');
  if (block.type === 'ordered_list') return text.split('\n').filter(Boolean).map((line, index) => `${index + 1}. ${line}`).join('\n');
  if (block.type === 'task_list') return `- [${block.checked ? 'x' : ' '}] ${text}`;
  if (block.type === 'code') return `\`\`\`${block.language || 'text'}\n${text}\n\`\`\``;
  if (block.type === 'quote') return text.split('\n').map((line) => `> ${line}`).join('\n');
  if (block.type === 'callout') return `> [!NOTE]\n${text.split('\n').map((line) => `> ${line}`).join('\n')}`;
  if (block.type === 'image') return block.assetUrl ? `![${block.assetName || 'image'}](${block.assetUrl})` : '';
  if (block.type === 'attachment') return block.assetUrl ? `[${block.assetName || 'attachment'}](${block.assetUrl})` : '';
  if (block.type === 'todo_reference') return block.todoId ? `- [ ] ${block.title || block.text || block.todoId}` : text;
  if (block.type === 'page_reference') return block.pageId ? `[[${block.title || block.pageId}]]` : text;
  return text;
}

function normalizeBlockType(value: unknown): KnowledgeBlockType | null {
  if (
    value === 'paragraph'
    || value === 'heading'
    || value === 'bullet_list'
    || value === 'ordered_list'
    || value === 'task_list'
    || value === 'code'
    || value === 'quote'
    || value === 'callout'
    || value === 'image'
    || value === 'attachment'
    || value === 'todo_reference'
    || value === 'page_reference'
  ) {
    return value;
  }
  return null;
}

function defaultTextForType(type: KnowledgeBlockType) {
  if (type === 'heading') return '新标题';
  if (type === 'task_list') return '待办事项';
  if (type === 'code') return '';
  if (type === 'callout') return '提示内容';
  return '';
}

function createBlockId() {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
