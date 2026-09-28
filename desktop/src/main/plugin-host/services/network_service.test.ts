import { describe, expect, it, vi } from 'vitest';
import { NetworkService } from './network_service';
import { PluginQuotaService } from '../quota';

describe('NetworkService SSRF and quotas', () => {
  it('rejects non-web protocols and sensitive headers', async () => {
    const service = new NetworkService();
    await expect(service.fetch({ url: 'file:///secret' })).rejects.toThrow(
      'PLUGIN_NETWORK_PROTOCOL_DENIED'
    );
    await expect(service.fetch({ url: 'data:text/plain,secret' })).rejects.toThrow(
      'PLUGIN_NETWORK_PROTOCOL_DENIED'
    );
    await expect(service.fetch({ url: 'javascript:alert(1)' })).rejects.toThrow(
      'PLUGIN_NETWORK_PROTOCOL_DENIED'
    );
    await expect(
      service.fetch({ url: 'https://example.com', headers: { Cookie: 'secret' } })
    ).rejects.toThrow('PLUGIN_NETWORK_HEADER_DENIED');
  });

  it('rejects private and loopback hosts', async () => {
    const service = new NetworkService();
    for (const url of [
      'http://127.0.0.1/admin',
      'http://localhost:8080',
      'http://10.0.0.5/api',
      'http://192.168.1.1',
      'http://172.16.0.1',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
    ]) {
      await expect(service.fetch({ url })).rejects.toThrow('PLUGIN_NETWORK_PRIVATE_DENIED');
    }
  });

  it('allows public hosts', async () => {
    const fetcher = vi.fn(async () => new Response('ok'));
    const service = new NetworkService(async () => null, fetcher);
    await expect(service.fetch({ url: 'https://example.com/path' })).resolves.toMatchObject({
      status: 200,
    });
  });

  it('injects a plugin secret only for an explicitly allowed HTTPS origin', async () => {
    const readSecret = vi.fn(async () => 'SESSDATA=member-cookie');
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}')
    );
    const service = new NetworkService(readSecret, fetcher);

    await service.fetch(
      {
        url: 'https://api.bilibili.com/x/player/playurl',
        credential: {
          secretKey: 'bilibili.session',
          allowedOrigins: ['https://api.bilibili.com'],
        },
      },
      'plugin.one'
    );

    expect(readSecret).toHaveBeenCalledWith('plugin.one', 'bilibili.session');
    await expect(
      service.fetch(
        {
          url: 'https://example.com',
          credential: {
            secretKey: 'bilibili.session',
            allowedOrigins: ['https://api.bilibili.com'],
          },
        },
        'plugin.one'
      )
    ).rejects.toThrow('PLUGIN_NETWORK_CREDENTIAL_ORIGIN_DENIED');
  });

  it('enforces response size limits and hard cap', async () => {
    const fetcher = vi.fn(async () => new Response('0123456789'));
    const service = new NetworkService(async () => null, fetcher);
    await expect(service.fetch({ url: 'https://example.com', maxBytes: 2 })).rejects.toThrow(
      'PLUGIN_NETWORK_RESPONSE_TOO_LARGE'
    );
  });

  it('enforces per-plugin concurrency quota', async () => {
    let resolveFetch: ((value: Response) => void) | null = null;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const quota = new PluginQuotaService({ networkConcurrency: 1, networkRequestsPerMinute: 100 });
    const service = new NetworkService(async () => null, fetcher, quota);

    const first = service.fetch({ url: 'https://example.com/1' }, 'plugin.quota');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(service.fetch({ url: 'https://example.com/2' }, 'plugin.quota')).rejects.toThrow(
      'PLUGIN_NETWORK_QUOTA'
    );
    resolveFetch?.(new Response('ok'));
    await first;
  });
});
