import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  CreateKnowledgeFolderPayload,
  CreateKnowledgePagePayload,
  ClearKnowledgePreviewCacheResult,
  ImportKnowledgeFilesResult,
  KnowledgeAsset,
  KnowledgeBacklink,
  KnowledgeGraph,
  KnowledgeIndexJob,
  KnowledgeLibrary,
  KnowledgeLink,
  KnowledgeNode,
  KnowledgePageDetail,
  KnowledgeQuickNoteDetail,
  KnowledgeSearchResult,
  KnowledgeSearchSourceType,
  KnowledgeSpace,
  KnowledgeTag,
  KnowledgeTaggedTarget,
  KnowledgeTagTargetType,
  SaveKnowledgeAssetPayload,
  UpdateKnowledgeLibraryPayload,
  UpdateKnowledgeSpacePayload,
} from '@/contracts/knowledge';
import { notifyError } from '@/windows/main/composables/useInAppNotification';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import {
  attachAssetToCanvasElementV2,
  createDefaultCanvasDocumentV2,
  parseKnowledgeCanvasDocumentV2,
  type KnowledgeCanvasDocumentV2,
} from '@/windows/main/utils/knowledge_canvas_v2';
import {
  attachAssetToBlockV2,
  blockV2InlineText,
  createDefaultBlockDocumentV2,
  findBlockV2,
  type KnowledgeBlockDocumentV2,
  type KnowledgeBlockV2,
  parseKnowledgeBlockDocumentV2,
  updateBlockDocumentV2,
} from '@/windows/main/utils/knowledge_blocks_v2';
import {
  createBlockSavePayload,
  createCanvasSavePayload,
  createMarkdownSavePayload,
} from '@/windows/main/pages/Knowledge/utils/knowledge_document_codec';
import {
  createBlockToCanvasConversion,
  createBlockToMarkdownConversion,
  createCanvasToMarkdownConversion,
  createMarkdownToBlockConversion,
  createMarkdownToCanvasConversion,
  type KnowledgeConversionResult,
} from '@/windows/main/pages/Knowledge/utils/knowledge_conversion';

type KnowledgeSearchScope = 'library' | 'space';
type CreateDocumentExcerptPageInput = Pick<
  CreateKnowledgePagePayload,
  'title' | 'contentMarkdown' | 'contentText' | 'propertiesJson' | 'parentId' | 'spaceId'
>;

function api() {
  if (!window.knowledgeApi) {
    throw new Error('知识库 API 未初始化');
  }
  return window.knowledgeApi;
}

