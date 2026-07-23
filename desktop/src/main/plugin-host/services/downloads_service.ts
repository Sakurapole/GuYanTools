import path from 'node:path';
import crypto from 'node:crypto';
import { NetworkService } from './network_service';
import { FileGrantService } from './file_grant_service';

type DownloadSource = {
  url: string;
  grantId: string;
  fileName: string;
  expectedBytes?: number;
  sha256?: string;
  resumeFrom?: number;
  rateLimitBytesPerSecond?: number;
};
type Sleep = (milliseconds: number) => Promise<void>;

const defaultSleep: Sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export class DownloadsService {
  constructor(private readonly network: NetworkService, private readonly grants: FileGrantService, private readonly sleep: Sleep = defaultSleep) {}

  private async downloadOne(pluginId: string, source: DownloadSource, signal?: AbortSignal, rateLimitBytesPerSecond?: number) {
    if (signal?.aborted) throw new Error('PLUGIN_DOWNLOAD_CANCELLED');
    let url: URL;
    try { url = new URL(source.url); } catch { throw new Error('PLUGIN_DOWNLOAD_URL_INVALID'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('PLUGIN_DOWNLOAD_URL_INVALID');
    const fileName = path.basename(source.fileName);
    if (!fileName || fileName === '.' || fileName === '..') throw new Error('PLUGIN_DOWNLOAD_FILENAME_INVALID');
    const resumeFrom = Math.max(0, source.resumeFrom ?? 0);
    const response = await this.network.fetch({
      url: source.url,
      headers: resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : undefined,
      responseType: 'bytes',
      maxBytes: 512 * 1024 * 1024,
    });
    if (signal?.aborted) throw new Error('PLUGIN_DOWNLOAD_CANCELLED');
    const bytes = Buffer.from(String(response.body), 'base64');
    if (rateLimitBytesPerSecond && rateLimitBytesPerSecond > 0) {
      await this.sleep(Math.ceil((bytes.byteLength / rateLimitBytesPerSecond) * 1000));
    }
    const resumed = resumeFrom > 0 && response.status === 206;
    let complete = bytes;
    if (resumed) {
      const prefix = await this.grants.read(pluginId, source.grantId, fileName);
      complete = Buffer.concat([prefix, bytes]);
    }
    if (source.expectedBytes !== undefined && source.expectedBytes !== complete.byteLength) throw new Error('PLUGIN_DOWNLOAD_SIZE_MISMATCH');
    if (source.sha256 && crypto.createHash('sha256').update(complete).digest('hex') !== source.sha256.toLowerCase()) throw new Error('PLUGIN_DOWNLOAD_HASH_MISMATCH');
    return resumed
      ? this.grants.append(pluginId, source.grantId, fileName, bytes)
      : this.grants.write(pluginId, source.grantId, fileName, bytes);
  }

  async download(pluginId: string, source: DownloadSource, options: { signal?: AbortSignal } = {}) {
    return this.downloadOne(pluginId, source, options.signal, source.rateLimitBytesPerSecond);
  }

  async downloadMany(pluginId: string, sources: DownloadSource[], options: { maxRetries?: number; signal?: AbortSignal; rateLimitBytesPerSecond?: number; onProgress?: (completed: number, total: number) => void } = {}) {
    const results: string[] = [];
    const total = sources.length;
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      let lastError: unknown;
      for (let attempt = 0; attempt <= (options.maxRetries ?? 2); attempt += 1) {
        try {
          results.push(await this.downloadOne(pluginId, source, options.signal, source.rateLimitBytesPerSecond ?? options.rateLimitBytesPerSecond));
          options.onProgress?.(index + 1, total);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (attempt >= (options.maxRetries ?? 2)) throw error;
        }
      }
      if (lastError) throw lastError;
    }
    return results;
  }
}
