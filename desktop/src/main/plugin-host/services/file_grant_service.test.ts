import { describe, expect, it } from 'vitest';
import { FileGrantService } from './file_grant_service';

describe('FileGrantService', () => {
  it('enforces plugin ownership, expiry, and path boundaries', () => {
    const service = new FileGrantService();
    const grant = service.create('plugin.one', {
      purpose: 'test', rootPath: 'C:/tmp/plugin-one', accessMode: 'read-write',
      expiresAt: new Date(Date.now() + 60_000).toISOString(), maxBytes: 10,
    });
    expect(() => service.resolve('plugin.two', grant.id, 'file.txt', 'read')).toThrow('PLUGIN_FILE_GRANT_INVALID');
    expect(() => service.resolve('plugin.one', grant.id, '../outside.txt', 'read')).toThrow('PLUGIN_FILE_PATH_DENIED');
    service.revoke('plugin.one', grant.id);
    expect(() => service.resolve('plugin.one', grant.id, 'file.txt', 'read')).toThrow('PLUGIN_FILE_GRANT_INVALID');
  });
});