function sortNodes(nodes: KnowledgeNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function latestFirst(nodes: KnowledgeNode[]) {
  return [...nodes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function safeQuickNoteTags(note: KnowledgeQuickNoteDetail) {
  try {
    const parsed = JSON.parse(note.quickNote.tagsJson);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  const appConfigStore = useAppConfigStore();
  const libraries = ref<KnowledgeLibrary[]>([]);
  const spaces = ref<KnowledgeSpace[]>([]);
  const nodes = ref<KnowledgeNode[]>([]);
  const selectedNodeId = ref<string | null>(null);
  const selectedPage = ref<KnowledgePageDetail | null>(null);
  const selectedAsset = ref<KnowledgeAsset | null>(null);
  const quickNotes = ref<KnowledgeQuickNoteDetail[]>([]);
  const quickNoteSearch = ref('');
  const searchResults = ref<KnowledgeSearchResult[]>([]);
  const searchQuery = ref('');
  const searchTypeFilter = ref<KnowledgeSearchSourceType | 'all'>('all');
  const searchScope = ref<KnowledgeSearchScope>('library');
  const indexJobs = ref<KnowledgeIndexJob[]>([]);
  const tags = ref<KnowledgeTag[]>([]);
  const selectedTags = ref<KnowledgeTag[]>([]);
  const selectedAssetTags = ref<KnowledgeTag[]>([]);
  const tagTargets = ref<KnowledgeTaggedTarget[]>([]);
  const backlinks = ref<KnowledgeBacklink[]>([]);
  const pageLinks = ref<KnowledgeLink[]>([]);
  const graph = ref<KnowledgeGraph | null>(null);
  const orphanPages = ref<KnowledgeNode[]>([]);
  const activeTagFilterId = ref<string | null>(null);
  const activeLibraryId = ref('');
  const activeSpaceId = ref('');
  const loading = ref(false);
  const saving = ref(false);
  const importing = ref(false);
  const searching = ref(false);
  const error = ref<string | null>(null);
  const markdownDraft = ref('');
  const markdownDirty = ref(false);
  const blockDraft = ref<KnowledgeBlockDocumentV2>(createDefaultBlockDocumentV2());
  const blockDirty = ref(false);
  const canvasDraft = ref<KnowledgeCanvasDocumentV2>(createDefaultCanvasDocumentV2());
  const canvasDirty = ref(false);

  const activeLibrary = computed(() =>
    libraries.value.find((library) => library.id === activeLibraryId.value) ?? libraries.value[0] ?? null,
  );
  const activeSpace = computed(() =>
    spaces.value.find((space) => space.id === activeSpaceId.value) ?? spaces.value[0] ?? null,
  );
  const visibleNodes = computed(() =>
    nodes.value.filter((node) => !node.isArchived && !node.deletedAt),
  );
  const selectedNode = computed(() =>
    visibleNodes.value.find((node) => node.id === selectedNodeId.value) ?? null,
  );
  const inboxNode = computed(() =>
    visibleNodes.value.find((node) => node.id === 'node-inbox' || node.title === '快速收集箱') ?? null,
  );
  const favoriteNodes = computed(() => latestFirst(visibleNodes.value.filter((node) => node.isFavorite)));
  const recentNodes = computed(() => latestFirst(visibleNodes.value).slice(0, 8));
  const visibleQuickNotes = computed(() => {
    const query = quickNoteSearch.value.trim().toLowerCase();
    if (!query) return quickNotes.value;
    return quickNotes.value.filter((item) => {
      const tags = safeQuickNoteTags(item).join(' ').toLowerCase();
      return [
        item.quickNote.title,
        item.quickNote.body,
        tags,
      ].some((value) => value.toLowerCase().includes(query));
    });
  });
  const selectedTagTarget = computed<{ targetType: KnowledgeTagTargetType; targetId: string } | null>(() => {
    if (!selectedNode.value) return null;
    if (selectedNode.value.nodeType === 'quick_note') {
      return { targetType: 'quick_note', targetId: selectedNode.value.id };
    }
    if (selectedNode.value.nodeType === 'page' || selectedNode.value.nodeType === 'document') {
      return { targetType: 'page', targetId: selectedNode.value.id };
    }
    return null;
  });
  const selectedAssetTagTarget = computed<{ targetType: KnowledgeTagTargetType; targetId: string } | null>(() =>
    selectedAsset.value ? { targetType: 'asset', targetId: selectedAsset.value.id } : null,
  );

  function nodesBySpace(spaceId: string) {
    return visibleNodes.value.filter((node) => node.spaceId === spaceId);
  }

  function childrenFor(parentId?: string | null, spaceId?: string | null) {
    return sortNodes(
      visibleNodes.value.filter((node) => {
        const sameParent = (node.parentId ?? null) === (parentId ?? null);
        const sameSpace = spaceId ? node.spaceId === spaceId : true;
        return sameParent && sameSpace;
      }),
    );
  }

  async function refreshTree() {
    nodes.value = await api().listTree({
      libraryId: activeLibraryId.value || undefined,
    });
    if (selectedNodeId.value && !nodes.value.some((node) => node.id === selectedNodeId.value && !node.isArchived && !node.deletedAt)) {
      selectedNodeId.value = null;
      selectedPage.value = null;
      markdownDraft.value = '';
      markdownDirty.value = false;
      syncBlockDraft(null);
      syncCanvasDraft(null);
      selectedTags.value = [];
      selectedAsset.value = null;
      selectedAssetTags.value = [];
      backlinks.value = [];
      pageLinks.value = [];
    }
  }

  async function refreshQuickNotes() {
    quickNotes.value = await api().listQuickNotes({
      libraryId: activeLibraryId.value || undefined,
      query: quickNoteSearch.value || undefined,
    });
  }

  async function refreshIndexJobs() {
    indexJobs.value = await api().listIndexJobs({ limit: 12 });
  }

  async function refreshTags() {
    tags.value = await api().listTags({
      libraryId: activeLibraryId.value || undefined,
    });
  }

  async function refreshSelectedTags() {
    const target = selectedTagTarget.value;
    selectedTags.value = target
      ? await api().listTags({
          libraryId: activeLibraryId.value || undefined,
          targetType: target.targetType,
          targetId: target.targetId,
        })
      : [];
  }

  async function refreshSelectedAssetTags() {
    const target = selectedAssetTagTarget.value;
    selectedAssetTags.value = target
      ? await api().listTags({
          libraryId: activeLibraryId.value || undefined,
          targetType: target.targetType,
          targetId: target.targetId,
        })
      : [];
  }

  async function refreshSelectedRelations() {
    await Promise.all([refreshSelectedTags(), refreshSelectedAssetTags()]);
    if (selectedPage.value) {
      const pageId = selectedPage.value.node.id;
      const [nextBacklinks, nextLinks] = await Promise.all([
        api().listBacklinks(pageId),
        api().listPageLinks(pageId),
      ]);
      backlinks.value = nextBacklinks;
      pageLinks.value = nextLinks;
    } else {
      backlinks.value = [];
      pageLinks.value = [];
    }
  }

  async function refreshGraph() {
    graph.value = await api().getGraph({
      libraryId: activeLibraryId.value || undefined,
      spaceId: activeSpaceId.value || undefined,
      tagId: activeTagFilterId.value || undefined,
      limit: 200,
    });
  }

  async function refreshOrphanPages() {
    orphanPages.value = await api().listOrphanPages({
      libraryId: activeLibraryId.value || undefined,
      spaceId: activeSpaceId.value || undefined,
      limit: 80,
    });
  }

  async function ensureKnowledgeStorageDirectory() {
    const knowledgeConfig = appConfigStore.config.features.knowledge;
    if (knowledgeConfig.assetStorageMode === 'custom' && knowledgeConfig.customAssetDirectory) {
      return true;
    }
    if (!window.shellApi) return true;

    const directory = await window.shellApi.selectDirectory('选择知识库数据存放位置');
    if (!directory) {
      notifyError(new Error('首次使用知识库前需要选择数据存放位置'), '知识库数据目录未设置');
      return false;
    }

    await appConfigStore.updateConfig({
      features: {
        knowledge: {
          assetStorageMode: 'custom',
          customAssetDirectory: directory,
        },
      },
    });
    return true;
  }

  async function loadActiveLibraryData() {
    spaces.value = await api().listSpaces(activeLibraryId.value || undefined);
    activeSpaceId.value =
      spaces.value.find((space) => space.id === activeSpaceId.value)?.id
      || spaces.value.find((space) => space.isDefault)?.id
      || spaces.value[0]?.id
      || '';
    await refreshTree();
    await refreshQuickNotes();
    await refreshIndexJobs();
    await refreshTags();
    await refreshGraph();
    await refreshOrphanPages();
  }

  async function loadTagTargets(tagId: string) {
    activeTagFilterId.value = tagId;
    tagTargets.value = await api().listTagTargets({
      tagId,
      limit: 80,
    });
    await refreshGraph();
    return tagTargets.value;
  }

  async function clearTagFilter() {
    activeTagFilterId.value = null;
    tagTargets.value = [];
    await refreshGraph();
  }

  function syncMarkdownDraft(page: KnowledgePageDetail | null) {
    markdownDraft.value = page?.page.contentMarkdown ?? '';
    markdownDirty.value = false;
  }

  function syncBlockDraft(page: KnowledgePageDetail | null) {
    blockDraft.value = page?.page.pageType === 'block'
      ? parseKnowledgeBlockDocumentV2(page.page.contentJson, page.node.title)
      : createDefaultBlockDocumentV2();
    blockDirty.value = false;
  }

  function syncCanvasDraft(page: KnowledgePageDetail | null) {
    canvasDraft.value = page?.page.pageType === 'canvas'
      ? parseKnowledgeCanvasDocumentV2(page.page.contentJson, page.node.title)
      : createDefaultCanvasDocumentV2();
    canvasDirty.value = false;
  }

  async function initialize() {
    loading.value = true;
    error.value = null;
    try {
      const storageReady = await ensureKnowledgeStorageDirectory();
      if (!storageReady) return;

      libraries.value = await api().listLibraries();
      const configuredLibraryId = appConfigStore.config.features.knowledge.defaultLibraryId;
      const configuredLibrary = libraries.value.find((library) => library.id === configuredLibraryId);
      activeLibraryId.value =
        activeLibraryId.value || configuredLibrary?.id || libraries.value.find((library) => library.isDefault)?.id || libraries.value[0]?.id || '';
      await loadActiveLibraryData();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      notifyError(err, '知识库加载失败');
    } finally {
      loading.value = false;
    }
  }

  async function savePendingDrafts() {
    if (markdownDirty.value) {
      await saveMarkdownDraft();
    }
    if (blockDirty.value) {
      await saveBlockDraft();
    }
    if (canvasDirty.value) {
      await saveCanvasDraft();
    }
  }

  async function switchLibrary(libraryId: string) {
    if (!libraryId || libraryId === activeLibraryId.value) return;
    await savePendingDrafts();
    activeLibraryId.value = libraryId;
    activeSpaceId.value = '';
    selectedNodeId.value = null;
    selectedPage.value = null;
    selectedAsset.value = null;
    selectedAssetTags.value = [];
    syncMarkdownDraft(null);
    syncBlockDraft(null);
    syncCanvasDraft(null);
    await appConfigStore.updateConfig({
      features: {
        knowledge: {
          defaultLibraryId: libraryId,
        },
      },
    });
    await loadActiveLibraryData();
  }

  async function createLibrary(name: string) {
    const normalizedName = name.trim();
    if (!normalizedName) return null;

    saving.value = true;
    try {
      const library = await api().createLibrary({ name: normalizedName });
      libraries.value = await api().listLibraries();
      await switchLibrary(library.id);
      return library;
    } catch (err) {
      notifyError(err, '知识库创建失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateLibrary(libraryId: string, input: UpdateKnowledgeLibraryPayload) {
    saving.value = true;
    try {
      const library = await api().updateLibrary(libraryId, input);
      libraries.value = await api().listLibraries();
      return library;
    } catch (err) {
      notifyError(err, '知识库更新失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function deleteLibrary(libraryId: string) {
    saving.value = true;
    try {
      await api().deleteLibrary(libraryId);
      libraries.value = await api().listLibraries();
      const fallback = libraries.value.find((library) => library.isDefault) ?? libraries.value[0] ?? null;
      if (activeLibraryId.value === libraryId && fallback) {
        activeLibraryId.value = fallback.id;
        activeSpaceId.value = '';
        await appConfigStore.updateConfig({
          features: {
            knowledge: {
              defaultLibraryId: fallback.id,
            },
          },
        });
        await loadActiveLibraryData();
      }
    } catch (err) {
      notifyError(err, '知识库删除失败');
    } finally {
      saving.value = false;
    }
  }

  async function createSpace(name: string) {
    const normalizedName = name.trim();
    if (!normalizedName) return null;

    saving.value = true;
    try {
      const space = await api().createSpace({
        libraryId: activeLibraryId.value || undefined,
        name: normalizedName,
      });
      spaces.value = await api().listSpaces(activeLibraryId.value || undefined);
      activeSpaceId.value = space.id;
      await refreshTree();
      return space;
    } catch (err) {
      notifyError(err, '空间创建失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateSpace(spaceId: string, input: UpdateKnowledgeSpacePayload) {
    saving.value = true;
    try {
      const space = await api().updateSpace(spaceId, input);
      spaces.value = await api().listSpaces(activeLibraryId.value || undefined);
      await refreshTree();
      await refreshGraph();
      return space;
    } catch (err) {
      notifyError(err, '空间更新失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function deleteSpace(spaceId: string) {
    saving.value = true;
    try {
      await api().deleteSpace(spaceId);
      spaces.value = await api().listSpaces(activeLibraryId.value || undefined);
      activeSpaceId.value = spaces.value.find((space) => space.id === activeSpaceId.value)?.id
        || spaces.value.find((space) => space.isDefault)?.id
        || spaces.value[0]?.id
        || '';
      await refreshTree();
      await refreshGraph();
      await refreshOrphanPages();
    } catch (err) {
      notifyError(err, '空间删除失败');
    } finally {
      saving.value = false;
    }
  }

  async function reorderSpaces(orderedIds: string[]) {
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    const updates = spaces.value
      .filter((space) => orderMap.has(space.id) && space.sortOrder !== orderMap.get(space.id))
      .map((space) => api().updateSpace(space.id, { sortOrder: orderMap.get(space.id) }));
    if (!updates.length) return spaces.value;
    try {
      await Promise.all(updates);
      spaces.value = await api().listSpaces(activeLibraryId.value || undefined);
      return spaces.value;
    } catch (err) {
      notifyError(err, '空间排序失败');
      return spaces.value;
    }
  }

  async function createFolder(input: Pick<CreateKnowledgeFolderPayload, 'title' | 'parentId' | 'spaceId'>) {
    const title = input.title.trim();
    if (!title) return null;

    saving.value = true;
    try {
      const folder = await api().createFolder({
        libraryId: activeLibraryId.value || undefined,
        spaceId: input.spaceId || activeSpaceId.value || undefined,
        parentId: input.parentId,
        title,
      });
      await refreshTree();
      selectedNodeId.value = folder.id;
      selectedPage.value = null;
      selectedAsset.value = null;
      selectedAssetTags.value = [];
      return folder;
    } catch (err) {
      notifyError(err, '文件夹创建失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function createMarkdownPage(input: Pick<CreateKnowledgePagePayload, 'title' | 'parentId' | 'spaceId'>) {
    const title = input.title.trim();
    if (!title) return null;

    saving.value = true;
    try {
      const page = await api().createPage({
        libraryId: activeLibraryId.value || undefined,
        spaceId: input.spaceId || activeSpaceId.value || undefined,
        parentId: input.parentId,
        title,
        pageType: 'markdown',
      });
      await refreshTree();
      selectedNodeId.value = page.node.id;
      selectedPage.value = page;
      selectedAsset.value = null;
      selectedAssetTags.value = [];
      syncMarkdownDraft(page);
      syncBlockDraft(page);
      syncCanvasDraft(page);
      await refreshSelectedRelations();
      await refreshGraph();
      await refreshOrphanPages();
      return page;
    } catch (err) {
      notifyError(err, 'Markdown 页面创建失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function createBlockPage(input: Pick<CreateKnowledgePagePayload, 'title' | 'parentId' | 'spaceId'>) {
    const title = input.title.trim();
    if (!title) return null;

    saving.value = true;
    try {
      const document = createDefaultBlockDocumentV2(title);
      const page = await api().createPage({
        libraryId: activeLibraryId.value || undefined,
        spaceId: input.spaceId || activeSpaceId.value || undefined,
        parentId: input.parentId,
        title,
        pageType: 'block',
        ...createBlockSavePayload(document),
      });
      await refreshTree();
      selectedNodeId.value = page.node.id;
      selectedPage.value = page;
      selectedAsset.value = null;
      selectedAssetTags.value = [];
      syncMarkdownDraft(page);
      syncBlockDraft(page);
      syncCanvasDraft(page);
      await refreshSelectedRelations();
      await refreshGraph();
      await refreshOrphanPages();
      return page;
    } catch (err) {
      notifyError(err, '块页面创建失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function createCanvasPage(input: Pick<CreateKnowledgePagePayload, 'title' | 'parentId' | 'spaceId'>) {
    const title = input.title.trim();
    if (!title) return null;

    saving.value = true;
    try {
      const document = createDefaultCanvasDocumentV2(title);
      const page = await api().createPage({
        libraryId: activeLibraryId.value || undefined,
        spaceId: input.spaceId || activeSpaceId.value || undefined,
        parentId: input.parentId,
        title,
        pageType: 'canvas',
        ...createCanvasSavePayload(document),
      });
      await refreshTree();
      selectedNodeId.value = page.node.id;
      selectedPage.value = page;
      selectedAsset.value = null;
      selectedAssetTags.value = [];
      syncMarkdownDraft(page);
      syncBlockDraft(page);
      syncCanvasDraft(page);
      await refreshSelectedRelations();
      await refreshGraph();
      await refreshOrphanPages();
      return page;
    } catch (err) {
      notifyError(err, '画布页面创建失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function createDocumentExcerptPage(input: CreateDocumentExcerptPageInput) {
    const title = input.title.trim();
    if (!title) return null;

    saving.value = true;
    try {
      const page = await api().createPage({
        libraryId: activeLibraryId.value || undefined,
        spaceId: input.spaceId || selectedNode.value?.spaceId || activeSpaceId.value || undefined,
        parentId: input.parentId ?? selectedNode.value?.parentId ?? undefined,
        title,
        pageType: 'markdown',
        contentMarkdown: input.contentMarkdown,
        contentText: input.contentText || input.contentMarkdown,
        propertiesJson: input.propertiesJson,
      });
      await refreshTree();
      selectedNodeId.value = page.node.id;
      selectedPage.value = page;
      selectedAsset.value = null;
      selectedAssetTags.value = [];
      syncMarkdownDraft(page);
      syncBlockDraft(page);
      syncCanvasDraft(page);
      await refreshSelectedRelations();
      await refreshGraph();
      await refreshOrphanPages();
      return page;
    } catch (err) {
      notifyError(err, '摘录页面创建失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function createConvertedPageCopy(result: KnowledgeConversionResult) {
    if (!selectedPage.value) return null;
    saving.value = true;
    try {
      const page = await api().createPage({
        libraryId: activeLibraryId.value || undefined,
        spaceId: selectedPage.value.node.spaceId || activeSpaceId.value || undefined,
        parentId: selectedPage.value.node.parentId,
        title: result.title,
        ...result.payload,
      });
      await refreshTree();
      selectedNodeId.value = page.node.id;
      selectedPage.value = page;
      selectedAsset.value = null;
      selectedAssetTags.value = [];
      syncMarkdownDraft(page);
      syncBlockDraft(page);
      syncCanvasDraft(page);
      await refreshSelectedRelations();
      await refreshGraph();
      await refreshOrphanPages();
      return page;
    } catch (err) {
      notifyError(err, '页面转换失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function convertSelectedPageToBlockCopy() {
    if (!selectedPage.value || selectedPage.value.page.pageType !== 'markdown') return null;
    return createConvertedPageCopy(createMarkdownToBlockConversion({
      title: selectedPage.value.node.title,
      markdown: markdownDirty.value ? markdownDraft.value : selectedPage.value.page.contentMarkdown,
      sourcePageId: selectedPage.value.page.id,
    }));
  }

  async function convertSelectedPageToMarkdownCopy() {
    if (!selectedPage.value) return null;
    if (selectedPage.value.page.pageType === 'block') {
      return createConvertedPageCopy(createBlockToMarkdownConversion({
        title: selectedPage.value.node.title,
        document: blockDraft.value,
        sourcePageId: selectedPage.value.page.id,
      }));
    }
    if (selectedPage.value.page.pageType === 'canvas') {
      return createConvertedPageCopy(createCanvasToMarkdownConversion({
        title: selectedPage.value.node.title,
        document: canvasDraft.value,
        sourcePageId: selectedPage.value.page.id,
      }));
    }
    return null;
  }

  async function convertSelectedPageToCanvasCopy() {
    if (!selectedPage.value) return null;
    if (selectedPage.value.page.pageType === 'markdown') {
      return createConvertedPageCopy(createMarkdownToCanvasConversion({
        title: selectedPage.value.node.title,
        markdown: markdownDirty.value ? markdownDraft.value : selectedPage.value.page.contentMarkdown,
        sourcePageId: selectedPage.value.page.id,
      }));
    }
    if (selectedPage.value.page.pageType === 'block') {
      return createConvertedPageCopy(createBlockToCanvasConversion({
        title: selectedPage.value.node.title,
        document: blockDraft.value,
        sourcePageId: selectedPage.value.page.id,
      }));
    }
    return null;
  }

  async function convertQuickNoteToPage(noteId: string) {
    saving.value = true;
    try {
      const note = quickNotes.value.find((item) => item.quickNote.id === noteId);
      const page = await api().convertQuickNoteToPage(noteId, {
        title: note?.quickNote.title,
      });
      await refreshTree();
      await refreshQuickNotes();
      selectedNodeId.value = page.node.id;
      selectedPage.value = page;
      syncMarkdownDraft(page);
      syncBlockDraft(page);
      syncCanvasDraft(page);
      await refreshSelectedRelations();
      await refreshGraph();
      await refreshOrphanPages();
      return page;
    } catch (err) {
      notifyError(err, '速记转页面失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function convertQuickNoteToTodo(noteId: string) {
    const note = quickNotes.value.find((item) => item.quickNote.id === noteId);
    if (!note || !window.todoApi) return null;

    saving.value = true;
    try {
      const todo = await window.todoApi.createTodo({
        id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        listId: 'default-tasks',
        title: note.quickNote.title,
        note: [
          note.quickNote.body,
          '',
          '---',
          `来源：知识库速记「${note.quickNote.title}」`,
          `来源 ID：${note.quickNote.id}`,
        ].join('\n'),
      });
      await api().linkQuickNoteTodo(noteId, todo.id);
      await refreshQuickNotes();
      await refreshGraph();
      return todo;
    } catch (err) {
      notifyError(err, '速记转 Todo 失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function archiveQuickNote(noteId: string) {
    saving.value = true;
    try {
      await api().archiveQuickNote(noteId);
      await refreshTree();
      await refreshQuickNotes();
    } catch (err) {
      notifyError(err, '速记归档失败');
    } finally {
      saving.value = false;
    }
  }

  async function selectNode(nodeId: string) {
    if (markdownDirty.value) {
      const saved = await saveMarkdownDraft();
      if (!saved) return;
    }
    if (blockDirty.value) {
      const saved = await saveBlockDraft();
      if (!saved) return;
    }
    if (canvasDirty.value) {
      const saved = await saveCanvasDraft();
      if (!saved) return;
    }

    const node = visibleNodes.value.find((item) => item.id === nodeId);
    if (!node) return;

    selectedNodeId.value = node.id;
    selectedPage.value = null;
    selectedAsset.value = null;
    selectedAssetTags.value = [];
    syncMarkdownDraft(null);
    syncBlockDraft(null);
    syncCanvasDraft(null);
    backlinks.value = [];
    pageLinks.value = [];
    await refreshSelectedTags();
    if (node.nodeType !== 'page' && node.nodeType !== 'document') return;

    loading.value = true;
    try {
      selectedPage.value = await api().getPage(node.id);
      if (selectedPage.value.page.sourceAssetId) {
        selectedAsset.value = await api().getAsset(selectedPage.value.page.sourceAssetId);
      }
      syncMarkdownDraft(selectedPage.value);
      syncBlockDraft(selectedPage.value);
      syncCanvasDraft(selectedPage.value);
      await refreshSelectedRelations();
    } catch (err) {
      notifyError(err, '页面加载失败');
    } finally {
      loading.value = false;
    }
  }

  async function renameNode(nodeId: string, title: string) {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;

    const node = visibleNodes.value.find((item) => item.id === nodeId);
    if (!node) return;

    saving.value = true;
    try {
      if (node.nodeType === 'page') {
        selectedPage.value = await api().updatePage(nodeId, {
          title: normalizedTitle,
          ...(markdownDirty.value
            ? {
                contentMarkdown: markdownDraft.value,
                contentText: markdownDraft.value,
              }
            : {}),
          ...(blockDirty.value ? blockDraftSavePayload() : {}),
          ...(canvasDirty.value ? canvasDraftSavePayload() : {}),
        });
        if (selectedPage.value) {
          syncMarkdownDraft(selectedPage.value);
          syncBlockDraft(selectedPage.value);
          syncCanvasDraft(selectedPage.value);
        }
      } else if (node.nodeType === 'quick_note') {
        await api().updateQuickNote(nodeId, { title: normalizedTitle });
        await refreshQuickNotes();
      } else {
        await api().updateNode(nodeId, { title: normalizedTitle });
      }
      await refreshTree();
      await refreshSelectedRelations();
      await refreshGraph();
      await refreshOrphanPages();
    } catch (err) {
      notifyError(err, '重命名失败');
    } finally {
      saving.value = false;
    }
  }

  async function moveNodeToRoot(nodeId: string) {
    saving.value = true;
    try {
      await api().moveNode(nodeId, { parentId: undefined });
      await refreshTree();
    } catch (err) {
      notifyError(err, '移动节点失败');
    } finally {
      saving.value = false;
    }
  }

  async function moveNodeToFolder(nodeId: string, folderId: string) {
    const node = visibleNodes.value.find((item) => item.id === nodeId);
    const folder = visibleNodes.value.find((item) => item.id === folderId);
    if (!node || !folder || folder.nodeType !== 'folder' || node.id === folder.id) return false;
    if (node.id === 'node-inbox' || folder.id === 'node-inbox') return false;
    if (node.spaceId !== folder.spaceId) {
      notifyError(new Error('只能在同一空间内移动文件'), '移动节点失败');
      return false;
    }

    saving.value = true;
    try {
      await api().moveNode(nodeId, { parentId: folderId });
      await refreshTree();
      await refreshGraph();
      await refreshOrphanPages();
      return true;
    } catch (err) {
      notifyError(err, '移动节点失败');
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function moveNodeToSpaceRoot(nodeId: string, spaceId: string) {
    const node = visibleNodes.value.find((item) => item.id === nodeId);
    if (!node || node.id === 'node-inbox' || node.spaceId !== spaceId) return false;

    saving.value = true;
    try {
      await api().moveNode(nodeId, { parentId: undefined });
      await refreshTree();
      await refreshGraph();
      await refreshOrphanPages();
      return true;
    } catch (err) {
      notifyError(err, '移动节点失败');
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function toggleFavorite(nodeId: string) {
    const node = visibleNodes.value.find((item) => item.id === nodeId);
    if (!node) return;

    try {
      await api().toggleFavorite(nodeId, !node.isFavorite);
      await refreshTree();
    } catch (err) {
      notifyError(err, '收藏状态更新失败');
    }
  }

  async function archiveNode(nodeId: string) {
    try {
      await api().archiveNode(nodeId);
      if (selectedNodeId.value === nodeId) {
        selectedNodeId.value = null;
        selectedPage.value = null;
        selectedAsset.value = null;
        selectedAssetTags.value = [];
        syncMarkdownDraft(null);
        syncBlockDraft(null);
        syncCanvasDraft(null);
        await refreshSelectedRelations();
      }
      await refreshTree();
      await refreshGraph();
      await refreshOrphanPages();
    } catch (err) {
      notifyError(err, '归档失败');
    }
  }

  async function deleteNode(nodeId: string) {
    try {
      await api().deleteNode(nodeId);
      if (selectedNodeId.value === nodeId) {
        selectedNodeId.value = null;
        selectedPage.value = null;
        selectedAsset.value = null;
        selectedAssetTags.value = [];
        syncMarkdownDraft(null);
        syncBlockDraft(null);
        syncCanvasDraft(null);
        await refreshSelectedRelations();
      }
      await refreshTree();
      await refreshGraph();
      await refreshOrphanPages();
    } catch (err) {
      notifyError(err, '删除失败');
    }
  }

  function updateMarkdownDraft(value: string) {
    markdownDraft.value = value;
    markdownDirty.value = Boolean(selectedPage.value && value !== selectedPage.value.page.contentMarkdown);
  }

  async function saveMarkdownDraft() {
    if (!selectedPage.value || !markdownDirty.value) return selectedPage.value;

    saving.value = true;
    try {
      const page = await api().updatePage(
        selectedPage.value.node.id,
        createMarkdownSavePayload(markdownDraft.value),
      );
      selectedPage.value = page;
      syncMarkdownDraft(page);
      await refreshTree();
      await refreshSelectedRelations();
      await refreshGraph();
      await refreshOrphanPages();
      return page;
    } catch (err) {
      notifyError(err, 'Markdown 保存失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  function updateBlockDraft(value: KnowledgeBlockDocumentV2) {
    blockDraft.value = value;
    blockDirty.value = Boolean(
      selectedPage.value?.page.pageType === 'block'
      && comparableBlockDocument(value) !== comparableBlockDocument(parseKnowledgeBlockDocumentV2(
        selectedPage.value.page.contentJson,
        selectedPage.value.node.title,
      )),
    );
  }

  function comparableBlockDocument(value: KnowledgeBlockDocumentV2) {
    return JSON.stringify({
      ...value,
      updatedAt: '',
      blocks: value.blocks.map(comparableBlock),
    });
  }

  function comparableBlock(block: KnowledgeBlockV2): KnowledgeBlockV2 {
    return {
      ...block,
      updatedAt: '',
      children: block.children?.map(comparableBlock),
    };
  }

  function blockDraftSavePayload() {
    return createBlockSavePayload(blockDraft.value, selectedPage.value?.page.propertiesJson);
  }

  async function saveBlockDraft() {
    if (!selectedPage.value || selectedPage.value.page.pageType !== 'block' || !blockDirty.value) return selectedPage.value;

    saving.value = true;
    try {
      const page = await api().updatePage(selectedPage.value.node.id, blockDraftSavePayload());
      selectedPage.value = page;
      syncBlockDraft(page);
      await refreshTree();
      await refreshSelectedRelations();
      await refreshGraph();
      await refreshOrphanPages();
      return page;
    } catch (err) {
      notifyError(err, '块页面保存失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  function updateCanvasDraft(value: KnowledgeCanvasDocumentV2) {
    canvasDraft.value = value;
    canvasDirty.value = Boolean(
      selectedPage.value?.page.pageType === 'canvas'
      && comparableCanvasDocument(value) !== comparableCanvasDocument(parseKnowledgeCanvasDocumentV2(
        selectedPage.value.page.contentJson,
        selectedPage.value.node.title,
      )),
    );
  }

  function comparableCanvasDocument(value: KnowledgeCanvasDocumentV2) {
    return JSON.stringify({
      ...value,
      updatedAt: '',
      elements: value.elements.map((element) => ({ ...element, updatedAt: '' })),
    });
  }

  function canvasDraftSavePayload() {
    return createCanvasSavePayload(canvasDraft.value, selectedPage.value?.page.propertiesJson);
  }

  async function saveCanvasDraft() {
    if (!selectedPage.value || selectedPage.value.page.pageType !== 'canvas' || !canvasDirty.value) return selectedPage.value;

    saving.value = true;
    try {
      const page = await api().updatePage(selectedPage.value.node.id, canvasDraftSavePayload());
      selectedPage.value = page;
      syncCanvasDraft(page);
      await refreshTree();
      await refreshSelectedRelations();
      await refreshGraph();
      await refreshOrphanPages();
      return page;
    } catch (err) {
      notifyError(err, '画布页面保存失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function createTag(name: string, color = '#4A90D9') {
    const normalizedName = name.trim();
    if (!normalizedName) return null;
    try {
      const tag = await api().createTag({
        libraryId: activeLibraryId.value || undefined,
        name: normalizedName,
        color,
      });
      await refreshTags();
      return tag;
    } catch (err) {
      notifyError(err, '标签创建失败');
      return null;
    }
  }

  async function updateTagColor(tagId: string, color: string) {
    try {
      const tag = await api().updateTag(tagId, { color });
      await refreshTags();
      await refreshSelectedTags();
      await refreshSelectedAssetTags();
      if (activeTagFilterId.value === tagId) {
        await loadTagTargets(tagId);
      }
      return tag;
    } catch (err) {
      notifyError(err, '标签颜色更新失败');
      return null;
    }
  }

  async function bindTagToSelected(tag: KnowledgeTag) {
    const target = selectedTagTarget.value;
    if (!target) return null;
    try {
      const bound = await api().bindTag({
        tagId: tag.id,
        targetType: target.targetType,
        targetId: target.targetId,
      });
      await refreshSelectedTags();
      await loadTagTargets(tag.id);
      await refreshOrphanPages();
      return bound;
    } catch (err) {
      notifyError(err, '标签绑定失败');
      return null;
    }
  }

  async function unbindTagFromSelected(tagId: string) {
    const target = selectedTagTarget.value;
    if (!target) return;
    try {
      await api().unbindTag({
        tagId,
        targetType: target.targetType,
        targetId: target.targetId,
      });
      await refreshSelectedTags();
      if (activeTagFilterId.value === tagId) {
        await loadTagTargets(tagId);
      }
      await refreshOrphanPages();
    } catch (err) {
      notifyError(err, '标签解绑失败');
    }
  }

  async function bindTagToSelectedAsset(tag: KnowledgeTag) {
    const target = selectedAssetTagTarget.value;
    if (!target) return null;
    try {
      const bound = await api().bindTag({
        tagId: tag.id,
        targetType: target.targetType,
        targetId: target.targetId,
      });
      await refreshSelectedAssetTags();
      await loadTagTargets(tag.id);
      return bound;
    } catch (err) {
      notifyError(err, '附件标签绑定失败');
      return null;
    }
  }

  async function unbindTagFromSelectedAsset(tagId: string) {
    const target = selectedAssetTagTarget.value;
    if (!target) return;
    try {
      await api().unbindTag({
        tagId,
        targetType: target.targetType,
        targetId: target.targetId,
      });
      await refreshSelectedAssetTags();
      if (activeTagFilterId.value === tagId) {
        await loadTagTargets(tagId);
      }
    } catch (err) {
      notifyError(err, '附件标签解绑失败');
    }
  }

  async function saveAsset(input: Omit<SaveKnowledgeAssetPayload, 'libraryId'>): Promise<KnowledgeAsset | null> {
    const libraryId = selectedPage.value?.node.libraryId || activeLibraryId.value || undefined;
    try {
      return await api().saveAsset({
        ...input,
        libraryId,
      });
    } catch (err) {
      notifyError(err, '附件保存失败');
      return null;
    }
  }

  function attachAssetToBlockDraft(blockId: string, asset: KnowledgeAsset) {
    updateBlockDraft(attachAssetToBlockV2(blockDraft.value, blockId, asset));
  }

  function attachAssetToCanvasDraft(
    elementId: string | null,
    asset: KnowledgeAsset,
    position?: { x: number; y: number },
  ) {
    updateCanvasDraft(attachAssetToCanvasElementV2(canvasDraft.value, elementId, asset, position));
  }

  async function convertBlockTaskToTodo(blockId: string) {
    const block = findBlockV2(blockDraft.value.blocks, blockId);
    if (!block || block.type !== 'task_list' || block.refs?.todoId || !window.todoApi || !selectedPage.value) return null;

    saving.value = true;
    try {
      const todo = await window.todoApi.createTodo({
        id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        listId: 'default-tasks',
        title: blockV2InlineText(block).trim() || selectedPage.value.node.title,
        note: [
          `来源：知识库块页面「${selectedPage.value.node.title}」`,
          `页面 ID：${selectedPage.value.node.id}`,
          `块 ID：${block.id}`,
        ].join('\n'),
      });
      blockDraft.value = updateBlockDocumentV2(blockDraft.value, blockId, {
        refs: {
          ...(block.refs ?? {}),
          todoId: todo.id,
        },
        attrs: {
          ...(block.attrs ?? {}),
          title: todo.title,
        },
      });
      blockDirty.value = true;
      await api().linkTodoSource({
        pageId: selectedPage.value.node.id,
        todoId: todo.id,
      });
      await saveBlockDraft();
      await refreshSelectedRelations();
      await refreshGraph();
      return todo;
    } catch (err) {
      notifyError(err, '任务块转 Todo 失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function openSelectedAsset() {
    if (!selectedAsset.value) return;
    try {
      await api().openAsset(selectedAsset.value.id);
    } catch (err) {
      notifyError(err, '打开原文件失败');
    }
  }

  async function showSelectedAssetInFolder() {
    if (!selectedAsset.value) return;
    try {
      await api().showAssetInFolder(selectedAsset.value.id);
    } catch (err) {
      notifyError(err, '系统中显示失败');
    }
  }

  async function selectAsset(assetId: string) {
    try {
      selectedAsset.value = await api().getAsset(assetId);
      await refreshSelectedAssetTags();
      return selectedAsset.value;
    } catch (err) {
      notifyError(err, '附件加载失败');
      return null;
    }
  }

  async function importFiles(): Promise<ImportKnowledgeFilesResult | null> {
    importing.value = true;
    try {
      const parentId = selectedNode.value?.nodeType === 'folder' ? selectedNode.value.id : undefined;
      const result = await api().importFiles({
        libraryId: activeLibraryId.value || undefined,
        spaceId: activeSpaceId.value || undefined,
        parentId,
      });
      await refreshTree();
      await refreshIndexJobs();
      await refreshGraph();
      await refreshOrphanPages();
      if (result.imported[0]?.document.node.id) {
        await selectNode(result.imported[0].document.node.id);
      }
      return result;
    } catch (err) {
      notifyError(err, '文件导入失败');
      return null;
    } finally {
      importing.value = false;
    }
  }

  async function retryIndexJob(jobId: string): Promise<ImportKnowledgeFilesResult | null> {
    importing.value = true;
    try {
      const result = await api().retryIndexJob(jobId);
      await refreshTree();
      await refreshIndexJobs();
      await refreshGraph();
      await refreshOrphanPages();
      await selectNode(result.document.node.id);
      return { imported: [result], skipped: [] };
    } catch (err) {
      notifyError(err, '索引任务重试失败');
      return null;
    } finally {
      importing.value = false;
    }
  }

  async function cancelIndexJob(jobId: string): Promise<KnowledgeIndexJob | null> {
    try {
      const job = await api().cancelIndexJob(jobId);
      await refreshIndexJobs();
      return job;
    } catch (err) {
      notifyError(err, '索引任务取消失败');
      return null;
    }
  }

  async function clearPreviewCache(): Promise<ClearKnowledgePreviewCacheResult | null> {
    try {
      return await api().clearPreviewCache();
    } catch (err) {
      notifyError(err, '预览缓存清理失败');
      return null;
    }
  }

  async function searchKnowledge(query: string) {
    const normalizedQuery = query.trim();
    searchQuery.value = query;
    if (!normalizedQuery) {
      searchResults.value = [];
      return [];
    }

    searching.value = true;
    try {
      const results = await api().search({
        libraryId: activeLibraryId.value || undefined,
        spaceId: searchScope.value === 'space' ? activeSpaceId.value || undefined : undefined,
        query: normalizedQuery,
        sourceType: searchTypeFilter.value === 'all' ? undefined : searchTypeFilter.value,
        limit: 30,
      });
      searchResults.value = results;
      return results;
    } catch (err) {
      notifyError(err, '知识库搜索失败');
      searchResults.value = [];
      return [];
    } finally {
      searching.value = false;
    }
  }

  function setSearchTypeFilter(value: KnowledgeSearchSourceType | 'all') {
    searchTypeFilter.value = value;
    if (searchQuery.value.trim()) {
      searchKnowledge(searchQuery.value);
    }
  }

  function setSearchScope(value: KnowledgeSearchScope) {
    searchScope.value = value;
    if (searchQuery.value.trim()) {
      searchKnowledge(searchQuery.value);
    }
  }

  async function selectSearchResult(result: KnowledgeSearchResult) {
    if (result.nodeId) {
      await selectNode(result.nodeId);
    } else if (result.assetId) {
      await api().openAsset(result.assetId);
    }
  }

  return {
    libraries,
    spaces,
    nodes,
    selectedNodeId,
    selectedPage,
    selectedAsset,
    quickNotes,
    quickNoteSearch,
    searchResults,
    searchQuery,
    searchTypeFilter,
    searchScope,
    indexJobs,
    tags,
    selectedTags,
    selectedAssetTags,
    tagTargets,
    backlinks,
    pageLinks,
    graph,
    orphanPages,
    activeTagFilterId,
    activeLibraryId,
    activeSpaceId,
    loading,
    saving,
    importing,
    searching,
    error,
    markdownDraft,
    markdownDirty,
    blockDraft,
    blockDirty,
    canvasDraft,
    canvasDirty,
    activeLibrary,
    activeSpace,
    visibleNodes,
    selectedNode,
    inboxNode,
    favoriteNodes,
    recentNodes,
    visibleQuickNotes,
    nodesBySpace,
    childrenFor,
    initialize,
    refreshTree,
    refreshQuickNotes,
    refreshIndexJobs,
    refreshTags,
    refreshSelectedRelations,
    refreshGraph,
    refreshOrphanPages,
    loadTagTargets,
    clearTagFilter,
    switchLibrary,
    createLibrary,
    updateLibrary,
    deleteLibrary,
    createSpace,
    updateSpace,
    deleteSpace,
    reorderSpaces,
    createFolder,
    createMarkdownPage,
    createBlockPage,
    createCanvasPage,
    createDocumentExcerptPage,
    convertSelectedPageToBlockCopy,
    convertSelectedPageToMarkdownCopy,
    convertSelectedPageToCanvasCopy,
    convertQuickNoteToPage,
    convertQuickNoteToTodo,
    archiveQuickNote,
    selectNode,
    renameNode,
    moveNodeToRoot,
    moveNodeToFolder,
    moveNodeToSpaceRoot,
    toggleFavorite,
    archiveNode,
    deleteNode,
    updateMarkdownDraft,
    saveMarkdownDraft,
    updateBlockDraft,
    saveBlockDraft,
    updateCanvasDraft,
    saveCanvasDraft,
    createTag,
    updateTagColor,
    bindTagToSelected,
    unbindTagFromSelected,
    bindTagToSelectedAsset,
    unbindTagFromSelectedAsset,
    saveAsset,
    attachAssetToBlockDraft,
    attachAssetToCanvasDraft,
    convertBlockTaskToTodo,
    selectAsset,
    openSelectedAsset,
    showSelectedAssetInFolder,
    importFiles,
    retryIndexJob,
    cancelIndexJob,
    clearPreviewCache,
    searchKnowledge,
    setSearchTypeFilter,
    setSearchScope,
    selectSearchResult,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useKnowledgeStore, import.meta.hot));
}
