import { app, dialog, ipcMain, shell } from 'electron';
import { createHash } from 'node:crypto';
import { constants as fsConstants, createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { dbManager, JsDatabase } from '../../core/database';
import { appConfigManager } from '../app-config/manager';
import { extractKnowledgeText } from './text_extractor';
import type {
  BindKnowledgeTagPayload,
  ClearKnowledgePreviewCacheResult,
  ConvertKnowledgeQuickNoteToPagePayload,
  CreateKnowledgeAssetPayload,
  CreateKnowledgeFolderPayload,
  CreateKnowledgeLibraryPayload,
  CreateKnowledgePagePayload,
  CreateKnowledgeQuickNotePayload,
  CreateKnowledgeSpacePayload,
  CreateKnowledgeTagPayload,
  ImportKnowledgeDocumentPayload,
  ImportKnowledgeDocumentResult,
  ImportKnowledgeFilesPayload,
  ImportKnowledgeFilesResult,
  KnowledgeAsset,
  KnowledgeBacklink,
  KnowledgeGraph,
  KnowledgeGraphPayload,
  KnowledgeIndexJob,
  KnowledgeLibrary,
  KnowledgeLink,
  KnowledgeNode,
  KnowledgePageDetail,
  KnowledgeQuickNoteDetail,
  KnowledgeSearchPayload,
  KnowledgeSearchResult,
  KnowledgeSpace,
  KnowledgeTag,
  KnowledgeTaggedTarget,
  LinkKnowledgeTodoPayload,
  ListKnowledgeIndexJobsPayload,
  ListKnowledgeOrphanPagesPayload,
  ListKnowledgeQuickNotesPayload,
  ListKnowledgeTagTargetsPayload,
  ListKnowledgeTagsPayload,
  ListKnowledgeTreePayload,
  MoveKnowledgeNodePayload,
  SaveKnowledgeAssetPayload,
  UnbindKnowledgeTagPayload,
  UpdateKnowledgeNodePayload,
  UpdateKnowledgePagePayload,
  UpdateKnowledgeQuickNotePayload,
  UpdateKnowledgeTagPayload,
} from '@/contracts/knowledge';

let registered = false;
let previewCachePruneUnsubscribe: (() => void) | undefined;
let previewCachePruneTask: Promise<void> | undefined;

type KnowledgeDatabase = JsDatabase & {
  listKnowledgeLibraries: () => Promise<KnowledgeLibrary[]>;
  createKnowledgeLibrary: (input: CreateKnowledgeLibraryPayload) => Promise<KnowledgeLibrary>;
  listKnowledgeSpaces: (libraryId?: string) => Promise<KnowledgeSpace[]>;
  createKnowledgeSpace: (input: CreateKnowledgeSpacePayload) => Promise<KnowledgeSpace>;
  listKnowledgeTree: (input?: ListKnowledgeTreePayload) => Promise<KnowledgeNode[]>;
  createKnowledgeFolder: (input: CreateKnowledgeFolderPayload) => Promise<KnowledgeNode>;
  createKnowledgePage: (input: CreateKnowledgePagePayload) => Promise<KnowledgePageDetail>;
  getKnowledgePage: (pageId: string) => Promise<KnowledgePageDetail>;
  updateKnowledgePage: (pageId: string, input: UpdateKnowledgePagePayload) => Promise<KnowledgePageDetail>;
  listKnowledgeQuickNotes: (input?: ListKnowledgeQuickNotesPayload) => Promise<KnowledgeQuickNoteDetail[]>;
  createKnowledgeQuickNote: (input: CreateKnowledgeQuickNotePayload) => Promise<KnowledgeQuickNoteDetail>;
  updateKnowledgeQuickNote: (noteId: string, input: UpdateKnowledgeQuickNotePayload) => Promise<KnowledgeQuickNoteDetail>;
  archiveKnowledgeQuickNote: (noteId: string) => Promise<KnowledgeQuickNoteDetail>;
  convertKnowledgeQuickNoteToPage: (noteId: string, input: ConvertKnowledgeQuickNoteToPagePayload) => Promise<KnowledgePageDetail>;
  linkKnowledgeQuickNoteTodo: (noteId: string, todoId: string) => Promise<KnowledgeQuickNoteDetail>;
  createKnowledgeAsset: (input: CreateKnowledgeAssetPayload) => Promise<KnowledgeAsset>;
  getKnowledgeAsset: (assetId: string) => Promise<KnowledgeAsset>;
  importKnowledgeDocument: (input: ImportKnowledgeDocumentPayload) => Promise<ImportKnowledgeDocumentResult>;
  listKnowledgeIndexJobs: (input?: ListKnowledgeIndexJobsPayload) => Promise<KnowledgeIndexJob[]>;
  getKnowledgeIndexJob: (jobId: string) => Promise<KnowledgeIndexJob>;
  cancelKnowledgeIndexJob: (jobId: string) => Promise<KnowledgeIndexJob>;
  searchKnowledge: (input: KnowledgeSearchPayload) => Promise<KnowledgeSearchResult[]>;
  listKnowledgeTags: (input?: ListKnowledgeTagsPayload) => Promise<KnowledgeTag[]>;
  createKnowledgeTag: (input: CreateKnowledgeTagPayload) => Promise<KnowledgeTag>;
  updateKnowledgeTag: (tagId: string, input: UpdateKnowledgeTagPayload) => Promise<KnowledgeTag>;
  bindKnowledgeTag: (input: BindKnowledgeTagPayload) => Promise<KnowledgeTag>;
  unbindKnowledgeTag: (input: UnbindKnowledgeTagPayload) => Promise<void>;
  listKnowledgeTagTargets: (input: ListKnowledgeTagTargetsPayload) => Promise<KnowledgeTaggedTarget[]>;
  listKnowledgePageLinks: (pageId: string) => Promise<KnowledgeLink[]>;
  listKnowledgeBacklinks: (pageId: string) => Promise<KnowledgeBacklink[]>;
  linkKnowledgeTodoSource: (input: LinkKnowledgeTodoPayload) => Promise<void>;
  getKnowledgeGraph: (input: KnowledgeGraphPayload) => Promise<KnowledgeGraph>;
  listKnowledgeOrphanPages: (input?: ListKnowledgeOrphanPagesPayload) => Promise<KnowledgeNode[]>;
  moveKnowledgeNode: (nodeId: string, input: MoveKnowledgeNodePayload) => Promise<KnowledgeNode>;
  updateKnowledgeNode: (nodeId: string, input: UpdateKnowledgeNodePayload) => Promise<KnowledgeNode>;
  archiveKnowledgeNode: (nodeId: string) => Promise<KnowledgeNode>;
  toggleKnowledgeFavorite: (nodeId: string, favorite: boolean) => Promise<KnowledgeNode>;
  deleteKnowledgeNode: (nodeId: string) => Promise<void>;
};

function db() {
  return dbManager.getDatabase() as KnowledgeDatabase;
}

const mimeExtensionMap: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/markdown': '.md',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

const extensionMimeMap: Record<string, string> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function normalizeExtension(originalName: string, mimeType?: string) {
  const fromName = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  if (fromName) return fromName;
  return mimeType ? mimeExtensionMap[mimeType] ?? '' : '';
}

function normalizeFileName(originalName: string, fallbackExtension: string) {
  const name = originalName.trim() || `asset-${Date.now()}${fallbackExtension}`;
  return Array.from(name)
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char))
    .join('')
    .slice(0, 160);
}

