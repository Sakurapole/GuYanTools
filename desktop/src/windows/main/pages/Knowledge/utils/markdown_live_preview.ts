type MarkdownLivePreviewInlineTokenBase = {
  syntaxFrom?: number;
  syntaxTo?: number;
};

export type MarkdownLivePreviewInlineToken = MarkdownLivePreviewInlineTokenBase & (
  | { kind: 'heading-marker'; from: number; to: number; level: number }
  | { kind: 'task-marker'; from: number; to: number; checked: boolean }
  | { kind: 'inline-code-marker'; from: number; to: number }
  | { kind: 'inline-code'; from: number; to: number }
  | { kind: 'strong-emphasis-marker'; from: number; to: number }
  | { kind: 'strong-emphasis'; from: number; to: number }
  | { kind: 'strong-marker'; from: number; to: number }
  | { kind: 'strong'; from: number; to: number }
  | { kind: 'emphasis-marker'; from: number; to: number }
  | { kind: 'emphasis'; from: number; to: number }
  | { kind: 'strikethrough-marker'; from: number; to: number }
  | { kind: 'strikethrough'; from: number; to: number }
  | { kind: 'highlight-marker'; from: number; to: number }
  | { kind: 'highlight'; from: number; to: number }
  | { kind: 'formula-inline'; from: number; to: number; body: string }
  | { kind: 'link'; from: number; to: number; label: string; href: string }
  | { kind: 'wiki-link'; from: number; to: number; target: string; label: string }
  | { kind: 'asset-embed'; from: number; to: number; target: string }
  | { kind: 'comment'; from: number; to: number }
);

export type MarkdownLivePreviewBlockKind =
  | 'frontmatter'
  | 'callout'
  | 'table'
  | 'math'
  | 'mermaid'
  | 'code_fence'
  | 'blockquote'
  | 'list';

export type MarkdownLivePreviewRange = { from: number; to: number };

export type MarkdownLivePreviewBlockToken = MarkdownLivePreviewRange & {
  kind: MarkdownLivePreviewBlockKind;
  source: string;
  startLine: number;
  endLine: number;
  body?: string;
  language?: string;
};

export type MarkdownTableAlignment = 'left' | 'center' | 'right' | 'none';

export type MarkdownCalloutType =
  | 'note'
  | 'tip'
  | 'important'
  | 'warning'
  | 'caution'
  | 'danger'
  | 'info'
  | 'todo'
  | 'question'
  | 'example'
  | 'quote';

export type ParsedMarkdownCallout = {
  type: MarkdownCalloutType;
  rawType: string;
  title: string;
  body: string;
};

type LineEntry = {
  text: string;
  startOffset: number;
  endOffset: number;
};

export type ParsedMarkdownTable = {
  rows: string[][];
  alignments: MarkdownTableAlignment[];
};

const headingPattern = /^(#{1,6})([ \t]+)/;
const taskPattern = /^(\s*)([-*+])\s+\[([ xX])\](?:[ \t]+)?/;
const fencePattern = /^ {0,3}(`{3,}|~{3,})([^`]*)$/;
const tableDividerPattern = /^ {0,3}\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const listPattern = /^ {0,3}(?:[-+*]|\d{1,9}[.)])\s+/;
const blockquotePattern = /^ {0,3}>\s?/;
const calloutPattern = /^ {0,3}>\s*\\?\[![A-Za-z]+\]/;
const supportedCalloutTypes: MarkdownCalloutType[] = [
  'note',
  'tip',
  'important',
  'warning',
  'caution',
  'danger',
  'info',
  'todo',
  'question',
  'example',
  'quote',
];

function overlapsRange(from: number, to: number, ranges: MarkdownLivePreviewRange[]) {
  return ranges.some((range) => from < range.to && to > range.from);
}

function pushTokenRange(occupied: MarkdownLivePreviewRange[], from: number, to: number) {
  occupied.push({ from, to });
}

function pushDelimitedToken(
  tokens: MarkdownLivePreviewInlineToken[],
  occupied: MarkdownLivePreviewRange[],
  kind: 'inline-code' | 'strong-emphasis' | 'strong' | 'emphasis' | 'strikethrough' | 'highlight',
  start: number,
  delimiterLength: number,
  fullLength: number,
) {
  const contentStart = start + delimiterLength;
  const contentEnd = start + fullLength - delimiterLength;
  if (contentStart >= contentEnd || overlapsRange(start, start + fullLength, occupied)) return;

  pushTokenRange(occupied, start, start + fullLength);
  const markerKind = `${kind}-marker` as Extract<MarkdownLivePreviewInlineToken['kind'], `${string}-marker`>;
  const syntaxFrom = start;
  const syntaxTo = start + fullLength;
  tokens.push(
    { kind: markerKind, from: start, to: contentStart, syntaxFrom, syntaxTo } as MarkdownLivePreviewInlineToken,
    { kind, from: contentStart, to: contentEnd, syntaxFrom, syntaxTo } as MarkdownLivePreviewInlineToken,
    { kind: markerKind, from: contentEnd, to: start + fullLength, syntaxFrom, syntaxTo } as MarkdownLivePreviewInlineToken,
  );
}

