export type AiProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openai-compatible'
  | 'ollama'
  | 'vercel-gateway';

export type AiConversationStatus = 'active' | 'archived';
export type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool';
export type AiMessageStatus = 'pending' | 'streaming' | 'complete' | 'aborted' | 'error';
export type AiReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type AiInteractionMode = 'chat' | 'general-agent' | 'code-agent';
export type AiAgentMode = 'general-agent' | 'code-agent';
export type AiCanvasMode = 'markdown' | 'html' | 'react';
export type AiCanvasOperationType = 'create' | 'replace_file' | 'patch_file' | 'append_file' | 'delete_file';
export type AiCanvasOperationStatus = 'pending' | 'applied' | 'rejected';

export interface AiModelCapabilities {
  streaming: boolean;
  vision: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  embedding: boolean;
  nativeWebSearch: boolean;
  nativeFileSearch: boolean;
  maxContextTokens?: number;
}

export interface AiModelConfig {
  id: string;
  displayName: string;
  providerModelId: string;
  capabilities: AiModelCapabilities;
  contextWindow?: number;
  maxOutputTokens?: number;
  defaultTemperature?: number;
}

export interface AiProviderConfig {
  id: string;
  kind: AiProviderKind;
  name: string;
  baseUrl?: string;
  apiKeyRef?: string;
  apiKey?: string;
  enabled: boolean;
  models: AiModelConfig[];
  createdAt: number;
  updatedAt: number;
}

export type AiSafeProviderConfig = Omit<AiProviderConfig, 'apiKey' | 'apiKeyRef'> & {
  hasApiKey: boolean;
};

export interface AiChatSettings {
  defaultSystemPrompt: string;
  maxHistoryMessages: number;
  temperature: number;
  maxOutputTokens?: number;
  reasoningEnabled: boolean;
  reasoningEffort: AiReasoningEffort;
  reasoningBudgetTokens?: number;
}

export interface AiAgentReservedSettings {
  enabled: boolean;
  defaultAgentMode: AiAgentMode;
  maxSteps: number;
  requireApprovalForWriteTools: boolean;
  codex: AiCodexAgentReservedSettings;
  general: AiGeneralAgentReservedSettings;
}

export interface AiCodexAgentReservedSettings {
  enabled: boolean;
  lastWorkingDirectory?: string;
  skipGitRepoCheck: boolean;
  cliConfigJson?: string;
}

