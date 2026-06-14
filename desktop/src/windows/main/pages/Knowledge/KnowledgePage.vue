<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiColorPicker from '@/windows/main/components/ui/UiColorPicker.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPersonalizationConfig from '@/windows/main/components/ui/UiPersonalizationConfig.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiSliderField from '@/windows/main/components/ui/UiSliderField.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import KnowledgeBlockEditor from './components/KnowledgeBlockEditor.vue';
import KnowledgeCanvasEditor from './components/KnowledgeCanvasEditor.vue';
import KnowledgeConversionDialog from './components/KnowledgeConversionDialog.vue';
import KnowledgeMarkdownEditor from './components/KnowledgeMarkdownEditor.vue';
import KnowledgeTreeNode from './components/KnowledgeTreeNode.vue';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import { useTextPromptDialog } from '@/windows/main/composables/useTextPromptDialog';
import { notifyError, notifySuccess, notifyWarning } from '@/windows/main/composables/useInAppNotification';
import {
  resolveThemeBackground,
  withThemeBackground,
  type BackgroundConfirmPayload,
  type BackgroundStyleConfig,
  type BackgroundTheme,
} from '@/contracts/background';
import { useKnowledgeStore } from '@/windows/main/stores/knowledge_store';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import { useAiChatStore } from '@/windows/main/stores/ai_chat_store';
import { useAiConfigStore } from '@/windows/main/stores/ai_config_store';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import type { AiCitation } from '@/contracts/ai';
import type {
  KnowledgeAsset,
  KnowledgeIndexJob,
  KnowledgeLink,
  KnowledgeNode,
  KnowledgeQuickNoteDetail,
  KnowledgeSearchSourceType,
  KnowledgeTag,
} from '@/contracts/knowledge';
import type { KnowledgeBlockDocumentV2 } from '@/windows/main/utils/knowledge_blocks_v2';
import type { KnowledgeCanvasDocumentV2 } from '@/windows/main/utils/knowledge_canvas_v2';

type KnowledgeMarkdownEditorExpose = {
  insertTextAtSelection: (text: string) => void;
};

type KnowledgeDocumentPreviewKind = 'text' | 'pdf' | 'image' | 'slides' | 'sheets' | 'unsupported';
type KnowledgeConversionMode = 'markdown-to-block' | 'markdown-to-canvas' | 'block-to-markdown' | 'block-to-canvas' | 'canvas-to-markdown';
type KnowledgePersonalizationRegion = 'page' | 'left' | 'editor' | 'right';
type KnowledgeAiScope = 'page' | 'selection' | 'space' | 'library';

type KnowledgeAreaBackground = {
  type: 'color' | 'image' | 'video';
  color: string;
  image: string;
  video: string;
  backgroundStyle: BackgroundStyleConfig;
};

type KnowledgePersonalizationSettings = {
  pageBackground: KnowledgeAreaBackground;
  leftBackground: KnowledgeAreaBackground;
  editorBackground: KnowledgeAreaBackground;
  rightBackground: KnowledgeAreaBackground;
  blockStyle: KnowledgeBlockStyleSettings;
  selectionBackgroundColor: string;
  appearanceSchemes: KnowledgeAppearanceScheme[];
  activeAppearanceSchemeId: string;
};

type KnowledgeBlockSurfaceKey = 'base' | 'code' | 'table' | 'diagram' | 'callout' | 'quote' | 'inlineCode' | 'canvas';

type KnowledgeBlockSurfaceStyle = {
  backgroundColor: string;
  opacity: number;
};

type KnowledgeBlockStyleSettings = Record<KnowledgeBlockSurfaceKey, KnowledgeBlockSurfaceStyle>;

type KnowledgeAppearanceScheme = {
  id: string;
  name: string;
  pageBackground: KnowledgeAreaBackground;
  leftBackground: KnowledgeAreaBackground;
  editorBackground: KnowledgeAreaBackground;
  rightBackground: KnowledgeAreaBackground;
  blockStyle: KnowledgeBlockStyleSettings;
  selectionBackgroundColor: string;
  createdAt: string;
  updatedAt: string;
};

type KnowledgeLayoutSettings = {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  quickNotesCollapsed: boolean;
  recentCollapsed: boolean;
  favoritesCollapsed: boolean;
  leftWidth: number;
  rightWidth: number;
};

type KnowledgeDocumentPreviewSection = {
  index: number;
  label: string;
  text: string;
};

type KnowledgeDocumentPreviewSlide = {
  index: number;
  title: string;
  text: string;
};

type KnowledgeDocumentPreviewSheet = {
  index: number;
  name: string;
  rows: string[][];
  text: string;
};

type KnowledgeAssetMetadata = {
  originalPath?: string;
  importedAt?: string;
  extractionStatus?: string;
  extractionError?: unknown;
  extraction?: {
    extractor?: string;
    previewKind?: KnowledgeDocumentPreviewKind;
    sections?: KnowledgeDocumentPreviewSection[];
    slides?: KnowledgeDocumentPreviewSlide[];
    sheets?: KnowledgeDocumentPreviewSheet[];
  };
};

type KnowledgeDocumentExcerptContext = {
  section?: string;
  page?: number;
  slide?: number;
  sheet?: string;
  cellRange?: string;
};

type KnowledgeDocumentExcerptProperties = {
  sourceType?: string;
  sourceAssetId?: string;
  sourceDocumentId?: string;
  sourceTitle?: string;
  sourceAssetName?: string;
  sourcePreviewKind?: KnowledgeDocumentPreviewKind;
  sourceContext?: KnowledgeDocumentExcerptContext;
  excerptedAt?: string;
};

const store = useKnowledgeStore();
const appConfigStore = useAppConfigStore();
const aiChatStore = useAiChatStore();
const aiConfigStore = useAiConfigStore();
const route = useRoute();
const router = useRouter();
const todoStore = useTodoStore();
const { show: showConfirm } = useConfirmDialog();
const { show: showTextPrompt } = useTextPromptDialog();
const { open: openContextMenu } = useContextMenu();
const searchQuery = ref('');
const draftTitle = ref('');
const activeInspectorTab = ref('outline');
const selectedDocumentText = ref('');
const selectedDocumentContext = ref<KnowledgeDocumentExcerptContext | null>(null);
const knowledgeAiScope = ref<KnowledgeAiScope>('page');
const knowledgeAiQuestion = ref('');
const knowledgeAiConversationId = ref('');
const knowledgeAiError = ref('');
const markdownEditorRef = ref<KnowledgeMarkdownEditorExpose | null>(null);
const selectedTagColor = ref('#4A90D9');
const conversionMode = ref<KnowledgeConversionMode | null>(null);
const converting = ref(false);
const collapsedSpaceIds = ref<Set<string>>(new Set(loadCollapsedSpaceIds()));
const knowledgeLayoutStorageKey = 'knowledge.layout';
const knowledgeLayout = ref<KnowledgeLayoutSettings>(loadKnowledgeLayout());
const leftSidebarCollapsed = ref(knowledgeLayout.value.leftCollapsed);
const inspectorCollapsed = ref(knowledgeLayout.value.rightCollapsed);
const quickNotesCollapsed = ref(knowledgeLayout.value.quickNotesCollapsed);
const recentCollapsed = ref(knowledgeLayout.value.recentCollapsed);
const favoritesCollapsed = ref(knowledgeLayout.value.favoritesCollapsed);
const leftSidebarWidth = ref(knowledgeLayout.value.leftWidth);
const inspectorWidth = ref(knowledgeLayout.value.rightWidth);
const draggedSpaceId = ref<string | null>(null);
const rootDropSpaceId = ref<string | null>(null);
const knowledgePersonalizationStorageKey = 'knowledge.personalization';
const knowledgePersonalization = ref<KnowledgePersonalizationSettings>(loadKnowledgePersonalization());
const knowledgePersonalizationPanelOpen = ref(false);
const knowledgePersonalizationActiveRegion = ref<KnowledgePersonalizationRegion>('page');
const knowledgeBlockStylePanelOpen = ref(false);
let autosaveTimer: number | undefined;
let searchTimer: number | undefined;
let activeResize: { side: 'left' | 'right'; startX: number; startWidth: number } | null = null;
const handledKnowledgeOpenRequestIds = new Set<string>();

const inspectorTabs = [
  { id: 'outline', icon: 'iconify:lucide:list-tree', label: '目录' },
  { id: 'tags', icon: 'iconify:lucide:tags', label: '标签' },
  { id: 'backlinks', icon: 'iconify:lucide:link-2', label: '反链' },
  { id: 'attachments', icon: 'iconify:lucide:paperclip', label: '附件' },
  { id: 'todo', icon: 'iconify:lucide:check-square', label: 'Todo' },
  { id: 'graph', icon: 'iconify:lucide:network', label: '关系图' },
  { id: 'orphans', icon: 'iconify:lucide:unlink', label: '孤立页' },
  { id: 'ai', icon: 'iconify:lucide:bot', label: 'AI' },
];
const searchFilters: Array<{ value: KnowledgeSearchSourceType | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'page', label: '页面' },
  { value: 'document', label: '文档' },
  { value: 'quick_note', label: '速记' },
  { value: 'asset', label: '附件' },
];
const searchScopes = [
  { value: 'library' as const, label: '全库' },
  { value: 'space' as const, label: '当前空间' },
];
const knowledgeAiScopeOptions = [
  { value: 'page', label: '当前节点' },
  { value: 'selection', label: '选中文本' },
  { value: 'space', label: '当前空间' },
  { value: 'library', label: '当前知识库' },
];
const libraryOptions = computed(() =>
  store.libraries.map((library) => ({
    label: library.name,
    value: library.id,
  })),
);

const filteredNodes = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase();
  if (!keyword) return [];
  return store.visibleNodes.filter((node) => node.title.toLowerCase().includes(keyword)).slice(0, 20);
});
const selectedKindLabel = computed(() => {
  if (!store.selectedNode) return '未选择';
  if (store.selectedNode.nodeType === 'folder') return '文件夹';
  if (store.selectedNode.nodeType === 'quick_note') return '速记';
  if (store.selectedNode.nodeType === 'document') return '导入文档';
  if (store.selectedPage?.page.pageType === 'markdown') return 'Markdown 页面';
  if (store.selectedPage?.page.pageType === 'block') return '块页面';
  if (store.selectedPage?.page.pageType === 'canvas') return '画布页面';
  return '页面';
});
const conversionDialog = computed(() => {
  if (!conversionMode.value) return null;
  const labels: Record<KnowledgeConversionMode, { title: string; warning: string; confirmLabel: string }> = {
    'markdown-to-block': {
      title: '转换为块页面副本',
      warning: 'Markdown 转块页面可能有损，复杂 Markdown 会被转换为结构化块。',
      confirmLabel: '创建块副本',
    },
    'markdown-to-canvas': {
      title: '转换为画布副本',
      warning: 'Markdown 会转换为画布卡片摘要，复杂格式可能有损。',
      confirmLabel: '创建画布副本',
    },
    'block-to-markdown': {
      title: '导出为 Markdown 副本',
      warning: '块页面会导出为 Markdown 副本，原块页面不会被覆盖。',
      confirmLabel: '创建 Markdown 副本',
    },
    'block-to-canvas': {
      title: '转换为画布副本',
      warning: '块页面会转换为画布卡片摘要，嵌套和富文本不会无损保留。',
      confirmLabel: '创建画布副本',
    },
    'canvas-to-markdown': {
      title: '导出为 Markdown 摘要',
      warning: '画布只能转换为空间内容摘要，布局不会无损保留。',
      confirmLabel: '创建摘要副本',
    },
  };
  return labels[conversionMode.value];
});
const pageSuggestions = computed(() =>
  store.visibleNodes
    .filter((node) => node.nodeType === 'page' || node.nodeType === 'document')
    .map((node) => node.title)
    .filter(Boolean),
);
const missingPageLinks = computed(() =>
  store.pageLinks.filter((link) => link.linkType === 'wikilink' && link.targetType === 'missing_page' && link.targetUrl),
);
const linkedTodoLinks = computed(() =>
  store.pageLinks.filter((link) => link.targetType === 'todo' && link.targetId),
);
const tagColorOptions = ['#4A90D9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];
const knowledgeBlockSurfaceLabels: Record<KnowledgeBlockSurfaceKey, string> = {
  base: '通用块',
  code: '代码块',
  table: '表格',
  diagram: 'Mermaid / 数学',
  callout: '标注',
  quote: '引用',
  inlineCode: '行内代码',
  canvas: '画布元素',
};
const knowledgeBlockSurfaceOrder: KnowledgeBlockSurfaceKey[] = ['base', 'code', 'table', 'diagram', 'callout', 'quote', 'inlineCode', 'canvas'];
const knowledgeBlockStyleColorOptions = [
  '#ffffff',
  '#f8fafc',
  '#eef6ff',
  '#f5f3ff',
  '#ecfdf5',
  '#fff7ed',
  '#111827',
  'transparent',
];
const selectedQuickNote = computed(() => {
  if (store.selectedNode?.nodeType !== 'quick_note') return null;
  return store.quickNotes.find((note) => note.quickNote.id === store.selectedNode?.id) ?? null;
});
const knowledgeAiMessages = computed(() =>
  knowledgeAiConversationId.value
    ? aiChatStore.messagesByConversation[knowledgeAiConversationId.value] ?? []
    : [],
);
const knowledgeAiLatestAssistantMessage = computed(() =>
  [...knowledgeAiMessages.value].reverse().find((message) => message.role === 'assistant' && message.content.trim()),
);
const knowledgeAiScopeLabel = computed(() =>
  knowledgeAiScopeOptions.find((option) => option.value === knowledgeAiScope.value)?.label ?? '当前知识库',
);
const knowledgeAiCanAsk = computed(() =>
  Boolean(knowledgeAiQuestion.value.trim() && aiConfigStore.defaultProvider && aiConfigStore.defaultModel),
);
const selectedPageProperties = computed<KnowledgeDocumentExcerptProperties | null>(() => {
  if (!store.selectedPage?.page.propertiesJson) return null;
  try {
    const parsed = JSON.parse(store.selectedPage.page.propertiesJson) as unknown;
    return isRecord(parsed) ? normalizeExcerptProperties(parsed) : null;
  } catch {
    return null;
  }
});
const selectedDocumentExcerptSource = computed(() => {
  const properties = selectedPageProperties.value;
  return properties?.sourceType === 'document_excerpt' && properties.sourceDocumentId ? properties : null;
});
const selectedAssetMetadata = computed<KnowledgeAssetMetadata | null>(() => {
  if (!store.selectedAsset?.metadataJson) return null;
  try {
    const parsed = JSON.parse(store.selectedAsset.metadataJson) as unknown;
    return isRecord(parsed) ? normalizeAssetMetadata(parsed) : null;
  } catch {
    return null;
  }
});
const selectedExtractionError = computed(() => {
  const value = selectedAssetMetadata.value?.extractionError;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
});
const selectedExtraction = computed(() => selectedAssetMetadata.value?.extraction ?? null);
const selectedExtractor = computed(() => selectedExtraction.value?.extractor || '--');
const selectedImportedAt = computed(() => selectedAssetMetadata.value?.importedAt || store.selectedAsset?.createdAt || '');
const documentPreviewUrl = computed(() => store.selectedAsset ? toKnowledgeAssetUrl(store.selectedAsset) : '');
const documentPreviewKind = computed<KnowledgeDocumentPreviewKind>(() => {
  const metadataKind = selectedExtraction.value?.previewKind;
  if (metadataKind) return metadataKind;

  const asset = store.selectedAsset;
  if (!asset) return 'unsupported';
  if (asset.mimeType === 'application/pdf' || asset.extension.toLowerCase() === '.pdf') return 'pdf';
  if (asset.mimeType.startsWith('image/')) return 'image';
  if (asset.extension.toLowerCase() === '.pptx') return 'slides';
  if (asset.extension.toLowerCase() === '.xlsx') return 'sheets';
  return 'text';
});
const documentSections = computed(() => selectedExtraction.value?.sections ?? []);
const documentSlides = computed(() => selectedExtraction.value?.slides ?? []);
const documentSheets = computed(() => selectedExtraction.value?.sheets ?? []);
const knowledgeBackgroundTheme = computed<BackgroundTheme>(() =>
  appConfigStore.config.appearance.theme === 'dark' ? 'dark' : 'light',
);
const activeKnowledgePageBackground = computed(() => resolveKnowledgeBackground('page'));
const hasKnowledgePageBackground = computed(() => hasKnowledgeBackground(activeKnowledgePageBackground.value));
const knowledgePersonalizationPageStyle = computed<CSSProperties>(() =>
  createKnowledgeBackgroundStyle(activeKnowledgePageBackground.value),
);
const knowledgeBlockStyleVars = computed<CSSProperties>(() =>
  createKnowledgeBlockStyleVars(knowledgePersonalization.value.blockStyle),
);
const knowledgePersonalizationSidebarStyle = computed(() => knowledgePersonalizationRegionStyle('left'));
const knowledgePersonalizationEditorStyle = computed(() => knowledgePersonalizationRegionStyle('editor'));
const knowledgePersonalizationInspectorStyle = computed(() => knowledgePersonalizationRegionStyle('right'));
const knowledgeLayoutStyle = computed<CSSProperties>(() => ({
  '--knowledge-left-expanded-width': `${leftSidebarWidth.value}px`,
  '--knowledge-right-expanded-width': `${inspectorWidth.value}px`,
}));
const activeKnowledgePersonalizationBackground = computed(() =>
  resolveKnowledgeBackground(knowledgePersonalizationActiveRegion.value),
);
const knowledgePersonalizationPreviewSize = computed(() => {
  if (knowledgePersonalizationActiveRegion.value === 'left') return { width: 280, height: 640 };
  if (knowledgePersonalizationActiveRegion.value === 'right') return { width: 260, height: 640 };
  if (knowledgePersonalizationActiveRegion.value === 'editor') return { width: 720, height: 640 };
  return { width: 960, height: 640 };
});
const appearanceSchemeOptions = computed(() => [
  { label: '当前自定义', value: '__custom__' },
  ...knowledgePersonalization.value.appearanceSchemes.map((scheme) => ({
    label: scheme.name,
    value: scheme.id,
  })),
]);
const activeAppearanceSchemeSelectValue = computed(() =>
  knowledgePersonalization.value.activeAppearanceSchemeId || '__custom__',
);

function routeQueryString(key: string) {
  const value = route.query[key];
  return Array.isArray(value) ? value[0] ?? '' : typeof value === 'string' ? value : '';
}

async function handleKnowledgeOpenRequestFromRoute() {
  if (route.name !== 'Knowledge') return;

  const nodeId = routeQueryString('nodeId');
  if (!nodeId) return;

  const requestId = routeQueryString('openKnowledgeRequestId') || `legacy:${nodeId}`;
  if (handledKnowledgeOpenRequestIds.has(requestId)) return;
  handledKnowledgeOpenRequestIds.add(requestId);

  try {
    if (!store.libraries.length && !store.visibleNodes.length) {
      await store.initialize();
    }
    await store.selectNode(nodeId);
  } catch (error) {
    notifyError(error, '打开知识库结果失败');
  }
}

onMounted(() => {
  void store.initialize().then(() => handleKnowledgeOpenRequestFromRoute());
  aiChatStore.ensureStreamSubscription();
  void aiConfigStore.refresh();
  void aiChatStore.refreshConversations();
  window.addEventListener('focus', refreshQuickNotesOnFocus);
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('keydown', handleKnowledgePersonalizationKeydown);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('mousemove', handleKnowledgeSidebarResizeMove);
  window.addEventListener('mouseup', stopKnowledgeSidebarResize);
});

watch(
  [
    () => route.name,
    () => route.query.openKnowledgeRequestId,
    () => route.query.nodeId,
  ],
  () => {
    void handleKnowledgeOpenRequestFromRoute();
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshQuickNotesOnFocus);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('keydown', handleKnowledgePersonalizationKeydown);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('mousemove', handleKnowledgeSidebarResizeMove);
  window.removeEventListener('mouseup', stopKnowledgeSidebarResize);
  clearAutosaveTimer();
  clearSearchTimer();
  void saveDirtyDrafts();
});

watch(
  () => store.selectedNode?.title,
  (title) => {
    draftTitle.value = title ?? '';
  },
  { immediate: true },
);

watch(
  () => store.selectedNodeId,
  () => {
    selectedDocumentText.value = '';
    selectedDocumentContext.value = null;
  },
);

watch(
  () => searchQuery.value,
  (value) => {
    scheduleSearch(value);
  },
);

watch(
  knowledgePersonalization,
  (settings) => {
    persistKnowledgePersonalization(settings);
  },
  { deep: true },
);

