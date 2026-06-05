import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutterWidgetClass,
  lineNumberWidgetMarker,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import {
  collectMarkdownLivePreviewBlockTokens,
  collectMarkdownLivePreviewInlineTokens,
  isMarkdownLivePreviewLineActive,
  insertMarkdownTableColumn,
  insertMarkdownTableRow,
  isMarkdownLivePreviewRangeActive,
  parseMarkdownCalloutSource,
  setMarkdownCalloutType,
  setMarkdownTableAlignment,
  type MarkdownCalloutType,
  type MarkdownLivePreviewBlockToken,
  type MarkdownLivePreviewInlineToken,
  type MarkdownLivePreviewRange,
} from '../utils/markdown_live_preview';
import {
  renderMarkdownMermaidElements,
  renderMarkdownPreviewHtml,
  renderMarkdownFormulaToHtml,
} from '../utils/markdown_enhanced_render';

export { collectMarkdownLivePreviewInlineTokens as collectMarkdownWysiwygLineTokens };

type WidgetAction = 'edit' | 'table-row' | 'table-column' | 'table-align-center';

const blockResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();
const blockGutterClass = 'cm-md-live-block-gutter';
const codeFenceKeywords: Record<string, Set<string>> = {
  javascript: new Set([
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'let',
    'new',
    'of',
    'return',
    'static',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'yield',
  ]),
  typescript: new Set([
    'as',
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'instanceof',
    'interface',
    'let',
    'namespace',
    'new',
    'of',
    'private',
    'protected',
    'public',
    'readonly',
    'return',
    'static',
    'switch',
    'this',
    'throw',
    'try',
    'type',
    'typeof',
    'var',
    'void',
    'while',
    'yield',
  ]),
  json: new Set(['true', 'false', 'null']),
  python: new Set([
    'and',
    'as',
    'assert',
    'async',
    'await',
    'break',
    'class',
    'continue',
    'def',
    'del',
    'elif',
    'else',
    'except',
    'False',
    'finally',
    'for',
    'from',
    'global',
    'if',
    'import',
    'in',
    'is',
    'lambda',
    'None',
    'nonlocal',
    'not',
    'or',
    'pass',
    'raise',
    'return',
    'True',
    'try',
    'while',
    'with',
    'yield',
  ]),
  rust: new Set([
    'as',
    'async',
    'await',
    'break',
    'const',
    'continue',
    'crate',
    'dyn',
    'else',
    'enum',
    'extern',
    'false',
    'fn',
    'for',
    'if',
    'impl',
    'in',
    'let',
    'loop',
    'match',
    'mod',
    'move',
    'mut',
    'pub',
    'ref',
    'return',
    'self',
    'Self',
    'static',
    'struct',
    'super',
    'trait',
    'true',
    'type',
    'unsafe',
    'use',
    'where',
    'while',
  ]),
  sql: new Set([
    'alter',
    'and',
    'as',
    'by',
    'case',
    'create',
    'delete',
    'desc',
    'distinct',
    'drop',
    'else',
    'end',
    'from',
    'group',
    'having',
    'in',
    'insert',
    'into',
    'is',
    'join',
    'left',
    'like',
    'limit',
    'not',
    'null',
    'on',
    'or',
    'order',
    'right',
    'select',
    'set',
    'table',
    'then',
    'update',
    'values',
    'when',
    'where',
  ]),
  css: new Set(['important', 'media', 'keyframes', 'supports', 'container', 'layer', 'import']),
  html: new Set(['doctype']),
  xml: new Set(['xml']),
};
const calloutTypeOptions: Array<{ value: MarkdownCalloutType; label: string }> = [
  { value: 'note', label: 'NOTE' },
  { value: 'tip', label: 'TIP' },
  { value: 'important', label: 'IMPORTANT' },
  { value: 'warning', label: 'WARNING' },
  { value: 'caution', label: 'CAUTION' },
  { value: 'danger', label: 'DANGER' },
  { value: 'info', label: 'INFO' },
  { value: 'todo', label: 'TODO' },
  { value: 'question', label: 'QUESTION' },
  { value: 'example', label: 'EXAMPLE' },
  { value: 'quote', label: 'QUOTE' },
];

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  eq(widget: TaskCheckboxWidget) {
    return widget.checked === this.checked && widget.from === this.from && widget.to === this.to;
  }

  toDOM(view: EditorView) {
    const checkbox = document.createElement('button');
    checkbox.type = 'button';
    checkbox.className = `cm-md-live-task${this.checked ? ' cm-md-live-task--checked' : ''}`;
    checkbox.setAttribute('aria-label', this.checked ? '标记任务为未完成' : '标记任务为完成');
    checkbox.textContent = this.checked ? '✓' : '';
    checkbox.addEventListener('mousedown', (event) => event.preventDefault());
    checkbox.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = view.state.doc.sliceString(this.from, this.to);
      const nextSource = source.replace(/\[([ xX])\]/, this.checked ? '[ ]' : '[x]');
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: nextSource },
      });
    });
    return checkbox;
  }

  ignoreEvent() {
    return true;
  }
}

