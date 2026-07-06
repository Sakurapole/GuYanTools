import type { SecretSyncMode } from '@/contracts/sync';

export const SUPPORTED_SECRET_SYNC_MODE: SecretSyncMode = 'disabled';
export const SECRET_SYNC_DISABLED_MESSAGE = '密钥同步将在端到端加密阶段开放。';

export function assertSecretSyncModeSupported(mode: SecretSyncMode): void {
  if (mode !== SUPPORTED_SECRET_SYNC_MODE) {
    throw new Error(SECRET_SYNC_DISABLED_MESSAGE);
  }
}