watch(
  [
    leftSidebarCollapsed,
    inspectorCollapsed,
    quickNotesCollapsed,
    recentCollapsed,
    favoritesCollapsed,
    leftSidebarWidth,
    inspectorWidth,
  ],
  () => {
    const nextSettings: KnowledgeLayoutSettings = {
      leftCollapsed: leftSidebarCollapsed.value,
      rightCollapsed: inspectorCollapsed.value,
      quickNotesCollapsed: quickNotesCollapsed.value,
      recentCollapsed: recentCollapsed.value,
      favoritesCollapsed: favoritesCollapsed.value,
      leftWidth: leftSidebarWidth.value,
      rightWidth: inspectorWidth.value,
    };
    knowledgeLayout.value = nextSettings;
    persistKnowledgeLayout(nextSettings);
  },
);

function emptyKnowledgeAreaBackground(): KnowledgeAreaBackground {
  return {
    type: 'color',
    color: '',
    image: '',
    video: '',
    backgroundStyle: { opacity: 1 },
  };
}

function defaultKnowledgePersonalization(): KnowledgePersonalizationSettings {
  const blockStyle = defaultKnowledgeBlockStyle();
  const pageBackground = emptyKnowledgeAreaBackground();
  const leftBackground = emptyKnowledgeAreaBackground();
  const editorBackground = emptyKnowledgeAreaBackground();
  const rightBackground = emptyKnowledgeAreaBackground();
  const selectionBackgroundColor = defaultKnowledgeSelectionBackgroundColor();
  return {
    pageBackground,
    leftBackground,
    editorBackground,
    rightBackground,
    blockStyle,
    selectionBackgroundColor,
    appearanceSchemes: [
      createKnowledgeAppearanceScheme('默认通透', pageBackground, leftBackground, editorBackground, rightBackground, blockStyle, selectionBackgroundColor),
      createKnowledgeAppearanceScheme('柔和纸面', pageBackground, leftBackground, editorBackground, rightBackground, {
        ...blockStyle,
        base: { backgroundColor: '#f8fafc', opacity: 0.72 },
        code: { backgroundColor: '#f1f5f9', opacity: 0.84 },
        table: { backgroundColor: '#ffffff', opacity: 0.74 },
        diagram: { backgroundColor: '#f8fafc', opacity: 0.78 },
        callout: { backgroundColor: '#eef6ff', opacity: 0.82 },
        quote: { backgroundColor: '#ffffff', opacity: 0.58 },
        inlineCode: { backgroundColor: '#f1f5f9', opacity: 0.88 },
        canvas: { backgroundColor: '#ffffff', opacity: 0.64 },
      }, selectionBackgroundColor),
    ],
    activeAppearanceSchemeId: '',
  };
}

function defaultKnowledgeSelectionBackgroundColor() {
  return 'color-mix(in srgb, var(--ui-primary-color) 30%, transparent)';
}

function defaultKnowledgeBlockStyle(): KnowledgeBlockStyleSettings {
  return {
    base: { backgroundColor: '#ffffff', opacity: 0.24 },
    code: { backgroundColor: '#f8fafc', opacity: 0.44 },
    table: { backgroundColor: '#ffffff', opacity: 0.34 },
    diagram: { backgroundColor: '#f8fafc', opacity: 0.32 },
    callout: { backgroundColor: '#eef6ff', opacity: 0.42 },
    quote: { backgroundColor: '#ffffff', opacity: 0.24 },
    inlineCode: { backgroundColor: '#f1f5f9', opacity: 0.82 },
    canvas: { backgroundColor: '#ffffff', opacity: 0.42 },
  };
}

