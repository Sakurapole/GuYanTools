import { describe, expect, it, vi } from 'vitest';
import { FileGrantService } from './file_grant_service';
import { MediaService } from './media_service';

type PreviewFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe('MediaService', () => {
  it('uses fixed ffprobe/ffmpeg argument shapes', async () => {
    const grants = new FileGrantService();
    const grant = grants.create('plugin.one', {
      purpose: 'media', rootPath: 'C:/tmp/plugin-one', accessMode: 'read-write',
      expiresAt: new Date(Date.now() + 60_000).toISOString(), maxBytes: 1_000,
    });
    const calls: string[][] = [];
    const run = vi.fn(async (command: 'ffprobe' | 'ffmpeg', args: string[]) => {
      calls.push([command, ...args]);
      return command === 'ffprobe' ? '{"format":{"duration":"1.5"},"streams":[]}' : '';
    });
    const service = new MediaService(grants, run);
    const probe = await service.probe('plugin.one', grant.id, 'input.mp4');
    expect(probe.durationMs).toBe(1500);
    await service.transcode('plugin.one', grant.id, 'input.mp4', grant.id, 'output.mp4', { videoCodec: 'copy' });
    expect(calls[1]).toContain('-c:v');
    await expect(service.transcode('plugin.one', grant.id, 'input.mp4', grant.id, 'output.mp4', { videoCodec: '-i' })).rejects.toThrow('PLUGIN_MEDIA_OPTION_INVALID');
  });

  it('proxies preview range requests with plugin-supplied safe headers', async () => {
    const grants = new FileGrantService();
    const forwardedHeaders: Headers[] = [];
    const fetcher: PreviewFetcher = async (_input, init) => {
      forwardedHeaders.push(new Headers(init?.headers));
      return new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: {
          'Content-Length': '2',
          'Content-Range': 'bytes 0-1/8',
        },
      });
    };
    const service = new MediaService(grants, vi.fn(), fetcher);

    const preview = await service.createPreview(
      'plugin.one',
      'https://cdn.example/media.m4s',
      'video/mp4',
      { Referer: 'https://www.bilibili.com/' },
    );
    const response = await service.handlePreviewRequest(new Request(preview.url, {
      headers: { Range: 'bytes=0-1' },
    }));

    expect(preview.url).toMatch(/^app:\/\/plugin-media-preview\//);
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect(response.headers.get('Content-Range')).toBe('bytes 0-1/8');
    expect(forwardedHeaders[0].get('Range')).toBe('bytes=0-1');
    expect(forwardedHeaders[0].get('Referer')).toBe('https://www.bilibili.com/');
  });

  it('injects a referenced plugin credential only for the preview source origin', async () => {
    const grants = new FileGrantService();
    const forwardedHeaders: Headers[] = [];
    const service = new MediaService(
      grants,
      vi.fn(),
      async (_input, init) => {
        forwardedHeaders.push(new Headers(init?.headers));
        return new Response(new Uint8Array([1]), { status: 206 });
      },
      async (pluginId, key) => pluginId === 'plugin.one' && key === 'bilibili.session' ? 'SESSDATA=member-cookie' : null,
    );
    const preview = await service.createPreview(
      'plugin.one',
      'https://cdn.example/media.m4s',
      'video/mp4',
      undefined,
      { secretKey: 'bilibili.session', allowedOrigins: ['https://cdn.example'] },
    );

    await service.handlePreviewRequest(new Request(preview.url));

    expect(forwardedHeaders[0].get('Cookie')).toBe('SESSDATA=member-cookie');
    await expect(service.createPreview(
      'plugin.one',
      'https://other.example/media.m4s',
      'video/mp4',
      undefined,
      { secretKey: 'bilibili.session', allowedOrigins: ['https://cdn.example'] },
    )).rejects.toThrow('PLUGIN_MEDIA_PREVIEW_CREDENTIAL_ORIGIN_DENIED');
  });
});
