# Knowledge Markdown Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first implementable slice of the knowledge editor architecture: large Markdown performance foundation, virtualized preview, Typora-like WYSIWYG skeleton, and a unified document codec for the existing markdown/block/canvas page types.

**Architecture:** Keep CodeMirror 6 as the Markdown editing engine and move expensive preview/derived-content work into focused utilities. Markdown preview becomes segment-based and virtualized; WYSIWYG becomes viewport-only CodeMirror decorations; save/load conversion moves into a codec layer that preserves the existing `content_markdown` / `content_json` / `content_text` database contract.

**Tech Stack:** Electron + Vue 3 + TypeScript + Pinia + SCSS, CodeMirror 6 (`@codemirror/view`, `@codemirror/state`, `@codemirror/language`, `@codemirror/lang-markdown`), existing `marked`, existing `ts-node` for utility verification scripts.

---

## Scope

This plan implements phases 0-3 from `docs/superpowers/specs/2026-05-30-knowledge-editor-architecture-design.md`:

1. Baseline fixtures and verification.
2. Markdown segmentation and render cache.
3. Virtualized preview.
4. Typora-like WYSIWYG skeleton.
5. Unified document codec for current page types.

This plan intentionally does not implement Block Editor V2, Canvas Editor V2, or cross-mode conversion UX. Those are separate plans because they can be developed and verified independently.

## File Structure

Create:

- `desktop/src/windows/main/pages/Knowledge/utils/markdown_segmenter.ts`
  - Pure TypeScript Markdown block segmentation, stable segment ids, line/offset mapping, and hash calculation.

- `desktop/src/windows/main/pages/Knowledge/utils/markdown_render_cache.ts`
  - Pure TypeScript segment render cache around existing `marked` rendering and sanitizer callback.

- `desktop/src/windows/main/pages/Knowledge/utils/markdown_sanitize.ts`
  - Move the existing HTML sanitize, asset URL normalization, callout decoration, and safe link handling out of `KnowledgeMarkdownEditor.vue`.

- `desktop/src/windows/main/pages/Knowledge/composables/useMarkdownSegmentedPreview.ts`
  - Vue composable for segment list, rendered segment cache, estimated heights, measured heights, visible range calculation, and scroll anchor mapping.

- `desktop/src/windows/main/pages/Knowledge/composables/useMarkdownWysiwygDecorations.ts`
  - CodeMirror ViewPlugin factory for viewport-only WYSIWYG decorations.

- `desktop/src/windows/main/pages/Knowledge/components/markdown/MarkdownPreviewVirtualList.vue`
  - Virtualized preview renderer for split and preview modes.

- `desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts`
  - Page detail to draft envelopes and save payload derivation for markdown/block/canvas.

- `desktop/scripts/verify-knowledge-editor-foundation.cjs`
  - No-new-dependency verification script using existing `ts-node`.

Modify:

- `desktop/package.json`
  - Add `verify:knowledge-editor` script.

- `desktop/src/windows/main/pages/Knowledge/components/KnowledgeMarkdownEditor.vue`
  - Replace full-document preview computed with segmented preview component.
  - Add `wysiwyg` editor mode.
  - Use extracted sanitizer.

- `desktop/src/windows/main/stores/knowledge_store.ts`
  - Use `knowledge_document_codec.ts` for sync and save payloads.

Test/verify:

- `pnpm --dir desktop run verify:knowledge-editor`
- `pnpm --dir desktop run lint`
- `pnpm --dir desktop run build:renderer`
- Manual Electron smoke test for 1k, 10k, 50k, and 100k line Markdown pages.

## Task 1: Add Markdown Segmentation Utility

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/utils/markdown_segmenter.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`
- Modify: `desktop/package.json`

- [ ] **Step 1: Create the failing verification script**

Create `desktop/scripts/verify-knowledge-editor-foundation.cjs` with this content:

```js
const assert = require('node:assert/strict');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    target: 'ES2020',
    module: 'CommonJS',
    moduleResolution: 'node',
    allowImportingTsExtensions: true,
  },
});

const {
  segmentMarkdown,
  findSegmentByLine,
  hashMarkdownSegmentSource,
} = require('../src/windows/main/pages/Knowledge/utils/markdown_segmenter.ts');

function testSegmenterKeepsFencedCodeTogether() {
  const source = [
    '# Title',
    '',
    'Before',
    '',
    '```ts',
    'const value = 1;',
    '```',
    '',
    '- item',
    '- item 2',
  ].join('\n');

  const segments = segmentMarkdown(source);
  const code = segments.find((segment) => segment.type === 'code_fence');

  assert.ok(code, 'expected code fence segment');
  assert.equal(code.startLine, 5);
  assert.equal(code.endLine, 7);
  assert.equal(code.source, '```ts\nconst value = 1;\n```');
}

function testSegmenterFindsLineAnchors() {
  const source = ['# A', '', 'Paragraph', '', '## B'].join('\n');
  const segments = segmentMarkdown(source);
  const segment = findSegmentByLine(segments, 5);

  assert.ok(segment, 'expected segment on line 5');
  assert.equal(segment.type, 'heading');
  assert.equal(segment.source, '## B');
}

function testSegmentHashIsStable() {
  assert.equal(
    hashMarkdownSegmentSource('same text'),
    hashMarkdownSegmentSource('same text'),
  );
  assert.notEqual(
    hashMarkdownSegmentSource('same text'),
    hashMarkdownSegmentSource('changed text'),
  );
}

