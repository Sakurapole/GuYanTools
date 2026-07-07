import * as fs from 'node:fs/promises';
import { inflateRawSync, inflateSync } from 'node:zlib';

export interface ExtractKnowledgeTextResult {
  text: string;
  status: 'succeeded' | 'failed';
  errorMessage?: string;
  metadata: ExtractKnowledgeTextMetadata;
}

export type KnowledgeDocumentPreviewKind = 'text' | 'pdf' | 'image' | 'slides' | 'sheets' | 'unsupported';

export interface ExtractKnowledgeTextMetadata {
  extractor: string;
  previewKind: KnowledgeDocumentPreviewKind;
  sections?: KnowledgeDocumentPreviewSection[];
  slides?: KnowledgeDocumentPreviewSlide[];
  sheets?: KnowledgeDocumentPreviewSheet[];
  [key: string]: unknown;
}

export interface KnowledgeDocumentPreviewSection {
  index: number;
  label: string;
  text: string;
}

export interface KnowledgeDocumentPreviewSlide {
  index: number;
  title: string;
  text: string;
}

export interface KnowledgeDocumentPreviewSheet {
  index: number;
  name: string;
  rows: string[][];
  text: string;
}

interface ZipEntry {
  name: string;
  compressionMethod: number;
  data: Buffer;
}

interface DocxPreview {
  text: string;
  sections: KnowledgeDocumentPreviewSection[];
}

interface PptxPreview {
  text: string;
  slides: KnowledgeDocumentPreviewSlide[];
}

interface XlsxPreview {
  text: string;
  sheets: KnowledgeDocumentPreviewSheet[];
}

type ExtractKnowledgeTextMetadataInput = Omit<ExtractKnowledgeTextMetadata, 'extractor'> & {
  previewKind: KnowledgeDocumentPreviewKind;
};

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.log',
]);

const MAX_PREVIEW_TEXT_LENGTH = 24000;
const MAX_PREVIEW_ROWS_PER_SHEET = 80;
const MAX_PREVIEW_COLUMNS = 24;

export async function extractKnowledgeText(
  filePath: string,
  extension: string,
  mimeType: string,
): Promise<ExtractKnowledgeTextResult> {
  const normalizedExtension = extension.toLowerCase();
  try {
    if (TEXT_EXTENSIONS.has(normalizedExtension) || mimeType.startsWith('text/')) {
      const raw = await fs.readFile(filePath, 'utf8');
      return succeeded(stripHtml(raw), 'plain-text', { previewKind: 'text' });
    }

    if (normalizedExtension === '.docx') {
      const entries = await readZipEntries(filePath);
      const preview = extractDocx(entries);
      return succeeded(preview.text, 'docx-openxml', {
        previewKind: 'text',
        sections: preview.sections,
      });
    }

    if (normalizedExtension === '.pptx') {
      const entries = await readZipEntries(filePath);
      const preview = extractPptx(entries);
      return succeeded(preview.text, 'pptx-openxml', {
        previewKind: 'slides',
        slides: preview.slides,
      });
    }

    if (normalizedExtension === '.xlsx') {
      const entries = await readZipEntries(filePath);
      const preview = extractXlsx(entries);
      return succeeded(preview.text, 'xlsx-openxml', {
        previewKind: 'sheets',
        sheets: preview.sheets,
      });
    }

    if (normalizedExtension === '.pdf') {
      const bytes = await fs.readFile(filePath);
      return succeeded(extractPdf(bytes), 'pdf-best-effort', { previewKind: 'pdf' });
    }

    if (mimeType.startsWith('image/')) {
      return succeeded('', 'image-metadata', { previewKind: 'image' });
    }

    return {
      text: '',
      status: 'failed',
      errorMessage: `暂不支持从 ${normalizedExtension || '未知格式'} 抽取文本`,
      metadata: { extractor: 'unsupported', previewKind: 'unsupported' },
    };
  } catch (error) {
    return {
      text: '',
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: { extractor: 'failed', previewKind: 'unsupported', extension: normalizedExtension },
    };
  }
}

function succeeded(
  text: string,
  extractor: string,
  metadata: ExtractKnowledgeTextMetadataInput,
): ExtractKnowledgeTextResult {
  return {
    text: normalizeWhitespace(text),
    status: 'succeeded',
    metadata: { extractor, ...metadata },
  };
}

