import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import { DownloadsService } from './downloads_service';
import { FileGrantService } from './file_grant_service';

describe('DownloadsService', () => {
  it('accepts only direct HTTP(S) URLs', async () => {
    const grants = new FileGrantService();
    const service = new DownloadsService({ fetch: async () => ({ status: 200, headers: {}, body: '', finalUrl: '' }) }, grants);
    await expect(service.download('plugin.one', { url: 'file:///secret', grantId: 'missing', fileName: 'x' })).rejects.toThrow('PLUGIN_DOWNLOAD_URL_INVALID');
    await expect(service.download('plugin.one', { url: 'not a url', grantId: 'missing', fileName: 'x' })).rejects.toThrow('PLUGIN_DOWNLOAD_URL_INVALID');
  });

  it('resumes from an existing grant file with an HTTP Range request', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'guyantools-download-'));
    const grants = new FileGrantService();
    const grant = grants.create('plugin.one', { purpose: 'test', rootPath: root, accessMode: 'read-write', expiresAt: new Date(Date.now() + 60_000).toISOString(), maxBytes: 100 });
    await grants.write('plugin.one', grant.id, 'fixture.bin', Buffer.from('hello'));
    let request: { headers?: Record<string, string> } | undefined;
    const service = new DownloadsService({
      fetch: async input => { request = input; return { status: 206, headers: {}, body: Buffer.from(' world').toString('base64'), finalUrl: input.url }; },
    }, grants);

    await service.download('plugin.one', { url: 'https://cdn.example/fixture.bin', grantId: grant.id, fileName: 'fixture.bin', resumeFrom: 5, expectedBytes: 11, sha256: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9' });
    expect(request?.headers).toEqual({ Range: 'bytes=5-' });
    await expect(fs.readFile(path.join(root, 'fixture.bin'), 'utf8')).resolves.toBe('hello world');
  });

  it('applies a rate limit through a bounded wait between direct responses', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'guyantools-download-'));
    const grants = new FileGrantService();
    const grant = grants.create('plugin.one', { purpose: 'test', rootPath: root, accessMode: 'write', expiresAt: new Date(Date.now() + 60_000).toISOString(), maxBytes: 100 });
    const waits: number[] = [];
    const service = new DownloadsService({ fetch: async input => ({ status: 200, headers: {}, body: Buffer.from('abcd').toString('base64'), finalUrl: input.url }) }, grants, async ms => { waits.push(ms); });
    await service.download('plugin.one', { url: 'https://cdn.example/fixture.bin', grantId: grant.id, fileName: 'fixture.bin', rateLimitBytesPerSecond: 4 });
    expect(waits).toEqual([1000]);
  });
});
