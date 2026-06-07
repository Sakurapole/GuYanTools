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
    /\.cm-md-live-block\)[\s\S]*?background:\s*color-mix\(in srgb, var\(--ui-surface-panel\)[\s\S]*?transparent\);/,
    'expected Live Preview block widgets to use a subtle translucent background instead of a fully opaque card',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-code-render-preview[\s\S]*?position:\s*relative;[\s\S]*?background:\s*color-mix\(in srgb, var\(--ui-surface-panel-muted\)[\s\S]*?transparent\);/,
    'expected code fence previews to keep a lightweight rendered shell without clipping body rows',
  );
  assert.match(
    editorSource,
    /\.cm-md-live-code-render-preview\)[\s\S]*?background:\s*color-mix\(in srgb, var\(--ui-surface-panel-muted\) 44%, transparent\);/,
    'expected inactive code fence previews to use a darker translucent gray background',
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
    /\.cm-md-live-source-block--code_fence[\s\S]*?background:\s*color-mix\(in srgb, var\(--ui-surface-panel-muted\) 44%, transparent\);[\s\S]*?box-shadow:\s*none;/,
    'expected active code fence source blocks to use the same darker background as inactive previews',
  );
  assert.match(
    editorSource,
    /\.knowledge-md-math--block[\s\S]*?background:\s*color-mix\(in srgb, var\(--ui-surface-panel-muted\)[\s\S]*?transparent\);/,
    'expected rendered math blocks to use a subtle translucent background',
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
    /\.markdown-body :deep\(\.knowledge-md-mermaid\)[\s\S]*?text-align:\s*center;/,
    'expected rendered Mermaid diagrams in the Markdown editor preview to center inline fallback states',
  );
  assert.match(
    editorSource,
    /\.markdown-body :deep\(\.knowledge-md-mermaid svg\)[\s\S]*?display:\s*block;[\s\S]*?margin:\s*0 auto;/,
    'expected rendered Mermaid SVGs in the Markdown editor preview to be centered',
  );
  assert.match(
    virtualListSource,
    /\.markdown-preview-virtual-list :deep\(\.knowledge-md-mermaid\)[\s\S]*?text-align:\s*center;/,
    'expected rendered Mermaid diagrams in virtual preview blocks to center inline fallback states',
  );
  assert.match(
    virtualListSource,
    /\.markdown-preview-virtual-list :deep\(\.knowledge-md-mermaid svg\)[\s\S]*?display:\s*block;[\s\S]*?margin:\s*0 auto;/,
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
    /\.knowledge-page--custom-background \.knowledge-sidebar,[\s\S]*?\.knowledge-page--custom-background \.knowledge-workspace,[\s\S]*?\.knowledge-page--custom-background \.knowledge-inspector[\s\S]*?background:\s*transparent/,
    'expected custom page background to override the three region backgrounds',
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

  assert.match(component, /--knowledge-md-block-bg/);
  assert.match(component, /\.markdown-preview-virtual-list\s+:deep\(pre\)/);
  assert.match(component, /\.markdown-preview-virtual-list\s+:deep\(table\)/);
  assert.match(component, /table-layout:\s*fixed/);
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