testSegmenterKeepsFencedCodeTogether();
testSegmenterFindsLineAnchors();
testSegmentHashIsStable();

console.log('knowledge editor foundation checks passed');
```

- [ ] **Step 2: Add the verification npm script**

Modify `desktop/package.json` and add this script next to the existing lint scripts:

```json
"verify:knowledge-editor": "node scripts/verify-knowledge-editor-foundation.cjs"
```

Keep the existing scripts unchanged.

- [ ] **Step 3: Run the verification and confirm it fails for the right reason**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected:

```text
Cannot find module '../src/windows/main/pages/Knowledge/utils/markdown_segmenter.ts'
```

- [ ] **Step 4: Implement `markdown_segmenter.ts`**

Create `desktop/src/windows/main/pages/Knowledge/utils/markdown_segmenter.ts`:

```ts
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

type LineRecord = {
  text: string;
  line: number;
  startOffset: number;
  endOffset: number;
};

export function segmentMarkdown(source: string): MarkdownSegment[] {
  const lines = toLineRecords(source);
  const segments: MarkdownSegment[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.text.trim()) {
      index = pushSegment(segments, lines, index, index, 'blank');
      continue;
    }

    if (isCodeFenceStart(line.text)) {
      const end = findCodeFenceEnd(lines, index);
      index = pushSegment(segments, lines, index, end, 'code_fence');
      continue;
    }

    if (isHeading(line.text)) {
      index = pushSegment(segments, lines, index, index, 'heading');
      continue;
    }

    if (isTableLine(line.text) && index + 1 < lines.length && isTableDivider(lines[index + 1].text)) {
      let end = index + 1;
      while (end + 1 < lines.length && isTableLine(lines[end + 1].text)) {
        end += 1;
      }
      index = pushSegment(segments, lines, index, end, 'table');
      continue;
    }

    if (isListLine(line.text)) {
      let end = index;
      while (end + 1 < lines.length && (isListLine(lines[end + 1].text) || isIndentedContinuation(lines[end + 1].text))) {
        end += 1;
      }
      index = pushSegment(segments, lines, index, end, 'list');
      continue;
    }

    if (isBlockquoteLine(line.text)) {
      let end = index;
      while (end + 1 < lines.length && isBlockquoteLine(lines[end + 1].text)) {
        end += 1;
      }
      index = pushSegment(segments, lines, index, end, 'blockquote');
      continue;
    }

    if (isHtmlBlockStart(line.text)) {
      let end = index;
      while (end + 1 < lines.length && lines[end + 1].text.trim()) {
        end += 1;
      }
      index = pushSegment(segments, lines, index, end, 'html');
      continue;
    }

    let end = index;
    while (
      end + 1 < lines.length
      && lines[end + 1].text.trim()
      && !isHeading(lines[end + 1].text)
      && !isCodeFenceStart(lines[end + 1].text)
      && !isListLine(lines[end + 1].text)
      && !isBlockquoteLine(lines[end + 1].text)
    ) {
      end += 1;
    }
    index = pushSegment(segments, lines, index, end, 'paragraph');
  }

  return segments.filter((segment) => segment.type !== 'blank');
}

export function findSegmentByLine(segments: MarkdownSegment[], line: number) {
  return segments.find((segment) => line >= segment.startLine && line <= segment.endLine) ?? null;
}

export function hashMarkdownSegmentSource(source: string) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function toLineRecords(source: string): LineRecord[] {
  const normalized = source.replace(/\r\n/g, '\n');
  const rawLines = normalized.split('\n');
  let offset = 0;
  return rawLines.map((text, index) => {
    const startOffset = offset;
    const endOffset = startOffset + text.length;
    offset = endOffset + 1;
    return {
      text,
      line: index + 1,
      startOffset,
      endOffset,
    };
  });
}

function pushSegment(
  segments: MarkdownSegment[],
  lines: LineRecord[],
  startIndex: number,
  endIndex: number,
  type: MarkdownSegmentType,
) {
  const start = lines[startIndex];
  const end = lines[endIndex];
  const source = lines.slice(startIndex, endIndex + 1).map((line) => line.text).join('\n');
  const hash = hashMarkdownSegmentSource(source);
  segments.push({
    id: `${start.line}-${end.line}-${hash}`,
    type,
    startLine: start.line,
    endLine: end.line,
    startOffset: start.startOffset,
    endOffset: end.endOffset,
    source,
    hash,
  });
  return endIndex + 1;
}

function isCodeFenceStart(line: string) {
  return /^\s*(```|~~~)/u.test(line);
}

function findCodeFenceEnd(lines: LineRecord[], startIndex: number) {
  const marker = lines[startIndex].text.trimStart().startsWith('~~~') ? '~~~' : '```';
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].text.trimStart().startsWith(marker)) {
      return index;
    }
  }
  return lines.length - 1;
}

function isHeading(line: string) {
  return /^\s{0,3}#{1,6}\s+\S/u.test(line);
}

function isTableLine(line: string) {
  return /\|/u.test(line.trim());
}

function isTableDivider(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
}

function isListLine(line: string) {
  return /^\s{0,6}([-*+]|\d+[.)])\s+/u.test(line);
}

function isIndentedContinuation(line: string) {
  return /^\s{2,}\S/u.test(line);
}

function isBlockquoteLine(line: string) {
  return /^\s{0,3}>/u.test(line);
}

