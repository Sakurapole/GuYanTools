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
export type AiMemoryScope = 'global' | 'project' | 'assistant';
export type AiResearchJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type AiResearchStage = 'plan' | 'search' | 'read' | 'synthesize' | 'citation_check' | 'done';
export type AiResearchSourceType = 'web' | 'knowledge-page' | 'knowledge-block' | 'knowledge-asset';
export type AiAssistantKnowledgeMode = 'force' | 'intent';
export type AiAssistantMcpMode = 'disabled' | 'auto' | 'manual';
export type AiAssistantToolCallMode = 'function' | 'auto' | 'none';
export type AiMcpServerSource = 'manual' | 'modelscope';
export type AiMcpTransport = 'stdio' | 'sse' | 'http';
export type AiMcpRuntimeStatus = 'stopped' | 'starting' | 'running' | 'error';

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

export interface AiAssistantCustomParameter {
  id: string;
  key: string;
  value: string;
}

export interface AiAssistantConfig {
  id: string;
  name: string;
  emoji: string;
  providerId?: string;
  modelId?: string;
  systemPrompt: string;
  knowledgeLibraryId?: string;
  knowledgeSpaceId?: string;
  knowledgeMode: AiAssistantKnowledgeMode;
  mcpMode: AiAssistantMcpMode;
  commonPhrases: string[];
  memoryEnabled: boolean;
  temperatureEnabled: boolean;
  temperature: number;
  topPEnabled: boolean;
  topP: number;
  contextMessages: number;
  maxOutputTokensEnabled: boolean;
  maxOutputTokens?: number;
  streaming: boolean;
  toolCallMode: AiAssistantToolCallMode;
  maxToolCallsEnabled: boolean;
  maxToolCalls: number;
  customParameters: AiAssistantCustomParameter[];
  createdAt: number;
  updatedAt: number;
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

export interface AiMcpEnvironmentVariable {
  id: string;
  key: string;
  value: string;
  secret: boolean;
}

export interface AiSafeMcpEnvironmentVariable extends Omit<AiMcpEnvironmentVariable, 'value'> {
  value?: string;
  hasValue: boolean;
}

export interface AiMcpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  source: AiMcpServerSource;
  sourceId?: string;
  transport: AiMcpTransport;
  command?: string;
  args: string[];
  cwd?: string;
  url?: string;
  env: AiMcpEnvironmentVariable[];
  autoStart: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AiSafeMcpServerConfig extends Omit<AiMcpServerConfig, 'env'> {
  env: AiSafeMcpEnvironmentVariable[];
}

export interface AiMcpSettings {
  enabled: boolean;
  modelscopeApiToken?: string;
  servers: AiMcpServerConfig[];
}

export interface AiSafeMcpSettings extends Omit<AiMcpSettings, 'modelscopeApiToken' | 'servers'> {
  hasModelScopeApiToken: boolean;
  servers: AiSafeMcpServerConfig[];
}

export interface AiAgentFeatureConfig {
  enabled: boolean;
  defaultMode: AiInteractionMode;
  defaultProviderId?: string;
  defaultChatModelId?: string;
  defaultAssistantId?: string;
  assistants: AiAssistantConfig[];
  providers: AiProviderConfig[];
  chat: AiChatSettings;
  agent: AiAgentReservedSettings;
  research: AiResearchSettings;
  mcp: AiMcpSettings;
}

export interface AiSafeAgentFeatureConfig extends Omit<AiAgentFeatureConfig, 'providers' | 'research' | 'mcp'> {
  providers: AiSafeProviderConfig[];
  research: AiSafeResearchSettings;
  mcp: AiSafeMcpSettings;
}

export interface AiConversation {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  projectId?: string;
  pinned: boolean;
  status: AiConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AiProject {
  id: string;
  name: string;
  instructions?: string;
  knowledgeLibraryId?: string;
  knowledgeSpaceId?: string;
  includeGlobalMemory: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiMemory {
  id: string;
  scope: AiMemoryScope;
  scopeId?: string;
  content: string;
  sourceMessageId?: string;
  enabled: boolean;
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
  sourceType: 'web' | 'knowledge-page' | 'knowledge-block' | 'knowledge-asset' | 'chat-attachment';
  title: string;
  url?: string;
  sourceId?: string;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

export type AiChatAttachmentKind = 'text' | 'image';
export type AiChatAttachmentSource = 'local-file' | 'clipboard' | 'knowledge-asset';

export interface AiChatAttachment {
  id: string;
  kind: AiChatAttachmentKind;
  source: AiChatAttachmentSource;
  name: string;
  mimeType: string;
  size: number;
  textContent?: string;
  data?: string;
  assetId?: string;
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

export interface AiResearchJob {
  id: string;
  title: string;
  query: string;
  status: AiResearchJobStatus;
  stage: AiResearchStage;
  providerId?: string;
  modelId?: string;
  progress: number;
  reportMarkdown?: string;
  errorMessage?: string;
  options?: AiResearchRunOptions;
  sources?: AiResearchSource[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AiResearchSource {
  id: string;
  jobId: string;
  sourceType: AiResearchSourceType;
  title: string;
  url?: string;
  sourceId?: string;
  snippet?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AiResearchRunOptions {
  providerId?: string;
  modelId?: string;
  libraryId?: string;
  spaceId?: string;
  webSearchMode?: Extract<AiSearchMode, 'off' | 'force'>;
  knowledgeSearchMode?: Extract<AiSearchMode, 'off' | 'force'>;
  maxSources?: number;
}

export interface ListAiResearchJobsPayload {
  status?: AiResearchJobStatus;
  limit?: number;
}

export interface StartAiResearchPayload {
  query: string;
  title?: string;
  options?: AiResearchRunOptions;
}

export interface RetryAiResearchPayload {
  jobId: string;
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

export interface UpdateAiCanvasOperationPayload {
  payload?: Record<string, unknown>;
  status?: AiCanvasOperationStatus;
}

export interface ApplyAiCanvasOperationResult {
  operation: AiCanvasOperation;
  files: AiCanvasFile[];
  version?: AiCanvasVersion;
}

export interface AiCanvasRunOptions {
  enabled?: boolean;
  workspaceId?: string;
}

export interface AiCanvasPreviewPayload {
  title: string;
  mode: AiCanvasMode;
  files: AiCanvasFile[];
  activePath?: string;
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

export type AiResearchEvent =
  | { type: 'research-job'; job: AiResearchJob }
  | { type: 'research-source'; jobId: string; source: AiResearchSource }
  | { type: 'research-error'; jobId: string; message: string };

export interface CreateAiConversationPayload {
  providerId: string;
  modelId: string;
  title?: string;
  systemPrompt?: string;
  projectId?: string;
}

export interface UpdateAiConversationPayload {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
  projectId?: string;
}

export interface CreateAiProjectPayload {
  name: string;
  instructions?: string;
  knowledgeLibraryId?: string;
  knowledgeSpaceId?: string;
  includeGlobalMemory?: boolean;
}

export interface UpdateAiProjectPayload {
  name?: string;
  instructions?: string;
  knowledgeLibraryId?: string;
  knowledgeSpaceId?: string;
  includeGlobalMemory?: boolean;
  archived?: boolean;
}

export interface ListAiMemoriesPayload {
  scope?: AiMemoryScope;
  scopeId?: string;
  enabled?: boolean;
  limit?: number;
}

export interface CreateAiMemoryPayload {
  scope: AiMemoryScope;
  scopeId?: string;
  content: string;
  sourceMessageId?: string;
  enabled?: boolean;
}

export interface UpdateAiMemoryPayload {
  content?: string;
  enabled?: boolean;
}

export interface AiMemoryRunOptions {
  enabled?: boolean;
  includeGlobal?: boolean;
  assistantId?: string;
  projectId?: string;
  limit?: number;
}

export interface SendAiMessagePayload {
  conversationId: string;
  content: string;
  attachments?: AiChatAttachment[];
  providerId?: string;
  modelId?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  maxHistoryMessages?: number;
  streaming?: boolean;
  toolCallMode?: AiAssistantToolCallMode;
  mcpMode?: AiAssistantMcpMode;
  maxToolCalls?: number;
  customParameters?: AiAssistantCustomParameter[];
  reasoning?: AiReasoningOptions;
  grounding?: AiGroundingOptions;
  canvas?: AiCanvasRunOptions;
  memory?: AiMemoryRunOptions;
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
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  maxHistoryMessages?: number;
  streaming?: boolean;
  toolCallMode?: AiAssistantToolCallMode;
  mcpMode?: AiAssistantMcpMode;
  maxToolCalls?: number;
  customParameters?: AiAssistantCustomParameter[];
  reasoning?: AiReasoningOptions;
  grounding?: AiGroundingOptions;
  canvas?: AiCanvasRunOptions;
  memory?: AiMemoryRunOptions;
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
  diagnostic?: AiProviderRequestDiagnostic;
}

export interface AiProviderRequestDiagnostic {
  providerId?: string;
  providerKind?: AiProviderKind;
  modelId?: string;
  baseUrl?: string;
  expectedEndpoint?: string;
  requestUrl?: string;
  statusCode?: number;
  errorName?: string;
  errorMessage?: string;
  responseHeaders?: Record<string, string>;
  responseBodyPreview?: string;
  causeMessage?: string;
}

export interface StageAiChatAttachmentPayload {
  path: string;
  source?: AiChatAttachmentSource;
}

export interface StageAiChatAttachmentResult {
  attachment: AiChatAttachment;
}

export interface FetchAiProviderModelsPayload {
  providerId?: string;
  kind: AiProviderKind;
  baseUrl?: string;
  apiKey?: string;
}

export interface FetchAiProviderModelsResult {
  models: string[];
}

export interface ListModelScopeMcpServersPayload {
  search?: string;
  page?: number;
  pageSize?: number;
  apiToken?: string;
}

export interface ModelScopeMcpServerSummary {
  id: string;
  name: string;
  description: string;
  categories: string[];
  tags: string[];
  logoUrl?: string;
  viewCount: number;
}

export interface ListModelScopeMcpServersResult {
  servers: ModelScopeMcpServerSummary[];
  total: number;
}

export interface GetModelScopeMcpServerPayload {
  id: string;
  apiToken?: string;
}

export interface ModelScopeMcpServerDetail extends ModelScopeMcpServerSummary {
  sourceUrl?: string;
  readme?: string;
  operationalUrls: string[];
  serverConfigJson: string;
  importableServer?: AiMcpServerConfig;
}

export interface AiMcpRuntimeServerStatus {
  id: string;
  status: AiMcpRuntimeStatus;
  pid?: number;
  startedAt?: number;
  lastExitCode?: number | null;
  lastOutput?: string;
  error?: string;
}

export type StartAiMcpServerResult = AiMcpRuntimeServerStatus;

export interface AiMcpToolSummary {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface AiMcpToolCallResult {
  serverId: string;
  toolName: string;
  title: string;
  text: string;
  raw?: unknown;
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
  nodeId?: string;
  assetId?: string;
  sourceType?: import('@/contracts/knowledge').KnowledgeSearchSourceType;
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
  fetchProviderModels: (input: FetchAiProviderModelsPayload) => Promise<FetchAiProviderModelsResult>;
  listModelScopeMcpServers: (input: ListModelScopeMcpServersPayload) => Promise<ListModelScopeMcpServersResult>;
  getModelScopeMcpServer: (input: GetModelScopeMcpServerPayload) => Promise<ModelScopeMcpServerDetail>;
  getMcpServerStatuses: () => Promise<AiMcpRuntimeServerStatus[]>;
  startMcpServer: (serverId: string) => Promise<StartAiMcpServerResult>;
  stopMcpServer: (serverId: string) => Promise<AiMcpRuntimeServerStatus>;
  listMcpTools: () => Promise<AiMcpToolSummary[]>;
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
  updateCanvasOperation: (id: string, input: UpdateAiCanvasOperationPayload) => Promise<AiCanvasOperation>;
  applyCanvasOperation: (id: string) => Promise<ApplyAiCanvasOperationResult>;
  rejectCanvasOperation: (id: string) => Promise<AiCanvasOperation>;
  openCanvasPreview: (input: AiCanvasPreviewPayload) => Promise<void>;
  listProjects: () => Promise<AiProject[]>;
  createProject: (input: CreateAiProjectPayload) => Promise<AiProject>;
  updateProject: (id: string, input: UpdateAiProjectPayload) => Promise<AiProject>;
  deleteProject: (id: string) => Promise<void>;
  listMemories: (input?: ListAiMemoriesPayload) => Promise<AiMemory[]>;
  createMemory: (input: CreateAiMemoryPayload) => Promise<AiMemory>;
  updateMemory: (id: string, input: UpdateAiMemoryPayload) => Promise<AiMemory>;
  deleteMemory: (id: string) => Promise<void>;
  listResearchJobs: (input?: ListAiResearchJobsPayload) => Promise<AiResearchJob[]>;
  getResearchJob: (jobId: string) => Promise<AiResearchJob>;
  listResearchSources: (jobId: string) => Promise<AiResearchSource[]>;
  startResearch: (input: StartAiResearchPayload) => Promise<AiResearchJob>;
  retryResearch: (input: RetryAiResearchPayload) => Promise<AiResearchJob>;
  cancelResearch: (jobId: string) => Promise<AiResearchJob>;
  listConversations: () => Promise<AiConversation[]>;
  createConversation: (input: CreateAiConversationPayload) => Promise<AiConversation>;
  updateConversation: (id: string, input: UpdateAiConversationPayload) => Promise<AiConversation>;
  deleteConversation: (id: string) => Promise<void>;
  listMessages: (conversationId: string) => Promise<AiChatMessage[]>;
  stageAttachment: (input: StageAiChatAttachmentPayload) => Promise<StageAiChatAttachmentResult>;
  sendMessage: (input: SendAiMessagePayload) => Promise<SendAiMessageResult>;
  regenerateMessage: (input: RegenerateAiMessagePayload) => Promise<RegenerateAiMessageResult>;
  stopRun: (runId: string) => Promise<void>;
  onStreamEvent: (listener: (event: AiStreamEvent) => void) => () => void;
  onResearchEvent: (listener: (event: AiResearchEvent) => void) => () => void;
}

export interface AiCanvasPreviewWindowApi {
  onPayload: (listener: (payload: AiCanvasPreviewPayload) => void) => () => void;
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
