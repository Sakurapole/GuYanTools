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

const {
  sanitizeKnowledgeMarkdownHtml,
} = require('../src/windows/main/pages/Knowledge/utils/markdown_sanitize.ts');

const {
  createMarkdownRenderCache,
} = require('../src/windows/main/pages/Knowledge/utils/markdown_render_cache.ts');

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

function testSegmenterKeepsOriginalOffsetsForCrLf() {
  const segments = segmentMarkdown('# A\r\nB');
  const paragraph = segments.find((segment) => segment.type === 'paragraph');

  assert.ok(paragraph, 'expected paragraph segment');
  assert.equal(paragraph.startOffset, 5);
  assert.equal(paragraph.endOffset, 6);
  assert.equal(paragraph.source, 'B');
}

function testSegmenterKeepsUnterminatedFenceThroughEof() {
  const segments = segmentMarkdown(['```js', 'const value = 1;', 'still code'].join('\n'));
  const code = segments.find((segment) => segment.type === 'code_fence');

  assert.ok(code, 'expected code fence segment');
  assert.equal(code.startLine, 1);
  assert.equal(code.endLine, 3);
  assert.equal(code.source, '```js\nconst value = 1;\nstill code');
}

function testSegmenterExcludesBlankSegments() {
  const segments = segmentMarkdown(['', '   ', '# A', '', 'Paragraph', ''].join('\n'));

  assert.equal(segments.length, 2);
  assert.deepEqual(
    segments.map((segment) => segment.type),
    ['heading', 'paragraph'],
  );
}

function testSegmenterKeepsLooseListsTogether() {
  const segments = segmentMarkdown(['- a', '', '- b', '', '  continued'].join('\n'));
  const lists = segments.filter((segment) => segment.type === 'list');

  assert.equal(lists.length, 1);
  assert.equal(lists[0].startLine, 1);
  assert.equal(lists[0].endLine, 5);
  assert.equal(lists[0].source, '- a\n\n- b\n\n  continued');
}

function testSegmenterHandlesTrailingNewline() {
  const segments = segmentMarkdown('# A\n');
  const heading = segments[0];

  assert.equal(segments.length, 1);
  assert.equal(heading.type, 'heading');
  assert.equal(heading.startOffset, 0);
  assert.equal(heading.endOffset, 3);
  assert.equal(heading.source, '# A');
}

function testSegmenterHandlesLargeDocuments() {
  const source = Array.from({ length: 100000 }, (_, index) => `Line ${index + 1}`).join('\n');
  const startedAt = Date.now();
  const segments = segmentMarkdown(source);
  const elapsed = Date.now() - startedAt;

  assert.equal(segments.length, 1);
  assert.equal(segments[0].startLine, 1);
  assert.equal(segments[0].endLine, 100000);
  assert.ok(elapsed < 5000, `expected 100k-line segmentation under 5000ms, got ${elapsed}ms`);
}

function testSegmenterHandlesPathologicalLooseListBlankRun() {
  const blankLines = Array.from({ length: 20000 }, () => '');
  const source = ['- first', ...blankLines, '- second'].join('\n');
  const startedAt = Date.now();
  const segments = segmentMarkdown(source);
  const elapsed = Date.now() - startedAt;
  const lists = segments.filter((segment) => segment.type === 'list');

  assert.equal(lists.length, 1);
  assert.equal(lists[0].startLine, 1);
  assert.equal(lists[0].endLine, 20002);
  assert.ok(elapsed < 1500, `expected loose-list blank run under 1500ms, got ${elapsed}ms`);
}

