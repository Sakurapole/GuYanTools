import { describe, expect, it } from 'vitest';
import { SecretService } from './secret_service';

describe('SecretService', () => {
  it('persists only encrypted bytes and scopes keys by plugin', async () => {
    const values = new Map<string, Buffer>();
    const store = {
      setPluginSecret: async (pluginId: string, key: string, value: Buffer) => { values.set(`${pluginId}:${key}`, value); },
      getPluginSecret: async (pluginId: string, key: string) => values.get(`${pluginId}:${key}`) ?? null,
      deletePluginSecret: async (pluginId: string, key: string) => { values.delete(`${pluginId}:${key}`); },
    };
    const storage = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, ''),
    };
    const service = new SecretService(() => store, storage);
    await service.set('plugin.one', 'token', 'secret-value');
    expect(values.get('plugin.one:token')?.toString()).toBe('encrypted:secret-value');
    expect(await service.get('plugin.one', 'token')).toBe('secret-value');
    expect(await service.get('plugin.two', 'token')).toBeNull();
    await expect(service.set('plugin.one', 'bad key', 'x')).rejects.toThrow('PLUGIN_SECRET_KEY_INVALID');
  });
});