function collectDelimitedTokens(
  text: string,
  tokens: MarkdownLivePreviewInlineToken[],
  occupied: MarkdownLivePreviewRange[],
) {
  const patterns: Array<{
    kind: 'inline-code' | 'strong-emphasis' | 'strong' | 'emphasis' | 'strikethrough' | 'highlight';
    pattern: RegExp;
    delimiterLength: number;
    prefixGroup?: boolean;
  }> = [
    { kind: 'inline-code', pattern: /`([^`\n]+)`/g, delimiterLength: 1 },
    { kind: 'strong-emphasis', pattern: /\*\*\*([^*\n]+)\*\*\*/g, delimiterLength: 3 },
    { kind: 'strong-emphasis', pattern: /___([^_\n]+)___/g, delimiterLength: 3 },
    { kind: 'strong', pattern: /\*\*([^*\n]+)\*\*/g, delimiterLength: 2 },
    { kind: 'strong', pattern: /__([^_\n]+)__/g, delimiterLength: 2 },
    { kind: 'strikethrough', pattern: /~~([^~\n]+)~~/g, delimiterLength: 2 },
    { kind: 'highlight', pattern: /==([^=\n]+)==/g, delimiterLength: 2 },
    { kind: 'emphasis', pattern: /(^|[^*])\*([^*\n]+)\*(?!\*)/g, delimiterLength: 1, prefixGroup: true },
    { kind: 'emphasis', pattern: /(^|[^\w_])_([^_\n]+)_(?![\w_])/g, delimiterLength: 1, prefixGroup: true },
  ];

  for (const item of patterns) {
    for (const match of text.matchAll(item.pattern)) {
      const full = match[0];
      const prefixLength = item.prefixGroup ? match[1].length : 0;
      const start = (match.index ?? 0) + prefixLength;
      const fullLength = full.length - prefixLength;
      pushDelimitedToken(tokens, occupied, item.kind, start, item.delimiterLength, fullLength);
    }
  }
}

function collectFormulaTokens(
  text: string,
  tokens: MarkdownLivePreviewInlineToken[],
  occupied: MarkdownLivePreviewRange[],
) {
  const formulaPattern = /(^|[\s([>])\$([^$\n]+?)\$(?=[$\s,.;:!?)]|$)/g;
  for (const match of text.matchAll(formulaPattern)) {
    const full = match[0];
    const prefixLength = match[1].length;
    const from = (match.index ?? 0) + prefixLength;
    const to = (match.index ?? 0) + full.length;
    const body = match[2].trim();
    if (!body || overlapsRange(from, to, occupied)) continue;

    pushTokenRange(occupied, from, to);
    tokens.push({ kind: 'formula-inline', from, to, body });
  }
}

function collectLinkTokens(
  text: string,
  tokens: MarkdownLivePreviewInlineToken[],
  occupied: MarkdownLivePreviewRange[],
) {
  const assetPattern = /!\[\[([^\]\n]+)\]\]/g;
  for (const match of text.matchAll(assetPattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (overlapsRange(from, to, occupied)) continue;
    pushTokenRange(occupied, from, to);
    tokens.push({ kind: 'asset-embed', from, to, target: match[1].trim() });
  }

  const wikiPattern = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
  for (const match of text.matchAll(wikiPattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (overlapsRange(from, to, occupied)) continue;
    const target = match[1].trim();
    const label = (match[2] ?? match[1]).trim();
    pushTokenRange(occupied, from, to);
    tokens.push({ kind: 'wiki-link', from, to, target, label });
  }

  const linkPattern = /!?\[([^\]\n]+)\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g;
  for (const match of text.matchAll(linkPattern)) {
    if (match[0].startsWith('!')) continue;
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (overlapsRange(from, to, occupied)) continue;
    pushTokenRange(occupied, from, to);
    tokens.push({ kind: 'link', from, to, label: match[1].trim(), href: match[2].trim() });
  }
}

function collectCommentTokens(
  text: string,
  tokens: MarkdownLivePreviewInlineToken[],
  occupied: MarkdownLivePreviewRange[],
) {
  const commentPattern = /%%([^%\n]|%(?!%))*%%/g;
  for (const match of text.matchAll(commentPattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (overlapsRange(from, to, occupied)) continue;
    pushTokenRange(occupied, from, to);
    tokens.push({ kind: 'comment', from, to });
  }
}

function normalizeMarkdownCalloutType(type: string): MarkdownCalloutType {
  const normalized = type.trim().toLowerCase();
  return supportedCalloutTypes.includes(normalized as MarkdownCalloutType)
    ? normalized as MarkdownCalloutType
    : 'note';
}

export function parseMarkdownCalloutSource(source: string): ParsedMarkdownCallout | null {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const firstLine = lines[0] ?? '';
  const match = /^ {0,3}>\s*\\?\[!([A-Za-z]+)\]\s*(.*?)\s*$/.exec(firstLine);
  if (!match) return null;

  const body = lines.slice(1)
    .map((line) => line.replace(/^ {0,3}>\s?/, ''))
    .join('\n')
    .trim();

  return {
    type: normalizeMarkdownCalloutType(match[1]),
    rawType: match[1].toUpperCase(),
    title: match[2].trim(),
    body,
  };
}

export function setMarkdownCalloutType(source: string, type: MarkdownCalloutType): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const firstLine = lines[0] ?? '';
  const nextType = type.toUpperCase();
  const nextFirstLine = firstLine.replace(
    /^( {0,3}>\s*)\\?\[![A-Za-z]+\]/,
    `$1[!${nextType}]`,
  );
  return [nextFirstLine, ...lines.slice(1)].join('\n');
}

export function collectMarkdownLivePreviewInlineTokens(text: string): MarkdownLivePreviewInlineToken[] {
  const tokens: MarkdownLivePreviewInlineToken[] = [];
  const occupied: MarkdownLivePreviewRange[] = [];

  const heading = headingPattern.exec(text);
  if (heading) {
    tokens.push({ kind: 'heading-marker', from: 0, to: heading[0].length, level: heading[1].length });
    pushTokenRange(occupied, 0, heading[0].length);
  }

  const task = taskPattern.exec(text);
  if (task) {
    const from = task[1].length;
    const to = task[0].length;
    tokens.push({ kind: 'task-marker', from, to, checked: task[3].toLowerCase() === 'x' });
    pushTokenRange(occupied, from, to);
  }

  collectDelimitedTokens(text, tokens, occupied);
  collectFormulaTokens(text, tokens, occupied);
  collectLinkTokens(text, tokens, occupied);
  collectCommentTokens(text, tokens, occupied);

  return tokens.sort((left, right) => left.from - right.from || left.to - right.to);
}

export function isMarkdownLivePreviewRangeActive(
  range: MarkdownLivePreviewRange,
  activeRanges: MarkdownLivePreviewRange[],
) {
  return activeRanges.some((activeRange) => (
    activeRange.from === activeRange.to
      ? range.from <= activeRange.from && activeRange.from <= range.to
      : range.from < activeRange.to && range.to > activeRange.from
  ));
}

export function isMarkdownLivePreviewLineActive(
  line: MarkdownLivePreviewRange,
  activeRanges: MarkdownLivePreviewRange[],
) {
  return activeRanges.some((activeRange) => (
    activeRange.from === activeRange.to
      ? line.from <= activeRange.from && activeRange.from <= line.to
      : line.from < activeRange.to && line.to > activeRange.from
  ));
}

export function collectMarkdownLivePreviewBlockTokens(source: string): MarkdownLivePreviewBlockToken[] {
  const lines = getLineEntries(source);
  const tokens: MarkdownLivePreviewBlockToken[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].text;

    if (index === 0 && line.trim() === '---') {
      const endIndex = findFrontmatterEnd(lines);
      if (endIndex > 0) {
        tokens.push(createBlockToken('frontmatter', lines, index, endIndex));
        index = endIndex + 1;
        continue;
      }
    }

    const fence = fencePattern.exec(line);
    if (fence) {
      const marker = fence[1][0] as '`' | '~';
      const length = fence[1].length;
      const language = fence[2].trim().split(/\s+/)[0] || '';
      const endIndex = findClosingFence(lines, index + 1, marker, length);
      const kind = language.toLowerCase() === 'mermaid' ? 'mermaid' : 'code_fence';
      const token = createBlockToken(kind, lines, index, endIndex);
      token.language = language;
      token.body = lines.slice(index + 1, endIndex).map((entry) => entry.text).join('\n').trim();
      tokens.push(token);
      index = endIndex + 1;
      continue;
    }

    if (/^ {0,3}\$\$\s*$/.test(line)) {
      const endIndex = findMathBlockEnd(lines, index + 1);
      const token = createBlockToken('math', lines, index, endIndex);
      token.body = lines.slice(index + 1, endIndex).map((entry) => entry.text).join('\n').trim();
      tokens.push(token);
      index = endIndex + 1;
      continue;
    }

    if (calloutPattern.test(line)) {
      const endIndex = findConsecutiveEnd(lines, index + 1, (entry) => blockquotePattern.test(entry.text));
      tokens.push(createBlockToken('callout', lines, index, endIndex));
      index = endIndex + 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const endIndex = findTableEnd(lines, index + 2);
      tokens.push(createBlockToken('table', lines, index, endIndex));
      index = endIndex + 1;
      continue;
    }

    if (listPattern.test(line)) {
      const endIndex = findConsecutiveEnd(lines, index + 1, (entry) =>
        listPattern.test(entry.text) || /^ {2,}\S/.test(entry.text) || entry.text.trim() === '',
      );
      tokens.push(createBlockToken('list', lines, index, endIndex));
      index = endIndex + 1;
      continue;
    }

    if (blockquotePattern.test(line)) {
      const endIndex = findConsecutiveEnd(lines, index + 1, (entry) => blockquotePattern.test(entry.text));
      tokens.push(createBlockToken('blockquote', lines, index, endIndex));
      index = endIndex + 1;
      continue;
    }

    index += 1;
  }

  return tokens;
}

