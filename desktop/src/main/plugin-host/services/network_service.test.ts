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
      'http://[fe90::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://224.0.0.1/',
      'http://255.255.255.255/',
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

  it('rejects a redirect to a private address before sending the next request', async () => {
    const fetcher = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/admin' },
    }));
    const service = new NetworkService(async () => null, fetcher);

    await expect(service.fetch({ url: 'https://example.com/start', followRedirects: true }))
      .rejects.toThrow('PLUGIN_NETWORK_PRIVATE_DENIED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a redirect that would forward a credential to another origin', async () => {
    const fetcher = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'https://other.example/path' },
    }));
    const service = new NetworkService(async () => 'token', fetcher);

    await expect(service.fetch({
      url: 'https://example.com/start',
      followRedirects: true,
      credential: { secretKey: 'session', allowedOrigins: ['https://example.com'] },
    }, 'plugin.one')).rejects.toThrow('PLUGIN_NETWORK_CREDENTIAL_ORIGIN_DENIED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not forward an authorization header across origins', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => fetcher.mock.calls.length === 1
      ? new Response(null, { status: 302, headers: { location: 'https://other.example/path' } })
      : new Response('ok'));
    const service = new NetworkService(async () => null, fetcher);

    await service.fetch({
      url: 'https://example.com/start',
      followRedirects: true,
      headers: { Authorization: 'Bearer secret' },
    });

    expect((fetcher.mock.calls[0]?.[1] as RequestInit).headers).toBeInstanceOf(Headers);
    expect(new Headers((fetcher.mock.calls[1]?.[1] as RequestInit).headers).has('authorization')).toBe(false);
  });

  it('rejects a DNS answer containing a private address', async () => {
    const fetcher = vi.fn(async () => new Response('ok'));
    const resolveHost = vi.fn(async () => [{ address: '10.0.0.1', family: 4 as const }]);
    const service = new NetworkService(async () => null, fetcher, undefined, resolveHost);

    await expect(service.fetch({ url: 'https://rebind.example/' }))
      .rejects.toThrow('PLUGIN_NETWORK_PRIVATE_DENIED');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('pins the validated DNS address for the transport request', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit, _pinned?: { address: string; family: 4 | 6 }) => new Response('ok'));
    const resolveHost = vi.fn(async () => [{ address: '93.184.215.14', family: 4 as const }]);
    const service = new NetworkService(async () => null, fetcher, undefined, resolveHost);

    await service.fetch({ url: 'https://rebind.example/' });
    expect(resolveHost).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[2]).toEqual({ address: '93.184.215.14', family: 4 });
  });

  it('cancels an oversized response while reading its stream', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
      },
      cancel,
    }));
    const service = new NetworkService(async () => null, async () => response);

    await expect(service.fetch({ url: 'https://example.com/', maxBytes: 4 }))
      .rejects.toThrow('PLUGIN_NETWORK_RESPONSE_TOO_LARGE');
    expect(cancel).toHaveBeenCalled();
  });
});
