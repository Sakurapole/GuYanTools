import crypto from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';
import type { FileGrant } from '@/contracts/plugin_media';

export class FileGrantService {
  private readonly grants = new Map<string, FileGrant>();

  create(pluginId: string, input: Omit<FileGrant, 'id' | 'pluginId' | 'revoked'>) {
    const rootPath = path.resolve(input.rootPath);
    const grant: FileGrant = { ...input, id: crypto.randomUUID(), pluginId, rootPath, revoked: false };
    this.grants.set(grant.id, grant);
    return grant;
  }

  revoke(pluginId: string, grantId: string) {
    const grant = this.require(pluginId, grantId);
    grant.revoked = true;
    return grant;
  }

  resolve(pluginId: string, grantId: string, targetPath: string, mode: 'read' | 'write') {
    const grant = this.require(pluginId, grantId);
    if (grant.accessMode === 'read' && mode === 'write') throw new Error('PLUGIN_FILE_ACCESS_DENIED');
    const resolved = path.resolve(grant.rootPath, targetPath);
    const prefix = `${grant.rootPath}${path.sep}`;
    if (resolved !== grant.rootPath && !resolved.startsWith(prefix)) throw new Error('PLUGIN_FILE_PATH_DENIED');
    return resolved;
  }

  async write(pluginId: string, grantId: string, targetPath: string, bytes: Uint8Array) {
    const resolved = this.resolve(pluginId, grantId, targetPath, 'write');
    const grant = this.require(pluginId, grantId);
    if (bytes.byteLength > grant.maxBytes) throw new Error('PLUGIN_FILE_SIZE_DENIED');
    await fs.ensureDir(path.dirname(resolved));
    await fs.writeFile(resolved, bytes);
    return resolved;
  }

  async append(pluginId: string, grantId: string, targetPath: string, bytes: Uint8Array) {
    const resolved = this.resolve(pluginId, grantId, targetPath, 'write');
    const grant = this.require(pluginId, grantId);
    const existingSize = await fs.pathExists(resolved) ? (await fs.stat(resolved)).size : 0;
    if (existingSize + bytes.byteLength > grant.maxBytes) throw new Error('PLUGIN_FILE_SIZE_DENIED');
    await fs.ensureDir(path.dirname(resolved));
    await fs.appendFile(resolved, bytes);
    return resolved;
  }

  async read(pluginId: string, grantId: string, targetPath: string) {
    const resolved = this.resolve(pluginId, grantId, targetPath, 'read');
    const grant = this.require(pluginId, grantId);
    const stat = await fs.stat(resolved);
    if (stat.size > grant.maxBytes) throw new Error('PLUGIN_FILE_SIZE_DENIED');
    return fs.readFile(resolved);
  }

  private require(pluginId: string, grantId: string) {
    const grant = this.grants.get(grantId);
    if (!grant || grant.pluginId !== pluginId || grant.revoked || Date.parse(grant.expiresAt) <= Date.now()) {
      throw new Error('PLUGIN_FILE_GRANT_INVALID');
    }
    return grant;
  }
}