function createKnowledgeAppearanceScheme(
  name: string,
  pageBackground: KnowledgeAreaBackground,
  leftBackground: KnowledgeAreaBackground,
  editorBackground: KnowledgeAreaBackground,
  rightBackground: KnowledgeAreaBackground,
  blockStyle: KnowledgeBlockStyleSettings,
  selectionBackgroundColor: string,
): KnowledgeAppearanceScheme {
  const now = new Date().toISOString();
  return {
    id: `scheme-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    pageBackground: cloneKnowledgeAreaBackground(pageBackground),
    leftBackground: cloneKnowledgeAreaBackground(leftBackground),
    editorBackground: cloneKnowledgeAreaBackground(editorBackground),
    rightBackground: cloneKnowledgeAreaBackground(rightBackground),
    blockStyle: cloneKnowledgeBlockStyle(blockStyle),
    selectionBackgroundColor,
    createdAt: now,
    updatedAt: now,
  };
}

function loadKnowledgePersonalization(): KnowledgePersonalizationSettings {
  if (typeof window === 'undefined') return defaultKnowledgePersonalization();
  try {
    const raw = window.localStorage.getItem(knowledgePersonalizationStorageKey);
    if (!raw) return defaultKnowledgePersonalization();
    const parsed = JSON.parse(raw) as Partial<KnowledgePersonalizationSettings> & Record<string, unknown>;
    const defaults = defaultKnowledgePersonalization();
    return {
      pageBackground: normalizeKnowledgeAreaBackground(parsed.pageBackground, defaults.pageBackground),
      leftBackground: normalizeKnowledgeAreaBackground(parsed.leftBackground, defaults.leftBackground),
      editorBackground: normalizeKnowledgeAreaBackground(parsed.editorBackground, defaults.editorBackground),
      rightBackground: normalizeKnowledgeAreaBackground(parsed.rightBackground, defaults.rightBackground),
      blockStyle: normalizeKnowledgeBlockStyle(parsed.blockStyle, defaults.blockStyle),
      selectionBackgroundColor: normalizeKnowledgeSelectionBackgroundColor(parsed.selectionBackgroundColor, defaults.selectionBackgroundColor),
      appearanceSchemes: normalizeKnowledgeAppearanceSchemes(parsed.appearanceSchemes ?? parsed.blockStyleSchemes, defaults.appearanceSchemes),
      activeAppearanceSchemeId: typeof parsed.activeAppearanceSchemeId === 'string'
        ? parsed.activeAppearanceSchemeId
        : typeof parsed.activeBlockStyleSchemeId === 'string'
          ? parsed.activeBlockStyleSchemeId
          : '',
    };
  } catch {
    return defaultKnowledgePersonalization();
  }
}

function persistKnowledgePersonalization(settings: KnowledgePersonalizationSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(knowledgePersonalizationStorageKey, JSON.stringify(settings));
}

function defaultKnowledgeLayout(): KnowledgeLayoutSettings {
  return {
    leftCollapsed: false,
    rightCollapsed: false,
    quickNotesCollapsed: false,
    recentCollapsed: false,
    favoritesCollapsed: false,
    leftWidth: 280,
    rightWidth: 260,
  };
}

function normalizeKnowledgePanelWidth(value: unknown, fallback: number, min: number, max: number) {
  const width = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(width)) return fallback;
  return Math.min(max, Math.max(min, Math.round(width)));
}

function loadKnowledgeLayout(): KnowledgeLayoutSettings {
  const defaults = defaultKnowledgeLayout();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(knowledgeLayoutStorageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<KnowledgeLayoutSettings> & Record<string, unknown>;
    return {
      leftCollapsed: typeof parsed.leftCollapsed === 'boolean' ? parsed.leftCollapsed : defaults.leftCollapsed,
      rightCollapsed: typeof parsed.rightCollapsed === 'boolean' ? parsed.rightCollapsed : defaults.rightCollapsed,
      quickNotesCollapsed: typeof parsed.quickNotesCollapsed === 'boolean' ? parsed.quickNotesCollapsed : defaults.quickNotesCollapsed,
      recentCollapsed: typeof parsed.recentCollapsed === 'boolean' ? parsed.recentCollapsed : defaults.recentCollapsed,
      favoritesCollapsed: typeof parsed.favoritesCollapsed === 'boolean' ? parsed.favoritesCollapsed : defaults.favoritesCollapsed,
      leftWidth: normalizeKnowledgePanelWidth(parsed.leftWidth, defaults.leftWidth, 220, 420),
      rightWidth: normalizeKnowledgePanelWidth(parsed.rightWidth, defaults.rightWidth, 220, 420),
    };
  } catch {
    return defaults;
  }
}

function persistKnowledgeLayout(settings: KnowledgeLayoutSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(knowledgeLayoutStorageKey, JSON.stringify(settings));
}

function startKnowledgeSidebarResize(side: 'left' | 'right', event: MouseEvent) {
  if ((side === 'left' && leftSidebarCollapsed.value) || (side === 'right' && inspectorCollapsed.value)) return;
  event.preventDefault();
  activeResize = {
    side,
    startX: event.clientX,
    startWidth: side === 'left' ? leftSidebarWidth.value : inspectorWidth.value,
  };
  document.body.classList.add('knowledge-sidebar-resizing');
}

function handleKnowledgeSidebarResizeMove(event: MouseEvent) {
  if (!activeResize) return;
  const delta = event.clientX - activeResize.startX;
  if (activeResize.side === 'left') {
    leftSidebarWidth.value = normalizeKnowledgePanelWidth(activeResize.startWidth + delta, activeResize.startWidth, 220, 420);
    return;
  }
  inspectorWidth.value = normalizeKnowledgePanelWidth(activeResize.startWidth - delta, activeResize.startWidth, 220, 420);
}

function stopKnowledgeSidebarResize() {
  if (!activeResize) return;
  activeResize = null;
  document.body.classList.remove('knowledge-sidebar-resizing');
}

function normalizeKnowledgeAreaBackground(value: unknown, fallback: KnowledgeAreaBackground): KnowledgeAreaBackground {
  if (typeof value === 'string') {
    return { ...fallback, color: value };
  }

  if (!isRecord(value)) return fallback;
  const type = value.type === 'image' || value.type === 'video' || value.type === 'color' ? value.type : fallback.type;
  return {
    type,
    color: typeof value.color === 'string' ? value.color : '',
    image: typeof value.image === 'string' ? value.image : '',
    video: typeof value.video === 'string' ? value.video : '',
    backgroundStyle: isRecord(value.backgroundStyle) ? value.backgroundStyle as BackgroundStyleConfig : { opacity: 1 },
  };
}

function cloneKnowledgeAreaBackground(background: KnowledgeAreaBackground): KnowledgeAreaBackground {
  return JSON.parse(JSON.stringify(background)) as KnowledgeAreaBackground;
}

function normalizeKnowledgeBlockSurfaceStyle(value: unknown, fallback: KnowledgeBlockSurfaceStyle): KnowledgeBlockSurfaceStyle {
  if (!isRecord(value)) return { ...fallback };
  const opacity = typeof value.opacity === 'number' ? value.opacity : Number(value.opacity);
  return {
    backgroundColor: typeof value.backgroundColor === 'string' && value.backgroundColor.trim()
      ? value.backgroundColor
      : fallback.backgroundColor,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : fallback.opacity,
  };
}

function normalizeKnowledgeBlockStyle(value: unknown, fallback: KnowledgeBlockStyleSettings): KnowledgeBlockStyleSettings {
  const source = isRecord(value) ? value : {};
  return knowledgeBlockSurfaceOrder.reduce((style, key) => {
    style[key] = normalizeKnowledgeBlockSurfaceStyle(source[key], fallback[key]);
    return style;
  }, {} as KnowledgeBlockStyleSettings);
}

function cloneKnowledgeBlockStyle(style: KnowledgeBlockStyleSettings): KnowledgeBlockStyleSettings {
  return JSON.parse(JSON.stringify(style)) as KnowledgeBlockStyleSettings;
}

function normalizeKnowledgeSelectionBackgroundColor(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeKnowledgeAppearanceSchemes(value: unknown, fallback: KnowledgeAppearanceScheme[]): KnowledgeAppearanceScheme[] {
  if (!Array.isArray(value)) return fallback.map(cloneKnowledgeAppearanceScheme);
  const fallbackBlockStyle = defaultKnowledgeBlockStyle();
  const fallbackBackground = emptyKnowledgeAreaBackground();
  const fallbackSelectionBackgroundColor = defaultKnowledgeSelectionBackgroundColor();
  const schemes = value
    .filter(isRecord)
    .map((item, index) => {
      const pageBackground = normalizeKnowledgeAreaBackground(item.pageBackground, fallbackBackground);
      const leftBackground = normalizeKnowledgeAreaBackground(item.leftBackground, fallbackBackground);
      const editorBackground = normalizeKnowledgeAreaBackground(item.editorBackground, pageBackground);
      const rightBackground = normalizeKnowledgeAreaBackground(item.rightBackground, fallbackBackground);
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id : `legacy-${index}`,
        name: typeof item.name === 'string' && item.name.trim() ? item.name : `方案 ${index + 1}`,
        pageBackground,
        leftBackground,
        editorBackground,
        rightBackground,
        blockStyle: normalizeKnowledgeBlockStyle(item.blockStyle, fallbackBlockStyle),
        selectionBackgroundColor: normalizeKnowledgeSelectionBackgroundColor(item.selectionBackgroundColor, fallbackSelectionBackgroundColor),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
      };
    });
  return schemes.length ? schemes : fallback.map(cloneKnowledgeAppearanceScheme);
}

function cloneKnowledgeAppearanceScheme(scheme: KnowledgeAppearanceScheme): KnowledgeAppearanceScheme {
  return {
    ...scheme,
    pageBackground: cloneKnowledgeAreaBackground(scheme.pageBackground),
    leftBackground: cloneKnowledgeAreaBackground(scheme.leftBackground),
    editorBackground: cloneKnowledgeAreaBackground(scheme.editorBackground),
    rightBackground: cloneKnowledgeAreaBackground(scheme.rightBackground),
    blockStyle: cloneKnowledgeBlockStyle(scheme.blockStyle),
  };
}

function colorMixForKnowledgeBlock(surface: KnowledgeBlockSurfaceStyle) {
  if (surface.backgroundColor === 'transparent' || surface.opacity <= 0) return 'transparent';
  return `color-mix(in srgb, ${surface.backgroundColor} ${Math.round(surface.opacity * 100)}%, transparent)`;
}

function createKnowledgeBlockStyleVars(style: KnowledgeBlockStyleSettings): CSSProperties {
  return {
    '--knowledge-block-bg': colorMixForKnowledgeBlock(style.base),
    '--knowledge-block-code-bg': colorMixForKnowledgeBlock(style.code),
    '--knowledge-block-table-bg': colorMixForKnowledgeBlock(style.table),
    '--knowledge-block-table-cell-bg': colorMixForKnowledgeBlock(style.table),
    '--knowledge-block-diagram-bg': colorMixForKnowledgeBlock(style.diagram),
    '--knowledge-block-callout-bg': colorMixForKnowledgeBlock(style.callout),
    '--knowledge-block-quote-bg': colorMixForKnowledgeBlock(style.quote),
    '--knowledge-block-inline-code-bg': colorMixForKnowledgeBlock(style.inlineCode),
    '--knowledge-block-canvas-bg': colorMixForKnowledgeBlock(style.canvas),
    '--knowledge-md-block-bg': colorMixForKnowledgeBlock(style.base),
    '--knowledge-md-code-bg': colorMixForKnowledgeBlock(style.code),
    '--knowledge-md-table-bg': colorMixForKnowledgeBlock(style.table),
    '--knowledge-md-diagram-bg': colorMixForKnowledgeBlock(style.diagram),
    '--knowledge-md-callout-bg': colorMixForKnowledgeBlock(style.callout),
    '--knowledge-md-quote-bg': colorMixForKnowledgeBlock(style.quote),
    '--knowledge-md-inline-code-bg': colorMixForKnowledgeBlock(style.inlineCode),
    '--knowledge-canvas-element-bg': colorMixForKnowledgeBlock(style.canvas),
    '--knowledge-selection-bg': knowledgePersonalization.value.selectionBackgroundColor,
  } as CSSProperties;
}

function hasKnowledgeBackground(background: KnowledgeAreaBackground) {
  if (background.type === 'image') return Boolean(background.image.trim());
  if (background.type === 'video') return Boolean(background.video.trim());
  return Boolean(background.color.trim());
}

function createKnowledgeBackgroundStyle(background: KnowledgeAreaBackground): CSSProperties {
  if (!hasKnowledgeBackground(background)) return {};
  const style = background.backgroundStyle ?? {};
  if (background.type === 'image') {
    return {
      backgroundImage: `url(${background.image})`,
      backgroundSize: style.backgroundSize ?? 'cover',
      backgroundPosition: style.backgroundPosition ?? 'center',
      backgroundRepeat: style.backgroundRepeat ?? 'no-repeat',
    };
  }

  if (background.type === 'video') {
    return {
      background: background.color || 'color-mix(in srgb, var(--ui-surface-panel) 32%, transparent)',
    };
  }

  return {
    background: background.color,
  };
}

function knowledgePersonalizationRegionStyle(region: Exclude<KnowledgePersonalizationRegion, 'page'>) {
  return hasKnowledgePageBackground.value ? {} : createKnowledgeBackgroundStyle(resolveKnowledgeBackground(region));
}

function knowledgeBackgroundForRegion(region: KnowledgePersonalizationRegion) {
  if (region === 'page') return knowledgePersonalization.value.pageBackground;
  if (region === 'left') return knowledgePersonalization.value.leftBackground;
  if (region === 'editor') return knowledgePersonalization.value.editorBackground;
  return knowledgePersonalization.value.rightBackground;
}

function resolveKnowledgeBackground(region: KnowledgePersonalizationRegion): KnowledgeAreaBackground {
  return resolveThemeBackground(
    knowledgeBackgroundForRegion(region),
    knowledgeBackgroundTheme.value,
  ) as KnowledgeAreaBackground;
}

function openKnowledgePersonalizationMenu(event: MouseEvent, region: KnowledgePersonalizationRegion) {
  openContextMenu(event.clientX, event.clientY, [
    {
      id: 'knowledge-personalization-page',
      label: '设置知识库背景',
      action: () => openKnowledgePersonalizationPanel('page'),
    },
    {
      id: `knowledge-personalization-${region}`,
      label: '设置个性化',
      divided: true,
      action: () => openKnowledgePersonalizationPanel(region),
    },
  ]);
}

function openKnowledgeCreateMenu(event: MouseEvent) {
  openContextMenu(event.clientX, event.clientY, [
    {
      id: 'knowledge-create-markdown-page',
      label: '新建 Markdown 页面',
      action: () => void createRootPage(),
    },
    {
      id: 'knowledge-create-canvas-page',
      label: '新建画布页面',
      action: () => void createRootCanvasPage(),
    },
    {
      id: 'knowledge-create-block-page',
      label: '新建块页面',
      action: () => void createRootBlockPage(),
    },
    {
      id: 'knowledge-create-folder',
      label: '新建文件夹',
      divided: true,
      action: () => void createRootFolder(),
    },
    {
      id: 'knowledge-create-space',
      label: '新建空间',
      action: () => void createSpace(),
    },
    {
      id: 'knowledge-create-library',
      label: '新建知识库',
      action: () => void createLibrary(),
    },
  ]);
}

function openKnowledgePersonalizationPanel(region: KnowledgePersonalizationRegion) {
  knowledgePersonalizationActiveRegion.value = region;
  knowledgePersonalizationPanelOpen.value = true;
}

function handleKnowledgePersonalizationKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  knowledgePersonalizationPanelOpen.value = false;
}

function knowledgePersonalizationRegionLabel(region: KnowledgePersonalizationRegion) {
  if (region === 'left') return '左侧栏';
  if (region === 'editor') return '中间编辑区';
  if (region === 'right') return '右侧功能区';
  return '知识库背景';
}

function setKnowledgeBackgroundForRegion(region: KnowledgePersonalizationRegion, background: KnowledgeAreaBackground) {
  if (region === 'page') knowledgePersonalization.value.pageBackground = background;
  if (region === 'left') knowledgePersonalization.value.leftBackground = background;
  if (region === 'editor') knowledgePersonalization.value.editorBackground = background;
  if (region === 'right') knowledgePersonalization.value.rightBackground = background;
}

function markKnowledgeAppearanceCustom() {
  knowledgePersonalization.value.activeAppearanceSchemeId = '';
}

function handleKnowledgePersonalizationConfirm(payload: BackgroundConfirmPayload) {
  const region = knowledgePersonalizationActiveRegion.value;
  const nextBackground = withThemeBackground(
    knowledgeBackgroundForRegion(region),
    knowledgeBackgroundTheme.value,
    {
      type: payload.type,
      color: payload.color ?? '',
      image: payload.image ?? '',
      video: payload.video ?? '',
      backgroundStyle: payload.backgroundStyle ?? { opacity: 1 },
    },
  ) as KnowledgeAreaBackground;
  setKnowledgeBackgroundForRegion(region, nextBackground);
  markKnowledgeAppearanceCustom();
}

function handleKnowledgePersonalizationReset() {
  const defaults = defaultKnowledgePersonalization();
  const region = knowledgePersonalizationActiveRegion.value;
  const fallback = region === 'page'
    ? defaults.pageBackground
    : region === 'left'
      ? defaults.leftBackground
      : region === 'editor'
        ? defaults.editorBackground
        : defaults.rightBackground;
  const nextBackground = withThemeBackground(
    knowledgeBackgroundForRegion(region),
    knowledgeBackgroundTheme.value,
    fallback,
  ) as KnowledgeAreaBackground;
  setKnowledgeBackgroundForRegion(region, nextBackground);
  markKnowledgeAppearanceCustom();
}

function updateKnowledgeBlockSurfaceColor(surface: KnowledgeBlockSurfaceKey, color: string) {
  knowledgePersonalization.value.blockStyle[surface] = {
    ...knowledgePersonalization.value.blockStyle[surface],
    backgroundColor: color,
  };
  markKnowledgeAppearanceCustom();
}

function updateKnowledgeBlockSurfaceOpacity(surface: KnowledgeBlockSurfaceKey, opacityPercent: number) {
  knowledgePersonalization.value.blockStyle[surface] = {
    ...knowledgePersonalization.value.blockStyle[surface],
    opacity: Math.min(1, Math.max(0, opacityPercent / 100)),
  };
  markKnowledgeAppearanceCustom();
}

function resetKnowledgeBlockStyle() {
  knowledgePersonalization.value.blockStyle = defaultKnowledgeBlockStyle();
  markKnowledgeAppearanceCustom();
}

function updateKnowledgeSelectionBackgroundColor(color: string) {
  knowledgePersonalization.value.selectionBackgroundColor = normalizeKnowledgeSelectionBackgroundColor(color, defaultKnowledgeSelectionBackgroundColor());
  markKnowledgeAppearanceCustom();
}

async function saveCurrentKnowledgeAppearanceScheme() {
  const name = await showTextPrompt({
    title: '保存外观方案',
    label: '方案名称',
    initialValue: `外观方案 ${knowledgePersonalization.value.appearanceSchemes.length + 1}`,
    confirmText: '保存',
  });
  const trimmedName = name?.trim();
  if (!trimmedName) return;

  const scheme = createKnowledgeAppearanceScheme(
    trimmedName,
    knowledgeBackgroundForRegion('page'),
    knowledgeBackgroundForRegion('left'),
    knowledgeBackgroundForRegion('editor'),
    knowledgeBackgroundForRegion('right'),
    knowledgePersonalization.value.blockStyle,
    knowledgePersonalization.value.selectionBackgroundColor,
  );
  knowledgePersonalization.value.appearanceSchemes = [
    scheme,
    ...knowledgePersonalization.value.appearanceSchemes,
  ];
  knowledgePersonalization.value.activeAppearanceSchemeId = scheme.id;
  notifySuccess('已保存外观方案');
}

function applyKnowledgeAppearanceScheme(value: string | number) {
  const schemeId = String(value);
  if (schemeId === '__custom__') {
    knowledgePersonalization.value.activeAppearanceSchemeId = '';
    return;
  }
  const scheme = knowledgePersonalization.value.appearanceSchemes.find((item) => item.id === schemeId);
  if (!scheme) return;
  knowledgePersonalization.value.pageBackground = cloneKnowledgeAreaBackground(scheme.pageBackground);
  knowledgePersonalization.value.leftBackground = cloneKnowledgeAreaBackground(scheme.leftBackground);
  knowledgePersonalization.value.editorBackground = cloneKnowledgeAreaBackground(scheme.editorBackground);
  knowledgePersonalization.value.rightBackground = cloneKnowledgeAreaBackground(scheme.rightBackground);
  knowledgePersonalization.value.blockStyle = cloneKnowledgeBlockStyle(scheme.blockStyle);
  knowledgePersonalization.value.selectionBackgroundColor = scheme.selectionBackgroundColor;
  knowledgePersonalization.value.activeAppearanceSchemeId = scheme.id;
}

function deleteActiveKnowledgeAppearanceScheme() {
  const schemeId = knowledgePersonalization.value.activeAppearanceSchemeId;
  if (!schemeId) return;
  knowledgePersonalization.value.appearanceSchemes = knowledgePersonalization.value.appearanceSchemes
    .filter((scheme) => scheme.id !== schemeId);
  knowledgePersonalization.value.activeAppearanceSchemeId = '';
}

async function createSpace() {
  const name = await showTextPrompt({
    title: '新建空间',
    label: '空间名称',
    initialValue: '新空间',
    confirmText: '创建',
  });
  if (name) {
    await store.createSpace(name);
  }
}

async function createLibrary() {
  const name = await showTextPrompt({
    title: '新建知识库',
    label: '知识库名称',
    initialValue: '新知识库',
    confirmText: '创建',
  });
  if (name) {
    await store.createLibrary(name);
  }
}

function findLibrary(libraryId: string) {
  return store.libraries.find((library) => library.id === libraryId) ?? null;
}

function isDefaultLibrary(libraryId: string) {
  return Boolean(findLibrary(libraryId)?.isDefault);
}

async function renameLibrary(libraryId: string) {
  const library = findLibrary(libraryId);
  if (!library) return;
  const name = await showTextPrompt({
    title: '重命名知识库',
    label: '知识库名称',
    initialValue: library.name,
    confirmText: '保存',
  });
  if (name && name !== library.name) {
    await store.updateLibrary(library.id, { name });
  }
}

async function deleteLibrary(libraryId: string) {
  const library = findLibrary(libraryId);
  if (!library || library.isDefault) return;
  const ok = await showConfirm({
    title: '删除知识库',
    message: `删除「${library.name}」会移除该库下的空间、页面和资产记录。`,
    confirmText: '删除',
    danger: true,
  });
  if (ok) {
    await store.deleteLibrary(library.id);
  }
}

async function switchLibrary(value: string | number) {
  await store.switchLibrary(String(value));
}

async function renameSpace(spaceId: string, currentName: string) {
  const name = await showTextPrompt({
    title: '重命名空间',
    label: '空间名称',
    initialValue: currentName,
    confirmText: '保存',
  });
  if (name && name !== currentName) {
    await store.updateSpace(spaceId, { name });
  }
}

async function deleteSpace(spaceId: string, name: string) {
  const ok = await showConfirm({
    title: '删除空间',
    message: `删除「${name}」会隐藏空间内的文件。默认空间不能删除。`,
    confirmText: '删除',
    danger: true,
  });
  if (ok) {
    await store.deleteSpace(spaceId);
  }
}

function loadCollapsedSpaceIds() {
  try {
    const raw = window.localStorage.getItem('knowledge.collapsedSpaceIds');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function persistCollapsedSpaceIds() {
  window.localStorage.setItem('knowledge.collapsedSpaceIds', JSON.stringify([...collapsedSpaceIds.value]));
}

function isSpaceCollapsed(spaceId: string) {
  return collapsedSpaceIds.value.has(spaceId);
}

function toggleSpaceCollapsed(spaceId: string) {
  const next = new Set(collapsedSpaceIds.value);
  if (next.has(spaceId)) {
    next.delete(spaceId);
  } else {
    next.add(spaceId);
  }
  collapsedSpaceIds.value = next;
  persistCollapsedSpaceIds();
}

function handleSpaceDragStart(spaceId: string, event: DragEvent) {
  draggedSpaceId.value = spaceId;
  event.dataTransfer?.setData('text/plain', spaceId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

async function handleSpaceDrop(targetSpaceId: string) {
  const sourceSpaceId = draggedSpaceId.value;
  draggedSpaceId.value = null;
  if (!sourceSpaceId || sourceSpaceId === targetSpaceId) return;
  const orderedIds = store.spaces.map((space) => space.id);
  const fromIndex = orderedIds.indexOf(sourceSpaceId);
  const toIndex = orderedIds.indexOf(targetSpaceId);
  if (fromIndex < 0 || toIndex < 0) return;
  orderedIds.splice(fromIndex, 1);
  orderedIds.splice(toIndex, 0, sourceSpaceId);
  await store.reorderSpaces(orderedIds);
}

function readDraggedKnowledgeNodeId(event: DragEvent) {
  return event.dataTransfer?.getData('application/x-guyantools-knowledge-node')
    || event.dataTransfer?.getData('text/plain')
    || '';
}

function handleSpaceRootDragOver(spaceId: string, event: DragEvent) {
  const nodeId = readDraggedKnowledgeNodeId(event);
  if (!nodeId) return;
  const node = store.visibleNodes.find((item) => item.id === nodeId);
  if (!node || node.id === 'node-inbox' || node.spaceId !== spaceId) return;
  event.preventDefault();
  event.stopPropagation();
  rootDropSpaceId.value = spaceId;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function handleSpaceRootDragLeave(spaceId: string, event: DragEvent) {
  if (rootDropSpaceId.value === spaceId && event.currentTarget === event.target) {
    rootDropSpaceId.value = null;
  }
}

async function handleSpaceRootDrop(spaceId: string, event: DragEvent) {
  const nodeId = readDraggedKnowledgeNodeId(event);
  rootDropSpaceId.value = null;
  if (!nodeId) return;
  event.preventDefault();
  event.stopPropagation();
  await store.moveNodeToSpaceRoot(nodeId, spaceId);
}

async function createRootFolder() {
  const title = await showTextPrompt({
    title: '新建文件夹',
    label: '文件夹名称',
    initialValue: '新建文件夹',
    confirmText: '创建',
  });
  if (title) {
    await store.createFolder({
      spaceId: store.activeSpaceId || undefined,
      title,
    });
  }
}

async function createRootPage() {
  const title = await showTextPrompt({
    title: '新建 Markdown 页面',
    label: '页面标题',
    initialValue: '未命名页面',
    confirmText: '创建',
  });
  if (title) {
    await store.createMarkdownPage({
      spaceId: store.activeSpaceId || undefined,
      title,
    });
  }
}

async function createRootBlockPage() {
  const title = await showTextPrompt({
    title: '新建块页面',
    label: '页面标题',
    initialValue: '未命名块页面',
    confirmText: '创建',
  });
  if (title) {
    await store.createBlockPage({
      spaceId: store.activeSpaceId || undefined,
      title,
    });
  }
}

async function createRootCanvasPage() {
  const title = await showTextPrompt({
    title: '新建画布页面',
    label: '页面标题',
    initialValue: '未命名画布',
    confirmText: '创建',
  });
  if (title) {
    await store.createCanvasPage({
      spaceId: store.activeSpaceId || undefined,
      title,
    });
  }
}

async function openQuickNoteWindow() {
  await window.quickNoteWindowApi?.show();
}

async function importFiles() {
  const result = await store.importFiles();
  if (!result) return;
  if (result.imported.length) {
    notifySuccess(`已导入 ${result.imported.length} 个文件`, '知识库导入完成');
  }
  if (result.skipped.length) {
    notifyWarning(result.skipped.slice(0, 3).join('\n'), `跳过 ${result.skipped.length} 个文件`);
  }
}

async function retryIndexJob(job: KnowledgeIndexJob) {
  const result = await store.retryIndexJob(job.id);
  if (!result) return;
  if (result.imported.length) {
    notifySuccess('索引任务已重新执行', '知识库导入');
  }
}

async function cancelIndexJob(job: KnowledgeIndexJob) {
  const cancelled = await store.cancelIndexJob(job.id);
  if (cancelled) {
    notifySuccess('索引任务已取消', '知识库导入');
  }
}

async function openSelectedAsset() {
  await store.openSelectedAsset();
}

async function showSelectedAssetInFolder() {
  await store.showSelectedAssetInFolder();
}

async function createExcerptPageFromDocument() {
  if (!store.selectedPage || !store.selectedAsset) return;

  const selectedText = readCurrentDocumentSelection();
  if (!selectedText) {
    notifyWarning('请先在预览或“已抽取文本”中选择要摘录的文字', '没有可摘录文本');
    return;
  }

  const title = await showTextPrompt({
    title: '新建摘录页面',
    label: '页面标题',
    initialValue: `摘录 - ${store.selectedPage.node.title}`,
    confirmText: '创建',
  });
  if (!title) return;

  const excerptedAt = new Date().toISOString();
  const sourceTitle = store.selectedPage.node.title;
  const sourceContext = selectedDocumentContext.value ?? undefined;
  const contextLines = formatExcerptContext(sourceContext).map((line) => `> ${line}`);
  const markdown = [
    `> 来源：文档「${sourceTitle}」`,
    `> 文件：${store.selectedAsset.originalName}`,
    `> Asset ID：${store.selectedAsset.id}`,
    ...contextLines,
    `> 摘录时间：${new Date(excerptedAt).toLocaleString('zh-CN')}`,
    '',
    selectedText,
  ].join('\n');

  const page = await store.createDocumentExcerptPage({
    title,
    contentMarkdown: markdown,
    contentText: selectedText,
    propertiesJson: JSON.stringify({
      sourceType: 'document_excerpt',
      sourceAssetId: store.selectedAsset.id,
      sourceDocumentId: store.selectedPage.node.id,
      sourceTitle,
      sourceAssetName: store.selectedAsset.originalName,
      sourcePreviewKind: documentPreviewKind.value,
      sourceContext,
      excerptedAt,
    }),
  });
  if (page) {
    notifySuccess('摘录页面已创建', '知识库摘录');
  }
}

async function openExcerptSource() {
  const sourceDocumentId = selectedDocumentExcerptSource.value?.sourceDocumentId;
  if (!sourceDocumentId) return;
  await store.selectNode(sourceDocumentId);
}

async function askKnowledgeAi() {
  const question = knowledgeAiQuestion.value.trim();
  if (!question) return;

  knowledgeAiError.value = '';
  const selectedText = knowledgeAiScope.value === 'selection' ? readCurrentDocumentSelection() : '';
  if (knowledgeAiScope.value === 'selection' && !selectedText) {
    notifyWarning('请先在当前页面或文档预览中选择文字', '没有选中文本');
    return;
  }

  try {
    const conversation = await ensureKnowledgeAiConversation();
    const provider = aiConfigStore.defaultProvider;
    const model = aiConfigStore.defaultModel;
    if (!provider || !model) {
      throw new Error('请先在 AI 设置中配置可用的 Provider 和模型');
    }

    const content = [
      question,
      selectedText ? `\n选中文本：\n${selectedText.slice(0, 6000)}` : '',
    ].filter(Boolean).join('\n');
    await aiChatStore.sendMessage({
      conversationId: conversation.id,
      content,
      providerId: provider.id,
      modelId: model.id,
      maxHistoryMessages: 6,
      grounding: buildKnowledgeAiGrounding(),
      reasoning: { enabled: false },
    });
    knowledgeAiQuestion.value = '';
  } catch (error) {
    knowledgeAiError.value = error instanceof Error ? error.message : String(error);
    notifyError(error, '知识库 AI 问答失败');
  }
}

function setKnowledgeAiScope(value: string | number) {
  const normalized = String(value);
  knowledgeAiScope.value = normalized === 'selection'
    || normalized === 'space'
    || normalized === 'library'
    ? normalized
    : 'page';
}

async function ensureKnowledgeAiConversation() {
  await aiConfigStore.refresh();
  if (!aiChatStore.conversations.length) {
    await aiChatStore.refreshConversations();
  }
  const existing = aiChatStore.conversations.find((conversation) => conversation.id === knowledgeAiConversationId.value);
  if (existing) {
    await aiChatStore.setActiveConversation(existing.id);
    return existing;
  }

  const provider = aiConfigStore.defaultProvider;
  const model = aiConfigStore.defaultModel;
  if (!provider || !model) {
    throw new Error('请先在 AI 设置中配置可用的 Provider 和模型');
  }

  const conversation = await aiChatStore.createConversation({
    providerId: provider.id,
    modelId: model.id,
    title: `知识库问答 - ${store.activeLibrary?.name || '默认知识库'}`,
    systemPrompt: [
      '你是顾言工具的知识库问答助手。',
      '回答必须基于提供的知识库引用；如果没有足够来源，直接说明没有找到可验证来源。',
      '优先给出简洁结论，再列出依据。',
    ].join('\n'),
  });
  knowledgeAiConversationId.value = conversation.id;
  return conversation;
}

function buildKnowledgeAiGrounding() {
  const node = store.selectedNode;
  const isNodeScope = knowledgeAiScope.value === 'page' || knowledgeAiScope.value === 'selection';
  return {
    webSearchMode: 'off' as const,
    knowledgeSearchMode: 'force' as const,
    libraryId: store.activeLibraryId || undefined,
    spaceId: knowledgeAiScope.value === 'library'
      ? undefined
      : node?.spaceId || store.activeSpaceId || undefined,
    nodeId: isNodeScope ? node?.id : undefined,
    assetId: isNodeScope && store.selectedAsset ? store.selectedAsset.id : undefined,
    sourceType: isNodeScope ? selectedKnowledgeAiSourceType() : undefined,
  };
}

function selectedKnowledgeAiSourceType(): KnowledgeSearchSourceType | undefined {
  if (!store.selectedNode) return undefined;
  if (store.selectedNode.nodeType === 'quick_note') return 'quick_note';
  if (store.selectedNode.nodeType === 'document') return 'document';
  if (store.selectedAsset) return 'asset';
  return 'page';
}

async function openKnowledgeAiCitation(citation: AiCitation) {
  const metadata = citation.metadata ?? {};
  const nodeId = typeof metadata.nodeId === 'string' ? metadata.nodeId : citation.sourceId;
  const assetId = typeof metadata.assetId === 'string' ? metadata.assetId : undefined;
  if (nodeId) {
    await store.selectNode(nodeId);
  }
  if (assetId) {
    await store.selectAsset(assetId);
    activeInspectorTab.value = 'attachments';
  }
}

async function continueKnowledgeAiInWorkspace() {
  if (knowledgeAiConversationId.value) {
    await aiChatStore.setActiveConversation(knowledgeAiConversationId.value);
  }
  await router.push('/ai');
}

async function copyKnowledgeAiAnswer() {
  const answer = knowledgeAiLatestAssistantMessage.value?.content.trim();
  if (!answer) return;
  await navigator.clipboard.writeText(answer);
  notifySuccess('答案已复制', '知识库 AI');
}

async function saveKnowledgeAiAnswerAsPage() {
  const answer = knowledgeAiLatestAssistantMessage.value?.content.trim();
  if (!answer) return;
  const title = await showTextPrompt({
    title: '保存 AI 答案',
    label: '页面标题',
    initialValue: `AI 答案 - ${store.selectedNode?.title || store.activeLibrary?.name || '知识库'}`,
    confirmText: '保存',
  });
  if (!title) return;
  const page = await store.createDocumentExcerptPage({
    title,
    contentMarkdown: [
      `> 来源：知识库 AI 问答`,
      `> 范围：${knowledgeAiScopeLabel.value}`,
      knowledgeAiLatestAssistantMessage.value?.citations?.length
        ? `> 引用：${knowledgeAiLatestAssistantMessage.value.citations.map((citation) => citation.title).join('、')}`
        : '',
      '',
      answer,
    ].filter(Boolean).join('\n'),
    contentText: answer,
    propertiesJson: JSON.stringify({
      sourceType: 'ai_knowledge_answer',
      sourceConversationId: knowledgeAiConversationId.value,
      sourceMessageId: knowledgeAiLatestAssistantMessage.value?.id,
      scope: knowledgeAiScope.value,
      savedAt: new Date().toISOString(),
    }),
    spaceId: store.activeSpaceId || undefined,
  });
  if (page) {
    notifySuccess('AI 答案已保存为知识页', '知识库 AI');
  }
}

function refreshQuickNotesOnFocus() {
  store.refreshQuickNotes();
}

async function selectNode(node: KnowledgeNode) {
  await store.selectNode(node.id);
}

async function saveTitle() {
  if (!store.selectedNode) return;
  const title = draftTitle.value.trim();
  if (!title || title === store.selectedNode.title) return;
  await store.renameNode(store.selectedNode.id, title);
}

function clearAutosaveTimer() {
  if (autosaveTimer !== undefined) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = undefined;
  }
}

function clearSearchTimer() {
  if (searchTimer !== undefined) {
    window.clearTimeout(searchTimer);
    searchTimer = undefined;
  }
}

function hasUnsavedDraft() {
  return store.markdownDirty || store.blockDirty || store.canvasDirty;
}

async function saveDirtyDrafts() {
  if (store.markdownDirty) {
    await store.saveMarkdownDraft();
  }
  if (store.blockDirty) {
    await store.saveBlockDraft();
  }
  if (store.canvasDirty) {
    await store.saveCanvasDraft();
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedDraft()) return;
  void saveDirtyDrafts();
  event.preventDefault();
  event.returnValue = '';
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden' && hasUnsavedDraft()) {
    void saveDirtyDrafts();
  }
}

function scheduleSearch(value: string) {
  clearSearchTimer();
  searchTimer = window.setTimeout(() => {
    store.searchKnowledge(value);
  }, 220);
}

function scheduleAutosave() {
  clearAutosaveTimer();
  autosaveTimer = window.setTimeout(() => {
    if (store.markdownDirty) {
      store.saveMarkdownDraft();
    }
    if (store.blockDirty) {
      store.saveBlockDraft();
    }
    if (store.canvasDirty) {
      store.saveCanvasDraft();
    }
  }, 1200);
}

function updateMarkdown(value: string) {
  store.updateMarkdownDraft(value);
  scheduleAutosave();
}

async function saveMarkdown() {
  clearAutosaveTimer();
  await store.saveMarkdownDraft();
}

function updateBlockDocument(value: KnowledgeBlockDocumentV2) {
  store.updateBlockDraft(value);
  scheduleAutosave();
}

async function saveBlockDocument() {
  clearAutosaveTimer();
  await store.saveBlockDraft();
}

function updateCanvasDocument(value: KnowledgeCanvasDocumentV2) {
  store.updateCanvasDraft(value);
  scheduleAutosave();
}

async function saveCanvasDocument() {
  clearAutosaveTimer();
  await store.saveCanvasDraft();
}

async function confirmConversion() {
  const mode = conversionMode.value;
  if (!mode) return;
  converting.value = true;
  try {
    if (mode === 'markdown-to-block') {
      await store.convertSelectedPageToBlockCopy();
    } else if (mode === 'markdown-to-canvas') {
      await store.convertSelectedPageToCanvasCopy();
    } else if (mode === 'block-to-markdown') {
      await store.convertSelectedPageToMarkdownCopy();
    } else if (mode === 'block-to-canvas') {
      await store.convertSelectedPageToCanvasCopy();
    } else if (mode === 'canvas-to-markdown') {
      await store.convertSelectedPageToMarkdownCopy();
    }
    conversionMode.value = null;
  } finally {
    converting.value = false;
  }
}

async function handleBlockAssetFile(payload: { blockId: string; file: File; kind: 'image' | 'attachment' }) {
  const data = await payload.file.arrayBuffer();
  const asset = await store.saveAsset({
    originalName: payload.file.name || (payload.kind === 'image' ? 'block-image.png' : 'block-attachment'),
    mimeType: payload.file.type,
    data,
  });
  if (!asset) return;
  store.attachAssetToBlockDraft(payload.blockId, asset);
  scheduleAutosave();
}

async function handleCanvasAssetFile(payload: { elementId?: string; file: File; kind: 'image' | 'file'; position?: { x: number; y: number } }) {
  const data = await payload.file.arrayBuffer();
  const asset = await store.saveAsset({
    originalName: payload.file.name || (payload.kind === 'image' ? 'canvas-image.png' : 'canvas-file'),
    mimeType: payload.file.type,
    data,
  });
  if (!asset) return;
  store.attachAssetToCanvasDraft(payload.elementId ?? null, asset, payload.position);
  scheduleAutosave();
}

async function openBlockAsset(assetId: string) {
  try {
    await window.knowledgeApi?.openAsset(assetId);
  } catch (err) {
    notifyError(err, '打开块附件失败');
  }
}

async function showBlockAssetInFolder(assetId: string) {
  try {
    await window.knowledgeApi?.showAssetInFolder(assetId);
  } catch (err) {
    notifyError(err, '系统中显示块附件失败');
  }
}

async function convertBlockTodo(blockId: string) {
  const todo = await store.convertBlockTaskToTodo(blockId);
  if (todo) {
    notifySuccess('任务块已转为 Todo', '知识库块页面');
  }
}

async function createTagForCurrentSelection() {
  const name = await showTextPrompt({
    title: '新建标签',
    label: '标签名称',
    initialValue: '',
    confirmText: '创建',
  });
  if (!name) return;
  const tag = await store.createTag(name, selectedTagColor.value);
  if (tag) {
    await store.bindTagToSelected(tag);
  }
}

async function createTagForCurrentAsset() {
  const name = await showTextPrompt({
    title: '新建附件标签',
    label: '标签名称',
    initialValue: '',
    confirmText: '创建',
  });
  if (!name) return;
  const tag = await store.createTag(name, selectedTagColor.value);
  if (tag) {
    await store.bindTagToSelectedAsset(tag);
  }
}

async function bindExistingTag(tag: KnowledgeTag) {
  await store.bindTagToSelected(tag);
}

async function bindExistingTagToAsset(tag: KnowledgeTag) {
  await store.bindTagToSelectedAsset(tag);
}

async function createMissingLinkedPage(link: KnowledgeLink) {
  if (!store.selectedPage || !link.targetUrl) return;
  const page = await store.createMarkdownPage({
    title: link.targetUrl,
    parentId: store.selectedPage.node.parentId ?? undefined,
    spaceId: store.selectedPage.node.spaceId ?? undefined,
  });
  if (page) {
    notifySuccess(`已创建页面 ${page.node.title}`, '知识库双链');
  }
}

async function openLinkedTodo(todoId?: string) {
  if (!todoId) return;
  await router.push('/todo');
  await todoStore.switchView('all');
  todoStore.selectTodo(todoId);
}

async function selectTaggedTarget(nodeId?: string, assetId?: string) {
  if (nodeId) {
    await store.selectNode(nodeId);
    return;
  }
  if (assetId) {
    await store.selectAsset(assetId);
    activeInspectorTab.value = 'attachments';
  }
}

async function selectBlockAsset(assetId: string) {
  await store.selectAsset(assetId);
  activeInspectorTab.value = 'tags';
}

async function selectCanvasAsset(assetId: string) {
  await store.selectAsset(assetId);
  activeInspectorTab.value = 'tags';
}

async function openCanvasPageLink(pageRef: string) {
  const normalizedRef = pageRef.trim();
  if (!normalizedRef) return;
  const target = store.visibleNodes.find((node) =>
    (node.nodeType === 'page' || node.nodeType === 'document')
    && (node.id === normalizedRef || node.title === normalizedRef),
  );
  if (!target) {
    notifyWarning(`未找到页面：${normalizedRef}`, '画布页面链接');
    return;
  }
  await store.selectNode(target.id);
}

async function createChildPageFromSelection() {
  if (!store.selectedNode) return;
  const title = await showTextPrompt({
    title: '新建 Markdown 页面',
    label: '页面标题',
    initialValue: '未命名页面',
    confirmText: '创建',
  });
  if (title) {
    await store.createMarkdownPage({ parentId: store.selectedNode.id, title });
  }
}

async function createChildBlockPageFromSelection() {
  if (!store.selectedNode) return;
  const title = await showTextPrompt({
    title: '新建块页面',
    label: '页面标题',
    initialValue: '未命名块页面',
    confirmText: '创建',
  });
  if (title) {
    await store.createBlockPage({ parentId: store.selectedNode.id, title });
  }
}

async function createChildCanvasPageFromSelection() {
  if (!store.selectedNode) return;
  const title = await showTextPrompt({
    title: '新建画布页面',
    label: '页面标题',
    initialValue: '未命名画布',
    confirmText: '创建',
  });
  if (title) {
    await store.createCanvasPage({ parentId: store.selectedNode.id, title });
  }
}

async function createChildFolderFromSelection() {
  if (!store.selectedNode) return;
  const title = await showTextPrompt({
    title: '新建文件夹',
    label: '文件夹名称',
    initialValue: '新建文件夹',
    confirmText: '创建',
  });
  if (title) {
    await store.createFolder({ parentId: store.selectedNode.id, title });
  }
}

function toKnowledgeAssetUrl(asset: KnowledgeAsset) {
  return `app://knowledge-assets/id/${encodeURIComponent(asset.id)}/${encodeURIComponent(asset.originalName)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeAssetMetadata(value: Record<string, unknown>): KnowledgeAssetMetadata {
  const extraction = isRecord(value.extraction) ? value.extraction : {};
  return {
    originalPath: typeof value.originalPath === 'string' ? value.originalPath : undefined,
    importedAt: typeof value.importedAt === 'string' ? value.importedAt : undefined,
    extractionStatus: typeof value.extractionStatus === 'string' ? value.extractionStatus : undefined,
    extractionError: value.extractionError,
    extraction: {
      extractor: typeof extraction.extractor === 'string' ? extraction.extractor : undefined,
      previewKind: normalizePreviewKind(extraction.previewKind),
      sections: normalizePreviewSections(extraction.sections),
      slides: normalizePreviewSlides(extraction.slides),
      sheets: normalizePreviewSheets(extraction.sheets),
    },
  };
}

function normalizeExcerptProperties(value: Record<string, unknown>): KnowledgeDocumentExcerptProperties {
  const context = isRecord(value.sourceContext) ? value.sourceContext : null;
  return {
    sourceType: typeof value.sourceType === 'string' ? value.sourceType : undefined,
    sourceAssetId: typeof value.sourceAssetId === 'string' ? value.sourceAssetId : undefined,
    sourceDocumentId: typeof value.sourceDocumentId === 'string' ? value.sourceDocumentId : undefined,
    sourceTitle: typeof value.sourceTitle === 'string' ? value.sourceTitle : undefined,
    sourceAssetName: typeof value.sourceAssetName === 'string' ? value.sourceAssetName : undefined,
    sourcePreviewKind: normalizePreviewKind(value.sourcePreviewKind),
    sourceContext: context ? normalizeExcerptContext(context) : undefined,
    excerptedAt: typeof value.excerptedAt === 'string' ? value.excerptedAt : undefined,
  };
}

function normalizeExcerptContext(value: Record<string, unknown>): KnowledgeDocumentExcerptContext {
  return {
    section: typeof value.section === 'string' ? value.section : undefined,
    page: typeof value.page === 'number' ? value.page : undefined,
    slide: typeof value.slide === 'number' ? value.slide : undefined,
    sheet: typeof value.sheet === 'string' ? value.sheet : undefined,
    cellRange: typeof value.cellRange === 'string' ? value.cellRange : undefined,
  };
}

function normalizePreviewKind(value: unknown): KnowledgeDocumentPreviewKind | undefined {
  return value === 'text'
    || value === 'pdf'
    || value === 'image'
    || value === 'slides'
    || value === 'sheets'
    || value === 'unsupported'
    ? value
    : undefined;
}

function normalizePreviewSections(value: unknown): KnowledgeDocumentPreviewSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => ({
      index: typeof item.index === 'number' ? item.index : index + 1,
      label: typeof item.label === 'string' ? item.label : `Section ${index + 1}`,
      text: typeof item.text === 'string' ? item.text : '',
    }))
    .filter((item) => item.text.trim());
}

