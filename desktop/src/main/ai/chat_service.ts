import { randomUUID } from 'node:crypto';
import { generateText, stepCountIs, streamText, type JSONValue, type ModelMessage } from 'ai';
import { dbManager, JsDatabase } from '@/core/database';
import { appConfigManager } from '@/main/app-config/manager';
import type {
  AiAgentFeatureConfig,
  AiAssistantCustomParameter,
  AiCitation,
  AiChatAttachment,
  AiChatMessage,
  AiConversation,
  AiMemory,
  AiProviderKind,
  AiProject,
  AiSafeAgentFeatureConfig,
  AiReasoningEffort,
  AiReasoningOptions,
  AiStreamEvent,
  CreateAiConversationPayload,
  CreateAiMemoryPayload,
  CreateAiProjectPayload,
  FetchAiProviderModelsPayload,
  FetchAiProviderModelsResult,
  ListAiMemoriesPayload,
  RegenerateAiMessagePayload,
  RegenerateAiMessageResult,
  SendAiMessagePayload,
  SendAiMessageResult,
  TestAiProviderPayload,
  TestAiProviderResult,
  UpdateAiConversationPayload,
  UpdateAiMemoryPayload,
  UpdateAiProjectPayload,
} from '@/contracts/ai';
import type { KnowledgeSearchPayload, KnowledgeSearchResult } from '@/contracts/knowledge';
import { findAiModel, findAiProvider, resolveLanguageModel } from './provider_registry';
import { generateConversationTitle } from './title_service';
import { mapAiSdkPartToAiEvent, normalizeUsage } from './stream_events';
import { resolveGroundingContext } from './tools/grounding_service';
import { buildCanvasSystemInstruction, createCanvasTools } from './tools/canvas_tools';
import { createMcpReadTools } from './tools/mcp_tools';
import { aiEmbeddingService } from './embedding_service';
import { aiMcpService } from './mcp_service';