class InlinePreviewWidget extends WidgetType {
  constructor(private readonly token: MarkdownLivePreviewInlineToken) {
    super();
  }

  eq(widget: InlinePreviewWidget) {
    return JSON.stringify(widget.token) === JSON.stringify(this.token);
  }

  toDOM() {
    if (this.token.kind === 'formula-inline') {
      const wrapper = document.createElement('span');
      wrapper.innerHTML = renderMarkdownFormulaToHtml(this.token.body, false);
      const rendered = wrapper.firstElementChild;
      return rendered instanceof HTMLElement ? rendered : wrapper;
    }

    if (this.token.kind === 'link') {
      return createLivePreviewAnchor('cm-md-live-link', this.token.href, this.token.label, this.token.href);
    }

    if (this.token.kind === 'wiki-link') {
      const href = `app://knowledge-pages/title/${encodeURIComponent(this.token.target)}`;
      return createLivePreviewAnchor('cm-md-live-wiki-link', href, this.token.label, this.token.target);
    }

    if (this.token.kind === 'asset-embed') {
      const span = document.createElement('span');
      span.className = 'cm-md-live-asset-embed';
      span.textContent = this.token.target;
      span.title = this.token.target;
      return span;
    }

    const span = document.createElement('span');
    span.className = 'cm-md-live-comment';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  ignoreEvent(event: Event) {
    return event.type === 'mousedown' || event.type === 'click';
  }
}

function createLivePreviewAnchor(className: string, href: string, label: string, title: string): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.className = className;
  anchor.href = href;
  anchor.textContent = label;
  anchor.title = title;
  anchor.rel = 'noopener noreferrer';
  anchor.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  anchor.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openLivePreviewHref(href);
  });
  return anchor;
}