function testSanitizerRemovesUnsafeHtml() {
  const html = sanitizeKnowledgeMarkdownHtml(
    '<p>ok</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a>',
  );

  assert.match(html, /<p>ok<\/p>/);
  assert.doesNotMatch(html, /script/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.match(html, /<a[^>]*>bad<\/a>/);
}

function testSanitizerRemovesDangerousDataHtmlUrls() {
  const inputs = [
    '<a href="data:text/html,<script>alert(1)</script>">bad</a>',
    '<a href="data:text/html;charset=utf-8,<script>alert(1)</script>">bad</a>',
  ];

  for (const input of inputs) {
    const html = sanitizeKnowledgeMarkdownHtml(input);
    assert.doesNotMatch(html, /\shref=/i);
    assert.doesNotMatch(html, /data:text\/html/i);
    assert.match(html, /<a[^>]*>bad<\/a>/);
  }
}

function testSanitizerRemovesObfuscatedDangerousUrls() {
  const inputs = [
    '<a href="java&#x73;cript:alert(1)">bad</a>',
    '<a href="java&#x0A;script:alert(1)">bad</a>',
    '<a href="java\tscript:alert(1)">bad</a>',
  ];

  for (const input of inputs) {
    const html = sanitizeKnowledgeMarkdownHtml(input);
    assert.doesNotMatch(html, /\shref=/i);
    assert.doesNotMatch(html, /javascript:/i);
    assert.match(html, /<a[^>]*>bad<\/a>/);
  }
}

function testMarkdownRenderCacheReusesSameSegment() {
  let renderCount = 0;
  let sanitizeCount = 0;
  const cache = createMarkdownRenderCache({
    rendererVersion: 'test',
    renderMarkdown(source) {
      renderCount += 1;
      return `<p>${source}</p>`;
    },
    sanitizeHtml(html) {
      sanitizeCount += 1;
      return html.replace('raw', 'clean');
    },
  });
  const segment = {
    id: 'segment-1',
    hash: 'hash-1',
    source: 'raw',
  };
  const first = cache.render(segment);
  const second = cache.render(segment);

  assert.equal(first.html, '<p>clean</p>');
  assert.equal(first.segmentId, 'segment-1');
  assert.equal(first.hash, 'hash-1');
  assert.equal(second, first);
  assert.equal(renderCount, 1);
  assert.equal(sanitizeCount, 1);
  assert.equal(cache.size(), 1);
}

testSegmenterKeepsFencedCodeTogether();
testSegmenterFindsLineAnchors();
testSegmentHashIsStable();
testSegmenterKeepsOriginalOffsetsForCrLf();
testSegmenterKeepsUnterminatedFenceThroughEof();
testSegmenterExcludesBlankSegments();
testSegmenterKeepsLooseListsTogether();
testSegmenterHandlesTrailingNewline();
testSegmenterHandlesLargeDocuments();
testSegmenterHandlesPathologicalLooseListBlankRun();
testSanitizerRemovesUnsafeHtml();
testSanitizerRemovesDangerousDataHtmlUrls();
testSanitizerRemovesObfuscatedDangerousUrls();
testMarkdownRenderCacheReusesSameSegment();

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

const {
  createDefaultBlockDocumentV2,
  migrateBlockDocumentToV2,
  serializeBlockDocumentV2,
  parseKnowledgeBlockDocumentV2,
  blockDocumentV2ToPlainText,
  blockDocumentV2ToMarkdown,
  blockDocumentV2ToV1Document,
  createBlockV2,
  insertBlockAfter,
  removeBlockById,
  moveBlockById,
  duplicateBlockById,
  updateBlockDocumentV2,
  attachAssetToBlockV2,
  findBlockV2,
  indentBlock,
  outdentBlock,
} = require('../src/windows/main/utils/knowledge_blocks_v2.ts');

function testBlockV2DefaultDocument() {
  const document = createDefaultBlockDocumentV2('V2 title');
  assert.equal(document.type, 'guyantools.block-page');
  assert.equal(document.version, 2);
  assert.equal(document.blocks[0].type, 'heading');
  assert.equal(document.blocks[0].content[0].text, 'V2 title');
}

function testBlockV1MigratesToV2() {
  const v1 = createDefaultBlockDocument('Migrated title');
  const v2 = migrateBlockDocumentToV2(v1);
  assert.equal(v2.version, 2);
  assert.equal(v2.blocks[0].content[0].text, 'Migrated title');
}

function testBlockV2RoundTripAndDerivedText() {
  const document = createDefaultBlockDocumentV2('Round trip');
  const serialized = serializeBlockDocumentV2(document);
  const parsed = parseKnowledgeBlockDocumentV2(serialized, 'Fallback');
  assert.equal(parsed.version, 2);
  assert.match(blockDocumentV2ToPlainText(parsed), /Round trip/);
  assert.match(blockDocumentV2ToMarkdown(parsed), /^# Round trip/m);
}

function testBlockV2CanDowngradeForCurrentEditor() {
  const document = createDefaultBlockDocumentV2('Downgrade title');
  const v1 = blockDocumentV2ToV1Document(document);
  assert.equal(v1.version, 1);
  assert.equal(v1.blocks[0].text, 'Downgrade title');
}

function testBlockCodecWritesVersionTwoJson() {
  const document = createDefaultBlockDocumentV2('Codec title');
  const payload = createBlockSavePayload(document, undefined);
  const parsed = JSON.parse(payload.contentJson);
  assert.equal(parsed.version, 2);
  assert.match(payload.contentMarkdown, /Codec title/);
  assert.match(payload.contentText, /Codec title/);
}

function testBlockV2PureInsertAndRemoveOperations() {
  const first = createBlockV2('paragraph', 'First');
  const second = createBlockV2('paragraph', 'Second');
  const inserted = insertBlockAfter([first], first.id, second);
  assert.deepEqual(inserted.map((block) => block.id), [first.id, second.id]);

  const removed = removeBlockById(inserted, first.id);
  assert.deepEqual(removed.map((block) => block.id), [second.id]);

  const fallback = removeBlockById([first], first.id);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].type, 'paragraph');
}

