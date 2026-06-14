import { BrowserWindow, ipcMain } from 'electron';
import type {
  AiCanvasPreviewPayload,
  AiResearchEvent,
  FetchAiProviderModelsPayload,
  GetModelScopeMcpServerPayload,
  AiStreamEvent,
  ListModelScopeMcpServersPayload,
  CreateAiConversationPayload,
  CreateAiMemoryPayload,
  CreateAiProjectPayload,
  RegenerateAiMessagePayload,
  RebuildKnowledgeEmbeddingsPayload,
  SendAiMessagePayload,
  StageAiChatAttachmentPayload,
  StartAiResearchPayload,
  RetryAiResearchPayload,
  ListAiMemoriesPayload,
  ListAiResearchJobsPayload,
  TestAiProviderPayload,
  UpdateAiConversationPayload,
  UpdateAiMemoryPayload,
  UpdateAiProjectPayload,
  CreateAiCanvasVersionPayload,
  CreateAiCanvasWorkspacePayload,
  UpdateAiCanvasOperationPayload,
  UpdateAiCanvasWorkspacePayload,
  UpsertAiCanvasFilePayload,
} from '@/contracts/ai';
import { aiAttachmentService } from './attachment_service';
import { showAiCanvasPreviewWindow } from './canvas_preview_window';
import { aiCanvasService } from './canvas_service';
import { aiChatService } from './chat_service';
import { aiEmbeddingService } from './embedding_service';
import { aiMcpService } from './mcp_service';
import { aiResearchJobService } from './research_job_service';

let registered = false;
let unsubscribeStream: (() => void) | null = null;
let unsubscribeResearch: (() => void) | null = null;

