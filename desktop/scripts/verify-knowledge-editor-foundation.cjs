const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

const {
  renderMarkdownPreviewHtml,
} = require('../src/windows/main/pages/Knowledge/utils/markdown_enhanced_render.ts');

const {
  collectMarkdownWysiwygLineTokens,
} = require('../src/windows/main/pages/Knowledge/composables/useMarkdownWysiwygDecorations.ts');

const {
  collectMarkdownLivePreviewInlineTokens,
  collectMarkdownLivePreviewBlockTokens,
  isMarkdownLivePreviewLineActive,
  isMarkdownLivePreviewRangeActive,
  insertMarkdownTableColumn,
  insertMarkdownTableRow,
  parseMarkdownCalloutSource,
  setMarkdownTableAlignment,
  setMarkdownCalloutType,
  updateMarkdownTableCell,
} = require('../src/windows/main/pages/Knowledge/utils/markdown_live_preview.ts');

function extractCssRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`).exec(source);
  return match?.[1] ?? '';
}

function testInAppErrorHandlerIgnoresBenignResizeObserverLoopErrors() {
  const sourcePath = path.join(__dirname, '../src/windows/main/composables/useInAppNotification.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function isBenignResizeObserverLoopError/);
  assert.match(source, /ResizeObserver loop completed with undelivered notifications/);
  assert.match(source, /ResizeObserver loop limit exceeded/);
  assert.match(source, /isBenignResizeObserverLoopError\(error\)/);
}

function testKnowledgeMarkdownEditorUsesCodeMirrorImplementation() {
  const editorPath = path.join(
    __dirname,
    '../src/windows/main/pages/Knowledge/components/KnowledgeMarkdownEditor.vue',
  );
  const virtualListPath = path.join(
    __dirname,
    '../src/windows/main/pages/Knowledge/components/markdown/MarkdownPreviewVirtualList.vue',
  );
  const mainWindowPath = path.join(__dirname, '../src/windows/main/main.ts');
  const editorSource = fs.readFileSync(editorPath, 'utf8');
  const virtualListSource = fs.readFileSync(virtualListPath, 'utf8');
  const mainWindowSource = fs.readFileSync(mainWindowPath, 'utf8');
  const wysiwygDecorationsPath = path.join(
    __dirname,
    '../src/windows/main/pages/Knowledge/composables/useMarkdownWysiwygDecorations.ts',
  );

  assert.match(editorSource, /@codemirror\/view/, 'expected the Markdown editor to use CodeMirror view');
  assert.match(editorSource, /@codemirror\/state/, 'expected the Markdown editor to use CodeMirror state');
  assert.match(editorSource, /type EditorMode = 'source' \| 'livePreview' \| 'reading' \| 'split'/, 'expected Obsidian-like CM6 editor modes');
  assert.match(editorSource, /ref<EditorMode>\('livePreview'\)/, 'expected Live Preview to be the default Markdown editing mode');
  assert.match(editorSource, /new EditorView\(/, 'expected the production editor to create CodeMirror directly');
  assert.match(editorSource, /markdownLanguage/, 'expected the CM6 Markdown parser to opt into GFM language support');
  assert.match(editorSource, /LanguageDescription/, 'expected fenced code languages to be registered through CM6 LanguageDescription');
  assert.match(editorSource, /const markdownCodeLanguages[\s\S]*?LanguageDescription\.of[\s\S]*?JavaScript[\s\S]*?TypeScript[\s\S]*?Python[\s\S]*?Rust[\s\S]*?SQL/s, 'expected common fenced code languages for Obsidian-like live highlighting');
  assert.match(editorSource, /markdown\(\{\s*base:\s*markdownLanguage,\s*codeLanguages:\s*markdownCodeLanguages,\s*\}\)/s, 'expected CM6 Markdown parser to highlight fenced code while editing');
  assert.match(editorSource, /markdownLivePreviewDecorations/, 'expected the CM6 Live Preview decoration plugin to be wired');
  assert.match(mainWindowSource, /katex\/dist\/katex\.min\.css/, 'expected KaTeX CSS to be loaded so inline formulas do not render MathML and HTML twice');
  assert.doesNotMatch(editorSource, /mode === 'wysiwyg'|mode = 'wysiwyg'|mode === 'edit'|mode = 'edit'|mode === 'preview'|mode = 'preview'/, 'expected legacy editor modes to be removed from the Markdown editor');
  assert.match(editorSource, /defineExpose\(\{\s*insertTextAtSelection/s, 'expected parent insertion contract to remain available');
  assert.doesNotMatch(editorSource, /@milkdown\//, 'expected no Milkdown imports in the Markdown editor');
  assert.doesNotMatch(editorSource, /\bCrepe\b|markdownUpdated/, 'expected no Milkdown Crepe editor usage');
  assert.equal(fs.existsSync(wysiwygDecorationsPath), true, 'expected the CM6 WYSIWYG decoration composable to exist');

  const wysiwygDecorationsSource = fs.readFileSync(wysiwygDecorationsPath, 'utf8');
  assert.match(wysiwygDecorationsSource, /StateField\.define/, 'expected Live Preview decorations to be provided from a state field');
  assert.match(wysiwygDecorationsSource, /EditorView\.decorations\.from\(field\)/, 'expected Live Preview decorations to be direct editor decorations');
  assert.match(wysiwygDecorationsSource, /class InlinePreviewWidget[\s\S]*?formula-inline[\s\S]*?renderMarkdownFormulaToHtml/, 'expected inline formula widgets to render KaTeX output');
  assert.match(wysiwygDecorationsSource, /class InlinePreviewWidget[\s\S]*?document\.createElement\('a'\)[\s\S]*?openLivePreviewHref/, 'expected inline links to render as clickable anchors');
  assert.match(wysiwygDecorationsSource, /function openLivePreviewHref[\s\S]*?shellApi\?\.openExternal/, 'expected Live Preview links to use the shell external opener');
  assert.match(wysiwygDecorationsSource, /EditorView\.atomicRanges\.of\(\(view\) => view\.state\.field\(field\)\)/, 'expected inline preview replacements to be exposed as atomic ranges');
  assert.match(wysiwygDecorationsSource, /requestMeasure\(\)/, 'expected block widgets to refresh CM6 measurements after async rendering');
  assert.match(wysiwygDecorationsSource, /ResizeObserver/, 'expected block widgets to remeasure when rendered content height changes');
  assert.match(wysiwygDecorationsSource, /destroy\(dom: HTMLElement\)/, 'expected block widget resize observers to be disconnected when widgets are destroyed');
  assert.doesNotMatch(wysiwygDecorationsSource, /blockPreviewDecorationRange/, 'expected block widgets not to replace trailing line breaks because that breaks CM6 coordinate scanning');
  assert.match(wysiwygDecorationsSource, /lineNumberWidgetMarker/, 'expected block widgets to provide their starting line number after inclusive source replacement');
  assert.match(
    wysiwygDecorationsSource,
    /function blockPreviewLineNumber[\s\S]*?widget instanceof BlockPreviewWidget[\s\S]*?doc\.lineAt\(block\.from\)\.number/,
    'expected block widget line numbers to use the source start line instead of a duplicate text-line marker',
  );
  assert.match(wysiwygDecorationsSource, /gutterWidgetClass/, 'expected block widgets to mark all gutter cells next to rendered blocks');
  assert.match(wysiwygDecorationsSource, /\.range\(token\.from, token\.to\)/, 'expected block widgets to only replace the source token range');
  assert.match(
    wysiwygDecorationsSource,
    /Decoration\.replace\(\{\s*widget:\s*new BlockPreviewWidget\(token\),\s*block:\s*true,\s*inclusive:\s*true,\s*\}\)\.range\(token\.from, token\.to\)/,
    'expected block previews to use inclusive block replacement so the widget occupies the source line track instead of inserting after an empty line',
  );
  assert.match(
    wysiwygDecorationsSource,
    /const selectedBlockClass = 'cm-md-live-block--selected'/,
    'expected rendered block selection state to use a shared class constant',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function clearSelectedLivePreviewBlocks[\s\S]*?querySelectorAll<HTMLElement>[\s\S]*?selectedBlockClass[\s\S]*?classList\.remove\(selectedBlockClass\)/,
    'expected rendered block selection state to be removable from the editor DOM',
  );
  assert.match(
    wysiwygDecorationsSource,
    /EditorView\.domEventHandlers\(\{[\s\S]*?mousedown\(event, view\)[\s\S]*?cm-md-live-block[\s\S]*?clearSelectedLivePreviewBlocks\(view\.dom\)/,
    'expected clicking outside rendered blocks in the editor to clear stale block selection',
  );
  assert.match(
    wysiwygDecorationsSource,
    /blur\(event, view\)[\s\S]*?relatedTarget[\s\S]*?cm-md-live-block[\s\S]*?clearSelectedLivePreviewBlocks\(view\.dom\)/,
    'expected leaving the editor for non-block UI to clear stale block selection',
  );
  assert.match(
    wysiwygDecorationsSource,
    /clearSelectedLivePreviewBlocks\(view\.dom\);[\s\S]*?container\.classList\.add\(selectedBlockClass\)/,
    'expected selecting a rendered block to clear any previously selected rendered block',
  );
  assert.match(
    wysiwygDecorationsSource,
    /cm-md-live-table__cell/,
    'expected rendered table cells to be treated as interactive block targets',
  );
  assert.match(
    wysiwygDecorationsSource,
    /if \(this\.token\.kind === 'table'\)[\s\S]*?createTablePreview\(container, view, this\.token\)/,
    'expected inactive table blocks to render through the interactive table preview instead of static Markdown HTML',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function createTablePreview[\s\S]*?contentEditable = 'plaintext-only'[\s\S]*?dataset\.tableRow[\s\S]*?dataset\.tableColumn[\s\S]*?updateMarkdownTableCell/,
    'expected rendered table cells to be editable and write changes back to Markdown source',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function createTablePreview[\s\S]*?cm-md-live-table__resize-handle/,
    'expected rendered table previews to expose a bottom-right resize affordance',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function dispatchBlockAction[\s\S]*?if \(token\.kind !== 'table'\) return;[\s\S]*?view\.dispatch\(\{\s*changes:\s*\{\s*from:\s*token\.from,\s*to:\s*token\.to,\s*insert:\s*nextSource\s*\},\s*scrollIntoView:\s*true,\s*\}\);[\s\S]*?requestAnimationFrame\(\(\) => view\.requestMeasure\(\)\);/,
    'expected table row and column toolbar actions to update rendered tables without entering source mode',
  );
  assert.doesNotMatch(
    wysiwygDecorationsSource,
    /function dispatchBlockAction[\s\S]*?if \(token\.kind !== 'table'\) return;[\s\S]*?selection:\s*\{\s*anchor:\s*token\.from \+ nextSource\.length\s*\}[\s\S]*?view\.focus\(\)/,
    'expected table row and column toolbar actions not to focus the source table after applying changes',
  );
  assert.match(
    wysiwygDecorationsSource,
    /if \(token\.kind === 'code_fence' && isMarkdownLivePreviewRangeActive\(token, activeRanges\)\)[\s\S]*?addActiveCodeFenceDecorations/,
    'expected active code fences to keep source visible while retaining block styling',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function addActiveCodeFenceDecorations[\s\S]*?cm-md-live-source-block--code_fence[\s\S]*?cm-md-live-source-block--first[\s\S]*?cm-md-live-source-block--last/,
    'expected active code fence source lines to receive first/last block styling classes',
  );
  assert.doesNotMatch(wysiwygDecorationsSource, /selection:\s*\{\s*anchor:\s*this\.from \+ nextSource\.length\s*\}/, 'expected task checkbox clicks not to force the cursor into task source syntax');
  assert.match(wysiwygDecorationsSource, /class TaskCheckboxWidget[\s\S]*?ignoreEvent\(\)\s*\{\s*return true;\s*\}/, 'expected task checkbox events to be ignored by CM6 selection handling');
  assert.match(wysiwygDecorationsSource, /class BlockPreviewWidget[\s\S]*?ignoreEvent\(\)\s*\{\s*return true;\s*\}/, 'expected preview block clicks not to move the cursor into hidden source');
  assert.match(
    wysiwygDecorationsSource,
    /this\.token\.kind === 'code_fence'[\s\S]*?selection:\s*\{\s*anchor:\s*this\.token\.from\s*\}/,
    'expected clicking a rendered code block to reveal the editable source block',
  );
  assert.match(
    wysiwygDecorationsSource,
    /this\.token\.kind === 'code_fence'[\s\S]*?createCodeFenceRenderedPreview\(container, this\.token\)/,
    'expected inactive code fence previews to render Markdown output instead of source fences',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function createCodeFenceRenderedPreview[\s\S]*?cm-md-live-code-render-preview[\s\S]*?cm-md-live-code-render-preview__header[\s\S]*?cm-md-live-code-render-preview__body/,
    'expected code fence previews to render a lightweight line-based code block shell',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function createCodeFenceRenderedPreview[\s\S]*?createCodeFenceFenceRow\(preview\.openingLineNumber[\s\S]*?createCodeFenceFenceRow\(preview\.closingLineNumber[\s\S]*?cm-md-live-code-render-preview__footer/,
    'expected code fence previews to reserve opening and closing fence line tracks',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function extractCodeFencePreview[\s\S]*?openingLineNumber:\s*1[\s\S]*?bodyStartLineNumber:\s*2[\s\S]*?closingLineNumber:\s*closingLineIndex \+ 1/,
    'expected inactive code fence preview line numbers to start from the code block instead of the document',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function createCodeFenceRenderedPreview[\s\S]*?extractCodeFencePreview[\s\S]*?createCodeFencePreviewLine[\s\S]*?highlightCodeFenceLine/,
    'expected code fence previews to preserve source line count and apply syntax highlighting per line',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function createCodeFenceFenceRow[\s\S]*?cm-md-live-code-render-preview__line-number[\s\S]*?String\(lineNumber\)[\s\S]*?cm-md-live-code-render-preview__fence-source/,
    'expected inactive code fence fence rows to include visible block-local line numbers',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function createCodeFencePreviewLine[\s\S]*?cm-md-live-code-render-preview__line-number[\s\S]*?String\(lineNumber\)[\s\S]*?cm-md-live-code-render-preview__code/,
    'expected code fence preview rows to include stable block-local line numbers',
  );
  assert.match(
    wysiwygDecorationsSource,
    /function highlightCodeFenceLine[\s\S]*?classifyCodeFenceToken[\s\S]*?function appendCodeToken[\s\S]*?cm-md-live-code-token--\$\{tokenClass\}/,
    'expected code fence preview syntax highlighting classes for language-aware tokens',
  );
  assert.match(wysiwygDecorationsSource, /return 'keyword'/, 'expected code fence highlighter to classify language keywords');
  assert.match(wysiwygDecorationsSource, /return 'string'/, 'expected code fence highlighter to classify strings');
  assert.match(wysiwygDecorationsSource, /return 'number'/, 'expected code fence highlighter to classify numbers');
  assert.match(wysiwygDecorationsSource, /function createCalloutPreview/, 'expected callout blocks to have a dedicated interactive preview');
  assert.match(wysiwygDecorationsSource, /createElement\('select'\)/, 'expected callout previews to expose a dropdown type selector');
  assert.match(wysiwygDecorationsSource, /setMarkdownCalloutType/, 'expected callout dropdown changes to rewrite Markdown source');
  assert.doesNotMatch(wysiwygDecorationsSource, /ViewPlugin\.fromClass/, 'expected no block decorations from a ViewPlugin');
  assert.match(
    wysiwygDecorationsSource,
    /case 'heading-marker':[\s\S]*?isMarkdownLivePreviewLineActive\(lineRange, activeRanges\)[\s\S]*?cm-md-live-heading-source[\s\S]*?else[\s\S]*?Decoration\.line/,
    'expected heading reading styles to be skipped while the heading line is showing source',
  );
  assert.match(
    wysiwygDecorationsSource,
    /case 'heading-marker':[\s\S]*?isMarkdownLivePreviewLineActive\(lineRange, activeRanges\)[\s\S]*?cm-md-live-heading-source/,
    'expected active heading lines to receive a source-mode class so H4/H5 markers stay visually contiguous',
  );

  assert.match(editorSource, /\.cm-md-live-task[\s\S]*?appearance:\s*none/, 'expected task checkbox button to reset native button appearance');
  assert.match(editorSource, /\.cm-md-live-task[\s\S]*?box-sizing:\s*border-box/, 'expected task checkbox button dimensions to include border and padding');
  assert.match(editorSource, /\.cm-md-live-task[\s\S]*?align-items:\s*center/, 'expected task checkbox content to be vertically centered');
  assert.match(editorSource, /\.cm-md-live-task[\s\S]*?justify-content:\s*center/, 'expected task checkbox content to be horizontally centered');
  assert.match(
    editorSource,
    /'\.cm-lineNumbers \.cm-gutterElement, \.cm-foldGutter \.cm-gutterElement':[\s\S]*?display:\s*'flex'[\s\S]*?alignItems:\s*'center'/,
    'expected line numbers and fold gutter buttons to share vertical centering',
  );
  assert.match(editorSource, /function createMarkdownFoldMarker/, 'expected Markdown fold gutter markers to be custom DOM');
  assert.match(editorSource, /createElementNS\('http:\/\/www\.w3\.org\/2000\/svg', 'svg'\)/, 'expected fold marker to use an SVG icon instead of text glyphs');
  assert.doesNotMatch(editorSource, /marker\.textContent\s*=/, 'expected fold marker icons not to rely on text glyph alignment');
  assert.match(editorSource, /foldGutter\(\{\s*markerDOM:\s*createMarkdownFoldMarker/s, 'expected the fold gutter to use the custom marker DOM');
  assert.doesNotMatch(editorSource, /foldGutter\(\)/, 'expected the default fold gutter marker to be replaced');
  assert.match(
    editorSource,
    /\.cm-md-fold-marker[\s\S]*?width:\s*'20px'[\s\S]*?height:\s*'20px'[\s\S]*?opacity:\s*'0'/,
    'expected fold markers to use a larger centered button box and stay hidden until hover',
  );
  assert.match(
    editorSource,
    /'\.cm-md-fold-marker svg':[\s\S]*?display:\s*'block'[\s\S]*?width:\s*'14px'[\s\S]*?height:\s*'14px'/,
    'expected the fold marker SVG to have explicit centered dimensions',
  );
  assert.match(
    editorSource,
    /function markdownFoldHoverExtension[\s\S]*?cm-md-fold-gutterElement--hovered/,
    'expected content-line hover to mark the corresponding fold gutter row',
  );
  assert.match(
    editorSource,
    /\.cm-foldGutter \.cm-gutterElement:hover \.cm-md-fold-marker[\s\S]*?\.cm-md-fold-gutterElement--hovered \.cm-md-fold-marker/,
    'expected fold markers to become visible from hoverable gutter rows or content rows',
  );
  assert.doesNotMatch(editorSource, /'\.cm-gutters':[\s\S]*?padding:\s*'18px 0 28px'/, 'expected gutters not to add vertical padding that breaks line/content alignment');
  assert.match(
    editorSource,
    /\.cm-md-live-block\)[\s\S]*?display:\s*block;[\s\S]*?box-sizing:\s*border-box;[\s\S]*?margin:\s*0;/,
    'expected block widgets to use a top-aligned border-box without margins that desync CM6 line and gutter measurement',
  );
  assert.match(
    editorSource,
    /\.cm-lineNumbers \.cm-gutterElement\.cm-md-live-block-gutter, \.cm-foldGutter \.cm-gutterElement\.cm-md-live-block-gutter[\s\S]*?alignItems:\s*'flex-start'/,
    'expected gutter cells next to block widgets to align with the top of the rendered block',
  );
  assert.match(
    editorSource,
    /\.cm-scroller':[\s\S]*?lineHeight:\s*'1\.9'/,
    'expected the Markdown source editor line height to be raised for readability',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-heading-source[\s\S]*?font-size:\s*1em;[\s\S]*?line-height:\s*inherit;[\s\S]*?letter-spacing:\s*0;[\s\S]*?font-variant-ligatures:\s*none;/,
    'expected active heading source lines to keep contiguous H4/H5 markers without live-preview heading sizing',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-block\)[\s\S]*?background:\s*var\(--knowledge-md-block-bg,[\s\S]*?color-mix\(in srgb, var\(--ui-surface-panel\)[\s\S]*?transparent\)\);/,
    'expected Live Preview block widgets to use configurable subtle translucent backgrounds instead of fully opaque cards',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-code-render-preview[\s\S]*?position:\s*relative;[\s\S]*?background:\s*var\(--knowledge-md-code-bg,[\s\S]*?color-mix\(in srgb, var\(--ui-surface-panel-muted\)[\s\S]*?transparent\)\);/,
    'expected code fence previews to keep a configurable lightweight rendered shell without clipping body rows',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-code-render-preview\)[\s\S]*?background:\s*var\(--knowledge-md-code-bg,[\s\S]*?color-mix\(in srgb, var\(--ui-surface-panel-muted\) 44%, transparent\)\);/,
    'expected inactive code fence previews to use a configurable darker translucent background',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-code-render-preview__fence-row[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\);[\s\S]*?\.cm-md-live-code-render-preview__fence-source[\s\S]*?visibility:\s*hidden;/,
    'expected inactive code fence previews to show fence-row line numbers while hiding only the fence source text',
  );
  assert.doesNotMatch(
    editorSource,
    /\.cm-md-live-code-render-preview[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\);[\s\S]*?overflow:\s*hidden;/,
    'expected code fence previews not to clip code rows through a constrained grid body',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-code-render-preview__fence-row[\s\S]*?font-family:\s*inherit;[\s\S]*?font-size:\s*inherit;[\s\S]*?line-height:\s*inherit;[\s\S]*?\.cm-md-live-code-render-preview__fence-source/,
    'expected code fence previews to reserve source-height tracks for the opening and closing fences',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-code-render-preview__line[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\);[\s\S]*?font-family:\s*inherit;[\s\S]*?font-size:\s*inherit;[\s\S]*?line-height:\s*inherit;/,
    'expected code fence preview rows to inherit the same font and line-height as source lines',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-code-render-preview__code\)[\s\S]*?font-size:\s*inherit;/,
    'expected code fence preview source text to inherit the editor font size',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-code-token--keyword[\s\S]*?color:[\s\S]*?\.cm-md-live-code-token--string[\s\S]*?color:[\s\S]*?\.cm-md-live-code-token--number[\s\S]*?color:/,
    'expected code fence preview tokens to have visible syntax colors',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-source-block--code_fence[\s\S]*?background:\s*var\(--knowledge-md-code-bg,[\s\S]*?color-mix\(in srgb, var\(--ui-surface-panel-muted\) 44%, transparent\)\);[\s\S]*?box-shadow:\s*none;/,
    'expected active code fence source blocks to use the same configurable darker background as inactive previews',
  );
  assert.match(
    editorSource,
    /\.knowledge-md-math--block[\s\S]*?background:\s*var\(--knowledge-md-diagram-bg,[\s\S]*?color-mix\(in srgb, var\(--ui-surface-panel-muted\)[\s\S]*?transparent\)\);/,
    'expected rendered math blocks to use a configurable subtle translucent background',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-table-shell[\s\S]*?resize:\s*both;[\s\S]*?overflow:\s*auto;/,
    'expected rendered table previews to be resizable from the bottom-right corner',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-table__cell[\s\S]*?cursor:\s*text;[\s\S]*?user-select:\s*text;/,
    'expected rendered table cells to behave like editable text fields',
  );
  assert.match(
    editorSource,
    /\.markdown-body :deep\(\.knowledge-md-mermaid\)[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;[\s\S]*?padding:\s*6px 8px;/,
    'expected rendered Mermaid diagrams in the Markdown editor preview to size tightly around content and center it',
  );
  assert.match(
    editorSource,
    /\.markdown-body :deep\(\.knowledge-md-mermaid svg\)[\s\S]*?display:\s*block;[\s\S]*?margin:\s*auto;/,
    'expected rendered Mermaid SVGs in the Markdown editor preview to be centered',
  );
  assert.match(
    virtualListSource,
    /\.markdown-preview-virtual-list :deep\(\.knowledge-md-mermaid\)[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;[\s\S]*?padding:\s*6px 8px;/,
    'expected rendered Mermaid diagrams in virtual preview blocks to size tightly around content and center it',
  );
  assert.match(
    virtualListSource,
    /\.markdown-preview-virtual-list :deep\(\.knowledge-md-mermaid svg\)[\s\S]*?display:\s*block;[\s\S]*?margin:\s*auto;/,
    'expected rendered Mermaid SVGs in virtual preview blocks to be centered',
  );
}

function testKnowledgePagePersonalizationContextMenus() {
  const pagePath = path.join(__dirname, '../src/windows/main/pages/Knowledge/KnowledgePage.vue');
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.match(source, /import UiPersonalizationConfig/, 'expected knowledge personalization to reuse the shared personalization dialog');
  assert.match(source, /useContextMenu/, 'expected knowledge right-click menus to reuse the shared global context menu');
  assert.match(source, /BackgroundConfirmPayload/, 'expected personalization updates to use the shared background payload contract');
  assert.match(source, /resolveThemeBackground/, 'expected knowledge backgrounds to resolve separate light and dark theme configs');
  assert.match(source, /withThemeBackground/, 'expected knowledge background updates to save separate light and dark theme configs');
  assert.match(source, /type KnowledgePersonalizationRegion = 'page' \| 'left' \| 'editor' \| 'right'/, 'expected page/region personalization scopes');
  assert.match(source, /const knowledgePersonalizationStorageKey = 'knowledge\.personalization'/, 'expected personalization settings to persist locally');
  assert.match(source, /knowledgePersonalizationPageStyle/, 'expected the knowledge page to expose CSS variables for custom backgrounds');
  assert.match(source, /type KnowledgeBlockSurfaceKey = 'base' \| 'code' \| 'table' \| 'diagram' \| 'callout' \| 'quote' \| 'inlineCode' \| 'canvas'/, 'expected block style customization to cover all editor block surface categories');
  assert.match(source, /appearanceSchemes: KnowledgeAppearanceScheme\[\]/, 'expected personalization settings to persist reusable knowledge appearance schemes');
  assert.match(source, /activeAppearanceSchemeId: string/, 'expected active appearance scheme selection to persist');
  assert.match(source, /leftBackground: KnowledgeAreaBackground;[\s\S]*?editorBackground: KnowledgeAreaBackground;[\s\S]*?rightBackground: KnowledgeAreaBackground;[\s\S]*?blockStyle: KnowledgeBlockStyleSettings;[\s\S]*?selectionBackgroundColor: string;/, 'expected reusable schemes to save the full knowledge background set, block styles, and selection background');
  assert.match(source, /function createKnowledgeBlockStyleVars/, 'expected knowledge page to export block style settings as CSS variables');
  assert.match(source, /--knowledge-block-code-bg/, 'expected Notion-like block editor code backgrounds to be configurable');
  assert.match(source, /--knowledge-md-diagram-bg/, 'expected Markdown Mermaid and math backgrounds to be configurable');
  assert.match(source, /--knowledge-canvas-element-bg/, 'expected canvas editor element backgrounds to be configurable');
  assert.match(source, /--knowledge-selection-bg/, 'expected selection background color to be published as a scheme-controlled CSS variable');
  assert.match(source, /saveCurrentKnowledgeAppearanceScheme/, 'expected users to save background, block opacity, and selection color as reusable appearance schemes');
  assert.match(source, /applyKnowledgeAppearanceScheme/, 'expected users to quickly switch saved knowledge appearance schemes');
  assert.match(source, /knowledgeBackgroundForRegion\('left'\)/, 'expected saved schemes to include the left background');
  assert.match(source, /knowledgeBackgroundForRegion\('editor'\)/, 'expected saved schemes to include the editor background');
  assert.match(source, /knowledgeBackgroundForRegion\('right'\)/, 'expected saved schemes to include the right background');
  assert.match(source, /knowledgePersonalization\.value\.leftBackground = cloneKnowledgeAreaBackground\(scheme\.leftBackground\)/, 'expected applying a scheme to restore the left background');
  assert.match(source, /knowledgePersonalization\.value\.editorBackground = cloneKnowledgeAreaBackground\(scheme\.editorBackground\)/, 'expected applying a scheme to restore the editor background');
  assert.match(source, /knowledgePersonalization\.value\.rightBackground = cloneKnowledgeAreaBackground\(scheme\.rightBackground\)/, 'expected applying a scheme to restore the right background');
  assert.match(source, /knowledgePersonalization\.value\.selectionBackgroundColor = scheme\.selectionBackgroundColor/, 'expected applying a scheme to restore the selection background');
  assert.match(source, /normalizeKnowledgeAreaBackground\(item\.editorBackground, pageBackground\)/, 'expected legacy schemes without editor backgrounds to fall back safely');
  assert.match(source, /deleteActiveKnowledgeAppearanceScheme/, 'expected saved appearance schemes to be removable');
  assert.match(source, /knowledge-toolbar__scheme-select/, 'expected top toolbar to expose quick appearance scheme switching');
  assert.match(source, /knowledge-block-style-panel/, 'expected block style configuration panel to be available from the knowledge page');
  assert.match(source, /UiSliderField/, 'expected block opacity controls to use the shared slider field component');
  assert.match(source, /UiColorPicker/, 'expected knowledge color choices to use the shared color picker component');
  assert.doesNotMatch(source, /type="color"/, 'expected knowledge page color choices to be routed through UiColorPicker instead of local native inputs');
  assert.match(source, /knowledge-page--custom-background/, 'expected custom page background state to be reflected as a class');
  assert.match(source, /@contextmenu\.prevent="openKnowledgePersonalizationMenu\(\$event, 'left'\)"/, 'expected left sidebar to open personalization from right-click');
  assert.match(source, /@contextmenu\.prevent="openKnowledgePersonalizationMenu\(\$event, 'editor'\)"/, 'expected editor area to open personalization from right-click');
  assert.match(source, /@contextmenu\.prevent="openKnowledgePersonalizationMenu\(\$event, 'right'\)"/, 'expected right inspector to open personalization from right-click');
  assert.match(source, /设置个性化/, 'expected context menu action label to be 设置个性化');
  assert.match(source, /设置知识库背景/, 'expected context menus to expose the whole knowledge page background entry');
  assert.match(source, /知识库背景/, 'expected personalization panel to configure the whole knowledge page background');
  assert.match(source, /恢复默认背景颜色/, 'expected personalization reset to restore default background colors');
  assert.match(source, /<UiPersonalizationConfig[\s\S]*?:visible="knowledgePersonalizationPanelOpen"[\s\S]*?@confirm="handleKnowledgePersonalizationConfirm"/, 'expected knowledge personalization to render through UiPersonalizationConfig');
  assert.doesNotMatch(source, /knowledge-personalization-menu|knowledge-personalization-dialog/, 'expected no hand-rolled personalization menu or dialog');
  assert.match(
    source,
    /\.knowledge-page--custom-background \.knowledge-sidebar,[\s\S]*?\.knowledge-page--custom-background \.knowledge-workspace,[\s\S]*?\.knowledge-page--custom-background \.knowledge-inspector[\s\S]*?background:\s*var\(--knowledge-panel-tint\)/,
    'expected custom page background regions to keep configurable transparency instead of opaque surfaces',
  );
  assert.match(
    source,
    /color-mix\(in srgb, var\(--background-color\) 10%, transparent\)[\s\S]*?color-mix\(in srgb, var\(--background-color\) 14%, transparent\)/,
    'expected custom page background veil to stay light enough for the background image to remain visible',
  );
}

function findWysiwygToken(tokens, kind) {
  return tokens.find((token) => token.kind === kind);
}

function testMarkdownWysiwygTokensCoverGfmAndMathSyntax() {
  const headingFour = findWysiwygToken(collectMarkdownWysiwygLineTokens('#### 123'), 'heading-marker');
  assert.deepEqual(
    headingFour,
    { kind: 'heading-marker', from: 0, to: 5, level: 4 },
    'expected H4 WYSIWYG decoration to hide the full heading marker',
  );

  const headingFive = findWysiwygToken(collectMarkdownWysiwygLineTokens('##### 123'), 'heading-marker');
  assert.deepEqual(
    headingFive,
    { kind: 'heading-marker', from: 0, to: 6, level: 5 },
    'expected H5 WYSIWYG decoration to hide the full heading marker',
  );

  const task = findWysiwygToken(collectMarkdownWysiwygLineTokens('- [ ] 123'), 'task-marker');
  assert.deepEqual(
    task,
    { kind: 'task-marker', from: 0, to: 6, checked: false },
    'expected task checkbox decoration to replace the full list marker instead of only [ ]',
  );

  const emphasisTokens = collectMarkdownWysiwygLineTokens('*123*');
  assert.deepEqual(
    emphasisTokens.filter((token) => token.kind === 'emphasis-marker'),
    [
      { kind: 'emphasis-marker', from: 0, to: 1, syntaxFrom: 0, syntaxTo: 5 },
      { kind: 'emphasis-marker', from: 4, to: 5, syntaxFrom: 0, syntaxTo: 5 },
    ],
    'expected numeric italic syntax to hide both emphasis markers',
  );
  assert.deepEqual(
    findWysiwygToken(emphasisTokens, 'emphasis'),
    { kind: 'emphasis', from: 1, to: 4, syntaxFrom: 0, syntaxTo: 5 },
    'expected numeric italic content to receive the WYSIWYG emphasis class',
  );

  assert.deepEqual(
    findWysiwygToken(collectMarkdownWysiwygLineTokens('$123$'), 'formula-inline'),
    { kind: 'formula-inline', from: 0, to: 5, body: '123' },
    'expected inline formula syntax to be available for WYSIWYG rendering',
  );
}

function findLivePreviewToken(tokens, kind) {
  return tokens.find((token) => token.kind === kind);
}

function testMarkdownLivePreviewInlineTokensCoverObsidianSyntax() {
  const source = [
    '***bold italic***',
    '~~deleted~~',
    '==highlight==',
    '[OpenAI](https://openai.com)',
    '[[Project#Plan|计划]]',
    '![[diagram.png]]',
    '%%hidden comment%%',
    '$E=mc^2$',
  ].join(' ');
  const tokens = collectMarkdownLivePreviewInlineTokens(source);

  assert.deepEqual(findLivePreviewToken(tokens, 'strong-emphasis'), {
    kind: 'strong-emphasis',
    from: 3,
    to: 14,
    syntaxFrom: 0,
    syntaxTo: 17,
  });
  assert.deepEqual(findLivePreviewToken(tokens, 'strikethrough'), {
    kind: 'strikethrough',
    from: 20,
    to: 27,
    syntaxFrom: 18,
    syntaxTo: 29,
  });
  assert.deepEqual(findLivePreviewToken(tokens, 'highlight'), {
    kind: 'highlight',
    from: 32,
    to: 41,
    syntaxFrom: 30,
    syntaxTo: 43,
  });
  assert.deepEqual(findLivePreviewToken(tokens, 'link'), {
    kind: 'link',
    from: 44,
    to: 72,
    label: 'OpenAI',
    href: 'https://openai.com',
  });
  assert.deepEqual(findLivePreviewToken(tokens, 'wiki-link'), {
    kind: 'wiki-link',
    from: 73,
    to: 92,
    target: 'Project#Plan',
    label: '计划',
  });
  assert.deepEqual(findLivePreviewToken(tokens, 'asset-embed'), {
    kind: 'asset-embed',
    from: 93,
    to: 109,
    target: 'diagram.png',
  });
  assert.deepEqual(findLivePreviewToken(tokens, 'comment'), { kind: 'comment', from: 110, to: 128 });
  assert.deepEqual(findLivePreviewToken(tokens, 'formula-inline'), {
    kind: 'formula-inline',
    from: 129,
    to: 137,
    body: 'E=mc^2',
  });
}

function testMarkdownLivePreviewBlocksCoverObsidianSyntax() {
  const source = [
    '---',
    'tags: [demo]',
    '---',
    '',
    '> [!NOTE] 标题',
    '> 在这里记录重点内容。',
    '',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '$$',
    'E = mc^2',
    '$$',
    '',
    '```mermaid',
    'graph TD',
    '  A --> B',
    '```',
    '',
    '```ts',
    'const value = 1;',
    '```',
  ].join('\n');
  const blocks = collectMarkdownLivePreviewBlockTokens(source);

  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['frontmatter', 'callout', 'table', 'math', 'mermaid', 'code_fence'],
  );
  assert.equal(blocks[1].source, '> [!NOTE] 标题\n> 在这里记录重点内容。');
  assert.equal(blocks[2].source, '| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.equal(blocks[3].body, 'E = mc^2');
  assert.equal(blocks[4].language, 'mermaid');
  assert.equal(blocks[5].language, 'ts');

  const dangerCallout = collectMarkdownLivePreviewBlockTokens('> \\[!DANGER] 标题\n> 在这里记录重点内容。')[0];
  assert.equal(dangerCallout.kind, 'callout', 'expected escaped callout markers to still render as Obsidian callouts');
  assert.deepEqual(
    parseMarkdownCalloutSource(dangerCallout.source),
    {
      type: 'danger',
      rawType: 'DANGER',
      title: '标题',
      body: '在这里记录重点内容。',
    },
    'expected escaped DANGER callout source to parse into interactive callout metadata',
  );
  assert.equal(
    setMarkdownCalloutType(dangerCallout.source, 'note'),
    '> [!NOTE] 标题\n> 在这里记录重点内容。',
    'expected callout type changes to rewrite the Markdown callout marker',
  );
  assert.match(
    renderMarkdownPreviewHtml(dangerCallout.source),
    /knowledge-md-callout--danger[\s\S]*DANGER · 标题/,
    'expected DANGER callout preview HTML to be decorated',
  );
}