function testBlockV2IndentAndOutdentOperations() {
  const parent = createBlockV2('heading', 'Parent');
  const child = createBlockV2('paragraph', 'Child');
  const indented = indentBlock([parent, child], child.id);
  assert.equal(indented.length, 1);
  assert.equal(indented[0].children[0].id, child.id);

  const outdented = outdentBlock(indented, child.id);
  assert.equal(outdented.length, 2);
  assert.deepEqual(outdented.map((block) => block.id), [parent.id, child.id]);
}

function testBlockV2RecursiveEditingOperations() {
  const parent = createBlockV2('heading', 'Parent');
  const child = createBlockV2('paragraph', 'Child');
  const sibling = createBlockV2('paragraph', 'Sibling');
  const nested = indentBlock([parent, child, sibling], child.id);
  const inserted = insertBlockAfter(nested, child.id, createBlockV2('paragraph', 'Nested sibling'));
  assert.equal(inserted[0].children.length, 2);
  assert.match(inserted[0].children[1].content[0].text, /Nested sibling/);

  const moved = moveBlockById(inserted, inserted[0].children[1].id, -1);
  assert.match(moved[0].children[0].content[0].text, /Nested sibling/);

  const duplicated = duplicateBlockById(moved, moved[0].children[0].id);
  assert.equal(duplicated[0].children.length, 3);
  assert.notEqual(duplicated[0].children[0].id, duplicated[0].children[1].id);

  const removed = removeBlockById(duplicated, duplicated[0].children[1].id);
  assert.equal(removed[0].children.length, 2);
}

