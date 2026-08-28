import type { NetworkRequest, NetworkResponse, PluginCredentialReference } from '@/contracts/plugin_media';

const MAX_RESPONSE_BYTES = 512 * 1024 * 1024;
const BLOCKED_HEADERS = new Set(['cookie', 'set-cookie', 'proxy-authorization']);
type SecretReader = (pluginId: string, key: string) => Promise<string | null>;
type NetworkFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function assertCredentialOrigin(url: URL, credential: PluginCredentialReference) {
  if (!credential.secretKey || !/^[a-zA-Z0-9._-]+$/.test(credential.secretKey)) {
    throw new Error('PLUGIN_NETWORK_CREDENTIAL_INVALID');
  }
  if (credential.headerName && credential.headerName !== 'Cookie') {
    throw new Error('PLUGIN_NETWORK_CREDENTIAL_INVALID');
  }
  if (url.protocol !== 'https:' || !credential.allowedOrigins.includes(url.origin)) {
    throw new Error('PLUGIN_NETWORK_CREDENTIAL_ORIGIN_DENIED');
  }
}

export class NetworkService {
  constructor(
    private readonly readSecret: SecretReader = async () => null,
    private readonly fetcher: NetworkFetcher = globalThis.fetch.bind(globalThis),
  ) {}

  async fetch(input: NetworkRequest, pluginId?: string): Promise<NetworkResponse> {
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
    if (input.credential) {
      if (!pluginId) throw new Error('PLUGIN_NETWORK_CREDENTIAL_CONTEXT_MISSING');
      assertCredentialOrigin(url, input.credential);
      const value = await this.readSecret(pluginId, input.credential.secretKey);
      if (!value) throw new Error('PLUGIN_NETWORK_CREDENTIAL_UNAVAILABLE');
      headers.set(input.credential.headerName ?? 'Cookie', value);
    }
    const timeout = Math.min(Math.max(input.timeoutMs ?? 15_000, 100), 60_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await this.fetcher(url, {
        method: input.method ?? 'GET',
        headers,
        body: input.body,
        redirect: input.followRedirects ? 'follow' : 'error',
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
        finalUrl: response.url || url.toString(),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
