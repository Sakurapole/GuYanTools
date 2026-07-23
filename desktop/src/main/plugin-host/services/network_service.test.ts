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

  it('does not follow redirects outside the requested URL', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => { throw new TypeError('redirect disallowed'); });
    try {
      await expect(new NetworkService().fetch({ url: 'https://example.com' })).rejects.toThrow('redirect disallowed');
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