function testMarkdownLivePreviewActiveRangeFallback() {
  assert.equal(isMarkdownLivePreviewRangeActive({ from: 10, to: 20 }, [{ from: 15, to: 15 }]), true);
  assert.equal(isMarkdownLivePreviewRangeActive({ from: 10, to: 20 }, [{ from: 10, to: 10 }]), true);
  assert.equal(isMarkdownLivePreviewRangeActive({ from: 10, to: 20 }, [{ from: 20, to: 20 }]), true);
  assert.equal(isMarkdownLivePreviewRangeActive({ from: 10, to: 20 }, [{ from: 21, to: 21 }]), false);
  assert.equal(isMarkdownLivePreviewLineActive({ from: 0, to: 8 }, [{ from: 7, to: 7 }]), true);
  assert.equal(isMarkdownLivePreviewLineActive({ from: 0, to: 8 }, [{ from: 9, to: 9 }]), false);

  const strongTokens = collectMarkdownLivePreviewInlineTokens('**123**');
  assert.deepEqual(
    strongTokens,
    [
      { kind: 'strong-marker', from: 0, to: 2, syntaxFrom: 0, syntaxTo: 7 },
      { kind: 'strong', from: 2, to: 5, syntaxFrom: 0, syntaxTo: 7 },
      { kind: 'strong-marker', from: 5, to: 7, syntaxFrom: 0, syntaxTo: 7 },
    ],
    'expected strong marker and content tokens to share a full syntax fallback range',
  );
  assert.deepEqual(
    collectMarkdownLivePreviewInlineTokens('*123*'),
    [
      { kind: 'emphasis-marker', from: 0, to: 1, syntaxFrom: 0, syntaxTo: 5 },
      { kind: 'emphasis', from: 1, to: 4, syntaxFrom: 0, syntaxTo: 5 },
      { kind: 'emphasis-marker', from: 4, to: 5, syntaxFrom: 0, syntaxTo: 5 },
    ],
    'expected emphasis marker and content tokens to share a full syntax fallback range',
  );
}

