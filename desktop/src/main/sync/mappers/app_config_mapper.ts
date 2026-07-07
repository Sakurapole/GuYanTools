import { createHash } from 'node:crypto';
import type { AppConfig, AppConfigPatch } from '@/contracts/app_config';
import type { SyncObjectEnvelope } from '@/contracts/sync';

export interface AppConfigSyncExport {
  profile: SyncObjectEnvelope<AppConfig>;
  objects: SyncObjectEnvelope[];
}

export function exportAppConfigForSync(
  config: AppConfig,
  input: {
    profileId: string;
    ownerDeviceId: string;
    updatedAt?: number;
  },
): AppConfigSyncExport {
  const updatedAt = input.updatedAt ?? Date.now();
  const safeConfig = sanitizeAppConfigForSync(config);
  return {
    profile: createEnvelope('app.profile', input.profileId, input.ownerDeviceId, safeConfig, updatedAt),
    objects: [
      createEnvelope('app.appearance', 'appearance', input.ownerDeviceId, safeConfig.appearance, updatedAt),
      createEnvelope('app.bottom_bar', 'bottom_bar', input.ownerDeviceId, safeConfig.bottomBar, updatedAt),
      createEnvelope('app.shortcuts', 'shortcuts', input.ownerDeviceId, safeConfig.shortcuts, updatedAt),
      createEnvelope('app.features', 'features', input.ownerDeviceId, safeConfig.features, updatedAt),
    ],
  };
}

export function createAppConfigPatchFromSyncProfile(profile: SyncObjectEnvelope<AppConfig>): AppConfigPatch {
  return profile.payload;
}

export function sanitizeAppConfigForSync(config: AppConfig): AppConfig {
  return {
    ...config,
    features: {
      ...config.features,
      terminal: {
        ...config.features.terminal,
        defaultCwd: '',
        localProfiles: config.features.terminal.localProfiles.map((profile) => ({ ...profile, cwd: '' })),
      },
      knowledge: {
        ...config.features.knowledge,
        customAssetDirectory: '',
        libreOfficePath: '',
      },
      quickLaunch: {
        ...config.features.quickLaunch,
        everythingEsPath: '',
      },
      aiAgent: {
        ...config.features.aiAgent,
        research: {
          ...config.features.aiAgent.research,
          webSearchApiKey: undefined,
        },
        mcp: {
          ...config.features.aiAgent.mcp,
          modelscopeApiToken: undefined,
          servers: config.features.aiAgent.mcp.servers.map((server) => ({
            ...server,
            cwd: '',
            env: server.env.map((item) => ({
              ...item,
              value: item.secret ? '' : item.value,
            })),
          })),
        },
        providers: config.features.aiAgent.providers.map((provider) => ({
          ...provider,
          apiKey: undefined as string | undefined,
          apiKeyRef: provider.apiKeyRef ? 'redacted' : undefined,
        })),
      },
    },
  };
}

function createEnvelope<TPayload>(
  collection: SyncObjectEnvelope<TPayload>['collection'],
  objectId: string,
  ownerDeviceId: string,
  payload: TPayload,
  updatedAt: number,
): SyncObjectEnvelope<TPayload> {
  const body = JSON.stringify(payload);
  return {
    collection,
    objectId,
    ownerDeviceId,
    schemaVersion: 1,
    payloadHash: createHash('sha256').update(body).digest('hex'),
    payload,
    deleted: false,
    updatedAt,
  };
}
