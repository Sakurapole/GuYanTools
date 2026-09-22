import type { NetworkRequest, NetworkResponse, PluginCredentialReference } from '@/contracts/plugin_media';
import { PluginApiError } from '../plugin_api_error';
import type { PluginQuotaService } from '../quota';

const BLOCKED_HEADERS = new Set(['cookie', 'set-cookie', 'proxy-authorization']);
type SecretReader = (pluginId: string, key: string) => Promise<string | null>;
type NetworkFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function assertCredentialOrigin(url: URL, credential: PluginCredentialReference) {
  if (!credential.secretKey || !/^[a-zA-Z0-9._-]+$/.test(credential.secretKey)) {
    throw new PluginApiError('INVALID_INPUT', 'PLUGIN_NETWORK_CREDENTIAL_INVALID');
  }
  if (credential.headerName && credential.headerName !== 'Cookie') {
    throw new PluginApiError('INVALID_INPUT', 'PLUGIN_NETWORK_CREDENTIAL_INVALID');
  }
  if (url.protocol !== 'https:' || !credential.allowedOrigins.includes(url.origin)) {
    throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_NETWORK_CREDENTIAL_ORIGIN_DENIED');
  }
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '0.0.0.0' || host === '::' || host === '::1') return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  // IPv6 unique-local / link-local
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true;
  if (host.startsWith('::ffff:')) {
    return isPrivateOrLocalHost(host.slice('::ffff:'.length));
  }
  return false;
}

export class NetworkService {
  constructor(
    private readonly readSecret: SecretReader = async () => null,
    private readonly fetcher: NetworkFetcher = globalThis.fetch.bind(globalThis),
    private readonly quota?: PluginQuotaService,
  ) {}

  async fetch(input: NetworkRequest, pluginId?: string): Promise<NetworkResponse> {
    let url: URL;
    try { url = new URL(input.url); } catch {
      throw new PluginApiError('INVALID_INPUT', 'PLUGIN_NETWORK_URL_INVALID');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_NETWORK_PROTOCOL_DENIED');
    }
    if (isPrivateOrLocalHost(url.hostname)) {
      throw new PluginApiError('NETWORK_PRIVATE_DENIED', 'PLUGIN_NETWORK_PRIVATE_DENIED');
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      if (BLOCKED_HEADERS.has(name.toLowerCase())) {
        throw new PluginApiError('PERMISSION_DENIED', `PLUGIN_NETWORK_HEADER_DENIED: ${name}`);
      }
      headers.set(name, value);
    }
    if (input.credential) {
      if (!pluginId) {
        throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_NETWORK_CREDENTIAL_CONTEXT_MISSING');
      }
      assertCredentialOrigin(url, input.credential);
      const value = await this.readSecret(pluginId, input.credential.secretKey);
      if (!value) {
        throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_NETWORK_CREDENTIAL_UNAVAILABLE');
      }
      headers.set(input.credential.headerName ?? 'Cookie', value);
    }

    const maxBytes = this.quota
      ? this.quota.clampNetworkResponseBytes(input.maxBytes)
      : Math.min(input.maxBytes ?? 8 * 1024 * 1024, 32 * 1024 * 1024);

    const acquiredSlot = pluginId && this.quota
      ? await this.quota.acquireNetworkSlot(pluginId)
      : null;
    if (acquiredSlot && !acquiredSlot.allowed) {
      throw new PluginApiError('QUOTA_EXCEEDED', 'PLUGIN_NETWORK_QUOTA');
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
      if (bytes.byteLength > maxBytes) {
        throw new PluginApiError('NETWORK_RESPONSE_TOO_LARGE', 'PLUGIN_NETWORK_RESPONSE_TOO_LARGE');
      }
      const responseType = input.responseType ?? 'text';
      let body: unknown = new TextDecoder().decode(bytes);
      if (responseType === 'bytes') body = Buffer.from(bytes).toString('base64');
      if (responseType === 'json') {
        try { body = JSON.parse(String(body)); } catch {
          throw new PluginApiError('INVALID_INPUT', 'PLUGIN_NETWORK_JSON_INVALID');
        }
      }
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
        finalUrl: response.url || url.toString(),
      };
    } finally {
      clearTimeout(timer);
      if (pluginId && this.quota) this.quota.releaseNetworkSlot(pluginId);
    }
  }
}
