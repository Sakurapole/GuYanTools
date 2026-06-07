import { randomUUID } from 'node:crypto';
import { generateText, stepCountIs, streamText, type JSONValue, type ModelMessage } from 'ai';
import { dbManager, JsDatabase } from '@/core/database';
import { appConfigManager } from '@/main/app-config/manager';
import type {
  AiAgentFeatureConfig,
  AiCitation,
  AiChatMessage,
  AiConversation,
  AiSafeAgentFeatureConfig,
  AiReasoningEffort,
  AiReasoningOptions,
  AiStreamEvent,
  CreateAiConversationPayload,
  RegenerateAiMessagePayload,
  RegenerateAiMessageResult,
  SendAiMessagePayload,
  SendAiMessageResult,
  TestAiProviderPayload,
  TestAiProviderResult,
  UpdateAiConversationPayload,
} from '@/contracts/ai';
import type { KnowledgeSearchPayload, KnowledgeSearchResult } from '@/contracts/knowledge';
import { findAiModel, findAiProvider, resolveLanguageModel } from './provider_registry';
import { generateConversationTitle } from './title_service';
import { mapAiSdkPartToAiEvent, normalizeUsage } from './stream_events';
import { resolveGroundingContext } from './tools/grounding_service';
import { buildCanvasSystemInstruction, createCanvasTools } from './tools/canvas_tools';
import { aiEmbeddingService } from './embedding_service';

