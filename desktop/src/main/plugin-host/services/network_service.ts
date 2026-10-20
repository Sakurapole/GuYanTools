import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';
import type {
  NetworkRequest,
  NetworkResponse,
  PluginCredentialReference,
} from '@/contracts/plugin_media';
import { PluginApiError } from '../plugin_api_error';
import type { PluginQuotaService } from '../quota';

const BLOCKED_HEADERS = new Set(['cookie', 'set-cookie', 'proxy-authorization']);
type SecretReader = (pluginId: string, key: string) => Promise<string | null>;
type ResolvedAddress = { address: string; family: 4 | 6 };
type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;
type NetworkFetcher = (input: RequestInfo | URL, init?: RequestInit, pinned?: ResolvedAddress) => Promise<Response>;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;
const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) blockedIpv4.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['fc00::', 7],
  ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
] as const) blockedIpv6.addSubnet(address, prefix, 'ipv6');

const defaultResolver: HostResolver = async (hostname) =>
  dns.lookup(hostname, { all: true, verbatim: true }) as Promise<ResolvedAddress[]>;

function secureFetch(input: RequestInfo | URL, init: RequestInit = {}, pinned?: ResolvedAddress): Promise<Response> {
  const url = new URL(String(input));
  if (!pinned) throw new PluginApiError('NETWORK_FAILED', 'PLUGIN_NETWORK_DNS_UNRESOLVED');
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: init.method,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      signal: init.signal ?? undefined,
      agent: false,
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
    }, (incoming) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const status = incoming.statusCode ?? 502;
      const body = status === 204 || status === 304
        ? null
        : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      resolve(new Response(body, { status, headers }));
    });
    request.on('error', reject);
    request.end(typeof init.body === 'string' ? init.body : undefined);
  });
}

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
  const family = isIP(host);
  return family === 4
    ? blockedIpv4.check(host, 'ipv4')
    : family === 6 && blockedIpv6.check(host, 'ipv6');
}

export class NetworkService {
  private readonly fetcher: NetworkFetcher;
  private readonly resolveHost?: HostResolver;

  constructor(
    private readonly readSecret: SecretReader = async () => null,
    fetcher?: NetworkFetcher,
    private readonly quota?: PluginQuotaService,
    resolveHost?: HostResolver
  ) {
    this.fetcher = fetcher ?? secureFetch;
    this.resolveHost = resolveHost ?? (fetcher ? undefined : defaultResolver);
  }

  async fetch(input: NetworkRequest, pluginId?: string): Promise<NetworkResponse> {
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      throw new PluginApiError('INVALID_INPUT', 'PLUGIN_NETWORK_URL_INVALID');
    }
    this.assertPublicUrl(url);
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

    const acquiredSlot =
      pluginId && this.quota ? await this.quota.acquireNetworkSlot(pluginId) : null;
    if (acquiredSlot && !acquiredSlot.allowed) {
      throw new PluginApiError('QUOTA_EXCEEDED', 'PLUGIN_NETWORK_QUOTA');
    }

    const timeout = Math.min(Math.max(input.timeoutMs ?? 15_000, 100), 60_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      let response: Response;
      let method = input.method ?? 'GET';
      let requestBody = input.body;
      let requestHeaders = headers;
      for (let redirects = 0; ; redirects += 1) {
        this.assertPublicUrl(url);
        if (input.credential) assertCredentialOrigin(url, input.credential);
        const pinned = await this.resolveAddress(url);
        response = await this.fetcher(url, {
          method,
          headers: requestHeaders,
          body: requestBody,
          redirect: 'manual',
          signal: controller.signal,
        }, pinned);
        if (!REDIRECT_STATUSES.has(response.status)) break;
        if (!input.followRedirects || redirects >= MAX_REDIRECTS) {
          await response.body?.cancel();
          throw new PluginApiError('NETWORK_FAILED', 'PLUGIN_NETWORK_REDIRECT_DENIED');
        }
        const location = response.headers.get('location');
        if (!location) break;
        const next = new URL(location, url);
        this.assertPublicUrl(next);
        if (input.credential) assertCredentialOrigin(next, input.credential);
        await response.body?.cancel();
        if (next.origin !== url.origin) {
          requestHeaders = new Headers(requestHeaders);
          requestHeaders.delete('authorization');
        }
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
          method = 'GET';
          requestBody = undefined;
        }
        url = next;
      }
      const bytes = await this.readBounded(response, maxBytes);
      const responseType = input.responseType ?? 'text';
      let body: unknown = new TextDecoder().decode(bytes);
      if (responseType === 'bytes') body = Buffer.from(bytes).toString('base64');
      if (responseType === 'json') {
        try {
          body = JSON.parse(String(body));
        } catch {
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

  private assertPublicUrl(url: URL) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new PluginApiError('PERMISSION_DENIED', 'PLUGIN_NETWORK_PROTOCOL_DENIED');
    }
    if (isPrivateOrLocalHost(url.hostname)) {
      throw new PluginApiError('NETWORK_PRIVATE_DENIED', 'PLUGIN_NETWORK_PRIVATE_DENIED');
    }
  }

  private async resolveAddress(url: URL): Promise<ResolvedAddress | undefined> {
    if (!this.resolveHost) return undefined;
    const literalFamily = isIP(url.hostname.replace(/^\[|\]$/g, ''));
    const addresses = literalFamily
      ? [{ address: url.hostname.replace(/^\[|\]$/g, ''), family: literalFamily as 4 | 6 }]
      : await this.resolveHost(url.hostname);
    if (addresses.length === 0 || addresses.some(({ address }) => !isIP(address) || isPrivateOrLocalHost(address))) {
      throw new PluginApiError('NETWORK_PRIVATE_DENIED', 'PLUGIN_NETWORK_PRIVATE_DENIED');
    }
    return addresses[0];
  }

  private async readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel();
      throw new PluginApiError('NETWORK_RESPONSE_TOO_LARGE', 'PLUGIN_NETWORK_RESPONSE_TOO_LARGE');
    }
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new PluginApiError('NETWORK_RESPONSE_TOO_LARGE', 'PLUGIN_NETWORK_RESPONSE_TOO_LARGE');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
}