export function insertMarkdownTableRow(source: string, rowIndex?: number) {
  const table = parseMarkdownTable(source);
  const width = Math.max(...table.rows.map((row) => row.length), table.alignments.length, 1);
  const nextRows = table.rows.map((row) => normalizeRow(row, width));
  const insertAt = rowIndex === undefined
    ? nextRows.length
    : Math.max(1, Math.min(nextRows.length, rowIndex));
  nextRows.splice(insertAt, 0, Array.from({ length: width }, () => ''));
  return serializeMarkdownTable({ rows: nextRows, alignments: normalizeAlignments(table.alignments, width) });
}

export function insertMarkdownTableColumn(source: string, columnIndex?: number) {
  const table = parseMarkdownTable(source);
  const width = Math.max(...table.rows.map((row) => row.length), table.alignments.length, 1);
  const insertAt = columnIndex === undefined
    ? width
    : Math.max(0, Math.min(width, columnIndex));
  const nextRows = table.rows.map((row) => {
    const nextRow = normalizeRow(row, width);
    nextRow.splice(insertAt, 0, '');
    return nextRow;
  });
  const alignments = normalizeAlignments(table.alignments, width);
  alignments.splice(insertAt, 0, 'none');
  return serializeMarkdownTable({ rows: nextRows, alignments });
}