function openLivePreviewHref(href: string): void {
  if (href.startsWith('app://knowledge-assets/id/')) {
    const assetId = extractKnowledgeAssetId(href);
    if (assetId) {
      const openPromise = window.knowledgeApi?.openAsset(assetId);
      void openPromise?.catch((): undefined => undefined);
    }
    return;
  }

  if (href.startsWith('http:') || href.startsWith('https:') || href.startsWith('file:')) {
    const openPromise = window.shellApi?.openExternal(href);
    if (openPromise) {
      void openPromise.catch(() => window.open(href, '_blank', 'noopener,noreferrer'));
    } else {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
    return;
  }

  window.open(href, '_blank', 'noopener,noreferrer');
}

function extractKnowledgeAssetId(href: string): string {
  try {
    const url = new URL(href);
    const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
    return parts[0] === 'id' ? parts[1] : '';
  } catch {
    return '';
  }
}

class BlockPreviewWidget extends WidgetType {
  constructor(readonly token: MarkdownLivePreviewBlockToken) {
    super();
  }

  eq(widget: BlockPreviewWidget) {
    return widget.token.kind === this.token.kind &&
      widget.token.from === this.token.from &&
      widget.token.to === this.token.to &&
      widget.token.source === this.token.source;
  }

  toDOM(view: EditorView) {
    const container = document.createElement('section');
    container.className = `cm-md-live-block cm-md-live-block--${this.token.kind}`;
    container.dataset.markdownLivePreviewBlock = this.token.kind;
    container.tabIndex = -1;
    container.addEventListener('mousedown', (event) => {
      if ((event.target as HTMLElement | null)?.closest('.cm-md-live-block__action, .cm-md-live-callout__type')) return;
      event.preventDefault();
      event.stopPropagation();
    });
    container.addEventListener('click', (event) => {
      if ((event.target as HTMLElement | null)?.closest('.cm-md-live-block__action, .cm-md-live-callout__type')) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.token.kind === 'code_fence') {
        view.dispatch({ selection: { anchor: this.token.from }, scrollIntoView: true });
        view.focus();
        return;
      }
      container.classList.add('cm-md-live-block--selected');
    });

    if (this.token.kind === 'callout') {
      createCalloutPreview(container, view, this.token);
      observeBlockSize(container, view);
      requestAnimationFrame(() => view.requestMeasure());
      return container;
    }

    if (this.token.kind === 'code_fence') {
      createCodeFenceRenderedPreview(container, this.token);
      observeBlockSize(container, view);
      requestAnimationFrame(() => view.requestMeasure());
      return container;
    }

    const header = document.createElement('div');
    header.className = 'cm-md-live-block__header';
    const title = document.createElement('span');
    title.className = 'cm-md-live-block__title';
    title.textContent = blockTitle(this.token);
    header.append(title);
    header.append(createBlockButton('源码', 'edit', view, this.token));

    if (this.token.kind === 'table') {
      header.append(createBlockButton('行+', 'table-row', view, this.token));
      header.append(createBlockButton('列+', 'table-column', view, this.token));
      header.append(createBlockButton('居中', 'table-align-center', view, this.token));
    }

    const body = document.createElement('div');
    body.className = 'cm-md-live-block__body markdown-body';
    body.innerHTML = renderBlockHtml(this.token);
    container.append(header, body);
    observeBlockSize(container, view);

    if (this.token.kind === 'mermaid') {
      requestAnimationFrame(() => {
        renderMarkdownMermaidElements(container);
        view.requestMeasure();
        window.setTimeout(() => view.requestMeasure(), 120);
        window.setTimeout(() => view.requestMeasure(), 360);
      });
    } else {
      requestAnimationFrame(() => view.requestMeasure());
    }

    container.querySelectorAll('img').forEach((image) => {
      image.addEventListener('load', () => view.requestMeasure(), { once: true });
    });

    return container;
  }

  destroy(dom: HTMLElement) {
    blockResizeObservers.get(dom)?.disconnect();
    blockResizeObservers.delete(dom);
  }

  ignoreEvent() {
    return true;
  }
}

class BlockPreviewGutterClassMarker extends GutterMarker {
  elementClass = blockGutterClass;

  eq(marker: GutterMarker) {
    return marker instanceof BlockPreviewGutterClassMarker;
  }
}

const blockPreviewGutterClassMarker = new BlockPreviewGutterClassMarker();

class BlockPreviewLineNumberMarker extends GutterMarker {
  constructor(private readonly lineNumber: string) {
    super();
  }

  eq(marker: GutterMarker) {
    return marker instanceof BlockPreviewLineNumberMarker && marker.lineNumber === this.lineNumber;
  }

  toDOM() {
    return document.createTextNode(this.lineNumber);
  }
}

function blockPreviewGutterClass(
  _view: EditorView,
  widget: WidgetType,
): GutterMarker | null {
  return widget instanceof BlockPreviewWidget ? blockPreviewGutterClassMarker : null;
}

function blockPreviewLineNumber(
  view: EditorView,
  widget: WidgetType,
  block: { from: number },
): GutterMarker | null {
  if (!(widget instanceof BlockPreviewWidget)) return null;
  return new BlockPreviewLineNumberMarker(String(view.state.doc.lineAt(block.from).number));
}

