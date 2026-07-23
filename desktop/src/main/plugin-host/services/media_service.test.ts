import { describe, expect, it, vi } from 'vitest';
import { FileGrantService } from './file_grant_service';
import { MediaService } from './media_service';

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
});
