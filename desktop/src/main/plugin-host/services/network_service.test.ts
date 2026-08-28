import { describe, expect, it, vi } from 'vitest';
import { NetworkService } from './network_service';

describe('NetworkService', () => {
  it('rejects non-web protocols and sensitive headers', async () => {
    const service = new NetworkService();
    await expect(service.fetch({ url: 'file:///secret' })).rejects.toThrow('PLUGIN_NETWORK_PROTOCOL_DENIED');
    await expect(service.fetch({ url: 'data:text/plain,secret' })).rejects.toThrow('PLUGIN_NETWORK_PROTOCOL_DENIED');
    await expect(service.fetch({ url: 'javascript:alert(1)' })).rejects.toThrow('PLUGIN_NETWORK_PROTOCOL_DENIED');
    await expect(service.fetch({ url: 'https://example.com', headers: { Cookie: 'secret' } })).rejects.toThrow('PLUGIN_NETWORK_HEADER_DENIED');
  });

  it('injects a plugin secret only for an explicitly allowed HTTPS origin', async () => {
    const readSecret = vi.fn(async () => 'SESSDATA=member-cookie');
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'));
    const service = new NetworkService(readSecret, fetcher);

    await service.fetch({
      url: 'https://api.bilibili.com/x/player/playurl',
      credential: {
        secretKey: 'bilibili.session',
        allowedOrigins: ['https://api.bilibili.com'],
      },
    }, 'plugin.one');

    expect(readSecret).toHaveBeenCalledWith('plugin.one', 'bilibili.session');
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Cookie')).toBe('SESSDATA=member-cookie');
    await expect(service.fetch({
      url: 'https://example.com',
      credential: {
        secretKey: 'bilibili.session',
        allowedOrigins: ['https://api.bilibili.com'],
      },
    }, 'plugin.one')).rejects.toThrow('PLUGIN_NETWORK_CREDENTIAL_ORIGIN_DENIED');
  });

  it('does not follow redirects outside the requested URL', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => { throw new TypeError('redirect disallowed'); });
    try {
      await expect(new NetworkService().fetch({ url: 'https://example.com' })).rejects.toThrow('redirect disallowed');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('allows plugins to opt into redirects and returns the final URL', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ status: 200, url: 'https://www.bilibili.com/video/BV1test', headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) }) as Response);
    try {
      const response = await new NetworkService().fetch({ url: 'https://b23.tv/abc', followRedirects: true, responseType: 'text' });
      expect(response.finalUrl).toBe('https://www.bilibili.com/video/BV1test');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('limits response size', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('0123456789'));
    try {
      await expect(new NetworkService().fetch({ url: 'https://example.com', maxBytes: 2 })).rejects.toThrow('PLUGIN_NETWORK_RESPONSE_TOO_LARGE');
    } finally { globalThis.fetch = originalFetch; }
  });
});
