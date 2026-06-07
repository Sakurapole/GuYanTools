import { createProviderRegistry, type EmbeddingModel, type LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AiAgentFeatureConfig, AiProviderConfig } from '@/contracts/ai';

function createProvider(provider: AiProviderConfig) {
  if (provider.kind === 'openai') {
    return createOpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
  }

  if (provider.kind === 'anthropic') {
    return createAnthropic({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
  }

  if (provider.kind === 'google') {
    return createGoogleGenerativeAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
  }

  if (provider.kind === 'ollama') {
    return createOpenAICompatible({
      name: 'ollama',
      baseURL: provider.baseUrl || 'http://localhost:11434/v1',
      apiKey: provider.apiKey || 'ollama',
    });
  }

  return createOpenAICompatible({
    name: provider.id,
    baseURL: provider.baseUrl || '',
    apiKey: provider.apiKey,
  });
}

export function createAiProviderRegistry(config: AiAgentFeatureConfig) {
  const providers = Object.fromEntries(
    config.providers
      .filter((provider) => provider.enabled)
      .map((provider) => [provider.id, createProvider(provider)]),
  );

  return createProviderRegistry(providers);
}

export function findAiProvider(config: AiAgentFeatureConfig, providerId: string) {
  return config.providers.find((provider) => provider.id === providerId && provider.enabled);
}

export function findAiModel(config: AiAgentFeatureConfig, providerId: string, modelId: string) {
  return findAiProvider(config, providerId)?.models.find((model) => model.id === modelId);
}

export function resolveLanguageModel(config: AiAgentFeatureConfig, providerId: string, modelId: string): LanguageModel {
  const provider = findAiProvider(config, providerId);
  const model = provider?.models.find((item) => item.id === modelId);
  if (!provider || !model) {
    throw new Error('AI provider or model is not configured');
  }

  return createAiProviderRegistry(config).languageModel(`${providerId}:${model.providerModelId}`);
}

export function resolveEmbeddingModel(config: AiAgentFeatureConfig, providerId: string, modelId: string): EmbeddingModel {
  const provider = findAiProvider(config, providerId);
  const model = provider?.models.find((item) => item.id === modelId);
  if (!provider || !model) {
    throw new Error('AI embedding provider or model is not configured');
  }

  return createAiProviderRegistry(config).embeddingModel(`${providerId}:${model.providerModelId}`);
}