function normalizePreviewSlides(value: unknown): KnowledgeDocumentPreviewSlide[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => ({
      index: typeof item.index === 'number' ? item.index : index + 1,
      title: typeof item.title === 'string' && item.title.trim() ? item.title : `Slide ${index + 1}`,
      text: typeof item.text === 'string' ? item.text : '',
    }))
    .filter((item) => item.text.trim());
}

function normalizePreviewSheets(value: unknown): KnowledgeDocumentPreviewSheet[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => ({
      index: typeof item.index === 'number' ? item.index : index + 1,
      name: typeof item.name === 'string' && item.name.trim() ? item.name : `Sheet ${index + 1}`,
      rows: normalizeSheetRows(item.rows),
      text: typeof item.text === 'string' ? item.text : '',
    }))
    .filter((item) => item.rows.length || item.text.trim());
}

function normalizeSheetRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(Array.isArray)
    .map((row) => row.filter((cell): cell is string => typeof cell === 'string'))
    .filter((row) => row.some((cell) => cell.trim()));
}

function captureSelectedDocumentText(event?: MouseEvent) {
  const value = window.getSelection()?.toString().trim() ?? '';
  if (value) {
    selectedDocumentText.value = value;
    selectedDocumentContext.value = readExcerptContextFromTarget(event?.target);
  }
}

function readCurrentDocumentSelection() {
  const liveSelection = window.getSelection()?.toString().trim() ?? '';
  const selectedText = liveSelection || selectedDocumentText.value;
  selectedDocumentText.value = selectedText;
  return selectedText;
}

function readExcerptContextFromTarget(target: EventTarget | null | undefined): KnowledgeDocumentExcerptContext | null {
  const element = target instanceof Element
    ? target.closest<HTMLElement>('[data-excerpt-section], [data-excerpt-slide], [data-excerpt-sheet], [data-excerpt-cell]')
    : null;
  if (!element) return null;

  const slide = numberFromDataset(element.dataset.excerptSlide);
  const row = numberFromDataset(element.dataset.excerptRow);
  const column = numberFromDataset(element.dataset.excerptColumn);
  return {
    section: element.dataset.excerptSection,
    slide,
    sheet: element.dataset.excerptSheet,
    cellRange: row && column ? `${columnNumberToName(column)}${row}` : undefined,
  };
}

function numberFromDataset(value?: string) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function columnNumberToName(value: number) {
  let column = value;
  let label = '';
  while (column > 0) {
    column -= 1;
    label = String.fromCharCode(65 + (column % 26)) + label;
    column = Math.floor(column / 26);
  }
  return label || String(value);
}

function formatExcerptContext(context?: KnowledgeDocumentExcerptContext) {
  if (!context) return [];
  return [
    context.page ? `页码：${context.page}` : '',
    context.slide ? `Slide：${context.slide}` : '',
    context.sheet ? `Sheet：${context.sheet}` : '',
    context.cellRange ? `Cell：${context.cellRange}` : '',
    context.section ? `段落：${context.section}` : '',
  ].filter(Boolean);
}

async function uploadMarkdownAssetUrl(file: File, kind: 'image' | 'attachment') {
  const data = await file.arrayBuffer();
  const asset = await store.saveAsset({
    originalName: file.name || (kind === 'image' ? 'pasted-image.png' : 'attachment'),
    mimeType: file.type,
    data,
  });
  return asset ? toKnowledgeAssetUrl(asset) : null;
}

async function handleEditorAssetFile(payload: { file: File; kind: 'image' | 'attachment' }) {
  const href = await uploadMarkdownAssetUrl(payload.file, payload.kind);
  if (!href) return;

  const fallbackName = payload.kind === 'image' ? 'pasted-image.png' : 'attachment';
  const safeName = (payload.file.name || fallbackName).replace(/[\[\]\n\r]/g, ' ');
  const link = payload.kind === 'image'
    ? `![${safeName}](${href})`
    : `[${safeName}](${href})`;
  markdownEditorRef.value?.insertTextAtSelection(`\n${link}\n`);
}

