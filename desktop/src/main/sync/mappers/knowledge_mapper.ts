import { createHash } from 'node:crypto';
import type {
  KnowledgeAsset,
  KnowledgeLibrary,
  KnowledgeLink,
  KnowledgeNode,
  KnowledgePage,
  KnowledgePageDetail,
  KnowledgeSpace,
  KnowledgeTag,
} from '@/contracts/knowledge';
import type { SyncObjectEnvelope } from '@/contracts/sync';

export interface KnowledgeSyncSnapshot {
  libraries?: KnowledgeLibrary[];
  spaces?: KnowledgeSpace[];
  nodes?: KnowledgeNode[];
  pages?: KnowledgePage[];
  pageDetails?: KnowledgePageDetail[];
  assets?: KnowledgeAsset[];
  tags?: KnowledgeTag[];
  links?: KnowledgeLink[];
}

export interface KnowledgeSyncExport {
  objects: SyncObjectEnvelope[];
}

export function exportKnowledgeForSync(
  snapshot: KnowledgeSyncSnapshot,
  input: {
    ownerDeviceId: string;
    updatedAt?: number;
  },
): KnowledgeSyncExport {
  const updatedAt = input.updatedAt ?? Date.now();
  return {
    objects: [
      ...(snapshot.libraries ?? []).map((library) =>
        createEnvelope('knowledge.library', library.id, input.ownerDeviceId, sanitizeKnowledgeLibrary(library), updatedAt)),
      ...(snapshot.spaces ?? []).map((space) =>
        createEnvelope('knowledge.space', space.id, input.ownerDeviceId, sanitizeKnowledgeSpace(space), updatedAt)),
      ...(snapshot.nodes ?? [])
        .filter((node) => node.nodeType === 'folder')
        .map((folder) =>
          createEnvelope('knowledge.folder', folder.id, input.ownerDeviceId, sanitizeKnowledgeFolder(folder), updatedAt)),
      ...(snapshot.pageDetails ?? []).map((detail) =>
        createEnvelope('knowledge.page', detail.page.id, input.ownerDeviceId, sanitizeKnowledgePageDetail(detail), updatedAt)),
      ...(snapshot.pages ?? []).map((page) =>
        createEnvelope('knowledge.page', page.id, input.ownerDeviceId, sanitizeKnowledgePage(page), updatedAt)),
      ...(snapshot.assets ?? []).map((asset) =>
        createEnvelope('knowledge.asset', asset.id, input.ownerDeviceId, sanitizeKnowledgeAsset(asset), updatedAt)),
      ...(snapshot.tags ?? []).map((tag) =>
        createEnvelope('knowledge.tag', tag.id, input.ownerDeviceId, sanitizeKnowledgeTag(tag), updatedAt)),
      ...(snapshot.links ?? []).map((link) =>
        createEnvelope('knowledge.link', link.id, input.ownerDeviceId, sanitizeKnowledgeLink(link), updatedAt)),
    ],
  };
}

export function getKnowledgeObjectTitle(object: SyncObjectEnvelope): string {
  const payload = object.payload as Record<string, unknown>;
  const name = typeof payload.name === 'string' ? payload.name : '';
  const title = typeof payload.title === 'string' ? payload.title : '';
  const originalName = typeof payload.originalName === 'string' ? payload.originalName : '';
  const node = typeof payload.node === 'object' && payload.node ? payload.node as Record<string, unknown> : null;
  const nodeTitle = typeof node?.title === 'string' ? node.title : '';
  return nodeTitle || title || name || originalName || object.objectId;
}

function sanitizeKnowledgeLibrary(library: KnowledgeLibrary) {
  return {
    id: library.id,
    name: library.name,
    description: library.description,
    isDefault: library.isDefault,
    createdAt: library.createdAt,
    updatedAt: library.updatedAt,
  };
}

function sanitizeKnowledgeSpace(space: KnowledgeSpace) {
  return {
    id: space.id,
    libraryId: space.libraryId,
    name: space.name,
    description: space.description,
    icon: space.icon,
    color: space.color,
    sortOrder: space.sortOrder,
    isDefault: space.isDefault,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
}

function sanitizeKnowledgeFolder(folder: KnowledgeNode) {
  return {
    id: folder.id,
    libraryId: folder.libraryId,
    spaceId: folder.spaceId,
    parentId: folder.parentId,
    nodeType: folder.nodeType,
    title: folder.title,
    icon: folder.icon,
    sortOrder: folder.sortOrder,
    isArchived: folder.isArchived,
    isFavorite: folder.isFavorite,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    deletedAt: folder.deletedAt,
  };
}

function sanitizeKnowledgePage(page: KnowledgePage) {
  return {
    id: page.id,
    pageType: page.pageType,
    contentMarkdown: page.contentMarkdown,
    contentJson: page.contentJson,
    contentText: page.contentText,
    propertiesJson: page.propertiesJson,
    sourceAssetId: page.sourceAssetId,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

function sanitizeKnowledgePageDetail(detail: KnowledgePageDetail) {
  return {
    node: sanitizeKnowledgeFolder(detail.node),
    page: sanitizeKnowledgePage(detail.page),
  };
}

function sanitizeKnowledgeAsset(asset: KnowledgeAsset) {
  return {
    id: asset.id,
    libraryId: asset.libraryId,
    hash: asset.hash,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    extension: asset.extension,
    sizeBytes: asset.sizeBytes,
    extractedText: asset.extractedText,
    metadataJson: asset.metadataJson,
    importStatus: asset.importStatus,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function sanitizeKnowledgeTag(tag: KnowledgeTag) {
  return {
    id: tag.id,
    libraryId: tag.libraryId,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
  };
}

function sanitizeKnowledgeLink(link: KnowledgeLink) {
  return {
    id: link.id,
    sourceType: link.sourceType,
    sourceId: link.sourceId,
    targetType: link.targetType,
    targetId: link.targetId,
    targetUrl: link.targetUrl,
    linkType: link.linkType,
    createdAt: link.createdAt,
  };
}

function createEnvelope<TPayload>(
  collection: SyncObjectEnvelope<TPayload>['collection'],
  objectId: string,
  ownerDeviceId: string,
  payload: TPayload,
  updatedAt: number,
): SyncObjectEnvelope<TPayload> {
  const body = JSON.stringify(payload);
  return {
    collection,
    objectId,
    ownerDeviceId,
    schemaVersion: 1,
    payloadHash: createHash('sha256').update(body).digest('hex'),
    payload,
    deleted: false,
    updatedAt,
  };
}