function createCodeFenceRenderedPreview(container: HTMLElement, token: MarkdownLivePreviewBlockToken) {
  const preview = extractCodeFencePreview(token);
  const shell = document.createElement('div');
  shell.className = `cm-md-live-code-render-preview cm-md-live-code-render-preview--${normalizeCodeFenceLanguage(preview.language) || 'plain'}`;
  shell.dataset.language = preview.language;

  const header = document.createElement('div');
  header.className = 'cm-md-live-code-render-preview__fence-row cm-md-live-code-render-preview__header';
  header.textContent = preview.language || 'plain text';

  const body = document.createElement('div');
  body.className = 'cm-md-live-code-render-preview__body';
  preview.lines.forEach((line, lineNumber) => {
    body.append(createCodeFencePreviewLine(line, lineNumber, preview.language));
  });

  const footer = document.createElement('div');
  footer.className = 'cm-md-live-code-render-preview__fence-row cm-md-live-code-render-preview__footer';

  shell.append(header, body, footer);
  container.append(shell);
}

function extractCodeFencePreview(token: MarkdownLivePreviewBlockToken) {
  const sourceLines = token.source.replace(/\r\n/g, '\n').split('\n');
  const openingLine = sourceLines[0] ?? '';
  const parsedLanguage = /^ {0,3}(?:`{3,}|~{3,})\s*([^\s`]*)/.exec(openingLine)?.[1] ?? '';
  const closingLineIndex = sourceLines.length > 1 && /^ {0,3}(?:`{3,}|~{3,})\s*$/.test(sourceLines[sourceLines.length - 1] ?? '')
    ? sourceLines.length - 1
    : sourceLines.length;
  const lines = sourceLines.slice(1, closingLineIndex);

  return {
    language: token.language || parsedLanguage,
    lines: lines.length > 0 ? lines : [''],
  };
}

function createCodeFencePreviewLine(line: string, lineNumber: number, language: string) {
  const row = document.createElement('div');
  row.className = 'cm-md-live-code-render-preview__line';

  const marker = document.createElement('span');
  marker.className = 'cm-md-live-code-render-preview__line-number';
  marker.textContent = String(lineNumber + 1);

  const code = document.createElement('code');
  code.className = 'cm-md-live-code-render-preview__code';
  highlightCodeFenceLine(code, line, language);

  row.append(marker, code);
  return row;
}

function highlightCodeFenceLine(code: HTMLElement, line: string, language: string) {
  const normalizedLanguage = normalizeCodeFenceLanguage(language);
  const keywords = codeFenceKeywords[normalizedLanguage] ?? new Set<string>();
  const tokenPattern = /("""[\s\S]*?"""|'''[\s\S]*?'''|`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\/\/.*|#.*|--.*|\/\*.*?\*\/|<\/?[A-Za-z][\w:-]*\b|[{}[\]().,;:+*/%=&|!<>?-]|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][\w-]*\b)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(line)) !== null) {
    if (match.index > cursor) appendCodeToken(code, line.slice(cursor, match.index));
    const token = match[0];
    appendCodeToken(code, token, classifyCodeFenceToken(token, keywords, normalizedLanguage));
    cursor = match.index + token.length;
  }

  if (cursor < line.length) appendCodeToken(code, line.slice(cursor));
  if (!line) appendCodeToken(code, '\u200b');
}

function appendCodeToken(code: HTMLElement, text: string, tokenClass = '') {
  const span = document.createElement('span');
  span.className = tokenClass ? `cm-md-live-code-token cm-md-live-code-token--${tokenClass}` : 'cm-md-live-code-token';
  span.textContent = text;
  code.append(span);
}

