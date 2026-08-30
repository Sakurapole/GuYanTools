// Temporary renderer-side processing limit. Saved home backgrounds are files,
// never database data URLs, and may be substantially larger than legacy inline media.
export const MAX_INLINE_VIDEO_BYTES = 64 * 1024 * 1024;

export function estimateDataUrlBytes(value: string): number | null {
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) {
    return null;
  }

  const payload = value.slice(commaIndex + 1).replace(/\s/g, '');
  if (!payload) {
    return 0;
  }

  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function isInlineVideoWithinLimit(value: string, maxBytes = MAX_INLINE_VIDEO_BYTES): boolean {
  if (!value.startsWith('data:video/')) {
    return true;
  }

  const estimatedBytes = estimateDataUrlBytes(value);
  return estimatedBytes === null || estimatedBytes <= maxBytes;
}

export function formatMediaBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function saveHomeLayoutMediaDataUrl(dataUrl: string, fileName = 'background') {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('媒体数据格式无效');
  const header = dataUrl.slice(0, comma);
  const match = header.match(/^data:([^;]+);base64$/i);
  if (!match) throw new Error('媒体数据格式无效');
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return window.homeLayoutApi?.saveMedia({ data: bytes, mimeType: match[1], fileName });
}

export async function saveHomeLayoutMediaFile(file: File) {
  return window.homeLayoutApi?.saveMedia({
    data: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
  });
}