type AiDatabase = JsDatabase & {
  createAiConversation: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  listAiConversations: () => Promise<Record<string, unknown>[]>;
  updateAiConversation: (id: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  deleteAiConversation: (id: string) => Promise<void>;
  listAiProjects: () => Promise<Record<string, unknown>[]>;
  createAiProject: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  updateAiProject: (id: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  deleteAiProject: (id: string) => Promise<void>;
  listAiMemories: (input?: ListAiMemoriesPayload) => Promise<Record<string, unknown>[]>;
  createAiMemory: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  updateAiMemory: (id: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  deleteAiMemory: (id: string) => Promise<void>;
  listAiMessages: (conversationId: string) => Promise<Record<string, unknown>[]>;
  insertAiMessage: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  updateAiMessage: (id: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  insertAiCitation: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  listAiCitations: (messageId: string) => Promise<Record<string, unknown>[]>;
  searchKnowledge: (input: KnowledgeSearchPayload) => Promise<KnowledgeSearchResult[]>;
};

export type AiStreamListener = (event: AiStreamEvent) => void;
type AiProviderOptions = Record<string, Record<string, JSONValue>>;
type UserModelContent = Extract<ModelMessage, { role: 'user' }>['content'];

const MAX_CHAT_ATTACHMENTS = 8;

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
    if (patch.mcp) {
      normalizedPatch.mcp = mergeMcpSecrets(current, patch.mcp);
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

  async fetchProviderModels(input: FetchAiProviderModelsPayload): Promise<FetchAiProviderModelsResult> {
    const config = (await appConfigManager.getConfig()).features.aiAgent;
    const currentProvider = input.providerId
      ? config.providers.find((provider) => provider.id === input.providerId)
      : undefined;
    const kind = input.kind || currentProvider?.kind;
    if (!kind) {
      throw new Error('请先选择 Provider 类型');
    }

    const baseUrl = normalizeProviderModelsBaseUrl(input.baseUrl || currentProvider?.baseUrl, kind);
    const apiKey = (input.apiKey || currentProvider?.apiKey || '').trim().split('\n')[0] || undefined;
    const models = await fetchUpstreamProviderModels({ kind, baseUrl, apiKey });
    return { models };
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
      projectId: input.projectId,
    });
    return mapConversation(row);
  }

  async updateConversation(id: string, input: UpdateAiConversationPayload): Promise<AiConversation> {
    const row = await this.db().updateAiConversation(id, {
      title: input.title,
      pinned: input.pinned,
      archived: input.archived,
      projectId: input.projectId,
    });
    return mapConversation(row);
  }

  async deleteConversation(id: string) {
    await this.db().deleteAiConversation(id);
  }

  async listProjects(): Promise<AiProject[]> {
    const rows = await this.db().listAiProjects();
    return rows.map(mapProject);
  }

  async createProject(input: CreateAiProjectPayload): Promise<AiProject> {
    const row = await this.db().createAiProject({
      id: randomUUID(),
      name: input.name.trim() || '新项目',
      instructions: input.instructions?.trim() || undefined,
      knowledgeLibraryId: input.knowledgeLibraryId?.trim() || undefined,
      knowledgeSpaceId: input.knowledgeSpaceId?.trim() || undefined,
      includeGlobalMemory: input.includeGlobalMemory ?? true,
    });
    return mapProject(row);
  }

  async updateProject(id: string, input: UpdateAiProjectPayload): Promise<AiProject> {
    const row = await this.db().updateAiProject(id, {
      name: input.name?.trim(),
      instructions: input.instructions?.trim() || undefined,
      knowledgeLibraryId: input.knowledgeLibraryId?.trim() || undefined,
      knowledgeSpaceId: input.knowledgeSpaceId?.trim() || undefined,
      includeGlobalMemory: input.includeGlobalMemory,
      archived: input.archived,
    });
    return mapProject(row);
  }

  async deleteProject(id: string): Promise<void> {
    await this.db().deleteAiProject(id);
  }

  async listMemories(input?: ListAiMemoriesPayload): Promise<AiMemory[]> {
    const rows = await this.db().listAiMemories(input);
    return rows.map(mapMemory);
  }

  async createMemory(input: CreateAiMemoryPayload): Promise<AiMemory> {
    const row = await this.db().createAiMemory({
      id: randomUUID(),
      scope: normalizeMemoryScope(input.scope),
      scopeId: input.scopeId,
      content: input.content.trim(),
      sourceMessageId: input.sourceMessageId,
      enabled: input.enabled ?? true,
    });
    return mapMemory(row);
  }

  async updateMemory(id: string, input: UpdateAiMemoryPayload): Promise<AiMemory> {
    const row = await this.db().updateAiMemory(id, {
      content: input.content?.trim(),
      enabled: input.enabled,
    });
    return mapMemory(row);
  }

  async deleteMemory(id: string): Promise<void> {
    await this.db().deleteAiMemory(id);
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
    const attachments = sanitizeChatAttachments(input.attachments);
    assertAttachmentsSupported(config, providerId, modelId, attachments);

    const userMessage = mapMessage(await this.db().insertAiMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      role: 'user',
      content: input.content,
      status: 'complete',
      providerId,
      modelId,
      metadataJson: attachments.length ? JSON.stringify({ attachments }) : undefined,
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
    assertAttachmentsSupported(config, providerId, modelId, getMessageAttachments(sourceUserMessage));

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
    let memoryMetadata: Record<string, unknown> | undefined;
    try {
      const history = context.historyOverride ?? await this.listMessages(context.conversation.id);
      const maxHistoryMessages = context.input.maxHistoryMessages ?? context.config.chat.maxHistoryMessages;
      const modelMessages = buildModelMessages(history, maxHistoryMessages);
      const reasoning = resolveReasoningOptions(context.config, context.input.reasoning);
      const attachmentCitations = buildAttachmentCitations(context.userMessage);
      const grounding = await resolveGroundingContext({
        query: context.userMessage.content,
        config: context.config,
        grounding: context.input.grounding,
        searchKnowledge: (input) => this.searchKnowledge(context.config, input),
      });
      const citations = [...grounding.citations, ...attachmentCitations];
      groundingMetadata = {
        grounding: grounding.metadata,
        citations,
      };
      if (
        context.input.grounding?.knowledgeSearchMode === 'force'
        && grounding.metadata.knowledgeSearchEnabled
        && !grounding.citations.some((citation) => citation.sourceType.startsWith('knowledge-'))
      ) {
        throw new Error('知识库强制检索未返回可验证的知识库来源，本次回答已停止生成。');
      }
      if (citations.length) {
        await this.persistCitations(context.assistantMessage.id, citations);
        for (const citation of citations) {
          this.emit({
            type: 'citation',
            runId: context.runId,
            messageId: context.assistantMessage.id,
            citation,
          });
        }
      }

      const canvasEnabled = Boolean(context.input.canvas?.enabled);
      const baseSystemPrompt = context.input.systemPrompt?.trim()
        || context.conversation.systemPrompt
        || context.config.chat.defaultSystemPrompt
        || '';
      const memoryContext = await this.resolveMemoryContext(context.input, context.conversation);
      memoryMetadata = memoryContext.metadata;
      const canvasSystemPrompt = canvasEnabled
        ? buildCanvasSystemInstruction({ activeWorkspaceId: context.input.canvas?.workspaceId })
        : '';
      const systemPrompt = [baseSystemPrompt, memoryContext.context, grounding.context, canvasSystemPrompt].filter(Boolean).join('\n\n');
      const toolCallMode = context.input.toolCallMode ?? 'auto';
      const maxToolSteps = Number.isFinite(context.input.maxToolCalls) && Number(context.input.maxToolCalls) > 0
        ? Math.max(1, Math.floor(Number(context.input.maxToolCalls)))
        : 3;
      const canvasTools = canvasEnabled && toolCallMode !== 'none'
        ? createCanvasTools({
          runId: context.runId,
          conversationId: context.conversation.id,
          messageId: context.assistantMessage.id,
          activeWorkspaceId: context.input.canvas?.workspaceId,
          emit: (event) => this.emit(event),
        })
        : undefined;
      const mcpCitations: AiCitation[] = [];
      const mcpTools = toolCallMode !== 'none' && context.input.mcpMode && context.input.mcpMode !== 'disabled'
        ? createMcpReadTools({
          runId: context.runId,
          messageId: context.assistantMessage.id,
          tools: await aiMcpService.listTools(),
          citations: mcpCitations,
          emit: (event) => this.emit(event),
        })
        : undefined;
      const tools = {
        ...(canvasTools ?? {}),
        ...(mcpTools ?? {}),
      };
      const activeTools = Object.keys(tools).length ? tools : undefined;
      const providerOptions = mergeProviderOptions(
        buildReasoningProviderOptions(context.config, context.providerId, reasoning),
        buildCustomParameterProviderOptions(context.config, context.providerId, context.input.customParameters),
      );
      const requestOptions = {
        model: resolveLanguageModel(context.config, context.providerId, context.modelId),
        system: systemPrompt || undefined,
        messages: modelMessages,
        temperature: context.input.temperature ?? context.config.chat.temperature,
        topP: context.input.topP,
        maxOutputTokens: context.input.maxOutputTokens ?? context.config.chat.maxOutputTokens,
        providerOptions,
        tools: activeTools,
        stopWhen: activeTools ? stepCountIs(maxToolSteps) : undefined,
        abortSignal: context.controller.signal,
        maxRetries: 1,
      };

      let usage = undefined;
      if (context.input.streaming === false) {
        const result = await generateText(requestOptions);
        content = result.text ?? '';
        if (content) {
          this.emit({ type: 'text-delta', runId: context.runId, messageId: context.assistantMessage.id, delta: content });
        }
        usage = normalizeUsage((result as { totalUsage?: unknown; usage?: unknown }).totalUsage ?? result.usage);
      } else {
        const result = streamText(requestOptions);

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

        try {
          usage = normalizeUsage(await result.usage);
        } catch {
          usage = undefined;
        }
      }
      if (mcpCitations.length) {
        await this.persistCitations(context.assistantMessage.id, mcpCitations);
      }
      await this.db().updateAiMessage(context.assistantMessage.id, {
        content,
        status: 'complete',
        tokenUsageJson: usage ? JSON.stringify(usage) : undefined,
        metadataJson: JSON.stringify(buildMessageMetadata(groundingMetadata, memoryMetadata, reasoning, reasoningContent)),
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
        metadataJson: JSON.stringify(buildMessageMetadata(groundingMetadata, memoryMetadata, undefined, reasoningContent)),
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
    const safeMcp = { ...config.mcp };
    delete safeMcp.modelscopeApiToken;
    return {
      ...config,
      research: {
        ...safeResearch,
        hasWebSearchApiKey: Boolean(config.research.webSearchApiKey),
      },
      mcp: {
        ...safeMcp,
        hasModelScopeApiToken: Boolean(config.mcp.modelscopeApiToken),
        servers: config.mcp.servers.map((server) => ({
          ...server,
          env: server.env.map((item) => ({
            id: item.id,
            key: item.key,
            value: item.secret ? undefined : item.value,
            secret: item.secret,
            hasValue: Boolean(item.value),
          })),
        })),
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
    const requestedLimit = input.limit ?? config.research.maxSources;
    const scopedSearch = Boolean(input.nodeId || input.assetId);
    const searchInput = scopedSearch
      ? { ...input, limit: Math.max(60, requestedLimit * 20) }
      : input;
    const [textResults, embeddingResults] = await Promise.all([
      this.db().searchKnowledge(searchInput),
      aiEmbeddingService.searchKnowledge(config, searchInput),
    ]);
    return filterKnowledgeResultsByScope(
      mergeKnowledgeResults(textResults, embeddingResults, Math.max(requestedLimit, searchInput.limit ?? requestedLimit)),
      input,
    ).slice(0, Math.max(1, requestedLimit));
  }

  private async resolveMemoryContext(
    input: SendAiMessagePayload | RegenerateAiMessagePayload,
    conversation: AiConversation,
  ) {
    if (!input.memory?.enabled) {
      return { context: '', metadata: undefined };
    }

    const projects = await this.listProjects();
    const project = (input.memory.projectId || conversation.projectId)
      ? projects.find((item) => item.id === (input.memory?.projectId || conversation.projectId))
      : undefined;
    const includeGlobal = input.memory.includeGlobal ?? project?.includeGlobalMemory ?? true;
    const limit = Math.max(1, Math.min(20, Math.floor(input.memory.limit ?? 8)));
    const memoryGroups = await Promise.all([
      includeGlobal ? this.listMemories({ scope: 'global', enabled: true, limit }) : Promise.resolve([]),
      project ? this.listMemories({ scope: 'project', scopeId: project.id, enabled: true, limit }) : Promise.resolve([]),
      input.memory.assistantId
        ? this.listMemories({ scope: 'assistant', scopeId: input.memory.assistantId, enabled: true, limit })
        : Promise.resolve([]),
    ]);
    const memories = dedupeMemories(memoryGroups.flat()).slice(0, limit);
    const blocks = [
      project?.instructions?.trim()
        ? `项目说明（${project.name}）:\n${project.instructions.trim()}`
        : '',
      memories.length
        ? `显式记忆（用户可查看/编辑/删除）:\n${memories.map((memory, index) => `${index + 1}. ${memory.content}`).join('\n')}`
        : '',
    ].filter(Boolean);

    return {
      context: blocks.length ? blocks.join('\n\n') : '',
      metadata: {
        memory: {
          enabled: true,
          projectId: project?.id,
          includeGlobal,
          memories: memories.map((memory) => ({
            id: memory.id,
            scope: memory.scope,
            scopeId: memory.scopeId,
            content: memory.content,
          })),
        },
      },
    };
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
  const eligibleMessages = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
    .filter((message) => {
      if (message.role === 'assistant') {
        return message.status === 'complete' && message.content.trim().length > 0;
      }

      return message.content.trim().length > 0 || getMessageAttachments(message).length > 0;
    });
  const limitedMessages = maxHistoryMessages > 0
    ? eligibleMessages.slice(-Math.max(1, maxHistoryMessages))
    : eligibleMessages;
  return limitedMessages.map((message) => {
    if (message.role === 'system') {
      return { role: 'system', content: message.content };
    }
    if (message.role === 'assistant') {
      return { role: 'assistant', content: message.content };
    }
    return { role: 'user', content: buildUserMessageContent(message) };
  });
}

function buildUserMessageContent(message: AiChatMessage): UserModelContent {
  const attachments = getMessageAttachments(message);
  const textAttachments = attachments.filter((attachment) => attachment.kind === 'text' && attachment.textContent?.trim());
  const imageAttachments = attachments.filter((attachment) => attachment.kind === 'image' && attachment.data);
  if (!textAttachments.length && !imageAttachments.length) {
    return message.content;
  }

  const textBlocks = [message.content.trim()]
    .filter(Boolean)
    .concat(textAttachments.map((attachment, index) =>
      `附件 ${index + 1}: ${attachment.name}\n${attachment.textContent?.trim() ?? ''}`));
  const parts: Exclude<UserModelContent, string> = [];
  if (textBlocks.length) {
    parts.push({ type: 'text', text: textBlocks.join('\n\n') });
  }
  for (const attachment of imageAttachments) {
    parts.push({
      type: 'image',
      image: attachment.data ?? '',
      mediaType: attachment.mimeType,
    });
  }
  return parts;
}

function sanitizeChatAttachments(attachments: unknown): AiChatAttachment[] {
  if (!Array.isArray(attachments)) {
    return [];
  }
  if (attachments.length > MAX_CHAT_ATTACHMENTS) {
    throw new Error(`单次对话最多添加 ${MAX_CHAT_ATTACHMENTS} 个附件`);
  }

  return attachments
    .map(normalizeChatAttachment)
    .filter((attachment): attachment is AiChatAttachment => Boolean(attachment));
}

function normalizeChatAttachment(value: unknown): AiChatAttachment | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const kind = record.kind === 'image' ? 'image' : record.kind === 'text' ? 'text' : undefined;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType.trim() : '';
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : randomUUID();
  if (!kind || !name || !mimeType) {
    return undefined;
  }

  const source = normalizeAttachmentSource(record.source);
  const size = Number(record.size);
  const metadata = record.metadata && typeof record.metadata === 'object'
    ? record.metadata as Record<string, unknown>
    : undefined;
  return {
    id,
    kind,
    source,
    name,
    mimeType,
    size: Number.isFinite(size) && size >= 0 ? size : 0,
    textContent: kind === 'text' && typeof record.textContent === 'string' ? record.textContent : undefined,
    data: kind === 'image' && typeof record.data === 'string' ? record.data : undefined,
    assetId: typeof record.assetId === 'string' && record.assetId.trim() ? record.assetId.trim() : undefined,
    metadata,
  };
}

function normalizeAttachmentSource(value: unknown): AiChatAttachment['source'] {
  if (value === 'clipboard' || value === 'knowledge-asset') {
    return value;
  }
  return 'local-file';
}

function getMessageAttachments(message: AiChatMessage): AiChatAttachment[] {
  return sanitizeChatAttachments(message.metadata?.attachments);
}

function assertAttachmentsSupported(
  config: AiAgentFeatureConfig,
  providerId: string,
  modelId: string,
  attachments: AiChatAttachment[],
) {
  if (!attachments.length) {
    return;
  }

  const model = findAiModel(config, providerId, modelId);
  if (attachments.some((attachment) => attachment.kind === 'image') && !model?.capabilities.vision) {
    throw new Error('当前模型未声明视觉能力，无法发送图片附件');
  }
}

function buildAttachmentCitations(message: AiChatMessage): AiCitation[] {
  return getMessageAttachments(message).map((attachment, index) => ({
    id: randomUUID(),
    sourceType: 'chat-attachment',
    title: attachment.name || `附件 ${index + 1}`,
    sourceId: attachment.id,
    snippet: buildAttachmentSnippet(attachment),
    metadata: {
      attachmentId: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      size: attachment.size,
      source: attachment.source,
    },
  }));
}

function buildAttachmentSnippet(attachment: AiChatAttachment) {
  if (attachment.kind === 'text') {
    return (attachment.textContent || '').slice(0, 280);
  }
  return `${attachment.mimeType} · ${formatAttachmentSize(attachment.size)}`;
}

function formatAttachmentSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B';
  }
  if (size < 1_000_000) {
    return `${Math.round(size / 1_000)} KB`;
  }
  return `${(size / 1_000_000).toFixed(1)} MB`;
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

function filterKnowledgeResultsByScope(results: KnowledgeSearchResult[], input: KnowledgeSearchPayload) {
  return results.filter((result) => {
    if (input.nodeId && result.nodeId !== input.nodeId && result.sourceId !== input.nodeId) {
      return false;
    }
    if (input.assetId && result.assetId !== input.assetId && result.sourceId !== input.assetId) {
      return false;
    }
    return true;
  });
}

function mapConversation(row: Record<string, unknown>): AiConversation {
  return {
    id: String(readField(row, 'id')),
    title: String(readField(row, 'title')),
    providerId: String(readField(row, 'providerId', 'provider_id')),
    modelId: String(readField(row, 'modelId', 'model_id')),
    systemPrompt: optionalString(readField(row, 'systemPrompt', 'system_prompt')),
    projectId: optionalString(readField(row, 'projectId', 'project_id')),
    pinned: Boolean(readField(row, 'pinned')),
    status: readField(row, 'archived') ? 'archived' : 'active',
    createdAt: String(readField(row, 'createdAt', 'created_at')),
    updatedAt: String(readField(row, 'updatedAt', 'updated_at')),
  };
}

function mapProject(row: Record<string, unknown>): AiProject {
  return {
    id: String(readField(row, 'id')),
    name: String(readField(row, 'name') ?? '项目'),
    instructions: optionalString(readField(row, 'instructions')),
    knowledgeLibraryId: optionalString(readField(row, 'knowledgeLibraryId', 'knowledge_library_id')),
    knowledgeSpaceId: optionalString(readField(row, 'knowledgeSpaceId', 'knowledge_space_id')),
    includeGlobalMemory: Boolean(readField(row, 'includeGlobalMemory', 'include_global_memory')),
    archived: Boolean(readField(row, 'archived')),
    createdAt: String(readField(row, 'createdAt', 'created_at')),
    updatedAt: String(readField(row, 'updatedAt', 'updated_at')),
  };
}

function mapMemory(row: Record<string, unknown>): AiMemory {
  return {
    id: String(readField(row, 'id')),
    scope: normalizeMemoryScope(readField(row, 'scope')),
    scopeId: optionalString(readField(row, 'scopeId', 'scope_id')),
    content: String(readField(row, 'content') ?? ''),
    sourceMessageId: optionalString(readField(row, 'sourceMessageId', 'source_message_id')),
    enabled: Boolean(readField(row, 'enabled')),
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
    || value === 'chat-attachment'
  ) {
    return value;
  }

  return 'knowledge-page';
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeMemoryScope(value: unknown): AiMemory['scope'] {
  return value === 'project' || value === 'assistant' ? value : 'global';
}

function dedupeMemories(memories: AiMemory[]) {
  const seen = new Set<string>();
  return memories.filter((memory) => {
    if (seen.has(memory.id)) {
      return false;
    }
    seen.add(memory.id);
    return true;
  });
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

function buildCustomParameterProviderOptions(
  config: AiAgentFeatureConfig,
  providerId: string,
  parameters?: AiAssistantCustomParameter[],
): AiProviderOptions | undefined {
  const entries = (parameters ?? [])
    .map((parameter) => ({
      key: parameter.key.trim(),
      value: parseProviderOptionValue(parameter.value),
    }))
    .filter((parameter) => parameter.key);
  if (!entries.length) {
    return undefined;
  }

  const provider = findAiProvider(config, providerId);
  if (!provider) {
    return undefined;
  }

  const providerOptionsKey = provider.kind === 'openai' ? 'openai' : provider.id;
  return {
    [providerOptionsKey]: Object.fromEntries(entries.map((entry) => [entry.key, entry.value])),
  };
}

function mergeProviderOptions(...options: Array<AiProviderOptions | undefined>): AiProviderOptions | undefined {
  const merged: AiProviderOptions = {};
  for (const option of options) {
    if (!option) {
      continue;
    }
    for (const [providerKey, providerOption] of Object.entries(option)) {
      merged[providerKey] = {
        ...(merged[providerKey] ?? {}),
        ...providerOption,
      };
    }
  }
  return Object.keys(merged).length ? merged : undefined;
}

function parseProviderOptionValue(value: string): JSONValue {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (trimmed === 'null') {
    return null;
  }
  const numberValue = Number(trimmed);
  if (Number.isFinite(numberValue) && trimmed !== '') {
    return numberValue;
  }
  try {
    return JSON.parse(trimmed) as JSONValue;
  } catch {
    return trimmed;
  }
}

function buildMessageMetadata(
  groundingMetadata: Record<string, unknown> | undefined,
  memoryMetadata: Record<string, unknown> | undefined,
  reasoning: ResolvedReasoningOptions | undefined,
  reasoningContent: string,
) {
  return {
    ...(groundingMetadata ?? {}),
    ...(memoryMetadata ?? {}),
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

function normalizeProviderModelsBaseUrl(baseUrl: string | undefined, kind: AiProviderKind) {
  const trimmed = (baseUrl || defaultProviderModelsBaseUrl(kind)).trim();
  if (!trimmed) {
    throw new Error('请先填写 Base URL');
  }
  return trimmed.replace(/\/+$/, '');
}

function defaultProviderModelsBaseUrl(kind: AiProviderKind) {
  switch (kind) {
    case 'openai':
      return 'https://api.openai.com';
    case 'anthropic':
      return 'https://api.anthropic.com';
    case 'google':
      return 'https://generativelanguage.googleapis.com';
    case 'ollama':
      return 'http://localhost:11434';
    case 'vercel-gateway':
      return 'https://ai-gateway.vercel.sh';
    case 'openai-compatible':
    default:
      return '';
  }
}

async function fetchUpstreamProviderModels(input: {
  kind: AiProviderKind;
  baseUrl: string;
  apiKey?: string;
}) {
  if (input.kind === 'ollama') {
    return fetchOllamaModelIds(input.baseUrl, input.apiKey);
  }

  if (input.kind === 'google') {
    return fetchGeminiModelIds(input.baseUrl, input.apiKey);
  }

  if (input.kind === 'anthropic') {
    return fetchOpenAiModelIds(openAiModelsUrl(input.baseUrl), input.apiKey, {
      'x-api-key': input.apiKey || '',
      'anthropic-version': '2023-06-01',
    });
  }

  return fetchOpenAiModelIds(openAiModelsUrl(input.baseUrl), input.apiKey);
}

function openAiModelsUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.endsWith('/v1') ? `${normalized}/models` : `${normalized}/v1/models`;
}

function ollamaRootUrl(baseUrl: string) {
  return baseUrl.replace(/\/v1$/i, '').replace(/\/+$/, '');
}

async function fetchOllamaModelIds(baseUrl: string, apiKey?: string) {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(`${ollamaRootUrl(baseUrl)}/api/tags`, { headers });
  const json = await readJsonResponse(response);
  const models = Array.isArray(json.models)
    ? json.models.map((model: unknown) => model && typeof model === 'object' ? String((model as { name?: unknown }).name || '') : '')
    : [];
  return uniqueModelIds(models);
}

async function fetchGeminiModelIds(baseUrl: string, apiKey?: string) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/v1beta/models`);
  if (apiKey) {
    url.searchParams.set('key', apiKey);
  }
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(url, { headers });
  const json = await readJsonResponse(response);
  const models = Array.isArray(json.models)
    ? json.models.map((model: unknown) => {
      if (!model || typeof model !== 'object') return '';
      const name = String((model as { name?: unknown }).name || '');
      return name.replace(/^models\//, '');
    })
    : [];
  return uniqueModelIds(models);
}

async function fetchOpenAiModelIds(url: string, apiKey?: string, headers: Record<string, string> = {}) {
  const requestHeaders: Record<string, string> = { ...headers };
  if (apiKey && !requestHeaders.Authorization && !requestHeaders['x-api-key']) {
    requestHeaders.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(url, { headers: requestHeaders });
  const json = await readJsonResponse(response);
  const models = Array.isArray(json.data)
    ? json.data.map((model: unknown) => {
      if (typeof model === 'string') return model;
      if (!model || typeof model !== 'object') return '';
      return String((model as { id?: unknown }).id || '');
    })
    : [];
  return uniqueModelIds(models);
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `获取模型列表失败：HTTP ${response.status}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('获取模型列表失败：上游返回不是有效 JSON');
  }
}

function uniqueModelIds(models: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const model of models) {
    const id = model.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  if (!result.length) {
    throw new Error('上游没有返回可用模型');
  }
  return result;
}

function mergeProviderSecret(config: AiAgentFeatureConfig, provider: AiAgentFeatureConfig['providers'][number]) {
  const current = config.providers.find((item) => item.id === provider.id);
  return {
    ...provider,
    apiKey: provider.apiKey || current?.apiKey,
    apiKeyRef: provider.apiKeyRef || current?.apiKeyRef,
  };
}

function mergeMcpSecrets(config: AiAgentFeatureConfig, patch: Partial<AiAgentFeatureConfig['mcp']>): AiAgentFeatureConfig['mcp'] {
  return {
    enabled: patch.enabled ?? config.mcp.enabled,
    modelscopeApiToken: patch.modelscopeApiToken || config.mcp.modelscopeApiToken,
    servers: (patch.servers ?? config.mcp.servers).map((server) => {
      const current = config.mcp.servers.find((item) => item.id === server.id);
      return {
        ...server,
        env: server.env.map((env) => {
          const currentEnv = current?.env.find((item) => item.key === env.key);
          return {
            ...env,
            value: env.value || currentEnv?.value || '',
          };
        }),
      };
    }),
  };
}