function isHtmlBlockStart(line: string) {
  return /^\s{0,3}<\/?[A-Za-z][^>]*>\s*$/u.test(line);
}
```

- [ ] **Step 5: Run the verification and confirm it passes**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected:

```text
knowledge editor foundation checks passed
```

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add desktop/package.json desktop/scripts/verify-knowledge-editor-foundation.cjs desktop/src/windows/main/pages/Knowledge/utils/markdown_segmenter.ts
git commit -m "test(knowledge): lock markdown segmentation boundaries" -m "Add a no-dependency verification script and the first pure utility for segmenting large Markdown documents without scanning through the renderer component."
```

## Task 2: Extract Markdown Sanitizer and Segment Render Cache

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/utils/markdown_sanitize.ts`
- Create: `desktop/src/windows/main/pages/Knowledge/utils/markdown_render_cache.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`

- [ ] **Step 1: Extend the verification script for rendering and sanitizing**

Append this code before the final `console.log` in `desktop/scripts/verify-knowledge-editor-foundation.cjs`:

```js
const { createMarkdownRenderCache } = require('../src/windows/main/pages/Knowledge/utils/markdown_render_cache.ts');
const { sanitizeKnowledgeMarkdownHtml } = require('../src/windows/main/pages/Knowledge/utils/markdown_sanitize.ts');

function testSanitizerRemovesUnsafeHtml() {
  const sanitized = sanitizeKnowledgeMarkdownHtml('<p>ok</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a>');

  assert.equal(sanitized.includes('<script'), false);
  assert.equal(sanitized.includes('javascript:'), false);
  assert.equal(sanitized.includes('<p>ok</p>'), true);
}

function testRenderCacheReusesSegmentHtml() {
  let renderCount = 0;
  const cache = createMarkdownRenderCache({
    renderMarkdown: (source) => {
      renderCount += 1;
      return `<p>${source}</p>`;
    },
    sanitizeHtml: (html) => html,
  });

  const segment = segmentMarkdown('hello')[0];
  assert.equal(cache.render(segment).html, '<p>hello</p>');
  assert.equal(cache.render(segment).html, '<p>hello</p>');
  assert.equal(renderCount, 1);
}

testSanitizerRemovesUnsafeHtml();
testRenderCacheReusesSegmentHtml();
```

- [ ] **Step 2: Run the verification and confirm it fails for missing modules**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected:

```text
Cannot find module '../src/windows/main/pages/Knowledge/utils/markdown_render_cache.ts'
```

- [ ] **Step 3: Create `markdown_sanitize.ts`**

Create `desktop/src/windows/main/pages/Knowledge/utils/markdown_sanitize.ts`:

```ts
export function sanitizeKnowledgeMarkdownHtml(html: string) {
  if (typeof DOMParser === 'undefined') {
    return sanitizeHtmlWithoutDom(html);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc
    .querySelectorAll('script, style, iframe, object, embed, link, meta, base, form, input, button, textarea, select, option')
    .forEach((node) => node.remove());

  doc.body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const normalizedValue = normalizeKnowledgeAssetReference(attribute.value.trim());
      if (normalizedValue !== attribute.value) {
        element.setAttribute(attribute.name, normalizedValue);
      }
      const value = normalizedValue.toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        return;
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^(javascript|vbscript|data:text\/html):/u.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });

    if (element.tagName.toLowerCase() === 'a') {
      element.setAttribute('rel', 'noreferrer noopener');
    }
  });

  decorateCallouts(doc);
  return doc.body.innerHTML;
}

export function normalizeKnowledgeAssetReference(value: string) {
  if (!value.toLowerCase().startsWith('file://')) return value;

  try {
    const url = new URL(value);
    const decodedPath = decodeURIComponent(url.pathname);
    const storagePath = decodedPath.replace(/^\/([a-zA-Z]:\/)/u, '$1');
    if (!/[\\/]knowledge-assets[\\/]/iu.test(storagePath)) return value;
    return `app://knowledge-assets/path/${encodeURIComponent(storagePath)}`;
  } catch {
    return value;
  }
}

