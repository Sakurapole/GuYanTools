interface MarkdownSegmentInput {
  id: string;
  hash: string;
  source: string;
}

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
  const rendererVersion = options.rendererVersion ?? 'default';
  const entries = new Map<string, RenderedMarkdownSegment>();

  return {
    render(segment: MarkdownSegmentInput): string {
      const key = createCacheKey(rendererVersion, segment.id, segment.hash);
      const cached = entries.get(key);

      if (cached) {
        return cached.html;
      }

      const html = options.sanitizeHtml(options.renderMarkdown(segment.source));
      entries.set(key, {
        segmentId: segment.id,
        hash: segment.hash,
        html,
      });

      return html;
    },

    invalidate(segmentIds: Iterable<string>): void {
      const ids = new Set(segmentIds);

      for (const [key, entry] of entries) {
        if (ids.has(entry.segmentId)) {
          entries.delete(key);
        }
      }
    },

    clear(): void {
      entries.clear();
    },

    size(): number {
      return entries.size;
    },
  };
}

function createCacheKey(rendererVersion: string, segmentId: string, hash: string): string {
  return `${rendererVersion}\u0000${segmentId}\u0000${hash}`;
}
