const blockedTags = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
] as const;

const dangerousDataHtmlPattern = /^data:text\/html(?:[;,]|$)/i;
const attributePattern =
  /\s+([^\s"'<>/=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const calloutLabels: Record<string, string> = {
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

export function normalizeKnowledgeAssetReference(value: string): string {
  if (!value.toLowerCase().startsWith('file://')) return value;

  try {
    const url = new URL(value);
    const decodedPath = decodeURIComponent(url.pathname);
    const storagePath = decodedPath.replace(/^\/([a-zA-Z]:\/)/, '$1');
    if (!/[\\/]knowledge-assets[\\/]/i.test(storagePath)) return value;
    return `app://knowledge-assets/path/${encodeURIComponent(storagePath)}`;
  } catch {
    return value;
  }
}

export function sanitizeKnowledgeMarkdownHtml(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    return sanitizeWithDomParser(html);
  }

  return sanitizeWithoutDomParser(html);
}

function sanitizeWithDomParser(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  doc.querySelectorAll(blockedTags.join(', ')).forEach((node) => node.remove());

  doc.body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const normalizedValue = normalizeKnowledgeAssetReference(attribute.value.trim());

      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (normalizedValue !== attribute.value) {
        element.setAttribute(attribute.name, normalizedValue);
      }

      if (isDangerousReferenceAttribute(name, normalizedValue)) {
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

function sanitizeWithoutDomParser(html: string): string {
  let sanitized = html;

  for (const tag of blockedTags) {
    sanitized = sanitized.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'),
      '',
    );
    sanitized = sanitized.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
    sanitized = sanitized.replace(new RegExp(`<\\/${tag}>`, 'gi'), '');
  }

  sanitized = sanitized.replace(/<([A-Za-z][A-Za-z0-9:-]*)([^>]*)>/g, (match, tagName: string, attributes: string) => {
    if (tagName.startsWith('/')) return match;
    const safeAttributes = sanitizeAttributeText(attributes);
    return `<${tagName}${safeAttributes}>`;
  });

  return decorateCalloutHtmlFallback(sanitized);
}

function sanitizeAttributeText(attributes: string): string {
  return attributes.replace(
    attributePattern,
    (attribute, rawName: string, _rawValue: string, doubleQuoted?: string, singleQuoted?: string, unquoted?: string) => {
      const name = rawName.toLowerCase();
      const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
      const normalizedValue = normalizeKnowledgeAssetReference(value.trim());

      if (name.startsWith('on') || isDangerousReferenceAttribute(name, normalizedValue)) {
        return '';
      }

      if (normalizedValue === value) {
        return attribute;
      }

      return ` ${rawName}="${escapeAttribute(normalizedValue)}"`;
    },
  );
}

function isDangerousReferenceAttribute(name: string, value: string): boolean {
  const normalizedValue = normalizeReferenceForSafetyCheck(value);

  return (
    (name === 'href' || name === 'src' || name === 'xlink:href') &&
    (normalizedValue.startsWith('javascript:') ||
      normalizedValue.startsWith('vbscript:') ||
      dangerousDataHtmlPattern.test(normalizedValue))
  );
}

function normalizeReferenceForSafetyCheck(value: string): string {
  return decodeBasicHtmlEntities(value)
    .trim()
    .split('')
    .filter((character) => {
      const codePoint = character.charCodeAt(0);
      return codePoint > 0x20 && codePoint !== 0x7f;
    })
    .join('')
    .toLowerCase();
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);?/g, (_match, codePoint: string) =>
      decodeCodePoint(Number.parseInt(codePoint, 16)),
    )
    .replace(/&#([0-9]+);?/g, (_match, codePoint: string) =>
      decodeCodePoint(Number.parseInt(codePoint, 10)),
    )
    .replace(/&(colon|tab|newline);/gi, (_match, entity: string) => {
      const normalizedEntity = entity.toLowerCase();
      if (normalizedEntity === 'colon') return ':';
      if (normalizedEntity === 'tab') return '\t';
      return '\n';
    })
    .replace(/&amp;/gi, '&');
}

function decodeCodePoint(codePoint: number): string {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return '';
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return '';
  }
}

function decorateCallouts(doc: Document): void {
  doc.body.querySelectorAll('blockquote').forEach((quote) => {
    const firstParagraph = quote.querySelector('p');
    const html = firstParagraph?.innerHTML ?? '';
    const match = /^\s*\[!([A-Za-z]+)\]\s*([^<\n]*)/i.exec(html);
    if (!firstParagraph || !match) return;

    const type = match[1].toLowerCase();
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    quote.classList.add('knowledge-md-callout', `knowledge-md-callout--${type}`);

    const header = doc.createElement('div');
    header.className = 'knowledge-md-callout__title';
    header.textContent = title
      ? `${calloutLabels[type] ?? type.toUpperCase()} · ${title}`
      : calloutLabels[type] ?? type.toUpperCase();
    quote.insertBefore(header, quote.firstChild);

    const bodyHtml = html
      .replace(/^\s*\[![A-Za-z]+\]\s*[^<\n]*(<br\s*\/?>)?/i, '')
      .trim();
    if (bodyHtml) {
      firstParagraph.innerHTML = bodyHtml;
    } else {
      firstParagraph.remove();
    }
  });
}

function decorateCalloutHtmlFallback(html: string): string {
  return html.replace(
    /<blockquote([^>]*)>\s*<p([^>]*)>\s*\[!([A-Za-z]+)\]\s*([^<\n]*)([\s\S]*?)<\/p>/gi,
    (
      _match,
      blockquoteAttributes: string,
      paragraphAttributes: string,
      rawType: string,
      rawTitle: string,
      bodyHtml: string,
    ) => {
      const type = rawType.toLowerCase();
      const title = rawTitle.replace(/<[^>]+>/g, '').trim();
      const label = title
        ? `${calloutLabels[type] ?? type.toUpperCase()} · ${title}`
        : calloutLabels[type] ?? type.toUpperCase();
      const classAttribute = mergeClassAttribute(
        blockquoteAttributes,
        `knowledge-md-callout knowledge-md-callout--${type}`,
      );
      const trimmedBody = bodyHtml.replace(/^\s*<br\s*\/?>/i, '').trim();
      const paragraph = trimmedBody ? `<p${paragraphAttributes}>${trimmedBody}</p>` : '';

      return `<blockquote${classAttribute}><div class="knowledge-md-callout__title">${escapeHtml(label)}</div>${paragraph}`;
    },
  );
}

function mergeClassAttribute(attributes: string, classes: string): string {
  const classMatch = /\sclass\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attributes);
  if (!classMatch) {
    return `${attributes} class="${classes}"`;
  }

  const existingClass = classMatch[2] ?? classMatch[3] ?? classMatch[4] ?? '';
  const mergedClass = `${existingClass} ${classes}`.trim();
  return attributes.replace(classMatch[0], ` class="${escapeAttribute(mergedClass)}"`);
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value: string): string {
  return escapeAttribute(value).replace(/'/g, '&#39;');
}