type AiDatabase = JsDatabase & {
  createAiConversation: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  listAiConversations: () => Promise<Record<string, unknown>[]>;
  updateAiConversation: (id: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  deleteAiConversation: (id: string) => Promise<void>;
  listAiMessages: (conversationId: string) => Promise<Record<string, unknown>[]>;
  insertAiMessage: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  updateAiMessage: (id: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  insertAiCitation: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  listAiCitations: (messageId: string) => Promise<Record<string, unknown>[]>;
  searchKnowledge: (input: KnowledgeSearchPayload) => Promise<KnowledgeSearchResult[]>;
};

export type AiStreamListener = (event: AiStreamEvent) => void;
type AiProviderOptions = Record<string, Record<string, JSONValue>>;

class AiChatService {
  private readonly runs = new Map<string, AbortController>();
  private readonly listeners = new Set<AiStreamListener>();

  onStreamEvent(listener: AiStreamListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async getSafeConfig(): Promise<AiSafeAgentFeatureConfig> {
    return this.toSafeConfig((await appConfigManager.getConfig()).features.aiAgent);
  }

  async updateConfig(patch: Partial<AiAgentFeatureConfig>): Promise<AiSafeAgentFeatureConfig> {
    const current = (await appConfigManager.getConfig()).features.aiAgent;
    const normalizedPatch: Partial<AiAgentFeatureConfig> = { ...patch };
    if (patch.providers) {
      normalizedPatch.providers = patch.providers.map((provider) => mergeProviderSecret(current, provider));
    }
    if (patch.research) {
      normalizedPatch.research = {
        ...patch.research,
        webSearchApiKey: patch.research.webSearchApiKey || current.research.webSearchApiKey,
      };
    }
    const next = await appConfigManager.updateConfig({
      features: {
        aiAgent: normalizedPatch,
      },
    });
    return this.toSafeConfig(next.features.aiAgent);
  }

  async testProvider(input: TestAiProviderPayload): Promise<TestAiProviderResult> {
    const config = await this.resolveConfigWithOverride(input);
    const providerId = input.provider?.id || input.providerId || config.defaultProviderId || config.providers[0]?.id;
    const provider = providerId ? findAiProvider(config, providerId) : undefined;
    const modelId = input.modelId || provider?.models[0]?.id;

    if (!provider || !modelId) {
      return { ok: false, message: '请先配置可用的 Provider 和模型' };
    }

    try {
      await generateText({
        model: resolveLanguageModel(config, provider.id, modelId),
        prompt: 'Reply with OK.',
        maxOutputTokens: 8,
        temperature: 0,
      });
      return { ok: true, message: '连接测试成功' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listConversations(): Promise<AiConversation[]> {
    const rows = await this.db().listAiConversations();
    return rows.map(mapConversation);
  }

  async createConversation(input: CreateAiConversationPayload): Promise<AiConversation> {
    const row = await this.db().createAiConversation({
      id: randomUUID(),
      title: input.title?.trim() || '新的对话',
      providerId: input.providerId,
      modelId: input.modelId,
      systemPrompt: input.systemPrompt?.trim() || undefined,
    });
    return mapConversation(row);
  }

  async updateConversation(id: string, input: UpdateAiConversationPayload): Promise<AiConversation> {
    const row = await this.db().updateAiConversation(id, {
      title: input.title,
      pinned: input.pinned,
      archived: input.archived,
    });
    return mapConversation(row);
  }

  async deleteConversation(id: string) {
    await this.db().deleteAiConversation(id);
  }

  async listMessages(conversationId: string): Promise<AiChatMessage[]> {
    const rows = await this.db().listAiMessages(conversationId);
    const messages = rows.map(mapMessage);
    await this.attachCitations(messages);
    return messages;
  }

  async sendMessage(input: SendAiMessagePayload): Promise<SendAiMessageResult> {
    const conversations = await this.listConversations();
    const conversation = conversations.find((item) => item.id === input.conversationId);
    if (!conversation) {
      throw new Error('AI conversation not found');
    }

    const config = (await appConfigManager.getConfig()).features.aiAgent;
    const providerId = input.providerId || conversation.providerId;
    const modelId = input.modelId || conversation.modelId;
    this.assertModel(config, providerId, modelId);

    const userMessage = mapMessage(await this.db().insertAiMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      role: 'user',
      content: input.content,
      status: 'complete',
      providerId,
      modelId,
    }));
    const assistantMessage = mapMessage(await this.db().insertAiMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      parentMessageId: userMessage.id,
      providerId,
      modelId,
    }));

    const runId = randomUUID();
    const controller = new AbortController();
    this.runs.set(runId, controller);

    this.emit({ type: 'run-start', runId, conversationId: conversation.id, messageId: assistantMessage.id });
    void this.runStream({
      runId,
      conversation,
      userMessage,
      assistantMessage,
      providerId,
      modelId,
      input,
      config,
      controller,
    });

    return { runId, userMessage, assistantMessage };
  }

  async regenerateMessage(input: RegenerateAiMessagePayload): Promise<RegenerateAiMessageResult> {
    const conversations = await this.listConversations();
    const conversation = conversations.find((item) => item.id === input.conversationId);
    if (!conversation) {
      throw new Error('AI conversation not found');
    }

    const messages = await this.listMessages(conversation.id);
    const sourceUserMessage = resolveRegenerationSource(messages, input.assistantMessageId);
    if (!sourceUserMessage) {
      throw new Error('No user message can be regenerated');
    }

    const config = (await appConfigManager.getConfig()).features.aiAgent;
    const providerId = input.providerId || sourceUserMessage.providerId || conversation.providerId;
    const modelId = input.modelId || sourceUserMessage.modelId || conversation.modelId;
    this.assertModel(config, providerId, modelId);

    const sourceIndex = messages.findIndex((message) => message.id === sourceUserMessage.id);
    const historyOverride = sourceIndex >= 0 ? messages.slice(0, sourceIndex + 1) : messages;
    const assistantMessage = mapMessage(await this.db().insertAiMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      parentMessageId: sourceUserMessage.id,
      providerId,
      modelId,
    }));

    const runId = randomUUID();
    const controller = new AbortController();
    this.runs.set(runId, controller);

    this.emit({ type: 'run-start', runId, conversationId: conversation.id, messageId: assistantMessage.id });
    void this.runStream({
      runId,
      conversation,
      userMessage: sourceUserMessage,
      assistantMessage,
      providerId,
      modelId,
      input,
      config,
      controller,
      historyOverride,
    });

    return { runId, sourceUserMessage, assistantMessage };
  }

  async stopRun(runId: string) {
    this.runs.get(runId)?.abort();
  }

  private async runStream(context: {
    runId: string;
    conversation: AiConversation;
    userMessage: AiChatMessage;
    assistantMessage: AiChatMessage;
    providerId: string;
    modelId: string;
    input: SendAiMessagePayload | RegenerateAiMessagePayload;
    config: AiAgentFeatureConfig;
    controller: AbortController;
    historyOverride?: AiChatMessage[];
  }) {
    let content = '';
    let reasoningContent = '';
    let groundingMetadata: Record<string, unknown> | undefined;
    try {
      const history = context.historyOverride ?? await this.listMessages(context.conversation.id);
      const modelMessages = buildModelMessages(history, context.config.chat.maxHistoryMessages);
      const reasoning = resolveReasoningOptions(context.config, context.input.reasoning);
      const grounding = await resolveGroundingContext({
        query: context.userMessage.content,
        config: context.config,
        grounding: context.input.grounding,
        searchKnowledge: (input) => this.searchKnowledge(context.config, input),
      });
      groundingMetadata = {
        grounding: grounding.metadata,
        citations: grounding.citations,
      };
      if (grounding.citations.length) {
        await this.persistCitations(context.assistantMessage.id, grounding.citations);
        for (const citation of grounding.citations) {
          this.emit({
            type: 'citation',
            runId: context.runId,
            messageId: context.assistantMessage.id,
            citation,
          });
        }
      }

      const canvasEnabled = Boolean(context.input.canvas?.enabled);
      const baseSystemPrompt = context.conversation.systemPrompt || context.config.chat.defaultSystemPrompt || '';
      const canvasSystemPrompt = canvasEnabled
        ? buildCanvasSystemInstruction({ activeWorkspaceId: context.input.canvas?.workspaceId })
        : '';
      const systemPrompt = [baseSystemPrompt, grounding.context, canvasSystemPrompt].filter(Boolean).join('\n\n');
      const canvasTools = canvasEnabled
        ? createCanvasTools({
          runId: context.runId,
          conversationId: context.conversation.id,
          messageId: context.assistantMessage.id,
          activeWorkspaceId: context.input.canvas?.workspaceId,
          emit: (event) => this.emit(event),
        })
        : undefined;
      const result = streamText({
        model: resolveLanguageModel(context.config, context.providerId, context.modelId),
        system: systemPrompt || undefined,
        messages: modelMessages,
        temperature: context.input.temperature ?? context.config.chat.temperature,
        maxOutputTokens: context.input.maxOutputTokens ?? context.config.chat.maxOutputTokens,
        providerOptions: buildReasoningProviderOptions(context.config, context.providerId, reasoning),
        tools: canvasTools,
        stopWhen: canvasTools ? stepCountIs(3) : undefined,
        abortSignal: context.controller.signal,
        maxRetries: 1,
      });

      for await (const part of result.fullStream) {
        const event = mapAiSdkPartToAiEvent(part, context.runId, context.assistantMessage.id);
        if (event?.type === 'text-delta') {
          content += event.delta;
        }
        if (event?.type === 'reasoning-delta') {
          reasoningContent += event.delta;
        }
        if (event) {
          this.emit(event);
        }
      }

      let usage = undefined;
      try {
        usage = normalizeUsage(await result.usage);
      } catch {
        usage = undefined;
      }
      await this.db().updateAiMessage(context.assistantMessage.id, {
        content,
        status: 'complete',
        tokenUsageJson: usage ? JSON.stringify(usage) : undefined,
        metadataJson: JSON.stringify(buildMessageMetadata(groundingMetadata, reasoning, reasoningContent)),
      });
      if (usage) {
        this.emit({ type: 'usage', runId: context.runId, messageId: context.assistantMessage.id, usage });
      }
      this.emit({ type: 'run-finish', runId: context.runId, finishReason: 'stop' });
      await this.maybeTitleConversation(context, content);
    } catch (error) {
      const aborted = context.controller.signal.aborted;
      await this.db().updateAiMessage(context.assistantMessage.id, {
        content,
        status: aborted ? 'aborted' : 'error',
        metadataJson: JSON.stringify(buildMessageMetadata(groundingMetadata, undefined, reasoningContent)),
      });
      this.emit(aborted
        ? { type: 'run-aborted', runId: context.runId }
        : {
          type: 'run-error',
          runId: context.runId,
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        });
    } finally {
      this.runs.delete(context.runId);
    }
  }

  private async maybeTitleConversation(context: {
    conversation: AiConversation;
    config: AiAgentFeatureConfig;
    providerId: string;
    modelId: string;
    userMessage: AiChatMessage;
  }, assistantContent: string) {
    if (context.conversation.title !== '新的对话') {
      return;
    }

    const title = await generateConversationTitle(
      context.config,
      context.providerId,
      context.modelId,
      `${context.userMessage.content}\n${assistantContent}`,
    );
    await this.updateConversation(context.conversation.id, { title });
  }

  private assertModel(config: AiAgentFeatureConfig, providerId: string, modelId: string) {
    const provider = findAiProvider(config, providerId);
    const model = findAiModel(config, providerId, modelId);
    if (!provider || !model) {
      throw new Error('AI provider or model is not configured');
    }
  }

  private async resolveConfigWithOverride(input: TestAiProviderPayload): Promise<AiAgentFeatureConfig> {
    const config = (await appConfigManager.getConfig()).features.aiAgent;
    if (!input.provider) {
      return config;
    }

    return {
      ...config,
      providers: [
        ...config.providers.filter((provider) => provider.id !== input.provider?.id),
        mergeProviderSecret(config, input.provider),
      ],
    };
  }

  private toSafeConfig(config: AiAgentFeatureConfig): AiSafeAgentFeatureConfig {
    const safeResearch = { ...config.research };
    delete safeResearch.webSearchApiKey;
    return {
      ...config,
      research: {
        ...safeResearch,
        hasWebSearchApiKey: Boolean(config.research.webSearchApiKey),
      },
      providers: config.providers.map((provider) => ({
        id: provider.id,
        kind: provider.kind,
        name: provider.name,
        baseUrl: provider.baseUrl,
        enabled: provider.enabled,
        hasApiKey: Boolean(provider.apiKey || provider.apiKeyRef),
        models: provider.models,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt,
      })),
    };
  }

  private emit(event: AiStreamEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private db() {
    return dbManager.getDatabase() as AiDatabase;
  }

  private async searchKnowledge(config: AiAgentFeatureConfig, input: KnowledgeSearchPayload) {
    const [textResults, embeddingResults] = await Promise.all([
      this.db().searchKnowledge(input),
      aiEmbeddingService.searchKnowledge(config, input),
    ]);
    return mergeKnowledgeResults(textResults, embeddingResults, input.limit ?? config.research.maxSources);
  }

  private async persistCitations(messageId: string, citations: AiCitation[]) {
    await Promise.all(citations.map((citation) => this.db().insertAiCitation({
      id: citation.id,
      messageId,
      sourceType: citation.sourceType,
      title: citation.title,
      url: citation.url,
      sourceId: citation.sourceId,
      snippet: citation.snippet,
      metadataJson: citation.metadata ? JSON.stringify(citation.metadata) : undefined,
    })));
  }

  private async attachCitations(messages: AiChatMessage[]) {
    await Promise.all(messages.map(async (message) => {
      const rows = await this.db().listAiCitations(message.id);
      if (rows.length) {
        message.citations = rows.map(mapCitation);
      }
    }));
  }
}

function buildModelMessages(messages: AiChatMessage[], maxHistoryMessages: number): ModelMessage[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
    .filter((message) => {
      if (message.role === 'assistant') {
        return message.status === 'complete' && message.content.trim().length > 0;
      }

      return message.content.trim().length > 0;
    })
    .slice(-Math.max(1, maxHistoryMessages))
    .map((message) => ({
      role: message.role === 'system' ? 'system' : message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));
}

function resolveRegenerationSource(messages: AiChatMessage[], assistantMessageId?: string): AiChatMessage | undefined {
  const targetAssistant = assistantMessageId
    ? messages.find((message) => message.id === assistantMessageId && message.role === 'assistant')
    : [...messages].reverse().find((message) => message.role === 'assistant');

  if (targetAssistant?.parentMessageId) {
    const parent = messages.find((message) => message.id === targetAssistant.parentMessageId);
    if (parent?.role === 'user') {
      return parent;
    }
  }

  if (targetAssistant) {
    const assistantIndex = messages.findIndex((message) => message.id === targetAssistant.id);
    return messages
      .slice(0, assistantIndex >= 0 ? assistantIndex : messages.length)
      .reverse()
      .find((message) => message.role === 'user');
  }

  return [...messages].reverse().find((message) => message.role === 'user');
}

function mergeKnowledgeResults(
  textResults: KnowledgeSearchResult[],
  embeddingResults: KnowledgeSearchResult[],
  limit: number,
) {
  const merged = new Map<string, KnowledgeSearchResult>();
  for (const result of [...textResults, ...embeddingResults]) {
    const key = result.nodeId || result.assetId || `${result.sourceType}:${result.sourceId}`;
    const existing = merged.get(key);
    if (!existing || result.score > existing.score) {
      merged.set(key, result);
    }
  }
  return [...merged.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));
}

function mapConversation(row: Record<string, unknown>): AiConversation {
  return {
    id: String(readField(row, 'id')),
    title: String(readField(row, 'title')),
    providerId: String(readField(row, 'providerId', 'provider_id')),
    modelId: String(readField(row, 'modelId', 'model_id')),
    systemPrompt: optionalString(readField(row, 'systemPrompt', 'system_prompt')),
    pinned: Boolean(readField(row, 'pinned')),
    status: readField(row, 'archived') ? 'archived' : 'active',
    createdAt: String(readField(row, 'createdAt', 'created_at')),
    updatedAt: String(readField(row, 'updatedAt', 'updated_at')),
  };
}

function mapMessage(row: Record<string, unknown>): AiChatMessage {
  return {
    id: String(readField(row, 'id')),
    conversationId: String(readField(row, 'conversationId', 'conversation_id')),
    role: normalizeRole(readField(row, 'role')),
    content: String(readField(row, 'content') ?? ''),
    status: normalizeStatus(readField(row, 'status')),
    parentMessageId: optionalString(readField(row, 'parentMessageId', 'parent_message_id')),
    modelId: optionalString(readField(row, 'modelId', 'model_id')),
    providerId: optionalString(readField(row, 'providerId', 'provider_id')),
    tokenUsage: parseJson(readField(row, 'tokenUsageJson', 'token_usage_json')),
    metadata: parseJson(readField(row, 'metadataJson', 'metadata_json')),
    createdAt: String(readField(row, 'createdAt', 'created_at')),
    updatedAt: String(readField(row, 'updatedAt', 'updated_at')),
  };
}

function mapCitation(row: Record<string, unknown>): AiCitation {
  return {
    id: String(readField(row, 'id')),
    sourceType: normalizeCitationSourceType(readField(row, 'sourceType', 'source_type')),
    title: String(readField(row, 'title')),
    url: optionalString(readField(row, 'url')),
    sourceId: optionalString(readField(row, 'sourceId', 'source_id')),
    snippet: optionalString(readField(row, 'snippet')),
    metadata: parseJson(readField(row, 'metadataJson', 'metadata_json')),
  };
}

function readField(row: Record<string, unknown>, camelKey: string, snakeKey?: string) {
  return row[camelKey] ?? (snakeKey ? row[snakeKey] : undefined);
}

function normalizeRole(value: unknown): AiChatMessage['role'] {
  return value === 'system' || value === 'assistant' || value === 'tool' ? value : 'user';
}

function normalizeStatus(value: unknown): AiChatMessage['status'] {
  return value === 'pending' || value === 'streaming' || value === 'aborted' || value === 'error' ? value : 'complete';
}

function normalizeCitationSourceType(value: unknown): AiCitation['sourceType'] {
  if (
    value === 'web'
    || value === 'knowledge-page'
    || value === 'knowledge-block'
    || value === 'knowledge-asset'
  ) {
    return value;
  }

  return 'knowledge-page';
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseJson(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

type ResolvedReasoningOptions = {
  enabled: boolean;
  effort: AiReasoningEffort;
  budgetTokens?: number;
};

function resolveReasoningOptions(config: AiAgentFeatureConfig, input?: AiReasoningOptions): ResolvedReasoningOptions {
  const rawBudget = input?.budgetTokens ?? config.chat.reasoningBudgetTokens;
  return {
    enabled: input?.enabled ?? config.chat.reasoningEnabled,
    effort: input?.effort ?? config.chat.reasoningEffort,
    budgetTokens: Number.isFinite(rawBudget) && Number(rawBudget) > 0 ? Math.round(Number(rawBudget)) : undefined,
  };
}

function buildReasoningProviderOptions(
  config: AiAgentFeatureConfig,
  providerId: string,
  reasoning: ResolvedReasoningOptions,
): AiProviderOptions | undefined {
  if (!reasoning.enabled) {
    return undefined;
  }

  const provider = findAiProvider(config, providerId);
  if (!provider) {
    return undefined;
  }

  if (provider.kind === 'anthropic') {
    return {
      anthropic: {
        sendReasoning: true,
        thinking: {
          type: 'enabled',
          ...(reasoning.budgetTokens ? { budgetTokens: reasoning.budgetTokens } : {}),
        },
      },
    };
  }

  if (provider.kind === 'google') {
    return {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: toGoogleThinkingLevel(reasoning.effort),
          ...(reasoning.budgetTokens ? { thinkingBudget: reasoning.budgetTokens } : {}),
        },
      },
    };
  }

  const providerOptionsKey = provider.kind === 'openai' ? 'openai' : provider.id;
  return {
    [providerOptionsKey]: {
      reasoningEffort: toOpenAiReasoningEffort(reasoning.effort),
      forceReasoning: true,
    },
  };
}

function buildMessageMetadata(
  groundingMetadata: Record<string, unknown> | undefined,
  reasoning: ResolvedReasoningOptions | undefined,
  reasoningContent: string,
) {
  return {
    ...(groundingMetadata ?? {}),
    ...(reasoning || reasoningContent
      ? {
        reasoning: {
          enabled: reasoning?.enabled ?? Boolean(reasoningContent),
          effort: reasoning?.effort,
          budgetTokens: reasoning?.budgetTokens || undefined,
          content: reasoningContent || undefined,
        },
      }
      : {}),
  };
}

function toOpenAiReasoningEffort(effort: AiReasoningEffort) {
  return effort;
}

function toGoogleThinkingLevel(effort: AiReasoningEffort) {
  return effort === 'xhigh' ? 'high' : effort;
}

export const aiChatService = new AiChatService();

function mergeProviderSecret(config: AiAgentFeatureConfig, provider: AiAgentFeatureConfig['providers'][number]) {
  const current = config.providers.find((item) => item.id === provider.id);
  return {
    ...provider,
    apiKey: provider.apiKey || current?.apiKey,
    apiKeyRef: provider.apiKeyRef || current?.apiKeyRef,
  };
}
