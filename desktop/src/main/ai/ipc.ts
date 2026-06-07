import { BrowserWindow, ipcMain } from 'electron';
import type {
  AiStreamEvent,
  CreateAiConversationPayload,
  RegenerateAiMessagePayload,
  RebuildKnowledgeEmbeddingsPayload,
  SendAiMessagePayload,
  TestAiProviderPayload,
  UpdateAiConversationPayload,
  CreateAiCanvasVersionPayload,
  CreateAiCanvasWorkspacePayload,
  UpdateAiCanvasWorkspacePayload,
  UpsertAiCanvasFilePayload,
} from '@/contracts/ai';
import { aiCanvasService } from './canvas_service';
import { aiChatService } from './chat_service';
import { aiEmbeddingService } from './embedding_service';

let registered = false;
let unsubscribeStream: (() => void) | null = null;

export function registerAiIpcHandlers() {
  if (registered) {
    return;
  }

  ipcMain.handle('ai:get-config', async () => aiChatService.getSafeConfig());
  ipcMain.handle('ai:update-config', async (_event, patch) => aiChatService.updateConfig(patch));
  ipcMain.handle('ai:test-provider', async (_event, input: TestAiProviderPayload) => aiChatService.testProvider(input));
  ipcMain.handle('ai:list-conversations', async () => aiChatService.listConversations());
  ipcMain.handle('ai:create-conversation', async (_event, input: CreateAiConversationPayload) =>
    aiChatService.createConversation(input));
  ipcMain.handle('ai:update-conversation', async (_event, id: string, input: UpdateAiConversationPayload) =>
    aiChatService.updateConversation(id, input));
  ipcMain.handle('ai:delete-conversation', async (_event, id: string) => aiChatService.deleteConversation(id));
  ipcMain.handle('ai:list-messages', async (_event, conversationId: string) => aiChatService.listMessages(conversationId));
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

  unsubscribeStream = aiChatService.onStreamEvent((event) => {
    broadcastAiStreamEvent(event);
  });

  registered = true;
}

export function unregisterAiIpcHandlers() {
  unsubscribeStream?.();
  unsubscribeStream = null;
  registered = false;
}

function broadcastAiStreamEvent(event: AiStreamEvent) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('ai:stream-event', event);
    }
  }
}
