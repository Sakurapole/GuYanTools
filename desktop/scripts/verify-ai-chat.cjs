const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

const checks = [
  ['desktop/src/contracts/ai.ts', ['AiApi', 'AiProviderConfig', 'AiStreamEvent', 'AiResearchJob', 'AiResearchSource', 'AiResearchEvent', 'StartAiResearchPayload', 'RegenerateAiMessagePayload', 'AiGroundingOptions', 'AiReasoningOptions', 'RebuildKnowledgeEmbeddingsPayload', 'AiCanvasWorkspace', 'AiCanvasRunOptions', 'canvas-workspace', 'AiChatAttachment', 'StageAiChatAttachmentPayload', 'AiInteractionMode', 'AiAgentMode', 'AiCodexAgentReservedSettings', 'AiGeneralAgentReservedSettings', 'UpdateAiCanvasOperationPayload', 'ApplyAiCanvasOperationResult', 'applyCanvasOperation', 'rejectCanvasOperation', 'AiProject', 'AiMemory', 'CreateAiMemoryPayload', 'AiMcpToolSummary', 'mcpMode']],
  ['desktop/src/main/ai/chat_service.ts', ['streamText', 'resolveLanguageModel', 'aiChatService', 'regenerateMessage', 'resolveGroundingContext', 'mergeKnowledgeResults', 'filterKnowledgeResultsByScope', 'buildReasoningProviderOptions', 'createCanvasTools', 'createMcpReadTools', 'stepCountIs', 'chat-attachment', 'buildUserMessageContent', 'knowledgeSearchMode === \'force\'', '未返回可验证的知识库来源', 'resolveMemoryContext', '显式记忆']],
  ['desktop/src/main/ai/attachment_service.ts', ['aiAttachmentService', 'stageAttachment', 'MAX_TEXT_ATTACHMENT_BYTES', 'MAX_IMAGE_ATTACHMENT_BYTES']],
  ['desktop/src/main/ai/research_job_service.ts', ['aiResearchJobService', 'runPipeline', 'resolveGroundingContext', 'research-source', 'citation_check']],
  ['desktop/src/main/ai/canvas_service.ts', ['aiCanvasService', 'createWorkspace', 'upsertFile', 'createVersion', 'createOperation', 'applyOperation', 'rejectOperation']],
  ['desktop/src/main/ai/embedding_service.ts', ['embedMany', 'rebuildKnowledgeEmbeddings', 'getKnowledgeEmbeddingStats', 'searchKnowledge', 'cosineSimilarity']],
  ['desktop/src/main/ai/tools/grounding_service.ts', ['tool(', 'knowledgeSearch', 'webSearch', 'resolveGroundingContext']],
  ['desktop/src/main/ai/tools/canvas_tools.ts', ['tool(', 'canvasCreate', 'canvasReplaceFile', 'canvasAppendFile', 'buildCanvasSystemInstruction', 'status: \'pending\'', '不要声称已经应用']],
  ['desktop/src/main/ai/tools/mcp_tools.ts', ['createMcpReadTools', 'mcpRead', 'read-only MCP']],
  ['desktop/src/main/ai/mcp_service.ts', ['aiMcpService', 'listModelScopeServers', 'getModelScopeServer', 'startServer', 'listTools', 'callReadTool', 'isReadOnlyToolName']],
  ['desktop/src/main/ai/ipc.ts', ['ai:get-config', 'ai:fetch-provider-models', 'ai:stage-attachment', 'ai:start-research', 'ai:cancel-research', 'ai:research-event', 'ai:send-message', 'ai:regenerate-message', 'ai:rebuild-knowledge-embeddings', 'ai:list-canvas-workspaces', 'ai:upsert-canvas-file', 'ai:apply-canvas-operation', 'ai:reject-canvas-operation', 'ai:list-projects', 'ai:create-memory', 'ai:list-mcp-tools', 'ai:open-canvas-preview', 'ai:stream-event']],
  ['desktop/src/main/ai/canvas_preview_window.ts', ['showAiCanvasPreviewWindow', 'ai_canvas_preview.html', 'ai:canvas-preview-payload']],
  ['desktop/src/preload.ts', ['contextBridge.exposeInMainWorld(\'aiApi\'', 'ai:fetch-provider-models', 'ai:stage-attachment', 'ai:start-research', 'ai:research-event', 'ai:regenerate-message', 'ai:rebuild-knowledge-embeddings', 'ai:list-canvas-workspaces', 'ai:upsert-canvas-file', 'ai:apply-canvas-operation', 'ai:reject-canvas-operation', 'ai:list-projects', 'ai:create-memory', 'ai:list-mcp-tools', 'ai:open-canvas-preview', 'aiCanvasPreviewWindowApi', 'ai:stream-event']],
  ['desktop/src/windows/main/routes/router.ts', ['../pages/AI/AiChatPage.vue']],
  ['desktop/src/windows/main/pages/AI/AiChatPage.vue', ['AiWorkspaceSidebar', 'AiAssistantSettingsDialog', 'AiMessageList', 'AiResearchPanel', 'AiCanvasPanel', 'AiContextPanel', 'AiAgentReservedPanel', 'aiPageMode']],
  ['desktop/src/windows/main/pages/AI/components/AiContextPanel.vue', ['项目与记忆', 'createMemory', 'deleteMemory', '使用全局记忆']],
  ['desktop/src/windows/main/pages/AI/components/AiResearchPanel.vue', ['Deep Research', 'startResearch', 'cancelJob', 'saveReportToKnowledge']],
  ['desktop/src/windows/main/stores/ai_research_store.ts', ['useAiResearchStore', 'onResearchEvent', 'startResearch', 'cancelResearch']],
  ['desktop/src/windows/main/stores/ai_context_store.ts', ['useAiContextStore', 'createProject', 'createMemory', 'updateMemory', 'deleteMemory']],
  ['desktop/src/windows/main/pages/Knowledge/KnowledgePage.vue', ['knowledgeAiScope', 'askKnowledgeAi', 'knowledgeSearchMode: \'force\'', 'openKnowledgeAiCitation', 'saveKnowledgeAiAnswerAsPage']],
  ['desktop/src/windows/main/pages/AI/components/AiAgentReservedPanel.vue', ['Agent 工作区', 'defaultAgentMode', 'requireApprovalForWriteTools', '等待 Codex SDK 接入']],
  ['desktop/src/windows/main/pages/AI/components/AiCanvasPanel.vue', ['openPreviewWindow', 'createWorkspace', 'upsertFile', 'AI 操作', 'applyOperation', 'rejectOperation', '待确认']],
  ['desktop/src/windows/main/pages/AI/components/AiCanvasPreview.vue', ['sandbox="allow-scripts"', 'srcdoc', 'buildReactPreview', 'babel.min.js']],
  ['desktop/src/windows/ai-canvas-preview/App.vue', ['AiCanvasPreview', 'aiCanvasPreviewWindowApi', 'Canvas Preview']],
  ['desktop/ai_canvas_preview.html', ['ai-canvas-preview-app', '/src/windows/ai-canvas-preview/main.ts']],
  ['desktop/src/windows/main/pages/AI/components/AiWorkspaceSidebar.vue', ['searchQuery', 'configureAssistant', 'renameConversation', 'pinConversation']],
  ['desktop/src/windows/main/pages/AI/components/AiAssistantSettingsDialog.vue', ['模型设置', '提示词设置', 'MCP 服务器', '全局记忆']],
  ['desktop/src/windows/main/pages/AI/components/AiMessageItem.vue', ['marked', 'sanitizeKnowledgeMarkdownHtml', 'regenerate', '引用来源', '思考过程']],
  ['desktop/src/windows/main/stores/ai_canvas_store.ts', ['useAiCanvasStore', 'canvas-workspace', 'activeWorkspaceIdByConversation', 'applyOperation', 'rejectOperation']],
  ['multi_platform_core/migrations/024_add_ai_chat.sql', ['ai_chat_conversations', 'ai_chat_messages', 'ai_canvas_workspaces', 'ai_canvas_files', 'ai_canvas_versions', 'ai_canvas_operations']],
  ['multi_platform_core/migrations/025_add_ai_canvas_tables.sql', ['ai_canvas_workspaces', 'ai_canvas_files', 'ai_canvas_versions', 'ai_canvas_operations']],
  ['multi_platform_core/migrations/026_add_ai_research_tables.sql', ['ai_research_jobs', 'ai_research_sources']],
  ['multi_platform_core/migrations/027_add_ai_memory_projects.sql', ['ai_projects', 'ai_memories', 'project_id']],
  ['multi_platform_core/src/services/ai_service.rs', ['AiService', 'create_conversation', 'insert_message', 'create_canvas_workspace', 'upsert_canvas_file', 'create_canvas_version', 'update_canvas_operation', 'create_project', 'create_memory', 'create_research_job', 'insert_research_source']],
  ['multi_platform_core/src/services/knowledge_service.rs', ['upsert_embedding', 'embedding_stats', 'list_embedding_candidates']],
  ['multi_platform_core/src/bindings/napi.rs', ['createAiConversation', 'listAiMessages', 'upsertKnowledgeEmbedding', 'getKnowledgeEmbeddingStats', 'listKnowledgeEmbeddingCandidates', 'createAiCanvasWorkspace', 'upsertAiCanvasFile', 'updateAiCanvasOperation', 'createAiProject', 'createAiMemory']],
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