function formatDateTime(value?: string) {
  if (!value) return '--';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function quickNoteTags(note: KnowledgeQuickNoteDetail) {
  try {
    const parsed = JSON.parse(note.quickNote.tagsJson);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

function quickNotePreview(note: KnowledgeQuickNoteDetail) {
  return note.quickNote.body.replace(/\s+/g, ' ').trim().slice(0, 120) || '空速记';
}

function searchResultIcon(sourceType: string) {
  if (sourceType === 'document') return 'iconify:lucide:file-search';
  if (sourceType === 'quick_note') return 'iconify:lucide:sticky-note';
  if (sourceType === 'asset') return 'iconify:lucide:paperclip';
  return 'iconify:lucide:file-type';
}

function searchResultTypeLabel(sourceType: string) {
  if (sourceType === 'document') return '文档';
  if (sourceType === 'quick_note') return '速记';
  if (sourceType === 'asset') return '附件';
  return '页面';
}

function formatFileSize(value?: number) {
  if (!value) return '--';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}
</script>

<template>
  <section
    class="knowledge-page"
    :class="{
      'knowledge-page--custom-background': hasKnowledgePageBackground,
      'knowledge-page--left-collapsed': leftSidebarCollapsed,
      'knowledge-page--right-collapsed': inspectorCollapsed,
    }"
    :style="[knowledgePersonalizationPageStyle, knowledgeBlockStyleVars, knowledgeLayoutStyle]"
    aria-label="知识库"
  >
    <header class="knowledge-toolbar">
      <div class="knowledge-toolbar__title">
        <span class="knowledge-toolbar__icon">
          <IconRenderer icon="iconify:lucide:library-big" :size="20" />
        </span>
        <div class="knowledge-toolbar__heading">
          <h1>知识库</h1>
          <p>{{ store.activeLibrary?.name || '默认知识库' }}</p>
        </div>
      </div>

      <div class="knowledge-toolbar__library" aria-label="当前知识库">
        <UiSelect
          :model-value="store.activeLibraryId"
          :options="libraryOptions"
          size="sm"
          placeholder="选择知识库"
          @update:model-value="switchLibrary"
        >
          <template #prefix>
            <IconRenderer icon="iconify:lucide:database" :size="15" />
          </template>
          <template #option="{ option, selected }">
            <span class="knowledge-library-option">
              <span class="knowledge-library-option__check">
                <IconRenderer v-if="selected" icon="iconify:lucide:check" :size="14" />
              </span>
              <span class="knowledge-library-option__name">{{ option.label }}</span>
              <span class="knowledge-library-option__actions">
                <UiIconButton
                  type="button"
                  title="重命名知识库"
                  size="sm"
                  :disabled="store.saving"
                  @click.stop="renameLibrary(String(option.value))"
                >
                  <IconRenderer icon="iconify:lucide:pencil" :size="13" />
                </UiIconButton>
                <UiIconButton
                  type="button"
                  title="删除知识库"
                  size="sm"
                  :disabled="store.saving || isDefaultLibrary(String(option.value))"
                  @click.stop="deleteLibrary(String(option.value))"
                >
                  <IconRenderer icon="iconify:lucide:trash-2" :size="13" />
                </UiIconButton>
              </span>
            </span>
          </template>
        </UiSelect>
      </div>

      <label class="knowledge-toolbar__search" aria-label="搜索当前知识库">
        <UiInput v-model="searchQuery" class="knowledge-toolbar__search-input" type="search" size="sm" placeholder="搜索当前库">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:search" :size="16" />
          </template>
        </UiInput>
      </label>

      <div class="knowledge-toolbar__actions" aria-label="知识库操作">
        <UiIconButton
          type="button"
          :title="leftSidebarCollapsed ? '展开左侧栏' : '收起左侧栏'"
          size="sm"
          :active="!leftSidebarCollapsed"
          @click="leftSidebarCollapsed = !leftSidebarCollapsed"
        >
          <IconRenderer :icon="leftSidebarCollapsed ? 'iconify:lucide:panel-left-open' : 'iconify:lucide:panel-left-close'" :size="15" />
        </UiIconButton>
        <UiIconButton
          type="button"
          :title="inspectorCollapsed ? '展开右侧栏' : '收起右侧栏'"
          size="sm"
          :active="!inspectorCollapsed"
          @click="inspectorCollapsed = !inspectorCollapsed"
        >
          <IconRenderer :icon="inspectorCollapsed ? 'iconify:lucide:panel-right-open' : 'iconify:lucide:panel-right-close'" :size="15" />
        </UiIconButton>
        <UiButton type="button" variant="secondary" size="sm" @click="openKnowledgePersonalizationPanel('page')">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:palette" :size="15" />
          </template>
          个性化
        </UiButton>
        <UiSelect
          class="knowledge-toolbar__scheme-select"
          :model-value="activeAppearanceSchemeSelectValue"
          :options="appearanceSchemeOptions"
          size="sm"
          placeholder="外观方案"
          @update:model-value="applyKnowledgeAppearanceScheme"
        >
          <template #prefix>
            <IconRenderer icon="iconify:lucide:swatch-book" :size="14" />
          </template>
        </UiSelect>
        <UiButton type="button" variant="secondary" size="sm" @click="knowledgeBlockStylePanelOpen = true">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:sliders-horizontal" :size="15" />
          </template>
          外观方案
        </UiButton>
        <UiButton type="button" variant="secondary" size="sm" @click="openQuickNoteWindow">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:sticky-note" :size="15" />
          </template>
          速记
        </UiButton>
        <UiButton type="button" variant="secondary" size="sm" :disabled="store.importing" @click="importFiles">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:upload" :size="15" />
          </template>
          导入
        </UiButton>
        <UiButton type="button" variant="secondary" size="sm" :disabled="store.saving" @click="openKnowledgeCreateMenu">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:more-horizontal" :size="15" />
          </template>
          更多
        </UiButton>
      </div>
    </header>

    <div v-if="store.error" class="knowledge-error" role="alert">
      <IconRenderer icon="iconify:lucide:circle-alert" :size="16" />
      <span>{{ store.error }}</span>
      <UiButton type="button" variant="danger" size="sm" @click="store.initialize">重试</UiButton>
    </div>

    <div class="knowledge-shell">
      <aside
        class="knowledge-sidebar"
        :style="knowledgePersonalizationSidebarStyle"
        aria-label="知识库目录"
        @contextmenu.prevent="openKnowledgePersonalizationMenu($event, 'left')"
      >
        <div class="knowledge-sidebar__header">
          <span>资料树</span>
          <span class="knowledge-sidebar__header-actions">
            <UiIconButton type="button" title="新建空间" size="sm" :disabled="store.saving" @click="createSpace">
              <IconRenderer icon="iconify:lucide:plus" :size="15" />
            </UiIconButton>
            <UiIconButton type="button" title="收起左侧栏" size="sm" @click="leftSidebarCollapsed = true">
              <IconRenderer icon="iconify:lucide:panel-left-close" :size="15" />
            </UiIconButton>
          </span>
        </div>

        <UiScrollbar v-if="!leftSidebarCollapsed" class="knowledge-tree" :x="false" :y="true" :size="6">
          <section v-if="searchQuery.trim()" class="knowledge-tree__section">
            <h2>搜索</h2>
            <div class="knowledge-search-scope" aria-label="搜索范围">
              <UiButton
                v-for="scope in searchScopes"
                :key="scope.value"
                type="button"
                variant="ghost"
                size="sm"
                :class="{ 'knowledge-search-scope__item--active': store.searchScope === scope.value }"
                :active="store.searchScope === scope.value"
                :aria-pressed="store.searchScope === scope.value"
                @click="store.setSearchScope(scope.value)"
              >
                {{ scope.label }}
              </UiButton>
            </div>
            <div class="knowledge-search-filters" aria-label="搜索类型过滤">
              <UiButton
                v-for="filter in searchFilters"
                :key="filter.value"
                type="button"
                variant="ghost"
                size="sm"
                :class="{ 'knowledge-search-filters__item--active': store.searchTypeFilter === filter.value }"
                :active="store.searchTypeFilter === filter.value"
                :aria-pressed="store.searchTypeFilter === filter.value"
                @click="store.setSearchTypeFilter(filter.value)"
              >
                {{ filter.label }}
              </UiButton>
            </div>
            <div v-if="store.searching" class="knowledge-empty-line">搜索中...</div>
            <UiButton
              v-for="result in store.searchResults"
              :key="`${result.sourceType}-${result.sourceId}`"
              class="knowledge-search-result"
              type="button"
              variant="ghost"
              size="sm"
              @click="store.selectSearchResult(result)"
            >
              <template #prefix>
                <IconRenderer :icon="searchResultIcon(result.sourceType)" :size="15" />
              </template>
              <span>
                <strong>{{ result.title }}</strong>
                <small>{{ searchResultTypeLabel(result.sourceType) }} · {{ result.snippet || '命中文档标题' }}</small>
              </span>
            </UiButton>
            <div v-if="!store.searching && !store.searchResults.length" class="knowledge-empty-line">全文搜索暂无结果</div>
            <h2 class="knowledge-tree__subheading">标题匹配</h2>
            <UiButton
              v-for="node in filteredNodes"
              :key="node.id"
              class="knowledge-shortcut"
              type="button"
              variant="ghost"
              size="sm"
              :class="{ 'knowledge-shortcut--active': store.selectedNodeId === node.id }"
              :active="store.selectedNodeId === node.id"
              :aria-pressed="store.selectedNodeId === node.id"
              @click="selectNode(node)"
            >
              <template #prefix>
                <IconRenderer :icon="node.icon ? `iconify:lucide:${node.icon}` : (node.nodeType === 'folder' ? 'iconify:lucide:folder' : 'iconify:lucide:file-type')" :size="15" />
              </template>
              <span>{{ node.title }}</span>
            </UiButton>
            <div v-if="!filteredNodes.length" class="knowledge-empty-line">没有匹配结果</div>
          </section>

          <section class="knowledge-tree__section">
            <h2>快捷入口</h2>
            <UiButton
              v-if="store.inboxNode"
              class="knowledge-shortcut"
              type="button"
              variant="ghost"
              size="sm"
              :class="{ 'knowledge-shortcut--active': store.selectedNodeId === store.inboxNode.id }"
              :active="store.selectedNodeId === store.inboxNode.id"
              :aria-pressed="store.selectedNodeId === store.inboxNode.id"
              @click="selectNode(store.inboxNode)"
            >
              <template #prefix>
                <IconRenderer icon="iconify:lucide:inbox" :size="15" />
              </template>
              <span>快速收集箱</span>
              <template #suffix>
                <strong>{{ store.childrenFor(store.inboxNode.id).length }}</strong>
              </template>
            </UiButton>
            <div class="knowledge-quick-notes">
              <div class="knowledge-quick-notes__head">
                <span>
                  <IconRenderer icon="iconify:lucide:sticky-note" :size="14" />
                  速记
                </span>
                <span class="knowledge-panel-toggle-group">
                  <UiIconButton
                    type="button"
                    :title="quickNotesCollapsed ? '展开速记' : '收起速记'"
                    size="sm"
                    @click="quickNotesCollapsed = !quickNotesCollapsed"
                  >
                    <IconRenderer :icon="quickNotesCollapsed ? 'iconify:lucide:chevron-right' : 'iconify:lucide:chevron-down'" :size="14" />
                  </UiIconButton>
                  <UiIconButton type="button" title="打开速记窗口" size="sm" @click="openQuickNoteWindow">
                    <IconRenderer icon="iconify:lucide:plus" :size="14" />
                  </UiIconButton>
                </span>
              </div>
              <Transition name="knowledge-collapse">
                <div v-if="!quickNotesCollapsed" class="knowledge-collapsible-body">
                  <label class="knowledge-quick-notes__search" aria-label="搜索速记">
                    <UiInput v-model="store.quickNoteSearch" class="knowledge-quick-notes__search-input" type="search" size="sm" placeholder="搜索速记">
                      <template #prefix>
                        <IconRenderer icon="iconify:lucide:search" :size="13" />
                      </template>
                    </UiInput>
                  </label>
                  <UiButton
                    v-for="note in store.visibleQuickNotes.slice(0, 5)"
                    :key="note.quickNote.id"
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="knowledge-quick-note"
                    :class="[
                      `knowledge-quick-note--${note.quickNote.color}`,
                      { 'knowledge-quick-note--active': store.selectedNodeId === note.quickNote.id },
                    ]"
                    :active="store.selectedNodeId === note.quickNote.id"
                    :aria-pressed="store.selectedNodeId === note.quickNote.id"
                    @click="store.selectNode(note.quickNote.id)"
                  >
                    <strong>{{ note.quickNote.title }}</strong>
                    <span>{{ quickNotePreview(note) }}</span>
                  </UiButton>
                  <div v-if="!store.visibleQuickNotes.length" class="knowledge-empty-line">暂无速记</div>
                </div>
              </Transition>
            </div>
            <div class="knowledge-mini-list">
              <div class="knowledge-mini-list__label">
                <IconRenderer icon="iconify:lucide:clock-3" :size="14" />
                <span>最近编辑</span>
                <UiIconButton
                  type="button"
                  :title="recentCollapsed ? '展开最近编辑' : '收起最近编辑'"
                  size="sm"
                  @click="recentCollapsed = !recentCollapsed"
                >
                  <IconRenderer :icon="recentCollapsed ? 'iconify:lucide:chevron-right' : 'iconify:lucide:chevron-down'" :size="13" />
                </UiIconButton>
              </div>
              <Transition name="knowledge-collapse">
                <div v-if="!recentCollapsed" class="knowledge-collapsible-body">
                  <UiButton
                    v-for="node in store.recentNodes.slice(0, 4)"
                    :key="`recent-${node.id}`"
                    type="button"
                    variant="ghost"
                    size="sm"
                    :class="{ 'knowledge-mini-list__item--active': store.selectedNodeId === node.id }"
                    class="knowledge-mini-list__item"
                    :active="store.selectedNodeId === node.id"
                    :aria-pressed="store.selectedNodeId === node.id"
                    @click="selectNode(node)"
                  >
                    <span>{{ node.title }}</span>
                    <template #suffix>
                      <time>{{ formatDateTime(node.updatedAt) }}</time>
                    </template>
                  </UiButton>
                </div>
              </Transition>
            </div>
            <div class="knowledge-mini-list">
              <div class="knowledge-mini-list__label">
                <IconRenderer icon="iconify:lucide:star" :size="14" />
                <span>收藏</span>
                <strong>{{ store.favoriteNodes.length }}</strong>
                <UiIconButton
                  type="button"
                  :title="favoritesCollapsed ? '展开收藏' : '收起收藏'"
                  size="sm"
                  @click="favoritesCollapsed = !favoritesCollapsed"
                >
                  <IconRenderer :icon="favoritesCollapsed ? 'iconify:lucide:chevron-right' : 'iconify:lucide:chevron-down'" :size="13" />
                </UiIconButton>
              </div>
              <Transition name="knowledge-collapse">
                <div v-if="!favoritesCollapsed" class="knowledge-collapsible-body">
                  <UiButton
                    v-for="node in store.favoriteNodes.slice(0, 4)"
                    :key="`favorite-${node.id}`"
                    type="button"
                    variant="ghost"
                    size="sm"
                    :class="{ 'knowledge-mini-list__item--active': store.selectedNodeId === node.id }"
                    class="knowledge-mini-list__item"
                    :active="store.selectedNodeId === node.id"
                    :aria-pressed="store.selectedNodeId === node.id"
                    @click="selectNode(node)"
                  >
                    <span>{{ node.title }}</span>
                    <template #suffix>
                      <time>{{ formatDateTime(node.updatedAt) }}</time>
                    </template>
                  </UiButton>
                  <div v-if="!store.favoriteNodes.length" class="knowledge-empty-line">暂无收藏</div>
                </div>
              </Transition>
            </div>
          </section>

          <section class="knowledge-tree__section">
            <h2>空间</h2>
            <div v-if="!store.spaces.length && !store.loading" class="knowledge-empty-line">暂无空间</div>
            <article
              v-for="space in store.spaces"
              :key="space.id"
              class="knowledge-space"
              :class="{ 'knowledge-space--dragging': draggedSpaceId === space.id }"
              draggable="true"
              @dragstart="handleSpaceDragStart(space.id, $event)"
              @dragend="draggedSpaceId = null"
              @dragover.prevent
              @drop="handleSpaceDrop(space.id)"
            >
              <div
                class="knowledge-space__head"
                :class="{ 'knowledge-space__head--active': store.activeSpaceId === space.id }"
                role="button"
                tabindex="0"
                :aria-pressed="store.activeSpaceId === space.id"
                @click="store.activeSpaceId = space.id"
                @keydown.enter.prevent="store.activeSpaceId = space.id"
              >
                <span class="knowledge-space__prefix">
                  <span
                    class="knowledge-space__toggle"
                    role="button"
                    tabindex="0"
                    :aria-label="isSpaceCollapsed(space.id) ? '展开空间' : '收起空间'"
                    @click.stop="toggleSpaceCollapsed(space.id)"
                    @keydown.enter.stop.prevent="toggleSpaceCollapsed(space.id)"
                  >
                    <IconRenderer
                      :icon="isSpaceCollapsed(space.id) ? 'iconify:lucide:chevron-right' : 'iconify:lucide:chevron-down'"
                      :size="13"
                    />
                  </span>
                  <span class="knowledge-space__color" :style="{ backgroundColor: space.color }" />
                </span>
                <span>{{ space.name }}</span>
                <span class="knowledge-space__actions">
                  <strong>{{ store.nodesBySpace(space.id).length }}</strong>
                  <UiIconButton type="button" title="重命名空间" size="sm" @click.stop="renameSpace(space.id, space.name)">
                    <IconRenderer icon="iconify:lucide:pencil" :size="13" />
                  </UiIconButton>
                  <UiIconButton
                    type="button"
                    title="删除空间"
                    size="sm"
                    :disabled="space.isDefault"
                    @click.stop="deleteSpace(space.id, space.name)"
                  >
                    <IconRenderer icon="iconify:lucide:trash-2" :size="13" />
                  </UiIconButton>
                </span>
              </div>
              <div
                v-if="!isSpaceCollapsed(space.id)"
                class="knowledge-space__tree"
                :class="{ 'knowledge-space__tree--drop-target': rootDropSpaceId === space.id }"
                @dragover="handleSpaceRootDragOver(space.id, $event)"
                @dragleave="handleSpaceRootDragLeave(space.id, $event)"
                @drop="handleSpaceRootDrop(space.id, $event)"
              >
                <KnowledgeTreeNode
                  v-for="node in store.childrenFor(null, space.id)"
                  :key="node.id"
                  :node="node"
                  :level="0"
                />
                <div v-if="!store.childrenFor(null, space.id).length" class="knowledge-empty-line">空空间</div>
              </div>
            </article>
          </section>
        </UiScrollbar>
        <UiButton
          v-else
          type="button"
          variant="ghost"
          size="sm"
          class="knowledge-sidebar__collapsed-rail"
          title="展开左侧栏"
          @click="leftSidebarCollapsed = false"
        >
          <template #prefix>
            <IconRenderer icon="iconify:lucide:panel-left-open" :size="17" />
          </template>
          <span>资料树</span>
        </UiButton>
        <span
          v-if="!leftSidebarCollapsed"
          class="knowledge-sidebar__resize-handle knowledge-sidebar__resize-handle--left"
          role="separator"
          aria-orientation="vertical"
          title="拖动调整左侧栏宽度"
          @mousedown="startKnowledgeSidebarResize('left', $event)"
        />
      </aside>

      <main
        class="knowledge-workspace"
        :style="knowledgePersonalizationEditorStyle"
        aria-label="知识库内容"
        @contextmenu.prevent="openKnowledgePersonalizationMenu($event, 'editor')"
      >
        <div v-if="store.loading" class="knowledge-state">
          <IconRenderer icon="iconify:lucide:loader-circle" :size="22" />
          <span>加载中</span>
        </div>

        <div v-else-if="store.selectedNode" class="knowledge-editor">
          <header
            class="knowledge-editor__header"
            :class="{ 'knowledge-editor__header--block-page': store.selectedPage?.page.pageType === 'block' }"
          >
            <div class="knowledge-editor__meta">
              <span>{{ selectedKindLabel }}</span>
              <time>更新于 {{ formatDateTime(store.selectedNode.updatedAt) }}</time>
            </div>
            <label v-if="store.selectedPage?.page.pageType !== 'block'" class="knowledge-editor__title">
              <UiInput
                v-model="draftTitle"
                type="text"
                size="lg"
                spellcheck="false"
                @blur="saveTitle"
                @keydown.enter.prevent="saveTitle"
              />
            </label>
            <div v-if="selectedDocumentExcerptSource" class="knowledge-editor__source">
              <IconRenderer icon="iconify:lucide:quote" :size="16" />
              <span>
                摘录自 <strong>{{ selectedDocumentExcerptSource.sourceTitle || '导入文档' }}</strong>
                <small v-if="selectedDocumentExcerptSource.sourceAssetName">
                  {{ selectedDocumentExcerptSource.sourceAssetName }}
                </small>
              </span>
              <UiButton type="button" variant="secondary" size="sm" @click="openExcerptSource">
                回到来源
              </UiButton>
            </div>
            <div v-if="store.selectedPage" class="knowledge-editor__conversion">
              <UiButton
                v-if="store.selectedPage.page.pageType === 'markdown'"
                type="button"
                variant="secondary"
                size="sm"
                @click="conversionMode = 'markdown-to-block'"
              >
                转换为块页面副本
              </UiButton>
              <UiButton
                v-if="store.selectedPage.page.pageType === 'markdown'"
                type="button"
                variant="secondary"
                size="sm"
                @click="conversionMode = 'markdown-to-canvas'"
              >
                转换为画布副本
              </UiButton>
              <UiButton
                v-if="store.selectedPage.page.pageType === 'block'"
                type="button"
                variant="secondary"
                size="sm"
                @click="conversionMode = 'block-to-markdown'"
              >
                导出为 Markdown 副本
              </UiButton>
              <UiButton
                v-if="store.selectedPage.page.pageType === 'block'"
                type="button"
                variant="secondary"
                size="sm"
                @click="conversionMode = 'block-to-canvas'"
              >
                转换为画布副本
              </UiButton>
              <UiButton
                v-if="store.selectedPage.page.pageType === 'canvas'"
                type="button"
                variant="secondary"
                size="sm"
                @click="conversionMode = 'canvas-to-markdown'"
              >
                导出为 Markdown 摘要
              </UiButton>
            </div>
          </header>

          <div
            v-if="store.selectedPage?.page.pageType === 'markdown'"
            class="knowledge-editor__body knowledge-editor__body--markdown"
          >
            <KnowledgeMarkdownEditor
              ref="markdownEditorRef"
              :model-value="store.markdownDraft"
              :dirty="store.markdownDirty"
              :saving="store.saving"
              :page-suggestions="pageSuggestions"
              :selection-background-color="knowledgePersonalization.selectionBackgroundColor"
              @update:model-value="updateMarkdown"
              @save="saveMarkdown"
              @asset-file="handleEditorAssetFile"
            />
          </div>

          <div
            v-else-if="store.selectedPage?.page.pageType === 'block'"
            class="knowledge-editor__body knowledge-editor__body--block"
          >
            <KnowledgeBlockEditor
              :model-value="store.blockDraft"
              :dirty="store.blockDirty"
              :saving="store.saving"
              :title="draftTitle"
              :kind-label="selectedKindLabel"
              :updated-at="formatDateTime(store.selectedNode.updatedAt)"
              :selection-background-color="knowledgePersonalization.selectionBackgroundColor"
              @update:title="value => draftTitle = value"
              @save-title="saveTitle"
              @update:model-value="updateBlockDocument"
              @save="saveBlockDocument"
              @asset-file="handleBlockAssetFile"
              @open-asset="openBlockAsset"
              @show-asset="showBlockAssetInFolder"
              @select-asset="selectBlockAsset"
              @convert-todo="convertBlockTodo"
            />
          </div>

          <div
            v-else-if="store.selectedPage?.page.pageType === 'canvas'"
            class="knowledge-editor__body knowledge-editor__body--canvas"
          >
            <KnowledgeCanvasEditor
              :model-value="store.canvasDraft"
              :dirty="store.canvasDirty"
              :saving="store.saving"
              :page-suggestions="pageSuggestions"
              :style="{ '--knowledge-selection-bg': knowledgePersonalization.selectionBackgroundColor }"
              @update:model-value="updateCanvasDocument"
              @save="saveCanvasDocument"
              @asset-file="handleCanvasAssetFile"
              @open-asset="openBlockAsset"
              @select-asset="selectCanvasAsset"
              @open-page-link="openCanvasPageLink"
              @open-todo-link="openLinkedTodo"
            />
          </div>

          <UiScrollbar
            v-else-if="store.selectedPage?.page.pageType === 'external_document'"
            class="knowledge-document-view"
            :x="false"
            :y="true"
            :size="6"
            @mouseup="captureSelectedDocumentText"
          >
            <div class="knowledge-document-view__hero">
              <IconRenderer icon="iconify:lucide:file-search" :size="38" />
              <div>
                <span>导入文档</span>
                <h2>{{ store.selectedPage.node.title }}</h2>
                <p>{{ store.selectedAsset?.originalName || '已入库资产' }}</p>
              </div>
            </div>
            <dl class="knowledge-document-view__meta">
              <div>
                <dt>格式</dt>
                <dd>{{ store.selectedAsset?.extension || '--' }}</dd>
              </div>
              <div>
                <dt>大小</dt>
                <dd>{{ formatFileSize(store.selectedAsset?.sizeBytes) }}</dd>
              </div>
              <div>
                <dt>索引状态</dt>
                <dd>{{ store.selectedAsset?.importStatus || '--' }}</dd>
              </div>
              <div>
                <dt>Hash</dt>
                <dd>{{ store.selectedAsset?.hash.slice(0, 16) || '--' }}</dd>
              </div>
              <div>
                <dt>导入时间</dt>
                <dd>{{ formatDateTime(selectedImportedAt) }}</dd>
              </div>
              <div>
                <dt>抽取器</dt>
                <dd>{{ selectedExtractor }}</dd>
              </div>
            </dl>
            <div class="knowledge-document-view__actions">
              <UiButton
                type="button"
                variant="secondary"
                size="sm"
                :disabled="!store.selectedAsset"
                @click="openSelectedAsset"
              >
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:external-link" :size="15" />
                </template>
                打开原文件
              </UiButton>
              <UiButton
                type="button"
                variant="secondary"
                size="sm"
                :disabled="!store.selectedAsset"
                @click="showSelectedAssetInFolder"
              >
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:folder-search" :size="15" />
                </template>
                在系统中显示
              </UiButton>
              <UiButton
                type="button"
                variant="primary"
                size="sm"
                :disabled="!store.selectedAsset || store.saving"
                @click="createExcerptPageFromDocument"
              >
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:quote" :size="15" />
                </template>
                摘录为页面
              </UiButton>
            </div>
            <p v-if="selectedDocumentText" class="knowledge-document-view__selection">
              已选择 {{ selectedDocumentText.length }} 个字符，可创建摘录页面。
            </p>
            <p v-if="selectedExtractionError" class="knowledge-document-view__error">
              抽取失败：{{ selectedExtractionError }}
            </p>
            <section class="knowledge-document-view__preview">
              <header>
                <h3>文档预览</h3>
                <span>{{ documentPreviewKind }}</span>
              </header>
              <div v-if="documentPreviewKind === 'pdf' && documentPreviewUrl" class="knowledge-document-view__frame-wrap">
                <iframe
                  class="knowledge-document-view__frame"
                  :src="documentPreviewUrl"
                  title="PDF 预览"
                />
              </div>
              <div v-else-if="documentPreviewKind === 'image' && documentPreviewUrl" class="knowledge-document-view__image-wrap">
                <img
                  class="knowledge-document-view__image"
                  :src="documentPreviewUrl"
                  :alt="store.selectedAsset?.originalName || '图片预览'"
                />
              </div>
              <div v-else-if="documentPreviewKind === 'slides' && documentSlides.length" class="knowledge-document-view__slides">
                <article
                  v-for="slide in documentSlides"
                  :key="slide.index"
                  class="knowledge-document-view__slide"
                  :data-excerpt-slide="slide.index"
                >
                  <span>Slide {{ slide.index }}</span>
                  <h4>{{ slide.title }}</h4>
                  <pre>{{ slide.text }}</pre>
                </article>
              </div>
              <div v-else-if="documentPreviewKind === 'sheets' && documentSheets.length" class="knowledge-document-view__sheets">
                <article
                  v-for="sheet in documentSheets"
                  :key="sheet.index"
                  class="knowledge-document-view__sheet"
                  :data-excerpt-sheet="sheet.name"
                >
                  <h4>{{ sheet.name }}</h4>
                  <div v-if="sheet.rows.length" class="knowledge-document-view__table-wrap">
                    <table>
                      <tbody>
                        <tr v-for="(row, rowIndex) in sheet.rows" :key="`${sheet.index}-${rowIndex}`">
                          <td
                            v-for="(cell, cellIndex) in row"
                            :key="`${sheet.index}-${rowIndex}-${cellIndex}`"
                            data-excerpt-cell="true"
                            :data-excerpt-sheet="sheet.name"
                            :data-excerpt-row="rowIndex + 1"
                            :data-excerpt-column="cellIndex + 1"
                          >
                            {{ cell || ' ' }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <pre v-else>{{ sheet.text }}</pre>
                </article>
              </div>
              <div v-else-if="documentSections.length" class="knowledge-document-view__sections">
                <article
                  v-for="section in documentSections"
                  :key="section.index"
                  class="knowledge-document-view__section"
                  :data-excerpt-section="section.label"
                >
                  <h4>{{ section.label }}</h4>
                  <pre>{{ section.text }}</pre>
                </article>
              </div>
              <div v-else class="knowledge-document-view__empty-preview">
                当前格式暂无可视预览，可打开原文件或查看已抽取文本。
              </div>
            </section>
            <section class="knowledge-document-view__text">
              <h3>已抽取文本</h3>
              <pre>{{ store.selectedPage.page.contentText || '当前文件未抽取到可搜索文本。' }}</pre>
            </section>
          </UiScrollbar>

          <UiScrollbar v-else-if="selectedQuickNote" class="knowledge-quick-note-detail" :x="false" :y="true" :size="6">
            <div
              class="knowledge-quick-note-detail__paper"
              :class="`knowledge-quick-note-detail__paper--${selectedQuickNote.quickNote.color}`"
            >
              <div class="knowledge-quick-note-detail__meta">
                <span>速记</span>
                <span v-if="selectedQuickNote.quickNote.isPinned">置顶</span>
                <time>{{ formatDateTime(selectedQuickNote.quickNote.updatedAt) }}</time>
              </div>
              <pre>{{ selectedQuickNote.quickNote.body }}</pre>
              <div v-if="quickNoteTags(selectedQuickNote).length" class="knowledge-quick-note-detail__tags">
                <span v-for="tag in quickNoteTags(selectedQuickNote)" :key="tag">#{{ tag }}</span>
              </div>
              <div class="knowledge-quick-note-detail__links">
                <span v-if="selectedQuickNote.quickNote.convertedPageId">已转页面</span>
                <span v-if="selectedQuickNote.quickNote.convertedTodoId">已转 Todo</span>
              </div>
              <div class="knowledge-quick-note-detail__actions">
                <UiButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="store.saving || Boolean(selectedQuickNote.quickNote.convertedTodoId)"
                  @click="store.convertQuickNoteToTodo(selectedQuickNote.quickNote.id)"
                >
                  转 Todo
                </UiButton>
                <UiButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="store.saving"
                  @click="store.convertQuickNoteToPage(selectedQuickNote.quickNote.id)"
                >
                  转页面
                </UiButton>
                <UiButton
                  type="button"
                  variant="danger"
                  size="sm"
                  :disabled="store.saving"
                  @click="store.archiveQuickNote(selectedQuickNote.quickNote.id)"
                >
                  归档
                </UiButton>
              </div>
            </div>
          </UiScrollbar>

          <div v-else class="knowledge-folder-view">
            <div class="knowledge-folder-view__icon">
              <IconRenderer
                :icon="store.selectedNode.nodeType === 'quick_note' ? 'iconify:lucide:sticky-note' : 'iconify:lucide:folder-open'"
                :size="36"
              />
            </div>
            <h2>{{ store.selectedNode.title }}</h2>
            <p>{{ store.childrenFor(store.selectedNode.id).length }} 个子节点</p>
            <div class="knowledge-folder-view__actions">
              <UiButton type="button" variant="secondary" size="sm" @click="createChildPageFromSelection">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:file-plus-2" :size="15" />
                </template>
                新建页面
              </UiButton>
              <UiButton type="button" variant="secondary" size="sm" @click="createChildBlockPageFromSelection">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:layout-template" :size="15" />
                </template>
                新建块页
              </UiButton>
              <UiButton type="button" variant="secondary" size="sm" @click="createChildCanvasPageFromSelection">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:layout-dashboard" :size="15" />
                </template>
                新建画布
              </UiButton>
              <UiButton type="button" variant="secondary" size="sm" @click="createChildFolderFromSelection">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:folder-plus" :size="15" />
                </template>
                新建文件夹
              </UiButton>
            </div>
          </div>
        </div>

        <div v-else class="knowledge-state">
          <IconRenderer icon="iconify:lucide:mouse-pointer-square" :size="24" />
          <span>选择或新建一个页面</span>
          <div class="knowledge-state__actions">
            <UiButton type="button" variant="primary" size="sm" @click="createRootPage">
              新建 Markdown 页面
            </UiButton>
            <UiButton type="button" variant="secondary" size="sm" @click="createRootCanvasPage">
              新建画布页面
            </UiButton>
          </div>
        </div>
      </main>

      <aside
        class="knowledge-inspector"
        :style="knowledgePersonalizationInspectorStyle"
        aria-label="知识库 Inspector"
        @contextmenu.prevent="openKnowledgePersonalizationMenu($event, 'right')"
      >
        <template v-if="!inspectorCollapsed">
        <div class="knowledge-inspector__tabs">
          <UiIconButton type="button" title="收起右侧栏" variant="ghost" size="sm" @click="inspectorCollapsed = true">
            <IconRenderer icon="iconify:lucide:panel-right-close" :size="15" />
          </UiIconButton>
          <UiIconButton
            v-for="tab in inspectorTabs"
            :key="tab.id"
            type="button"
            variant="ghost"
            size="sm"
            :class="{ 'knowledge-inspector__tab--active': activeInspectorTab === tab.id }"
            :active="activeInspectorTab === tab.id"
            :title="tab.label"
            :aria-pressed="activeInspectorTab === tab.id"
            @click="activeInspectorTab = tab.id"
          >
            <IconRenderer :icon="tab.icon" :size="15" />
          </UiIconButton>
        </div>
        <UiScrollbar class="knowledge-inspector__content" :x="false" :y="true" :size="6">
          <h2>{{ inspectorTabs.find((tab) => tab.id === activeInspectorTab)?.label }}</h2>
          <dl>
            <div>
              <dt>当前节点</dt>
              <dd>{{ store.selectedNode?.title || '未选择' }}</dd>
            </div>
            <div>
              <dt>节点类型</dt>
              <dd>{{ selectedKindLabel }}</dd>
            </div>
            <div>
              <dt>所属空间</dt>
              <dd>{{ store.activeSpace?.name || '--' }}</dd>
            </div>
          </dl>
          <div v-if="activeInspectorTab === 'attachments' && store.selectedAsset" class="knowledge-attachment-inspector">
            <h3>当前附件</h3>
            <dl>
              <div>
                <dt>文件名</dt>
                <dd>{{ store.selectedAsset.originalName }}</dd>
              </div>
              <div>
                <dt>大小</dt>
                <dd>{{ formatFileSize(store.selectedAsset.sizeBytes) }}</dd>
              </div>
              <div>
                <dt>Hash</dt>
                <dd>{{ store.selectedAsset.hash }}</dd>
              </div>
              <div>
                <dt>导入时间</dt>
                <dd>{{ formatDateTime(selectedImportedAt) }}</dd>
              </div>
              <div>
                <dt>索引状态</dt>
                <dd>{{ store.selectedAsset.importStatus }}</dd>
              </div>
              <div>
                <dt>预览类型</dt>
                <dd>{{ documentPreviewKind }}</dd>
              </div>
            </dl>
            <div class="knowledge-attachment-inspector__actions">
              <UiButton type="button" variant="secondary" size="sm" block @click="openSelectedAsset">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:external-link" :size="15" />
                </template>
                打开原文件
              </UiButton>
              <UiButton type="button" variant="secondary" size="sm" block @click="showSelectedAssetInFolder">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:folder-search" :size="15" />
                </template>
                在系统中显示
              </UiButton>
            </div>
          </div>
          <div v-if="activeInspectorTab === 'attachments' && store.indexJobs.length" class="knowledge-index-jobs">
            <h3>最近索引任务</h3>
            <article v-for="job in store.indexJobs.slice(0, 6)" :key="job.id">
              <span :class="`knowledge-index-jobs__status knowledge-index-jobs__status--${job.status}`" />
              <div>
                <strong>{{ job.jobType }}</strong>
                <small>{{ job.status }} · {{ formatDateTime(job.updatedAt) }}</small>
                <small v-if="job.errorMessage">{{ job.errorMessage }}</small>
              </div>
              <div class="knowledge-index-jobs__actions">
                <UiButton
                  v-if="job.status === 'failed' || job.status === 'cancelled'"
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="store.importing"
                  @click="retryIndexJob(job)"
                >
                  重试
                </UiButton>
                <UiButton
                  v-if="job.status === 'pending' || job.status === 'running'"
                  type="button"
                  variant="danger"
                  size="sm"
                  @click="cancelIndexJob(job)"
                >
                  取消
                </UiButton>
              </div>
            </article>
          </div>
          <div v-if="activeInspectorTab === 'tags'" class="knowledge-relation-panel">
            <h3>当前标签</h3>
            <div class="knowledge-tag-list">
              <UiButton
                v-for="tag in store.selectedTags"
                :key="tag.id"
                type="button"
                variant="ghost"
                size="sm"
                class="knowledge-tag-chip"
                :style="{ '--tag-color': tag.color }"
                :title="tag.name"
                @click="store.unbindTagFromSelected(tag.id)"
              >
                {{ tag.name }}
              </UiButton>
              <span v-if="!store.selectedTags.length" class="knowledge-inspector__muted">当前节点暂无标签</span>
            </div>
            <template v-if="store.selectedAsset">
              <h3>当前附件标签</h3>
              <p class="knowledge-inspector__muted">{{ store.selectedAsset.originalName }}</p>
              <div class="knowledge-tag-list">
                <UiButton
                  v-for="tag in store.selectedAssetTags"
                  :key="`asset-${tag.id}`"
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="knowledge-tag-chip"
                  :style="{ '--tag-color': tag.color }"
                  :title="tag.name"
                  @click="store.unbindTagFromSelectedAsset(tag.id)"
                >
                  {{ tag.name }}
                </UiButton>
                <span v-if="!store.selectedAssetTags.length" class="knowledge-inspector__muted">当前附件暂无标签</span>
              </div>
              <UiButton type="button" variant="secondary" size="sm" block @click="createTagForCurrentAsset">
                新建并绑定到附件
              </UiButton>
              <div v-if="store.tags.length" class="knowledge-tag-list">
                <UiButton
                  v-for="tag in store.tags"
                  :key="`asset-bind-${tag.id}`"
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="knowledge-tag-chip"
                  :style="{ '--tag-color': tag.color }"
                  :title="tag.name"
                  @click="bindExistingTagToAsset(tag)"
                >
                  {{ tag.name }}
                </UiButton>
              </div>
            </template>
            <h3>标签库</h3>
            <UiColorPicker
              v-model="selectedTagColor"
              class="knowledge-tag-color-picker"
              :swatches="tagColorOptions"
              label="标签颜色"
              aria-label="选择标签颜色"
              placeholder="#4A90D9"
              :show-input="false"
            />
            <UiButton type="button" variant="secondary" size="sm" block @click="createTagForCurrentSelection">
              新建并绑定标签
            </UiButton>
            <div class="knowledge-tag-list">
              <UiButton
                v-for="tag in store.tags"
                :key="tag.id"
                type="button"
                variant="ghost"
                size="sm"
                class="knowledge-tag-chip"
                :style="{ '--tag-color': tag.color }"
                :title="tag.name"
                @click="bindExistingTag(tag)"
              >
                {{ tag.name }}
              </UiButton>
            </div>
            <div v-if="store.tags.length" class="knowledge-tag-targets">
              <h3>标签过滤</h3>
              <UiButton
                v-for="tag in store.tags"
                :key="`filter-${tag.id}`"
                type="button"
                variant="secondary"
                size="sm"
                :class="{ active: store.activeTagFilterId === tag.id }"
                :active="store.activeTagFilterId === tag.id"
                :aria-pressed="store.activeTagFilterId === tag.id"
                @click="store.loadTagTargets(tag.id)"
              >
                {{ tag.name }}
              </UiButton>
              <UiButton v-if="store.activeTagFilterId" type="button" variant="secondary" size="sm" @click="store.clearTagFilter">
                清除
              </UiButton>
              <UiButton
                v-for="target in store.tagTargets"
                :key="`${target.targetType}-${target.targetId}`"
                type="button"
                variant="ghost"
                size="sm"
                class="knowledge-relation-panel__item"
                @click="selectTaggedTarget(target.nodeId, target.assetId)"
              >
                <strong>{{ target.title }}</strong>
                <small>{{ target.targetType }} · {{ formatDateTime(target.updatedAt) }}</small>
              </UiButton>
            </div>
          </div>
          <div v-if="activeInspectorTab === 'backlinks'" class="knowledge-relation-panel">
            <h3>反链</h3>
            <UiButton
              v-for="backlink in store.backlinks"
              :key="backlink.id"
              type="button"
              variant="ghost"
              size="sm"
              class="knowledge-relation-panel__item"
              @click="backlink.sourceNodeId && store.selectNode(backlink.sourceNodeId)"
            >
              <strong>{{ backlink.sourceTitle }}</strong>
              <small>{{ backlink.sourceType }} · {{ backlink.linkType }}</small>
            </UiButton>
            <span v-if="!store.backlinks.length" class="knowledge-inspector__muted">暂无反链</span>
            <h3>页面出链</h3>
            <article v-for="link in store.pageLinks" :key="link.id">
              <strong>{{ link.targetUrl || link.targetId || link.targetType }}</strong>
              <small>{{ link.targetType }} · {{ link.linkType }}</small>
              <UiButton
                v-if="link.targetType === 'missing_page'"
                type="button"
                variant="secondary"
                size="sm"
                @click="createMissingLinkedPage(link)"
              >
                创建页面
              </UiButton>
            </article>
          </div>
          <div v-if="activeInspectorTab === 'todo'" class="knowledge-relation-panel">
            <h3>关联 Todo</h3>
            <UiButton
              v-for="link in linkedTodoLinks"
              :key="link.id"
              type="button"
              variant="ghost"
              size="sm"
              class="knowledge-relation-panel__item"
              @click="openLinkedTodo(link.targetId)"
            >
              <strong>{{ link.targetId }}</strong>
              <small>来源页面可跳转到 Todo 详情</small>
            </UiButton>
            <span v-if="!linkedTodoLinks.length" class="knowledge-inspector__muted">当前页面暂无关联 Todo</span>
          </div>
          <div v-if="activeInspectorTab === 'graph'" class="knowledge-relation-panel">
            <h3>关系图</h3>
            <div class="knowledge-graph-summary">
              <span>{{ store.graph?.nodes.length || 0 }} 节点</span>
              <span>{{ store.graph?.edges.length || 0 }} 关系</span>
              <span v-if="store.graph?.truncated">已截断</span>
            </div>
            <article v-for="node in store.graph?.nodes || []" :key="node.id">
              <strong>{{ node.title }}</strong>
              <small>{{ node.group }} · {{ node.subtitle || node.targetId }}</small>
            </article>
          </div>
          <div v-if="activeInspectorTab === 'orphans'" class="knowledge-relation-panel">
            <h3>孤立页面</h3>
            <UiButton
              v-for="page in store.orphanPages"
              :key="page.id"
              type="button"
              variant="ghost"
              size="sm"
              class="knowledge-relation-panel__item"
              @click="store.selectNode(page.id)"
            >
              <strong>{{ page.title }}</strong>
              <small>{{ formatDateTime(page.updatedAt) }}</small>
            </UiButton>
            <span v-if="!store.orphanPages.length" class="knowledge-inspector__muted">当前空间没有孤立页面</span>
          </div>
          <div
            v-if="activeInspectorTab === 'ai'"
            class="knowledge-ai-panel"
          >
            <div class="knowledge-ai-panel__controls">
              <UiSelect
                :model-value="knowledgeAiScope"
                :options="knowledgeAiScopeOptions"
                size="sm"
                placeholder="选择范围"
                @update:model-value="setKnowledgeAiScope"
              />
              <UiButton
                type="button"
                variant="secondary"
                size="sm"
                :disabled="!knowledgeAiConversationId"
                @click="continueKnowledgeAiInWorkspace"
              >
                继续到 AI
              </UiButton>
            </div>
            <p class="knowledge-ai-panel__scope">
              {{ knowledgeAiScopeLabel }} · {{ store.selectedNode?.title || store.activeLibrary?.name || '未选择节点' }}
            </p>
            <UiTextarea
              v-model="knowledgeAiQuestion"
              class="knowledge-ai-panel__input"
              :rows="4"
              resize="none"
              placeholder="基于当前知识来源提问"
              :disabled="aiChatStore.sending"
              @keydown.enter.ctrl.prevent="askKnowledgeAi"
            />
            <div class="knowledge-ai-panel__actions">
              <UiButton
                type="button"
                variant="primary"
                size="sm"
                :disabled="!knowledgeAiCanAsk || aiChatStore.sending"
                @click="askKnowledgeAi"
              >
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:send" :size="14" />
                </template>
                提问
              </UiButton>
              <UiButton
                type="button"
                variant="secondary"
                size="sm"
                :disabled="!knowledgeAiLatestAssistantMessage"
                @click="copyKnowledgeAiAnswer"
              >
                复制答案
              </UiButton>
              <UiButton
                type="button"
                variant="secondary"
                size="sm"
                :disabled="!knowledgeAiLatestAssistantMessage || store.saving"
                @click="saveKnowledgeAiAnswerAsPage"
              >
                保存为页面
              </UiButton>
            </div>
            <p v-if="knowledgeAiError || aiChatStore.error" class="knowledge-ai-panel__error">
              {{ knowledgeAiError || aiChatStore.error }}
            </p>
            <div v-if="knowledgeAiMessages.length" class="knowledge-ai-panel__messages">
              <article
                v-for="message in knowledgeAiMessages.slice(-6)"
                :key="message.id"
                class="knowledge-ai-panel__message"
                :class="`knowledge-ai-panel__message--${message.role}`"
              >
                <strong>{{ message.role === 'assistant' ? 'AI' : '我' }}</strong>
                <p>{{ message.content || (message.status === 'streaming' ? '生成中...' : '') }}</p>
                <div v-if="message.citations?.length" class="knowledge-ai-panel__citations">
                  <UiButton
                    v-for="citation in message.citations"
                    :key="citation.id"
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="knowledge-ai-panel__citation"
                    :title="citation.snippet"
                    @click="openKnowledgeAiCitation(citation)"
                  >
                    <template #prefix>
                      <IconRenderer icon="iconify:lucide:quote" :size="13" />
                    </template>
                    {{ citation.title }}
                  </UiButton>
                </div>
              </article>
            </div>
            <p v-else class="knowledge-inspector__muted">
              选择范围后提问；强制知识检索没有来源时会停止生成。
            </p>
          </div>
        </UiScrollbar>
        </template>
        <UiButton
          v-else
          type="button"
          variant="ghost"
          size="sm"
          class="knowledge-inspector__collapsed-rail"
          title="展开右侧栏"
          @click="inspectorCollapsed = false"
        >
          <template #prefix>
            <IconRenderer icon="iconify:lucide:panel-right-open" :size="17" />
          </template>
          <span>详情</span>
        </UiButton>
        <span
          v-if="!inspectorCollapsed"
          class="knowledge-sidebar__resize-handle knowledge-sidebar__resize-handle--right"
          role="separator"
          aria-orientation="vertical"
          title="拖动调整右侧栏宽度"
          @mousedown="startKnowledgeSidebarResize('right', $event)"
        />
      </aside>
    </div>
    <UiPersonalizationConfig
      :visible="knowledgePersonalizationPanelOpen"
      :title="knowledgePersonalizationRegionLabel(knowledgePersonalizationActiveRegion)"
      :current-background="activeKnowledgePersonalizationBackground.type === 'color' ? activeKnowledgePersonalizationBackground.color : ''"
      :current-background-image="activeKnowledgePersonalizationBackground.type === 'image' ? activeKnowledgePersonalizationBackground.image : ''"
      :current-background-video="activeKnowledgePersonalizationBackground.type === 'video' ? activeKnowledgePersonalizationBackground.video : ''"
      :current-background-style="activeKnowledgePersonalizationBackground.backgroundStyle"
      :enabled-features="['color', 'image', 'opacity', 'textColor']"
      show-reset
      reset-text="恢复默认背景颜色"
      :preview-width="knowledgePersonalizationPreviewSize.width"
      :preview-height="knowledgePersonalizationPreviewSize.height"
      @close="knowledgePersonalizationPanelOpen = false"
      @confirm="handleKnowledgePersonalizationConfirm"
      @reset="handleKnowledgePersonalizationReset"
    />
    <Teleport to="body">
      <div
        v-if="knowledgeBlockStylePanelOpen"
        class="knowledge-block-style-modal"
        role="dialog"
        aria-modal="true"
        aria-label="知识库外观方案"
        @mousedown.self="knowledgeBlockStylePanelOpen = false"
      >
        <section class="knowledge-block-style-panel">
          <header class="knowledge-block-style-panel__header">
            <div>
              <h2>知识库外观方案</h2>
              <p>保存知识库背景、编辑区背景、块背景、框选颜色和透明度为一套方案。</p>
            </div>
            <UiIconButton type="button" title="关闭" size="sm" @click="knowledgeBlockStylePanelOpen = false">
              <IconRenderer icon="iconify:lucide:x" :size="16" />
            </UiIconButton>
          </header>

          <div class="knowledge-block-style-panel__actions">
            <UiButton type="button" variant="primary" size="sm" @click="saveCurrentKnowledgeAppearanceScheme">
              <template #prefix>
                <IconRenderer icon="iconify:lucide:save" :size="14" />
              </template>
              保存外观方案
            </UiButton>
            <UiButton
              type="button"
              variant="secondary"
              size="sm"
              :disabled="!knowledgePersonalization.activeAppearanceSchemeId"
              @click="deleteActiveKnowledgeAppearanceScheme"
            >
              <template #prefix>
                <IconRenderer icon="iconify:lucide:trash-2" :size="14" />
              </template>
              删除当前方案
            </UiButton>
            <UiButton type="button" variant="secondary" size="sm" @click="resetKnowledgeBlockStyle">
              <template #prefix>
                <IconRenderer icon="iconify:lucide:rotate-ccw" :size="14" />
              </template>
              恢复默认块样式
            </UiButton>
          </div>

          <div class="knowledge-block-style-panel__preview" :style="[knowledgePersonalizationPageStyle, knowledgeBlockStyleVars]">
            <div class="knowledge-block-style-preview__code">
              <span>代码块</span>
              <code>const theme = 'transparent blocks'</code>
            </div>
            <div class="knowledge-block-style-preview__diagram">Mermaid / 数学区域</div>
            <div class="knowledge-block-style-preview__table">
              <span>表格</span>
              <span>背景</span>
            </div>
            <div class="knowledge-block-style-preview__callout">标注区域</div>
          </div>

          <UiScrollbar class="knowledge-block-style-panel__scrollbar" :x="false" :y="true" :size="8">
            <section class="knowledge-block-style-card knowledge-block-style-card--wide">
              <div class="knowledge-block-style-card__head">
                <span>光标框选背景</span>
                <span>{{ knowledgePersonalization.selectionBackgroundColor }}</span>
              </div>
              <UiColorPicker
                :model-value="knowledgePersonalization.selectionBackgroundColor"
                :swatches="['color-mix(in srgb, var(--ui-primary-color) 18%, transparent)', 'color-mix(in srgb, var(--ui-primary-color) 30%, transparent)', '#bfdbfe', '#fde68a', '#bbf7d0', '#fecaca']"
                aria-label="光标框选背景颜色"
                placeholder="color-mix(...) 或 #bfdbfe"
                @update:model-value="updateKnowledgeSelectionBackgroundColor"
              />
            </section>
            <div class="knowledge-block-style-grid">
              <section
                v-for="surface in knowledgeBlockSurfaceOrder"
                :key="surface"
                class="knowledge-block-style-card"
              >
                <div class="knowledge-block-style-card__head">
                  <span>{{ knowledgeBlockSurfaceLabels[surface] }}</span>
                  <span>{{ Math.round(knowledgePersonalization.blockStyle[surface].opacity * 100) }}%</span>
                </div>
                <UiColorPicker
                  :model-value="knowledgePersonalization.blockStyle[surface].backgroundColor"
                  :swatches="knowledgeBlockStyleColorOptions"
                  allow-transparent
                  :aria-label="`${knowledgeBlockSurfaceLabels[surface]} 背景颜色`"
                  placeholder="#ffffff"
                  @update:model-value="color => updateKnowledgeBlockSurfaceColor(surface, color)"
                />
                <UiSliderField
                  :model-value="Math.round(knowledgePersonalization.blockStyle[surface].opacity * 100)"
                  :min="0"
                  :max="100"
                  :step="1"
                  label="透明度"
                  unit="%"
                  :aria-label="`${knowledgeBlockSurfaceLabels[surface]} 透明度`"
                  @update:model-value="value => updateKnowledgeBlockSurfaceOpacity(surface, value)"
                />
              </section>
            </div>
          </UiScrollbar>
        </section>
      </div>
    </Teleport>
    <KnowledgeConversionDialog
      :open="Boolean(conversionMode)"
      :title="conversionDialog?.title ?? ''"
      :warning="conversionDialog?.warning ?? ''"
      :confirm-label="conversionDialog?.confirmLabel ?? '创建副本'"
      :loading="converting"
      @confirm="confirmConversion"
      @close="conversionMode = null"
    />
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/cssvars.scss' as *;

.knowledge-page {
  --knowledge-left-expanded-width: 280px;
  --knowledge-right-expanded-width: 260px;
  --knowledge-left-width: var(--knowledge-left-expanded-width);
  --knowledge-right-width: var(--knowledge-right-expanded-width);
  --knowledge-panel-tint: color-mix(in srgb, var(--ui-surface-panel) 88%, transparent);
  --knowledge-workspace-tint: color-mix(in srgb, var(--ui-surface-panel-muted) 84%, var(--ui-surface-base));
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: 100%;
  height: calc(100vh - #{$topbar-height} - #{$btmbar-height});
  max-height: calc(100vh - #{$topbar-height} - #{$btmbar-height});
  min-height: 0;
  align-self: stretch;
  overflow: hidden;
  box-sizing: border-box;
  color: var(--ui-text-primary);
  background: var(--background-color);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  transition: background 0.2s ease;
}

.knowledge-page::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: transparent;
}

.knowledge-page--custom-background::before {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--background-color) 10%, transparent),
      color-mix(in srgb, var(--background-color) 14%, transparent)
    );
}

