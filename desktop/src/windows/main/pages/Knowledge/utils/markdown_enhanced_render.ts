import { renderToString } from 'katex';
import { marked } from 'marked';
import { sanitizeKnowledgeMarkdownHtml } from './markdown_sanitize';

const mermaidSourceAttribute = 'data-knowledge-mermaid-source';
let mermaidInitialized = false;
let mermaidRenderSerial = 0;
let mermaidModulePromise: Promise<typeof import('mermaid')['default']> | null = null;

async function loadMermaid() {
  mermaidModulePromise ??= import('mermaid').then((module) => module.default);
  return mermaidModulePromise;
}

async function ensureMermaidInitialized() {
  const mermaid = await loadMermaid();
  if (mermaidInitialized) return mermaid;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
  });
  mermaidInitialized = true;
  return mermaid;
}

export function renderMarkdownFormulaToHtml(source: string, displayMode: boolean): string {
  const expression = source.trim();
  if (!expression) {
    return displayMode
      ? '<figure class="knowledge-md-math knowledge-md-math--block knowledge-md-math--empty"></figure>'
      : '<span class="knowledge-md-math knowledge-md-math--inline knowledge-md-math--empty"></span>';
  }

  try {
    const rendered = renderToString(expression, {
      displayMode,
      output: 'htmlAndMathml',
      throwOnError: false,
      trust: false,
      strict: 'warn',
    });
    const tag = displayMode ? 'figure' : 'span';
    const classes = displayMode
      ? 'knowledge-md-math knowledge-md-math--block'
      : 'knowledge-md-math knowledge-md-math--inline';
    return `<${tag} class="${classes}">${rendered}</${tag}>`;
  } catch {
    const tag = displayMode ? 'figure' : 'span';
    const classes = displayMode
      ? 'knowledge-md-math knowledge-md-math--block knowledge-md-math--error'
      : 'knowledge-md-math knowledge-md-math--inline knowledge-md-math--error';
    return `<${tag} class="${classes}"><code>${escapeHtml(expression)}</code></${tag}>`;
  }
}

export function renderMarkdownPreviewHtml(source: string): string {
  const rendered = marked.parse(renderEnhancedMarkdown(source), {
    async: false,
    breaks: false,
    gfm: true,
  }) as string;
  return decorateKnowledgeAssetHtml(sanitizeKnowledgeMarkdownHtml(rendered));
}

export function renderMarkdownMermaidElements(root: ParentNode): void {
  const elements = root.querySelectorAll<HTMLElement>(`[${mermaidSourceAttribute}]`);
  elements.forEach((element) => {
    void renderMarkdownMermaidElement(element, element.getAttribute(mermaidSourceAttribute) ?? '');
  });
}

export async function renderMarkdownMermaidElement(element: HTMLElement, source: string): Promise<void> {
  const diagram = source.trim();
  if (!diagram) {
    element.innerHTML = '<div class="knowledge-md-mermaid__empty">Empty Mermaid diagram</div>';
    element.dataset.rendered = 'true';
    return;
  }

  const previousSource = element.dataset.renderedSource;
  if (element.dataset.rendered === 'true' && previousSource === diagram) return;
  if (element.dataset.rendered === 'pending' && previousSource === diagram) return;

  element.dataset.rendered = 'pending';
  element.dataset.renderedSource = diagram;
  element.innerHTML = '<div class="knowledge-md-mermaid__loading">Rendering Mermaid...</div>';

  try {
    const mermaid = await ensureMermaidInitialized();
    const id = `knowledge-mermaid-${Date.now()}-${mermaidRenderSerial++}`;
    const result = await mermaid.render(id, diagram);
    if (element.dataset.renderedSource !== diagram) return;
    element.innerHTML = result.svg;
    normalizeMermaidSvgSize(element);
    requestAnimationFrame(() => normalizeMermaidSvgSize(element, true));
    element.dataset.rendered = 'true';
  } catch (error) {
    element.innerHTML = [
      '<div class="knowledge-md-mermaid__error">Mermaid render failed</div>',
      `<pre><code>${escapeHtml(error instanceof Error ? error.message : String(error))}</code></pre>`,
      `<pre><code>${escapeHtml(diagram)}</code></pre>`,
    ].join('');
    element.dataset.rendered = 'error';
  }
}

