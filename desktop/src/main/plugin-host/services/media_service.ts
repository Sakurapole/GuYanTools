import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import type { MediaProbe, MediaTags, PluginCredentialReference, PreviewGrant } from '@/contracts/plugin_media';
import { FileGrantService } from './file_grant_service';

type ProcessRunner = (command: 'ffprobe' | 'ffmpeg', args: string[]) => Promise<string>;
type PreviewFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type SecretReader = (pluginId: string, key: string) => Promise<string | null>;

type PreviewRecord = {
  grant: PreviewGrant;
  sourceUrl: string;
  headers: Headers;
  credential?: PluginCredentialReference;
};

const PREVIEW_HEADER_ALLOWLIST = new Set(['accept', 'accept-language', 'referer', 'user-agent']);
const PROXY_RESPONSE_HEADERS = ['accept-ranges', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified'];

function validatePreviewCredential(source: URL, credential: PluginCredentialReference) {
  if (!credential.secretKey || !/^[a-zA-Z0-9._-]+$/.test(credential.secretKey) || credential.headerName && credential.headerName !== 'Cookie') {
    throw new Error('PLUGIN_MEDIA_PREVIEW_CREDENTIAL_INVALID');
  }
  if (source.protocol !== 'https:' || !credential.allowedOrigins.includes(source.origin)) {
    throw new Error('PLUGIN_MEDIA_PREVIEW_CREDENTIAL_ORIGIN_DENIED');
  }
}

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
  private readonly previews = new Map<string, PreviewRecord>();

  constructor(
    private readonly grants: FileGrantService,
    private readonly run: ProcessRunner = runProcess,
    private readonly fetcher: PreviewFetcher = globalThis.fetch.bind(globalThis),
    private readonly readSecret: SecretReader = async () => null,
  ) {}

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

  async transcode(pluginId: string, inputGrantId: string, inputPath: string, outputGrantId: string, outputPath: string, options: { audioCodec?: string; videoCodec?: string; format?: string; additionalInputPaths?: string[] } = {}) {
    const input = this.grants.resolve(pluginId, inputGrantId, inputPath, 'read');
    const output = this.grants.resolve(pluginId, outputGrantId, outputPath, 'write');
    const allowedCodec = (value: string | undefined, allowed: string[]) => value && allowed.includes(value) ? value : undefined;
    const args = ['-y', '-i', input, ...(options.additionalInputPaths ?? []).map(targetPath => ['-i', this.grants.resolve(pluginId, inputGrantId, targetPath, 'read')]).flat()];
    const videoCodec = allowedCodec(options.videoCodec, ['copy', 'libx264', 'libvpx-vp9']);
    const audioCodec = allowedCodec(options.audioCodec, ['copy', 'aac', 'libopus']);
    if (options.videoCodec && !videoCodec || options.audioCodec && !audioCodec) throw new Error('PLUGIN_MEDIA_OPTION_INVALID');
    if (videoCodec) args.push('-c:v', videoCodec);
    if (audioCodec) args.push('-c:a', audioCodec);
    args.push(output);
    await this.run('ffmpeg', args);
    return output;
  }

  async createPreview(
    pluginId: string,
    sourceUrl: string,
    mimeType?: string,
    inputHeaders?: Record<string, string>,
    credential?: PluginCredentialReference,
  ) {
    let upstream: URL;
    try { upstream = new URL(sourceUrl); } catch { throw new Error('PLUGIN_MEDIA_PREVIEW_URL_INVALID'); }
    if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password) {
      throw new Error('PLUGIN_MEDIA_PREVIEW_URL_INVALID');
    }
    if (credential) validatePreviewCredential(upstream, credential);

    const headers = new Headers();
    for (const [name, value] of Object.entries(inputHeaders ?? {})) {
      const normalized = name.toLowerCase();
      if (!PREVIEW_HEADER_ALLOWLIST.has(normalized)) throw new Error(`PLUGIN_MEDIA_PREVIEW_HEADER_DENIED: ${name}`);
      headers.set(name, value);
    }

    const grant: PreviewGrant = {
      id: crypto.randomUUID(),
      pluginId,
      url: '',
      mimeType,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
    grant.url = `app://plugin-media-preview/${encodeURIComponent(grant.id)}`;
    this.previews.set(grant.id, { grant, sourceUrl: upstream.toString(), headers, credential });
    return grant;
  }

  async handlePreviewRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const previewId = decodeURIComponent(url.pathname.slice(1));
    const preview = this.previews.get(previewId);
    if (!preview || Date.parse(preview.grant.expiresAt) <= Date.now()) {
      this.previews.delete(previewId);
      return new Response('Preview not found', { status: 404 });
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });

    const headers = new Headers(preview.headers);
    for (const name of ['accept', 'if-range', 'range']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (preview.credential) {
      const value = await this.readSecret(preview.grant.pluginId, preview.credential.secretKey);
      if (!value) return new Response('Preview credential unavailable', { status: 401 });
      headers.set(preview.credential.headerName ?? 'Cookie', value);
    }

    try {
      const upstream = await this.fetcher(preview.sourceUrl, { method: request.method, headers, redirect: 'follow' });
      const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
      for (const name of PROXY_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      if (preview.grant.mimeType) responseHeaders.set('Content-Type', preview.grant.mimeType);
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch {
      return new Response('Preview upstream unavailable', { status: 502 });
    }
  }

  async writeTags(pluginId: string, inputGrantId: string, inputPath: string, tags: MediaTags) {
    const input = this.grants.resolve(pluginId, inputGrantId, inputPath, 'read');
    if (Object.keys(tags).some(key => !/^[A-Za-z][A-Za-z0-9_-]*$/.test(key))) throw new Error('PLUGIN_MEDIA_TAG_INVALID');
    const output = `${input}.tagged`;
    await this.run('ffmpeg', ['-y', '-i', input, '-map_metadata', '-1', ...Object.entries(tags).flatMap(([key, value]) => ['-metadata', `${key}=${value ?? ''}`]), output]);
    return output;
  }
}