export function setMarkdownTableAlignment(
  source: string,
  columnIndex: number,
  alignment: MarkdownTableAlignment,
) {
  const table = parseMarkdownTable(source);
  const width = Math.max(...table.rows.map((row) => row.length), table.alignments.length, columnIndex + 1);
  const rows = table.rows.map((row) => normalizeRow(row, width));
  const alignments = normalizeAlignments(table.alignments, width);
  alignments[columnIndex] = alignment;
  return serializeMarkdownTable({ rows, alignments });
}

export function updateMarkdownTableCell(
  source: string,
  rowIndex: number,
  columnIndex: number,
  value: string,
) {
  const table = parseMarkdownTable(source);
  const width = Math.max(...table.rows.map((row) => row.length), table.alignments.length, columnIndex + 1, 1);
  const height = Math.max(table.rows.length, rowIndex + 1, 1);
  const rows = Array.from({ length: height }, (_item, index) => normalizeRow(table.rows[index] ?? [], width));
  rows[rowIndex][columnIndex] = escapeMarkdownTableCell(value);
  return serializeMarkdownTable({ rows, alignments: normalizeAlignments(table.alignments, width) });
}

function getLineEntries(source: string): LineEntry[] {
  const entries: LineEntry[] = [];
  let startOffset = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character !== '\r' && character !== '\n') continue;
    entries.push({
      text: source.slice(startOffset, index),
      startOffset,
      endOffset: index,
    });
    if (character === '\r' && source[index + 1] === '\n') index += 1;
    startOffset = index + 1;
  }
  entries.push({
    text: source.slice(startOffset),
    startOffset,
    endOffset: source.length,
  });
  return entries;
}

