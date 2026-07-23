import { safeStorage } from 'electron';

type SecretStore = {
  setPluginSecret(pluginId: string, key: string, ciphertext: Buffer): Promise<void>;
  getPluginSecret(pluginId: string, key: string): Promise<Buffer | null>;
  deletePluginSecret(pluginId: string, key: string): Promise<void>;
};

export interface SecretStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class SecretService {
  constructor(private readonly getStore: () => SecretStore, private readonly storage: SecretStorage = safeStorage) {}

  async set(pluginId: string, key: string, value: string) {
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) throw new Error('PLUGIN_SECRET_KEY_INVALID');
    if (!this.storage.isEncryptionAvailable()) throw new Error('PLUGIN_SECRET_STORAGE_UNAVAILABLE');
    await this.getStore().setPluginSecret(pluginId, key, this.storage.encryptString(value));
  }

  async get(pluginId: string, key: string) {
    const value = await this.getStore().getPluginSecret(pluginId, key);
    return value ? this.storage.decryptString(value) : null;
  }

  async delete(pluginId: string, key: string) {
    await this.getStore().deletePluginSecret(pluginId, key);
  }
}
