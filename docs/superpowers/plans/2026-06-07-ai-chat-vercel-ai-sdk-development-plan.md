# AI Chat With Vercel AI SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build GuYanTools AI Chat in staged versions using Vercel AI SDK as the primary model integration layer, while reserving stable boundaries for later Agent features.

**Architecture:** Renderer never calls model providers directly. The renderer talks to `window.aiApi`, preload forwards to main-process AI IPC, main process uses Vercel AI SDK providers and streams normalized app events back to the Vue store, and Rust SQLite persists conversations, messages, citations, research jobs, and later Agent runs. Chat, General Agent, and Code Agent stay separated at the service and persistence boundaries.

**Tech Stack:** Electron 37, Vue 3, TypeScript, Pinia setup stores, Electron IPC, Rust `multi_platform_core` SQLite services, Vercel AI SDK `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`, `@ai-sdk/vue`, `zod`, existing Markdown/math rendering dependencies.

---

## Source Documents And Decisions

- Roadmap: `docs/desktop/AgentFunc/plans/ai-chat-vercel-ai-sdk-roadmap.md`
- Existing requirements: `docs/desktop/AgentFunc/plans/ai-agent-requirements.md`
- Existing architecture: `docs/desktop/AgentFunc/plans/ai-agent-architecture.md`
- Knowledge AI constraints: `docs/desktop/KnowledgeBase/ai-integration.md`
- Existing config slot: `desktop/src/contracts/app_config.ts`
- Existing app config manager: `desktop/src/main/app-config/manager.ts`
- Existing preload boundary: `desktop/src/preload.ts`
- Existing knowledge AI tables: `multi_platform_core/migrations/021_add_knowledge.sql`

Technical decisions:

1. Use Vercel AI SDK for all Chat and General Agent model calls.
2. Use AI SDK `createProviderRegistry` to route configured providers through stable string model IDs.
3. Use AI SDK `streamText` for streaming chat, tool calls, and later Agent loops.
4. Use AI SDK `tool`, `stepCountIs`, `prepareStep`, and `onStepFinish` only from V1.1 onward.
5. Use AI SDK `embedMany` for knowledge chunk embeddings from V1.1 onward.
6. Use `@ai-sdk/vue` only as UI-state reference or optional custom transport support; the primary desktop stream remains IPC-based.
7. Do not introduce LangChain, LlamaIndex, Mastra, or LangGraph in these versions.
8. Code Agent remains separate and uses `@openai/codex-sdk` in V2.1, not Vercel AI SDK ProviderRegistry.

## Version Sequence

| Version | Theme | User-visible Result | Implementation Gate |
| --- | --- | --- | --- |
| V1.0 | Basic AI Chat | Configure providers and models, create chats, stream answers, stop and retry | Chat works with OpenAI-compatible and Ollama without exposing API keys |
| V1.1 | Search And Knowledge QA | Web search, citations, current-space knowledge QA, embeddings | Grounded answers show citations and knowledge answers use existing chunks |
| V1.2 | Reasoning And Canvas | Reasoning controls, Canvas workspace, structured patches, fallback | AI can propose Canvas edits with diff and no silent writes |
| V1.3 | Deep Research | Long-running research jobs with source collection and reports | Research jobs can be cancelled and produce cited Markdown reports |
| V2.0 | General Agent | Configurable controlled Agent with tools, approvals, and run replay | Dangerous tools require approval and all tool calls are auditable |
| V2.1 | Code Agent | Codex SDK based code agent UI and thread persistence | Code Agent runs separately from Chat/General Agent |

## Cross-Version File Map

### Contracts And Config

- Create: `desktop/src/contracts/ai.ts`
  - Owns public renderer-safe AI types: provider configs without API keys, model capabilities, chat messages, stream events, citations, tool invocation records, Canvas patch proposals, research job summaries.
- Modify: `desktop/src/contracts/app_config.ts`
  - Replace `features.aiAgent: Record<string, unknown>` with `AiAgentFeatureConfig`.
  - Add `createDefaultAiAgentFeatureConfig()`.
- Modify: `desktop/src/main/app-config/manager.ts`
  - Normalize `features.aiAgent`.
  - Strip/mask secrets before returning config to renderer-facing paths.

### Main Process

- Create: `desktop/src/main/ai/ipc.ts`
  - Registers all `ai:*` IPC handlers and stream event forwarding.
- Create: `desktop/src/main/ai/provider_registry.ts`
  - Converts app provider configs into AI SDK providers.
- Create: `desktop/src/main/ai/chat_service.ts`
  - Handles conversations, message construction, `streamText`, aborts, persistence, retry, regenerate.
- Create: `desktop/src/main/ai/title_service.ts`
  - Generates short conversation titles.
- Create: `desktop/src/main/ai/stream_events.ts`
  - Maps AI SDK stream parts to `AiStreamEvent`.
- Create: `desktop/src/main/ai/tools/tool_registry.ts`
  - Registers read-only and proposal-only tools.
- Create from V1.1: `desktop/src/main/ai/tools/web_search_tool.ts`
- Create from V1.1: `desktop/src/main/ai/tools/knowledge_search_tool.ts`
- Create from V1.2: `desktop/src/main/ai/tools/canvas_patch_tool.ts`
- Create from V1.3: `desktop/src/main/ai/research/research_job_service.ts`
- Create from V1.3: `desktop/src/main/ai/research/research_pipeline.ts`

### Preload And Renderer

- Modify: `desktop/src/preload.ts`
  - Expose `window.aiApi`.
- Modify: `desktop/src/windows/main/vite-env.d.ts`
  - Add `aiApi` global type.
- Modify: `desktop/src/windows/main/routes/router.ts`
  - Add AI page route.
- Create: `desktop/src/windows/main/stores/ai_config_store.ts`
- Create: `desktop/src/windows/main/stores/ai_chat_store.ts`
- Create: `desktop/src/windows/main/stores/ai_research_store.ts`
- Create: `desktop/src/windows/main/pages/AI/AiChatPage.vue`
- Create: `desktop/src/windows/main/pages/AI/AiSettingsPanel.vue`
- Create: `desktop/src/windows/main/pages/AI/AiConversationList.vue`
- Create: `desktop/src/windows/main/pages/AI/AiMessageList.vue`
- Create: `desktop/src/windows/main/pages/AI/AiMessageItem.vue`
- Create: `desktop/src/windows/main/pages/AI/AiComposer.vue`
- Create: `desktop/src/windows/main/pages/AI/AiCitationList.vue`
- Create: `desktop/src/windows/main/pages/AI/AiToolCallCard.vue`
- Create from V1.2: `desktop/src/windows/main/pages/AI/AiCanvasPanel.vue`
- Create from V1.3: `desktop/src/windows/main/pages/AI/AiResearchPanel.vue`