function createBlockToken(
  kind: MarkdownLivePreviewBlockKind,
  lines: LineEntry[],
  startIndex: number,
  endIndex: number,
): MarkdownLivePreviewBlockToken {
  return {
    kind,
    from: lines[startIndex].startOffset,
    to: lines[endIndex].endOffset,
    startLine: startIndex + 1,
    endLine: endIndex + 1,
    source: lines.slice(startIndex, endIndex + 1).map((entry) => entry.text).join('\n'),
  };
}

function findFrontmatterEnd(lines: LineEntry[]) {
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].text.trim() === '---') return index;
  }
  return -1;
}

function findClosingFence(lines: LineEntry[], startIndex: number, marker: '`' | '~', length: number) {
  const closingPattern = new RegExp(`^ {0,3}\\${marker}{${length},}\\s*$`);
  for (let index = startIndex; index < lines.length; index += 1) {
    if (closingPattern.test(lines[index].text)) return index;
  }
  return lines.length - 1;
}

function findMathBlockEnd(lines: LineEntry[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (/^ {0,3}\$\$\s*$/.test(lines[index].text)) return index;
  }
  return lines.length - 1;
}

function findConsecutiveEnd(
  lines: LineEntry[],
  startIndex: number,
  predicate: (entry: LineEntry) => boolean,
) {
  let endIndex = startIndex - 1;
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!predicate(lines[index])) break;
    endIndex = index;
  }
  return endIndex;
}

function isTableStart(lines: LineEntry[], index: number) {
  return Boolean(lines[index + 1]) && isTableRow(lines[index].text) && tableDividerPattern.test(lines[index + 1].text);
}

function isTableRow(line: string) {
  return hasUnescapedPipe(line) && line.trim().length > 0;
}

function findTableEnd(lines: LineEntry[], startIndex: number) {
  let endIndex = startIndex - 1;
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].text;
    if (!isTableRow(line) || listPattern.test(line) || blockquotePattern.test(line) || fencePattern.test(line)) break;
    endIndex = index;
  }
  return endIndex;
}

function hasUnescapedPipe(line: string) {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== '|') continue;
    let slashCount = 0;
    for (let previous = index - 1; previous >= 0 && line[previous] === '\\'; previous -= 1) {
      slashCount += 1;
    }
    if (slashCount % 2 === 0) return true;
  }
  return false;
}

export function parseMarkdownTable(source: string): ParsedMarkdownTable {
  const lines = source.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return { rows: [['']], alignments: ['none'] };
  }
  const header = splitMarkdownTableRow(lines[0]);
  const alignments = splitMarkdownTableRow(lines[1]).map(parseAlignment);
  const body = lines.slice(2).map(splitMarkdownTableRow);
  return { rows: [header, ...body], alignments };
}

function splitMarkdownTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === '|' && !isEscaped(trimmed, index)) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}

function isEscaped(value: string, index: number) {
  let slashCount = 0;
  for (let previous = index - 1; previous >= 0 && value[previous] === '\\'; previous -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function parseAlignment(value: string): MarkdownTableAlignment {
  const normalized = value.trim();
  const starts = normalized.startsWith(':');
  const ends = normalized.endsWith(':');
  if (starts && ends) return 'center';
  if (ends) return 'right';
  if (starts) return 'left';
  return 'none';
}

function serializeMarkdownTable(table: ParsedMarkdownTable) {
  const width = Math.max(...table.rows.map((row) => row.length), table.alignments.length, 1);
  const rows = table.rows.map((row) => normalizeRow(row, width));
  const alignments = normalizeAlignments(table.alignments, width);
  const [header, ...body] = rows;
  return [
    serializeMarkdownTableRow(header),
    serializeMarkdownTableRow(alignments.map(serializeAlignment)),
    ...body.map(serializeMarkdownTableRow),
  ].join('\n');
}

function serializeMarkdownTableRow(row: string[]) {
  return `| ${row.join(' | ')} |`;
}

function escapeMarkdownTableCell(value: string) {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[^\\])\|/g, '$1\\|');
}

function serializeAlignment(alignment: MarkdownTableAlignment) {
  if (alignment === 'left') return ':---';
  if (alignment === 'center') return ':---:';
  if (alignment === 'right') return '---:';
  return '---';
}

function normalizeRow(row: string[], width: number) {
  return Array.from({ length: width }, (_item, index) => row[index] ?? '');
}

function normalizeAlignments(alignments: MarkdownTableAlignment[], width: number) {
  return Array.from({ length: width }, (_item, index) => alignments[index] ?? 'none');
}
