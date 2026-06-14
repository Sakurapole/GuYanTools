import { randomUUID } from 'node:crypto';
import { dbManager, JsDatabase } from '@/core/database';
import type {
  AiCanvasFile,
  AiCanvasMode,
  AiCanvasOperation,
  AiCanvasOperationStatus,
  AiCanvasOperationType,
  AiCanvasVersion,
  AiCanvasWorkspace,
  ApplyAiCanvasOperationResult,
  CreateAiCanvasOperationPayload,
  CreateAiCanvasVersionPayload,
  CreateAiCanvasWorkspacePayload,
  UpdateAiCanvasOperationPayload,
  UpdateAiCanvasWorkspacePayload,
  UpsertAiCanvasFilePayload,
} from '@/contracts/ai';

type AiCanvasDatabase = JsDatabase & {
  listAiCanvasWorkspaces: (conversationId: string) => Promise<Record<string, unknown>[]>;
  createAiCanvasWorkspace: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  updateAiCanvasWorkspace: (id: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  deleteAiCanvasWorkspace: (id: string) => Promise<void>;
  listAiCanvasFiles: (workspaceId: string) => Promise<Record<string, unknown>[]>;
  upsertAiCanvasFile: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  deleteAiCanvasFile: (workspaceId: string, path: string) => Promise<void>;
  listAiCanvasVersions: (workspaceId: string) => Promise<Record<string, unknown>[]>;
  createAiCanvasVersion: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  listAiCanvasOperations: (workspaceId: string) => Promise<Record<string, unknown>[]>;
  getAiCanvasOperation: (id: string) => Promise<Record<string, unknown>>;
  createAiCanvasOperation: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  updateAiCanvasOperation: (id: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

class AiCanvasService {
  async listWorkspaces(conversationId: string): Promise<AiCanvasWorkspace[]> {
    const rows = await this.db().listAiCanvasWorkspaces(conversationId);
    return rows.map(mapWorkspace);
  }

  async createWorkspace(input: CreateAiCanvasWorkspacePayload) {
    const workspace = mapWorkspace(await this.db().createAiCanvasWorkspace({
      id: randomUUID(),
      conversationId: input.conversationId,
      title: input.title.trim() || 'Canvas',
      mode: input.mode,
    }));

    const files: AiCanvasFile[] = [];
    for (const file of input.files?.length ? input.files : defaultFilesForMode(input.mode)) {
      files.push(await this.upsertFile({
        workspaceId: workspace.id,
        path: file.path,
        language: file.language,
        content: file.content,
      }, false));
    }

    const version = await this.createVersion({ workspaceId: workspace.id });
    const latestWorkspace = await this.updateWorkspace(workspace.id, { activeVersionId: version.id });
    return { workspace: latestWorkspace, files, version };
  }

  async updateWorkspace(id: string, input: UpdateAiCanvasWorkspacePayload): Promise<AiCanvasWorkspace> {
    return mapWorkspace(await this.db().updateAiCanvasWorkspace(id, {
      title: input.title,
      mode: input.mode,
      activeVersionId: input.activeVersionId,
    }));
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.db().deleteAiCanvasWorkspace(id);
  }

  async listFiles(workspaceId: string): Promise<AiCanvasFile[]> {
    const rows = await this.db().listAiCanvasFiles(workspaceId);
    return rows.map(mapFile);
  }

  async upsertFile(input: UpsertAiCanvasFilePayload, snapshot = true): Promise<AiCanvasFile> {
    const file = mapFile(await this.db().upsertAiCanvasFile({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      path: normalizePath(input.path),
      language: input.language || inferLanguage(input.path),
      content: input.content,
    }));
    if (snapshot) {
      const version = await this.createVersion({ workspaceId: input.workspaceId });
      await this.updateWorkspace(input.workspaceId, { activeVersionId: version.id });
    }
    return file;
  }

  async deleteFile(workspaceId: string, path: string, snapshot = true): Promise<void> {
    await this.db().deleteAiCanvasFile(workspaceId, normalizePath(path));
    if (snapshot) {
      const version = await this.createVersion({ workspaceId });
      await this.updateWorkspace(workspaceId, { activeVersionId: version.id });
    }
  }

  async listVersions(workspaceId: string): Promise<AiCanvasVersion[]> {
    const rows = await this.db().listAiCanvasVersions(workspaceId);
    return rows.map(mapVersion);
  }

  async createVersion(input: CreateAiCanvasVersionPayload): Promise<AiCanvasVersion> {
    const [files, versions] = await Promise.all([
      this.listFiles(input.workspaceId),
      this.listVersions(input.workspaceId),
    ]);
    const maxVersionNo = versions.reduce((max, version) => Math.max(max, version.versionNo), 0);
    return mapVersion(await this.db().createAiCanvasVersion({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      versionNo: maxVersionNo + 1,
      snapshotJson: JSON.stringify({
        files: files.map((file) => ({
          path: file.path,
          language: file.language,
          content: file.content,
        })),
      }),
      sourceMessageId: input.sourceMessageId,
    }));
  }

  async listOperations(workspaceId: string): Promise<AiCanvasOperation[]> {
    const rows = await this.db().listAiCanvasOperations(workspaceId);
    return rows.map(mapOperation);
  }

  async getOperation(id: string): Promise<AiCanvasOperation> {
    return mapOperation(await this.db().getAiCanvasOperation(id));
  }

  async createOperation(input: CreateAiCanvasOperationPayload): Promise<AiCanvasOperation> {
    return mapOperation(await this.db().createAiCanvasOperation({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      sourceMessageId: input.sourceMessageId,
      operationType: input.operationType,
      payloadJson: JSON.stringify(input.payload),
      status: input.status ?? 'applied',
    }));
  }

  async updateOperation(id: string, input: UpdateAiCanvasOperationPayload): Promise<AiCanvasOperation> {
    return mapOperation(await this.db().updateAiCanvasOperation(id, {
      payloadJson: input.payload ? JSON.stringify(input.payload) : undefined,
      status: input.status,
    }));
  }

  async applyOperation(id: string): Promise<ApplyAiCanvasOperationResult> {
    const operation = await this.getOperation(id);
    if (operation.status !== 'pending') {
      return {
        operation,
        files: await this.listFiles(operation.workspaceId),
      };
    }

    const payload = parseOperationPayload(operation.payloadJson);
    let version: AiCanvasVersion | undefined;

    if (operation.operationType === 'replace_file' || operation.operationType === 'patch_file') {
      const path = requirePayloadString(payload, 'path');
      const content = requirePayloadString(payload, 'content');
      await this.upsertFile({
        workspaceId: operation.workspaceId,
        path,
        language: optionalPayloadString(payload, 'language') ?? inferLanguage(path),
        content,
      }, false);
      version = await this.createVersion({
        workspaceId: operation.workspaceId,
        sourceMessageId: operation.sourceMessageId,
      });
    } else if (operation.operationType === 'append_file') {
      const path = normalizePath(requirePayloadString(payload, 'path'));
      const content = requirePayloadString(payload, 'content');
      const current = (await this.listFiles(operation.workspaceId)).find((file) => file.path === path);
      await this.upsertFile({
        workspaceId: operation.workspaceId,
        path,
        language: optionalPayloadString(payload, 'language') ?? current?.language ?? inferLanguage(path),
        content: `${current?.content ?? ''}${content}`,
      }, false);
      version = await this.createVersion({
        workspaceId: operation.workspaceId,
        sourceMessageId: operation.sourceMessageId,
      });
    } else if (operation.operationType === 'delete_file') {
      const path = requirePayloadString(payload, 'path');
      await this.deleteFile(operation.workspaceId, path, false);
      version = await this.createVersion({
        workspaceId: operation.workspaceId,
        sourceMessageId: operation.sourceMessageId,
      });
    }

    const applied = await this.updateOperation(id, { status: 'applied' });
    return {
      operation: applied,
      files: await this.listFiles(operation.workspaceId),
      version,
    };
  }

  async rejectOperation(id: string): Promise<AiCanvasOperation> {
    const operation = await this.getOperation(id);
    if (operation.status === 'applied') {
      throw new Error('已应用的 Canvas 操作不能拒绝');
    }
    return this.updateOperation(id, { status: 'rejected' });
  }

  private db(): AiCanvasDatabase {
    return dbManager.getDatabase() as AiCanvasDatabase;
  }
}

export const aiCanvasService = new AiCanvasService();

export function normalizeCanvasMode(value: unknown): AiCanvasMode {
  return value === 'html' || value === 'react' ? value : 'markdown';
}

export function normalizeCanvasOperationType(value: unknown): AiCanvasOperationType {
  if (
    value === 'create'
    || value === 'replace_file'
    || value === 'patch_file'
    || value === 'append_file'
    || value === 'delete_file'
  ) {
    return value;
  }
  return 'replace_file';
}

export function normalizeCanvasOperationStatus(value: unknown): AiCanvasOperationStatus {
  return value === 'pending' || value === 'rejected' ? value : 'applied';
}

function mapWorkspace(row: Record<string, unknown>): AiCanvasWorkspace {
  return {
    id: String(readField(row, 'id')),
    conversationId: String(readField(row, 'conversationId', 'conversation_id')),
    title: String(readField(row, 'title') ?? 'Canvas'),
    mode: normalizeCanvasMode(readField(row, 'mode')),
    activeVersionId: optionalString(readField(row, 'activeVersionId', 'active_version_id')),
    createdAt: String(readField(row, 'createdAt', 'created_at')),
    updatedAt: String(readField(row, 'updatedAt', 'updated_at')),
  };
}

function mapFile(row: Record<string, unknown>): AiCanvasFile {
  return {
    id: String(readField(row, 'id')),
    workspaceId: String(readField(row, 'workspaceId', 'workspace_id')),
    path: String(readField(row, 'path')),
    language: String(readField(row, 'language') ?? inferLanguage(String(readField(row, 'path')))),
    content: String(readField(row, 'content') ?? ''),
    createdAt: String(readField(row, 'createdAt', 'created_at')),
    updatedAt: String(readField(row, 'updatedAt', 'updated_at')),
  };
}

function mapVersion(row: Record<string, unknown>): AiCanvasVersion {
  return {
    id: String(readField(row, 'id')),
    workspaceId: String(readField(row, 'workspaceId', 'workspace_id')),
    versionNo: Number(readField(row, 'versionNo', 'version_no') ?? 0),
    snapshotJson: String(readField(row, 'snapshotJson', 'snapshot_json') ?? '{}'),
    sourceMessageId: optionalString(readField(row, 'sourceMessageId', 'source_message_id')),
    createdAt: String(readField(row, 'createdAt', 'created_at')),
  };
}

function mapOperation(row: Record<string, unknown>): AiCanvasOperation {
  return {
    id: String(readField(row, 'id')),
    workspaceId: String(readField(row, 'workspaceId', 'workspace_id')),
    sourceMessageId: optionalString(readField(row, 'sourceMessageId', 'source_message_id')),
    operationType: normalizeCanvasOperationType(readField(row, 'operationType', 'operation_type')),
    payloadJson: String(readField(row, 'payloadJson', 'payload_json') ?? '{}'),
    status: normalizeCanvasOperationStatus(readField(row, 'status')),
    createdAt: String(readField(row, 'createdAt', 'created_at')),
  };
}

function defaultFilesForMode(mode: AiCanvasMode) {
  if (mode === 'html') {
    return [{ path: 'index.html', language: 'html', content: '<!doctype html>\n<html>\n<body>\n  <h1>Canvas</h1>\n</body>\n</html>' }];
  }
  if (mode === 'react') {
    return [{ path: 'App.jsx', language: 'javascript', content: 'export default function App() {\n  return <h1>Canvas</h1>;\n}\n' }];
  }
  return [{ path: 'README.md', language: 'markdown', content: '# Canvas\n' }];
}

function normalizePath(path: string) {
  const normalized = path.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized || 'README.md';
}

function inferLanguage(path: string) {
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.jsx') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.ts')) return 'javascript';
  return 'markdown';
}

function readField(row: Record<string, unknown>, camelKey: string, snakeKey?: string) {
  return row[camelKey] ?? (snakeKey ? row[snakeKey] : undefined);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseOperationPayload(payloadJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function requirePayloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string') {
    throw new Error(`Canvas 操作缺少 ${key}`);
  }
  return value;
}

function optionalPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