.knowledge-page--left-collapsed {
  --knowledge-left-width: 44px;
}

.knowledge-page--right-collapsed {
  --knowledge-right-width: 44px;
}

.knowledge-page--custom-background {
  --knowledge-panel-tint: color-mix(in srgb, var(--ui-surface-panel) 58%, transparent);
  --knowledge-workspace-tint: transparent;
  --knowledge-editor-header-bg: color-mix(in srgb, var(--ui-surface-panel) 10%, transparent);
  --knowledge-editor-header-border: color-mix(in srgb, var(--ui-border-subtle) 48%, transparent);
  --knowledge-markdown-toolbar-bg: color-mix(in srgb, var(--ui-surface-panel) 10%, transparent);
  --knowledge-markdown-control-bg: color-mix(in srgb, var(--ui-input-bg) 42%, transparent);
  --knowledge-markdown-preview-bg: transparent;
  --knowledge-markdown-editor-bg: transparent;
  --knowledge-markdown-preview-paper-bg: transparent;
  --knowledge-markdown-editor-paper-bg: transparent;
  --knowledge-markdown-preview-focus-bg: transparent;
  --knowledge-markdown-editor-focus-bg: transparent;
}

.knowledge-toolbar,
.knowledge-error,
.knowledge-shell,
.knowledge-page > .ui-personalization-config {
  position: relative;
  z-index: 1;
}

