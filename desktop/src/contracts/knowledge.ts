export type KnowledgeNodeType = 'folder' | 'page' | 'document' | 'quick_note';
export type KnowledgePageType = 'markdown' | 'block' | 'canvas' | 'external_document';
export type KnowledgeBlockType =
  | 'paragraph'
  | 'heading'
  | 'bullet_list'
  | 'ordered_list'
  | 'task_list'
  | 'code'
  | 'quote'
  | 'callout'
  | 'image'
  | 'attachment'
  | 'todo_reference'
  | 'page_reference';

export interface KnowledgeBlock {
  id: string;
  type: KnowledgeBlockType;
  text?: string;
  level?: number;
  language?: string;
  checked?: boolean;
  assetId?: string;
  assetName?: string;
  assetMimeType?: string;
  assetUrl?: string;
  todoId?: string;
  pageId?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeBlockDocument {
  type: 'guyantools.block-page';
  version: 1;
  blocks: KnowledgeBlock[];
  importedFromMarkdown?: boolean;
  updatedAt: string;
}

export type KnowledgeCanvasElementType = 'text' | 'image' | 'rect' | 'arrow' | 'path';

export interface KnowledgeCanvasPoint {
  x: number;
  y: number;
}

export interface KnowledgeCanvasElement {
  id: string;
  type: KnowledgeCanvasElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  points?: KnowledgeCanvasPoint[];
  assetId?: string;
  assetName?: string;
  assetMimeType?: string;
  assetUrl?: string;
  pageId?: string;
  todoId?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeCanvasDocument {
  type: 'guyantools.canvas-page';
  version: 1;
  width: number;
  height: number;
  elements: KnowledgeCanvasElement[];
  updatedAt: string;
}

export interface KnowledgeLibrary {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeLibraryPayload {
  name: string;
  description?: string;
}

export interface UpdateKnowledgeLibraryPayload {
  name?: string;
  description?: string;
}

export interface KnowledgeSpace {
  id: string;
  libraryId: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeSpacePayload {
  libraryId?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}

export interface UpdateKnowledgeSpacePayload {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}

export interface KnowledgeNode {
  id: string;
  libraryId: string;
  spaceId?: string;
  parentId?: string;
  nodeType: KnowledgeNodeType;
  title: string;
  icon?: string;
  sortOrder: number;
  isArchived: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ListKnowledgeTreePayload {
  libraryId?: string;
  spaceId?: string;
  parentId?: string;
  includeArchived?: boolean;
}

export interface CreateKnowledgeFolderPayload {
  libraryId?: string;
  spaceId?: string;
  parentId?: string;
  title: string;
  icon?: string;
  sortOrder?: number;
}

export interface KnowledgePage {
  id: string;
  pageType: KnowledgePageType;
  contentMarkdown: string;
  contentJson?: string;
  contentText: string;
  propertiesJson?: string;
  sourceAssetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgePageDetail {
  node: KnowledgeNode;
  page: KnowledgePage;
}

export interface KnowledgeQuickNote {
  id: string;
  libraryId: string;
  nodeId: string;
  title: string;
  body: string;
  tagsJson: string;
  color: KnowledgeQuickNoteColor;
  isPinned: boolean;
  convertedPageId?: string;
  convertedTodoId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeQuickNoteDetail {
  node: KnowledgeNode;
  quickNote: KnowledgeQuickNote;
}

export type KnowledgeQuickNoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'gray';

export interface ListKnowledgeQuickNotesPayload {
  libraryId?: string;
  query?: string;
  includeArchived?: boolean;
}

export interface CreateKnowledgeQuickNotePayload {
  libraryId?: string;
  title?: string;
  body: string;
  tagsJson?: string;
  color?: KnowledgeQuickNoteColor;
  isPinned?: boolean;
}

export interface UpdateKnowledgeQuickNotePayload {
  title?: string;
  body?: string;
  tagsJson?: string;
  color?: KnowledgeQuickNoteColor;
  isPinned?: boolean;
  convertedPageId?: string;
  convertedTodoId?: string;
}

export interface ConvertKnowledgeQuickNoteToPagePayload {
  title?: string;
}

export interface QuickNotePrefillPayload {
  body?: string;
  title?: string;
  tags?: string[];
  color?: KnowledgeQuickNoteColor;
}

export interface QuickNoteWindowApi {
  show: (prefill?: QuickNotePrefillPayload) => Promise<void>;
  create: (prefill?: QuickNotePrefillPayload) => Promise<void>;
  close: () => Promise<void>;
  dock: () => Promise<void>;
  collapse: () => Promise<void>;
  expand: () => Promise<void>;
  preview: (expanded: boolean) => Promise<void>;
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
  getWindowMeta: () => Promise<{ isPrimary: boolean }>;
  onPrefill: (listener: (payload: QuickNotePrefillPayload) => void) => () => void;
  onCollapsedState: (listener: (collapsed: boolean, previewing: boolean) => void) => () => void;
}

export interface KnowledgeAsset {
  id: string;
  libraryId: string;
  hash: string;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  storagePath: string;
  originalPath?: string;
  previewPath?: string;
  thumbnailPath?: string;
  extractedText: string;
  metadataJson?: string;
  importStatus: 'pending' | 'ready' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeAssetPayload {
  libraryId?: string;
  hash: string;
  originalName: string;
  mimeType?: string;
  extension?: string;
  sizeBytes: number;
  storagePath: string;
  originalPath?: string;
  previewPath?: string;
  thumbnailPath?: string;
  extractedText?: string;
  metadataJson?: string;
  importStatus?: 'pending' | 'ready' | 'failed';
}

export interface SaveKnowledgeAssetPayload {
  libraryId?: string;
  originalName: string;
  mimeType?: string;
  data: ArrayBuffer;
}

export type KnowledgeIndexJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type KnowledgeSearchSourceType = 'page' | 'document' | 'quick_note' | 'asset';

export interface KnowledgeIndexJob {
  id: string;
  jobType: string;
  targetType: string;
  targetId: string;
  status: KnowledgeIndexJobStatus;
  progress: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListKnowledgeIndexJobsPayload {
  targetType?: string;
  targetId?: string;
  status?: KnowledgeIndexJobStatus;
  limit?: number;
}

export interface ImportKnowledgeFilesPayload {
  libraryId?: string;
  spaceId?: string;
  parentId?: string;
  paths?: string[];
}

export interface ImportKnowledgeFilesResult {
  imported: ImportKnowledgeDocumentResult[];
  skipped: string[];
}

export interface ClearKnowledgePreviewCacheResult {
  removedFiles: number;
  removedBytes: number;
}

export interface ImportKnowledgeDocumentPayload {
  libraryId?: string;
  spaceId?: string;
  parentId?: string;
  hash: string;
  originalName: string;
  mimeType?: string;
  extension?: string;
  sizeBytes: number;
  storagePath: string;
  originalPath?: string;
  extractedText?: string;
  metadataJson?: string;
  extractionStatus?: KnowledgeIndexJobStatus;
  extractionError?: string;
}

export interface ImportKnowledgeDocumentResult {
  asset: KnowledgeAsset;
  document: KnowledgePageDetail;
  indexJob: KnowledgeIndexJob;
  duplicateAsset: boolean;
}

export interface KnowledgeSearchPayload {
  libraryId?: string;
  spaceId?: string;
  nodeId?: string;
  assetId?: string;
  query: string;
  sourceType?: KnowledgeSearchSourceType;
  limit?: number;
}

export interface KnowledgeSearchResult {
  sourceType: KnowledgeSearchSourceType;
  sourceId: string;
  nodeId?: string;
  assetId?: string;
  title: string;
  snippet: string;
  score: number;
  updatedAt: string;
}

export type KnowledgeTagTargetType = 'page' | 'asset' | 'quick_note' | 'todo';

export interface KnowledgeTag {
  id: string;
  libraryId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface ListKnowledgeTagsPayload {
  libraryId?: string;
  targetType?: KnowledgeTagTargetType;
  targetId?: string;
}

export interface CreateKnowledgeTagPayload {
  libraryId?: string;
  name: string;
  color?: string;
}

export interface UpdateKnowledgeTagPayload {
  name?: string;
  color?: string;
}

export interface BindKnowledgeTagPayload {
  tagId?: string;
  name?: string;
  color?: string;
  targetType: KnowledgeTagTargetType;
  targetId: string;
}

export interface UnbindKnowledgeTagPayload {
  tagId: string;
  targetType: KnowledgeTagTargetType;
  targetId: string;
}

export interface ListKnowledgeTagTargetsPayload {
  tagId: string;
  targetType?: KnowledgeTagTargetType;
  limit?: number;
}

export interface KnowledgeTaggedTarget {
  targetType: KnowledgeTagTargetType;
  targetId: string;
  title: string;
  nodeId?: string;
  assetId?: string;
  updatedAt: string;
}

export interface KnowledgeLink {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId?: string;
  targetUrl?: string;
  linkType: string;
  createdAt: string;
}

export interface KnowledgeBacklink {
  id: string;
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  sourceNodeId?: string;
  linkType: string;
  createdAt: string;
}

export interface LinkKnowledgeTodoPayload {
  pageId: string;
  todoId: string;
}

export interface KnowledgeGraphPayload {
  libraryId?: string;
  spaceId?: string;
  tagId?: string;
  limit?: number;
}

export interface KnowledgeGraphNode {
  id: string;
  targetType: string;
  targetId: string;
  title: string;
  subtitle?: string;
  color?: string;
  group: 'page' | 'document' | 'asset' | 'todo' | string;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  linkType: string;
  label?: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  truncated: boolean;
}

export interface ListKnowledgeOrphanPagesPayload {
  libraryId?: string;
  spaceId?: string;
  limit?: number;
}

export interface CreateKnowledgePagePayload {
  libraryId?: string;
  spaceId?: string;
  parentId?: string;
  title: string;
  pageType?: KnowledgePageType;
  contentMarkdown?: string;
  contentJson?: string;
  contentText?: string;
  propertiesJson?: string;
  sortOrder?: number;
}

export interface UpdateKnowledgePagePayload {
  title?: string;
  contentMarkdown?: string;
  contentJson?: string;
  contentText?: string;
  propertiesJson?: string;
  sortOrder?: number;
}

export interface MoveKnowledgeNodePayload {
  parentId?: string;
  sortOrder?: number;
}

export interface UpdateKnowledgeNodePayload {
  title?: string;
  icon?: string;
  sortOrder?: number;
}

export interface KnowledgeApi {
  listLibraries: () => Promise<KnowledgeLibrary[]>;
  createLibrary: (input: CreateKnowledgeLibraryPayload) => Promise<KnowledgeLibrary>;
  updateLibrary: (libraryId: string, input: UpdateKnowledgeLibraryPayload) => Promise<KnowledgeLibrary>;
  deleteLibrary: (libraryId: string) => Promise<void>;
  listSpaces: (libraryId?: string) => Promise<KnowledgeSpace[]>;
  createSpace: (input: CreateKnowledgeSpacePayload) => Promise<KnowledgeSpace>;
  updateSpace: (spaceId: string, input: UpdateKnowledgeSpacePayload) => Promise<KnowledgeSpace>;
  deleteSpace: (spaceId: string) => Promise<void>;
  listTree: (input?: ListKnowledgeTreePayload) => Promise<KnowledgeNode[]>;
  createFolder: (input: CreateKnowledgeFolderPayload) => Promise<KnowledgeNode>;
  createPage: (input: CreateKnowledgePagePayload) => Promise<KnowledgePageDetail>;
  getPage: (pageId: string) => Promise<KnowledgePageDetail>;
  updatePage: (pageId: string, input: UpdateKnowledgePagePayload) => Promise<KnowledgePageDetail>;
  listQuickNotes: (input?: ListKnowledgeQuickNotesPayload) => Promise<KnowledgeQuickNoteDetail[]>;
  createQuickNote: (input: CreateKnowledgeQuickNotePayload) => Promise<KnowledgeQuickNoteDetail>;
  updateQuickNote: (noteId: string, input: UpdateKnowledgeQuickNotePayload) => Promise<KnowledgeQuickNoteDetail>;
  archiveQuickNote: (noteId: string) => Promise<KnowledgeQuickNoteDetail>;
  convertQuickNoteToPage: (noteId: string, input?: ConvertKnowledgeQuickNoteToPagePayload) => Promise<KnowledgePageDetail>;
  linkQuickNoteTodo: (noteId: string, todoId: string) => Promise<KnowledgeQuickNoteDetail>;
  saveAsset: (input: SaveKnowledgeAssetPayload) => Promise<KnowledgeAsset>;
  getAsset: (assetId: string) => Promise<KnowledgeAsset>;
  openAsset: (assetId: string) => Promise<void>;
  showAssetInFolder: (assetId: string) => Promise<void>;
  importFiles: (input?: ImportKnowledgeFilesPayload) => Promise<ImportKnowledgeFilesResult>;
  listIndexJobs: (input?: ListKnowledgeIndexJobsPayload) => Promise<KnowledgeIndexJob[]>;
  retryIndexJob: (jobId: string) => Promise<ImportKnowledgeDocumentResult>;
  cancelIndexJob: (jobId: string) => Promise<KnowledgeIndexJob>;
  clearPreviewCache: () => Promise<ClearKnowledgePreviewCacheResult>;
  search: (input: KnowledgeSearchPayload) => Promise<KnowledgeSearchResult[]>;
  listTags: (input?: ListKnowledgeTagsPayload) => Promise<KnowledgeTag[]>;
  createTag: (input: CreateKnowledgeTagPayload) => Promise<KnowledgeTag>;
  updateTag: (tagId: string, input: UpdateKnowledgeTagPayload) => Promise<KnowledgeTag>;
  bindTag: (input: BindKnowledgeTagPayload) => Promise<KnowledgeTag>;
  unbindTag: (input: UnbindKnowledgeTagPayload) => Promise<void>;
  listTagTargets: (input: ListKnowledgeTagTargetsPayload) => Promise<KnowledgeTaggedTarget[]>;
  listPageLinks: (pageId: string) => Promise<KnowledgeLink[]>;
  listBacklinks: (pageId: string) => Promise<KnowledgeBacklink[]>;
  linkTodoSource: (input: LinkKnowledgeTodoPayload) => Promise<void>;
  getGraph: (input: KnowledgeGraphPayload) => Promise<KnowledgeGraph>;
  listOrphanPages: (input?: ListKnowledgeOrphanPagesPayload) => Promise<KnowledgeNode[]>;
  moveNode: (nodeId: string, input: MoveKnowledgeNodePayload) => Promise<KnowledgeNode>;
  updateNode: (nodeId: string, input: UpdateKnowledgeNodePayload) => Promise<KnowledgeNode>;
  archiveNode: (nodeId: string) => Promise<KnowledgeNode>;
  toggleFavorite: (nodeId: string, favorite: boolean) => Promise<KnowledgeNode>;
  deleteNode: (nodeId: string) => Promise<void>;
}