function normalizePathSegment(value?: string) {
  return (value || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'default';
}

async function getKnowledgeConfig() {
  return (await appConfigManager.getConfig()).features.knowledge;
}

type KnowledgeFeatureConfig = Awaited<ReturnType<typeof getKnowledgeConfig>>;

function importLimitBytes(maxImportFileSizeMb: number) {
  return Math.max(1, maxImportFileSizeMb) * 1024 * 1024;
}

async function getAssetRoot(libraryId?: string) {
  const config = await getKnowledgeConfig();
  const baseDir = config.assetStorageMode === 'custom' && config.customAssetDirectory
    ? config.customAssetDirectory
    : path.join(app.getPath('userData'), 'knowledge-assets');
  return path.join(baseDir, normalizePathSegment(libraryId || config.defaultLibraryId));
}

async function getPreviewCacheRoots(config?: KnowledgeFeatureConfig) {
  const resolvedConfig = config ?? await getKnowledgeConfig();
  const roots = [path.join(app.getPath('userData'), 'knowledge-preview-cache')];
  if (resolvedConfig.assetStorageMode === 'custom' && resolvedConfig.customAssetDirectory) {
    roots.push(path.join(resolvedConfig.customAssetDirectory, '.preview-cache'));
  }
  return roots;
}

async function saveKnowledgeAsset(input: SaveKnowledgeAssetPayload) {
  const config = await getKnowledgeConfig();
  const bytes = Buffer.from(input.data);
  if (bytes.length === 0) {
    throw new Error('资产文件不能为空');
  }
  if (bytes.length > importLimitBytes(config.maxImportFileSizeMb)) {
    throw new Error(`文件超过知识库导入上限 ${config.maxImportFileSizeMb} MB`);
  }

  const extension = normalizeExtension(input.originalName, input.mimeType);
  const originalName = normalizeFileName(input.originalName, extension);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const libraryId = input.libraryId || config.defaultLibraryId || undefined;
  const assetDir = path.join(await getAssetRoot(libraryId), hash.slice(0, 2));
  await fs.mkdir(assetDir, { recursive: true });

  const storagePath = path.join(assetDir, `${hash}${extension}`);
  try {
    await fs.writeFile(storagePath, bytes, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }

  return db().createKnowledgeAsset({
    libraryId,
    hash,
    originalName,
    mimeType: input.mimeType || '',
    extension,
    sizeBytes: bytes.length,
    storagePath,
    importStatus: 'ready',
  });
}

async function chooseImportFiles() {
  const result = await dialog.showOpenDialog({
    title: '导入到知识库',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: '知识库支持文件',
        extensions: ['md', 'markdown', 'txt', 'pdf', 'docx', 'pptx', 'xlsx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
      },
      { name: '全部文件', extensions: ['*'] },
    ],
  });
  return result.canceled ? [] : result.filePaths;
}

function inferMimeType(filePath: string, fallback?: string) {
  const extension = path.extname(filePath).toLowerCase();
  return fallback || extensionMimeMap[extension] || 'application/octet-stream';
}

async function hashFile(filePath: string) {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function importKnowledgeFiles(input: ImportKnowledgeFilesPayload = {}): Promise<ImportKnowledgeFilesResult> {
  const config = await getKnowledgeConfig();
  const libraryId = input.libraryId || config.defaultLibraryId || undefined;
  const sourcePaths = input.paths?.length ? input.paths : await chooseImportFiles();
  const imported: ImportKnowledgeDocumentResult[] = [];
  const skipped: string[] = [];

  for (const sourcePath of sourcePaths) {
    try {
      const stat = await fs.stat(sourcePath);
      if (!stat.isFile()) {
        skipped.push(`${sourcePath}: 不是文件`);
        continue;
      }
      if (stat.size > importLimitBytes(config.maxImportFileSizeMb)) {
        skipped.push(`${sourcePath}: 文件超过知识库导入上限 ${config.maxImportFileSizeMb} MB`);
        continue;
      }

      const mimeType = inferMimeType(sourcePath);
      const extension = normalizeExtension(path.basename(sourcePath), mimeType);
      const originalName = normalizeFileName(path.basename(sourcePath), extension);
      const hash = await hashFile(sourcePath);
      const assetDir = path.join(await getAssetRoot(libraryId), hash.slice(0, 2));
      await fs.mkdir(assetDir, { recursive: true });
      const storagePath = path.join(assetDir, `${hash}${extension}`);
      try {
        await fs.copyFile(sourcePath, storagePath, fsConstants.COPYFILE_EXCL);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }

      const extraction = config.indexingEnabled
        ? await extractKnowledgeText(sourcePath, extension, mimeType)
        : null;
      const metadata = {
        originalPath: sourcePath,
        importedAt: new Date().toISOString(),
        extraction: extraction?.metadata ?? { extractor: 'disabled', previewKind: 'unsupported' },
        extractionStatus: extraction?.status ?? 'cancelled',
        extractionError: extraction?.errorMessage ?? (config.indexingEnabled ? undefined : '知识库索引已关闭'),
      };
      const result = await db().importKnowledgeDocument({
        libraryId,
        spaceId: input.spaceId,
        parentId: input.parentId,
        hash,
        originalName,
        mimeType,
        extension,
        sizeBytes: stat.size,
        storagePath,
        originalPath: sourcePath,
        extractedText: extraction?.text ?? '',
        metadataJson: JSON.stringify(metadata),
        extractionStatus: extraction?.status ?? 'cancelled',
        extractionError: extraction?.errorMessage ?? (config.indexingEnabled ? undefined : '知识库索引已关闭'),
      });
      imported.push(result);
    } catch (error) {
      skipped.push(`${sourcePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { imported, skipped };
}

async function retryKnowledgeIndexJob(jobId: string): Promise<ImportKnowledgeDocumentResult> {
  const config = await getKnowledgeConfig();
  const job = await db().getKnowledgeIndexJob(jobId);
  if (job.targetType !== 'asset') {
    throw new Error('当前只支持重试附件抽取任务');
  }

  const asset = await db().getKnowledgeAsset(job.targetId);
  const sourcePath = asset.originalPath || asset.storagePath;
  const stat = await fs.stat(sourcePath);
  if (!stat.isFile()) {
    throw new Error('原文件不存在或不可读取');
  }
  if (stat.size > importLimitBytes(config.maxImportFileSizeMb)) {
    throw new Error(`文件超过知识库导入上限 ${config.maxImportFileSizeMb} MB`);
  }

  const extraction = config.indexingEnabled
    ? await extractKnowledgeText(sourcePath, asset.extension, asset.mimeType)
    : null;
  const metadata = {
    originalPath: asset.originalPath,
    retriedAt: new Date().toISOString(),
    retryOfJobId: jobId,
    extraction: extraction?.metadata ?? { extractor: 'disabled', previewKind: 'unsupported' },
    extractionStatus: extraction?.status ?? 'cancelled',
    extractionError: extraction?.errorMessage ?? (config.indexingEnabled ? undefined : '知识库索引已关闭'),
  };

  return db().importKnowledgeDocument({
    libraryId: asset.libraryId,
    hash: asset.hash,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    extension: asset.extension,
    sizeBytes: asset.sizeBytes,
    storagePath: asset.storagePath,
    originalPath: asset.originalPath || sourcePath,
    extractedText: extraction?.text ?? '',
    metadataJson: JSON.stringify(metadata),
    extractionStatus: extraction?.status ?? 'cancelled',
    extractionError: extraction?.errorMessage ?? (config.indexingEnabled ? undefined : '知识库索引已关闭'),
  });
}

async function removePathIfExists(targetPath: string): Promise<{ files: number; bytes: number }> {
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      let files = 0;
      let bytes = 0;
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      for (const entry of entries) {
        const child = await removePathIfExists(path.join(targetPath, entry.name));
        files += child.files;
        bytes += child.bytes;
      }
      await fs.rm(targetPath, { recursive: true, force: true });
      return { files, bytes };
    }
    await fs.rm(targetPath, { force: true });
    return { files: 1, bytes: stat.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { files: 0, bytes: 0 };
    }
    throw error;
  }
}

async function pruneOldCachePath(targetPath: string, cutoffMs: number): Promise<{ files: number; bytes: number }> {
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      let files = 0;
      let bytes = 0;
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      for (const entry of entries) {
        const child = await pruneOldCachePath(path.join(targetPath, entry.name), cutoffMs);
        files += child.files;
        bytes += child.bytes;
      }
      try {
        await fs.rmdir(targetPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOTEMPTY' && code !== 'ENOENT') {
          throw error;
        }
      }
      return { files, bytes };
    }
    if (stat.mtimeMs >= cutoffMs) {
      return { files: 0, bytes: 0 };
    }
    await fs.rm(targetPath, { force: true });
    return { files: 1, bytes: stat.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { files: 0, bytes: 0 };
    }
    throw error;
  }
}

async function prunePreviewCacheByTtl(): Promise<{ files: number; bytes: number }> {
  const config = await getKnowledgeConfig();
  if (config.previewCacheTtlDays <= 0) {
    return { files: 0, bytes: 0 };
  }

  const cutoffMs = Date.now() - config.previewCacheTtlDays * 24 * 60 * 60 * 1000;
  let files = 0;
  let bytes = 0;
  for (const root of await getPreviewCacheRoots(config)) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        const pruned = await pruneOldCachePath(path.join(root, entry.name), cutoffMs);
        files += pruned.files;
        bytes += pruned.bytes;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return { files, bytes };
}

function schedulePreviewCachePrune() {
  if (previewCachePruneTask) {
    return;
  }
  previewCachePruneTask = (async () => {
    try {
      await prunePreviewCacheByTtl();
    } catch (error) {
      console.warn('[Knowledge] Failed to prune preview cache:', error);
    } finally {
      previewCachePruneTask = undefined;
    }
  })();
}

function registerPreviewCachePrune() {
  schedulePreviewCachePrune();
  if (previewCachePruneUnsubscribe) {
    return;
  }

  previewCachePruneUnsubscribe = appConfigManager.subscribe((_config, patch) => {
    const knowledgePatch = patch?.features?.knowledge;
    if (!knowledgePatch) {
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(knowledgePatch, 'previewCacheTtlDays') ||
      Object.prototype.hasOwnProperty.call(knowledgePatch, 'assetStorageMode') ||
      Object.prototype.hasOwnProperty.call(knowledgePatch, 'customAssetDirectory')
    ) {
      schedulePreviewCachePrune();
    }
  });
}

async function clearKnowledgePreviewCache(): Promise<ClearKnowledgePreviewCacheResult> {
  let removedFiles = 0;
  let removedBytes = 0;
  for (const root of await getPreviewCacheRoots()) {
    const removed = await removePathIfExists(root);
    removedFiles += removed.files;
    removedBytes += removed.bytes;
  }
  return { removedFiles, removedBytes };
}

export function registerKnowledgeIpcHandlers() {
  if (registered) return;
  registerPreviewCachePrune();

  ipcMain.handle('knowledge:list-libraries', async () => db().listKnowledgeLibraries());

  ipcMain.handle('knowledge:create-library', async (_event, input: CreateKnowledgeLibraryPayload) =>
    db().createKnowledgeLibrary(input),
  );

  ipcMain.handle('knowledge:list-spaces', async (_event, libraryId?: string) =>
    db().listKnowledgeSpaces(libraryId),
  );

  ipcMain.handle('knowledge:create-space', async (_event, input: CreateKnowledgeSpacePayload) =>
    db().createKnowledgeSpace(input),
  );

  ipcMain.handle('knowledge:list-tree', async (_event, input?: ListKnowledgeTreePayload) =>
    db().listKnowledgeTree(input),
  );

  ipcMain.handle('knowledge:create-folder', async (_event, input: CreateKnowledgeFolderPayload) =>
    db().createKnowledgeFolder(input),
  );

  ipcMain.handle('knowledge:create-page', async (_event, input: CreateKnowledgePagePayload) =>
    db().createKnowledgePage(input),
  );

  ipcMain.handle('knowledge:get-page', async (_event, pageId: string) => db().getKnowledgePage(pageId));

  ipcMain.handle('knowledge:update-page', async (
    _event,
    pageId: string,
    input: UpdateKnowledgePagePayload,
  ) => db().updateKnowledgePage(pageId, input));

  ipcMain.handle('knowledge:list-quick-notes', async (_event, input?: ListKnowledgeQuickNotesPayload) =>
    db().listKnowledgeQuickNotes(input),
  );

  ipcMain.handle('knowledge:create-quick-note', async (_event, input: CreateKnowledgeQuickNotePayload) =>
    db().createKnowledgeQuickNote(input),
  );

  ipcMain.handle('knowledge:update-quick-note', async (
    _event,
    noteId: string,
    input: UpdateKnowledgeQuickNotePayload,
  ) => db().updateKnowledgeQuickNote(noteId, input));

  ipcMain.handle('knowledge:archive-quick-note', async (_event, noteId: string) =>
    db().archiveKnowledgeQuickNote(noteId),
  );

  ipcMain.handle('knowledge:convert-quick-note-to-page', async (
    _event,
    noteId: string,
    input?: ConvertKnowledgeQuickNoteToPagePayload,
  ) => db().convertKnowledgeQuickNoteToPage(noteId, input ?? {}));

  ipcMain.handle('knowledge:link-quick-note-todo', async (_event, noteId: string, todoId: string) =>
    db().linkKnowledgeQuickNoteTodo(noteId, todoId),
  );

  ipcMain.handle('knowledge:save-asset', async (_event, input: SaveKnowledgeAssetPayload) =>
    saveKnowledgeAsset(input),
  );

  ipcMain.handle('knowledge:get-asset', async (_event, assetId: string) =>
    db().getKnowledgeAsset(assetId),
  );

  ipcMain.handle('knowledge:open-asset', async (_event, assetId: string) => {
    const asset = await db().getKnowledgeAsset(assetId);
    const result = await shell.openPath(asset.storagePath);
    if (result) {
      throw new Error(result);
    }
  });

  ipcMain.handle('knowledge:show-asset-in-folder', async (_event, assetId: string) => {
    const asset = await db().getKnowledgeAsset(assetId);
    shell.showItemInFolder(asset.storagePath);
  });

  ipcMain.handle('knowledge:import-files', async (_event, input?: ImportKnowledgeFilesPayload) =>
    importKnowledgeFiles(input),
  );

  ipcMain.handle('knowledge:list-index-jobs', async (_event, input?: ListKnowledgeIndexJobsPayload) =>
    db().listKnowledgeIndexJobs(input),
  );

  ipcMain.handle('knowledge:retry-index-job', async (_event, jobId: string) =>
    retryKnowledgeIndexJob(jobId),
  );

  ipcMain.handle('knowledge:cancel-index-job', async (_event, jobId: string) =>
    db().cancelKnowledgeIndexJob(jobId),
  );

  ipcMain.handle('knowledge:clear-preview-cache', async () =>
    clearKnowledgePreviewCache(),
  );

  ipcMain.handle('knowledge:search', async (_event, input: KnowledgeSearchPayload) =>
    db().searchKnowledge(input),
  );

  ipcMain.handle('knowledge:list-tags', async (_event, input?: ListKnowledgeTagsPayload) =>
    db().listKnowledgeTags(input),
  );

  ipcMain.handle('knowledge:create-tag', async (_event, input: CreateKnowledgeTagPayload) =>
    db().createKnowledgeTag(input),
  );

  ipcMain.handle('knowledge:update-tag', async (_event, tagId: string, input: UpdateKnowledgeTagPayload) =>
    db().updateKnowledgeTag(tagId, input),
  );

  ipcMain.handle('knowledge:bind-tag', async (_event, input: BindKnowledgeTagPayload) =>
    db().bindKnowledgeTag(input),
  );

  ipcMain.handle('knowledge:unbind-tag', async (_event, input: UnbindKnowledgeTagPayload) =>
    db().unbindKnowledgeTag(input),
  );

  ipcMain.handle('knowledge:list-tag-targets', async (_event, input: ListKnowledgeTagTargetsPayload) =>
    db().listKnowledgeTagTargets(input),
  );

  ipcMain.handle('knowledge:list-page-links', async (_event, pageId: string) =>
    db().listKnowledgePageLinks(pageId),
  );

  ipcMain.handle('knowledge:list-backlinks', async (_event, pageId: string) =>
    db().listKnowledgeBacklinks(pageId),
  );

  ipcMain.handle('knowledge:link-todo-source', async (_event, input: LinkKnowledgeTodoPayload) =>
    db().linkKnowledgeTodoSource(input),
  );

  ipcMain.handle('knowledge:get-graph', async (_event, input: KnowledgeGraphPayload) =>
    db().getKnowledgeGraph(input),
  );

  ipcMain.handle('knowledge:list-orphan-pages', async (_event, input?: ListKnowledgeOrphanPagesPayload) =>
    db().listKnowledgeOrphanPages(input),
  );

  ipcMain.handle('knowledge:move-node', async (
    _event,
    nodeId: string,
    input: MoveKnowledgeNodePayload,
  ) => db().moveKnowledgeNode(nodeId, input));

  ipcMain.handle('knowledge:update-node', async (
    _event,
    nodeId: string,
    input: UpdateKnowledgeNodePayload,
  ) => db().updateKnowledgeNode(nodeId, input));

  ipcMain.handle('knowledge:archive-node', async (_event, nodeId: string) =>
    db().archiveKnowledgeNode(nodeId),
  );

  ipcMain.handle('knowledge:toggle-favorite', async (_event, nodeId: string, favorite: boolean) =>
    db().toggleKnowledgeFavorite(nodeId, favorite),
  );

  ipcMain.handle('knowledge:delete-node', async (_event, nodeId: string) =>
    db().deleteKnowledgeNode(nodeId),
  );

  registered = true;
}