function testMarkdownLivePreviewTableCommandsRewriteMarkdownSource() {
  const table = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n');

  assert.equal(
    insertMarkdownTableRow(table),
    ['| A | B |', '| --- | --- |', '| 1 | 2 |', '|  |  |'].join('\n'),
  );
  assert.equal(
    insertMarkdownTableColumn(table),
    ['| A | B |  |', '| --- | --- | --- |', '| 1 | 2 |  |'].join('\n'),
  );
  assert.equal(
    setMarkdownTableAlignment(table, 1, 'center'),
    ['| A | B |', '| --- | :---: |', '| 1 | 2 |'].join('\n'),
  );
  assert.equal(
    updateMarkdownTableCell(table, 1, 1, 'two | value'),
    ['| A | B |', '| --- | --- |', '| 1 | two \\| value |'].join('\n'),
  );
}

function readDesktopFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

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

function testSegmenterKeepsNestedListsTogether() {
  const segments = segmentMarkdown([
    '- parent',
    '  - child',
    '    1. ordered child',
    '      continued child text',
    '- sibling',
  ].join('\n'));

  assert.equal(segments.length, 1);
  assert.equal(segments[0].type, 'list');
  assert.equal(segments[0].startLine, 1);
  assert.equal(segments[0].endLine, 5);
}

