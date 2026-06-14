import type { KnowledgeAsset, KnowledgeBlock, KnowledgeBlockDocument, KnowledgeBlockType } from '@/contracts/knowledge';
import { createKnowledgeBlock, markdownToBlockDocument, normalizeBlockDocument } from './knowledge_blocks';

export type KnowledgeInlineMarkType = 'bold' | 'italic' | 'code' | 'strike';

export interface KnowledgeInlineMark {
  type: KnowledgeInlineMarkType;
}

export interface KnowledgeInlineText {
  type: 'text';
  text: string;
  marks?: KnowledgeInlineMark[];
}

export type KnowledgeInlineContent = KnowledgeInlineText;

export type KnowledgeBlockV2Type = KnowledgeBlockType | 'divider' | 'toggle' | 'table';

export interface KnowledgeBlockV2 {
  id: string;
  type: KnowledgeBlockV2Type;
  content: KnowledgeInlineContent[];
  children?: KnowledgeBlockV2[];
  attrs?: Record<string, unknown>;
  refs?: {
    assetId?: string;
    pageId?: string;
    todoId?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeBlockDocumentV2 {
  type: 'guyantools.block-page';
  version: 2;
  blocks: KnowledgeBlockV2[];
  importedFromMarkdown?: boolean;
  updatedAt: string;
}

export function createDefaultBlockDocumentV2(title = '块笔记'): KnowledgeBlockDocumentV2 {
  void title;
  return normalizeBlockDocumentV2({
    type: 'guyantools.block-page',
    version: 2,
    updatedAt: new Date().toISOString(),
    blocks: [
      createBlockV2('paragraph', ''),
    ],
  });
}

export function createBlockV2(
  type: KnowledgeBlockV2Type,
  text = '',
  attrs: Record<string, unknown> = {},
): KnowledgeBlockV2 {
  const now = new Date().toISOString();
  return {
    id: createKnowledgeBlock(toV1CompatibleType(type)).id,
    type,
    content: text ? [{ type: 'text', text }] : [],
    attrs,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseKnowledgeBlockDocumentV2(value?: string | null, fallbackTitle?: string): KnowledgeBlockDocumentV2 {
  if (!value) return createDefaultBlockDocumentV2(fallbackTitle);
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeBlockDocumentV2(parsed, fallbackTitle);
  } catch {
    return createDefaultBlockDocumentV2(fallbackTitle);
  }
}

export function migrateBlockDocumentToV2(document: KnowledgeBlockDocument): KnowledgeBlockDocumentV2 {
  const normalized = normalizeBlockDocument(document);
  return normalizeBlockDocumentV2({
    type: 'guyantools.block-page',
    version: 2,
    importedFromMarkdown: normalized.importedFromMarkdown,
    updatedAt: normalized.updatedAt,
    blocks: normalized.blocks.map(blockToV2),
  });
}

export function markdownToBlockDocumentV2(markdown: string, title = 'Markdown 导入'): KnowledgeBlockDocumentV2 {
  return migrateBlockDocumentToV2(markdownToBlockDocument(markdown, title));
}

export function blockDocumentV2ToV1Document(document: KnowledgeBlockDocumentV2): KnowledgeBlockDocument {
  const normalized = normalizeBlockDocumentV2(document);
  return normalizeBlockDocument({
    type: 'guyantools.block-page',
    version: 1,
    importedFromMarkdown: normalized.importedFromMarkdown,
    updatedAt: normalized.updatedAt,
    blocks: normalized.blocks.map(blockV2ToV1),
  });
}

export function normalizeBlockDocumentV2(value: unknown, fallbackTitle?: string): KnowledgeBlockDocumentV2 {
  const source = isRecord(value) ? value : {};
  if (source.version !== 2) {
    return migrateBlockDocumentToV2(normalizeBlockDocument(value, fallbackTitle));
  }

  const blocks = Array.isArray(source.blocks)
    ? source.blocks.map(normalizeBlockV2).filter((block): block is KnowledgeBlockV2 => Boolean(block))
    : [];

  return {
    type: 'guyantools.block-page',
    version: 2,
    importedFromMarkdown: source.importedFromMarkdown === true,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    blocks: blocks.length ? blocks : createDefaultBlockDocumentV2(fallbackTitle).blocks,
  };
}

export function serializeBlockDocumentV2(document: KnowledgeBlockDocumentV2): string {
  return JSON.stringify({
    ...normalizeBlockDocumentV2(document),
    updatedAt: new Date().toISOString(),
  });
}

export function blockDocumentV2ToPlainText(document: KnowledgeBlockDocumentV2): string {
  return flattenBlocks(normalizeBlockDocumentV2(document).blocks)
    .map((block) => blockV2ToPlainText(block))
    .filter(Boolean)
    .join('\n');
}

export function blockDocumentV2ToMarkdown(document: KnowledgeBlockDocumentV2): string {
  return normalizeBlockDocumentV2(document).blocks
    .map((block) => blockV2TreeToMarkdown(block))
    .filter(Boolean)
    .join('\n\n');
}

export function insertBlockAfter(
  blocks: KnowledgeBlockV2[],
  blockId: string,
  block: KnowledgeBlockV2,
): KnowledgeBlockV2[] {
  return insertBlockAfterWithResult(blocks, blockId, block).blocks;
}

export function insertBlockAfterWithResult(
  blocks: KnowledgeBlockV2[],
  blockId: string,
  block: KnowledgeBlockV2,
): { blocks: KnowledgeBlockV2[]; insertedBlockId: string } {
  const inserted = insertBlocksAfterInLevel(blocks, blockId, [block]);
  return {
    blocks: inserted.changed ? inserted.blocks : [...blocks, block],
    insertedBlockId: block.id,
  };
}

export function insertBlocksAfterWithResult(
  blocks: KnowledgeBlockV2[],
  blockId: string,
  insertedBlocks: KnowledgeBlockV2[],
): { blocks: KnowledgeBlockV2[]; insertedBlockId: string | null } {
  const safeBlocks = insertedBlocks.length ? insertedBlocks : [createBlockV2('paragraph')];
  const inserted = insertBlocksAfterInLevel(blocks, blockId, safeBlocks);
  return {
    blocks: inserted.changed ? inserted.blocks : [...blocks, ...safeBlocks],
    insertedBlockId: safeBlocks[0]?.id ?? null,
  };
}

export function removeBlockById(blocks: KnowledgeBlockV2[], blockId: string): KnowledgeBlockV2[] {
  return removeBlockWithResult(blocks, blockId).blocks;
}

export function removeBlockWithResult(
  blocks: KnowledgeBlockV2[],
  blockId: string,
): { blocks: KnowledgeBlockV2[]; focusBlockId: string | null } {
  const result = removeBlockFromLevel(blocks, blockId);
  if (result.blocks.length) {
    return {
      blocks: result.blocks,
      focusBlockId: result.focusBlockId ?? null,
    };
  }

  const fallback = createBlockV2('paragraph');
  return {
    blocks: [fallback],
    focusBlockId: fallback.id,
  };
}

export function moveBlockById(
  blocks: KnowledgeBlockV2[],
  blockId: string,
  direction: -1 | 1,
): KnowledgeBlockV2[] {
  return moveBlockInLevel(blocks, blockId, direction).blocks;
}

export function duplicateBlockById(blocks: KnowledgeBlockV2[], blockId: string): KnowledgeBlockV2[] {
  return duplicateBlockWithResult(blocks, blockId).blocks;
}

export function duplicateBlockWithResult(
  blocks: KnowledgeBlockV2[],
  blockId: string,
): { blocks: KnowledgeBlockV2[]; duplicatedBlockId: string | null } {
  const result = duplicateBlockInLevel(blocks, blockId);
  return {
    blocks: result.blocks,
    duplicatedBlockId: result.duplicatedBlockId ?? null,
  };
}

export function cloneBlockV2ForPaste(block: KnowledgeBlockV2): KnowledgeBlockV2 {
  return cloneBlockWithNewIds(block);
}

export function updateBlockDocumentV2(
  document: KnowledgeBlockDocumentV2,
  blockId: string,
  patch: Partial<KnowledgeBlockV2>,
): KnowledgeBlockDocumentV2 {
  return normalizeBlockDocumentV2({
    ...document,
    updatedAt: new Date().toISOString(),
    blocks: updateBlockInTree(document.blocks, blockId, (block) => ({
      ...block,
      ...patch,
      attrs: patch.attrs ? patch.attrs : block.attrs,
      refs: patch.refs ? patch.refs : block.refs,
      updatedAt: new Date().toISOString(),
    })),
  });
}

export function attachAssetToBlockV2(
  document: KnowledgeBlockDocumentV2,
  blockId: string,
  asset: KnowledgeAsset,
): KnowledgeBlockDocumentV2 {
  const block = findBlockV2(document.blocks, blockId);
  return updateBlockDocumentV2(document, blockId, {
    attrs: {
      ...(block?.attrs ?? {}),
      assetName: asset.originalName,
      assetMimeType: asset.mimeType,
      assetUrl: `app://knowledge-assets/id/${encodeURIComponent(asset.id)}/${encodeURIComponent(asset.originalName)}`,
    },
    refs: {
      ...(block?.refs ?? {}),
      assetId: asset.id,
    },
  });
}

export function findBlockV2(blocks: KnowledgeBlockV2[], blockId: string): KnowledgeBlockV2 | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const child = findBlockV2(block.children ?? [], blockId);
    if (child) return child;
  }
  return null;
}

export function blockV2InlineText(block: KnowledgeBlockV2): string {
  return inlineText(block.content);
}

export function indentBlock(blocks: KnowledgeBlockV2[], blockId: string): KnowledgeBlockV2[] {
  return indentBlockInLevel(blocks, blockId).blocks;
}

export function outdentBlock(blocks: KnowledgeBlockV2[], blockId: string): KnowledgeBlockV2[] {
  return outdentFromLevel(blocks, blockId).blocks;
}

export function splitBlockAtTextOffset(
  document: KnowledgeBlockDocumentV2,
  blockId: string,
  offset: number,
): { document: KnowledgeBlockDocumentV2; focusBlockId: string; cursorOffset: number } {
  const normalized = normalizeBlockDocumentV2(document);
  const result = splitBlockInLevel(normalized.blocks, blockId, Math.max(0, offset));
  if (!result.changed || !result.focusBlockId) {
    return { document: normalized, focusBlockId: blockId, cursorOffset: offset };
  }

  return {
    document: normalizeBlockDocumentV2({
      ...normalized,
      updatedAt: new Date().toISOString(),
      blocks: result.blocks,
    }),
    focusBlockId: result.focusBlockId,
    cursorOffset: 0,
  };
}

export function mergeBlockBackward(
  document: KnowledgeBlockDocumentV2,
  blockId: string,
): { document: KnowledgeBlockDocumentV2; focusBlockId: string; cursorOffset: number } {
  const normalized = normalizeBlockDocumentV2(document);
  const result = mergeBlockBackwardInLevel(normalized.blocks, blockId);
  if (!result.changed || !result.focusBlockId) {
    return { document: normalized, focusBlockId: blockId, cursorOffset: 0 };
  }

  return {
    document: normalizeBlockDocumentV2({
      ...normalized,
      updatedAt: new Date().toISOString(),
      blocks: result.blocks.length ? result.blocks : [createBlockV2('paragraph')],
    }),
    focusBlockId: result.focusBlockId,
    cursorOffset: result.cursorOffset,
  };
}

export function moveBlockBefore(
  document: KnowledgeBlockDocumentV2,
  draggedBlockId: string,
  targetBlockId: string,
): { document: KnowledgeBlockDocumentV2; focusBlockId: string } {
  const normalized = normalizeBlockDocumentV2(document);
  if (draggedBlockId === targetBlockId) {
    return { document: normalized, focusBlockId: draggedBlockId };
  }

  const extracted = extractBlockFromLevel(normalized.blocks, draggedBlockId);
  if (!extracted.block) {
    return { document: normalized, focusBlockId: draggedBlockId };
  }

  const inserted = insertBlockBeforeInLevel(extracted.blocks, targetBlockId, extracted.block);
  if (!inserted.changed) {
    return { document: normalized, focusBlockId: draggedBlockId };
  }

  return {
    document: normalizeBlockDocumentV2({
      ...normalized,
      updatedAt: new Date().toISOString(),
      blocks: inserted.blocks,
    }),
    focusBlockId: draggedBlockId,
  };
}

export function moveBlockAfter(
  document: KnowledgeBlockDocumentV2,
  draggedBlockId: string,
  targetBlockId: string,
): { document: KnowledgeBlockDocumentV2; focusBlockId: string } {
  const normalized = normalizeBlockDocumentV2(document);
  if (draggedBlockId === targetBlockId) {
    return { document: normalized, focusBlockId: draggedBlockId };
  }

  const extracted = extractBlockFromLevel(normalized.blocks, draggedBlockId);
  if (!extracted.block) {
    return { document: normalized, focusBlockId: draggedBlockId };
  }

  const inserted = insertBlockAfterInLevel(extracted.blocks, targetBlockId, extracted.block);
  if (!inserted.changed) {
    return { document: normalized, focusBlockId: draggedBlockId };
  }

  return {
    document: normalizeBlockDocumentV2({
      ...normalized,
      updatedAt: new Date().toISOString(),
      blocks: inserted.blocks,
    }),
    focusBlockId: draggedBlockId,
  };
}

function blockToV2(block: KnowledgeBlock): KnowledgeBlockV2 {
  return {
    id: block.id,
    type: block.type,
    content: block.text ? [{ type: 'text', text: block.text }] : [],
    attrs: compactRecord({
      level: block.level,
      language: block.language,
      checked: block.checked,
      assetName: block.assetName,
      assetMimeType: block.assetMimeType,
      assetUrl: block.assetUrl,
      title: block.title,
    }),
    refs: compactRecord({
      assetId: block.assetId,
      pageId: block.pageId,
      todoId: block.todoId,
    }),
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
  };
}

function blockV2ToPlainText(block: KnowledgeBlockV2): string {
  const text = inlineText(block.content).trim();
  if (text) return text;
  if (typeof block.attrs?.assetName === 'string') return block.attrs.assetName;
  if (typeof block.attrs?.title === 'string') return block.attrs.title;
  if (block.refs?.todoId) return `[Todo] ${block.refs.todoId}`;
  if (block.refs?.pageId) return `[页面] ${block.refs.pageId}`;
  return '';
}

function blockV2ToMarkdown(block: KnowledgeBlockV2): string {
  const text = inlineText(block.content);
  if (block.type === 'heading') return `${'#'.repeat(normalizeHeadingLevel(block.attrs?.level))} ${text}`;
  if (block.type === 'bullet_list') return text.split('\n').filter(Boolean).map((line) => `- ${line}`).join('\n');
  if (block.type === 'ordered_list') return text.split('\n').filter(Boolean).map((line, index) => `${index + 1}. ${line}`).join('\n');
  if (block.type === 'task_list') return `- [${block.attrs?.checked ? 'x' : ' '}] ${text}`;
  if (block.type === 'code') return `\`\`\`${String(block.attrs?.language ?? 'text')}\n${text}\n\`\`\``;
  if (block.type === 'quote') return text.split('\n').map((line) => `> ${line}`).join('\n');
  if (block.type === 'callout') return `> [!NOTE]\n${text.split('\n').map((line) => `> ${line}`).join('\n')}`;
  if (block.type === 'table') return tableBlockToMarkdown(block);
  if (block.type === 'toggle') return text;
  if (block.type === 'divider') return '---';
  if (block.type === 'image' && typeof block.attrs?.assetUrl === 'string') {
    return `![${String(block.attrs.assetName ?? 'image')}](${block.attrs.assetUrl})`;
  }
  if (block.type === 'attachment' && typeof block.attrs?.assetUrl === 'string') {
    return `[${String(block.attrs.assetName ?? 'attachment')}](${block.attrs.assetUrl})`;
  }
  if (block.type === 'todo_reference') return block.refs?.todoId ? `- [ ] ${text || block.refs.todoId}` : text;
  if (block.type === 'page_reference') return block.refs?.pageId ? `[[${text || block.refs.pageId}]]` : text;
  return text;
}

function blockV2TreeToMarkdown(block: KnowledgeBlockV2): string {
  if (block.type === 'toggle') {
    const summary = escapeHtml(inlineText(block.content).trim() || '折叠内容');
    const childMarkdown = (block.children ?? [])
      .map((child) => blockV2TreeToMarkdown(child))
      .filter(Boolean)
      .join('\n\n');
    return [
      '<details>',
      `<summary>${summary}</summary>`,
      childMarkdown ? `\n${childMarkdown}` : '',
      '</details>',
    ].filter((line) => line !== '').join('\n');
  }

  const ownMarkdown = blockV2ToMarkdown(block);
  const childMarkdown = (block.children ?? [])
    .map((child) => blockV2TreeToMarkdown(child))
    .filter(Boolean)
    .join('\n\n');
  return [ownMarkdown, childMarkdown].filter(Boolean).join('\n\n');
}

function tableBlockToMarkdown(block: KnowledgeBlockV2): string {
  const text = inlineText(block.content).trim();
  if (text.includes('|')) return text;

  const rowCount = normalizeTableSize(block.attrs?.rows, 3, 1, 20);
  const columnCount = normalizeTableSize(block.attrs?.columns, 3, 1, 12);
  const header = Array.from({ length: columnCount }, (_item, index) => `列 ${index + 1}`);
  const divider = Array.from({ length: columnCount }, () => '---');
  const rows = Array.from({ length: Math.max(0, rowCount - 1) }, () =>
    Array.from({ length: columnCount }, () => ''),
  );

  return [
    formatTableRow(header),
    formatTableRow(divider),
    ...rows.map(formatTableRow),
  ].join('\n');
}

function normalizeTableSize(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(Math.max(numeric, min), max);
}

function formatTableRow(row: string[]) {
  return `| ${row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blockV2ToV1(block: KnowledgeBlockV2): KnowledgeBlock {
  const type = toV1CompatibleType(block.type);
  return {
    ...createKnowledgeBlock(type),
    id: block.id,
    type,
    text: inlineText(block.content),
    level: typeof block.attrs?.level === 'number' ? block.attrs.level : undefined,
    language: typeof block.attrs?.language === 'string' ? block.attrs.language : undefined,
    checked: typeof block.attrs?.checked === 'boolean' ? block.attrs.checked : undefined,
    assetId: block.refs?.assetId,
    assetName: typeof block.attrs?.assetName === 'string' ? block.attrs.assetName : undefined,
    assetMimeType: typeof block.attrs?.assetMimeType === 'string' ? block.attrs.assetMimeType : undefined,
    assetUrl: typeof block.attrs?.assetUrl === 'string' ? block.attrs.assetUrl : undefined,
    todoId: block.refs?.todoId,
    pageId: block.refs?.pageId,
    title: typeof block.attrs?.title === 'string' ? block.attrs.title : undefined,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
  };
}

function normalizeBlockV2(value: unknown): KnowledgeBlockV2 | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.type !== 'string') return null;
  return {
    id: value.id,
    type: normalizeBlockV2Type(value.type),
    content: normalizeInlineContent(value.content),
    children: Array.isArray(value.children)
      ? value.children.map(normalizeBlockV2).filter((block): block is KnowledgeBlockV2 => Boolean(block))
      : undefined,
    attrs: isRecord(value.attrs) ? value.attrs : undefined,
    refs: normalizeRefs(value.refs),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}

function normalizeInlineContent(value: unknown): KnowledgeInlineContent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item) || item.type !== 'text' || typeof item.text !== 'string') return null;
      const marks = normalizeInlineMarks(item.marks);
      return {
        type: 'text' as const,
        text: item.text,
        ...(marks ? { marks } : {}),
      };
    })
    .filter((item): item is KnowledgeInlineContent => Boolean(item));
}

function normalizeInlineMarks(value: unknown): KnowledgeInlineMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const marks = value
    .map((item) => {
      if (!isRecord(item)) return null;
      if (item.type === 'bold' || item.type === 'italic' || item.type === 'code' || item.type === 'strike') {
        return { type: item.type };
      }
      return null;
    })
    .filter((item): item is KnowledgeInlineMark => Boolean(item));
  return marks.length ? marks : undefined;
}

function normalizeRefs(value: unknown): KnowledgeBlockV2['refs'] | undefined {
  if (!isRecord(value)) return undefined;
  const refs = compactRecord({
    assetId: typeof value.assetId === 'string' ? value.assetId : undefined,
    pageId: typeof value.pageId === 'string' ? value.pageId : undefined,
    todoId: typeof value.todoId === 'string' ? value.todoId : undefined,
  });
  return Object.keys(refs).length ? refs : undefined;
}

function normalizeBlockV2Type(value: string): KnowledgeBlockV2Type {
  if (value === 'divider' || value === 'toggle' || value === 'table') return value;
  return toV1CompatibleType(value);
}

function toV1CompatibleType(value: string): KnowledgeBlockType {
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
  return 'paragraph';
}

function normalizeHeadingLevel(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 2;
  return Math.min(Math.max(Math.round(numeric), 1), 6);
}

function inlineText(content: KnowledgeInlineContent[]): string {
  return content.map((item) => item.text).join('');
}

function inlineTextLength(content: KnowledgeInlineContent[]): number {
  return inlineText(content).length;
}

function splitInlineContentAtOffset(
  content: KnowledgeInlineContent[],
  offset: number,
): { before: KnowledgeInlineContent[]; after: KnowledgeInlineContent[] } {
  const before: KnowledgeInlineContent[] = [];
  const after: KnowledgeInlineContent[] = [];
  let remaining = Math.max(0, offset);

  for (const item of content) {
    if (remaining <= 0) {
      after.push({ ...item, marks: item.marks ? [...item.marks] : undefined });
      continue;
    }

    if (remaining >= item.text.length) {
      before.push({ ...item, marks: item.marks ? [...item.marks] : undefined });
      remaining -= item.text.length;
      continue;
    }

    const beforeText = item.text.slice(0, remaining);
    const afterText = item.text.slice(remaining);
    if (beforeText) {
      before.push({ ...item, text: beforeText, marks: item.marks ? [...item.marks] : undefined });
    }
    if (afterText) {
      after.push({ ...item, text: afterText, marks: item.marks ? [...item.marks] : undefined });
    }
    remaining = 0;
  }

  return { before, after };
}

function flattenBlocks(blocks: KnowledgeBlockV2[]): KnowledgeBlockV2[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children ?? [])]);
}

function insertBlockAfterInLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
  block: KnowledgeBlockV2,
): { blocks: KnowledgeBlockV2[]; changed: boolean } {
  return insertBlocksAfterInLevel(blocks, blockId, [block]);
}

function insertBlocksAfterInLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
  insertedBlocks: KnowledgeBlockV2[],
): { blocks: KnowledgeBlockV2[]; changed: boolean } {
  const index = blocks.findIndex((item) => item.id === blockId);
  if (index >= 0) {
    return {
      blocks: [...blocks.slice(0, index + 1), ...insertedBlocks, ...blocks.slice(index + 1)],
      changed: true,
    };
  }

  for (let childIndex = 0; childIndex < blocks.length; childIndex += 1) {
    const item = blocks[childIndex];
    if (!item.children?.length) continue;
    const result = insertBlocksAfterInLevel(item.children, blockId, insertedBlocks);
    if (result.changed) {
      return {
        blocks: [
          ...blocks.slice(0, childIndex),
          { ...item, children: result.blocks, updatedAt: new Date().toISOString() },
          ...blocks.slice(childIndex + 1),
        ],
        changed: true,
      };
    }
  }

  return { blocks, changed: false };
}

function insertBlockBeforeInLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
  block: KnowledgeBlockV2,
): { blocks: KnowledgeBlockV2[]; changed: boolean } {
  const index = blocks.findIndex((item) => item.id === blockId);
  if (index >= 0) {
    return {
      blocks: [...blocks.slice(0, index), block, ...blocks.slice(index)],
      changed: true,
    };
  }

  for (let childIndex = 0; childIndex < blocks.length; childIndex += 1) {
    const item = blocks[childIndex];
    if (!item.children?.length) continue;
    const result = insertBlockBeforeInLevel(item.children, blockId, block);
    if (result.changed) {
      const next = [...blocks];
      next[childIndex] = {
        ...item,
        children: result.blocks,
      };
      return { blocks: next, changed: true };
    }
  }

  return { blocks, changed: false };
}

function splitBlockInLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
  offset: number,
): { blocks: KnowledgeBlockV2[]; changed: boolean; focusBlockId?: string } {
  const index = blocks.findIndex((item) => item.id === blockId);
  if (index >= 0) {
    const block = blocks[index];
    const split = splitInlineContentAtOffset(block.content, offset);
    if (shouldExitBlockOnEmptyEnter(block, split.before, split.after)) {
      const exitedBlock: KnowledgeBlockV2 = {
        ...block,
        type: 'paragraph',
        content: [],
        attrs: undefined,
        refs: undefined,
        updatedAt: new Date().toISOString(),
      };
      return {
        blocks: [...blocks.slice(0, index), exitedBlock, ...blocks.slice(index + 1)],
        changed: true,
        focusBlockId: exitedBlock.id,
      };
    }

    const nextType: KnowledgeBlockV2Type = block.type === 'heading' ? 'paragraph' : block.type;
    const nextBlock: KnowledgeBlockV2 = {
      ...createBlockV2(nextType),
      content: split.after,
      attrs: splitNextBlockAttrs(block, nextType),
      refs: splitNextBlockRefs(block, nextType),
    };
    const currentBlock = {
      ...block,
      content: split.before,
      updatedAt: new Date().toISOString(),
    };
    return {
      blocks: [...blocks.slice(0, index), currentBlock, nextBlock, ...blocks.slice(index + 1)],
      changed: true,
      focusBlockId: nextBlock.id,
    };
  }

  for (let childIndex = 0; childIndex < blocks.length; childIndex += 1) {
    const item = blocks[childIndex];
    if (!item.children?.length) continue;
    const result = splitBlockInLevel(item.children, blockId, offset);
    if (result.changed) {
      const next = [...blocks];
      next[childIndex] = {
        ...item,
        children: result.blocks,
      };
      return { blocks: next, changed: true, focusBlockId: result.focusBlockId };
    }
  }

  return { blocks, changed: false };
}

function splitNextBlockAttrs(
  block: KnowledgeBlockV2,
  nextType: KnowledgeBlockV2Type,
): Record<string, unknown> | undefined {
  if (nextType !== block.type) return undefined;
  if (block.type === 'task_list') {
    return { ...(block.attrs ?? {}), checked: false };
  }
  return block.attrs;
}

function splitNextBlockRefs(
  block: KnowledgeBlockV2,
  nextType: KnowledgeBlockV2Type,
): KnowledgeBlockV2['refs'] | undefined {
  if (nextType !== block.type) return undefined;
  if (block.type === 'task_list') return undefined;
  return block.refs;
}

function shouldExitBlockOnEmptyEnter(
  block: KnowledgeBlockV2,
  before: KnowledgeInlineContent[],
  after: KnowledgeInlineContent[],
) {
  const exitTypes = new Set<KnowledgeBlockV2Type>([
    'bullet_list',
    'ordered_list',
    'task_list',
    'quote',
    'callout',
    'toggle',
  ]);
  return exitTypes.has(block.type) && inlineTextLength(before) === 0 && inlineTextLength(after) === 0;
}

function mergeBlockBackwardInLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
): { blocks: KnowledgeBlockV2[]; changed: boolean; focusBlockId?: string; cursorOffset: number } {
  const index = blocks.findIndex((item) => item.id === blockId);
  if (index > 0) {
    const previous = blocks[index - 1];
    const current = blocks[index];
    const cursorOffset = inlineTextLength(previous.content);
    const mergedPrevious = {
      ...previous,
      content: [...previous.content, ...current.content],
      children: previous.children,
      updatedAt: new Date().toISOString(),
    };
    return {
      blocks: [...blocks.slice(0, index - 1), mergedPrevious, ...blocks.slice(index + 1)],
      changed: true,
      focusBlockId: previous.id,
      cursorOffset,
    };
  }

  if (index === 0) {
    return { blocks, changed: false, focusBlockId: blockId, cursorOffset: 0 };
  }

  for (let childIndex = 0; childIndex < blocks.length; childIndex += 1) {
    const item = blocks[childIndex];
    if (!item.children?.length) continue;
    const firstChild = item.children[0];
    if (firstChild?.id === blockId) {
      const outdentedBlock = {
        ...firstChild,
        updatedAt: new Date().toISOString(),
      };
      const parent = {
        ...item,
        children: item.children.slice(1),
        updatedAt: new Date().toISOString(),
      };
      return {
        blocks: [
          ...blocks.slice(0, childIndex),
          parent,
          outdentedBlock,
          ...blocks.slice(childIndex + 1),
        ],
        changed: true,
        focusBlockId: outdentedBlock.id,
        cursorOffset: 0,
      };
    }

    const result = mergeBlockBackwardInLevel(item.children, blockId);
    if (result.changed) {
      const next = [...blocks];
      next[childIndex] = {
        ...item,
        children: result.blocks,
      };
      return result.changed
        ? { blocks: next, changed: true, focusBlockId: result.focusBlockId, cursorOffset: result.cursorOffset }
        : { blocks, changed: false, cursorOffset: 0 };
    }
  }

  return { blocks, changed: false, cursorOffset: 0 };
}

function extractBlockFromLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
): { blocks: KnowledgeBlockV2[]; block?: KnowledgeBlockV2 } {
  const index = blocks.findIndex((item) => item.id === blockId);
  if (index >= 0) {
    return {
      blocks: [...blocks.slice(0, index), ...blocks.slice(index + 1)],
      block: blocks[index],
    };
  }

  for (let childIndex = 0; childIndex < blocks.length; childIndex += 1) {
    const item = blocks[childIndex];
    if (!item.children?.length) continue;
    const result = extractBlockFromLevel(item.children, blockId);
    if (result.block) {
      const next = [...blocks];
      next[childIndex] = {
        ...item,
        children: result.blocks,
      };
      return { blocks: next, block: result.block };
    }
  }

  return { blocks };
}

function removeBlockFromLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
): { blocks: KnowledgeBlockV2[]; changed: boolean; focusBlockId?: string | null } {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index >= 0) {
    const next = [...blocks.slice(0, index), ...blocks.slice(index + 1)];
    return {
      blocks: next,
      changed: true,
      focusBlockId: next[index]?.id ?? next[index - 1]?.id ?? null,
    };
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block.children?.length) continue;
    const result = removeBlockFromLevel(block.children, blockId);
    if (result.changed) {
      return {
        blocks: [
          ...blocks.slice(0, index),
          { ...block, children: result.blocks, updatedAt: new Date().toISOString() },
          ...blocks.slice(index + 1),
        ],
        changed: true,
        focusBlockId: result.focusBlockId ?? block.id,
      };
    }
  }

  return { blocks, changed: false };
}

function moveBlockInLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
  direction: -1 | 1,
): { blocks: KnowledgeBlockV2[]; changed: boolean } {
  const index = blocks.findIndex((block) => block.id === blockId);
  const targetIndex = index + direction;
  if (index >= 0) {
    if (targetIndex < 0 || targetIndex >= blocks.length) return { blocks, changed: false };
    const next = [...blocks];
    const [block] = next.splice(index, 1);
    next.splice(targetIndex, 0, block);
    return { blocks: next, changed: true };
  }

  for (let childIndex = 0; childIndex < blocks.length; childIndex += 1) {
    const block = blocks[childIndex];
    if (!block.children?.length) continue;
    const result = moveBlockInLevel(block.children, blockId, direction);
    if (result.changed) {
      return {
        blocks: [
          ...blocks.slice(0, childIndex),
          { ...block, children: result.blocks, updatedAt: new Date().toISOString() },
          ...blocks.slice(childIndex + 1),
        ],
        changed: true,
      };
    }
  }

  return { blocks, changed: false };
}

function duplicateBlockInLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
): { blocks: KnowledgeBlockV2[]; changed: boolean; duplicatedBlockId?: string } {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index >= 0) {
    const duplicate = cloneBlockWithNewIds(blocks[index]);
    return {
      blocks: [
        ...blocks.slice(0, index + 1),
        duplicate,
        ...blocks.slice(index + 1),
      ],
      changed: true,
      duplicatedBlockId: duplicate.id,
    };
  }

  for (let childIndex = 0; childIndex < blocks.length; childIndex += 1) {
    const block = blocks[childIndex];
    if (!block.children?.length) continue;
    const result = duplicateBlockInLevel(block.children, blockId);
    if (result.changed) {
      return {
        blocks: [
          ...blocks.slice(0, childIndex),
          { ...block, children: result.blocks, updatedAt: new Date().toISOString() },
          ...blocks.slice(childIndex + 1),
        ],
        changed: true,
        duplicatedBlockId: result.duplicatedBlockId,
      };
    }
  }

  return { blocks, changed: false };
}

function cloneBlockWithNewIds(block: KnowledgeBlockV2): KnowledgeBlockV2 {
  const now = new Date().toISOString();
  return {
    ...block,
    id: createBlockV2(block.type).id,
    children: block.children?.map(cloneBlockWithNewIds),
    createdAt: now,
    updatedAt: now,
  };
}

function updateBlockInTree(
  blocks: KnowledgeBlockV2[],
  blockId: string,
  updater: (block: KnowledgeBlockV2) => KnowledgeBlockV2,
): KnowledgeBlockV2[] {
  return blocks.map((block) => {
    if (block.id === blockId) return updater(block);
    if (!block.children?.length) return block;
    return {
      ...block,
      children: updateBlockInTree(block.children, blockId, updater),
    };
  });
}

function indentBlockInLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
): { blocks: KnowledgeBlockV2[]; changed: boolean } {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index > 0) {
    const previous = blocks[index - 1];
    const current = blocks[index];
    return {
      blocks: [
        ...blocks.slice(0, index - 1),
        {
          ...previous,
          children: [...(previous.children ?? []), current],
          updatedAt: new Date().toISOString(),
        },
        ...blocks.slice(index + 1),
      ],
      changed: true,
    };
  }

  for (let childIndex = 0; childIndex < blocks.length; childIndex += 1) {
    const block = blocks[childIndex];
    if (!block.children?.length) continue;
    const result = indentBlockInLevel(block.children, blockId);
    if (result.changed) {
      return {
        blocks: [
          ...blocks.slice(0, childIndex),
          { ...block, children: result.blocks, updatedAt: new Date().toISOString() },
          ...blocks.slice(childIndex + 1),
        ],
        changed: true,
      };
    }
  }

  return { blocks, changed: false };
}

function outdentFromLevel(
  blocks: KnowledgeBlockV2[],
  blockId: string,
): { blocks: KnowledgeBlockV2[]; lifted: KnowledgeBlockV2 | null } {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const childIndex = block.children?.findIndex((child) => child.id === blockId) ?? -1;

    if (childIndex >= 0 && block.children) {
      const child = block.children[childIndex];
      const nextParent = {
        ...block,
        children: [
          ...block.children.slice(0, childIndex),
          ...block.children.slice(childIndex + 1),
        ],
        updatedAt: new Date().toISOString(),
      };
      return {
        blocks: [
          ...blocks.slice(0, index),
          nextParent,
          child,
          ...blocks.slice(index + 1),
        ],
        lifted: null,
      };
    }

    if (block.children?.length) {
      const result = outdentFromLevel(block.children, blockId);
      if (result.blocks !== block.children) {
        return {
          blocks: [
            ...blocks.slice(0, index),
            { ...block, children: result.blocks, updatedAt: new Date().toISOString() },
            ...blocks.slice(index + 1),
          ],
          lifted: result.lifted,
        };
      }
    }
  }

  return { blocks, lifted: null };
}

function compactRecord<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