export function registerAiIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('ai:get-config', async () => aiChatService.getSafeConfig());
  ipcMain.handle('ai:update-config', async (_event, patch) => aiChatService.updateConfig(patch));
  ipcMain.handle('ai:test-provider', async (_event, input: TestAiProviderPayload) => aiChatService.testProvider(input));
  ipcMain.handle('ai:fetch-provider-models', async (_event, input: FetchAiProviderModelsPayload) =>
    aiChatService.fetchProviderModels(input));
  ipcMain.handle('ai:list-modelscope-mcp-servers', async (_event, input: ListModelScopeMcpServersPayload) =>
    aiMcpService.listModelScopeServers(input));
  ipcMain.handle('ai:get-modelscope-mcp-server', async (_event, input: GetModelScopeMcpServerPayload) =>
    aiMcpService.getModelScopeServer(input));
  ipcMain.handle('ai:get-mcp-server-statuses', async () => aiMcpService.getStatuses());
  ipcMain.handle('ai:start-mcp-server', async (_event, serverId: string) => aiMcpService.startServer(serverId));
  ipcMain.handle('ai:stop-mcp-server', async (_event, serverId: string) => aiMcpService.stopServer(serverId));
  ipcMain.handle('ai:list-mcp-tools', async () => aiMcpService.listTools());
  ipcMain.handle('ai:list-conversations', async () => aiChatService.listConversations());
  ipcMain.handle('ai:create-conversation', async (_event, input: CreateAiConversationPayload) =>
    aiChatService.createConversation(input));
  ipcMain.handle('ai:update-conversation', async (_event, id: string, input: UpdateAiConversationPayload) =>
    aiChatService.updateConversation(id, input));
  ipcMain.handle('ai:delete-conversation', async (_event, id: string) => aiChatService.deleteConversation(id));
  ipcMain.handle('ai:list-projects', async () => aiChatService.listProjects());
  ipcMain.handle('ai:create-project', async (_event, input: CreateAiProjectPayload) =>
    aiChatService.createProject(input));
  ipcMain.handle('ai:update-project', async (_event, id: string, input: UpdateAiProjectPayload) =>
    aiChatService.updateProject(id, input));
  ipcMain.handle('ai:delete-project', async (_event, id: string) => aiChatService.deleteProject(id));
  ipcMain.handle('ai:list-memories', async (_event, input?: ListAiMemoriesPayload) =>
    aiChatService.listMemories(input));
  ipcMain.handle('ai:create-memory', async (_event, input: CreateAiMemoryPayload) =>
    aiChatService.createMemory(input));
  ipcMain.handle('ai:update-memory', async (_event, id: string, input: UpdateAiMemoryPayload) =>
    aiChatService.updateMemory(id, input));
  ipcMain.handle('ai:delete-memory', async (_event, id: string) => aiChatService.deleteMemory(id));
  ipcMain.handle('ai:list-messages', async (_event, conversationId: string) => aiChatService.listMessages(conversationId));
  ipcMain.handle('ai:stage-attachment', async (_event, input: StageAiChatAttachmentPayload) =>
    aiAttachmentService.stageAttachment(input));
  ipcMain.handle('ai:send-message', async (_event, input: SendAiMessagePayload) => aiChatService.sendMessage(input));
  ipcMain.handle('ai:regenerate-message', async (_event, input: RegenerateAiMessagePayload) =>
    aiChatService.regenerateMessage(input));
  ipcMain.handle('ai:stop-run', async (_event, runId: string) => aiChatService.stopRun(runId));
  ipcMain.handle('ai:get-knowledge-embedding-stats', async (_event, input?: RebuildKnowledgeEmbeddingsPayload) =>
    aiEmbeddingService.getKnowledgeEmbeddingStats(input));
  ipcMain.handle('ai:rebuild-knowledge-embeddings', async (_event, input?: RebuildKnowledgeEmbeddingsPayload) =>
    aiEmbeddingService.rebuildKnowledgeEmbeddings(input));
  ipcMain.handle('ai:list-canvas-workspaces', async (_event, conversationId: string) =>
    aiCanvasService.listWorkspaces(conversationId));
  ipcMain.handle('ai:create-canvas-workspace', async (_event, input: CreateAiCanvasWorkspacePayload) =>
    aiCanvasService.createWorkspace(input));
  ipcMain.handle('ai:update-canvas-workspace', async (_event, id: string, input: UpdateAiCanvasWorkspacePayload) =>
    aiCanvasService.updateWorkspace(id, input));
  ipcMain.handle('ai:delete-canvas-workspace', async (_event, id: string) => aiCanvasService.deleteWorkspace(id));
  ipcMain.handle('ai:list-canvas-files', async (_event, workspaceId: string) => aiCanvasService.listFiles(workspaceId));
  ipcMain.handle('ai:upsert-canvas-file', async (_event, input: UpsertAiCanvasFilePayload) =>
    aiCanvasService.upsertFile(input));
  ipcMain.handle('ai:delete-canvas-file', async (_event, workspaceId: string, path: string) =>
    aiCanvasService.deleteFile(workspaceId, path));
  ipcMain.handle('ai:list-canvas-versions', async (_event, workspaceId: string) =>
    aiCanvasService.listVersions(workspaceId));
  ipcMain.handle('ai:create-canvas-version', async (_event, input: CreateAiCanvasVersionPayload) =>
    aiCanvasService.createVersion(input));
  ipcMain.handle('ai:list-canvas-operations', async (_event, workspaceId: string) =>
    aiCanvasService.listOperations(workspaceId));
  ipcMain.handle('ai:update-canvas-operation', async (_event, id: string, input: UpdateAiCanvasOperationPayload) =>
    aiCanvasService.updateOperation(id, input));
  ipcMain.handle('ai:apply-canvas-operation', async (_event, id: string) => aiCanvasService.applyOperation(id));
  ipcMain.handle('ai:reject-canvas-operation', async (_event, id: string) => aiCanvasService.rejectOperation(id));
  ipcMain.handle('ai:open-canvas-preview', async (event, input: AiCanvasPreviewPayload) => {
    await showAiCanvasPreviewWindow(input, BrowserWindow.fromWebContents(event.sender));
  });
  ipcMain.handle('ai:list-research-jobs', async (_event, input?: ListAiResearchJobsPayload) =>
    aiResearchJobService.listJobs(input));
  ipcMain.handle('ai:get-research-job', async (_event, jobId: string) => aiResearchJobService.getJob(jobId));
  ipcMain.handle('ai:list-research-sources', async (_event, jobId: string) => aiResearchJobService.listSources(jobId));
  ipcMain.handle('ai:start-research', async (_event, input: StartAiResearchPayload) =>
    aiResearchJobService.startResearch(input));
  ipcMain.handle('ai:retry-research', async (_event, input: RetryAiResearchPayload) =>
    aiResearchJobService.retryResearch(input));
  ipcMain.handle('ai:cancel-research', async (_event, jobId: string) => aiResearchJobService.cancelResearch(jobId));

  unsubscribeStream = aiChatService.onStreamEvent((event) => {
    broadcastAiStreamEvent(event);
  });
  unsubscribeResearch = aiResearchJobService.onResearchEvent((event) => {
    broadcastAiResearchEvent(event);
  });

  registered = true;
}

export function unregisterAiIpcHandlers() {
  unsubscribeStream?.();
  unsubscribeStream = null;
  unsubscribeResearch?.();
  unsubscribeResearch = null;
  registered = false;
}

function broadcastAiStreamEvent(event: AiStreamEvent) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('ai:stream-event', event);
    }
  }
}

function broadcastAiResearchEvent(event: AiResearchEvent) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('ai:research-event', event);
    }
  }
}