function normalizeMermaidSvgSize(element: HTMLElement, allowFallback = false) {
  const svg = element.querySelector<SVGSVGElement>('svg');
  if (!svg) return;

  try {
    const box = svg.getBBox();
    if (box.width > 0 && box.height > 0) {
      const padding = 8;
      const x = Math.floor(box.x - padding);
      const y = Math.floor(box.y - padding);
      const width = Math.ceil(box.width + padding * 2);
      const height = Math.ceil(box.height + padding * 2);
      svg.removeAttribute('style');
      svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
      element.style.width = 'fit-content';
      element.style.maxWidth = '100%';
      return;
    }
  } catch {
    // Some SVG implementations can reject getBBox before layout; CSS still keeps the block compact.
  }

  if (allowFallback) {
    svg.removeAttribute('style');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
    element.style.width = 'fit-content';
    element.style.maxWidth = '100%';
  }
}

function renderEnhancedMarkdown(value: string) {
  let enhancedSource = value;
  enhancedSource = enhancedSource.replace(
    /```mermaid\s*\r?\n([\s\S]*?)```/gi,
    (_match, body: string) => {
      const source = body.trim();
      return [
        '',
        `<div class="knowledge-md-mermaid" ${mermaidSourceAttribute}="${escapeAttribute(source)}">`,
        '<div class="knowledge-md-mermaid__loading">Rendering Mermaid...</div>',
        '</div>',
        '',
      ].join('\n');
    },
  );
  enhancedSource = renderTaskMarkersAndWikiLinks(enhancedSource);
  enhancedSource = enhancedSource.replace(
    /(^|\n)\$\$\s*\n?([\s\S]*?)\n?\$\$(?=\n|$)/g,
    (_match, prefix: string, body: string) => `${prefix}${renderMarkdownFormulaToHtml(body, true)}`,
  );
  enhancedSource = enhancedSource.replace(
    /(^|[\s([>])\$([^$\n]+?)\$(?=[$\s,.;:!?)]|$)/g,
    (_match, prefix: string, body: string) => `${prefix}${renderMarkdownFormulaToHtml(body, false)}`,
  );
  return enhancedSource;
}

function renderTaskMarkersAndWikiLinks(source: string) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let inFence = false;
  let fenceMarker = '';

  return lines.map((line, index) => {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
        fenceMarker = '';
      }
      return line;
    }

    if (inFence) return line;

    const taskLine = line.replace(
      /^(\s*[-*+]\s+)\[([ xX])\]\s*/,
      (_match, prefix: string, checked: string) => {
        const isChecked = checked.toLowerCase() === 'x';
        return [
          prefix,
          `<span class="knowledge-md-task-marker${isChecked ? ' knowledge-md-task-marker--checked' : ''}" `,
          'role="checkbox" tabindex="0" ',
          'data-knowledge-task-marker="true" ',
          `data-knowledge-task-line="${index + 1}" `,
          `data-knowledge-task-checked="${isChecked ? 'true' : 'false'}" `,
          `aria-checked="${isChecked ? 'true' : 'false'}">`,
          isChecked ? '✓' : '',
          '</span> ',
        ].join('');
      },
    );

    return taskLine.replace(
      /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g,
      (_match, rawTitle: string, rawAlias?: string) => {
        const title = rawTitle.trim();
        const label = (rawAlias ?? rawTitle).trim();
        if (!title || !label) return _match;
        return [
          `<a class="knowledge-md-wiki-link" href="app://knowledge-pages/title/${encodeURIComponent(title)}" `,
          `data-knowledge-page-title="${escapeAttribute(title)}">`,
          escapeHtml(label),
          '</a>',
        ].join('');
      },
    );
  }).join('\n');
}

function decorateKnowledgeAssetHtml(html: string) {
  return html
    .replace(
      /<a\b([^>]*\shref="app:\/\/knowledge-assets\/[^"]+"[^>]*)>/gi,
      (match, attributes: string) => (
        /\sdata-knowledge-asset-action=/i.test(attributes)
          ? match
          : `<a${attributes} data-knowledge-asset-action="open">`
      ),
    )
    .replace(
      /<img\b([^>]*\ssrc="app:\/\/knowledge-assets\/[^"]+"[^>]*)>/gi,
      (match, attributes: string) => (
        /\sdata-knowledge-asset-action=/i.test(attributes)
          ? match
          : `<img${attributes} data-knowledge-asset-action="preview">`
      ),
    );
}

function escapeHtml(value: string) {
  return escapeAttribute(value).replace(/'/g, '&#39;');
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
