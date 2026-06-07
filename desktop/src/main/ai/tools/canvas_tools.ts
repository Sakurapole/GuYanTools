import { tool } from 'ai';
import { z } from 'zod';
import type {
  AiCanvasFile,
  AiCanvasMode,
  AiCanvasOperation,
  AiCanvasWorkspace,
  AiStreamEvent,
} from '@/contracts/ai';
import { aiCanvasService } from '../canvas_service';

type CanvasToolEmitter = (event: AiStreamEvent) => void;

export interface CanvasToolContext {
  runId: string;
  conversationId: string;
  messageId: string;
  activeWorkspaceId?: string;
  emit: CanvasToolEmitter;
}

const canvasModeSchema = z.enum(['markdown', 'html', 'react']);
const canvasFileSchema = z.object({
  path: z.string().min(1),
  language: z.string().min(1),
  content: z.string(),
});

export function createCanvasTools(context: CanvasToolContext) {
  return {
    canvasCreate: tool({
      description: 'Create a Gemini-like Canvas workspace for editable documents, single HTML pages, or React single-file previews.',
      inputSchema: z.object({
        title: z.string().min(1),
        mode: canvasModeSchema,
        files: z.array(canvasFileSchema).min(1).max(6),
      }),
      execute: async (input) => {
        const result = await aiCanvasService.createWorkspace({
          conversationId: context.conversationId,
          title: input.title,
          mode: input.mode,
          files: input.files,
        });
        const operation = await aiCanvasService.createOperation({
          workspaceId: result.workspace.id,
          sourceMessageId: context.messageId,
          operationType: 'create',
          payload: {
            title: result.workspace.title,
            mode: result.workspace.mode,
            files: result.files.map((file) => file.path),
          },
        });
        emitWorkspace(context, result.workspace);
        for (const file of result.files) {
          emitFile(context, file);
        }
        emitOperation(context, operation);
        return summarizeWorkspace(result.workspace, result.files, operation);
      },
    }),
    canvasReplaceFile: tool({
      description: 'Replace one file inside the current Canvas workspace. Use this for complete rewrites of HTML, Markdown, or React content.',
      inputSchema: z.object({
        workspaceId: z.string().optional(),
        path: z.string().min(1),
        language: z.string().min(1),
        content: z.string(),
      }),
      execute: async (input) => {
        const workspaceId = resolveWorkspaceId(context, input.workspaceId);
        const file = await aiCanvasService.upsertFile({
          workspaceId,
          path: input.path,
          language: input.language,
          content: input.content,
        });
        const operation = await aiCanvasService.createOperation({
          workspaceId,
          sourceMessageId: context.messageId,
          operationType: 'replace_file',
          payload: { path: file.path, language: file.language },
        });
        emitFile(context, file);
        emitOperation(context, operation);
        return summarizeFile(file, operation);
      },
    }),
    canvasAppendFile: tool({
      description: 'Append content to one file inside the current Canvas workspace.',
      inputSchema: z.object({
        workspaceId: z.string().optional(),
        path: z.string().min(1),
        language: z.string().min(1),
        content: z.string(),
      }),
      execute: async (input) => {
        const workspaceId = resolveWorkspaceId(context, input.workspaceId);
        const current = (await aiCanvasService.listFiles(workspaceId)).find((file) => file.path === input.path);
        const file = await aiCanvasService.upsertFile({
          workspaceId,
          path: input.path,
          language: input.language,
          content: `${current?.content ?? ''}${input.content}`,
        });
        const operation = await aiCanvasService.createOperation({
          workspaceId,
          sourceMessageId: context.messageId,
          operationType: 'append_file',
          payload: { path: file.path, language: file.language, appendedLength: input.content.length },
        });
        emitFile(context, file);
        emitOperation(context, operation);
        return summarizeFile(file, operation);
      },
    }),
    canvasDeleteFile: tool({
      description: 'Delete one file from the current Canvas workspace.',
      inputSchema: z.object({
        workspaceId: z.string().optional(),
        path: z.string().min(1),
      }),
      execute: async (input) => {
        const workspaceId = resolveWorkspaceId(context, input.workspaceId);
        await aiCanvasService.deleteFile(workspaceId, input.path);
        const operation = await aiCanvasService.createOperation({
          workspaceId,
          sourceMessageId: context.messageId,
          operationType: 'delete_file',
          payload: { path: input.path },
        });
        emitOperation(context, operation);
        return { workspaceId, deletedPath: input.path, operationId: operation.id };
      },
    }),
  };
}

export function buildCanvasSystemInstruction(input: { mode?: AiCanvasMode; activeWorkspaceId?: string }) {
  return [
    'Canvas 已启用。Canvas 是用户右侧可编辑、可预览的工作区，不是聊天中的附件列表。',
    '当用户要求创建网页、HTML、React 页面、长文档、可迭代草稿或修改 Canvas 内容时，必须使用 Canvas 工具写入工作区。',
    'HTML 内容应优先写入 index.html。React 内容应优先写入 App.jsx，并默认导出 App 组件。',
    input.activeWorkspaceId
      ? `当前 Canvas workspaceId 是 ${input.activeWorkspaceId}。修改已有内容时优先使用这个 workspaceId。`
      : '如果需要 Canvas，请先调用 canvasCreate 创建工作区。',
    input.mode ? `用户当前偏好的 Canvas 模式是 ${input.mode}。` : '',
  ].filter(Boolean).join('\n');
}

function resolveWorkspaceId(context: CanvasToolContext, workspaceId?: string) {
  const resolved = workspaceId || context.activeWorkspaceId;
  if (!resolved) {
    throw new Error('No active Canvas workspace. Call canvasCreate first.');
  }
  return resolved;
}

function emitWorkspace(context: CanvasToolContext, workspace: AiCanvasWorkspace) {
  context.emit({
    type: 'canvas-workspace',
    runId: context.runId,
    conversationId: context.conversationId,
    workspace,
  });
}

function emitFile(context: CanvasToolContext, file: AiCanvasFile) {
  context.emit({
    type: 'canvas-file',
    runId: context.runId,
    workspaceId: file.workspaceId,
    file,
  });
}

function emitOperation(context: CanvasToolContext, operation: AiCanvasOperation) {
  context.emit({
    type: 'canvas-operation',
    runId: context.runId,
    workspaceId: operation.workspaceId,
    operation,
  });
}

function summarizeWorkspace(workspace: AiCanvasWorkspace, files: AiCanvasFile[], operation: AiCanvasOperation) {
  return {
    workspaceId: workspace.id,
    title: workspace.title,
    mode: workspace.mode,
    files: files.map((file) => ({ path: file.path, language: file.language })),
    operationId: operation.id,
  };
}

function summarizeFile(file: AiCanvasFile, operation: AiCanvasOperation) {
  return {
    workspaceId: file.workspaceId,
    path: file.path,
    language: file.language,
    length: file.content.length,
    operationId: operation.id,
  };
}
