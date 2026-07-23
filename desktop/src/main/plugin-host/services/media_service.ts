import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import type { MediaProbe, MediaTags, PreviewGrant } from '@/contracts/plugin_media';
import { FileGrantService } from './file_grant_service';

type ProcessRunner = (command: 'ffprobe' | 'ffmpeg', args: string[]) => Promise<string>;

function runProcess(command: 'ffprobe' | 'ffmpeg', args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(`PLUGIN_MEDIA_PROCESS_FAILED: ${stderr.trim()}`)));
  });
}

export class MediaService {
  private readonly previews = new Map<string, PreviewGrant>();

  constructor(private readonly grants: FileGrantService, private readonly run: ProcessRunner = runProcess) {}

  async probe(pluginId: string, grantId: string, targetPath: string): Promise<MediaProbe> {
    const input = this.grants.resolve(pluginId, grantId, targetPath, 'read');
    let parsed: { format?: { duration?: string; bit_rate?: string; format_name?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; tags?: { language?: string } }> };
    try { parsed = JSON.parse(await this.run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate,format_name:stream=codec_type,codec_name,width,height:stream_tags=language', '-of', 'json', input])); }
    catch (error) { throw error instanceof Error ? error : new Error('PLUGIN_MEDIA_PROBE_FAILED'); }
    return {
      durationMs: parsed.format?.duration ? Math.round(Number(parsed.format.duration) * 1000) : undefined,
      bitrate: parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : undefined,
      mimeType: parsed.format?.format_name,
      streams: (parsed.streams ?? []).map(stream => ({
        kind: stream.codec_type === 'video' || stream.codec_type === 'audio' || stream.codec_type === 'subtitle' ? stream.codec_type : 'data',
        codec: stream.codec_name,
        language: stream.tags?.language,
      })),
    };
  }

  async transcode(pluginId: string, inputGrantId: string, inputPath: string, outputGrantId: string, outputPath: string, options: { audioCodec?: string; videoCodec?: string; format?: string } = {}) {
    const input = this.grants.resolve(pluginId, inputGrantId, inputPath, 'read');
    const output = this.grants.resolve(pluginId, outputGrantId, outputPath, 'write');
    const allowedCodec = (value: string | undefined, allowed: string[]) => value && allowed.includes(value) ? value : undefined;
    const args = ['-y', '-i', input];
    const videoCodec = allowedCodec(options.videoCodec, ['copy', 'libx264', 'libvpx-vp9']);
    const audioCodec = allowedCodec(options.audioCodec, ['copy', 'aac', 'libopus']);
    if (options.videoCodec && !videoCodec || options.audioCodec && !audioCodec) throw new Error('PLUGIN_MEDIA_OPTION_INVALID');
    if (videoCodec) args.push('-c:v', videoCodec);
    if (audioCodec) args.push('-c:a', audioCodec);
    args.push(output);
    await this.run('ffmpeg', args);
    return output;
  }

  async createPreview(pluginId: string, url: string, mimeType?: string) {
    const grant: PreviewGrant = { id: crypto.randomUUID(), pluginId, url, mimeType, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
    this.previews.set(grant.id, grant);
    return grant;
  }

  async writeTags(pluginId: string, inputGrantId: string, inputPath: string, tags: MediaTags) {
    const input = this.grants.resolve(pluginId, inputGrantId, inputPath, 'read');
    if (Object.keys(tags).some(key => !/^[A-Za-z][A-Za-z0-9_-]*$/.test(key))) throw new Error('PLUGIN_MEDIA_TAG_INVALID');
    const output = `${input}.tagged`;
    await this.run('ffmpeg', ['-y', '-i', input, '-map_metadata', '-1', ...Object.entries(tags).flatMap(([key, value]) => ['-metadata', `${key}=${value ?? ''}`]), output]);
    return output;
  }
}