:global(.page-router-viewport > .knowledge-page) {
  flex: 1 1 auto;
  min-height: 0;
}

.knowledge-toolbar {
  grid-row: 1;
  display: grid;
  grid-template-columns: minmax(170px, 0.65fr) minmax(190px, 230px) minmax(180px, 1fr) minmax(0, auto);
  gap: 10px;
  align-items: center;
  min-height: 66px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);
}

.knowledge-toolbar__title,
.knowledge-toolbar__actions,
.knowledge-toolbar__search,
.knowledge-toolbar__library {
  display: flex;
  align-items: center;
}

.knowledge-toolbar__library {
  min-width: 0;
  gap: 6px;
}

.knowledge-toolbar__library :deep(.ui-select-trigger) {
  width: 180px;
  min-width: 0;
  height: 34px;
  border-radius: 8px;
}

.knowledge-library-option {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.knowledge-library-option__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-select-focus-border);
}

.knowledge-library-option__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-library-option__actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.knowledge-library-option__actions .ui-icon-button {
  width: 24px;
  height: 24px;
}

.knowledge-toolbar__title {
  min-width: 0;
  gap: 10px;
}

.knowledge-toolbar__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: var(--ui-primary-color);
  background: color-mix(in srgb, var(--ui-primary-color) 18%, transparent);
}

.knowledge-toolbar__heading {
  min-width: 0;

  h1,
  p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h1 {
    font-size: var(--ui-font-size-xl);
    font-weight: 700;
  }

  p {
    margin-top: 2px;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }
}

.knowledge-toolbar__search {
  min-width: 0;
}

.knowledge-toolbar__search-input.ui-input-affix-wrapper {
  height: 34px;
  border-radius: 8px;
}

.knowledge-toolbar__actions {
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.knowledge-toolbar__actions > .ui-button,
.knowledge-toolbar__actions > .ui-icon-button {
  flex: 0 0 auto;
}

.knowledge-toolbar__actions > .ui-button {
  min-width: 0;
}

.knowledge-toolbar__scheme-select {
  width: 142px;
  min-width: 118px;

  :deep(.ui-select-trigger) {
    height: 32px;
    min-height: 32px;
  }
}

.knowledge-block-style-modal {
  position: fixed;
  inset: 0;
  z-index: var(--ui-z-modal, 5000);
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(15 23 42 / 28%);
}

.knowledge-block-style-panel {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  width: min(760px, calc(100vw - 48px));
  max-height: min(780px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 10px;
  background: var(--ui-surface-panel);
  box-shadow: var(--ui-shadow-modal, 0 18px 48px rgb(15 23 42 / 24%));
}

.knowledge-block-style-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 12px;

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: var(--ui-font-size-lg);
    font-weight: 750;
  }

  p {
    margin-top: 4px;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-sm);
  }
}

.knowledge-block-style-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 20px 14px;
}

.knowledge-block-style-panel__preview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0 20px 14px;
  padding: 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--background-color, var(--ui-surface-muted));
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.knowledge-block-style-preview__code,
.knowledge-block-style-preview__diagram,
.knowledge-block-style-preview__table,
.knowledge-block-style-preview__callout {
  min-height: 66px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 7px;
  color: var(--ui-text-primary);
  font-size: var(--ui-font-size-xs);
}

.knowledge-block-style-preview__code {
  display: grid;
  gap: 8px;
  background: var(--knowledge-block-code-bg);

  code {
    font-family: var(--ui-font-mono, 'Cascadia Mono', monospace);
  }
}

.knowledge-block-style-preview__diagram {
  display: grid;
  place-items: center;
  background: var(--knowledge-block-diagram-bg);
}

.knowledge-block-style-preview__table {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 0;
  background: var(--knowledge-block-table-bg);

  span {
    display: grid;
    place-items: center;
    min-height: 66px;
    border-right: 1px solid var(--ui-border-subtle);
  }

  span:last-child {
    border-right: 0;
  }
}

.knowledge-block-style-preview__callout {
  background: var(--knowledge-block-callout-bg);
}

.knowledge-block-style-panel__scrollbar {
  min-height: 0;
  padding: 0 14px 18px 20px;
}

.knowledge-block-style-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.knowledge-block-style-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 54%, transparent);
}

.knowledge-block-style-card__head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
}

.knowledge-error {
  grid-row: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 18px;
  color: var(--ui-button-danger-text);
  background: var(--ui-button-danger-bg);
}

.knowledge-error span {
  flex: 1;
  min-width: 0;
}

.knowledge-shell {
  grid-row: 3;
  display: grid;
  grid-template-columns: var(--knowledge-left-width) minmax(0, 1fr) var(--knowledge-right-width);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  transition: grid-template-columns 0.2s ease;
}

.knowledge-sidebar,
.knowledge-workspace,
.knowledge-inspector {
  min-width: 0;
  min-height: 0;
}

.knowledge-sidebar,
.knowledge-inspector {
  position: relative;
  border-right: 1px solid var(--ui-border-subtle);
  background: var(--knowledge-panel-tint);
  backdrop-filter: saturate(1.05);
  transition:
    background-color 0.18s ease,
    opacity 0.18s ease;
}

.knowledge-inspector {
  border-right: 0;
  border-left: 1px solid var(--ui-border-subtle);
  background: var(--knowledge-panel-tint);
}

.knowledge-page--custom-background .knowledge-sidebar,
.knowledge-page--custom-background .knowledge-workspace,
.knowledge-page--custom-background .knowledge-inspector {
  background: var(--knowledge-panel-tint);
}

.knowledge-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 14px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
}

.knowledge-sidebar__header .ui-icon-button,
.knowledge-inspector__tabs .ui-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.knowledge-sidebar__header .ui-icon-button:hover:not(:disabled),
.knowledge-inspector__tabs .ui-icon-button:hover:not(:disabled),
.knowledge-inspector__tab--active {
  color: var(--ui-primary-color);
  background: color-mix(in srgb, var(--ui-primary-color) 16%, transparent);
  transform: none;
  box-shadow: none;
}

.knowledge-tree {
  height: calc(100% - 44px);
}

.knowledge-tree :deep(.ui-scrollbar__content) {
  padding: 0 10px 16px;
}

.knowledge-sidebar__header-actions,
.knowledge-panel-toggle-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.knowledge-sidebar__resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
}

.knowledge-sidebar__resize-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: transparent;
  transition: background-color 0.16s ease;
}

.knowledge-sidebar__resize-handle:hover::after,
:global(.knowledge-sidebar-resizing) .knowledge-sidebar__resize-handle::after {
  background: color-mix(in srgb, var(--ui-primary-color) 48%, transparent);
}

.knowledge-sidebar__resize-handle--left {
  right: -4px;
}

.knowledge-sidebar__resize-handle--left::after {
  right: 3px;
}

.knowledge-sidebar__resize-handle--right {
  left: -4px;
}

.knowledge-sidebar__resize-handle--right::after {
  left: 3px;
}

.knowledge-sidebar__collapsed-rail,
.knowledge-inspector__collapsed-rail {
  display: grid;
  align-content: start;
  justify-items: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 12px 0;
  color: var(--ui-text-muted);
  background: transparent;
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
}

.knowledge-sidebar__collapsed-rail :deep(.ui-button__content),
.knowledge-inspector__collapsed-rail :deep(.ui-button__content),
.knowledge-sidebar__collapsed-rail :deep(.ui-button__label),
.knowledge-inspector__collapsed-rail :deep(.ui-button__label) {
  display: grid;
  justify-items: center;
  gap: 8px;
}

.knowledge-sidebar__collapsed-rail:hover,
.knowledge-inspector__collapsed-rail:hover {
  color: var(--ui-primary-color);
  background: color-mix(in srgb, var(--ui-primary-color) 10%, transparent);
}

.knowledge-sidebar__collapsed-rail span,
.knowledge-inspector__collapsed-rail span {
  writing-mode: vertical-rl;
  letter-spacing: 0;
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
}

.knowledge-page--left-collapsed .knowledge-sidebar__header {
  display: none;
}

.knowledge-page--left-collapsed .knowledge-sidebar,
.knowledge-page--right-collapsed .knowledge-inspector {
  overflow: hidden;
}

.knowledge-tree__section {
  margin-top: 12px;

  h2 {
    margin: 0 0 6px;
    padding: 0 4px;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
    font-weight: 700;
  }
}

.knowledge-tree__subheading {
  margin-top: 10px !important;
}

.knowledge-search-scope,
.knowledge-search-filters {
  display: flex;
  gap: 4px;
  margin: 4px 4px 8px;
}

.knowledge-search-scope .ui-button,
.knowledge-search-filters .ui-button {
  height: 24px;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  color: var(--ui-text-muted);
  background: var(--ui-surface-glass);
  font-size: var(--ui-font-size-xs);
  cursor: default;
}

.knowledge-search-scope .ui-button:hover:not(:disabled),
.knowledge-search-scope__item--active,
.knowledge-search-filters .ui-button:hover:not(:disabled),
.knowledge-search-filters__item--active {
  color: var(--ui-primary-color) !important;
  border-color: color-mix(in srgb, var(--ui-primary-color) 36%, transparent) !important;
  background: color-mix(in srgb, var(--ui-primary-color) 14%, transparent) !important;
  transform: none !important;
  box-shadow: none !important;
}

.knowledge-search-result {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 7px;
  width: 100%;
  margin-top: 6px;
  padding: 8px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 7px;
  color: var(--ui-text-primary);
  background: var(--ui-surface-glass);
  text-align: left;
  cursor: default;
}

.knowledge-search-result:hover {
  color: var(--ui-primary-color);
  border-color: color-mix(in srgb, var(--ui-primary-color) 32%, transparent);
  background: color-mix(in srgb, var(--ui-primary-color) 12%, var(--ui-surface-panel));
  transform: none;
  box-shadow: none;
}

.knowledge-search-result.ui-button:hover:not(:disabled) {
  color: var(--ui-primary-color);
  border-color: color-mix(in srgb, var(--ui-primary-color) 32%, transparent);
  background: color-mix(in srgb, var(--ui-primary-color) 12%, var(--ui-surface-panel));
  transform: none;
  box-shadow: none;
}

.knowledge-search-result :deep(.ui-button__prefix),
.knowledge-search-result :deep(.ui-button__label) {
  min-width: 0;
}

.knowledge-search-result :deep(.ui-button__label) {
  display: grid;
  justify-content: stretch;
}

.knowledge-search-result span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.knowledge-search-result strong,
.knowledge-search-result small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-search-result strong {
  font-size: var(--ui-font-size-xs);
}