### Rust Core

- Modify: `multi_platform_core/migrations/mod.rs` or the local migration registry if required by the existing pattern.
- Create: `multi_platform_core/migrations/0XX_add_ai_chat.sql`
- Create from V1.3: `multi_platform_core/migrations/0XX_add_ai_research.sql`
- Create from V2.0: `multi_platform_core/migrations/0XX_add_ai_agent.sql`
- Modify: `multi_platform_core/src/models/mod.rs`
- Create: `multi_platform_core/src/models/ai.rs`
- Modify: `multi_platform_core/src/services/mod.rs`
- Create: `multi_platform_core/src/services/ai_service.rs`
- Modify: `multi_platform_core/src/bindings/napi.rs`
- Modify generated TypeScript declarations using the repo's existing native build/sync flow.

### Tests And Verification

- Create: `desktop/scripts/verify-ai-chat.cjs`
- Create from V1.1: `desktop/scripts/verify-ai-citations.cjs`
- Create from V2.0: `desktop/scripts/verify-ai-agent-tools.cjs`
- Modify: `desktop/package.json`
  - Add `verify:ai-chat`, `verify:ai-citations`, and later `verify:ai-agent`.

## Shared Type Baseline

These types should be introduced in V1.0 before service code.

```ts
export type AiProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openai-compatible'
  | 'ollama'
  | 'vercel-gateway';

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

export interface AiSafeProviderConfig {
  id: string;
  kind: AiProviderKind;
  name: string;
  baseUrl?: string;
  enabled: boolean;
  hasApiKey: boolean;
  models: AiModelConfig[];
  createdAt: number;
  updatedAt: number;
}

export interface AiProviderConfig extends Omit<AiSafeProviderConfig, 'hasApiKey'> {
  apiKeyRef?: string;
  apiKey?: string;
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

export type AiStreamEvent =
  | { type: 'run-start'; runId: string; conversationId: string; messageId: string }
  | { type: 'text-delta'; runId: string; messageId: string; delta: string }
  | { type: 'reasoning-delta'; runId: string; messageId: string; delta: string }
  | { type: 'tool-call-start'; runId: string; toolCallId: string; toolName: string; inputPreview?: string }
  | { type: 'tool-call-delta'; runId: string; toolCallId: string; delta: string }
  | { type: 'tool-call-result'; runId: string; toolCallId: string; outputPreview: string; isError?: boolean }
  | { type: 'citation'; runId: string; messageId: string; citation: AiCitation }
  | { type: 'usage'; runId: string; messageId: string; usage: AiTokenUsage }
  | { type: 'run-aborted'; runId: string }
  | { type: 'run-error'; runId: string; message: string; retryable: boolean }
  | { type: 'run-finish'; runId: string; finishReason: string };
```

## V1.0 Development Plan: Basic AI Chat

### V1.0 Entry Criteria

- Existing staged or unstaged changes are mapped before implementation.
- The implementer reads `desktop/src/preload.ts`, `desktop/src/main/app-config/manager.ts`, `desktop/src/contracts/app_config.ts`, and one existing IPC module such as `desktop/src/main/knowledge/ipc.ts`.
- No existing knowledge-editor or unrelated dirty-tree changes are staged into this work by accident.

### V1.0 Task 1: Add Dependencies And Scripts

**Files:**
- Modify: `desktop/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install AI SDK dependencies**

Run:

```bash
pnpm --dir desktop add ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/openai-compatible @ai-sdk/vue zod
```

Expected:

```text
dependencies:
+ ai
+ @ai-sdk/openai
+ @ai-sdk/anthropic
+ @ai-sdk/google
+ @ai-sdk/openai-compatible
+ @ai-sdk/vue
+ zod
```

- [ ] **Step 2: Add V1.0 verification script**

In `desktop/package.json`, add:

```json
"verify:ai-chat": "node scripts/verify-ai-chat.cjs"
```

- [ ] **Step 3: Create initial verifier**

Create `desktop/scripts/verify-ai-chat.cjs`:

```js
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'src/contracts/ai.ts',
  'src/main/ai/ipc.ts',
  'src/main/ai/chat_service.ts',
  'src/main/ai/provider_registry.ts',
  'src/windows/main/stores/ai_chat_store.ts',
  'src/windows/main/pages/AI/AiChatPage.vue',
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error('Missing AI chat files:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

console.log('AI chat file surface exists.');
```

- [ ] **Step 4: Run verifier and confirm it fails before files exist**

Run:

```bash
pnpm --dir desktop run verify:ai-chat
```

Expected:

```text
Missing AI chat files:
```

### V1.0 Task 2: Define Contracts And Config

**Files:**
- Create: `desktop/src/contracts/ai.ts`
- Modify: `desktop/src/contracts/app_config.ts`
- Modify: `desktop/src/main/app-config/manager.ts`

- [ ] **Step 1: Create AI contract**

Create `desktop/src/contracts/ai.ts` with:

```ts
export type AiProviderKind = 'openai' | 'anthropic' | 'google' | 'openai-compatible' | 'ollama' | 'vercel-gateway';
export type AiConversationStatus = 'active' | 'archived';
export type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool';
export type AiMessageStatus = 'pending' | 'streaming' | 'complete' | 'aborted' | 'error';

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
}

export interface AiAgentReservedSettings {
  enabled: boolean;
  maxSteps: number;
  requireApprovalForWriteTools: boolean;
}

export interface AiResearchSettings {
  enabled: boolean;
  maxSearchQueries: number;
  maxSources: number;
}