function testBlockV2DocumentUpdateAndAssetAttach() {
  const document = createDefaultBlockDocumentV2('Asset title');
  const block = document.blocks[1];
  const updated = updateBlockDocumentV2(document, block.id, {
    content: [{ type: 'text', text: 'Updated paragraph' }],
  });
  assert.equal(findBlockV2(updated.blocks, block.id).content[0].text, 'Updated paragraph');

  const withAsset = attachAssetToBlockV2(updated, block.id, {
    id: 'asset-1',
    libraryId: 'lib-1',
    hash: 'hash',
    originalName: 'image.png',
    mimeType: 'image/png',
    extension: 'png',
    sizeBytes: 10,
    storagePath: 'asset/path',
    extractedText: '',
    importStatus: 'ready',
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
  });
  const assetBlock = findBlockV2(withAsset.blocks, block.id);
  assert.equal(assetBlock.refs.assetId, 'asset-1');
  assert.equal(assetBlock.attrs.assetName, 'image.png');
}

testBlockV2DefaultDocument();
testBlockV1MigratesToV2();
testBlockV2RoundTripAndDerivedText();
testBlockV2CanDowngradeForCurrentEditor();
testBlockCodecWritesVersionTwoJson();
testBlockV2PureInsertAndRemoveOperations();
testBlockV2IndentAndOutdentOperations();
testBlockV2RecursiveEditingOperations();
testBlockV2DocumentUpdateAndAssetAttach();

const {
  createDefaultCanvasDocumentV2,
  migrateCanvasDocumentToV2,
  serializeCanvasDocumentV2,
  parseKnowledgeCanvasDocumentV2,
  canvasDocumentV2ToMarkdown,
  canvasDocumentV2ToPlainText,
  canvasDocumentV2ToV1Document,
  attachAssetToCanvasElementV2,
  findCanvasElementV2,
} = require('../src/windows/main/utils/knowledge_canvas_v2.ts');

function testCanvasV2DefaultDocument() {
  const document = createDefaultCanvasDocumentV2('Canvas V2');
  assert.equal(document.type, 'guyantools.canvas-page');
  assert.equal(document.version, 2);
  assert.equal(document.elements[0].type, 'rich_text');
}

function testCanvasV1MigratesToV2() {
  const v1 = createDefaultCanvasDocument('Migrated canvas');
  const v2 = migrateCanvasDocumentToV2(v1);
  assert.equal(v2.version, 2);
  assert.equal(v2.elements[0].text, 'Migrated canvas');
}

function testCanvasV2RoundTripAndDerivedText() {
  const document = createDefaultCanvasDocumentV2('Round trip canvas');
  const parsed = parseKnowledgeCanvasDocumentV2(serializeCanvasDocumentV2(document), 'Fallback');
  assert.match(canvasDocumentV2ToPlainText(parsed), /Round trip canvas/);
  assert.match(canvasDocumentV2ToMarkdown(parsed), /Round trip canvas/);
}

function testCanvasV2CanDowngradeForCurrentEditor() {
  const document = createDefaultCanvasDocumentV2('Downgrade canvas');
  const v1 = canvasDocumentV2ToV1Document(document);
  assert.equal(v1.version, 1);
  assert.equal(v1.elements[0].type, 'text');
  assert.equal(v1.elements[0].text, 'Downgrade canvas');
}

function testCanvasV2AssetAttachment() {
  const document = createDefaultCanvasDocumentV2('Asset canvas');
  const attached = attachAssetToCanvasElementV2(document, null, {
    id: 'asset-canvas-1',
    libraryId: 'lib-1',
    hash: 'hash',
    originalName: 'canvas.png',
    mimeType: 'image/png',
    extension: 'png',
    sizeBytes: 10,
    storagePath: 'asset/path',
    extractedText: '',
    importStatus: 'ready',
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
  }, { x: 320, y: 240 });
  const image = attached.elements.find((element) => element.type === 'image');
  assert.ok(image);
  assert.equal(image.x, 320);
  assert.equal(image.refs.assetId, 'asset-canvas-1');
  assert.equal(findCanvasElementV2(attached.elements, image.id).style.assetName, 'canvas.png');
}