export interface AiGeneralAgentTemplate {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  providerId?: string;
  modelId?: string;
  enabledTools: string[];
  temperature?: number;
  maxOutputTokens?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AiGeneralAgentReservedSettings {
  enabled: boolean;
  defaultAgentId?: string;
  agents: AiGeneralAgentTemplate[];
}

export interface AiResearchSettings {
  enabled: boolean;
  maxSearchQueries: number;
  maxSources: number;
  webSearchEndpoint?: string;
  webSearchApiKey?: string;
  allowedDomains?: string[];
  blockedDomains?: string[];
  defaultKnowledgeLibraryId?: string;
  defaultKnowledgeSpaceId?: string;
  embeddingProviderId?: string;
  embeddingModelId?: string;
}

export type AiSafeResearchSettings = Omit<AiResearchSettings, 'webSearchApiKey'> & {
  hasWebSearchApiKey: boolean;
};

export interface AiAgentFeatureConfig {
  enabled: boolean;
  defaultMode: AiInteractionMode;
  defaultProviderId?: string;
  defaultChatModelId?: string;
  providers: AiProviderConfig[];
  chat: AiChatSettings;
  agent: AiAgentReservedSettings;
  research: AiResearchSettings;
}

export interface AiSafeAgentFeatureConfig extends Omit<AiAgentFeatureConfig, 'providers' | 'research'> {
  providers: AiSafeProviderConfig[];
  research: AiSafeResearchSettings;
}

export interface AiConversation {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  pinned: boolean;
  status: AiConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatMessage {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  status: AiMessageStatus;
  parentMessageId?: string;
  providerId?: string;
  modelId?: string;
  tokenUsage?: AiTokenUsage;
  metadata?: Record<string, unknown>;
  citations?: AiCitation[];
  createdAt: string;
  updatedAt: string;
}

export interface AiTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AiCitation {
  id: string;
  sourceType: 'web' | 'knowledge-page' | 'knowledge-block' | 'knowledge-asset';
  title: string;
  url?: string;
  sourceId?: string;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

export interface AiCanvasWorkspace {
  id: string;
  conversationId: string;
  title: string;
  mode: AiCanvasMode;
  activeVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiCanvasFile {
  id: string;
  workspaceId: string;
  path: string;
  language: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiCanvasVersion {
  id: string;
  workspaceId: string;
  versionNo: number;
  snapshotJson: string;
  sourceMessageId?: string;
  createdAt: string;
}

export interface AiCanvasOperation {
  id: string;
  workspaceId: string;
  sourceMessageId?: string;
  operationType: AiCanvasOperationType;
  payloadJson: string;
  status: AiCanvasOperationStatus;
  createdAt: string;
}

export interface CreateAiCanvasWorkspacePayload {
  conversationId: string;
  title: string;
  mode: AiCanvasMode;
  files?: Array<Pick<AiCanvasFile, 'path' | 'language' | 'content'>>;
}

export interface UpdateAiCanvasWorkspacePayload {
  title?: string;
  mode?: AiCanvasMode;
  activeVersionId?: string;
}

export interface UpsertAiCanvasFilePayload {
  workspaceId: string;
  path: string;
  language: string;
  content: string;
}

export interface CreateAiCanvasVersionPayload {
  workspaceId: string;
  sourceMessageId?: string;
}

export interface CreateAiCanvasOperationPayload {
  workspaceId: string;
  sourceMessageId?: string;
  operationType: AiCanvasOperationType;
  payload: Record<string, unknown>;
  status?: AiCanvasOperationStatus;
}

export interface AiCanvasRunOptions {
  enabled?: boolean;
  workspaceId?: string;
}

export type AiStreamEvent =
  | { type: 'run-start'; runId: string; conversationId: string; messageId: string }
  | { type: 'text-delta'; runId: string; messageId: string; delta: string }
  | { type: 'reasoning-delta'; runId: string; messageId: string; delta: string }
  | { type: 'tool-call-start'; runId: string; toolCallId: string; toolName: string; inputPreview?: string }
  | { type: 'tool-call-delta'; runId: string; toolCallId: string; delta: string }
  | { type: 'tool-call-result'; runId: string; toolCallId: string; outputPreview: string; isError?: boolean }
  | { type: 'canvas-workspace'; runId: string; conversationId: string; workspace: AiCanvasWorkspace }
  | { type: 'canvas-file'; runId: string; workspaceId: string; file: AiCanvasFile }
  | { type: 'canvas-operation'; runId: string; workspaceId: string; operation: AiCanvasOperation }
  | { type: 'citation'; runId: string; messageId: string; citation: AiCitation }
  | { type: 'usage'; runId: string; messageId: string; usage: AiTokenUsage }
  | { type: 'run-aborted'; runId: string }
  | { type: 'run-error'; runId: string; message: string; retryable: boolean }
  | { type: 'run-finish'; runId: string; finishReason: string };

export interface CreateAiConversationPayload {
  providerId: string;
  modelId: string;
  title?: string;
  systemPrompt?: string;
}

export interface UpdateAiConversationPayload {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
}

export interface SendAiMessagePayload {
  conversationId: string;
  content: string;
  providerId?: string;
  modelId?: string;
  temperature?: number;
  maxOutputTokens?: number;
  reasoning?: AiReasoningOptions;
  grounding?: AiGroundingOptions;
  canvas?: AiCanvasRunOptions;
}

export interface SendAiMessageResult {
  runId: string;
  userMessage: AiChatMessage;
  assistantMessage: AiChatMessage;
}

export interface RegenerateAiMessagePayload {
  conversationId: string;
  assistantMessageId?: string;
  providerId?: string;
  modelId?: string;
  temperature?: number;
  maxOutputTokens?: number;
  reasoning?: AiReasoningOptions;
  grounding?: AiGroundingOptions;
  canvas?: AiCanvasRunOptions;
}

export interface RegenerateAiMessageResult {
  runId: string;
  sourceUserMessage: AiChatMessage;
  assistantMessage: AiChatMessage;
}

export interface TestAiProviderPayload {
  providerId?: string;
  provider?: AiProviderConfig;
  modelId?: string;
}

export interface TestAiProviderResult {
  ok: boolean;
  message: string;
}

export interface RebuildKnowledgeEmbeddingsPayload {
  providerId?: string;
  modelId?: string;
  batchSize?: number;
  reset?: boolean;
}

export interface KnowledgeEmbeddingStats {
  chunkCount: number;
  embeddedCount: number;
  provider: string;
  model: string;
}

export interface RebuildKnowledgeEmbeddingsResult extends KnowledgeEmbeddingStats {
  totalChunks: number;
  embeddedChunks: number;
  failedChunks: number;
  deletedEmbeddings: number;
}

export type AiSearchMode = 'off' | 'auto' | 'force';

export interface AiGroundingOptions {
  webSearchMode?: AiSearchMode;
  knowledgeSearchMode?: AiSearchMode;
  libraryId?: string;
  spaceId?: string;
}

export interface AiReasoningOptions {
  enabled?: boolean;
  effort?: AiReasoningEffort;
  budgetTokens?: number;
}

export interface AiApi {
  getConfig: () => Promise<AiSafeAgentFeatureConfig>;
  updateConfig: (patch: Partial<AiAgentFeatureConfig>) => Promise<AiSafeAgentFeatureConfig>;
  testProvider: (input: TestAiProviderPayload) => Promise<TestAiProviderResult>;
  getKnowledgeEmbeddingStats: (input?: RebuildKnowledgeEmbeddingsPayload) => Promise<KnowledgeEmbeddingStats>;
  rebuildKnowledgeEmbeddings: (input?: RebuildKnowledgeEmbeddingsPayload) => Promise<RebuildKnowledgeEmbeddingsResult>;
  listCanvasWorkspaces: (conversationId: string) => Promise<AiCanvasWorkspace[]>;
  createCanvasWorkspace: (input: CreateAiCanvasWorkspacePayload) => Promise<{ workspace: AiCanvasWorkspace; files: AiCanvasFile[]; version?: AiCanvasVersion }>;
  updateCanvasWorkspace: (id: string, input: UpdateAiCanvasWorkspacePayload) => Promise<AiCanvasWorkspace>;
  deleteCanvasWorkspace: (id: string) => Promise<void>;
  listCanvasFiles: (workspaceId: string) => Promise<AiCanvasFile[]>;
  upsertCanvasFile: (input: UpsertAiCanvasFilePayload) => Promise<AiCanvasFile>;
  deleteCanvasFile: (workspaceId: string, path: string) => Promise<void>;
  listCanvasVersions: (workspaceId: string) => Promise<AiCanvasVersion[]>;
  createCanvasVersion: (input: CreateAiCanvasVersionPayload) => Promise<AiCanvasVersion>;
  listCanvasOperations: (workspaceId: string) => Promise<AiCanvasOperation[]>;
  listConversations: () => Promise<AiConversation[]>;
  createConversation: (input: CreateAiConversationPayload) => Promise<AiConversation>;
  updateConversation: (id: string, input: UpdateAiConversationPayload) => Promise<AiConversation>;
  deleteConversation: (id: string) => Promise<void>;
  listMessages: (conversationId: string) => Promise<AiChatMessage[]>;
  sendMessage: (input: SendAiMessagePayload) => Promise<SendAiMessageResult>;
  regenerateMessage: (input: RegenerateAiMessagePayload) => Promise<RegenerateAiMessageResult>;
  stopRun: (runId: string) => Promise<void>;
  onStreamEvent: (listener: (event: AiStreamEvent) => void) => () => void;
}

export function createDefaultAiModelCapabilities(): AiModelCapabilities {
  return {
    streaming: true,
    vision: false,
    toolCalling: false,
    structuredOutput: false,
    reasoning: false,
    embedding: false,
    nativeWebSearch: false,
    nativeFileSearch: false,
  };
}
