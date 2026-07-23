import type { NetworkRequest, NetworkResponse } from '@/contracts/plugin_media';

const MAX_RESPONSE_BYTES = 512 * 1024 * 1024;
const BLOCKED_HEADERS = new Set(['cookie', 'set-cookie', 'proxy-authorization']);

export class NetworkService {
  async fetch(input: NetworkRequest): Promise<NetworkResponse> {
    let url: URL;
    try { url = new URL(input.url); } catch { throw new Error('PLUGIN_NETWORK_URL_INVALID'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('PLUGIN_NETWORK_PROTOCOL_DENIED');
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      if (BLOCKED_HEADERS.has(name.toLowerCase())) throw new Error(`PLUGIN_NETWORK_HEADER_DENIED: ${name}`);
      headers.set(name, value);
    }
    const timeout = Math.min(Math.max(input.timeoutMs ?? 15_000, 100), 60_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await globalThis.fetch(url, {
        method: input.method ?? 'GET',
        headers,
        body: input.body,
        redirect: 'error',
        signal: controller.signal,
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const maxBytes = Math.min(input.maxBytes ?? MAX_RESPONSE_BYTES, MAX_RESPONSE_BYTES);
      if (bytes.byteLength > maxBytes) throw new Error('PLUGIN_NETWORK_RESPONSE_TOO_LARGE');
      const responseType = input.responseType ?? 'text';
      let body: unknown = new TextDecoder().decode(bytes);
      if (responseType === 'bytes') body = Buffer.from(bytes).toString('base64');
      if (responseType === 'json') {
        try { body = JSON.parse(String(body)); } catch { throw new Error('PLUGIN_NETWORK_JSON_INVALID'); }
      }
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
        finalUrl: url.toString(),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
