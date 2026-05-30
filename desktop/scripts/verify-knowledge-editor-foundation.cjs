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

testSegmenterKeepsFencedCodeTogether();
testSegmenterFindsLineAnchors();
testSegmentHashIsStable();
testSegmenterKeepsOriginalOffsetsForCrLf();
testSegmenterKeepsUnterminatedFenceThroughEof();
testSegmenterExcludesBlankSegments();
testSegmenterKeepsLooseListsTogether();
testSegmenterHandlesTrailingNewline();
testSegmenterHandlesLargeDocuments();

console.log('knowledge editor foundation checks passed');
