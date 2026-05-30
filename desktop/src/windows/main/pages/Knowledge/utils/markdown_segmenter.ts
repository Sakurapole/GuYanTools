export type MarkdownSegmentType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'blockquote'
  | 'code_fence'
  | 'table'
  | 'html'
  | 'blank';

export interface MarkdownSegment {
  id: string;
  type: MarkdownSegmentType;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  source: string;
  hash: string;
}

interface LineEntry {
  text: string;
  startOffset: number;
  endOffset: number;
}

const headingPattern = /^ {0,3}#{1,6}\s/;
const blockquotePattern = /^ {0,3}>\s?/;
const unorderedListPattern = /^ {0,3}[-+*]\s+/;
const orderedListPattern = /^ {0,3}\d{1,9}[.)]\s+/;
const htmlPattern = /^ {0,3}<\/?[A-Za-z][^>]*>\s*$/;
const tableDividerPattern = /^ {0,3}\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

export function segmentMarkdown(source: string): MarkdownSegment[] {
  const lines = getLineEntries(source);
  const segments: MarkdownSegment[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].text;

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    const codeFence = getOpeningFence(line);
    if (codeFence) {
      const endIndex = findClosingFence(lines, index + 1, codeFence);
      segments.push(createSegment('code_fence', lines, index, endIndex));
      index = endIndex + 1;
      continue;
    }

    if (headingPattern.test(line)) {
      segments.push(createSegment('heading', lines, index, index));
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const endIndex = findTableEnd(lines, index + 2);
      segments.push(createSegment('table', lines, index, endIndex));
      index = endIndex + 1;
      continue;
    }

    if (isListLine(line)) {
      const endIndex = findListEnd(lines, index + 1);
      segments.push(createSegment('list', lines, index, endIndex));
      index = endIndex + 1;
      continue;
    }

    if (blockquotePattern.test(line)) {
      const endIndex = findConsecutiveEnd(lines, index + 1, (entry) =>
        blockquotePattern.test(entry.text),
      );
      segments.push(createSegment('blockquote', lines, index, endIndex));
      index = endIndex + 1;
      continue;
    }

    if (htmlPattern.test(line)) {
      const endIndex = findConsecutiveEnd(lines, index + 1, (entry) =>
        htmlPattern.test(entry.text),
      );
      segments.push(createSegment('html', lines, index, endIndex));
      index = endIndex + 1;
      continue;
    }

    const endIndex = findParagraphEnd(lines, index + 1);
    segments.push(createSegment('paragraph', lines, index, endIndex));
    index = endIndex + 1;
  }

  return segments;
}

export function findSegmentByLine(
  segments: MarkdownSegment[],
  line: number,
): MarkdownSegment | null {
  return segments.find((segment) => segment.startLine <= line && line <= segment.endLine) ?? null;
}

export function hashMarkdownSegmentSource(source: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36).padStart(7, '0');
}

function getLineEntries(source: string): LineEntry[] {
  const entries: LineEntry[] = [];
  let lineStartOffset = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (character !== '\r' && character !== '\n') {
      continue;
    }

    entries.push({
      text: source.slice(lineStartOffset, index),
      startOffset: lineStartOffset,
      endOffset: index,
    });

    if (character === '\r' && source[index + 1] === '\n') {
      index += 1;
    }

    lineStartOffset = index + 1;
  }

  entries.push({
    text: source.slice(lineStartOffset),
    startOffset: lineStartOffset,
    endOffset: source.length,
  });

  return entries;
}

function createSegment(
  type: MarkdownSegmentType,
  lines: LineEntry[],
  startIndex: number,
  endIndex: number,
): MarkdownSegment {
  const startOffset = lines[startIndex].startOffset;
  const endOffset = lines[endIndex].endOffset;
  const segmentSource = lines
    .slice(startIndex, endIndex + 1)
    .map((line) => line.text)
    .join('\n');
  const hash = hashMarkdownSegmentSource(segmentSource);
  const startLine = startIndex + 1;
  const endLine = endIndex + 1;

  return {
    id: `${startLine}-${endLine}-${hash}`,
    type,
    startLine,
    endLine,
    startOffset,
    endOffset,
    source: segmentSource,
    hash,
  };
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function getOpeningFence(line: string): { marker: '`' | '~'; length: number } | null {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);

  if (!match) {
    return null;
  }

  const fence = match[1];
  return {
    marker: fence[0] as '`' | '~',
    length: fence.length,
  };
}

function findClosingFence(
  lines: LineEntry[],
  startIndex: number,
  openingFence: { marker: '`' | '~'; length: number },
): number {
  const pattern = new RegExp(`^ {0,3}\\${openingFence.marker}{${openingFence.length},}\\s*$`);

  for (let index = startIndex; index < lines.length; index += 1) {
    if (pattern.test(lines[index].text)) {
      return index;
    }
  }

  return lines.length - 1;
}

function isTableStart(lines: LineEntry[], index: number): boolean {
  const nextLine = lines[index + 1]?.text;

  return isTableRow(lines[index].text) && nextLine !== undefined && tableDividerPattern.test(nextLine);
}

function isTableRow(line: string): boolean {
  return line.includes('|') && !isBlank(line);
}

function findTableEnd(lines: LineEntry[], startIndex: number): number {
  let endIndex = startIndex - 1;

  for (let index = startIndex; index < lines.length; index += 1) {
    if (!isTableRow(lines[index].text)) {
      break;
    }

    endIndex = index;
  }

  return endIndex;
}

function isListLine(line: string): boolean {
  return unorderedListPattern.test(line) || orderedListPattern.test(line);
}

function isIndentedContinuation(line: string): boolean {
  return /^ {2,}\S/.test(line) || /^\t+\S/.test(line);
}

function findListEnd(lines: LineEntry[], startIndex: number): number {
  let endIndex = startIndex - 1;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].text;

    if (isListLine(line) || isIndentedContinuation(line)) {
      endIndex = index;
      continue;
    }

    if (isBlank(line)) {
      let nextIndex = index + 1;

      while (nextIndex < lines.length && isBlank(lines[nextIndex].text)) {
        nextIndex += 1;
      }

      if (
        nextIndex < lines.length &&
        (isListLine(lines[nextIndex].text) || isIndentedContinuation(lines[nextIndex].text))
      ) {
        endIndex = nextIndex - 1;
        index = nextIndex - 1;
        continue;
      }
    }

    break;
  }

  return endIndex;
}

function findConsecutiveEnd(
  lines: LineEntry[],
  startIndex: number,
  predicate: (entry: LineEntry) => boolean,
): number {
  let endIndex = startIndex - 1;

  for (let index = startIndex; index < lines.length; index += 1) {
    if (!predicate(lines[index])) {
      break;
    }

    endIndex = index;
  }

  return endIndex;
}

function findParagraphEnd(lines: LineEntry[], startIndex: number): number {
  let endIndex = startIndex - 1;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].text;

    if (
      isBlank(line) ||
      getOpeningFence(line) ||
      headingPattern.test(line) ||
      isTableStart(lines, index) ||
      isListLine(line) ||
      blockquotePattern.test(line) ||
      htmlPattern.test(line)
    ) {
      break;
    }

    endIndex = index;
  }

  return endIndex;
}