.knowledge-search-result small {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-shortcut,
.knowledge-space__head,
.knowledge-mini-list__item {
  display: grid;
  align-items: center;
  width: 100%;
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  color: var(--ui-text-primary);
  background: transparent;
  cursor: default;
  text-align: left;
}

.knowledge-shortcut {
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 7px;
  padding: 0 8px;
}

.knowledge-shortcut:hover,
.knowledge-shortcut--active,
.knowledge-space__head:hover,
.knowledge-space__head--active,
.knowledge-mini-list__item:hover,
.knowledge-mini-list__item--active {
  color: var(--ui-primary-color);
  background: color-mix(in srgb, var(--ui-primary-color) 14%, transparent);
}

.knowledge-shortcut.ui-button:hover:not(:disabled),
.knowledge-shortcut.ui-button--active:not(:disabled),
.knowledge-space__head.ui-button:hover:not(:disabled),
.knowledge-space__head.ui-button--active:not(:disabled),
.knowledge-mini-list__item.ui-button:hover:not(:disabled),
.knowledge-mini-list__item.ui-button--active:not(:disabled) {
  color: var(--ui-primary-color);
  background: color-mix(in srgb, var(--ui-primary-color) 14%, transparent);
  transform: none;
  box-shadow: none;
}

.knowledge-shortcut :deep(.ui-button__prefix),
.knowledge-shortcut :deep(.ui-button__label),
.knowledge-shortcut :deep(.ui-button__suffix),
.knowledge-space__head :deep(.ui-button__prefix),
.knowledge-space__head :deep(.ui-button__label),
.knowledge-space__head :deep(.ui-button__suffix),
.knowledge-mini-list__item :deep(.ui-button__label),
.knowledge-mini-list__item :deep(.ui-button__suffix) {
  min-width: 0;
}

.knowledge-shortcut :deep(.ui-button__label),
.knowledge-space__head :deep(.ui-button__label),
.knowledge-mini-list__item :deep(.ui-button__label) {
  justify-content: flex-start;
}

.knowledge-shortcut span,
.knowledge-space__head span,
.knowledge-mini-list__item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-shortcut strong,
.knowledge-space__head strong,
.knowledge-mini-list__label strong {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-mini-list {
  margin-top: 8px;
}

.knowledge-collapsible-body {
  overflow: hidden;
}

.knowledge-collapse-enter-active,
.knowledge-collapse-leave-active {
  max-height: 260px;
  opacity: 1;
  transition:
    max-height 0.18s ease,
    opacity 0.16s ease;
}

.knowledge-collapse-enter-from,
.knowledge-collapse-leave-to {
  max-height: 0;
  opacity: 0;
}

.knowledge-quick-notes {
  margin-top: 10px;
  padding: 8px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--ui-surface-glass);
}

.knowledge-page--custom-background .knowledge-quick-notes,
.knowledge-page--custom-background .knowledge-search-result,
.knowledge-page--custom-background .knowledge-relation-panel article,
.knowledge-page--custom-background .knowledge-relation-panel__item,
.knowledge-page--custom-background .knowledge-ai-panel__message,
.knowledge-page--custom-background .knowledge-document-view__meta div,
.knowledge-page--custom-background .knowledge-document-view__slide,
.knowledge-page--custom-background .knowledge-document-view__sheet,
.knowledge-page--custom-background .knowledge-document-view__section,
.knowledge-page--custom-background .knowledge-document-view__text pre {
  background: color-mix(in srgb, var(--ui-surface-panel) 78%, transparent);
}

.knowledge-quick-notes__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  font-weight: 700;

  span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
}

.knowledge-quick-notes__search {
  display: block;
  margin: 6px 0;
}

.knowledge-quick-notes__search-input.ui-input-affix-wrapper {
  height: 28px;
  border-radius: 7px;
}

.knowledge-quick-notes__search-input :deep(.ui-input) {
  font-size: var(--ui-font-size-xs);
}

.knowledge-quick-note {
  --quick-note-accent: #d8a628;
  display: grid;
  width: 100%;
  gap: 2px;
  margin-top: 6px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--quick-note-accent) 30%, transparent);
  border-radius: 7px;
  color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--quick-note-accent) 12%, var(--ui-surface-panel));
  cursor: default;
  text-align: left;
}

.knowledge-quick-note--blue { --quick-note-accent: #63a7dc; }
.knowledge-quick-note--green { --quick-note-accent: #75bd68; }
.knowledge-quick-note--pink { --quick-note-accent: #dc7aa2; }
.knowledge-quick-note--purple { --quick-note-accent: #9b7bd9; }
.knowledge-quick-note--gray { --quick-note-accent: #94a3b8; }

.knowledge-quick-note:hover,
.knowledge-quick-note--active {
  border-color: color-mix(in srgb, var(--quick-note-accent) 62%, transparent);
  background: color-mix(in srgb, var(--quick-note-accent) 18%, var(--ui-surface-panel));
}

.knowledge-quick-note.ui-button:hover:not(:disabled),
.knowledge-quick-note.ui-button--active:not(:disabled) {
  border-color: color-mix(in srgb, var(--quick-note-accent) 62%, transparent);
  background: color-mix(in srgb, var(--quick-note-accent) 18%, var(--ui-surface-panel));
  transform: none;
  box-shadow: none;
}

.knowledge-quick-note :deep(.ui-button__label) {
  display: grid;
  justify-content: stretch;
  gap: 2px;
  min-width: 0;
}

.knowledge-quick-note strong,
.knowledge-quick-note span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-quick-note strong {
  font-size: var(--ui-font-size-xs);
}

.knowledge-quick-note span {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-mini-list__label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 8px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-mini-list__label span {
  flex: 1;
}

.knowledge-mini-list__item {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 0 8px 0 28px;
  font-size: var(--ui-font-size-xs);
}

.knowledge-mini-list__item time {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-space {
  margin-top: 8px;
}

.knowledge-space__head {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  color: var(--ui-text-primary);
  cursor: default;
}

.knowledge-space__head:hover,
.knowledge-space__head--active {
  color: var(--ui-primary-color);
  background: color-mix(in srgb, var(--ui-primary-color) 14%, transparent);
}

.knowledge-space__prefix,
.knowledge-space__actions,
.knowledge-space__toggle {
  display: inline-flex;
  align-items: center;
}

.knowledge-space__prefix {
  gap: 5px;
}

.knowledge-space__head > span:nth-child(2) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-font-size-sm);
}

.knowledge-space__toggle {
  justify-content: center;
  width: 16px;
  height: 20px;
  color: var(--ui-text-muted);
}

.knowledge-space__actions {
  gap: 4px;
  justify-content: flex-end;
}

.knowledge-space__actions .ui-icon-button {
  width: 22px;
  height: 22px;
}

.knowledge-space__actions strong {
  min-width: 16px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  text-align: right;
}

.knowledge-space--dragging {
  opacity: 0.55;
}

.knowledge-space__color {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.knowledge-space__tree {
  margin-top: 4px;
  min-height: 30px;
  border-radius: 6px;
}

.knowledge-space__tree--drop-target {
  background: color-mix(in srgb, var(--ui-primary-color) 12%, transparent);
  outline: 1px dashed color-mix(in srgb, var(--ui-primary-color) 46%, transparent);
}

.knowledge-empty-line {
  padding: 7px 8px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-workspace {
  position: relative;
  overflow: hidden;
  background: var(--knowledge-workspace-tint);
}

.knowledge-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-sm);
}

.knowledge-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.knowledge-state--inline {
  height: 220px;
}

.knowledge-editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.knowledge-editor__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 12px;
  padding: 8px clamp(12px, 1.4vw, 18px);
  border-bottom: 1px solid var(--knowledge-editor-header-border, var(--ui-border-subtle));
  background: var(--knowledge-editor-header-bg, var(--ui-surface-panel));
}

.knowledge-editor__header--block-page {
  position: absolute;
  width: 1px;
  height: 1px;
  min-height: 0;
  overflow: hidden;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
}

.knowledge-editor__header--block-page .knowledge-editor__meta {
  overflow: hidden;
}

.knowledge-editor__header--block-page .knowledge-editor__conversion {
  grid-column: auto;
}

.knowledge-page--custom-background .knowledge-editor__header,
.knowledge-page--custom-background :deep(.knowledge-markdown-editor__toolbar) {
  backdrop-filter: none;
}

.knowledge-page--custom-background :deep(.knowledge-markdown-editor__segmented),
.knowledge-page--custom-background :deep(.knowledge-markdown-editor__format),
.knowledge-page--custom-background :deep(.knowledge-markdown-editor__tools),
.knowledge-page--custom-background :deep(.knowledge-markdown-editor__search) {
  border-color: color-mix(in srgb, var(--ui-border-subtle) 58%, transparent);
}

.knowledge-editor__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  white-space: nowrap;
}

.knowledge-editor__title {
  display: block;
  min-width: 0;
  margin-top: 0;

  input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--ui-text-primary);
    background: transparent;
    font-size: var(--ui-font-size-lg);
    font-weight: 750;
    line-height: 1.2;
  }
}

.knowledge-editor__source {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 920px;
  margin-top: 0;
  padding: 6px 8px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  color: var(--ui-text-muted);
  background: var(--ui-surface-glass);
  font-size: var(--ui-font-size-xs);

  > svg {
    flex: 0 0 auto;
    color: var(--ui-primary-color);
  }

  span {
    display: grid;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
  }

  strong,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--ui-text-primary);
  }
}

.knowledge-editor__conversion {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.knowledge-editor__body {
  min-height: 0;
  overflow: auto;
  padding: 26px 32px 40px;
}

.knowledge-editor__body--markdown {
  overflow: hidden;
  padding: 0;
}

.knowledge-editor__body--block {
  overflow: hidden;
  padding: 0;
  background: transparent;
}

.knowledge-editor__body--canvas {
  overflow: hidden;
  padding: 0;
}

.knowledge-editor__markdown {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ui-text-primary);
  font-family: var(--ui-font-family-mono);
  font-size: var(--ui-font-size-md);
  line-height: 1.75;
}

.knowledge-document-view {
  min-height: 0;
}

.knowledge-document-view :deep(.ui-scrollbar__content) {
  padding: 34px 32px 42px;
}

.knowledge-document-view__hero {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 920px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--ui-border-subtle);

  > svg {
    flex: 0 0 auto;
    color: var(--ui-primary-color);
  }

  span {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    margin-top: 3px;
    font-size: var(--ui-font-size-xl);
  }

  p {
    margin-top: 5px;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-sm);
  }
}

.knowledge-document-view__meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  max-width: 920px;
  margin: 18px 0 0;

  div {
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: 8px;
    background: var(--ui-surface-glass);
  }

  dt {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }

  dd {
    margin: 5px 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-font-size-sm);
  }
}

.knowledge-document-view__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.knowledge-document-view__selection {
  max-width: 920px;
  margin: 10px 0 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-document-view__error {
  max-width: 920px;
  margin: 14px 0 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--ui-danger-color, #d95f5f) 42%, transparent);
  border-radius: 8px;
  color: var(--ui-danger-color, #d95f5f);
  background: color-mix(in srgb, var(--ui-danger-color, #d95f5f) 10%, transparent);
  font-size: var(--ui-font-size-xs);
  line-height: 1.5;
}

.knowledge-document-view__preview,
.knowledge-document-view__text {
  max-width: 920px;
  margin-top: 24px;

  h3 {
    margin: 0 0 10px;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-sm);
  }
}

.knowledge-document-view__preview {
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  header h3 {
    margin: 0;
  }

  header span {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }
}

.knowledge-document-view__frame-wrap,
.knowledge-document-view__image-wrap,
.knowledge-document-view__empty-preview {
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--ui-surface-panel);
}

.knowledge-document-view__frame-wrap {
  height: min(68vh, 720px);
  min-height: 460px;
  overflow: hidden;
}

.knowledge-document-view__frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--ui-surface-panel-muted);
}

.knowledge-document-view__image-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  overflow: auto;
  padding: 12px;
}

.knowledge-document-view__image {
  max-width: 100%;
  max-height: 68vh;
  object-fit: contain;
}

.knowledge-document-view__slides,
.knowledge-document-view__sheets,
.knowledge-document-view__sections {
  display: grid;
  gap: 12px;
}

.knowledge-document-view__slide,
.knowledge-document-view__sheet,
.knowledge-document-view__section {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--ui-surface-panel);

  span {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
  }

  h4 {
    margin: 4px 0 10px;
    font-size: var(--ui-font-size-lg);
  }

  pre {
    margin: 0;
    overflow: auto;
    padding: 14px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: 8px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--ui-text-primary);
    background: var(--ui-surface-panel);
    font-family: var(--ui-font-family-mono);
    font-size: var(--ui-font-size-sm);
    line-height: 1.7;
  }
}

.knowledge-document-view__text pre {
  max-height: 420px;
  margin: 0;
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ui-text-primary);
  background: var(--ui-surface-panel);
  font-family: var(--ui-font-family-mono);
  font-size: var(--ui-font-size-sm);
  line-height: 1.7;
}

.knowledge-document-view__table-wrap {
  max-height: 420px;
  overflow: auto;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
}

.knowledge-document-view__sheet table {
  width: 100%;
  border-collapse: collapse;
  background: var(--ui-surface-panel);
  font-size: var(--ui-font-size-xs);
}

.knowledge-document-view__sheet td {
  min-width: 96px;
  max-width: 240px;
  padding: 7px 9px;
  border-right: 1px solid var(--ui-border-subtle);
  border-bottom: 1px solid var(--ui-border-subtle);
  color: var(--ui-text-primary);
  vertical-align: top;
  word-break: break-word;
}

.knowledge-document-view__empty-preview {
  padding: 22px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-sm);
}

.knowledge-folder-view {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 34px 32px;
}

.knowledge-folder-view__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 8px;
  color: var(--ui-primary-color);
  background: color-mix(in srgb, var(--ui-primary-color) 15%, transparent);
}

.knowledge-folder-view h2,
.knowledge-folder-view p {
  margin: 0;
}

.knowledge-folder-view h2 {
  font-size: var(--ui-font-size-xl);
}

.knowledge-folder-view p {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-sm);
}

.knowledge-folder-view__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.knowledge-quick-note-detail {
  min-height: 0;
}

.knowledge-quick-note-detail :deep(.ui-scrollbar__content) {
  padding: 34px 32px;
}

.knowledge-quick-note-detail__paper {
  --quick-note-accent: #d8a628;
  max-width: 760px;
  min-height: 360px;
  padding: 24px;
  border: 1px solid color-mix(in srgb, var(--quick-note-accent) 42%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--quick-note-accent) 13%, var(--ui-surface-panel));
  box-shadow: var(--ui-panel-shadow);
}

.knowledge-quick-note-detail__paper--blue { --quick-note-accent: #63a7dc; }
.knowledge-quick-note-detail__paper--green { --quick-note-accent: #75bd68; }
.knowledge-quick-note-detail__paper--pink { --quick-note-accent: #dc7aa2; }
.knowledge-quick-note-detail__paper--purple { --quick-note-accent: #9b7bd9; }
.knowledge-quick-note-detail__paper--gray { --quick-note-accent: #94a3b8; }

.knowledge-quick-note-detail__meta,
.knowledge-quick-note-detail__tags,
.knowledge-quick-note-detail__links,
.knowledge-quick-note-detail__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.knowledge-quick-note-detail__meta,
.knowledge-quick-note-detail__links {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-quick-note-detail pre {
  margin: 18px 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ui-text-primary);
  font-family: inherit;
  font-size: var(--ui-font-size-lg);
  line-height: 1.75;
}

.knowledge-quick-note-detail__tags span,
.knowledge-quick-note-detail__links span {
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--quick-note-accent) 15%, transparent);
}

.knowledge-quick-note-detail__actions {
  margin-top: 20px;
}

.knowledge-inspector {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.knowledge-inspector__tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--ui-border-subtle);
}

.knowledge-inspector__content {
  min-height: 0;

  :deep(.ui-scrollbar__content) {
    padding: 18px 16px;
  }

  h2 {
    margin: 0 0 14px;
    font-size: var(--ui-font-size-md);
  }

  dl {
    display: grid;
    gap: 12px;
    margin: 0;
  }

  dt {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }

  dd {
    margin: 4px 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-font-size-sm);
  }
}

.knowledge-inspector__placeholder {
  margin: 18px 0 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  line-height: 1.6;
}

.knowledge-ai-panel {
  display: grid;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--ui-border-subtle);
}

.knowledge-ai-panel__controls,
.knowledge-ai-panel__actions,
.knowledge-ai-panel__citations {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.knowledge-ai-panel__controls {
  justify-content: space-between;
}

.knowledge-ai-panel__scope,
.knowledge-ai-panel__error {
  margin: 0;
  font-size: var(--ui-font-size-xs);
  line-height: 1.5;
}

.knowledge-ai-panel__scope {
  color: var(--ui-text-muted);
}

.knowledge-ai-panel__error {
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--ui-danger-color, #d95f5f) 36%, transparent);
  border-radius: 8px;
  color: var(--ui-danger-color, #d95f5f);
  background: color-mix(in srgb, var(--ui-danger-color, #d95f5f) 10%, transparent);
}

.knowledge-ai-panel__input {
  min-height: 94px;
}

.knowledge-ai-panel__messages {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.knowledge-ai-panel__message {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--ui-surface-panel);

  strong {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }

  p {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-sm);
    line-height: 1.6;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 10;
  }
}

.knowledge-ai-panel__message--assistant {
  background: color-mix(in srgb, var(--ui-primary-color) 5%, var(--ui-surface-panel));
}

.knowledge-ai-panel__citation {
  max-width: 100%;
}

.knowledge-ai-panel__citation :deep(.ui-button__label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-attachment-inspector {
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--ui-border-subtle);

  h3 {
    margin: 0;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }

  dl {
    gap: 10px;
  }

  dd {
    white-space: normal;
    word-break: break-word;
  }
}

.knowledge-attachment-inspector__actions {
  display: grid;
  gap: 8px;
}

.knowledge-index-jobs {
  display: grid;
  gap: 8px;
  margin-top: 18px;

  h3 {
    margin: 0;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }

  article {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 8px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: 7px;
    background: var(--ui-surface-glass);
  }

  strong,
  small {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: var(--ui-font-size-xs);
  }

  small {
    margin-top: 2px;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }
}

.knowledge-index-jobs__status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ui-text-muted);
}

.knowledge-index-jobs__status--succeeded {
  background: #6fbf73;
}

.knowledge-index-jobs__status--failed {
  background: #d95f5f;
}

.knowledge-index-jobs__status--running,
.knowledge-index-jobs__status--pending {
  background: var(--ui-primary-color);
}

.knowledge-index-jobs__status--cancelled {
  background: var(--ui-text-muted);
}

.knowledge-index-jobs__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.knowledge-relation-panel {
  display: grid;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--ui-border-subtle);

  h3 {
    margin: 0;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }

  article,
  .knowledge-relation-panel__item {
    display: grid;
    gap: 4px;
    min-width: 0;
    width: 100%;
    padding: 9px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: 8px;
    color: var(--ui-text-primary);
    background: var(--ui-surface-glass);
    text-align: left;
    cursor: pointer;
  }

  .knowledge-relation-panel__item:hover:not(:disabled) {
    color: var(--ui-text-primary);
    background: var(--ui-surface-glass);
    transform: none;
    box-shadow: none;
  }

  .knowledge-relation-panel__item :deep(.ui-button__label) {
    display: grid;
    justify-content: stretch;
    gap: 4px;
    min-width: 0;
  }

  strong,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: var(--ui-font-size-xs);
  }

  small {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }
}

.knowledge-inspector__muted {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-tag-list,
.knowledge-tag-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.knowledge-tag-chip {
  min-height: 26px;
  border: 1px solid color-mix(in srgb, var(--tag-color) 44%, var(--ui-border-subtle));
  border-radius: 8px;
  padding: 0 8px;
  color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--tag-color) 14%, var(--ui-surface-panel));
  font-size: var(--ui-font-size-xs);
  cursor: pointer;
}

.knowledge-tag-chip.ui-button:hover:not(:disabled),
.knowledge-tag-chip.ui-button--active:not(:disabled) {
  border-color: color-mix(in srgb, var(--tag-color) 44%, var(--ui-border-subtle));
  color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--tag-color) 14%, var(--ui-surface-panel));
  transform: none;
  box-shadow: none;
}

.knowledge-tag-targets {
  display: grid;
  grid-template-columns: 1fr;
}

.knowledge-tag-targets > .ui-button {
  min-height: 26px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 7px;
  color: var(--ui-text-primary);
  background: var(--ui-button-secondary-bg);
  cursor: pointer;
}

.knowledge-tag-targets > .ui-button:hover:not(:disabled) {
  color: var(--ui-text-primary);
  background: var(--ui-button-secondary-bg);
  transform: none;
  box-shadow: none;
}

.knowledge-tag-targets > .ui-button.active {
  border-color: color-mix(in srgb, var(--ui-primary-color) 55%, transparent);
  color: var(--ui-primary-color);
}

.knowledge-graph-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  span {
    min-height: 24px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: 7px;
    padding: 3px 8px;
    color: var(--ui-text-muted);
    background: var(--ui-surface-glass);
    font-size: var(--ui-font-size-xs);
  }
}

@media (max-width: 1760px) {
  .knowledge-shell {
    grid-template-columns: var(--knowledge-left-width) minmax(0, 1fr);
  }

  .knowledge-inspector {
    display: none;
  }
}

@media (max-width: 1180px) {
  .knowledge-editor__header {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .knowledge-editor__conversion {
    justify-content: flex-start;
  }
}

@media (max-width: 860px) {
  .knowledge-toolbar {
    grid-template-columns: 1fr;
  }

  .knowledge-toolbar__actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .knowledge-shell {
    grid-template-columns: var(--knowledge-left-width) minmax(0, 1fr) var(--knowledge-right-width);
  }
}
</style>