function testCanvasCodecWritesVersionTwoJson() {
  const document = createDefaultCanvasDocumentV2('Codec canvas');
  const payload = createCanvasSavePayload(document, undefined);
  assert.equal(JSON.parse(payload.contentJson).version, 2);
  assert.match(payload.contentMarkdown, /Codec canvas/);
  assert.match(payload.contentText, /Codec canvas/);
}

testCanvasV2DefaultDocument();
testCanvasV1MigratesToV2();
testCanvasV2RoundTripAndDerivedText();
testCanvasV2CanDowngradeForCurrentEditor();
testCanvasV2AssetAttachment();
testCanvasCodecWritesVersionTwoJson();

const {
  createMarkdownToBlockConversion,
  createBlockToMarkdownConversion,
  createCanvasToMarkdownConversion,
  createMarkdownToCanvasConversion,
  createBlockToCanvasConversion,
} = require('../src/windows/main/pages/Knowledge/utils/knowledge_conversion.ts');

function testMarkdownToBlockConversionProducesCopyPayload() {
  const result = createMarkdownToBlockConversion({
    title: 'Markdown source',
    markdown: '# Title\n\n- [x] Task',
    sourcePageId: 'page-source',
  });
  assert.equal(result.pageType, 'block');
  assert.match(result.title, /Markdown source/);
  assert.match(result.warning, /可能有损/);
  assert.match(result.payload.contentMarkdown, /Title/);
  assert.equal(JSON.parse(result.payload.contentJson).version, 2);
  assert.equal(JSON.parse(result.payload.propertiesJson).conversion.sourcePageId, 'page-source');
}

function testBlockToMarkdownConversionProducesMarkdownCopy() {
  const block = createDefaultBlockDocumentV2('Block source');
  const result = createBlockToMarkdownConversion({ title: 'Block source', document: block, sourcePageId: 'block-source' });
  assert.equal(result.pageType, 'markdown');
  assert.match(result.payload.contentMarkdown, /Block source/);
  assert.match(result.payload.contentMarkdown, /Converted from/);
  assert.match(result.warning, /副本/);
}

function testCanvasToMarkdownConversionProducesSummary() {
  const canvas = createDefaultCanvasDocumentV2('Canvas source');
  const result = createCanvasToMarkdownConversion({ title: 'Canvas source', document: canvas, sourcePageId: 'canvas-source' });
  assert.equal(result.pageType, 'markdown');
  assert.match(result.payload.contentMarkdown, /Canvas source/);
  assert.match(result.warning, /摘要/);
}

function testMarkdownToCanvasConversionProducesCards() {
  const result = createMarkdownToCanvasConversion({
    title: 'Markdown canvas',
    markdown: '# Heading\n\n- [ ] Task\n\n![Alt](app://asset)',
    sourcePageId: 'markdown-source',
  });
  const parsed = JSON.parse(result.payload.contentJson);
  assert.equal(result.pageType, 'canvas');
  assert.equal(parsed.version, 2);
  assert.ok(parsed.elements.some((element) => element.type === 'todo_card'));
  assert.ok(parsed.elements.some((element) => element.type === 'image'));
}

function testBlockToCanvasConversionProducesCards() {
  const block = createDefaultBlockDocumentV2('Block canvas');
  const result = createBlockToCanvasConversion({ title: 'Block canvas', document: block, sourcePageId: 'block-canvas-source' });
  const parsed = JSON.parse(result.payload.contentJson);
  assert.equal(result.pageType, 'canvas');
  assert.equal(parsed.version, 2);
  assert.match(result.warning, /块页面/);
}

testMarkdownToBlockConversionProducesCopyPayload();
testBlockToMarkdownConversionProducesMarkdownCopy();
testCanvasToMarkdownConversionProducesSummary();
testMarkdownToCanvasConversionProducesCards();
testBlockToCanvasConversionProducesCards();

console.log('knowledge editor foundation checks passed');