export interface AiAgentFeatureConfig {
  enabled: boolean;
  defaultMode: 'chat' | 'general-agent' | 'code-agent';
  defaultProviderId?: string;
  defaultChatModelId?: string;
  providers: AiProviderConfig[];
  chat: AiChatSettings;
  agent: AiAgentReservedSettings;
  research: AiResearchSettings;
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
```

- [ ] **Step 2: Add default config factory**

In `desktop/src/contracts/app_config.ts`, import the AI type and add:

```ts
import type { AiAgentFeatureConfig } from './ai';

export function createDefaultAiAgentFeatureConfig(): AiAgentFeatureConfig {
  return {
    enabled: false,
    defaultMode: 'chat',
    providers: [],
    chat: {
      defaultSystemPrompt: '',
      maxHistoryMessages: 20,
      temperature: 0.7,
    },
    agent: {
      enabled: false,
      maxSteps: 5,
      requireApprovalForWriteTools: true,
    },
    research: {
      enabled: false,
      maxSearchQueries: 8,
      maxSources: 20,
    },
  };
}
```

Then change `AppFeaturesConfig.aiAgent` and `AppConfigPatch.features.aiAgent` to use `AiAgentFeatureConfig` and `Partial<AiAgentFeatureConfig>` consistently with existing config patterns.

- [ ] **Step 3: Normalize AI config in main process**

In `desktop/src/main/app-config/manager.ts`, add a `normalizeAiAgentFeature()` helper that:

```ts
function normalizeAiAgentFeature(value: unknown): AiAgentFeatureConfig {
  const defaults = createDefaultAiAgentFeatureConfig();
  if (!isRecord(value)) return cloneConfig(defaults);

  const providers = Array.isArray(value.providers) ? value.providers : [];
  return {
    ...defaults,
    ...cloneConfig(value),
    providers: providers.filter(isRecord).map((provider) => ({
      id: typeof provider.id === 'string' ? provider.id : `provider-${Date.now()}`,
      kind: typeof provider.kind === 'string' ? provider.kind : 'openai-compatible',
      name: typeof provider.name === 'string' ? provider.name : 'Custom Provider',
      baseUrl: typeof provider.baseUrl === 'string' ? provider.baseUrl : undefined,
      apiKeyRef: typeof provider.apiKeyRef === 'string' ? provider.apiKeyRef : undefined,
      apiKey: typeof provider.apiKey === 'string' ? provider.apiKey : undefined,
      enabled: provider.enabled !== false,
      models: Array.isArray(provider.models) ? provider.models : [],
      createdAt: typeof provider.createdAt === 'number' ? provider.createdAt : Date.now(),
      updatedAt: typeof provider.updatedAt === 'number' ? provider.updatedAt : Date.now(),
    })),
  };
}
```

Use this helper where `features.aiAgent` is currently cloned as `Record<string, unknown>`.

### V1.0 Task 3: Add SQLite AI Chat Persistence

**Files:**
- Create: `multi_platform_core/migrations/0XX_add_ai_chat.sql`
- Create: `multi_platform_core/src/models/ai.rs`
- Create: `multi_platform_core/src/services/ai_service.rs`
- Modify: `multi_platform_core/src/models/mod.rs`
- Modify: `multi_platform_core/src/services/mod.rs`
- Modify: `multi_platform_core/src/bindings/napi.rs`

- [ ] **Step 1: Add migration**

Create the next numbered migration using the current migration sequence:

```sql
CREATE TABLE IF NOT EXISTS ai_chat_conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    system_prompt TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'complete',
    parent_message_id TEXT,
    model_id TEXT,
    provider_id TEXT,
    token_usage_json TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES ai_chat_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_message_citations (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    source_id TEXT,
    snippet TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (message_id) REFERENCES ai_chat_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_conversation
    ON ai_chat_messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_message_citations_message
    ON ai_message_citations(message_id);
```

- [ ] **Step 2: Add Rust models**

Create `multi_platform_core/src/models/ai.rs` with structs matching the tables and using existing timestamp/string conventions from nearby models.

- [ ] **Step 3: Add service methods**

Create `AiService` with these exact public methods and behavior:

| Method | Behavior |
| --- | --- |
| `create_conversation(input: CreateAiConversationInput) -> DbResult<AiConversation>` | Inserts a conversation in a database transaction and returns the inserted row. |
| `list_conversations() -> DbResult<Vec<AiConversation>>` | Returns non-archived conversations ordered by pinned first and `updated_at` descending. |
| `update_conversation(id: &str, input: UpdateAiConversationInput) -> DbResult<AiConversation>` | Updates title, pinned state, archive state, and `updated_at`, then returns the updated row. |
| `delete_conversation(id: &str) -> DbResult<()>` | Deletes the conversation and relies on foreign-key cascade for messages and citations. |
| `list_messages(conversation_id: &str) -> DbResult<Vec<AiChatMessage>>` | Returns messages for one conversation ordered by `created_at` ascending. |
| `insert_message(input: CreateAiMessageInput) -> DbResult<AiChatMessage>` | Inserts one message and returns the inserted row. |
| `update_message_status(id: &str, status: &str, content: Option<&str>) -> DbResult<AiChatMessage>` | Updates message status, optionally replaces content, updates `updated_at`, and returns the updated row. |

- [ ] **Step 4: Add unit tests**

In `ai_service.rs`, add tests that:

```rust
#[test]
fn creates_conversation_and_messages() {
    // create temp db using existing test helper pattern
    // create conversation
    // insert user and assistant messages
    // assert list_messages returns two messages in order
}

#[test]
fn deleting_conversation_removes_messages() {
    // create conversation and message
    // delete conversation
    // assert list_messages returns empty or conversation lookup fails
}
```

- [ ] **Step 5: Run Rust test slice**

Run:

```bash
cargo test --manifest-path multi_platform_core/Cargo.toml ai
```

Expected:

```text
test result: ok
```

### V1.0 Task 4: Implement Provider Registry And Chat Service

**Files:**
- Create: `desktop/src/main/ai/provider_registry.ts`
- Create: `desktop/src/main/ai/stream_events.ts`
- Create: `desktop/src/main/ai/chat_service.ts`

- [ ] **Step 1: Implement provider factory**

Use Vercel AI SDK providers:

```ts
import { createProviderRegistry, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AiAgentFeatureConfig, AiProviderConfig } from '@/contracts/ai';

function createProvider(provider: AiProviderConfig) {
  if (provider.kind === 'openai') return createOpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
  if (provider.kind === 'anthropic') return createAnthropic({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
  if (provider.kind === 'google') return createGoogleGenerativeAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
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
    config.providers.filter((provider) => provider.enabled).map((provider) => [provider.id, createProvider(provider)]),
  );
  return createProviderRegistry(providers);
}

export function resolveLanguageModel(config: AiAgentFeatureConfig, providerId: string, modelId: string): LanguageModel {
  const registry = createAiProviderRegistry(config);
  return registry.languageModel(`${providerId}:${modelId}`);
}
```

- [ ] **Step 2: Map stream parts to app events**

Handle at least these AI SDK stream part types:

```ts
export function mapAiSdkPartToAiEvent(part: unknown, runId: string, messageId: string): AiStreamEvent | null {
  if (!part || typeof part !== 'object') return null;
  const typed = part as { type?: string; text?: string; textDelta?: string; toolCallId?: string; toolName?: string; argsTextDelta?: string };

  if (typed.type === 'text-delta') {
    return { type: 'text-delta', runId, messageId, delta: typed.textDelta || typed.text || '' };
  }
  if (typed.type === 'tool-call-streaming-start' && typed.toolCallId && typed.toolName) {
    return { type: 'tool-call-start', runId, toolCallId: typed.toolCallId, toolName: typed.toolName };
  }
  if (typed.type === 'tool-call-delta' && typed.toolCallId) {
    return { type: 'tool-call-delta', runId, toolCallId: typed.toolCallId, delta: typed.argsTextDelta || '' };
  }
  return null;
}
```

- [ ] **Step 3: Implement `ChatService.sendMessage()`**

Use `streamText` with `abortSignal`, `timeout`, `maxRetries`, and `providerOptions`:

```ts
const result = streamText({
  model,
  system: conversation.systemPrompt || config.chat.defaultSystemPrompt,
  messages: modelMessages,
  temperature: input.temperature ?? config.chat.temperature,
  maxOutputTokens: input.maxOutputTokens ?? config.chat.maxOutputTokens,
  abortSignal,
  timeout: { totalMs: 120000, chunkMs: 30000 },
  maxRetries: 1,
});

for await (const part of result.fullStream) {
  const event = mapAiSdkPartToAiEvent(part, runId, assistantMessage.id);
  if (event) yield event;
}
```

- [ ] **Step 4: Track abort controllers**

Use a map:

```ts
private readonly runs = new Map<string, AbortController>();

stopRun(runId: string) {
  const controller = this.runs.get(runId);
  if (controller) controller.abort();
}
```

Remove the controller in `finally`.

### V1.0 Task 5: Register IPC And Preload API

**Files:**
- Create: `desktop/src/main/ai/ipc.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/src/preload.ts`
- Modify: `desktop/src/windows/main/vite-env.d.ts`

- [ ] **Step 1: Register AI IPC**

Create handlers:

```ts
ipcMain.handle('ai:get-config', async () => aiService.getSafeConfig());
ipcMain.handle('ai:update-config', async (_event, patch) => aiService.updateConfig(patch));
ipcMain.handle('ai:test-provider', async (_event, input) => aiService.testProvider(input));
ipcMain.handle('ai:list-conversations', async () => aiService.listConversations());
ipcMain.handle('ai:create-conversation', async (_event, input) => aiService.createConversation(input));
ipcMain.handle('ai:update-conversation', async (_event, id, input) => aiService.updateConversation(id, input));
ipcMain.handle('ai:delete-conversation', async (_event, id) => aiService.deleteConversation(id));
ipcMain.handle('ai:list-messages', async (_event, conversationId) => aiService.listMessages(conversationId));
ipcMain.handle('ai:stop-run', async (_event, runId) => aiService.stopRun(runId));
```

- [ ] **Step 2: Implement send stream channel**

Use an IPC invoke to start and `webContents.send('ai:stream-event', event)` for stream parts. Return `{ runId, assistantMessageId }` immediately or after the first saved message, following the existing IPC error handling style.

- [ ] **Step 3: Expose preload API**

In `desktop/src/preload.ts`:

```ts
const aiApi = {
  getConfig: () => ipcRenderer.invoke('ai:get-config'),
  updateConfig: (patch: unknown) => ipcRenderer.invoke('ai:update-config', patch),
  testProvider: (input: unknown) => ipcRenderer.invoke('ai:test-provider', input),
  listConversations: () => ipcRenderer.invoke('ai:list-conversations'),
  createConversation: (input: unknown) => ipcRenderer.invoke('ai:create-conversation', input),
  updateConversation: (id: string, input: unknown) => ipcRenderer.invoke('ai:update-conversation', id, input),
  deleteConversation: (id: string) => ipcRenderer.invoke('ai:delete-conversation', id),
  listMessages: (conversationId: string) => ipcRenderer.invoke('ai:list-messages', conversationId),
  sendMessage: (input: unknown) => ipcRenderer.invoke('ai:send-message', input),
  stopRun: (runId: string) => ipcRenderer.invoke('ai:stop-run', runId),
  onStreamEvent: (listener: (event: unknown) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on('ai:stream-event', wrapped);
    return () => ipcRenderer.removeListener('ai:stream-event', wrapped);
  },
};

contextBridge.exposeInMainWorld('aiApi', aiApi);
```

- [ ] **Step 4: Register in main index**

Import and call `registerAiIpcHandlers()` in `desktop/src/main/index.ts` next to other domain IPC registrations.

### V1.0 Task 6: Build Renderer Chat UI

**Files:**
- Create: `desktop/src/windows/main/stores/ai_config_store.ts`
- Create: `desktop/src/windows/main/stores/ai_chat_store.ts`
- Create: `desktop/src/windows/main/pages/AI/AiChatPage.vue`
- Create: `desktop/src/windows/main/pages/AI/AiSettingsPanel.vue`
- Create: `desktop/src/windows/main/pages/AI/AiConversationList.vue`
- Create: `desktop/src/windows/main/pages/AI/AiMessageList.vue`
- Create: `desktop/src/windows/main/pages/AI/AiMessageItem.vue`
- Create: `desktop/src/windows/main/pages/AI/AiComposer.vue`
- Modify: `desktop/src/windows/main/routes/router.ts`

- [ ] **Step 1: Implement config store**

The store owns safe provider config and connection testing:

```ts
export const useAiConfigStore = defineStore('ai-config', () => {
  const providers = ref<AiSafeProviderConfig[]>([]);
  const loading = ref(false);

  async function loadConfig() {
    loading.value = true;
    try {
      const config = await window.aiApi.getConfig();
      providers.value = config.providers;
    } finally {
      loading.value = false;
    }
  }

  return { providers, loading, loadConfig };
});
```

- [ ] **Step 2: Implement chat store**

The store applies stream events:

```ts
function applyStreamEvent(event: AiStreamEvent) {
  if (event.type === 'text-delta') {
    const message = findMessage(event.messageId);
    if (message) message.content += event.delta;
  }
  if (event.type === 'run-finish' || event.type === 'run-error' || event.type === 'run-aborted') {
    activeRunId.value = undefined;
  }
}
```

- [ ] **Step 3: Build page shell**

`AiChatPage.vue` layout:

```vue
<template>
  <main class="ai-chat-page">
    <AiConversationList class="ai-chat-page__sidebar" />
    <section class="ai-chat-page__main">
      <AiMessageList />
      <AiComposer />
    </section>
    <AiSettingsPanel class="ai-chat-page__settings" />
  </main>
</template>
```

- [ ] **Step 4: Add route**

Add:

```ts
{ path: '/ai', component: () => import('../pages/AI/AiChatPage.vue'), meta: { title: 'AI' } }
```

If bottom bar tabs need a new entry, add it in the same pattern as existing feature tabs, using an icon from the existing icon utility.

### V1.0 Task 7: Verify V1.0

**Files:**
- Modify: `desktop/scripts/verify-ai-chat.cjs`

- [ ] **Step 1: Extend verifier**

Check that:

```js
const requiredPatterns = [
  ['src/main/ai/chat_service.ts', 'streamText'],
  ['src/main/ai/provider_registry.ts', 'createProviderRegistry'],
  ['src/preload.ts', 'contextBridge.exposeInMainWorld(\\'aiApi\\''],
];
```

- [ ] **Step 2: Run V1.0 gates**

Run:

```bash
pnpm --dir desktop run verify:ai-chat
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml ai
```

Expected:

```text
AI chat file surface exists.
```

and all lint/type/build/test commands pass.

## V1.1 Development Plan: Web Search, Citations, Knowledge QA

### V1.1 Entry Criteria

- V1.0 gates pass.
- Basic chat messages persist and reload.
- `knowledge_ai_chunks` are being populated by the existing knowledge indexing flow.

### V1.1 Task 1: Add Citation Persistence And Verifier

**Files:**
- Modify: `multi_platform_core/src/services/ai_service.rs`
- Modify: `multi_platform_core/src/models/ai.rs`
- Create: `desktop/scripts/verify-ai-citations.cjs`
- Modify: `desktop/package.json`

- [ ] **Step 1: Add citation service methods**

Add these methods to `AiService`:

| Method | Behavior |
| --- | --- |
| `insert_citation(input: CreateAiCitationInput) -> DbResult<AiCitation>` | Inserts one citation and returns the inserted row. |
| `list_citations(message_id: &str) -> DbResult<Vec<AiCitation>>` | Returns citations for one message ordered by `created_at` ascending. |

- [ ] **Step 2: Add verifier script**

Create `desktop/scripts/verify-ai-citations.cjs` that checks:

```js
const requiredPatterns = [
  ['src/main/ai/tools/web_search_tool.ts', 'tool('],
  ['src/main/ai/tools/knowledge_search_tool.ts', 'knowledge_ai_chunks'],
  ['src/windows/main/pages/AI/AiCitationList.vue', 'sourceType'],
];
```

- [ ] **Step 3: Add package script**

```json
"verify:ai-citations": "node scripts/verify-ai-citations.cjs"
```

### V1.1 Task 2: Implement Web Search Tool

**Files:**
- Create: `desktop/src/main/ai/tools/web_search_tool.ts`
- Modify: `desktop/src/contracts/ai.ts`
- Modify: `desktop/src/main/ai/chat_service.ts`

- [ ] **Step 1: Add web search settings**

Add to contract:

```ts
export type AiWebSearchMode = 'off' | 'auto' | 'required';

export interface AiWebSearchSettings {
  mode: AiWebSearchMode;
  provider: 'custom-http' | 'tavily' | 'brave' | 'serper' | 'searxng';
  endpoint?: string;
  apiKeyRef?: string;
  allowedDomains?: string[];
  blockedDomains?: string[];
}
```

- [ ] **Step 2: Implement tool**

```ts
import { tool } from 'ai';
import { z } from 'zod';

export function createWebSearchTool(search: WebSearchClient) {
  return tool({
    description: 'Search the web and return concise cited snippets.',
    inputSchema: z.object({
      query: z.string().min(1),
      allowedDomains: z.array(z.string()).optional(),
      blockedDomains: z.array(z.string()).optional(),
    }),
    execute: async (input) => {
      const results = await search.search(input);
      return {
        citations: results.map((item) => ({
          sourceType: 'web',
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          metadata: { publishedAt: item.publishedAt },
        })),
      };
    },
  });
}
```

- [ ] **Step 3: Enable tool in chat**

When web search mode is `required`, pass:

```ts
tools: { webSearch: createWebSearchTool(searchClient) },
activeTools: ['webSearch'],
stopWhen: stepCountIs(3),
```

### V1.1 Task 3: Implement Knowledge Search Tool

**Files:**
- Create: `desktop/src/main/ai/tools/knowledge_search_tool.ts`
- Modify: `multi_platform_core/src/services/knowledge_service.rs`
- Modify: `multi_platform_core/src/bindings/napi.rs`

- [ ] **Step 1: Add Rust search method over existing chunks**

Add a method that searches `knowledge_ai_chunks` by library/space metadata and text query. Initial implementation can use FTS/keyword matching already available in the knowledge subsystem. Return `chunk_id`, `source_type`, `source_id`, `content_text`, and metadata.

- [ ] **Step 2: Create AI SDK tool**

```ts
export function createKnowledgeSearchTool(service: KnowledgeRetrievalService) {
  return tool({
    description: 'Search local GuYanTools knowledge chunks and return cited sources.',
    inputSchema: z.object({
      query: z.string().min(1),
      libraryId: z.string().optional(),
      spaceId: z.string().optional(),
      limit: z.number().int().min(1).max(20).default(8),
    }),
    execute: async (input) => service.search(input),
  });
}
```

- [ ] **Step 3: Enforce citations**

In `chat_service.ts`, when knowledge QA mode is active:

```ts
if (knowledgeMode && collectedCitations.length === 0) {
  yield {
    type: 'run-error',
    runId,
    message: '知识库问答未返回可验证来源，本次回答未标记为可信回答。',
    retryable: true,
  };
}
```

### V1.1 Task 4: Add Embedding Batch Flow

**Files:**
- Create: `desktop/src/main/ai/embedding_service.ts`
- Modify: `multi_platform_core/src/services/knowledge_service.rs`
- Modify: `desktop/src/main/knowledge/ipc.ts`

- [ ] **Step 1: Implement embedding service**

Use `embedMany`:

```ts
const { embeddings, usage } = await embedMany({
  model: embeddingModel,
  values: chunks.map((chunk) => chunk.contentText),
});
```

- [ ] **Step 2: Store vectors**

Write vectors into existing `knowledge_embeddings` with `provider`, `model`, `dimension`, and `vector_blob`.

- [ ] **Step 3: Add rebuild action**

Expose a knowledge AI action that rebuilds embeddings for current library or space. The action is explicit user-triggered only.

### V1.1 Task 5: Build Citation UI

**Files:**
- Create: `desktop/src/windows/main/pages/AI/AiCitationList.vue`
- Modify: `desktop/src/windows/main/pages/AI/AiMessageItem.vue`
- Modify: `desktop/src/windows/main/pages/AI/AiComposer.vue`

- [ ] **Step 1: Add search toggle**

`AiComposer.vue` exposes:

```ts
const searchMode = ref<AiWebSearchMode>('off');
```

Use segmented control labels:

```text
关闭 | 自动 | 强制搜索
```

- [ ] **Step 2: Render citations**

Show citation cards below assistant messages with source type, title, snippet, and open action.

- [ ] **Step 3: Verify V1.1**

Run:

```bash
pnpm --dir desktop run verify:ai-chat
pnpm --dir desktop run verify:ai-citations
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
```

## V1.2 Development Plan: Reasoning, Canvas, Structured Output

### V1.2 Entry Criteria

- V1.1 citation gates pass.
- `AiStreamEvent` supports citation and tool-call parts.
- The current AI Chat UI can render non-text run events.

### V1.2 Task 1: Add Reasoning Controls

**Files:**
- Modify: `desktop/src/contracts/ai.ts`
- Modify: `desktop/src/main/ai/chat_service.ts`
- Modify: `desktop/src/windows/main/pages/AI/AiComposer.vue`
- Modify: `desktop/src/windows/main/pages/AI/AiMessageItem.vue`

- [ ] **Step 1: Add reasoning setting**

```ts
export type AiReasoningLevel = 'off' | 'standard' | 'deep';

export interface AiChatRuntimeOptions {
  reasoningLevel: AiReasoningLevel;
  sendReasoningSummary: boolean;
}
```

- [ ] **Step 2: Map provider options**

```ts
function buildReasoningProviderOptions(providerKind: AiProviderKind, level: AiReasoningLevel) {
  if (level === 'off') return undefined;
  if (providerKind === 'openai') return { openai: { reasoningSummary: level === 'deep' ? 'detailed' : 'auto' } };
  if (providerKind === 'google') return { google: { thinkingConfig: { thinkingBudget: level === 'deep' ? 8192 : 2048 } } };
  return undefined;
}
```

- [ ] **Step 3: Render allowed reasoning summaries**

Only render parts emitted as reasoning or provider-approved summary. Do not invent chain-of-thought display.

### V1.2 Task 2: Add Canvas Panel And Patch Proposal

**Files:**
- Create: `desktop/src/windows/main/pages/AI/AiCanvasPanel.vue`
- Create: `desktop/src/main/ai/tools/canvas_patch_tool.ts`
- Modify: `desktop/src/contracts/ai.ts`
- Modify: `desktop/src/windows/main/pages/AI/AiChatPage.vue`

- [ ] **Step 1: Define patch schema**

```ts
export interface AiCanvasPatch {
  targetCanvasId: string;
  baseRevision: string;
  operations: Array<
    | { type: 'replace-all'; content: string }
    | { type: 'replace-range'; start: number; end: number; content: string }
    | { type: 'insert'; index: number; content: string }
  >;
  summary: string;
}
```

- [ ] **Step 2: Implement proposal-only tool**

```ts
export function createCanvasPatchTool() {
  return tool({
    description: 'Propose a patch for the current canvas. Do not apply it.',
    inputSchema: AiCanvasPatchSchema,
    execute: async (patch) => ({
      patch,
      requiresUserConfirmation: true,
    }),
  });
}
```

- [ ] **Step 3: Render diff and confirmation**

`AiCanvasPanel.vue` must show the patch summary and operations before applying. Confirmed patches update only local Canvas state in V1.2; saving to knowledge is a separate explicit button.

### V1.2 Task 3: Structured Output And Fallback

**Files:**
- Create: `desktop/src/main/ai/structured_output.ts`
- Modify: `desktop/src/main/ai/title_service.ts`
- Modify: `desktop/src/main/ai/provider_registry.ts`

- [ ] **Step 1: Use structured title generation**

Use AI SDK structured output for title:

```ts
const result = await generateObject({
  model,
  schema: z.object({ title: z.string().min(1).max(40) }),
  prompt: `为以下对话生成一个中文短标题：\n${content}`,
});
```

- [ ] **Step 2: Add optional fallback model chain**

Represent fallback config as:

```ts
export interface AiModelFallbackConfig {
  primaryModelId: string;
  fallbackModelIds: string[];
  retryOn: Array<'rate-limit' | 'timeout' | 'server-error'>;
}
```

Do not retry on user abort.

### V1.2 Task 4: Verify V1.2

Run:

```bash
pnpm --dir desktop run verify:ai-chat
pnpm --dir desktop run verify:ai-citations
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
git diff --check
```

Manual checks:

- Reasoning control is disabled for models without reasoning capability.
- Canvas patch never writes without user confirmation.
- Fallback does not run after `stopRun()`.

## V1.3 Development Plan: Deep Research

### V1.3 Entry Criteria

- V1.1 web search and knowledge search tools work.
- V1.2 structured output utilities work.
- Citation persistence and UI are stable.

### V1.3 Task 1: Add Research Tables And Service

**Files:**
- Create: `multi_platform_core/migrations/0XX_add_ai_research.sql`
- Modify: `multi_platform_core/src/models/ai.rs`
- Modify: `multi_platform_core/src/services/ai_service.rs`
- Create: `desktop/src/main/ai/research/research_job_service.ts`
- Create: `desktop/src/main/ai/research/research_pipeline.ts`

- [ ] **Step 1: Add research migration**

```sql
CREATE TABLE IF NOT EXISTS ai_research_jobs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    status TEXT NOT NULL,
    topic TEXT NOT NULL,
    plan_json TEXT,
    report_message_id TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_research_jobs_status
    ON ai_research_jobs(status, updated_at);
```

- [ ] **Step 2: Add research states**

```ts
export type AiResearchJobStatus =
  | 'planning'
  | 'searching'
  | 'reading'
  | 'synthesizing'
  | 'citation-checking'
  | 'complete'
  | 'failed'
  | 'cancelled';
```

### V1.3 Task 2: Implement Research Pipeline

**Files:**
- Modify: `desktop/src/main/ai/research/research_pipeline.ts`

- [ ] **Step 1: Define plan schema**

```ts
export const ResearchPlanSchema = z.object({
  objective: z.string(),
  questions: z.array(z.string()),
  searchQueries: z.array(z.string()),
  requiredSources: z.array(z.string()).optional(),
  excludedSources: z.array(z.string()).optional(),
  outputFormat: z.enum(['brief', 'standard', 'long-report']),
});
```

- [ ] **Step 2: Implement stages**

Use:

```ts
await generateObject({ model, schema: ResearchPlanSchema, prompt });
await streamText({ model, tools: { webSearch, knowledgeSearch }, stopWhen: stepCountIs(6), messages });
await streamText({ model, system: reportSystemPrompt, messages: synthesisMessages });
await generateObject({ model, schema: CitationCheckSchema, prompt: reportWithCitations });
```

- [ ] **Step 3: Support cancellation**

Use one `AbortController` per research job and persist status `cancelled` when aborted.

### V1.3 Task 3: Build Research UI

**Files:**
- Create: `desktop/src/windows/main/pages/AI/AiResearchPanel.vue`
- Modify: `desktop/src/windows/main/stores/ai_research_store.ts`
- Modify: `desktop/src/windows/main/pages/AI/AiChatPage.vue`

- [ ] **Step 1: Show job progress**

Render stages:

```text
规划问题 -> 搜索资料 -> 阅读来源 -> 综合报告 -> 引用校验 -> 完成
```

- [ ] **Step 2: Show source list and report**

Display source cards as citations and final report as Markdown.

- [ ] **Step 3: Save report to knowledge**

Use existing knowledge APIs to create a new page. Never overwrite an existing page in V1.3.

### V1.3 Task 4: Verify V1.3

Run:

```bash
pnpm --dir desktop run verify:ai-chat
pnpm --dir desktop run verify:ai-citations
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml ai
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
```

Manual checks:

- Research job can be cancelled during search.
- Failed job keeps partial sources and error message.
- Saved report creates a new knowledge page.

## V2.0 Development Plan: General Agent

### V2.0 Entry Criteria

- Chat, search, Canvas, and research event surfaces are stable.
- `AiStreamEvent` supports tool call events.
- V1.1 read-only tools and V1.2 proposal tools exist.

### V2.0 Task 1: Add Agent Tables And Contracts

**Files:**
- Create: `multi_platform_core/migrations/0XX_add_ai_agent.sql`
- Modify: `desktop/src/contracts/ai.ts`
- Modify: `multi_platform_core/src/models/ai.rs`
- Modify: `multi_platform_core/src/services/ai_service.rs`

- [ ] **Step 1: Add migration**

```sql
CREATE TABLE IF NOT EXISTS ai_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    enabled_tools_json TEXT NOT NULL,
    safety_policy_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_agent_runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    conversation_id TEXT,
    status TEXT NOT NULL,
    goal TEXT NOT NULL,
    step_count INTEGER NOT NULL DEFAULT 0,
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_tool_invocations (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    message_id TEXT,
    tool_name TEXT NOT NULL,
    input_json TEXT NOT NULL,
    output_json TEXT,
    status TEXT NOT NULL,
    approval_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
);
```

- [ ] **Step 2: Add Agent contracts**

```ts
export interface AiAgentConfig {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  providerId: string;
  modelId: string;
  enabledTools: string[];
  safetyPolicy: AiAgentSafetyPolicy;
}

export interface AiAgentSafetyPolicy {
  maxSteps: number;
  requireApprovalForWriteTools: boolean;
  requireApprovalForShell: boolean;
  allowedReadRoots: string[];
  allowedWriteRoots: string[];
}
```

### V2.0 Task 2: Implement Tool Registry And Approvals

**Files:**
- Create: `desktop/src/main/ai/tools/tool_registry.ts`
- Create: `desktop/src/main/ai/tools/approvals.ts`
- Create: `desktop/scripts/verify-ai-agent-tools.cjs`
- Modify: `desktop/package.json`

- [ ] **Step 1: Register tools**

Tools:

```text
knowledge_search
web_search
read_text_file
write_text_file_proposal
create_knowledge_page_proposal
create_todo_proposal
canvas_patch_proposal
shell_command_proposal
```

- [ ] **Step 2: Enforce proposal-only writes**

Write tools return `AiWriteProposal`:

```ts
export interface AiWriteProposal {
  id: string;
  kind: 'knowledge-page' | 'todo' | 'file' | 'canvas';
  title: string;
  diff?: string;
  payload: unknown;
  createdByRunId: string;
}
```

- [ ] **Step 3: Add verifier**

The verifier checks that dangerous tool files contain `proposal` and do not call direct write APIs without approval wrappers.

### V2.0 Task 3: Implement Agent Loop

**Files:**
- Create: `desktop/src/main/ai/general_agent_service.ts`
- Modify: `desktop/src/main/ai/ipc.ts`
- Create: `desktop/src/windows/main/pages/AI/AiAgentPanel.vue`

- [ ] **Step 1: Use AI SDK step loop**

```ts
const result = streamText({
  model,
  system: agent.systemPrompt,
  messages,
  tools: selectedTools,
  stopWhen: stepCountIs(agent.safetyPolicy.maxSteps),
  prepareStep: async ({ stepNumber }) => ({
    activeTools: resolveActiveTools(agent, stepNumber),
  }),
  onStepFinish: async (step) => {
    await agentRunService.recordStep(runId, step);
  },
});
```

- [ ] **Step 2: Add approval pause**

When a tool requires approval, persist invocation with `approval_status = 'pending'`, emit `tool-call-start`, and stop before executing side effects.

- [ ] **Step 3: Add resume**

When approved, append the tool result or approval result back into the model message flow and continue the run.

### V2.0 Task 4: Verify V2.0

Run:

```bash
pnpm --dir desktop run verify:ai-agent
pnpm --dir desktop run verify:ai-chat
pnpm --dir desktop run verify:ai-citations
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml ai
```

Manual checks:

- Write proposal cannot apply without user approval.
- Rejected tool call is visible in run history.
- Agent stops at max step count.

## V2.1 Development Plan: Code Agent

### V2.1 Entry Criteria

- General Agent and Chat are stable.
- The app has a working Agent UI event renderer.
- User explicitly chooses Code Agent mode.

### V2.1 Task 1: Add Codex SDK Integration

**Files:**
- Modify: `desktop/package.json`
- Create: `desktop/src/main/ai/code_agent/codex_agent_service.ts`
- Create: `desktop/src/main/ai/code_agent/codex_events.ts`
- Modify: `desktop/src/main/ai/ipc.ts`

- [ ] **Step 1: Install Codex SDK**

Run:

```bash
pnpm --dir desktop add @openai/codex-sdk
```

- [ ] **Step 2: Implement environment check**

Check API key, SDK availability, and selected working directory before creating a thread.

- [ ] **Step 3: Keep Code Agent separate**

Do not route Code Agent model calls through Vercel AI SDK. The service owns Codex SDK thread lifecycle and maps Codex events into display events.

### V2.1 Task 2: Build Code Agent UI

**Files:**
- Create: `desktop/src/windows/main/pages/AI/AiCodeAgentPanel.vue`
- Create: `desktop/src/windows/main/pages/AI/AiCodeAgentEventList.vue`
- Create: `desktop/src/windows/main/pages/AI/AiCodeAgentDiffViewer.vue`

- [ ] **Step 1: Add project directory picker**

Use existing shell directory selection API from preload.

- [ ] **Step 2: Render events**

Render:

```text
文本输出
工具调用
文件变更
命令执行
usage 统计
```

- [ ] **Step 3: Verify V2.1**

Run:

```bash
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
```

Manual checks:

- Code Agent mode does not appear as a normal Chat Provider.
- Closing a Code Agent session does not stop normal Chat conversations.

## Commit Slicing

Recommended commit slices:

1. `feat(ai): establish AI chat contracts and provider config`
2. `feat(ai): persist AI chat conversations`
3. `feat(ai): stream chat responses through Vercel AI SDK`
4. `feat(ai): add AI chat renderer surface`
5. `feat(ai): add cited web and knowledge answers`
6. `feat(ai): add reasoning and canvas proposals`
7. `feat(ai): add deep research jobs`
8. `feat(ai): add controlled general agent tools`
9. `feat(ai): add codex code agent surface`

Each commit should use the repository Lore commit protocol when committed.

## Final Verification By Version

### V1.0

```bash
pnpm --dir desktop run verify:ai-chat
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml ai
```

### V1.1

```bash
pnpm --dir desktop run verify:ai-chat
pnpm --dir desktop run verify:ai-citations
pnpm --dir desktop run verify:knowledge-editor
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
```

### V1.2

```bash
pnpm --dir desktop run verify:ai-chat
pnpm --dir desktop run verify:ai-citations
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
git diff --check
```

### V1.3

```bash
pnpm --dir desktop run verify:ai-chat
pnpm --dir desktop run verify:ai-citations
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml ai
cargo test --manifest-path multi_platform_core/Cargo.toml knowledge
```

### V2.0

```bash
pnpm --dir desktop run verify:ai-agent
pnpm --dir desktop run verify:ai-chat
pnpm --dir desktop run verify:ai-citations
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
cargo test --manifest-path multi_platform_core/Cargo.toml ai
```

### V2.1

```bash
pnpm --dir desktop run lint
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
pnpm --dir desktop run build:app
```

## Self-Review

Spec coverage:

- V1.0 covers Provider configuration, model management, streaming chat, stop, retry, persistence, Markdown rendering, and API key renderer isolation.
- V1.1 covers web search, citations, current-space knowledge QA, and embedding reuse through existing knowledge AI tables.
- V1.2 covers reasoning controls, Canvas proposal flow, structured output, and fallback behavior.
- V1.3 covers deep research planning, search, synthesis, citation checking, cancellation, and report saving.
- V2.0 covers General Agent config, tools, approvals, loop control, persistence, and replay.
- V2.1 covers Code Agent as a separate Codex SDK surface.

Placeholder scan:

- No implementation task uses unresolved placeholder wording.
- Migration numbers use `0XX` because the next migration number must be chosen at implementation time from the current migration directory; this is an intentional sequencing instruction, not a missing design detail.

Type consistency:

- `AiProviderKind`, `AiModelConfig`, `AiStreamEvent`, `AiCitation`, `AiCanvasPatch`, `AiAgentConfig`, and `AiWriteProposal` are introduced before later tasks use them.
- The V1.1 and V2.0 tool plans use the same `AiStreamEvent` tool-call event family introduced in the shared baseline.

## References

- Vercel AI SDK: https://vercel.com/ai-sdk
- AI SDK `streamText`: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
- AI SDK `createProviderRegistry`: https://v5.ai-sdk.dev/docs/reference/ai-sdk-core/provider-registry
- AI SDK embeddings: https://ai-sdk.dev/docs/ai-sdk-core/embeddings
- AI SDK UI `useChat`: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
