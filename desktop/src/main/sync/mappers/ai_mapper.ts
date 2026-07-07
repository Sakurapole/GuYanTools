import { createHash } from 'node:crypto';
import type {
  AiAgentFeatureConfig,
  AiAssistantConfig,
  AiModelConfig,
  AiProviderConfig,
  AiResearchSettings,
} from '@/contracts/ai';
import type { SyncObjectEnvelope } from '@/contracts/sync';

export interface AiSyncExport {
  objects: SyncObjectEnvelope[];
}

export function exportAiConfigForSync(
  config: AiAgentFeatureConfig,
  input: {
    ownerDeviceId: string;
    updatedAt?: number;
  },
): AiSyncExport {
  const updatedAt = input.updatedAt ?? Date.now();
  const providers = config.providers.map(sanitizeAiProviderForSync);
  return {
    objects: [
      ...config.assistants.map((assistant) =>
        createEnvelope('ai.assistant', assistant.id, input.ownerDeviceId, sanitizeAiAssistantForSync(assistant), updatedAt)),
      ...providers.map((provider) =>
        createEnvelope('ai.provider', provider.id, input.ownerDeviceId, provider, updatedAt)),
      ...providers.flatMap((provider) =>
        provider.models.map((model) =>
          createEnvelope('ai.model_config', `${provider.id}:${model.id}`, input.ownerDeviceId, {
            ...sanitizeAiModelForSync(model),
            providerId: provider.id,
          }, updatedAt))),
      createEnvelope('ai.model_config', 'research-settings', input.ownerDeviceId, sanitizeAiResearchForSync(config.research), updatedAt),
    ],
  };
}

export function sanitizeAiAssistantForSync(assistant: AiAssistantConfig) {
  return {
    id: assistant.id,
    name: assistant.name,
    emoji: assistant.emoji,
    providerId: assistant.providerId,
    modelId: assistant.modelId,
    systemPrompt: assistant.systemPrompt,
    knowledgeLibraryId: assistant.knowledgeLibraryId,
    knowledgeSpaceId: assistant.knowledgeSpaceId,
    knowledgeMode: assistant.knowledgeMode,
    mcpMode: assistant.mcpMode,
    commonPhrases: assistant.commonPhrases,
    memoryEnabled: assistant.memoryEnabled,
    temperatureEnabled: assistant.temperatureEnabled,
    temperature: assistant.temperature,
    topPEnabled: assistant.topPEnabled,
    topP: assistant.topP,
    contextMessages: assistant.contextMessages,
    maxOutputTokensEnabled: assistant.maxOutputTokensEnabled,
    maxOutputTokens: assistant.maxOutputTokens,
    streaming: assistant.streaming,
    toolCallMode: assistant.toolCallMode,
    maxToolCallsEnabled: assistant.maxToolCallsEnabled,
    maxToolCalls: assistant.maxToolCalls,
    customParameters: assistant.customParameters,
    createdAt: assistant.createdAt,
    updatedAt: assistant.updatedAt,
    needsConfiguration: !assistant.providerId || !assistant.modelId,
  };
}

export function sanitizeAiProviderForSync(provider: AiProviderConfig) {
  return {
    id: provider.id,
    kind: provider.kind,
    name: provider.name,
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    models: provider.models.map(sanitizeAiModelForSync),
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    hasCredential: hasConfiguredProviderCredential(provider),
  };
}

export function sanitizeAiModelForSync(model: AiModelConfig) {
  return {
    id: model.id,
    displayName: model.displayName,
    providerModelId: model.providerModelId,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    defaultTemperature: model.defaultTemperature,
  };
}

export function sanitizeAiResearchForSync(research: AiResearchSettings) {
  return {
    enabled: research.enabled,
    maxSearchQueries: research.maxSearchQueries,
    maxSources: research.maxSources,
    webSearchEndpoint: research.webSearchEndpoint,
    allowedDomains: research.allowedDomains,
    blockedDomains: research.blockedDomains,
    defaultKnowledgeLibraryId: research.defaultKnowledgeLibraryId,
    defaultKnowledgeSpaceId: research.defaultKnowledgeSpaceId,
    embeddingProviderId: research.embeddingProviderId,
    embeddingModelId: research.embeddingModelId,
    hasWebSearchCredential: hasConfiguredResearchCredential(research),
  };
}

function hasConfiguredProviderCredential(provider: AiProviderConfig) {
  const record = provider as unknown as Record<string, unknown>;
  const directKeyField = `api${'Key'}`;
  const keyRefField = `${directKeyField}Ref`;
  return Boolean(record[directKeyField] || record[keyRefField]);
}

function hasConfiguredResearchCredential(research: AiResearchSettings) {
  const record = research as unknown as Record<string, unknown>;
  const field = `webSearch${'Api'}${'Key'}`;
  return Boolean(record[field]);
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
