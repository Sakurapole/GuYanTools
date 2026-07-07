import { app, safeStorage } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function saveSyncSecret(key: string, value: string): Promise<void> {
  const file = secretPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(value).toString('base64')
    : Buffer.from(value, 'utf8').toString('base64');
  await writeFile(file, payload, 'utf8');
}

export async function readSyncSecret(key: string): Promise<string> {
  const raw = await readFile(secretPath(key), 'utf8').catch(() => '');
  if (!raw) {
    return '';
  }

  const bytes = Buffer.from(raw, 'base64');
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.decryptString(bytes)
    : bytes.toString('utf8');
}

export async function deleteSyncSecret(key: string): Promise<void> {
  await rm(secretPath(key), { force: true });
}

function secretPath(key: string) {
  const safeKey = key.replace(/[^\w.-]+/g, '_');
  return path.join(app.getPath('userData'), 'sync-secrets', `${safeKey}.secret`);
}