function classifyCodeFenceToken(token: string, keywords: Set<string>, language: string) {
  if (/^(\/\/|#|--|\/\*)/.test(token)) return 'comment';
  if (/^(`|'|"|"""|''')/.test(token)) return 'string';
  if (/^\d/.test(token)) return 'number';
  if (language === 'html' || language === 'xml') {
    if (/^<\/?[A-Za-z]/.test(token)) return 'tag';
  }
  if (language === 'css' && /^[A-Za-z-]+$/.test(token) && token.startsWith('--')) return 'property';
  if (keywords.has(token) || keywords.has(token.toLowerCase())) return 'keyword';
  if (/^(true|false|null|undefined|None|nil)$/i.test(token)) return 'atom';
  return '';
}

function normalizeCodeFenceLanguage(language: string) {
  const normalized = language.trim().toLowerCase();
  if (['js', 'mjs', 'cjs', 'jsx', 'node'].includes(normalized)) return 'javascript';
  if (['ts', 'tsx'].includes(normalized)) return 'typescript';
  if (['py'].includes(normalized)) return 'python';
  if (['rs'].includes(normalized)) return 'rust';
  if (['postgres', 'postgresql', 'mysql', 'sqlite'].includes(normalized)) return 'sql';
  if (['htm'].includes(normalized)) return 'html';
  return normalized;
}

function createCalloutPreview(container: HTMLElement, view: EditorView, token: MarkdownLivePreviewBlockToken) {
  const callout = parseMarkdownCalloutSource(token.source);
  if (!callout) {
    const fallback = document.createElement('div');
    fallback.className = 'cm-md-live-block__body markdown-body';
    fallback.innerHTML = renderMarkdownPreviewHtml(token.source);
    container.append(fallback);
    return;
  }

  container.classList.add(`cm-md-live-callout--${callout.type}`);

  const header = document.createElement('div');
  header.className = 'cm-md-live-callout__header';

  const typeSelect = document.createElement('select');
  typeSelect.className = 'cm-md-live-callout__type';
  typeSelect.setAttribute('aria-label', 'Callout 类型');
  for (const option of calloutTypeOptions) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = option.value === callout.type;
    typeSelect.append(element);
  }
  typeSelect.addEventListener('change', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextType = typeSelect.value as MarkdownCalloutType;
    const nextSource = setMarkdownCalloutType(token.source, nextType);
    view.dispatch({
      changes: { from: token.from, to: token.to, insert: nextSource },
    });
    requestAnimationFrame(() => view.requestMeasure());
  });

  const title = document.createElement('span');
  title.className = 'cm-md-live-callout__title';
  title.textContent = callout.title || '标题';

  header.append(typeSelect, title, createBlockButton('源码', 'edit', view, token));

  const body = document.createElement('div');
  body.className = 'cm-md-live-callout__body markdown-body';
  body.innerHTML = callout.body ? renderMarkdownPreviewHtml(callout.body) : '';

  container.append(header, body);
}

function observeBlockSize(container: HTMLElement, view: EditorView) {
  if (typeof ResizeObserver === 'undefined') return;

  const observer = new ResizeObserver(() => {
    requestAnimationFrame(() => view.requestMeasure());
  });
  observer.observe(container);
  blockResizeObservers.set(container, observer);
}

function blockTitle(token: MarkdownLivePreviewBlockToken) {
  if (token.kind === 'frontmatter') return 'Properties';
  if (token.kind === 'callout') return 'Callout';
  if (token.kind === 'math') return 'Math';
  if (token.kind === 'mermaid') return 'Mermaid';
  if (token.kind === 'code_fence') return token.language ? `Code ${token.language}` : 'Code';
  if (token.kind === 'table') return 'Table';
  if (token.kind === 'blockquote') return 'Quote';
  return 'List';
}

function createBlockButton(
  label: string,
  action: WidgetAction,
  view: EditorView,
  token: MarkdownLivePreviewBlockToken,
) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cm-md-live-block__action';
  button.textContent = label;
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispatchBlockAction(view, token, action);
  });
  return button;
}

function dispatchBlockAction(
  view: EditorView,
  token: MarkdownLivePreviewBlockToken,
  action: WidgetAction,
) {
  if (action === 'edit') {
    view.dispatch({ selection: { anchor: token.from }, scrollIntoView: true });
    view.focus();
    return;
  }

  if (token.kind !== 'table') return;

  const nextSource = action === 'table-row'
    ? insertMarkdownTableRow(token.source)
    : action === 'table-column'
      ? insertMarkdownTableColumn(token.source)
      : setMarkdownTableAlignment(token.source, 0, 'center');

  view.dispatch({
    changes: { from: token.from, to: token.to, insert: nextSource },
    selection: { anchor: token.from + nextSource.length },
    scrollIntoView: true,
  });
  view.focus();
}

function renderBlockHtml(token: MarkdownLivePreviewBlockToken) {
  if (token.kind === 'frontmatter') {
    const body = token.source
      .replace(/^---\s*/, '')
      .replace(/\s*---$/, '')
      .trim();
    return `<pre><code>${escapeHtml(body)}</code></pre>`;
  }
  return renderMarkdownPreviewHtml(token.source);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pushIfInactive(
  decorations: Array<Range<Decoration>>,
  decoration: Range<Decoration>,
  activeRanges: MarkdownLivePreviewRange[],
  from: number,
  to: number,
) {
  if (isMarkdownLivePreviewRangeActive({ from, to }, activeRanges)) return;
  decorations.push(decoration);
}

function pushIfLineInactive(
  decorations: Array<Range<Decoration>>,
  decoration: Range<Decoration>,
  activeRanges: MarkdownLivePreviewRange[],
  lineRange: MarkdownLivePreviewRange,
) {
  if (isMarkdownLivePreviewLineActive(lineRange, activeRanges)) return;
  decorations.push(decoration);
}

function tokenRange(lineFrom: number, token: MarkdownLivePreviewInlineToken) {
  return {
    from: lineFrom + token.from,
    to: lineFrom + token.to,
  };
}

function tokenActiveRange(lineFrom: number, token: MarkdownLivePreviewInlineToken) {
  return {
    from: lineFrom + (token.syntaxFrom ?? token.from),
    to: lineFrom + (token.syntaxTo ?? token.to),
  };
}

function addInlineTokenDecoration(
  token: MarkdownLivePreviewInlineToken,
  lineFrom: number,
  lineRange: MarkdownLivePreviewRange,
  decorations: Array<Range<Decoration>>,
  activeRanges: MarkdownLivePreviewRange[],
) {
  const range = tokenRange(lineFrom, token);
  const activeRange = tokenActiveRange(lineFrom, token);

  switch (token.kind) {
    case 'heading-marker':
      if (isMarkdownLivePreviewLineActive(lineRange, activeRanges)) {
        decorations.push(Decoration.line({ class: 'cm-md-live-heading-source' }).range(lineFrom));
      } else {
        decorations.push(
          Decoration.line({
            class: `cm-md-live-heading cm-md-live-heading-${token.level}`,
          }).range(lineFrom),
        );
        decorations.push(Decoration.replace({ inclusive: false }).range(range.from, range.to));
      }
      break;
    case 'task-marker':
      pushIfLineInactive(
        decorations,
        Decoration.replace({
          widget: new TaskCheckboxWidget(token.checked, range.from, range.to),
          inclusive: false,
        }).range(range.from, range.to),
        activeRanges,
        lineRange,
      );
      break;
    case 'inline-code-marker':
    case 'strong-emphasis-marker':
    case 'strong-marker':
    case 'emphasis-marker':
    case 'strikethrough-marker':
    case 'highlight-marker':
      pushIfInactive(decorations, Decoration.replace({ inclusive: false }).range(range.from, range.to), activeRanges, activeRange.from, activeRange.to);
      break;
    case 'inline-code':
      pushIfInactive(decorations, Decoration.mark({ class: 'cm-md-live-inline-code' }).range(range.from, range.to), activeRanges, activeRange.from, activeRange.to);
      break;
    case 'strong-emphasis':
      pushIfInactive(decorations, Decoration.mark({ class: 'cm-md-live-strong-emphasis' }).range(range.from, range.to), activeRanges, activeRange.from, activeRange.to);
      break;
    case 'strong':
      pushIfInactive(decorations, Decoration.mark({ class: 'cm-md-live-strong' }).range(range.from, range.to), activeRanges, activeRange.from, activeRange.to);
      break;
    case 'emphasis':
      pushIfInactive(decorations, Decoration.mark({ class: 'cm-md-live-emphasis' }).range(range.from, range.to), activeRanges, activeRange.from, activeRange.to);
      break;
    case 'strikethrough':
      pushIfInactive(decorations, Decoration.mark({ class: 'cm-md-live-strikethrough' }).range(range.from, range.to), activeRanges, activeRange.from, activeRange.to);
      break;
    case 'highlight':
      pushIfInactive(decorations, Decoration.mark({ class: 'cm-md-live-highlight' }).range(range.from, range.to), activeRanges, activeRange.from, activeRange.to);
      break;
    case 'formula-inline':
    case 'link':
    case 'wiki-link':
    case 'asset-embed':
    case 'comment':
      pushIfInactive(
        decorations,
        Decoration.replace({
          widget: new InlinePreviewWidget(token),
          inclusive: false,
        }).range(range.from, range.to),
        activeRanges,
        range.from,
        range.to,
      );
      break;
  }
}

function overlapsBlock(line: MarkdownLivePreviewRange, blocks: MarkdownLivePreviewBlockToken[]) {
  return blocks.some((block) => line.from < block.to && line.to > block.from);
}

function addActiveCodeFenceDecorations(
  state: EditorState,
  token: MarkdownLivePreviewBlockToken,
  decorations: Array<Range<Decoration>>,
) {
  for (let lineNumber = token.startLine; lineNumber <= token.endLine; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const classes = ['cm-md-live-source-block', 'cm-md-live-source-block--code_fence'];
    if (lineNumber === token.startLine) classes.push('cm-md-live-source-block--first');
    if (lineNumber === token.endLine) classes.push('cm-md-live-source-block--last');
    decorations.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
  }
}

function buildDecorations(state: EditorState, enabled: boolean): DecorationSet {
  if (!enabled) return Decoration.none;

  const decorations: Array<Range<Decoration>> = [];
  const activeRanges = state.selection.ranges.map((range) => ({
    from: range.from,
    to: range.to,
  }));
  const source = state.doc.toString();
  const blockTokens = collectMarkdownLivePreviewBlockTokens(source);
  const replaceableBlocks = blockTokens.filter((token) =>
    ['frontmatter', 'callout', 'table', 'math', 'mermaid', 'code_fence'].includes(token.kind),
  );

  for (const token of replaceableBlocks) {
    if (token.kind === 'code_fence' && isMarkdownLivePreviewRangeActive(token, activeRanges)) {
      addActiveCodeFenceDecorations(state, token, decorations);
      continue;
    }
    if (isMarkdownLivePreviewRangeActive(token, activeRanges)) continue;
    decorations.push(
      Decoration.replace({
        widget: new BlockPreviewWidget(token),
        block: true,
        inclusive: true,
      }).range(token.from, token.to),
    );
  }

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);

    if (overlapsBlock({ from: line.from, to: line.to }, replaceableBlocks)) continue;

    for (const token of collectMarkdownLivePreviewInlineTokens(line.text)) {
      addInlineTokenDecoration(token, line.from, { from: line.from, to: line.to }, decorations, activeRanges);
    }
  }

  return Decoration.set(decorations, true);
}

export function markdownLivePreviewDecorations(enabled: () => boolean): Extension {
  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, enabled());
    },
    update(_decorations, transaction) {
      return buildDecorations(transaction.state, enabled());
    },
    provide: (field) => [
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of((view) => view.state.field(field)),
      gutterWidgetClass.of(blockPreviewGutterClass),
      lineNumberWidgetMarker.of(blockPreviewLineNumber),
    ],
  });

  return field;
}

export const markdownWysiwygDecorations = markdownLivePreviewDecorations;