function sanitizeHtmlWithoutDom(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
    .replace(/\s+on[a-z]+\s*=\s*(['"]).*?\1/giu, '')
    .replace(/\s+(href|src|xlink:href)\s*=\s*(['"])\s*(javascript|vbscript|data:text\/html):.*?\2/giu, '');
}

function decorateCallouts(doc: Document) {
  const labels: Record<string, string> = {
    note: 'NOTE',
    tip: 'TIP',
    important: 'IMPORTANT',
    warning: 'WARNING',
    caution: 'CAUTION',
    info: 'INFO',
    todo: 'TODO',
    question: 'QUESTION',
    example: 'EXAMPLE',
    quote: 'QUOTE',
  };

  doc.body.querySelectorAll('blockquote').forEach((quote) => {
    const firstParagraph = quote.querySelector('p');
    const html = firstParagraph?.innerHTML ?? '';
    const match = /^\s*\[!([A-Za-z]+)\]\s*([^<\n]*)/iu.exec(html);
    if (!firstParagraph || !match) return;

    const type = match[1].toLowerCase();
    const title = match[2].replace(/<[^>]+>/gu, '').trim();
    quote.classList.add('knowledge-md-callout', `knowledge-md-callout--${type}`);

    const header = doc.createElement('div');
    header.className = 'knowledge-md-callout__title';
    header.textContent = title ? `${labels[type] ?? type.toUpperCase()} · ${title}` : labels[type] ?? type.toUpperCase();
    quote.insertBefore(header, quote.firstChild);

    const bodyHtml = html
      .replace(/^\s*\[![A-Za-z]+\]\s*[^<\n]*(<br\s*\/?>)?/iu, '')
      .trim();
    if (bodyHtml) {
      firstParagraph.innerHTML = bodyHtml;
    } else {
      firstParagraph.remove();
    }
  });
}
```

- [ ] **Step 4: Create `markdown_render_cache.ts`**

Create `desktop/src/windows/main/pages/Knowledge/utils/markdown_render_cache.ts`:

```ts
import type { MarkdownSegment } from './markdown_segmenter';

export interface RenderedMarkdownSegment {
  segmentId: string;
  hash: string;
  html: string;
}

export interface MarkdownRenderCacheOptions {
  renderMarkdown: (source: string) => string;
  sanitizeHtml: (html: string) => string;
  rendererVersion?: string;
}

export function createMarkdownRenderCache(options: MarkdownRenderCacheOptions) {
  const rendererVersion = options.rendererVersion ?? 'v1';
  const cache = new Map<string, RenderedMarkdownSegment>();

  function cacheKey(segment: MarkdownSegment) {
    return `${rendererVersion}:${segment.id}:${segment.hash}`;
  }

  return {
    render(segment: MarkdownSegment): RenderedMarkdownSegment {
      const key = cacheKey(segment);
      const cached = cache.get(key);
      if (cached) return cached;

      const html = options.sanitizeHtml(options.renderMarkdown(segment.source));
      const rendered = {
        segmentId: segment.id,
        hash: segment.hash,
        html,
      };
      cache.set(key, rendered);
      return rendered;
    },
    invalidate(segmentIds: Iterable<string>) {
      const ids = new Set(segmentIds);
      [...cache.keys()].forEach((key) => {
        if ([...ids].some((id) => key.includes(`:${id}:`))) {
          cache.delete(key);
        }
      });
    },
    clear() {
      cache.clear();
    },
    size() {
      return cache.size;
    },
  };
}
```

- [ ] **Step 5: Run verification**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected:

```text
knowledge editor foundation checks passed
```

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add desktop/scripts/verify-knowledge-editor-foundation.cjs desktop/src/windows/main/pages/Knowledge/utils/markdown_sanitize.ts desktop/src/windows/main/pages/Knowledge/utils/markdown_render_cache.ts
git commit -m "feat(knowledge): cache sanitized markdown preview segments" -m "Move Markdown preview safety and segment rendering into focused utilities so large documents can avoid full-page rerendering."
```

## Task 3: Add Segmented Preview Composable and Virtual List

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/composables/useMarkdownSegmentedPreview.ts`
- Create: `desktop/src/windows/main/pages/Knowledge/components/markdown/MarkdownPreviewVirtualList.vue`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeMarkdownEditor.vue`

- [ ] **Step 1: Create the segmented preview composable**

Create `desktop/src/windows/main/pages/Knowledge/composables/useMarkdownSegmentedPreview.ts`:

```ts
import { computed, ref, shallowRef, watch, type Ref } from 'vue';
import { marked } from 'marked';
import { createMarkdownRenderCache } from '../utils/markdown_render_cache';
import { segmentMarkdown, type MarkdownSegment } from '../utils/markdown_segmenter';
import { sanitizeKnowledgeMarkdownHtml } from '../utils/markdown_sanitize';

export interface VisibleMarkdownSegment {
  segment: MarkdownSegment;
  html: string;
  top: number;
  height: number;
}

const DEFAULT_SEGMENT_HEIGHT = 96;
const OVERSCAN_PX = 800;

export function useMarkdownSegmentedPreview(markdown: Ref<string>) {
  const scrollTop = ref(0);
  const viewportHeight = ref(0);
  const measuredHeights = shallowRef(new Map<string, number>());
  const renderCache = createMarkdownRenderCache({
    renderMarkdown: (source) => marked.parse(source, { async: false, breaks: false, gfm: true }) as string,
    sanitizeHtml: sanitizeKnowledgeMarkdownHtml,
  });

  const segments = computed(() => segmentMarkdown(markdown.value));

  const totalHeight = computed(() =>
    segments.value.reduce((height, segment) => height + segmentHeight(segment), 0),
  );

  const visibleSegments = computed<VisibleMarkdownSegment[]>(() => {
    const start = Math.max(0, scrollTop.value - OVERSCAN_PX);
    const end = scrollTop.value + viewportHeight.value + OVERSCAN_PX;
    const visible: VisibleMarkdownSegment[] = [];
    let top = 0;

    for (const segment of segments.value) {
      const height = segmentHeight(segment);
      const bottom = top + height;
      if (bottom >= start && top <= end) {
        visible.push({
          segment,
          html: renderCache.render(segment).html,
          top,
          height,
        });
      }
      top = bottom;
    }

    return visible;
  });

  watch(markdown, () => {
    renderCache.clear();
  });

  function setViewport(nextScrollTop: number, nextViewportHeight: number) {
    scrollTop.value = nextScrollTop;
    viewportHeight.value = nextViewportHeight;
  }

  function measureSegment(segmentId: string, height: number) {
    const next = new Map(measuredHeights.value);
    next.set(segmentId, Math.max(32, Math.ceil(height)));
    measuredHeights.value = next;
  }

  function segmentHeight(segment: MarkdownSegment) {
    return measuredHeights.value.get(segment.id) ?? estimateSegmentHeight(segment);
  }

  return {
    segments,
    visibleSegments,
    totalHeight,
    setViewport,
    measureSegment,
  };
}

function estimateSegmentHeight(segment: MarkdownSegment) {
  if (segment.type === 'heading') return 64;
  if (segment.type === 'code_fence') return Math.min(420, 52 + segment.source.split('\n').length * 20);
  if (segment.type === 'table') return Math.min(520, 64 + segment.source.split('\n').length * 34);
  if (segment.type === 'list') return Math.min(420, 32 + segment.source.split('\n').length * 28);
  return Math.max(DEFAULT_SEGMENT_HEIGHT, Math.min(360, 32 + segment.source.length / 2));
}
```

- [ ] **Step 2: Create the virtual preview component**

Create `desktop/src/windows/main/pages/Knowledge/components/markdown/MarkdownPreviewVirtualList.vue`:

```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMarkdownSegmentedPreview } from '../../composables/useMarkdownSegmentedPreview';

const props = defineProps<{
  markdown: string;
}>();

const emit = defineEmits<{
  (event: 'preview-click', value: MouseEvent): void;
}>();

const scrollHost = ref<HTMLElement | null>(null);
const segmentRefs = new Map<string, HTMLElement>();
const preview = useMarkdownSegmentedPreview(refFromProp());
let resizeObserver: ResizeObserver | null = null;

function refFromProp() {
  return {
    get value() {
      return props.markdown;
    },
  };
}

function updateViewport() {
  const host = scrollHost.value;
  if (!host) return;
  preview.setViewport(host.scrollTop, host.clientHeight);
}

function setSegmentRef(segmentId: string, element: Element | null) {
  if (element instanceof HTMLElement) {
    segmentRefs.set(segmentId, element);
    resizeObserver?.observe(element);
    preview.measureSegment(segmentId, element.getBoundingClientRect().height);
  } else {
    const previous = segmentRefs.get(segmentId);
    if (previous) resizeObserver?.unobserve(previous);
    segmentRefs.delete(segmentId);
  }
}

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const id = (entry.target as HTMLElement).dataset.segmentId;
      if (id) preview.measureSegment(id, entry.contentRect.height);
    });
  });
  nextTick(updateViewport);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  segmentRefs.clear();
});

watch(
  () => props.markdown,
  () => nextTick(updateViewport),
);
</script>

<template>
  <div ref="scrollHost" class="markdown-preview-virtual-list" @scroll="updateViewport" @click="emit('preview-click', $event)">
    <div class="markdown-preview-virtual-list__spacer" :style="{ height: `${preview.totalHeight.value}px` }">
      <article
        v-for="item in preview.visibleSegments.value"
        :key="item.segment.id"
        :ref="(element) => setSegmentRef(item.segment.id, element)"
        class="markdown-preview-virtual-list__segment markdown-body"
        :data-segment-id="item.segment.id"
        :data-segment-type="item.segment.type"
        :style="{ transform: `translateY(${item.top}px)` }"
        v-html="item.html"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.markdown-preview-virtual-list {
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.markdown-preview-virtual-list__spacer {
  position: relative;
  min-height: 100%;
}

.markdown-preview-virtual-list__segment {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  max-width: 920px;
  padding: 18px 28px;
  color: var(--ui-text-primary);
  line-height: 1.72;
  will-change: transform;
}
</style>
```

- [ ] **Step 3: Replace the preview article in `KnowledgeMarkdownEditor.vue`**

In `desktop/src/windows/main/pages/Knowledge/components/KnowledgeMarkdownEditor.vue`:

1. Add this import:

```ts
import MarkdownPreviewVirtualList from './markdown/MarkdownPreviewVirtualList.vue';
```

2. Replace:

```vue
<article class="knowledge-markdown-editor__preview markdown-body" v-html="previewHtml" />
```

with:

```vue
<MarkdownPreviewVirtualList
  class="knowledge-markdown-editor__preview"
  :markdown="previewSource"
  @preview-click="handlePreviewClick"
/>
```

3. Keep `previewHtml` temporarily only for export functions. Rename it to `exportPreviewHtml` if that makes the component clearer.

- [ ] **Step 4: Run renderer build**

Run:

```bash
pnpm --dir desktop run build:renderer
```

Expected:

```text
✓ built
```

- [ ] **Step 5: Run verification script**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected:

```text
knowledge editor foundation checks passed
```

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add desktop/src/windows/main/pages/Knowledge/components/KnowledgeMarkdownEditor.vue desktop/src/windows/main/pages/Knowledge/components/markdown/MarkdownPreviewVirtualList.vue desktop/src/windows/main/pages/Knowledge/composables/useMarkdownSegmentedPreview.ts
git commit -m "feat(knowledge): virtualize markdown preview rendering" -m "Render Markdown preview by measured segments instead of mounting one full-document HTML tree."
```

## Task 4: Add WYSIWYG Mode Skeleton with Viewport Decorations

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/composables/useMarkdownWysiwygDecorations.ts`
- Modify: `desktop/src/windows/main/pages/Knowledge/components/KnowledgeMarkdownEditor.vue`

- [ ] **Step 1: Create the WYSIWYG decoration extension**

Create `desktop/src/windows/main/pages/Knowledge/composables/useMarkdownWysiwygDecorations.ts`:

```ts
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const headingMark = Decoration.mark({ class: 'cm-md-wysiwyg-heading' });
const hiddenToken = Decoration.replace({ inclusive: false });
const strongMark = Decoration.mark({ class: 'cm-md-wysiwyg-strong' });
const emphasisMark = Decoration.mark({ class: 'cm-md-wysiwyg-emphasis' });
const inlineCodeMark = Decoration.mark({ class: 'cm-md-wysiwyg-inline-code' });

export function markdownWysiwygDecorations(enabled: () => boolean) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = enabled() ? buildDecorations(view) : Decoration.none;
      }

      update(update: ViewUpdate) {
        if (!enabled()) {
          this.decorations = Decoration.none;
          return;
        }
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}

function buildDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;

  view.visibleRanges.forEach((range) => {
    let position = range.from;
    while (position <= range.to) {
      const line = view.state.doc.lineAt(position);
      if (line.number !== activeLine) {
        decorateLine(view, builder, line.from, line.to, line.text);
      }
      if (line.to >= range.to) break;
      position = line.to + 1;
    }
  });

  return builder.finish();
}

function decorateLine(
  view: EditorView,
  builder: RangeSetBuilder<Decoration>,
  lineFrom: number,
  lineTo: number,
  text: string,
) {
  const heading = /^(#{1,6})(\s+)/u.exec(text);
  if (heading) {
    builder.add(lineFrom, lineFrom + heading[1].length + heading[2].length, hiddenToken);
    builder.add(lineFrom, lineTo, headingMark);
  }

  addDelimitedInline(builder, lineFrom, text, /\*\*([^*]+)\*\*/gu, 2, strongMark);
  addDelimitedInline(builder, lineFrom, text, /\*([^*\n]+)\*/gu, 1, emphasisMark);
  addDelimitedInline(builder, lineFrom, text, /`([^`\n]+)`/gu, 1, inlineCodeMark);

  const task = /^(\s*[-*]\s+\[)( |x|X)(\]\s+)/u.exec(text);
  if (task) {
    const from = lineFrom + task[1].length;
    builder.add(from, from + 1, Decoration.widget({
      widget: new TaskCheckboxWidget(task[2].toLowerCase() === 'x'),
      side: 0,
    }));
  }
}

function addDelimitedInline(
  builder: RangeSetBuilder<Decoration>,
  lineFrom: number,
  text: string,
  pattern: RegExp,
  delimiterLength: number,
  mark: Decoration,
) {
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const from = lineFrom + match.index;
    const to = from + match[0].length;
    builder.add(from, from + delimiterLength, hiddenToken);
    builder.add(to - delimiterLength, to, hiddenToken);
    builder.add(from + delimiterLength, to - delimiterLength, mark);
  }
}

class TaskCheckboxWidget {
  constructor(private readonly checked: boolean) {}

  toDOM() {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.className = 'cm-md-wysiwyg-task';
    input.tabIndex = -1;
    return input;
  }

  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked;
  }

  ignoreEvent() {
    return false;
  }
}
```

- [ ] **Step 2: Add `wysiwyg` to the editor mode type**

In `KnowledgeMarkdownEditor.vue`, change:

```ts
type EditorMode = 'edit' | 'split' | 'preview';
```

to:

```ts
type EditorMode = 'edit' | 'split' | 'preview' | 'wysiwyg';
```

- [ ] **Step 3: Add WYSIWYG extension to the CodeMirror extension list**

Add this import:

```ts
import { markdownWysiwygDecorations } from '../composables/useMarkdownWysiwygDecorations';
```

In the `new EditorView` extension list, add:

```ts
markdownWysiwygDecorations(() => mode.value === 'wysiwyg'),
```

- [ ] **Step 4: Add toolbar button**

In the segmented mode controls, add a button next to edit/split/preview:

```vue
<UiIconButton size="sm" :active="mode === 'wysiwyg'" :aria-pressed="mode === 'wysiwyg'" title="所见即所得" @click="mode = 'wysiwyg'">
  <IconRenderer icon="iconify:lucide:eye" :size="15" />
</UiIconButton>
```

- [ ] **Step 5: Add WYSIWYG styles**

Append to the component scoped style:

```scss
:deep(.cm-md-wysiwyg-heading) {
  color: var(--ui-text-primary);
  font-weight: 760;
}

:deep(.cm-md-wysiwyg-strong) {
  font-weight: 760;
}

:deep(.cm-md-wysiwyg-emphasis) {
  font-style: italic;
}

:deep(.cm-md-wysiwyg-inline-code) {
  border-radius: 4px;
  padding: 0.08em 0.28em;
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 82%, transparent);
  font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace);
}

:deep(.cm-md-wysiwyg-task) {
  width: 14px;
  height: 14px;
  margin: 0 2px;
  vertical-align: -2px;
}
```

- [ ] **Step 6: Run renderer build**

Run:

```bash
pnpm --dir desktop run build:renderer
```

Expected:

```text
✓ built
```

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add desktop/src/windows/main/pages/Knowledge/components/KnowledgeMarkdownEditor.vue desktop/src/windows/main/pages/Knowledge/composables/useMarkdownWysiwygDecorations.ts
git commit -m "feat(knowledge): add markdown wysiwyg mode skeleton" -m "Use viewport-only CodeMirror decorations to make common Markdown syntax read visually while preserving source text as storage."
```

## Task 5: Extract Knowledge Document Codec

**Files:**
- Create: `desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts`
- Modify: `desktop/scripts/verify-knowledge-editor-foundation.cjs`
- Modify: `desktop/src/windows/main/stores/knowledge_store.ts`

- [ ] **Step 1: Extend verification for codec behavior**

Append this code before the final `console.log` in `desktop/scripts/verify-knowledge-editor-foundation.cjs`:

```js
const {
  createMarkdownSavePayload,
  createBlockSavePayload,
  createCanvasSavePayload,
} = require('../src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts');
const { createDefaultBlockDocument } = require('../src/windows/main/utils/knowledge_blocks.ts');
const { createDefaultCanvasDocument } = require('../src/windows/main/utils/knowledge_canvas.ts');

function testMarkdownPayloadKeepsMarkdownAsText() {
  const payload = createMarkdownSavePayload('# Title');

  assert.equal(payload.contentMarkdown, '# Title');
  assert.equal(payload.contentText, '# Title');
}

function testBlockPayloadDerivesSearchText() {
  const document = createDefaultBlockDocument('Block title');
  const payload = createBlockSavePayload(document, undefined);

  assert.equal(typeof payload.contentJson, 'string');
  assert.equal(payload.contentMarkdown.includes('Block title'), true);
  assert.equal(payload.contentText.includes('Block title'), true);
}

function testCanvasPayloadDerivesSearchText() {
  const document = createDefaultCanvasDocument('Canvas title');
  const payload = createCanvasSavePayload(document, undefined);

  assert.equal(typeof payload.contentJson, 'string');
  assert.equal(payload.contentMarkdown.includes('Canvas title'), true);
  assert.equal(payload.contentText.includes('Canvas title'), true);
}

testMarkdownPayloadKeepsMarkdownAsText();
testBlockPayloadDerivesSearchText();
testCanvasPayloadDerivesSearchText();
```

- [ ] **Step 2: Run verification and confirm missing codec failure**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
```

Expected:

```text
Cannot find module '../src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts'
```

- [ ] **Step 3: Implement codec**

Create `desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts`:

```ts
import type { KnowledgeBlockDocument, KnowledgeCanvasDocument, UpdateKnowledgePagePayload } from '../../../../../contracts/knowledge';
import {
  blockDocumentToMarkdown,
  blockDocumentToPlainText,
  serializeBlockDocument,
} from '../../../utils/knowledge_blocks';
import {
  canvasDocumentToMarkdown,
  canvasDocumentToPlainText,
  serializeCanvasDocument,
} from '../../../utils/knowledge_canvas';

export function createMarkdownSavePayload(markdown: string): UpdateKnowledgePagePayload {
  return {
    contentMarkdown: markdown,
    contentText: markdown,
  };
}

export function createBlockSavePayload(
  document: KnowledgeBlockDocument,
  existingPropertiesJson?: string,
): UpdateKnowledgePagePayload {
  return {
    contentJson: serializeBlockDocument(document),
    contentText: blockDocumentToPlainText(document),
    contentMarkdown: blockDocumentToMarkdown(document),
    propertiesJson: existingPropertiesJson || JSON.stringify({
      editor: 'guyantools-block-editor',
      schema: 'guyantools.block-page',
      schemaVersion: 1,
    }),
  };
}

export function createCanvasSavePayload(
  document: KnowledgeCanvasDocument,
  existingPropertiesJson?: string,
): UpdateKnowledgePagePayload {
  return {
    contentJson: serializeCanvasDocument(document),
    contentText: canvasDocumentToPlainText(document),
    contentMarkdown: canvasDocumentToMarkdown(document),
    propertiesJson: existingPropertiesJson || JSON.stringify({
      editor: 'guyantools-canvas-editor',
      schema: 'guyantools.canvas-page',
      schemaVersion: 1,
    }),
  };
}
```

- [ ] **Step 4: Replace store payload helpers**

In `desktop/src/windows/main/stores/knowledge_store.ts`:

1. Add import:

```ts
import {
  createBlockSavePayload,
  createCanvasSavePayload,
  createMarkdownSavePayload,
} from '@/windows/main/pages/Knowledge/utils/knowledge_document_codec';
```

2. In `saveMarkdownDraft`, replace:

```ts
const page = await api().updatePage(selectedPage.value.node.id, {
  contentMarkdown: markdownDraft.value,
  contentText: markdownDraft.value,
});
```

with:

```ts
const page = await api().updatePage(selectedPage.value.node.id, createMarkdownSavePayload(markdownDraft.value));
```

3. Replace `blockDraftSavePayload()` body with:

```ts
return createBlockSavePayload(blockDraft.value, selectedPage.value?.page.propertiesJson);
```

4. Replace `canvasDraftSavePayload()` body with:

```ts
return createCanvasSavePayload(canvasDraft.value, selectedPage.value?.page.propertiesJson);
```

- [ ] **Step 5: Run verification and build**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop run build:renderer
```

Expected:

```text
knowledge editor foundation checks passed
✓ built
```

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add desktop/scripts/verify-knowledge-editor-foundation.cjs desktop/src/windows/main/pages/Knowledge/utils/knowledge_document_codec.ts desktop/src/windows/main/stores/knowledge_store.ts
git commit -m "refactor(knowledge): centralize page save payload derivation" -m "Move Markdown, block, and canvas save payload derivation into a codec utility so future schema upgrades have one integration point."
```

## Task 6: Performance Fixture and Manual Verification Pass

**Files:**
- Create: `desktop/scripts/create-knowledge-large-markdown-fixture.cjs`
- Modify: `docs/superpowers/specs/2026-05-30-knowledge-editor-architecture-design.md`

- [ ] **Step 1: Add fixture generator**

Create `desktop/scripts/create-knowledge-large-markdown-fixture.cjs`:

```js
const fs = require('node:fs');
const path = require('node:path');

const lineCount = Number(process.argv[2] || 10000);
const output = process.argv[3] || path.resolve(__dirname, '..', 'tmp', `knowledge-large-${lineCount}.md`);

fs.mkdirSync(path.dirname(output), { recursive: true });

const lines = [];
for (let index = 1; index <= lineCount; index += 1) {
  if (index % 200 === 1) {
    lines.push(`# Section ${Math.ceil(index / 200)}`);
  } else if (index % 37 === 0) {
    lines.push(`- [${index % 74 === 0 ? 'x' : ' '}] Task line ${index} with [[Page ${index % 50}]]`);
  } else if (index % 53 === 0) {
    lines.push('```ts');
    lines.push(`const line${index} = ${index};`);
    lines.push('```');
  } else if (index % 89 === 0) {
    lines.push(`> [!NOTE] Callout ${index}`);
    lines.push(`> This callout tests blockquote grouping for line ${index}.`);
  } else {
    lines.push(`Paragraph line ${index} with **bold text**, *emphasis*, \`code\`, and [link](https://example.com/${index}).`);
  }
}

fs.writeFileSync(output, lines.join('\n'), 'utf8');
console.log(output);
```

- [ ] **Step 2: Generate fixtures**

Run:

```bash
node desktop/scripts/create-knowledge-large-markdown-fixture.cjs 10000
node desktop/scripts/create-knowledge-large-markdown-fixture.cjs 50000
node desktop/scripts/create-knowledge-large-markdown-fixture.cjs 100000
```

Expected:

```text
D:\LaityHCode\DesktopProjects\GuYanTools\desktop\tmp\knowledge-large-10000.md
D:\LaityHCode\DesktopProjects\GuYanTools\desktop\tmp\knowledge-large-50000.md
D:\LaityHCode\DesktopProjects\GuYanTools\desktop\tmp\knowledge-large-100000.md
```

- [ ] **Step 3: Run automated verification**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop run lint
pnpm --dir desktop run build:renderer
```

Expected:

```text
knowledge editor foundation checks passed
```

`lint` and `build:renderer` must exit with code 0.

- [ ] **Step 4: Manually smoke test the desktop renderer**

Run:

```bash
pnpm run desktop:start
```

Manual checks:

1. Open Knowledge page.
2. Create or import a Markdown page.
3. Paste content from `desktop/tmp/knowledge-large-10000.md`.
4. Switch source, split, preview, and WYSIWYG modes.
5. Repeat with 50k and 100k fixtures if the app remains responsive.
6. Confirm typing in the first, middle, and end of the document remains responsive.
7. Confirm preview scroll does not create a full-document DOM.

Record the observed result in the final implementation report. Do not commit files under `desktop/tmp`.

- [ ] **Step 5: Update design spec implementation status**

Append this short status note under the phase 0-3 section of `docs/superpowers/specs/2026-05-30-knowledge-editor-architecture-design.md`:

```markdown
Implementation note: Phase 0-3 are covered by `docs/superpowers/plans/2026-05-30-knowledge-markdown-foundation-plan.md`.
```

- [ ] **Step 6: Commit Task 6**

Run:

```bash
git add desktop/scripts/create-knowledge-large-markdown-fixture.cjs docs/superpowers/specs/2026-05-30-knowledge-editor-architecture-design.md
git commit -m "test(knowledge): add large markdown fixture generator" -m "Provide repeatable local fixtures for checking Markdown editor responsiveness at ten-thousand to hundred-thousand line scale."
```

## Final Verification

- [ ] **Step 1: Check git status for unrelated changes**

Run:

```bash
git status --short
```

Expected:

```text
Only files changed by these tasks are staged or committed; unrelated pre-existing workspace changes remain untouched.
```

- [ ] **Step 2: Run final automated checks**

Run:

```bash
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop run lint
pnpm --dir desktop run build:renderer
```

Expected:

```text
knowledge editor foundation checks passed
```

`lint` and `build:renderer` must exit with code 0.

- [ ] **Step 3: Write final implementation summary**

Report:

1. Commits created.
2. Files changed.
3. Performance fixture sizes tested.
4. Verification commands and outcomes.
5. Any WYSIWYG limitations intentionally deferred to later plans.

## Follow-Up Plans

After this plan is complete, create separate implementation plans for:

1. `Knowledge Block Editor V2 Implementation Plan`
   - `KnowledgeBlockDocumentV2`
   - slash menu
   - nested blocks
   - block handle
   - optional Tiptap spike

2. `Knowledge Canvas Editor V2 Implementation Plan`
   - `KnowledgeCanvasDocumentV2`
   - pan/zoom
   - multi-select
   - inline text editing
   - screenshot annotation

3. `Knowledge Cross-Mode Conversion Implementation Plan`
   - Markdown -> Block copy
   - Block -> Markdown export
   - Markdown/Block -> Canvas cards
   - conversion provenance and lossiness warnings