async function readZipEntries(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    throw new Error('未找到 ZIP 中央目录');
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8');

    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = decompressZipEntry(compressed, compressionMethod);

    entries.push({ name, compressionMethod, data });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function decompressZipEntry(data: Buffer, method: number) {
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  return Buffer.alloc(0);
}

function extractDocx(entries: ZipEntry[]): DocxPreview {
  const targets = entries
    .filter((entry) =>
      entry.name === 'word/document.xml'
      || /^word\/(header|footer)\d+\.xml$/u.test(entry.name),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  const sections = targets
    .map((entry, index) => ({
      index: index + 1,
      label: entry.name === 'word/document.xml' ? '正文' : entry.name.replace(/^word\//u, ''),
      text: limitPreviewText(normalizeWhitespace(extractXmlText(entry.data.toString('utf8')))),
    }))
    .filter((section) => section.text);
  return {
    text: sections.map((section) => section.text).join('\n'),
    sections,
  };
}

function extractPptx(entries: ZipEntry[]): PptxPreview {
  const targets = entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/u.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  const slides = targets
    .map((entry, index) => {
      const text = normalizeWhitespace(extractXmlText(entry.data.toString('utf8')));
      return {
        index: index + 1,
        title: firstPreviewLine(text) || `Slide ${index + 1}`,
        text: limitPreviewText(text),
      };
    })
    .filter((slide) => slide.text);
  return {
    text: slides.map((slide) => `Slide ${slide.index}\n${slide.text}`).join('\n'),
    slides,
  };
}

function extractXlsx(entries: ZipEntry[]): XlsxPreview {
  const sharedStrings = entries.find((entry) => entry.name === 'xl/sharedStrings.xml');
  const sharedStringValues = sharedStrings ? extractSharedStrings(sharedStrings.data.toString('utf8')) : [];
  const sheetNames = extractWorkbookSheetNames(entries);
  const sheets = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    .map((entry, index) => {
      const rows = extractWorksheetRows(entry.data.toString('utf8'), sharedStringValues);
      const text = rows.map((row) => row.join('\t')).join('\n');
      return {
        index: index + 1,
        name: sheetNames[index] || `Sheet ${index + 1}`,
        rows,
        text: limitPreviewText(text),
      };
    })
    .filter((sheet) => sheet.rows.length || sheet.text);
  return {
    text: sheets.map((sheet) => `${sheet.name}\n${sheet.text}`).join('\n'),
    sheets,
  };
}

function extractWorkbookSheetNames(entries: ZipEntry[]) {
  const workbook = entries.find((entry) => entry.name === 'xl/workbook.xml');
  if (!workbook) return [];
  const names: string[] = [];
  const xml = workbook.data.toString('utf8');
  const sheetPattern = /<sheet\b[^>]*\bname="([^"]*)"[^>]*>/gu;
  let match: RegExpExecArray | null;
  while ((match = sheetPattern.exec(xml))) {
    names.push(decodeXmlEntities(match[1]));
  }
  return names;
}

function extractSharedStrings(xml: string) {
  const values: string[] = [];
  const itemPattern = /<si\b[\s\S]*?<\/si>/gu;
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(xml))) {
    values.push(normalizeWhitespace(extractXmlText(match[0])));
  }
  return values;
}

function extractWorksheetRows(xml: string, sharedStrings: string[]) {
  const rows: string[][] = [];
  const rowPattern = /<row\b[\s\S]*?<\/row>/gu;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml)) && rows.length < MAX_PREVIEW_ROWS_PER_SHEET) {
    const cells: string[] = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/gu;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[0])) && cells.length < MAX_PREVIEW_COLUMNS) {
      const value = extractWorksheetCellValue(cellMatch[1], cellMatch[2], sharedStrings);
      cells.push(value);
    }
    if (cells.some((cell) => cell.trim())) {
      rows.push(cells);
    }
  }
  return rows;
}

function extractWorksheetCellValue(attributes: string, body: string, sharedStrings: string[]) {
  const typeMatch = attributes.match(/\bt="([^"]+)"/u);
  const type = typeMatch?.[1] ?? '';
  if (type === 'inlineStr') {
    return normalizeWhitespace(extractXmlText(body));
  }

  const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/u);
  if (!valueMatch) {
    return normalizeWhitespace(extractXmlText(body));
  }

  const rawValue = decodeXmlEntities(valueMatch[1]);
  if (type === 's') {
    const sharedIndex = Number.parseInt(rawValue, 10);
    return Number.isFinite(sharedIndex) ? sharedStrings[sharedIndex] ?? '' : '';
  }
  return rawValue;
}

function extractXmlText(xml: string) {
  return decodeXmlEntities(
    xml
      .replace(/<[^>]+>/gu, ' ')
      .replace(/\s+/gu, ' '),
  );
}

function extractPdf(buffer: Buffer) {
  const fragments: string[] = [];
  const latin = buffer.toString('latin1');
  fragments.push(parsePdfTextOperators(latin));

  const streamPattern = /<<(?:.|\n|\r)*?\/FlateDecode(?:.|\n|\r)*?>>\s*stream\r?\n?/gu;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(latin))) {
    const dataStart = match.index + match[0].length;
    const endIndex = latin.indexOf('endstream', dataStart);
    if (endIndex < 0) break;
    const raw = buffer.subarray(dataStart, endIndex);
    try {
      fragments.push(parsePdfTextOperators(inflateSync(raw).toString('latin1')));
    } catch {
      try {
        fragments.push(parsePdfTextOperators(inflateRawSync(raw).toString('latin1')));
      } catch {
        // Best-effort PDF extraction keeps going when one stream is not decodable.
      }
    }
  }

  return fragments.join('\n');
}

function parsePdfTextOperators(content: string) {
  const fragments: string[] = [];
  const stringPattern = /\((?:\\.|[^\\)])*\)\s*Tj|\[(.*?)\]\s*TJ/gsu;
  let match: RegExpExecArray | null;
  while ((match = stringPattern.exec(content))) {
    const token = match[0];
    const literalMatches = token.match(/\((?:\\.|[^\\)])*\)/gsu) ?? [];
    for (const literal of literalMatches) {
      fragments.push(decodePdfLiteral(literal.slice(1, -1)));
    }
  }
  return fragments.join(' ');
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/gu, (_match, escaped: string) => {
      const map: Record<string, string> = {
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
        '(': '(',
        ')': ')',
        '\\': '\\',
      };
      return map[escaped] ?? escaped;
    })
    .replace(/\\([0-7]{1,3})/gu, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function stripHtml(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ');
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'");
}

function normalizeWhitespace(value: string) {
  return value
    .split(String.fromCharCode(0)).join('')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function firstPreviewLine(value: string) {
  return value.split(/\r?\n/u).find((line) => line.trim())?.trim().slice(0, 80) ?? '';
}

function limitPreviewText(value: string) {
  return value.length > MAX_PREVIEW_TEXT_LENGTH
    ? `${value.slice(0, MAX_PREVIEW_TEXT_LENGTH)}\n...`
    : value;
}
