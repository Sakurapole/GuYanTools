const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

const checks = [
  ['desktop/src/contracts/ai.ts', ['AiApi', 'AiProviderConfig', 'AiStreamEvent', 'RegenerateAiMessagePayload', 'AiGroundingOptions', 'AiReasoningOptions', 'RebuildKnowledgeEmbeddingsPayload', 'AiCanvasWorkspace', 'AiCanvasRunOptions', 'canvas-workspace', 'AiInteractionMode', 'AiAgentMode', 'AiCodexAgentReservedSettings', 'AiGeneralAgentReservedSettings']],
  ['desktop/src/main/ai/chat_service.ts', ['streamText', 'resolveLanguageModel', 'aiChatService', 'regenerateMessage', 'resolveGroundingContext', 'mergeKnowledgeResults', 'buildReasoningProviderOptions', 'createCanvasTools', 'stepCountIs']],
  ['desktop/src/main/ai/canvas_service.ts', ['aiCanvasService', 'createWorkspace', 'upsertFile', 'createVersion', 'createOperation']],
  ['desktop/src/main/ai/embedding_service.ts', ['embedMany', 'rebuildKnowledgeEmbeddings', 'getKnowledgeEmbeddingStats', 'searchKnowledge', 'cosineSimilarity']],
  ['desktop/src/main/ai/tools/grounding_service.ts', ['tool(', 'knowledgeSearch', 'webSearch', 'resolveGroundingContext']],
  ['desktop/src/main/ai/tools/canvas_tools.ts', ['tool(', 'canvasCreate', 'canvasReplaceFile', 'canvasAppendFile', 'buildCanvasSystemInstruction']],
  ['desktop/src/main/ai/ipc.ts', ['ai:get-config', 'ai:send-message', 'ai:regenerate-message', 'ai:rebuild-knowledge-embeddings', 'ai:list-canvas-workspaces', 'ai:upsert-canvas-file', 'ai:stream-event']],
  ['desktop/src/preload.ts', ['contextBridge.exposeInMainWorld(\'aiApi\'', 'ai:regenerate-message', 'ai:rebuild-knowledge-embeddings', 'ai:list-canvas-workspaces', 'ai:upsert-canvas-file', 'ai:stream-event']],
  ['desktop/src/windows/main/routes/router.ts', ['../pages/AI/AiChatPage.vue']],
  ['desktop/src/windows/main/pages/AI/AiChatPage.vue', ['AiWorkspaceSidebar', 'AiAssistantSettingsDialog', 'AiMessageList', 'AiCanvasPanel', 'AiAgentReservedPanel', 'aiPageMode']],
  ['desktop/src/windows/main/pages/AI/components/AiAgentReservedPanel.vue', ['Agent 工作区', 'defaultAgentMode', 'requireApprovalForWriteTools', '等待 Codex SDK 接入']],
  ['desktop/src/windows/main/pages/AI/components/AiCanvasPanel.vue', ['AiCanvasPreview', 'createWorkspace', 'upsertFile', 'AI 操作']],
  ['desktop/src/windows/main/pages/AI/components/AiCanvasPreview.vue', ['sandbox="allow-scripts"', 'srcdoc', 'buildReactPreview', 'babel.min.js']],
  ['desktop/src/windows/main/pages/AI/components/AiWorkspaceSidebar.vue', ['searchQuery', 'configureAssistant', 'renameConversation', 'pinConversation']],
  ['desktop/src/windows/main/pages/AI/components/AiAssistantSettingsDialog.vue', ['模型设置', '提示词设置', 'MCP 服务器', '全局记忆']],
  ['desktop/src/windows/main/pages/AI/components/AiMessageItem.vue', ['marked', 'sanitizeKnowledgeMarkdownHtml', 'regenerate', '引用来源', '思考过程']],
  ['desktop/src/windows/main/stores/ai_canvas_store.ts', ['useAiCanvasStore', 'canvas-workspace', 'activeWorkspaceIdByConversation']],
  ['multi_platform_core/migrations/024_add_ai_chat.sql', ['ai_chat_conversations', 'ai_chat_messages', 'ai_canvas_workspaces', 'ai_canvas_files', 'ai_canvas_versions', 'ai_canvas_operations']],
  ['multi_platform_core/src/services/ai_service.rs', ['AiService', 'create_conversation', 'insert_message', 'create_canvas_workspace', 'upsert_canvas_file', 'create_canvas_version']],
  ['multi_platform_core/src/services/knowledge_service.rs', ['upsert_embedding', 'embedding_stats', 'list_embedding_candidates']],
  ['multi_platform_core/src/bindings/napi.rs', ['createAiConversation', 'listAiMessages', 'upsertKnowledgeEmbedding', 'getKnowledgeEmbeddingStats', 'listKnowledgeEmbeddingCandidates', 'createAiCanvasWorkspace', 'upsertAiCanvasFile']],
];

let failed = false;

for (const [relativePath, needles] of checks) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[ai-chat] missing file: ${relativePath}`);
    failed = true;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  for (const needle of needles) {
    if (!content.includes(needle)) {
      console.error(`[ai-chat] ${relativePath} missing marker: ${needle}`);
      failed = true;
    }
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'desktop/package.json'), 'utf8'));
for (const dependency of ['ai', '@ai-sdk/openai', '@ai-sdk/anthropic', '@ai-sdk/google', '@ai-sdk/openai-compatible', '@ai-sdk/vue', 'zod']) {
  if (!packageJson.dependencies?.[dependency]) {
    console.error(`[ai-chat] missing dependency: ${dependency}`);
    failed = true;
  }
}

const chatService = fs.readFileSync(path.join(root, 'desktop/src/main/ai/chat_service.ts'), 'utf8');
for (const marker of ['provider_id:', 'model_id:', 'system_prompt:', 'conversation_id:', 'parent_message_id:', 'token_usage_json:']) {
  if (chatService.includes(marker)) {
    console.error(`[ai-chat] chat_service.ts must pass camelCase fields to napi-rs, found: ${marker}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('[ai-chat] static integration checks passed');
