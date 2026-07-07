import type { KnowledgeInlineContent, KnowledgeInlineMark, KnowledgeInlineMarkType } from '@/windows/main/utils/knowledge_blocks_v2';

const markOrder: KnowledgeInlineMarkType[] = ['bold', 'italic', 'strike', 'code'];

export function inlineContentToEditableHtml(content: KnowledgeInlineContent[]): string {
  const normalized = normalizeInlineTextNodes(content);
  if (!normalized.length) return '';

  return normalized.map((item) => {
    let html = escapeHtml(item.text).replace(/\r\n|\r|\n/g, '<br>');
    const marks = normalizeMarkTypes(item.marks);
    for (const mark of [...markOrder].reverse()) {
      if (marks.includes(mark)) {
        html = wrapMarkHtml(mark, html);
      }
    }
    return html;
  }).join('');
}

export function editableHtmlToInlineContent(html: string): KnowledgeInlineContent[] {
  const content: KnowledgeInlineContent[] = [];
  const stack: KnowledgeInlineMarkType[] = [];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?[^>]+>|[^<]+/g;
  const tokens = html.match(tokenPattern) ?? [];

  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith('<!--')) continue;

    if (token.startsWith('<')) {
      const tag = parseTagName(token);
      if (!tag) continue;

      if (isLineBreakTag(tag, token)) {
        pushText(content, '\n', stack);
        continue;
      }

      const mark = tagToMark(tag);
      if (!mark) continue;

      if (token.startsWith('</')) {
        const index = stack.lastIndexOf(mark);
        if (index >= 0) stack.splice(index, 1);
      } else if (!token.endsWith('/>')) {
        stack.push(mark);
      }
      continue;
    }

    pushText(content, decodeHtml(token), stack);
  }

  return normalizeInlineTextNodes(content);
}

export function inlineContentToPlainText(content: KnowledgeInlineContent[]): string {
  return content.map((item) => item.text).join('');
}

export function normalizeInlineTextNodes(content: KnowledgeInlineContent[]): KnowledgeInlineContent[] {
  const normalized: KnowledgeInlineContent[] = [];

  for (const item of content) {
    if (!item.text) continue;
    const marks = normalizeMarks(item.marks);
    const previous = normalized[normalized.length - 1];
    if (previous && sameMarks(previous.marks, marks)) {
      previous.text += item.text;
      continue;
    }
    normalized.push({
      type: 'text',
      text: item.text,
      ...(marks ? { marks } : {}),
    });
  }

  return normalized;
}

function pushText(content: KnowledgeInlineContent[], text: string, activeMarks: KnowledgeInlineMarkType[]) {
  if (!text) return;
  const marks = normalizeMarks(activeMarks.map((type) => ({ type })));
  content.push({
    type: 'text',
    text,
    ...(marks ? { marks } : {}),
  });
}

function normalizeMarks(marks?: KnowledgeInlineMark[]): KnowledgeInlineMark[] | undefined {
  const types = normalizeMarkTypes(marks);
  return types.length ? types.map((type) => ({ type })) : undefined;
}

function normalizeMarkTypes(marks?: KnowledgeInlineMark[]) {
  if (!marks?.length) return [];
  return markOrder.filter((type) => marks.some((mark) => mark.type === type));
}

function sameMarks(left?: KnowledgeInlineMark[], right?: KnowledgeInlineMark[]) {
  const leftTypes = normalizeMarkTypes(left);
  const rightTypes = normalizeMarkTypes(right);
  if (leftTypes.length !== rightTypes.length) return false;
  return leftTypes.every((type, index) => type === rightTypes[index]);
}

function wrapMarkHtml(mark: KnowledgeInlineMarkType, html: string) {
  if (mark === 'bold') return `<strong>${html}</strong>`;
  if (mark === 'italic') return `<em>${html}</em>`;
  if (mark === 'strike') return `<s>${html}</s>`;
  return `<code>${html}</code>`;
}

function tagToMark(tag: string): KnowledgeInlineMarkType | null {
  if (tag === 'strong' || tag === 'b') return 'bold';
  if (tag === 'em' || tag === 'i') return 'italic';
  if (tag === 's' || tag === 'strike' || tag === 'del') return 'strike';
  if (tag === 'code') return 'code';
  return null;
}

function parseTagName(token: string) {
  const match = token.match(/^<\/?\s*([a-z0-9-]+)/i);
  return match?.[1]?.toLowerCase() ?? '';
}

function isLineBreakTag(tag: string, token: string) {
  return tag === 'br'
    || (tag === 'div' && token.startsWith('</'))
    || (tag === 'p' && token.startsWith('</'));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