function testSegmenterStopsTablesAtBlockBoundariesAndEscapedPipes() {
  const segments = segmentMarkdown([
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '- list with | pipe',
    'Escaped \\| pipe paragraph',
  ].join('\n'));

  assert.equal(segments[0].type, 'table');
  assert.equal(segments[0].endLine, 3);
  assert.equal(segments[1].type, 'list');
  assert.equal(segments[2].type, 'paragraph');
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

function testSegmenterStopsTableBeforeEscapedPipeParagraph() {
  const source = [
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    'Escaped \\| pipe paragraph',
  ].join('\n');
  const segments = segmentMarkdown(source);

  assert.equal(segments[0].type, 'table');
  assert.equal(segments[0].endLine, 3);
  assert.equal(segments[1].type, 'paragraph');
  assert.equal(segments[1].source, 'Escaped \\| pipe paragraph');
}

function testVirtualPreviewOwnsMarkdownBlockStyles() {
  const component = readDesktopFile('src/windows/main/pages/Knowledge/components/markdown/MarkdownPreviewVirtualList.vue');
  const editor = readDesktopFile('src/windows/main/pages/Knowledge/components/KnowledgeMarkdownEditor.vue');
  const liveMermaidRule = extractCssRule(editor, '.knowledge-markdown-editor :deep(.cm-md-live-block--mermaid)');

  assert.match(component, /--knowledge-md-default-block-bg/);
  assert.match(component, /--knowledge-md-inline-code-bg/);
  assert.match(component, /--knowledge-md-code-bg/);
  assert.match(component, /--knowledge-md-table-bg/);
  assert.match(component, /--knowledge-md-diagram-bg/);
  assert.match(component, /--knowledge-md-callout-bg/);
  assert.match(component, /--knowledge-md-quote-bg/);
  assert.match(component, /\.markdown-preview-virtual-list\s+:deep\(pre\)/);
  assert.match(component, /\.markdown-preview-virtual-list\s+:deep\(table\)/);
  assert.match(component, /table-layout:\s*fixed/);
  assert.match(component, /selectionBackgroundColor\?: string/, 'expected virtual reading preview to receive the configured selection background color');
  assert.match(component, /\.markdown-preview-virtual-list :deep\(::selection\)[\s\S]*?background:\s*var\(--knowledge-selection-bg/, 'expected virtual reading preview text selection to use the configured selection background');
  assert.match(editor, /selectionBackgroundColor\?: string/, 'expected Markdown editor to accept the configured selection background color');
  assert.match(editor, /\.cm-selectionBackground,[\s\S]*?backgroundColor:\s*'var\(--knowledge-selection-bg/, 'expected CodeMirror selection background to use the configured selection background');
  assert.match(editor, /\.markdown-body :deep\(::selection\)[\s\S]*?background:\s*var\(--knowledge-selection-bg/, 'expected Markdown ReadingView selection background to match live preview');
  assert.match(editor, /var\(--knowledge-md-code-bg/, 'expected Markdown live and reading code blocks to consume configurable code background');
  assert.match(editor, /var\(--knowledge-md-table-bg/, 'expected Markdown live and reading tables to consume configurable table background');
  assert.match(editor, /var\(--knowledge-md-diagram-bg/, 'expected Markdown Mermaid and math regions to consume configurable diagram background');
  assert.match(editor, /\.cm-md-live-block--mermaid[\s\S]*?min-height:\s*0/, 'expected Markdown live preview Mermaid blocks to avoid inherited oversized block height');
  assert.match(liveMermaidRule, /width:\s*fit-content;/, 'expected Markdown live preview Mermaid block wrapper to shrink around the diagram');
  assert.match(liveMermaidRule, /max-width:\s*100%;/, 'expected Markdown live preview Mermaid block wrapper to stay within the editor width');
  assert.match(liveMermaidRule, /margin:\s*0 auto;/, 'expected Markdown live preview Mermaid block wrapper to center in the editor');
  assert.doesNotMatch(liveMermaidRule, /(^|\n)\s*width:\s*100%;/, 'expected Markdown live preview Mermaid block wrapper not to occupy a full-width row');
  assert.match(editor, /\.cm-md-live-block--mermaid \.knowledge-md-mermaid svg[\s\S]*?max-height:\s*min\(24vh,\s*280px\)/, 'expected Markdown live preview Mermaid SVGs to avoid occupying a viewport-sized block');
  assert.match(editor, /var\(--knowledge-md-callout-bg/, 'expected Markdown callouts to consume configurable callout background');
  assert.match(editor, /var\(--knowledge-md-quote-bg/, 'expected Markdown quotes to consume configurable quote background');
  assert.match(editor, /var\(--knowledge-md-inline-code-bg/, 'expected Markdown inline code to consume configurable inline-code background');
}

function testMermaidSvgSizeIsNormalizedAfterRender() {
  const renderer = readDesktopFile('src/windows/main/pages/Knowledge/utils/markdown_enhanced_render.ts');

  assert.match(renderer, /normalizeMermaidSvgSize\(element\)/, 'expected Mermaid rendering to normalize SVG size after render');
  assert.match(renderer, /svg\.getBBox\(\)/, 'expected Mermaid SVG normalization to measure actual rendered content');
  assert.match(renderer, /svg\.setAttribute\('viewBox'/, 'expected Mermaid SVG normalization to crop the viewBox to rendered content');
  assert.match(renderer, /svg\.setAttribute\('height', String\(height\)\)/, 'expected Mermaid SVG normalization to publish a compact SVG height');
  assert.match(renderer, /svg\.removeAttribute\('style'\)/, 'expected Mermaid SVG normalization to clear generated inline sizing that can keep diagrams oversized');
  assert.match(renderer, /element\.style\.width\s*=\s*'fit-content'/, 'expected Mermaid wrapper normalization to keep the rendered diagram from occupying a full-width block');
  assert.match(renderer, /requestAnimationFrame\(\(\) => normalizeMermaidSvgSize\(element, true\)\)/, 'expected Mermaid SVG normalization to retry after layout when the first measurement is not ready');
}

function testBlockCodeTextareaHeightTracksSourceLines() {
  const component = readDesktopFile('src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue');

  assert.match(component, /codeTextareaStyle/);
  assert.match(component, /:style="codeTextareaStyle"/);
  assert.match(component, /--knowledge-block-code-lines/);
}

function testBlockTableUsesInteractiveGridRenderer() {
  const component = readDesktopFile('src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue');

  assert.match(component, /block\.type === 'table'/);
  assert.match(component, /updateTableCell/);
  assert.match(component, /knowledge-block__table-cell/);
  assert.match(component, /var\(--knowledge-block-code-bg/, 'expected Notion-like code blocks to consume configurable code background');
  assert.match(component, /var\(--knowledge-block-table-bg/, 'expected Notion-like table blocks to consume configurable table background');
  assert.match(component, /var\(--knowledge-block-table-cell-bg/, 'expected Notion-like table cells to consume configurable table cell background');
  assert.match(component, /var\(--knowledge-block-callout-bg/, 'expected Notion-like callouts to consume configurable callout background');
  assert.match(component, /var\(--knowledge-block-quote-bg/, 'expected Notion-like quotes to consume configurable quote background');
  assert.match(component, /var\(--knowledge-block-inline-code-bg/, 'expected Notion-like inline code to consume configurable inline-code background');
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
testSegmenterKeepsNestedListsTogether();
testSegmenterStopsTablesAtBlockBoundariesAndEscapedPipes();
testSegmenterHandlesTrailingNewline();
testSegmenterHandlesLargeDocuments();
testSegmenterHandlesPathologicalLooseListBlankRun();
testSegmenterStopsTableBeforeEscapedPipeParagraph();
testVirtualPreviewOwnsMarkdownBlockStyles();
testMermaidSvgSizeIsNormalizedAfterRender();
testBlockCodeTextareaHeightTracksSourceLines();
testBlockTableUsesInteractiveGridRenderer();
testSanitizerRemovesUnsafeHtml();
testSanitizerRemovesDangerousDataHtmlUrls();
testSanitizerRemovesObfuscatedDangerousUrls();
testMarkdownRenderCacheReusesSameSegment();
testInAppErrorHandlerIgnoresBenignResizeObserverLoopErrors();
testKnowledgeMarkdownEditorUsesCodeMirrorImplementation();
testKnowledgePagePersonalizationContextMenus();
testMarkdownWysiwygTokensCoverGfmAndMathSyntax();
testMarkdownLivePreviewInlineTokensCoverObsidianSyntax();
testMarkdownLivePreviewBlocksCoverObsidianSyntax();
testMarkdownLivePreviewActiveRangeFallback();
testMarkdownLivePreviewTableCommandsRewriteMarkdownSource();

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
  markdownToBlockDocumentV2,
  blockDocumentV2ToPlainText,
  blockDocumentV2ToMarkdown,
  blockDocumentV2ToV1Document,
  createBlockV2,
  insertBlockAfter,
  insertBlockAfterWithResult,
  insertBlocksAfterWithResult,
  removeBlockById,
  removeBlockWithResult,
  moveBlockById,
  duplicateBlockById,
  cloneBlockV2ForPaste,
  updateBlockDocumentV2,
  attachAssetToBlockV2,
  findBlockV2,
  indentBlock,
  outdentBlock,
  splitBlockAtTextOffset,
  mergeBlockBackward,
  moveBlockAfter,
  moveBlockBefore,
} = require('../src/windows/main/utils/knowledge_blocks_v2.ts');

function testBlockV2DefaultDocument() {
  const document = createDefaultBlockDocumentV2('V2 title');
  assert.equal(document.type, 'guyantools.block-page');
  assert.equal(document.version, 2);
  assert.equal(document.blocks[0].type, 'paragraph');
  assert.deepEqual(document.blocks[0].content, []);
  assert.notEqual(document.blocks[0].type, 'heading', 'Notion-like page title must stay outside the body blocks');
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
  assert.equal(blockDocumentV2ToPlainText(parsed), '');
  assert.doesNotMatch(blockDocumentV2ToMarkdown(parsed), /^# Round trip/m);
}

function testBlockV2CanDowngradeForCurrentEditor() {
  const document = createDefaultBlockDocumentV2('Downgrade title');
  const v1 = blockDocumentV2ToV1Document(document);
  assert.equal(v1.version, 1);
  assert.equal(v1.blocks[0].type, 'paragraph');
  assert.equal(v1.blocks[0].text, '');
}

function testBlockCodecWritesVersionTwoJson() {
  const document = createDefaultBlockDocumentV2('Codec title');
  const payload = createBlockSavePayload(document, undefined);
  const parsed = JSON.parse(payload.contentJson);
  assert.equal(parsed.version, 2);
  assert.doesNotMatch(payload.contentMarkdown, /^# Codec title/m);
  assert.equal(payload.contentText, '');
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
  const block = document.blocks[0];
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

function testBlockEditorExposesCompleteNotionLikeTypes() {
  const editor = readDesktopFile('src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue');
  const renderer = readDesktopFile('src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue');
  const blockV2 = readDesktopFile('src/windows/main/utils/knowledge_blocks_v2.ts');

  for (const type of ['toggle', 'table', 'page_reference', 'todo_reference']) {
    assert.match(editor, new RegExp(`type:\\s*'${type}'`), `expected block editor insertion catalog to expose ${type}`);
  }

  assert.match(renderer, /block\.type === 'toggle'/, 'expected toggle blocks to have a dedicated renderer branch');
  assert.match(renderer, /block\.type === 'page_reference'/, 'expected page reference blocks to have a dedicated renderer branch');
  assert.match(renderer, /block\.type === 'todo_reference'/, 'expected Todo reference blocks to have a dedicated renderer branch');
  assert.match(blockV2, /block\.type === 'table'/, 'expected table blocks to have first-class Markdown derivation');
  assert.match(blockV2, /block\.type === 'toggle'/, 'expected toggle blocks to have first-class Markdown derivation');
}

function testBlockV2DerivesTableAndToggleMarkdown() {
  const table = createBlockV2('table', '| A | B |\n| --- | --- |\n| 1 | 2 |');
  const toggle = createBlockV2('toggle', 'Details');
  toggle.children = [createBlockV2('paragraph', 'Nested answer')];
  const document = {
    type: 'guyantools.block-page',
    version: 2,
    updatedAt: '2026-06-11T00:00:00.000Z',
    blocks: [table, toggle],
  };
  const markdown = blockDocumentV2ToMarkdown(document);

  assert.match(markdown, /\| A \| B \|/);
  assert.match(markdown, /<details>/);
  assert.match(markdown, /<summary>Details<\/summary>/);
  assert.match(markdown, /Nested answer/);
}

function testCanvasEditorExposesCompleteOneNoteLikeTools() {
  const toolbar = readDesktopFile('src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasToolbar.vue');
  const editor = readDesktopFile('src/windows/main/pages/Knowledge/components/KnowledgeCanvasEditor.vue');
  const renderer = readDesktopFile('src/windows/main/pages/Knowledge/components/canvas/KnowledgeCanvasElementRenderer.vue');
  const page = readDesktopFile('src/windows/main/pages/Knowledge/KnowledgePage.vue');

  assert.match(toolbar, /export type CanvasTool = 'select' \| 'text' \| 'rect' \| 'arrow' \| 'path' \| 'image' \| 'file' \| 'page_card' \| 'todo_card' \| 'group'/);
  for (const tool of ['file', 'page_card', 'todo_card', 'group']) {
    assert.match(toolbar, new RegExp(`value:\\s*'${tool}'`), `expected canvas toolbar to expose ${tool}`);
  }

  assert.match(editor, /resizeState/, 'expected canvas editor to support direct resize state');
  assert.match(editor, /locked/, 'expected canvas editor operations to honor locked elements');
  assert.match(editor, /updateSelectedBoolean\('locked'/, 'expected canvas inspector to expose locked toggle');
  assert.match(editor, /const SNAP_THRESHOLD\s*=\s*8/, 'expected canvas dragging to define a OneNote-like snap threshold');
  assert.match(editor, /snapGuides/, 'expected canvas editor to render smart alignment guides while dragging');
  assert.match(editor, /function resolveCanvasSnap/, 'expected canvas dragging to resolve snap offsets against nearby blocks');
  assert.match(editor, /function applyCanvasSnap/, 'expected canvas dragging to apply smart snap offsets');
  assert.match(editor, /event\.altKey/, 'expected Alt-drag to temporarily bypass canvas snapping');
  assert.match(editor, /knowledge-canvas-editor__snap-guide/, 'expected visible canvas snap guides in the stage');
  assert.match(editor, /function alignSelectedElements/, 'expected selected canvas elements to support align commands');
  assert.match(editor, /function distributeSelectedElements/, 'expected selected canvas elements to support distribute commands');
  assert.match(editor, /function mergeSelectedContainers/, 'expected selected canvas note containers to support merging');
  assert.match(editor, /function nudgeSelectedElements/, 'expected selected canvas elements to support keyboard nudging');
  assert.match(editor, /event\.key\.startsWith\('Arrow'\)/, 'expected Arrow keys to nudge selected canvas elements');
  assert.match(editor, /event\.shiftKey \? 10 : 1/, 'expected Shift+Arrow to use a larger canvas nudge step');
  assert.match(toolbar, /\(event: 'align'/, 'expected toolbar to emit canvas align commands');
  assert.match(toolbar, /\(event: 'distribute'/, 'expected toolbar to emit canvas distribute commands');
  assert.match(toolbar, /\(event: 'merge'\)/, 'expected toolbar to emit canvas container merge command');
  assert.match(renderer, /resize-start/, 'expected selected canvas elements to emit resize handle events');
  assert.match(renderer, /canvasElementLabel/, 'expected canvas cards to render type-specific labels');
  assert.match(renderer, /function isInlineTextEditable/, 'expected canvas renderer to share one direct-edit predicate for text-like elements');
  for (const type of ['rich_text', 'rect', 'file', 'page_card', 'todo_card', 'group']) {
    assert.match(renderer, new RegExp(`['"]${type}['"]`), `expected canvas renderer inline editing to cover ${type}`);
  }
  assert.match(renderer, /@pointerdown\.stop/, 'expected canvas inline text editor pointerdown to avoid starting element drag');
  assert.match(editor, /inlineTextEditableElementTypes/, 'expected canvas inspector text editing to share text-like element coverage');
  assert.match(editor, /kind: 'image' \| 'file'/, 'expected canvas asset payloads to support image and file cards');
  assert.match(editor, /chooseFileAsset/, 'expected canvas file cards to expose attachment selection');
  assert.match(page, /kind: 'image' \| 'file'/, 'expected canvas asset handler to preserve image/file payload kind');
  assert.match(page, /canvas:\s*'画布元素'/, 'expected block style panel to expose canvas element styling');
  assert.match(page, /--knowledge-canvas-element-bg/, 'expected knowledge page to publish canvas element background CSS variable');
  assert.match(renderer, /function fillValue/, 'expected canvas renderer to centralize fill fallback for configurable element backgrounds');
  assert.match(renderer, /function isLegacyDefaultFill/, 'expected canvas renderer to treat old built-in fills as global-scheme defaults');
  assert.match(renderer, /isLegacyDefaultFill\(fill\)/, 'expected legacy canvas default fills to fall back to configurable canvas element background');
  assert.match(renderer, /var\(--knowledge-canvas-element-bg/, 'expected canvas elements to consume configurable canvas element background');
  assert.match(renderer, /background:\s*var\(--knowledge-canvas-element-bg/, 'expected canvas text/editor surfaces to consume configurable canvas element background');
  assert.match(editor, /var\(--knowledge-selection-bg/, 'expected canvas marquee selection to use the configured selection background');
  assert.match(editor, /UiColorPicker/, 'expected canvas color choices to use the shared color picker component');
  assert.doesNotMatch(editor, /style:\s*\{\s*fill:\s*'rgba\(74, 144, 217, 0\.12\)'/, 'page cards should not hard-code a default fill that bypasses global appearance schemes');
  assert.doesNotMatch(editor, /style:\s*\{\s*fill:\s*'rgba\(34, 197, 94, 0\.12\)'/, 'todo cards should not hard-code a default fill that bypasses global appearance schemes');
  assert.match(editor, /\.knowledge-canvas-editor\s*\{[\s\S]*?background:\s*transparent/, 'expected canvas editor shell to preserve configured editor/page backgrounds');
  assert.match(editor, /\.knowledge-canvas-editor__stage\s*\{[\s\S]*?background:\s*transparent/, 'expected canvas stage to preserve configured editor/page backgrounds');
}

function testBlockEditorHasFocusAndMarkdownShortcuts() {
  const editor = readDesktopFile('src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue');
  const renderer = readDesktopFile('src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue');

  assert.match(editor, /pendingFocusBlockId/, 'expected block editor to track the block that should receive focus after insertion');
  assert.match(editor, /focus-block-id/, 'expected block editor to pass focus target into renderers');
  assert.match(renderer, /editableRef/, 'expected block renderer to keep a focusable primary contenteditable ref');
  assert.match(renderer, /applyMarkdownShortcut/, 'expected block renderer to convert Markdown shortcuts into block types');
  assert.match(renderer, /value === '# '/, 'expected heading Markdown shortcut');
  assert.match(renderer, /headingLevel/, 'expected heading blocks to derive display level from attrs');
  assert.match(renderer, /knowledge-block__editable--heading-\$\{headingLevel\.value\}/, 'expected heading blocks to apply a level-specific class');
  assert.match(renderer, /\.knowledge-block__editable--heading-1[\s\S]*?font-size:\s*32px/, 'expected H1 blocks to render larger than body text');
  assert.match(renderer, /\.knowledge-block__editable--heading-2[\s\S]*?font-size:\s*25px/, 'expected H2 blocks to render with a middle heading size');
  assert.match(renderer, /\.knowledge-block__editable--heading-3[\s\S]*?font-size:\s*19px/, 'expected H3 blocks to render smaller than H2');
  assert.match(renderer, /\.knowledge-block__editable--heading-4[\s\S]*?font-size:\s*16px/, 'expected H4 blocks to match the Notion-like compact heading command');
  assert.match(renderer, /value === '\* ' \|\| value === '- ' \|\| value === '\+ '/, 'expected Notion-like bullet list Markdown shortcuts');
  assert.match(renderer, /value === '1\. '/, 'expected ordered list Markdown shortcut');
  assert.match(renderer, /value === '---'/, 'expected divider Markdown shortcut');
  assert.match(renderer, /value === '\[x\] ' \|\| value === '\[X\] '/, 'expected checked task Markdown shortcut');
  assert.match(renderer, /value === '> '[\s\S]*?emitShortcutConversion\('toggle'/, 'expected > space to create a toggle list');
  assert.match(renderer, /value === '" '[\s\S]*?emitShortcutConversion\('quote'/, 'expected double-quote space to create a quote block');
  assert.match(renderer, /value === '```'/, 'expected code block Markdown shortcut');
}

function testNotionLikeBlockEditingContracts() {
  const editor = readDesktopFile('src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue');
  const renderer = readDesktopFile('src/windows/main/pages/Knowledge/components/block/KnowledgeBlockRenderer.vue');
  const handle = readDesktopFile('src/windows/main/pages/Knowledge/components/block/KnowledgeBlockHandle.vue');
  const slashMenu = readDesktopFile('src/windows/main/pages/Knowledge/components/block/KnowledgeSlashMenu.vue');
  const blockV2 = readDesktopFile('src/windows/main/utils/knowledge_blocks_v2.ts');
  const editingUtilsPath = path.join(
    __dirname,
    '../src/windows/main/pages/Knowledge/utils/knowledge_block_editing.ts',
  );
  const codeTemplate = renderer.match(/<template v-else-if="block\.type === 'code'">[\s\S]*?<\/template>/)?.[0] ?? '';
  const tableTemplate = renderer.match(/<template v-else-if="block\.type === 'table'">[\s\S]*?<template v-else-if="block\.type === 'image'/)?.[0] ?? '';

  assert.match(renderer, /contenteditable/, 'expected block renderer to use contenteditable for Notion-like text editing');
  assert.match(renderer, /beforeinput/, 'expected block renderer to intercept beforeinput for document editing behavior');
  assert.match(renderer, /compositionstart/, 'expected block renderer to respect IME composition start');
  assert.match(renderer, /compositionend/, 'expected block renderer to respect IME composition end');
  assert.match(renderer, /split-block/, 'expected renderer to emit block split requests');
  assert.match(renderer, /merge-backward/, 'expected renderer to emit backward merge requests');
  assert.match(renderer, /focus-previous-block/, 'expected renderer to request previous block focus on ArrowUp at block start');
  assert.match(renderer, /focus-next-block/, 'expected renderer to request next block focus on ArrowDown at block end');
  assert.match(renderer, /function isCaretAtEnd/, 'expected renderer to detect when the caret is at the end of a block');
  assert.match(renderer, /event\.key === 'ArrowUp'/, 'expected ArrowUp at block start to move focus to the previous block');
  assert.match(renderer, /event\.key === 'ArrowDown'/, 'expected ArrowDown at block end to move focus to the next block');
  assert.match(
    renderer,
    /\(event\.metaKey \|\| event\.ctrlKey\) && !event\.shiftKey && event\.key === 'Enter'/,
    'expected Ctrl/Cmd+Enter to toggle Notion-like task and toggle block state',
  );
  assert.match(
    renderer,
    /function toggleBlockCheckedOrOpen/,
    'expected renderer to centralize Ctrl/Cmd+Enter state toggling for task and toggle blocks',
  );
  assert.match(
    renderer,
    /shouldConvertEmptyBlockBackToParagraph/,
    'expected empty non-paragraph blocks to turn back into paragraph on Backspace',
  );
  assert.match(renderer, /apply-inline-mark/, 'expected renderer to expose inline mark actions');
  assert.match(renderer, /class="knowledge-block-inline-toolbar"/, 'expected renderer to expose a floating inline toolbar');
  assert.match(renderer, /role="toolbar"[\s\S]*?aria-label="文本格式"/, 'expected inline toolbar to expose a text formatting toolbar role');
  assert.match(renderer, /knowledge-block-inline-toolbar__divider/, 'expected inline toolbar to visually group Notion-like text actions');
  assert.match(renderer, /const toolbarHalfWidth = 88/, 'expected inline toolbar positioning to clamp from the centered toolbar width');
  assert.match(renderer, /window\.innerWidth - toolbarHalfWidth/, 'expected inline toolbar positioning to stay inside the viewport');
  assert.match(renderer, /transform:\s*translate\(-50%, -100%\)/, 'expected inline toolbar to center above the text selection');
  assert.match(renderer, /\.knowledge-block-inline-toolbar\s*\{[^}]*background:\s*rgb\(25 25 25\)/, 'expected inline toolbar to use a Notion-like dark floating surface');
  assert.doesNotMatch(renderer, /\.knowledge-block-inline-toolbar\s*\{[^}]*background:\s*var\(--ui-surface-panel\)/, 'inline toolbar should not look like a normal light panel');
  assert.match(renderer, /<UiButton[\s\S]*?@mousedown\.prevent="applyInlineMark\('bold'\)"/, 'expected inline toolbar to use shared buttons for marks');
  assert.match(renderer, /iconify:lucide:bold/, 'expected inline toolbar to use icon buttons instead of raw text controls');
  assert.match(renderer, /editableHtmlToInlineContent/, 'expected renderer to parse editable HTML into inline content');
  assert.match(renderer, /inlineContentToEditableHtml/, 'expected renderer to render inline content into editable HTML');
  assert.doesNotMatch(
    renderer,
    /<template v-else>\s*<UiTextarea/,
    'generic text blocks should not fall back to a textarea form control',
  );

  assert.match(handle, /draggable/, 'expected block handle to expose a draggable grip');
  assert.match(handle, /dragstart/, 'expected block handle to emit drag start');
  assert.match(handle, /event: 'menu'/, 'expected block handle grip to open a Notion-like block action menu');
  assert.match(handle, /insert-after/, 'expected block handle to keep a plus insertion affordance');
  assert.match(handle, /position:\s*absolute/, 'expected Notion-like block handle to float beside the block instead of occupying a layout column');
  assert.match(handle, /flex-direction:\s*row/, 'expected Notion-like block handle controls to sit horizontally');
  assert.doesNotMatch(renderer, /grid-template-columns:\s*32px minmax\(0,\s*1fr\)/, 'block rows should not reserve a permanent action-handle column');
  assert.doesNotMatch(handle, /title="上移"/, 'Notion-like block handle should not rely on permanent up/down buttons');
  assert.doesNotMatch(handle, /title="下移"/, 'Notion-like block handle should not rely on permanent up/down buttons');

  assert.match(slashMenu, /activeIndex/, 'expected slash menu to track an active keyboard item');
  assert.match(slashMenu, /prefix\?: '\/' \| '\+'/, 'expected slash menu to preserve whether it was opened by slash or plus');
  assert.match(slashMenu, /displayPrefix/, 'expected slash menu display to reflect the active command prefix');
  assert.match(slashMenu, /ArrowDown/, 'expected slash menu ArrowDown navigation');
  assert.match(slashMenu, /ArrowUp/, 'expected slash menu ArrowUp navigation');
  assert.match(slashMenu, /event\.key === 'Home'/, 'expected slash menu Home navigation');
  assert.match(slashMenu, /event\.key === 'End'/, 'expected slash menu End navigation');
  assert.match(slashMenu, /Enter/, 'expected slash menu Enter selection');
  assert.match(slashMenu, /Escape/, 'expected slash menu Escape close');
  assert.match(slashMenu, /pointerdown/, 'expected slash menu to close from outside pointer interactions like Notion');
  assert.match(slashMenu, /function handleGlobalPointerdown/, 'expected slash menu to centralize outside-click closing');
  assert.match(slashMenu, /aria-activedescendant/, 'expected slash menu to expose the active item to assistive tech');
  assert.match(slashMenu, /knowledge-slash-menu__footer/, 'expected slash menu to render Notion-like keyboard hints');
  assert.match(slashMenu, /\{\{ displayQuery \|\| displayPrefix \}\}输入以搜索/, 'expected slash menu footer to mirror the Notion slash-query hint');
  assert.match(slashMenu, /关闭菜单 <kbd>esc<\/kbd>/, 'expected slash menu footer to use the Notion-like close hint');
  assert.match(slashMenu, /description/, 'expected slash menu commands to include Notion-like descriptions');
  assert.match(slashMenu, /shortcut/, 'expected slash menu commands to include visible shortcut hints');
  assert.doesNotMatch(slashMenu, /knowledge-slash-menu__search-row/, 'slash menu should not add a separate form-like search row');
  assert.doesNotMatch(slashMenu, /placeholder="筛选块类型"/, 'slash menu should keep the Notion-like query hint in the footer');
  assert.match(slashMenu, /knowledge-slash-menu__section-label/, 'expected slash menu groups to read like Notion command sections');
  assert.match(slashMenu, /type SlashMenuOption = \{[\s\S]*?attrs\?: Record<string, unknown>/, 'expected slash menu options to carry block attrs such as heading levels');
  assert.match(slashMenu, /const suggestedCommands = \[/, 'expected slash menu to define a Notion-like Suggested section order by command id');
  assert.match(slashMenu, /group: '建议'/, 'expected slash menu to place common empty-query blocks in a Suggested section');
  assert.match(slashMenu, /if \(query\) return options;/, 'expected slash menu search results to avoid empty-query suggested reordering');
  assert.match(slashMenu, /filter\(\(option\) => !suggestedCommandSet\.has\(optionCommandKey\(option\)\)\)/, 'expected slash menu suggested blocks to avoid duplicate entries while allowing multiple heading levels');
  assert.match(slashMenu, /knowledge-slash-menu__icon-card/, 'expected slash menu options to use Notion-like square icon cards');
  assert.match(slashMenu, /knowledge-slash-menu__body/, 'expected slash menu to separate scrollable body from header and footer');
  assert.match(slashMenu, /width:\s*min\(324px, calc\(100vw - 24px\)\)/, 'expected slash menu popover to match the compact Notion command menu width');
  assert.match(slashMenu, /box-shadow:[\s\S]*0 12px 28px/, 'expected slash menu popover to use a Notion-like floating shadow');
  assert.doesNotMatch(slashMenu, /backdrop-filter/, 'slash menu should read as a solid Notion-like command palette, not glass');

  assert.match(editor, /draggedBlockId/, 'expected block editor to track dragged blocks');
  assert.match(editor, /function selectSlashBlock/, 'expected block editor to handle slash menu selection');
  assert.match(editor, /prefix: '\/' \| '\+'/, 'expected editor slash menu state to track Notion-like slash and plus prefixes');
  assert.match(editor, /function isBlockCommandText/, 'expected editor to centralize slash and plus command text detection');
  assert.match(editor, /value\.startsWith\('\/'\) \|\| value\.startsWith\('\+'\)/, 'expected editor command text detection to support + as well as /');
  assert.match(editor, /:prefix="slashMenu\?\.prefix \?\? '\/'"/, 'expected editor to pass the active command prefix into the command menu');
  assert.match(editor, /function selectSlashBlock\(type: KnowledgeBlockV2Type, attrsPatch: Record<string, unknown> = \{\}\)/, 'expected slash menu selection to accept explicit block attrs');
  assert.match(editor, /selectSlashBlock[\s\S]*?convertBlock\(block\.id, type, attrsPatch\)/, 'expected slash menu selection to convert the current block with attrs such as heading level');
  assert.doesNotMatch(editor, /selectSlashBlock[\s\S]*?addBlock\(type, block\.id\)/, 'slash menu selection should not append a new block instead of converting the current slash block');
  assert.match(renderer, /function blockCommandPrefix/, 'expected renderer to detect both Notion command prefixes');
  assert.match(renderer, /value\.startsWith\('\/'\)/, 'expected renderer to keep slash command entry');
  assert.match(renderer, /value\.startsWith\('\+'\)/, 'expected renderer to support plus command entry');
  assert.match(renderer, /prefix,\s*rect:/, 'expected renderer to emit the command prefix with slash menu open events');
  assert.match(editor, /const SLASH_MENU_WIDTH = 324/, 'expected slash menu positioning to use the rendered menu width');
  assert.match(editor, /const BLOCK_MENU_WIDTH = 324/, 'expected block menu positioning to use the rendered menu width');
  assert.match(editor, /function clampMenuAxis/, 'expected floating command menus to clamp inside small viewports');
  assert.match(editor, /clampMenuAxis\(\(rect\?\.left \?\? 24\) - 4, SLASH_MENU_WIDTH, window\.innerWidth\)/, 'expected slash menu x-position to clamp against the viewport');
  assert.match(editor, /clampMenuAxis\(\(rect\?\.left \?\? 24\) - 4, BLOCK_MENU_WIDTH, window\.innerWidth\)/, 'expected block menu x-position to clamp against the viewport');
  assert.match(editor, /dropTargetBlockId/, 'expected block editor to track drop targets');
  assert.match(editor, /moveBlockBefore/, 'expected block editor to move blocks before arbitrary targets');
  assert.match(editor, /dropTargetPlacement/, 'expected block editor to track before-or-after drag placement like Notion');
  assert.match(editor, /type DropPlacement = 'before' \| 'after'/, 'expected editor drag placement to stay explicit');
  assert.match(editor, /function handleBlockDragLeave/, 'expected editor to clear stale drag insertion previews on drag leave');
  assert.match(editor, /function getDraggingBlockIds/, 'expected editor to resolve single-block and selected-range drag payloads');
  assert.match(editor, /selectedBlockIds\.value\.includes\(blockId\) \? selectedBlockIds\.value : \[blockId\]/, 'expected dragging a selected block to move the whole selected range');
  assert.match(editor, /draggingIds\.includes\(payload\.blockId\)/, 'expected selected-range drag to ignore drops onto any selected block');
  assert.match(editor, /const orderedDraggingIds = payload\.placement === 'before'[\s\S]*?\[\.{3}draggingIds\]\.reverse\(\)/, 'expected after-target range drops to reverse iteration and preserve selection order');
  assert.match(editor, /for \(const blockId of orderedDraggingIds\)/, 'expected selected-range drag drops to move every dragged block');
  assert.match(editor, /draggingIds\.length > 1[\s\S]*?focusSelectedBlockShell\(\)/, 'expected range drops to keep keyboard focus on the selected-block shell');
  assert.match(editor, /payload\.placement === 'before'[\s\S]*?moveBlockBefore/, 'expected before drop placement to move the dragged block before the target');
  assert.match(editor, /moveBlockAfter\(nextDocument, blockId, payload\.blockId\)/, 'expected after drop placement to move the dragged block after the target');
  assert.match(editor, /:drop-target-placement="dropTargetPlacement"/, 'expected editor to pass the active drop placement into block renderers');
  assert.match(editor, /@drag-leave="handleBlockDragLeave"/, 'expected editor to clear block drag state from renderer dragleave events');
  assert.match(renderer, /resolveDropPlacement/, 'expected renderer to resolve whether the pointer is above or below the block midpoint');
  assert.match(renderer, /event\.clientY > rect\.top \+ rect\.height \/ 2 \? 'after' : 'before'/, 'expected renderer to use the block midpoint for Notion-like insertion placement');
  assert.match(renderer, /dropTargetPlacement\?: DropPlacement \| null/, 'expected renderer to receive before-or-after drag placement');
  assert.match(renderer, /knowledge-block--drop-before/, 'expected renderer to style before drop insertion lines');
  assert.match(renderer, /knowledge-block--drop-after/, 'expected renderer to style after drop insertion lines');
  assert.match(renderer, /@dragleave="event => emit\('drag-leave'/, 'expected renderer to emit dragleave for clearing stale drop previews');
  assert.match(editor, /blockMenu/, 'expected block editor to expose a block action menu from the handle');
  assert.match(editor, /runBlockMenuAction/, 'expected block action menu to route convert, duplicate, indent, and delete actions');
  assert.match(editor, /function getBlockMenuTargetIds/, 'expected block action menu to resolve selected-range targets');
  assert.match(editor, /selectedBlockIds\.value\.includes\(blockId\) \? selectedBlockIds\.value : \[blockId\]/, 'expected block menu actions opened inside a selection to apply to the whole selected range');
  assert.match(editor, /const lastTargetId = targetIds\[targetIds\.length - 1\] \?\? blockId/, 'expected block menu insertion to happen after the selected range');
  assert.match(editor, /targetIds\.length > 1 \? duplicateSelectedBlocks\(\) : duplicateBlock\(blockId\)/, 'expected block menu duplicate to preserve selected-range behavior');
  assert.match(editor, /targetIds\.length > 1 \? removeSelectedBlocks\(\) : removeBlock\(blockId\)/, 'expected block menu delete to preserve selected-range behavior');
  assert.match(editor, /targetIds\.length > 1 \? indentSelectedBlocks\('indent'\) : indentBlockDraft\(blockId\)/, 'expected block menu indent to preserve selected-range behavior');
  assert.match(editor, /targetIds\.forEach\(\(targetId\) => emit\('convert-todo', targetId\)\)/, 'expected block menu Todo conversion to apply to every selected target');
  assert.match(editor, /function convertBlocks\(blockIds: string\[\], type: KnowledgeBlockV2Type, attrsPatch: Record<string, unknown> = \{\}\)/, 'expected block conversion to support selected ranges and heading attrs');
  assert.match(editor, /convertBlock\(blockId: string, type: KnowledgeBlockV2Type, attrsPatch: Record<string, unknown> = \{\}\)/, 'expected single-block conversion to forward attrs such as heading level');
  assert.match(editor, /\.\.\.defaultAttrsForType\(type, block\.attrs\),[\s\S]*?\.\.\.attrsPatch/, 'expected conversion attrs to preserve defaults while applying explicit heading levels');
  assert.match(editor, /convertBlocks\(targetIds, 'heading', \{ level: 1 \}\)/, 'expected Heading 1 menu action to set heading level 1');
  assert.match(editor, /convertBlocks\(targetIds, 'heading', \{ level: 2 \}\)/, 'expected Heading 2 menu action to set heading level 2');
  assert.match(editor, /convertBlocks\(targetIds, 'heading', \{ level: 3 \}\)/, 'expected Heading 3 menu action to set heading level 3');
  assert.match(editor, /id: 'heading_4'[\s\S]*?attrs: \{ level: 4 \}/, 'expected slash menu to expose Heading 4 with explicit attrs');
  assert.match(editor, /blockMenuGroups/, 'expected block menu commands to be data-driven for consistent keyboard behavior');
  assert.match(editor, /convert_todo/, 'expected block menu to expose Todo conversion as a block action');
  assert.match(editor, /heading_1/, 'expected block menu to expose Heading 1 without a permanent heading dropdown');
  assert.match(editor, /heading_2/, 'expected block menu to expose Heading 2 without a permanent heading dropdown');
  assert.match(editor, /heading_3/, 'expected block menu to expose Heading 3 without a permanent heading dropdown');
  assert.doesNotMatch(renderer, /UiSelect[\s\S]*?level/, 'heading levels should be changed from the block menu, not a permanent inline select');
  assert.match(editor, /emit\('convert-todo', blockId\)/, 'expected Todo conversion to stay routed through the editor event contract');
  assert.match(editor, /blockMenuQuery/, 'expected block menu to support Notion-like command search');
  assert.match(editor, /blockMenuSearchRef/, 'expected block menu search input to receive focus when the menu opens');
  assert.match(editor, /blockMenuSearchRef\.value\?\.focus\(\{ preventScroll: true \}\)/, 'expected block menu typing to immediately filter commands after opening');
  assert.match(editor, /ref="blockMenuSearchRef"/, 'expected block menu search input to expose a template ref for focus management');
  assert.match(editor, /filteredBlockMenuGroups/, 'expected block menu to filter commands by search query');
  assert.match(editor, /placeholder="搜索操作或转换类型"/, 'expected block menu search input to explain command filtering');
  assert.match(editor, /knowledge-block-menu__header/, 'expected block menu to use a Notion-like command header');
  assert.match(editor, /knowledge-block-menu__search/, 'expected block menu to render a dedicated search field');
  assert.match(editor, /knowledge-block-menu__body/, 'expected block menu to isolate the scrollable command body');
  assert.match(editor, /<UiScrollbar[\s\S]*?class="knowledge-block-menu__scrollbar"/, 'expected block menu to use the shared scrollbar component');
  assert.match(editor, /knowledge-block-menu__section-label/, 'expected block menu groups to show readable section labels');
  assert.match(editor, /knowledge-block-menu__icon-card/, 'expected block menu items to use Notion-like square icon cards');
  assert.match(editor, /knowledge-block-menu__footer/, 'expected block menu to show keyboard hints like the slash menu');
  assert.match(editor, /\.knowledge-block-menu\s*\{[^}]*box-shadow:\s*0 12px 24px/, 'expected block menu popover to use the Notion-like floating shadow');
  assert.doesNotMatch(editor, /\.knowledge-block-menu\s*\{[^}]*backdrop-filter/, 'block menu should read as a solid Notion-like command palette, not glass');
  assert.match(editor, /knowledge-block-menu__empty/, 'expected block menu to render an empty state when no command matches');
  assert.match(editor, /activeBlockMenuIndex/, 'expected block menu to track an active keyboard item');
  assert.match(editor, /function handleBlockMenuKeydown/, 'expected block menu to support keyboard navigation');
  assert.match(editor, /event\.key === 'ArrowDown'/, 'expected block menu ArrowDown navigation');
  assert.match(editor, /event\.key === 'ArrowUp'/, 'expected block menu ArrowUp navigation');
  assert.match(editor, /event\.key === 'Home'/, 'expected block menu Home navigation');
  assert.match(editor, /event\.key === 'End'/, 'expected block menu End navigation');
  assert.match(editor, /event\.key === 'Enter' \|\| event\.key === ' '/, 'expected block menu Enter/Space activation');
  const blockMenuKeydown = editor.match(/function handleBlockMenuKeydown[\s\S]*?\n}\n\nwatch/)?.[0] ?? '';
  assert.ok(
    blockMenuKeydown.indexOf("event.key === 'Escape'") < blockMenuKeydown.indexOf("event.key === 'ArrowDown'"),
    'block menu Escape should be checked before result-count-gated navigation branches',
  );
  assert.match(editor, /knowledge-block-menu__item--active/, 'expected block menu to expose a visible active item state');
  assert.match(editor, /focusWritingSurface/, 'expected clicking blank document space to return focus to writing');
  assert.match(editor, /function isTextEntryBlock/, 'expected blank document clicks to distinguish text-entry blocks from media or structural blocks');
  assert.match(editor, /function focusBlockForWriting/, 'expected repeated blank document clicks to reuse an existing empty text block focus path');
  assert.match(editor, /addBlock\('paragraph', lastBlock\.id\)/, 'expected blank document clicks after non-empty content to append a paragraph like Notion');
  assert.match(renderer, /props\.isFirst && props\.block\.type === 'paragraph' && blockText\.value\.length === 0/, 'expected the first empty paragraph to expose a dedicated writing placeholder');
  assert.match(renderer, /输入 \/ 选择命令，或直接开始书写/, 'expected the first empty paragraph placeholder to explain the Notion-like writing entry point');
  assert.match(editor, /function focusPreviousBlock/, 'expected editor to focus the previous block for ArrowUp navigation');
  assert.match(editor, /function focusNextBlock/, 'expected editor to focus the next block for ArrowDown navigation');
  assert.match(editor, /@focus-previous-block="focusPreviousBlock"/, 'expected editor to wire previous-block focus navigation');
  assert.match(editor, /@focus-next-block="focusNextBlock"/, 'expected editor to wire next-block focus navigation');
  assert.match(renderer, /select-block/, 'expected Escape from block editing to request whole-block selection');
  assert.match(renderer, /event\.key === 'Escape'/, 'expected renderer to select the current block when pressing Escape in edit mode');
  assert.match(renderer, /paste-markdown/, 'expected block renderer to emit Markdown paste requests instead of relying on raw contenteditable paste');
  assert.match(renderer, /function handleEditablePaste/, 'expected editable blocks to intercept multi-line or Markdown clipboard text');
  assert.match(renderer, /clipboardData\.getData\('text\/plain'\)/, 'expected editable paste handling to read plain text clipboard data');
  assert.match(renderer, /shouldPasteAsBlocks/, 'expected editable paste handling to keep simple inline text native while parsing Markdown-like content into blocks');
  assert.match(renderer, /knowledge-block__code-shell/, 'expected code blocks to render as Notion-like code containers instead of standalone form fields');
  assert.match(renderer, /knowledge-block__code-header/, 'expected code blocks to place the language control in a compact code header');
  assert.doesNotMatch(codeTemplate, /<UiInput/, 'code language control should not render through a shared form input');
  assert.match(renderer, /<input[\s\S]*?class="knowledge-block__code-language"[\s\S]*?@input="event => updateAttrs/, 'expected code language to use a compact native inline input');
  assert.doesNotMatch(renderer, /<label class="knowledge-block__code-language">[\s\S]*?<span>语言<\/span>/, 'code block language control should not look like a labeled form row');
  assert.match(renderer, /\.knowledge-block__code-shell[\s\S]*?background:\s*var\(--knowledge-block-code-bg,[\s\S]*?color-mix\(in srgb, var\(--ui-surface-panel-muted\) 38%, transparent\)\)/, 'expected code block shell to stay configurable, translucent, and page-integrated');
  assert.match(renderer, /\.knowledge-block__code[\s\S]*?border:\s*0/, 'expected code textarea itself to have no inner form border');
  assert.match(renderer, /block\.type === 'callout'[\s\S]*?knowledge-block__callout/, 'expected callout blocks to render as Notion-like icon callouts');
  assert.match(renderer, /iconify:lucide:lightbulb/, 'expected callout blocks to expose a Notion-like callout icon');
  assert.match(renderer, /\.knowledge-block--quote \.knowledge-block__body\s*\{[\s\S]*?border-left:\s*3px solid/, 'expected quote blocks to render as Notion-like left-rule quotes');
  assert.doesNotMatch(renderer, /\.knowledge-block--callout \.knowledge-block__body/, 'callout blocks should not share the generic quote panel styling');
  assert.match(renderer, /knowledge-block__table-frame/, 'expected table blocks to use an inline frame instead of a form-like action panel');
  assert.match(renderer, /import UiScrollbar/, 'expected block renderer to reuse the shared scrollbar component');
  assert.match(renderer, /knowledge-block__table-scrollbar/, 'expected wide tables to use the shared scrollbar component');
  assert.doesNotMatch(renderer, /\.knowledge-block__table-shell\s*\{[\s\S]*?overflow-x:\s*auto/, 'table blocks should not use native horizontal scrollbars');
  assert.match(renderer, /knowledge-block__table-edge-actions--column/, 'expected table column actions to live on the table edge');
  assert.match(renderer, /knowledge-block__table-edge-actions--row/, 'expected table row actions to live on the table edge');
  assert.doesNotMatch(renderer, /knowledge-block__table-actions/, 'table blocks should not render a permanent row and column button toolbar');
  assert.doesNotMatch(renderer, /knowledge-block__table-row-action/, 'table row removal should not occupy a visible table column');
  assert.doesNotMatch(tableTemplate, /<UiInput/, 'table cells should not render through shared form inputs');
  assert.match(renderer, /<input[\s\S]*?class="knowledge-block__table-cell"[\s\S]*?@input="event => updateTableCell/, 'expected table cells to use native inline inputs');
  assert.match(renderer, /\.knowledge-block__table\s*\{[\s\S]*?background:\s*var\(--knowledge-block-table-bg, transparent\)/, 'expected table frame to use configurable transparency instead of a large panel that hides the background');
  assert.match(renderer, /\.knowledge-block__table-cell[\s\S]*?background:\s*var\(--knowledge-block-table-cell-bg, transparent\)/, 'expected table cell inputs to read as inline editable cells with configurable transparency');
  assert.match(renderer, /knowledge-block__reference-line/, 'expected reference blocks to render as light inline rows instead of cards');
  assert.doesNotMatch(renderer, /knowledge-block__reference-card/, 'reference blocks should not use heavy card styling in the writing surface');
  assert.match(renderer, /knowledge-block__reference-id[\s\S]*?opacity:\s*0/, 'expected reference technical ids to stay hidden until hover or focus');
  assert.match(renderer, /knowledge-block__asset-actions[\s\S]*?opacity:\s*0/, 'expected asset actions to stay hidden until hover or focus');
  assert.doesNotMatch(renderer, />\s*打开\s*<\/UiButton>/, 'asset action buttons should use compact icon affordances');
  assert.doesNotMatch(renderer, />\s*在系统中显示\s*<\/UiButton>/, 'asset action buttons should not expose long labels in the writing surface');
  assert.match(editor, /function pasteMarkdownAfterBlock/, 'expected editor to paste Markdown clipboard content as blocks after the current block');
  assert.match(editor, /@paste-markdown="pasteMarkdownAfterBlock"/, 'expected editor to wire block-level Markdown paste requests');
  assert.match(renderer, /selected-block-id/, 'expected renderer to receive the currently selected block id');
  assert.match(renderer, /aria-selected/, 'expected selected block state to be exposed accessibly');
  assert.match(editor, /selectedBlockId/, 'expected editor to track Notion-like selected block state');
  assert.match(editor, /selectedBlockAnchorId/, 'expected editor to keep a block-selection anchor for Shift+Arrow range selection');
  assert.match(editor, /selectedBlockIds/, 'expected editor to derive the selected block range for multi-block selection visuals');
  assert.match(editor, /editorCanvasRef/, 'expected editor shell to be focusable for selected-block shortcuts');
  assert.match(editor, /function selectBlock/, 'expected editor to select a whole block from Escape or block shell actions');
  assert.match(editor, /function focusSelectedBlockShell/, 'expected selecting a block to move focus from contenteditable into the editor shell');
  assert.match(editor, /selectBlock[\s\S]*?focusSelectedBlockShell\(\)/, 'expected selectBlock to focus the selected-block keyboard shell');
  assert.match(editor, /function handleSelectedBlockKeydown/, 'expected editor to handle keyboard actions for selected blocks');
  assert.match(editor, /function extendSelectedBlockRange/, 'expected selected block Shift+Arrow navigation to extend a selected block range');
  assert.match(renderer, /data-knowledge-block-id/, 'expected rendered blocks to expose a stable DOM id for selected-block keyboard menus');
  assert.match(editor, /function getSelectedBlockRect/, 'expected selected blocks to resolve their DOM rect for keyboard-opened menus');
  assert.match(editor, /function openSelectedBlockMenu/, 'expected selected blocks to open the block menu without using the mouse handle');
  assert.match(editor, /\(event\.metaKey \|\| event\.ctrlKey\) && !event\.shiftKey && event\.key === '\/'/, 'expected Ctrl/Cmd+/ to open the selected block menu');
  assert.match(editor, /openSelectedBlockMenu\(\)/, 'expected selected block keyboard shortcut to call the block menu opener');
  assert.match(editor, /event\.shiftKey && event\.key === 'ArrowUp'/, 'expected Shift+ArrowUp to extend selected blocks upward');
  assert.match(editor, /event\.shiftKey && event\.key === 'ArrowDown'/, 'expected Shift+ArrowDown to extend selected blocks downward');
  assert.match(editor, /extendSelectedBlockRange\(-1\)/, 'expected Shift+ArrowUp to use the block range extension path');
  assert.match(editor, /extendSelectedBlockRange\(1\)/, 'expected Shift+ArrowDown to use the block range extension path');
  assert.match(editor, /event\.key === 'ArrowUp'/, 'expected selected block ArrowUp navigation');
  assert.match(editor, /event\.key === 'ArrowDown'/, 'expected selected block ArrowDown navigation');
  assert.match(editor, /function moveSelectedBlock/, 'expected selected blocks to move with Notion-like keyboard shortcuts');
  assert.match(editor, /function moveSelectedBlocks/, 'expected selected block ranges to move as a batch');
  assert.match(editor, /\(event\.metaKey \|\| event\.ctrlKey\) && event\.shiftKey && event\.key === 'ArrowUp'/, 'expected Ctrl/Cmd+Shift+ArrowUp to move selected block up');
  assert.match(editor, /\(event\.metaKey \|\| event\.ctrlKey\) && event\.shiftKey && event\.key === 'ArrowDown'/, 'expected Ctrl/Cmd+Shift+ArrowDown to move selected block down');
  assert.match(editor, /moveSelectedBlocks\(-1\)/, 'expected selected block ArrowUp move path');
  assert.match(editor, /moveSelectedBlocks\(1\)/, 'expected selected block ArrowDown move path');
  assert.match(editor, /selectedBlockIds\.value\.length <= 1[\s\S]*?moveSelectedBlock\(direction\)/, 'expected range movement to preserve the single-block move path');
  assert.match(editor, /moveBlockBefore\(nextDocument, blockId, adjacentBlock\.id\)/, 'expected moving a range upward to place every selected block before the previous neighbor');
  assert.match(editor, /moveBlockBefore\(nextDocument, adjacentBlock\.id, selectedBlockIds\.value\[0\]\)/, 'expected moving a range downward to place the next neighbor before the selected range');
  assert.match(editor, /event\.key === 'Enter'/, 'expected Enter to return a selected block to edit mode');
  assert.match(editor, /event\.key === 'Backspace' \|\| event\.key === 'Delete'/, 'expected Backspace/Delete to remove selected blocks');
  assert.match(editor, /removeBlockWithResult/, 'expected selected block deletion to return the next focus target');
  assert.match(editor, /selectedBlockId\.value = result\.focusBlockId/, 'expected deletion to keep keyboard context on a neighboring block');
  assert.match(editor, /event\.key\.toLowerCase\(\) === 'd'/, 'expected Ctrl/Cmd+D to duplicate selected blocks');
  assert.match(editor, /function duplicateSelectedBlocks/, 'expected selected block ranges to duplicate as a batch');
  assert.match(editor, /duplicateSelectedBlocks\(\)/, 'expected Ctrl/Cmd+D to duplicate the selected block range');
  assert.match(editor, /duplicateBlockWithResult/, 'expected block duplication to return the duplicated block id');
  assert.match(editor, /selectedBlockId\.value = result\.duplicatedBlockId/, 'expected duplicated selected blocks to select the new copy');
  assert.match(editor, /function copySelectedBlockToClipboard/, 'expected selected blocks to support Notion-like clipboard copy');
  assert.match(editor, /function cutSelectedBlockToClipboard/, 'expected selected blocks to support Notion-like clipboard cut');
  assert.match(editor, /function pasteBlockAfterSelection/, 'expected selected blocks to support Notion-like clipboard paste');
  assert.match(editor, /function getSelectedBlocks/, 'expected selected block ranges to resolve all selected blocks for batch actions');
  assert.match(editor, /function removeSelectedBlocks/, 'expected selected block ranges to delete as a batch');
  assert.match(editor, /function writeSelectedBlocksToClipboard/, 'expected selected block ranges to copy multiple blocks at once');
  assert.match(editor, /function readSelectedBlocksFromClipboard/, 'expected selected block paste to restore multiple same-app blocks');
  assert.match(editor, /application\/x-guyantools-blocks-v2/, 'expected selected block clipboard copy to preserve multiple block JSON values');
  assert.match(editor, /removeSelectedBlocks\(\)/, 'expected Backspace/Delete to remove the selected block range');
  assert.match(editor, /getSelectedBlocks\(\)/, 'expected copy and cut to use the selected block range');
  assert.match(editor, /selectedBlockClipboard = ref<KnowledgeBlockV2\[\]>\(\[\]\)/, 'expected same-session clipboard fallback to store multiple selected blocks');
  assert.match(editor, /navigator\.clipboard\.writeText/, 'expected selected block clipboard copy to write plain Markdown text');
  assert.match(editor, /navigator\.clipboard\.readText/, 'expected selected block clipboard paste to accept external plain text or Markdown');
  assert.match(editor, /markdownToBlockDocumentV2/, 'expected selected block clipboard paste to parse external Markdown into blocks');
  assert.match(editor, /application\/x-guyantools-block-v2/, 'expected selected block clipboard copy to preserve block JSON for same-app paste');
  assert.match(editor, /event\.key\.toLowerCase\(\) === 'c'/, 'expected Ctrl/Cmd+C to copy a selected block');
  assert.match(editor, /event\.key\.toLowerCase\(\) === 'x'/, 'expected Ctrl/Cmd+X to cut a selected block');
  assert.match(editor, /event\.key\.toLowerCase\(\) === 'v'/, 'expected Ctrl/Cmd+V to paste a copied block after selection');
  assert.match(editor, /event\.key === 'Tab'/, 'expected selected block Tab/Shift+Tab indentation shortcuts');
  assert.match(editor, /function indentSelectedBlocks/, 'expected selected block ranges to indent and outdent as a batch');
  assert.match(editor, /indentSelectedBlocks\(event\.shiftKey \? 'outdent' : 'indent'\)/, 'expected selected block Tab to indent and Shift+Tab to outdent the selected range');
  assert.match(editor, /for \(const blockId of selectedBlockIds\.value\)/, 'expected batch indentation to iterate over the selected block range');
  assert.match(editor, /:selected-block-ids="selectedBlockIds"/, 'expected editor to pass the selected block range into block renderers');
  assert.match(editor, /@select-block="selectBlock"/, 'expected editor to wire block selection requests');
  assert.match(editor, /@keydown="handleSelectedBlockKeydown"/, 'expected editor shell to capture selected-block keyboard shortcuts');
  assert.match(renderer, /selectedBlockIds\?: string\[\]/, 'expected renderer to accept a multi-block selected range');
  assert.match(renderer, /props\.selectedBlockIds\?\.includes\(props\.block\.id\)/, 'expected renderer selected state to include block ranges');
  assert.match(renderer, /:selected-block-ids="selectedBlockIds"/, 'expected nested renderers to preserve multi-block selected ranges');
  assert.doesNotMatch(renderer, />\s*\{\{\s*todoId \? '已转 Todo' : '转 Todo'\s*\}\}\s*</, 'task blocks should not show a permanent Todo conversion button in the writing row');
  assert.match(blockV2, /function splitBlockAtTextOffset|export function splitBlockAtTextOffset/, 'expected V2 split helper');
  assert.match(blockV2, /function mergeBlockBackward|export function mergeBlockBackward/, 'expected V2 backward merge helper');
  assert.match(blockV2, /function moveBlockBefore|export function moveBlockBefore/, 'expected V2 drag reorder helper');
  assert.match(blockV2, /function moveBlockAfter|export function moveBlockAfter/, 'expected V2 drag reorder helper to support after-target drops');
  assert.match(blockV2, /function duplicateBlockWithResult|export function duplicateBlockWithResult/, 'expected V2 duplicate helper to expose duplicated block id');
  assert.match(blockV2, /function removeBlockWithResult|export function removeBlockWithResult/, 'expected V2 remove helper to expose the next focus block id');
  assert.match(blockV2, /function cloneBlockV2ForPaste|export function cloneBlockV2ForPaste/, 'expected V2 paste helper to deep-clone pasted blocks with fresh ids');
  assert.match(blockV2, /function insertBlockAfterWithResult|export function insertBlockAfterWithResult/, 'expected V2 insert helper to report the inserted pasted block id');
  assert.match(blockV2, /function insertBlocksAfterWithResult|export function insertBlocksAfterWithResult/, 'expected V2 insert helper to paste multiple external Markdown blocks after selection');
  assert.ok(fs.existsSync(editingUtilsPath), 'expected knowledge_block_editing.ts utilities for inline content editing');
}

function testNotionLikeResponsiveLayoutContract() {
  const page = readDesktopFile('src/windows/main/pages/Knowledge/KnowledgePage.vue');
  const editor = readDesktopFile('src/windows/main/pages/Knowledge/components/KnowledgeBlockEditor.vue');

  assert.match(editor, /knowledge-block-editor__page/, 'expected block editor to render a distinct document page surface');
  assert.match(
    editor,
    /\.knowledge-block-editor__page\s*\{[^}]*?background:\s*transparent;/,
    'expected the Notion-like page container to leave personalized backgrounds visible',
  );
  assert.doesNotMatch(
    editor,
    /\.knowledge-block-editor__page\s*\{[^}]*?background:\s*color-mix\(in srgb, var\(--ui-surface-panel\)/,
    'the writing page container should not add a panel veil over personalized backgrounds',
  );
  assert.match(
    editor,
    /knowledge-block-editor__page-title/,
    'expected block page title to live inside the document writing surface',
  );
  assert.match(
    editor,
    /\.knowledge-block-editor__page\s*\{[\s\S]*?width:\s*min\(100%, 840px\)/,
    'expected the Notion-like block page to use a focused document width rather than a full editor panel width',
  );
  assert.match(
    editor,
    /\.knowledge-block-editor__page-tools\s*\{[\s\S]*?opacity:\s*0/,
    'expected low-frequency page tools to stay hidden until hover or focus like Notion',
  );
  assert.match(
    editor,
    /knowledge-block-editor__page-icon/,
    'expected block pages to expose a Notion-like page icon affordance above the title',
  );
  assert.match(
    editor,
    /knowledge-block-editor__page-meta[\s\S]*aria-label="页面属性"/,
    'expected block page metadata to read as page properties near the title',
  );
  assert.match(
    editor,
    /knowledge-block-editor__page-tools[\s\S]*aria-label="页面操作"/,
    'expected low-frequency page actions to live near the document header instead of the app toolbar',
  );
  assert.match(
    editor,
    /knowledge-block-editor__page-tools[\s\S]*iconify:lucide:save/,
    'expected save status to stay inside the Notion-like page header tools instead of a separate editor toolbar',
  );
  assert.match(
    editor,
    /function insertParagraphAtEnd/,
    'expected the document header to expose a Notion-like quick add block action',
  );
  assert.match(
    editor,
    /@click="insertParagraphAtEnd"/,
    'expected the page tools add action to append a writing block',
  );
  assert.match(
    editor,
    /\.knowledge-block-editor__page:hover \.knowledge-block-editor__page-tools/,
    'expected page tools to appear as a lightweight hover affordance on the writing page',
  );
  assert.match(
    editor,
    /\.knowledge-block-editor__page:focus-within \.knowledge-block-editor__page-tools/,
    'expected page tools to stay visible while users interact with the writing page',
  );
  assert.doesNotMatch(
    editor,
    /<header class="knowledge-block-editor__toolbar">[\s\S]*?Markdown 导入[\s\S]*?<\/header>/,
    'block editor app toolbar should not carry Markdown import actions',
  );
  assert.doesNotMatch(
    editor,
    /<header class="knowledge-block-editor__toolbar">[\s\S]*?导出 Markdown[\s\S]*?<\/header>/,
    'block editor app toolbar should not carry Markdown export actions',
  );
  assert.doesNotMatch(
    editor,
    /knowledge-block-editor__toolbar/,
    'block editor should not keep a separate form-like toolbar above the writing surface',
  );
  assert.match(
    editor,
    /function focusFirstContentBlockAfterTitle/,
    'expected page title Enter to move focus into the first content block',
  );
  assert.match(
    editor,
    /@keydown\.enter\.prevent="focusFirstContentBlockAfterTitle"/,
    'expected page title Enter to focus the document body instead of only saving title',
  );
  assert.match(
    editor,
    /<UiScrollbar[\s\S]*?class="knowledge-block-editor__canvas-scrollbar"/,
    'expected the block editor canvas to use the shared scrollbar component',
  );
  assert.match(
    editor,
    /knowledge-block-editor__canvas-inner/,
    'expected the block editor canvas to keep a blank-click focus surface inside the shared scrollbar',
  );
  assert.doesNotMatch(
    editor,
    /\.knowledge-block-editor__canvas\s*\{[^}]*overflow:\s*auto/,
    'block editor canvas should not use a native scrollbar',
  );
  assert.match(
    editor,
    /\.knowledge-block-editor__page\s*\{[^}]*?background:\s*transparent;/,
    'expected block page surface to leave personalized backgrounds visible',
  );
  assert.match(
    page,
    /@media \(max-width: 1760px\)[\s\S]*?\.knowledge-inspector[\s\S]*?display:\s*none/,
    'expected medium-width Knowledge layout to collapse the inspector before the editor is cramped',
  );
  assert.match(
    page,
    /knowledge-editor__header--block-page/,
    'expected block pages to use a compact parent header while the editable title lives in the page',
  );
  assert.match(
    page,
    /\.knowledge-editor__header--block-page\s*\{[\s\S]*?position:\s*absolute[\s\S]*?pointer-events:\s*none/,
    'expected the parent block-page header to be visually hidden so the document title is the primary Notion-like title',
  );
  assert.match(
    page,
    /\.knowledge-editor__body--block[\s\S]*?background:\s*transparent/,
    'expected block editor body to preserve the page/background instead of covering it',
  );
  assert.doesNotMatch(
    editor,
    /\.knowledge-block\s*\{[\s\S]*?grid-template-columns:\s*112px minmax\(0, 1fr\) auto/,
    'block editor parent should not keep the old form/card block layout after the renderer owns Notion-like blocks',
  );
}

function testInlineEditingUtilitiesRoundTrip() {
  const {
    inlineContentToEditableHtml,
    editableHtmlToInlineContent,
    inlineContentToPlainText,
  } = require('../src/windows/main/pages/Knowledge/utils/knowledge_block_editing.ts');

  const source = [
    { type: 'text', text: 'A < B ' },
    { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
    { type: 'text', text: ' italic', marks: [{ type: 'italic' }] },
    { type: 'text', text: ' code', marks: [{ type: 'code' }] },
    { type: 'text', text: ' strike', marks: [{ type: 'strike' }] },
  ];
  const html = inlineContentToEditableHtml(source);

  assert.match(html, /A &lt; B/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em> italic<\/em>/);
  assert.match(html, /<code> code<\/code>/);
  assert.match(html, /<s> strike<\/s>/);

  const parsed = editableHtmlToInlineContent(html);
  assert.equal(inlineContentToPlainText(parsed), 'A < B bold italic code strike');
  assert.ok(parsed.some((item) => item.marks?.some((mark) => mark.type === 'bold')));
  assert.ok(parsed.some((item) => item.marks?.some((mark) => mark.type === 'italic')));
  assert.ok(parsed.some((item) => item.marks?.some((mark) => mark.type === 'code')));
  assert.ok(parsed.some((item) => item.marks?.some((mark) => mark.type === 'strike')));
}

function testBlockV2SplitMergeAndArbitraryMove() {
  assert.equal(typeof splitBlockAtTextOffset, 'function', 'expected splitBlockAtTextOffset export');
  assert.equal(typeof mergeBlockBackward, 'function', 'expected mergeBlockBackward export');
  assert.equal(typeof moveBlockBefore, 'function', 'expected moveBlockBefore export');
  assert.equal(typeof moveBlockAfter, 'function', 'expected moveBlockAfter export');

  const first = createBlockV2('paragraph', 'Hello world');
  const second = createBlockV2('paragraph', 'Second');
  const third = createBlockV2('paragraph', 'Third');
  const document = {
    type: 'guyantools.block-page',
    version: 2,
    updatedAt: '2026-06-11T00:00:00.000Z',
    blocks: [first, second, third],
  };

  const split = splitBlockAtTextOffset(document, first.id, 5);
  assert.equal(split.document.blocks.length, 4);
  assert.equal(split.document.blocks[0].content[0].text, 'Hello');
  assert.equal(split.document.blocks[1].content[0].text, ' world');
  assert.equal(split.focusBlockId, split.document.blocks[1].id);

  const heading = createBlockV2('heading', 'Title', { level: 1 });
  const headingSplit = splitBlockAtTextOffset({ ...document, blocks: [heading] }, heading.id, 5);
  assert.equal(headingSplit.document.blocks[0].type, 'heading');
  assert.equal(headingSplit.document.blocks[1].type, 'paragraph');

  const checkedTask = createBlockV2('task_list', 'Done item', { checked: true });
  const checkedTaskSplit = splitBlockAtTextOffset({ ...document, blocks: [checkedTask] }, checkedTask.id, 9);
  assert.equal(checkedTaskSplit.document.blocks[0].type, 'task_list');
  assert.equal(checkedTaskSplit.document.blocks[1].type, 'task_list');
  assert.equal(checkedTaskSplit.document.blocks[0].attrs?.checked, true);
  assert.equal(checkedTaskSplit.document.blocks[1].attrs?.checked, false);

  const emptyList = createBlockV2('bullet_list', '');
  const emptyListExit = splitBlockAtTextOffset({ ...document, blocks: [emptyList] }, emptyList.id, 0);
  assert.equal(emptyListExit.document.blocks.length, 1);
  assert.equal(emptyListExit.document.blocks[0].type, 'paragraph');
  assert.equal(emptyListExit.focusBlockId, emptyList.id);

  const moved = moveBlockBefore(split.document, third.id, split.document.blocks[1].id);
  assert.equal(moved.document.blocks[1].id, third.id);
  assert.equal(moved.focusBlockId, third.id);

  const movedAfter = moveBlockAfter(split.document, first.id, third.id);
  assert.deepEqual(
    movedAfter.document.blocks.map((block) => block.id),
    [split.document.blocks[1].id, second.id, third.id, first.id],
  );
  assert.equal(movedAfter.focusBlockId, first.id);

  const empty = createBlockV2('paragraph', '');
  const mergeDocument = {
    ...document,
    blocks: [first, empty, second],
  };
  const merged = mergeBlockBackward(mergeDocument, empty.id);
  assert.equal(merged.document.blocks.length, 2);
  assert.equal(merged.focusBlockId, first.id);

  const removedWithResult = removeBlockWithResult([first, second, third], second.id);
  assert.equal(removedWithResult.blocks.length, 2);
  assert.equal(removedWithResult.focusBlockId, third.id);

  const removedLastWithResult = removeBlockWithResult([first, second, third], third.id);
  assert.equal(removedLastWithResult.blocks.length, 2);
  assert.equal(removedLastWithResult.focusBlockId, second.id);

  const copiedParent = createBlockV2('toggle', 'Parent', { open: true });
  const copiedChild = createBlockV2('paragraph', 'Child');
  copiedParent.children = [copiedChild];
  const pasted = cloneBlockV2ForPaste(copiedParent);
  assert.notEqual(pasted.id, copiedParent.id);
  assert.notEqual(pasted.children[0].id, copiedChild.id);
  assert.equal(pasted.content[0].text, 'Parent');
  assert.equal(pasted.children[0].content[0].text, 'Child');

  const insertedPaste = insertBlockAfterWithResult([first, second], first.id, pasted);
  assert.equal(insertedPaste.insertedBlockId, pasted.id);
  assert.deepEqual(insertedPaste.blocks.map((block) => block.id), [first.id, pasted.id, second.id]);

  const externalMarkdownBlocks = markdownToBlockDocumentV2('# External\n\nParagraph').blocks.map(cloneBlockV2ForPaste);
  const insertedExternalBlocks = insertBlocksAfterWithResult([first, second], first.id, externalMarkdownBlocks);
  assert.equal(insertedExternalBlocks.insertedBlockId, externalMarkdownBlocks[0].id);
  assert.deepEqual(
    insertedExternalBlocks.blocks.map((block) => block.id),
    [first.id, externalMarkdownBlocks[0].id, externalMarkdownBlocks[1].id, second.id],
  );

  const parentWithFirstChild = createBlockV2('paragraph', 'Parent');
  const firstChild = createBlockV2('paragraph', 'Child');
  parentWithFirstChild.children = [firstChild];
  const outdented = mergeBlockBackward({ ...document, blocks: [parentWithFirstChild] }, firstChild.id);
  assert.equal(outdented.document.blocks.length, 2);
  assert.equal(outdented.document.blocks[0].id, parentWithFirstChild.id);
  assert.equal(outdented.document.blocks[0].children?.length ?? 0, 0);
  assert.equal(outdented.document.blocks[1].id, firstChild.id);
  assert.equal(outdented.focusBlockId, firstChild.id);
  assert.equal(outdented.cursorOffset, 0);
}

testBlockEditorExposesCompleteNotionLikeTypes();
testBlockV2DerivesTableAndToggleMarkdown();
testCanvasEditorExposesCompleteOneNoteLikeTools();
testBlockEditorHasFocusAndMarkdownShortcuts();
testNotionLikeBlockEditingContracts();
testNotionLikeResponsiveLayoutContract();
testInlineEditingUtilitiesRoundTrip();
testBlockV2SplitMergeAndArbitraryMove();

console.log('knowledge editor foundation checks passed');
