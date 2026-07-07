<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiFileInput from '@/windows/main/components/ui/UiFileInput.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import {
  blockDocumentV2ToMarkdown,
  blockV2InlineText,
  cloneBlockV2ForPaste,
  createBlockV2,
  duplicateBlockWithResult,
  findBlockV2,
  indentBlock,
  insertBlockAfter,
  insertBlockAfterWithResult,
  insertBlocksAfterWithResult,
  markdownToBlockDocumentV2,
  mergeBlockBackward as mergeBlockBackwardDocument,
  moveBlockAfter,
  moveBlockBefore,
  normalizeBlockDocumentV2,
  outdentBlock,
  removeBlockWithResult,
  splitBlockAtTextOffset,
  updateBlockDocumentV2,
  type KnowledgeBlockDocumentV2,
  type KnowledgeBlockV2,
  type KnowledgeBlockV2Type,
} from '@/windows/main/utils/knowledge_blocks_v2';
import KnowledgeBlockRenderer from './block/KnowledgeBlockRenderer.vue';
import KnowledgeSlashMenu from './block/KnowledgeSlashMenu.vue';

type AssetFilePayload = {
  blockId: string;
  file: File;
  kind: 'image' | 'attachment';
};

type BlockMenuAction =
  | 'insert'
  | 'duplicate'
  | 'indent'
  | 'outdent'
  | 'delete'
  | 'convert_todo'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | KnowledgeBlockV2Type;

type BlockMenuItem = {
  action: BlockMenuAction;
  icon: string;
  label: string;
  keywords: string[];
};

type DropPlacement = 'before' | 'after';

const props = defineProps<{
  modelValue: KnowledgeBlockDocumentV2;
  dirty?: boolean;
  saving?: boolean;
  title?: string;
  kindLabel?: string;
  updatedAt?: string;
  selectionBackgroundColor?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: KnowledgeBlockDocumentV2): void;
  (event: 'update:title', value: string): void;
  (event: 'save-title'): void;
  (event: 'save'): void;
  (event: 'asset-file', payload: AssetFilePayload): void;
  (event: 'open-asset', assetId: string): void;
  (event: 'show-asset', assetId: string): void;
  (event: 'select-asset', assetId: string): void;
  (event: 'convert-todo', blockId: string): void;
}>();

const documentDraft = ref<KnowledgeBlockDocumentV2>(normalizeBlockDocumentV2(props.modelValue));
const activeFileBlock = ref<{ blockId: string; kind: 'image' | 'attachment' } | null>(null);
const fileInputRef = ref<InstanceType<typeof UiFileInput> | null>(null);
const markdownImportOpen = ref(false);
const markdownImportText = ref('');
const markdownExportOpen = ref(false);
const pendingFocusBlockId = ref<string | null>(null);
const pendingFocusCursorOffset = ref<number | undefined>(undefined);
const selectedBlockId = ref<string | null>(null);
const selectedBlockAnchorId = ref<string | null>(null);
const editorCanvasRef = ref<HTMLElement | null>(null);
const blockMenuRef = ref<HTMLElement | null>(null);
const blockMenuSearchRef = ref<HTMLInputElement | null>(null);
const blockMenuQuery = ref('');
const activeBlockMenuIndex = ref(0);
const draggedBlockId = ref<string | null>(null);
const dropTargetBlockId = ref<string | null>(null);
const dropTargetPlacement = ref<DropPlacement | null>(null);
const slashMenu = ref<{
  blockId: string;
  query: string;
  prefix: '/' | '+';
  x: number;
  y: number;
} | null>(null);
const blockMenu = ref<{
  blockId: string;
  x: number;
  y: number;
} | null>(null);
const selectedBlockClipboard = ref<KnowledgeBlockV2[]>([]);
const KNOWLEDGE_BLOCK_CLIPBOARD_MIME = 'application/x-guyantools-block-v2';
const KNOWLEDGE_BLOCKS_CLIPBOARD_MIME = 'application/x-guyantools-blocks-v2';
const SLASH_MENU_WIDTH = 324;
const SLASH_MENU_HEIGHT = 482;
const BLOCK_MENU_WIDTH = 324;
const BLOCK_MENU_HEIGHT = 386;
const MENU_VIEWPORT_MARGIN = 12;

const blockTypes: Array<{
  id?: string;
  type: KnowledgeBlockV2Type;
  icon: string;
  label: string;
  description: string;
  shortcut: string;
  keywords?: string[];
  group?: string;
  attrs?: Record<string, unknown>;
}> = [
  { id: 'paragraph', type: 'paragraph', icon: 'iconify:lucide:type', label: '文本', description: '普通文本块', shortcut: 'text', keywords: ['paragraph', 'text'], group: '基本区块' },
  { id: 'heading_1', type: 'heading', attrs: { level: 1 }, icon: 'iconify:lucide:heading-1', label: '标题 1', description: '大号章节标题', shortcut: '#', keywords: ['heading', 'h1', 'title'], group: '基本区块' },
  { id: 'heading_2', type: 'heading', attrs: { level: 2 }, icon: 'iconify:lucide:heading-2', label: '标题 2', description: '中号章节标题', shortcut: '##', keywords: ['heading', 'h2', 'title'], group: '基本区块' },
  { id: 'heading_3', type: 'heading', attrs: { level: 3 }, icon: 'iconify:lucide:heading-3', label: '标题 3', description: '小号章节标题', shortcut: '###', keywords: ['heading', 'h3', 'title'], group: '基本区块' },
  { id: 'heading_4', type: 'heading', attrs: { level: 4 }, icon: 'iconify:lucide:heading-4', label: '标题 4', description: '更小的章节标题', shortcut: '####', keywords: ['heading', 'h4', 'title'], group: '基本区块' },
  { id: 'bullet_list', type: 'bullet_list', icon: 'iconify:lucide:list', label: '项目符号列表', description: '用圆点组织条目', shortcut: '-', keywords: ['bullet', 'list'], group: '基本区块' },
  { id: 'ordered_list', type: 'ordered_list', icon: 'iconify:lucide:list-ordered', label: '有序列表', description: '按顺序记录步骤', shortcut: '1.', keywords: ['ordered', 'number'], group: '基本区块' },
  { id: 'task_list', type: 'task_list', icon: 'iconify:lucide:list-todo', label: '待办清单', description: '可勾选的任务项', shortcut: '[]', keywords: ['task', 'todo'], group: '基本区块' },
  { id: 'toggle', type: 'toggle', icon: 'iconify:lucide:list-collapse', label: '折叠列表', description: '收起或展开一组内容', shortcut: '>', keywords: ['toggle', 'details'], group: '基本区块' },
  { id: 'page_reference', type: 'page_reference', icon: 'iconify:lucide:file-text', label: '页面', description: '关联知识库页面', shortcut: '@page', keywords: ['page', 'reference', 'wiki'], group: '基本区块' },
  { id: 'callout', type: 'callout', icon: 'iconify:lucide:square-parking', label: '标注', description: '强调提示、注意或备注', shortcut: 'callout', keywords: ['callout', 'note'], group: '基本区块' },
  { id: 'code', type: 'code', icon: 'iconify:lucide:code-2', label: '代码', description: '带语言标记的代码块', shortcut: '```', keywords: ['code'], group: '结构' },
  { id: 'quote', type: 'quote', icon: 'iconify:lucide:quote', label: '引用', description: '突出一段引用或摘要', shortcut: '"', keywords: ['quote'], group: '结构' },
  { id: 'table', type: 'table', icon: 'iconify:lucide:table-2', label: '表格', description: '创建可编辑行列', shortcut: 'table', keywords: ['table', 'grid'], group: '结构' },
  { id: 'divider', type: 'divider', icon: 'iconify:lucide:minus', label: '分割线', description: '分隔页面内容', shortcut: '---', keywords: ['divider', 'hr'], group: '结构' },
  { id: 'image', type: 'image', icon: 'iconify:lucide:image-plus', label: '图片', description: '插入知识库图片资产', shortcut: 'image', keywords: ['image'], group: '媒体' },
  { id: 'attachment', type: 'attachment', icon: 'iconify:lucide:paperclip', label: '附件', description: '插入文件附件', shortcut: 'file', keywords: ['file', 'attachment'], group: '媒体' },
  { id: 'todo_reference', type: 'todo_reference', icon: 'iconify:lucide:list-checks', label: 'Todo 引用', description: '关联现有待办事项', shortcut: '@todo', keywords: ['todo', 'reference'], group: '引用' },
];

const blockMenuGroups: Array<{ id: string; items: BlockMenuItem[] }> = [
  {
    id: 'actions',
    items: [
      { action: 'insert', icon: 'iconify:lucide:plus', label: '下方插入', keywords: ['insert', 'add', 'below'] },
      { action: 'duplicate', icon: 'iconify:lucide:copy', label: '复制块', keywords: ['duplicate', 'copy'] },
      { action: 'convert_todo', icon: 'iconify:lucide:clipboard-check', label: '转为 Todo', keywords: ['todo', 'task', 'convert'] },
      { action: 'delete', icon: 'iconify:lucide:trash-2', label: '删除', keywords: ['delete', 'remove'] },
    ],
  },
  {
    id: 'turn-into',
    items: [
      { action: 'paragraph', icon: 'iconify:lucide:pilcrow', label: '转为正文', keywords: ['paragraph', 'text'] },
      { action: 'heading', icon: 'iconify:lucide:heading-2', label: '转为标题', keywords: ['heading', 'h1', 'h2', 'title'] },
      { action: 'heading_1', icon: 'iconify:lucide:heading-1', label: '标题 1', keywords: ['heading', 'h1', 'title'] },
      { action: 'heading_2', icon: 'iconify:lucide:heading-2', label: '标题 2', keywords: ['heading', 'h2', 'title'] },
      { action: 'heading_3', icon: 'iconify:lucide:heading-3', label: '标题 3', keywords: ['heading', 'h3', 'title'] },
      { action: 'bullet_list', icon: 'iconify:lucide:list', label: '转为项目列表', keywords: ['bullet', 'list', 'ul'] },
      { action: 'ordered_list', icon: 'iconify:lucide:list-ordered', label: '转为编号列表', keywords: ['ordered', 'number', 'ol'] },
      { action: 'task_list', icon: 'iconify:lucide:square-check', label: '转为待办', keywords: ['task', 'todo', 'check'] },
      { action: 'toggle', icon: 'iconify:lucide:list-collapse', label: '转为折叠列表', keywords: ['toggle', 'details', 'collapse'] },
      { action: 'quote', icon: 'iconify:lucide:quote', label: '转为引用', keywords: ['quote', 'blockquote'] },
      { action: 'callout', icon: 'iconify:lucide:badge-info', label: '转为提示', keywords: ['callout', 'note', 'tip'] },
      { action: 'code', icon: 'iconify:lucide:code-2', label: '转为代码', keywords: ['code', 'pre'] },
    ],
  },
  {
    id: 'layout',
    items: [
      { action: 'indent', icon: 'iconify:lucide:indent-increase', label: '缩进', keywords: ['indent', 'nest'] },
      { action: 'outdent', icon: 'iconify:lucide:indent-decrease', label: '取消缩进', keywords: ['outdent', 'unnest'] },
    ],
  },
];

const markdownExport = computed(() => blockDocumentV2ToMarkdown(documentDraft.value));
const filteredBlockMenuGroups = computed(() => {
  const query = blockMenuQuery.value.trim().toLowerCase();
  return blockMenuGroups
    .map((group) => ({
      ...group,
      items: query
        ? group.items.filter((item) => [
          item.action,
          item.label,
          ...item.keywords,
        ].some((value) => String(value).toLowerCase().includes(query)))
        : group.items,
    }))
    .filter((group) => group.items.length > 0);
});
const blockMenuItems = computed(() => filteredBlockMenuGroups.value.flatMap((group) => group.items));
const activeBlockMenuItem = computed(() => blockMenuItems.value[activeBlockMenuIndex.value] ?? null);
const selectedBlockIds = computed(() => {
  const cursorBlockId = selectedBlockId.value;
  if (!cursorBlockId) return [];

  const blocks = flattenDocumentBlocks(documentDraft.value.blocks);
  const cursorIndex = blocks.findIndex((block) => block.id === cursorBlockId);
  const anchorIndex = blocks.findIndex((block) => block.id === selectedBlockAnchorId.value);
  if (cursorIndex < 0 || anchorIndex < 0) return [cursorBlockId];

  const startIndex = Math.min(anchorIndex, cursorIndex);
  const endIndex = Math.max(anchorIndex, cursorIndex);
  return blocks.slice(startIndex, endIndex + 1).map((block) => block.id);
});

watch(
  () => props.modelValue,
  (value) => {
    documentDraft.value = normalizeBlockDocumentV2(value);
  },
  { deep: true },
);

function updateDocument(blocks: KnowledgeBlockV2[]) {
  documentDraft.value = normalizeBlockDocumentV2({
    ...documentDraft.value,
    updatedAt: new Date().toISOString(),
    blocks,
  });
  emit('update:modelValue', documentDraft.value);
}

function replaceDocument(document: KnowledgeBlockDocumentV2) {
  documentDraft.value = normalizeBlockDocumentV2(document);
  emit('update:modelValue', documentDraft.value);
}

function addBlock(type: KnowledgeBlockV2Type, afterBlockId?: string) {
  const block = createBlockV2(type, '', defaultAttrsForType(type));
  if (afterBlockId) {
    updateDocument(insertBlockAfter(documentDraft.value.blocks, afterBlockId, block));
    pendingFocusBlockId.value = block.id;
    pendingFocusCursorOffset.value = 0;
    return;
  }
  updateDocument([...documentDraft.value.blocks, block]);
  pendingFocusBlockId.value = block.id;
  pendingFocusCursorOffset.value = 0;
}

function updateBlock(blockId: string, patch: Partial<KnowledgeBlockV2>) {
  selectedBlockId.value = null;
  selectedBlockAnchorId.value = null;
  if (slashMenu.value?.blockId === blockId && patch.content && !isBlockCommandText(inlineTextFromContent(patch.content))) {
    slashMenu.value = null;
  }
  if (blockMenu.value?.blockId === blockId && patch.content) {
    blockMenu.value = null;
  }
  const next = updateBlockDocumentV2(documentDraft.value, blockId, patch);
  replaceDocument(next);
}

function convertBlock(blockId: string, type: KnowledgeBlockV2Type, attrsPatch: Record<string, unknown> = {}) {
  convertBlocks([blockId], type, attrsPatch);
}

function convertBlocks(blockIds: string[], type: KnowledgeBlockV2Type, attrsPatch: Record<string, unknown> = {}) {
  if (!blockIds.length) return;
  let nextDocument = documentDraft.value;

  for (const blockId of blockIds) {
    const block = findBlockV2(nextDocument.blocks, blockId);
    if (!block) continue;

    const text = blockV2InlineText(block);
    nextDocument = updateBlockDocumentV2(nextDocument, blockId, {
      type,
      content: isBlockCommandText(text) ? [] : block.content,
      attrs: {
        ...defaultAttrsForType(type, block.attrs),
        ...attrsPatch,
      },
      refs: block.refs,
    });
  }

  replaceDocument(nextDocument);
  pendingFocusCursorOffset.value = 0;
  if (blockIds.length > 1) {
    selectedBlockAnchorId.value = blockIds[0] ?? null;
    selectedBlockId.value = blockIds[blockIds.length - 1] ?? null;
    pendingFocusBlockId.value = null;
    focusSelectedBlockShell();
  } else {
    pendingFocusBlockId.value = blockIds[0] ?? null;
  }
}

function removeBlock(blockId: string) {
  const result = removeBlockWithResult(documentDraft.value.blocks, blockId);
  updateDocument(result.blocks);
  if (result.focusBlockId) {
    selectedBlockId.value = result.focusBlockId;
    selectedBlockAnchorId.value = result.focusBlockId;
    pendingFocusBlockId.value = null;
    pendingFocusCursorOffset.value = undefined;
    focusSelectedBlockShell();
  } else {
    selectedBlockId.value = null;
    selectedBlockAnchorId.value = null;
  }
}

function duplicateBlock(blockId: string) {
  const result = duplicateBlockWithResult(documentDraft.value.blocks, blockId);
  updateDocument(result.blocks);
  if (result.duplicatedBlockId) {
    selectedBlockId.value = result.duplicatedBlockId;
    selectedBlockAnchorId.value = result.duplicatedBlockId;
    pendingFocusBlockId.value = null;
    pendingFocusCursorOffset.value = undefined;
    focusSelectedBlockShell();
  }
}

function indentBlockDraft(blockId: string) {
  updateDocument(indentBlock(documentDraft.value.blocks, blockId));
}

function outdentBlockDraft(blockId: string) {
  updateDocument(outdentBlock(documentDraft.value.blocks, blockId));
}

function chooseAsset(blockId: string, kind: 'image' | 'attachment') {
  activeFileBlock.value = { blockId, kind };
  fileInputRef.value?.click();
}

function clampMenuAxis(preferred: number, size: number, viewportSize: number) {
  const max = Math.max(MENU_VIEWPORT_MARGIN, viewportSize - size - MENU_VIEWPORT_MARGIN);
  return Math.min(Math.max(preferred, MENU_VIEWPORT_MARGIN), max);
}

function openSlashMenu(payload: { blockId: string; query: string; prefix?: '/' | '+'; rect: DOMRect | null }) {
  const rect = payload.rect;
  slashMenu.value = {
    blockId: payload.blockId,
    query: payload.query,
    prefix: payload.prefix ?? '/',
    x: clampMenuAxis((rect?.left ?? 24) - 4, SLASH_MENU_WIDTH, window.innerWidth),
    y: clampMenuAxis((rect?.bottom ?? 96) + 6, SLASH_MENU_HEIGHT, window.innerHeight),
  };
}

function openBlockMenu(payload: { blockId: string; rect: DOMRect | null }) {
  const rect = payload.rect;
  slashMenu.value = null;
  blockMenuQuery.value = '';
  activeBlockMenuIndex.value = 0;
  blockMenu.value = {
    blockId: payload.blockId,
    x: clampMenuAxis((rect?.left ?? 24) - 4, BLOCK_MENU_WIDTH, window.innerWidth),
    y: clampMenuAxis((rect?.bottom ?? 96) + 6, BLOCK_MENU_HEIGHT, window.innerHeight),
  };
  void nextTick(() => blockMenuSearchRef.value?.focus({ preventScroll: true }));
}

function getSelectedBlockRect(blockId: string) {
  const blocks = editorCanvasRef.value?.querySelectorAll<HTMLElement>('[data-knowledge-block-id]');
  if (!blocks) return null;
  return Array.from(blocks)
    .find((element) => element.dataset.knowledgeBlockId === blockId)
    ?.getBoundingClientRect() ?? null;
}

function openSelectedBlockMenu() {
  const blockId = selectedBlockId.value;
  if (!blockId) return;
  openBlockMenu({
    blockId,
    rect: getSelectedBlockRect(blockId),
  });
}

function closeBlockMenu() {
  blockMenu.value = null;
  blockMenuQuery.value = '';
  activeBlockMenuIndex.value = 0;
}

function runBlockMenuAction(action: BlockMenuAction) {
  const blockId = blockMenu.value?.blockId;
  if (!blockId) return;
  const targetIds = getBlockMenuTargetIds(blockId);
  const lastTargetId = targetIds[targetIds.length - 1] ?? blockId;

  if (action === 'insert') addBlock('paragraph', lastTargetId);
  else if (action === 'duplicate') targetIds.length > 1 ? duplicateSelectedBlocks() : duplicateBlock(blockId);
  else if (action === 'convert_todo') targetIds.forEach((targetId) => emit('convert-todo', targetId));
  else if (action === 'indent') targetIds.length > 1 ? indentSelectedBlocks('indent') : indentBlockDraft(blockId);
  else if (action === 'outdent') targetIds.length > 1 ? indentSelectedBlocks('outdent') : outdentBlockDraft(blockId);
  else if (action === 'delete') targetIds.length > 1 ? removeSelectedBlocks() : removeBlock(blockId);
  else if (action === 'heading_1') convertBlocks(targetIds, 'heading', { level: 1 });
  else if (action === 'heading_2') convertBlocks(targetIds, 'heading', { level: 2 });
  else if (action === 'heading_3') convertBlocks(targetIds, 'heading', { level: 3 });
  else convertBlocks(targetIds, action);

  closeBlockMenu();
}

function getBlockMenuTargetIds(blockId: string) {
  return selectedBlockIds.value.includes(blockId) ? selectedBlockIds.value : [blockId];
}

function blockMenuItemIndex(groupIndex: number, itemIndex: number) {
  return filteredBlockMenuGroups.value
    .slice(0, groupIndex)
    .reduce((total, group) => total + group.items.length, itemIndex);
}

function blockMenuGroupLabel(groupId: string) {
  const labels: Record<string, string> = {
    actions: '操作',
    'turn-into': '转换为',
    layout: '布局',
  };
  return labels[groupId] ?? groupId;
}

function handleBlockMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeBlockMenu();
    return;
  }

  if (event.key === 'ArrowDown') {
    const count = blockMenuItems.value.length;
    if (!count) return;
    event.preventDefault();
    activeBlockMenuIndex.value = (activeBlockMenuIndex.value + 1) % count;
    return;
  }

  if (event.key === 'ArrowUp') {
    const count = blockMenuItems.value.length;
    if (!count) return;
    event.preventDefault();
    activeBlockMenuIndex.value = (activeBlockMenuIndex.value - 1 + count) % count;
    return;
  }

  if (event.key === 'Home') {
    if (!blockMenuItems.value.length) return;
    event.preventDefault();
    activeBlockMenuIndex.value = 0;
    return;
  }

  if (event.key === 'End') {
    const count = blockMenuItems.value.length;
    if (!count) return;
    event.preventDefault();
    activeBlockMenuIndex.value = count - 1;
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    if (event.key === ' ' && event.target instanceof HTMLInputElement) return;
    event.preventDefault();
    const item = activeBlockMenuItem.value;
    if (item) runBlockMenuAction(item.action);
    return;
  }
}

watch(
  () => [blockMenuQuery.value, blockMenuItems.value.length] as const,
  () => {
    activeBlockMenuIndex.value = 0;
  },
);

function selectSlashBlock(type: KnowledgeBlockV2Type, attrsPatch: Record<string, unknown> = {}) {
  const menu = slashMenu.value;
  if (!menu) return;

  const block = findBlockV2(documentDraft.value.blocks, menu.blockId);
  if (!block) {
    slashMenu.value = null;
    return;
  }

  convertBlock(block.id, type, attrsPatch);
  slashMenu.value = null;
}

function splitBlock(payload: { blockId: string; offset: number }) {
  const result = splitBlockAtTextOffset(documentDraft.value, payload.blockId, payload.offset);
  replaceDocument(result.document);
  pendingFocusBlockId.value = result.focusBlockId;
  pendingFocusCursorOffset.value = result.cursorOffset;
}

function pasteMarkdownAfterBlock(payload: { blockId: string; markdown: string }) {
  const blocks = markdownToBlockDocumentV2(payload.markdown).blocks.map(cloneBlockV2ForPaste);
  if (!blocks.length) return;
  const result = insertBlocksAfterWithResult(documentDraft.value.blocks, payload.blockId, blocks);
  updateDocument(result.blocks);
  selectedBlockId.value = result.insertedBlockId;
  selectedBlockAnchorId.value = result.insertedBlockId;
  pendingFocusBlockId.value = null;
  pendingFocusCursorOffset.value = undefined;
  focusSelectedBlockShell();
}

function mergeBlockBackward(payload: { blockId: string }) {
  const result = mergeBlockBackwardDocument(documentDraft.value, payload.blockId);
  replaceDocument(result.document);
  pendingFocusBlockId.value = result.focusBlockId;
  pendingFocusCursorOffset.value = result.cursorOffset;
}

function focusPreviousBlock(payload: { blockId: string }) {
  const blocks = flattenDocumentBlocks(documentDraft.value.blocks);
  const index = blocks.findIndex((block) => block.id === payload.blockId);
  if (index <= 0) return;
  const previousBlock = blocks[index - 1];
  selectedBlockId.value = null;
  selectedBlockAnchorId.value = null;
  pendingFocusBlockId.value = previousBlock.id;
  pendingFocusCursorOffset.value = blockV2InlineText(previousBlock).length;
}

function focusNextBlock(payload: { blockId: string }) {
  const blocks = flattenDocumentBlocks(documentDraft.value.blocks);
  const index = blocks.findIndex((block) => block.id === payload.blockId);
  if (index < 0 || index >= blocks.length - 1) return;
  selectedBlockId.value = null;
  selectedBlockAnchorId.value = null;
  pendingFocusBlockId.value = blocks[index + 1].id;
  pendingFocusCursorOffset.value = 0;
}

function flattenDocumentBlocks(blocks: KnowledgeBlockV2[]): KnowledgeBlockV2[] {
  return blocks.flatMap((block) => [
    block,
    ...flattenDocumentBlocks(block.children ?? []),
  ]);
}

function handleBlockDragStart(payload: { blockId: string; event: DragEvent }) {
  draggedBlockId.value = payload.blockId;
  payload.event.dataTransfer?.setData('text/plain', payload.blockId);
  if (payload.event.dataTransfer) {
    payload.event.dataTransfer.effectAllowed = 'move';
  }
}

function handleBlockDragOver(payload: { blockId: string; placement: DropPlacement }) {
  const draggingIds = getDraggingBlockIds();
  if (!draggingIds.length || draggingIds.includes(payload.blockId)) {
    if (dropTargetBlockId.value === payload.blockId) {
      dropTargetBlockId.value = null;
      dropTargetPlacement.value = null;
    }
    return;
  }
  dropTargetBlockId.value = payload.blockId;
  dropTargetPlacement.value = payload.placement;
}

function handleBlockDragLeave(payload: { blockId: string; event: DragEvent }) {
  const currentTarget = payload.event.currentTarget as HTMLElement | null;
  const nextTarget = payload.event.relatedTarget as Node | null;
  if (currentTarget && nextTarget && currentTarget.contains(nextTarget)) return;
  if (dropTargetBlockId.value !== payload.blockId) return;
  dropTargetBlockId.value = null;
  dropTargetPlacement.value = null;
}

function handleBlockDrop(payload: { blockId: string; placement: DropPlacement }) {
  const sourceBlockId = draggedBlockId.value;
  const draggingIds = getDraggingBlockIds();
  draggedBlockId.value = null;
  dropTargetBlockId.value = null;
  dropTargetPlacement.value = null;
  if (!sourceBlockId || !draggingIds.length || draggingIds.includes(payload.blockId)) return;

  let nextDocument = documentDraft.value;
  let focusBlockId = sourceBlockId;
  const orderedDraggingIds = payload.placement === 'before'
    ? draggingIds
    : [...draggingIds].reverse();
  for (const blockId of orderedDraggingIds) {
    const result = payload.placement === 'before'
      ? moveBlockBefore(nextDocument, blockId, payload.blockId)
      : moveBlockAfter(nextDocument, blockId, payload.blockId);
    nextDocument = result.document;
    focusBlockId = result.focusBlockId;
  }

  replaceDocument(nextDocument);
  pendingFocusCursorOffset.value = undefined;
  if (draggingIds.length > 1) {
    selectedBlockAnchorId.value = draggingIds[0] ?? null;
    selectedBlockId.value = draggingIds[draggingIds.length - 1] ?? null;
    pendingFocusBlockId.value = null;
    focusSelectedBlockShell();
  } else {
    pendingFocusBlockId.value = focusBlockId;
  }
}

function getDraggingBlockIds() {
  const blockId = draggedBlockId.value;
  if (!blockId) return [];
  return selectedBlockIds.value.includes(blockId) ? selectedBlockIds.value : [blockId];
}

function selectBlock(blockId: string) {
  selectedBlockId.value = blockId;
  selectedBlockAnchorId.value = blockId;
  pendingFocusBlockId.value = null;
  pendingFocusCursorOffset.value = undefined;
  focusSelectedBlockShell();
}

function focusSelectedBlockShell() {
  requestAnimationFrame(() => {
    editorCanvasRef.value?.focus({ preventScroll: true });
  });
}

function handleSelectedBlockKeydown(event: KeyboardEvent) {
  if (!selectedBlockId.value) return;

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'c') {
    event.preventDefault();
    copySelectedBlockToClipboard();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'x') {
    event.preventDefault();
    cutSelectedBlockToClipboard();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'v') {
    event.preventDefault();
    void pasteBlockAfterSelection();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'ArrowUp') {
    event.preventDefault();
    moveSelectedBlocks(-1);
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'ArrowDown') {
    event.preventDefault();
    moveSelectedBlocks(1);
    return;
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === '/') {
    event.preventDefault();
    openSelectedBlockMenu();
    return;
  }

  if (event.shiftKey && event.key === 'ArrowUp') {
    event.preventDefault();
    extendSelectedBlockRange(-1);
    return;
  }

  if (event.shiftKey && event.key === 'ArrowDown') {
    event.preventDefault();
    extendSelectedBlockRange(1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectAdjacentBlock(-1);
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectAdjacentBlock(1);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const block = findBlockV2(documentDraft.value.blocks, selectedBlockId.value);
    if (!block) return;
    pendingFocusBlockId.value = block.id;
    pendingFocusCursorOffset.value = blockV2InlineText(block).length;
    selectedBlockId.value = null;
    selectedBlockAnchorId.value = null;
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    removeSelectedBlocks();
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    indentSelectedBlocks(event.shiftKey ? 'outdent' : 'indent');
    focusSelectedBlockShell();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    duplicateSelectedBlocks();
  }
}

function copySelectedBlockToClipboard() {
  const blocks = getSelectedBlocks();
  if (!blocks.length) return;
  void writeSelectedBlocksToClipboard(blocks);
}

function cutSelectedBlockToClipboard() {
  const blocks = getSelectedBlocks();
  if (!blocks.length) return;
  void writeSelectedBlocksToClipboard(blocks);
  removeSelectedBlocks();
}

async function pasteBlockAfterSelection() {
  const blockId = selectedBlockId.value;
  if (!blockId) return;

  const pastedBlocks = await readBlocksFromClipboard();
  if (!pastedBlocks.length) return;

  const result = pastedBlocks.length === 1
    ? insertBlockAfterWithResult(documentDraft.value.blocks, blockId, pastedBlocks[0])
    : insertBlocksAfterWithResult(documentDraft.value.blocks, blockId, pastedBlocks);
  updateDocument(result.blocks);
  selectedBlockId.value = result.insertedBlockId;
  selectedBlockAnchorId.value = result.insertedBlockId;
  pendingFocusBlockId.value = null;
  pendingFocusCursorOffset.value = undefined;
  focusSelectedBlockShell();
}

function duplicateSelectedBlocks() {
  const blocks = getSelectedBlocks();
  const anchorBlockId = selectedBlockIds.value[selectedBlockIds.value.length - 1];
  if (!blocks.length || !anchorBlockId) return;

  if (blocks.length === 1 && selectedBlockId.value) {
    duplicateBlock(selectedBlockId.value);
    return;
  }

  const duplicatedBlocks = blocks.map(cloneBlockV2ForPaste);
  const result = insertBlocksAfterWithResult(documentDraft.value.blocks, anchorBlockId, duplicatedBlocks);
  updateDocument(result.blocks);
  selectedBlockAnchorId.value = duplicatedBlocks[0]?.id ?? result.insertedBlockId;
  selectedBlockId.value = duplicatedBlocks[duplicatedBlocks.length - 1]?.id ?? result.insertedBlockId;
  pendingFocusBlockId.value = null;
  pendingFocusCursorOffset.value = undefined;
  focusSelectedBlockShell();
}

function getSelectedBlocks() {
  const blockIds = new Set(selectedBlockIds.value);
  if (!blockIds.size) return [];
  return flattenDocumentBlocks(documentDraft.value.blocks)
    .filter((block) => blockIds.has(block.id));
}

function indentSelectedBlocks(direction: 'indent' | 'outdent') {
  if (!selectedBlockIds.value.length) return;
  let nextBlocks = documentDraft.value.blocks;
  for (const blockId of selectedBlockIds.value) {
    nextBlocks = direction === 'indent'
      ? indentBlock(nextBlocks, blockId)
      : outdentBlock(nextBlocks, blockId);
  }
  updateDocument(nextBlocks);
  pendingFocusBlockId.value = null;
  pendingFocusCursorOffset.value = undefined;
  focusSelectedBlockShell();
}

function removeSelectedBlocks() {
  const blockIds = selectedBlockIds.value;
  if (!blockIds.length) return;

  const selectedIds = new Set(blockIds);
  const beforeBlocks = flattenDocumentBlocks(documentDraft.value.blocks);
  let nextBlocks = documentDraft.value.blocks;
  for (const blockId of blockIds) {
    nextBlocks = removeBlockWithResult(nextBlocks, blockId).blocks;
  }

  updateDocument(nextBlocks);
  const firstRemovedIndex = beforeBlocks.findIndex((block) => selectedIds.has(block.id));
  const focusBlock = [
    ...beforeBlocks.slice(0, Math.max(firstRemovedIndex, 0)).reverse(),
    ...beforeBlocks.slice(Math.max(firstRemovedIndex, 0) + blockIds.length),
  ].find((block) => !selectedIds.has(block.id));

  if (focusBlock) {
    selectedBlockId.value = focusBlock.id;
    selectedBlockAnchorId.value = focusBlock.id;
    pendingFocusBlockId.value = null;
    pendingFocusCursorOffset.value = undefined;
    focusSelectedBlockShell();
  } else {
    const fallbackBlock = nextBlocks[0];
    selectedBlockId.value = fallbackBlock?.id ?? null;
    selectedBlockAnchorId.value = fallbackBlock?.id ?? null;
  }
}

async function writeSelectedBlockToClipboard(block: KnowledgeBlockV2) {
  await writeSelectedBlocksToClipboard([block]);
}

async function writeSelectedBlocksToClipboard(blocks: KnowledgeBlockV2[]) {
  selectedBlockClipboard.value = blocks;
  const markdown = blocksToClipboardMarkdown(blocks);
  const json = JSON.stringify(blocks);

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const clipboardPayload: Record<string, Blob> = {
        [KNOWLEDGE_BLOCKS_CLIPBOARD_MIME]: new Blob([json], { type: KNOWLEDGE_BLOCKS_CLIPBOARD_MIME }),
        'text/plain': new Blob([markdown], { type: 'text/plain' }),
      };
      if (blocks.length === 1) {
        clipboardPayload[KNOWLEDGE_BLOCK_CLIPBOARD_MIME] = new Blob([JSON.stringify(blocks[0])], { type: KNOWLEDGE_BLOCK_CLIPBOARD_MIME });
      }
      await navigator.clipboard.write([
        new ClipboardItem(clipboardPayload),
      ]);
      return;
    }
  } catch {
    // Some platforms reject custom clipboard MIME types; plain text remains enough for external paste.
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(markdown);
  }
}

async function readBlocksFromClipboard(): Promise<KnowledgeBlockV2[]> {
  const structuredBlocks = await readSelectedBlocksFromClipboard();
  if (structuredBlocks?.length) return structuredBlocks.map(cloneBlockV2ForPaste);

  const text = await readTextFromClipboard();
  if (!text.trim()) return [];
  return markdownToBlockDocumentV2(text).blocks.map(cloneBlockV2ForPaste);
}

async function readSelectedBlockFromClipboard(): Promise<KnowledgeBlockV2 | null> {
  const blocks = await readSelectedBlocksFromClipboard();
  return blocks?.[0] ?? null;
}

async function readSelectedBlocksFromClipboard(): Promise<KnowledgeBlockV2[] | null> {
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes(KNOWLEDGE_BLOCKS_CLIPBOARD_MIME)) {
          const blob = await item.getType(KNOWLEDGE_BLOCKS_CLIPBOARD_MIME);
          const parsed = JSON.parse(await blob.text()) as unknown;
          return normalizeBlockDocumentV2({
            type: 'guyantools.block-page',
            version: 2,
            updatedAt: new Date().toISOString(),
            blocks: Array.isArray(parsed) ? parsed : [],
          }).blocks;
        }
        if (item.types.includes(KNOWLEDGE_BLOCK_CLIPBOARD_MIME)) {
          const blob = await item.getType(KNOWLEDGE_BLOCK_CLIPBOARD_MIME);
          const parsed = JSON.parse(await blob.text()) as unknown;
          return normalizeBlockDocumentV2({
            type: 'guyantools.block-page',
            version: 2,
            updatedAt: new Date().toISOString(),
            blocks: [parsed],
          }).blocks;
        }
      }
    }
  } catch {
    // Fall back to the in-memory same-session copy if structured clipboard read is blocked.
  }
  return selectedBlockClipboard.value.length ? selectedBlockClipboard.value : null;
}

async function readTextFromClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

function blockToClipboardMarkdown(block: KnowledgeBlockV2) {
  return blocksToClipboardMarkdown([block]);
}

function blocksToClipboardMarkdown(blocks: KnowledgeBlockV2[]) {
  return blockDocumentV2ToMarkdown({
    type: 'guyantools.block-page',
    version: 2,
    updatedAt: new Date().toISOString(),
    blocks,
  });
}

function moveSelectedBlock(direction: -1 | 1) {
  const blockId = selectedBlockId.value;
  if (!blockId) return;

  const blocks = flattenDocumentBlocks(documentDraft.value.blocks);
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return;

  const adjacentBlock = blocks[index + direction];
  if (!adjacentBlock) return;

  const result = direction === -1
    ? moveBlockBefore(documentDraft.value, blockId, adjacentBlock.id)
    : moveBlockBefore(documentDraft.value, adjacentBlock.id, blockId);
  replaceDocument(result.document);
  selectedBlockId.value = blockId;
  selectedBlockAnchorId.value = blockId;
  pendingFocusBlockId.value = null;
  pendingFocusCursorOffset.value = undefined;
  focusSelectedBlockShell();
}

function moveSelectedBlocks(direction: -1 | 1) {
  if (selectedBlockIds.value.length <= 1) {
    moveSelectedBlock(direction);
    return;
  }

  const selectedIds = new Set(selectedBlockIds.value);
  const blocks = flattenDocumentBlocks(documentDraft.value.blocks);
  const firstIndex = blocks.findIndex((block) => selectedIds.has(block.id));
  const lastIndex = blocks.reduce(
    (last, block, index) => selectedIds.has(block.id) ? index : last,
    -1,
  );
  if (firstIndex < 0 || lastIndex < 0) return;

  const adjacentBlock = direction === -1 ? blocks[firstIndex - 1] : blocks[lastIndex + 1];
  if (!adjacentBlock || selectedIds.has(adjacentBlock.id)) return;

  let nextDocument = documentDraft.value;
  if (direction === -1) {
    for (const blockId of selectedBlockIds.value) {
      nextDocument = moveBlockBefore(nextDocument, blockId, adjacentBlock.id).document;
    }
  } else {
    nextDocument = moveBlockBefore(nextDocument, adjacentBlock.id, selectedBlockIds.value[0]).document;
  }

  replaceDocument(nextDocument);
  pendingFocusBlockId.value = null;
  pendingFocusCursorOffset.value = undefined;
  focusSelectedBlockShell();
}

function selectAdjacentBlock(direction: -1 | 1) {
  const blocks = flattenDocumentBlocks(documentDraft.value.blocks);
  const index = blocks.findIndex((block) => block.id === selectedBlockId.value);
  if (index < 0) return;
  const nextBlock = blocks[index + direction];
  if (!nextBlock) return;
  selectedBlockId.value = nextBlock.id;
  selectedBlockAnchorId.value = nextBlock.id;
}

function extendSelectedBlockRange(direction: -1 | 1) {
  const blockId = selectedBlockId.value;
  if (!blockId) return;

  const blocks = flattenDocumentBlocks(documentDraft.value.blocks);
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return;

  const nextBlock = blocks[index + direction];
  if (!nextBlock) return;

  selectedBlockAnchorId.value = selectedBlockAnchorId.value ?? blockId;
  selectedBlockId.value = nextBlock.id;
  focusSelectedBlockShell();
}

function clearBlockDrag() {
  draggedBlockId.value = null;
  dropTargetBlockId.value = null;
  dropTargetPlacement.value = null;
}

function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const target = activeFileBlock.value;
  input.value = '';
  activeFileBlock.value = null;
  if (!file || !target) return;
  emit('asset-file', {
    blockId: target.blockId,
    file,
    kind: target.kind,
  });
}

function importMarkdown() {
  const value = markdownImportText.value.trim();
  if (!value) return;
  replaceDocument(markdownToBlockDocumentV2(value));
  markdownImportText.value = '';
  markdownImportOpen.value = false;
}

function copyMarkdown() {
  const writePromise = navigator.clipboard?.writeText(markdownExport.value);
  if (writePromise) {
    void writePromise.catch(() => {
      markdownExportOpen.value = true;
    });
  } else {
    markdownExportOpen.value = true;
  }
}

function defaultAttrsForType(
  type: KnowledgeBlockV2Type,
  current: Record<string, unknown> = {},
): Record<string, unknown> {
  if (type === 'heading') return { ...current, level: typeof current.level === 'number' ? current.level : 2 };
  if (type === 'task_list') return { ...current, checked: typeof current.checked === 'boolean' ? current.checked : false };
  if (type === 'toggle') return { ...current, open: typeof current.open === 'boolean' ? current.open : true };
  if (type === 'code') return { ...current, language: typeof current.language === 'string' ? current.language : 'text' };
  if (type === 'table') {
    return {
      ...current,
      rows: typeof current.rows === 'number' ? current.rows : 3,
      columns: typeof current.columns === 'number' ? current.columns : 3,
    };
  }
  return current;
}

function inlineTextFromContent(content: KnowledgeBlockV2['content']) {
  return content.map((item) => item.text).join('');
}

function isBlockCommandText(value: string) {
  return value.startsWith('/') || value.startsWith('+');
}

function isTextEntryBlock(block: KnowledgeBlockV2 | undefined): block is KnowledgeBlockV2 {
  return Boolean(block && !['code', 'divider', 'table', 'image', 'attachment'].includes(block.type));
}

function focusBlockForWriting(block: KnowledgeBlockV2, offset = inlineTextFromContent(block.content).length) {
  selectedBlockId.value = null;
  selectedBlockAnchorId.value = null;
  pendingFocusBlockId.value = block.id;
  pendingFocusCursorOffset.value = offset;
}

function handleBlockFocused(blockId: string) {
  selectedBlockId.value = null;
  selectedBlockAnchorId.value = null;
  if (pendingFocusBlockId.value === blockId) {
    pendingFocusBlockId.value = null;
    pendingFocusCursorOffset.value = undefined;
  }
}

function focusWritingSurface(event: MouseEvent) {
  if (event.target !== event.currentTarget) return;
  selectedBlockId.value = null;
  selectedBlockAnchorId.value = null;
  const lastBlock = documentDraft.value.blocks[documentDraft.value.blocks.length - 1];
  if (isTextEntryBlock(lastBlock) && inlineTextFromContent(lastBlock.content).length === 0) {
    focusBlockForWriting(lastBlock);
    return;
  }
  if (lastBlock) {
    addBlock('paragraph', lastBlock.id);
    return;
  }
  addBlock('paragraph');
}

function insertParagraphAtEnd() {
  const lastBlock = documentDraft.value.blocks[documentDraft.value.blocks.length - 1];
  addBlock('paragraph', lastBlock?.id);
}

function focusFirstContentBlockAfterTitle() {
  emit('save-title');
  const firstBlock = documentDraft.value.blocks[0];
  if (isTextEntryBlock(firstBlock)) {
    focusBlockForWriting(firstBlock, 0);
    return;
  }
  addBlock('paragraph');
}

</script>

<template>
  <section
    class="knowledge-block-editor"
    aria-label="块笔记编辑器"
    :style="{ '--knowledge-selection-bg': props.selectionBackgroundColor || 'color-mix(in srgb, var(--ui-primary-color) 30%, transparent)' }"
  >
    <UiFileInput ref="fileInputRef" @change="handleFileSelected" />

    <div v-if="markdownImportOpen" class="knowledge-block-editor__import">
      <UiTextarea v-model="markdownImportText" placeholder="粘贴 Markdown，导入会转换为块结构，复杂格式可能有损。" />
      <div>
        <UiButton type="button" variant="primary" size="sm" @click="importMarkdown">导入为块</UiButton>
        <UiButton type="button" variant="secondary" size="sm" @click="markdownImportOpen = false">取消</UiButton>
      </div>
    </div>

    <div v-if="markdownExportOpen" class="knowledge-block-editor__import">
      <UiTextarea :model-value="markdownExport" readonly />
      <div>
        <UiButton type="button" variant="secondary" size="sm" @click="markdownExportOpen = false">关闭</UiButton>
      </div>
    </div>

    <div
      ref="editorCanvasRef"
      class="knowledge-block-editor__canvas"
      tabindex="-1"
      @keydown="handleSelectedBlockKeydown"
      @dragend.capture="clearBlockDrag"
    >
      <UiScrollbar class="knowledge-block-editor__canvas-scrollbar" :x="false" :y="true">
        <div class="knowledge-block-editor__canvas-inner" @mousedown="focusWritingSurface">
          <div class="knowledge-block-editor__page" @mousedown="focusWritingSurface">
            <div class="knowledge-block-editor__page-head">
              <button class="knowledge-block-editor__page-icon" type="button" aria-label="页面图标">
                <IconRenderer icon="iconify:lucide:file-text" :size="24" />
              </button>
              <div class="knowledge-block-editor__page-meta" aria-label="页面属性">
                <span>{{ kindLabel || '块页面' }}</span>
                <time v-if="updatedAt">更新于 {{ updatedAt }}</time>
              </div>
              <div class="knowledge-block-editor__page-tools" aria-label="页面操作">
                <span v-if="documentDraft.importedFromMarkdown" class="knowledge-block-editor__badge">
                  Markdown 有损导入
                </span>
                <UiButton type="button" variant="ghost" size="sm" :disabled="saving || !dirty" @click="emit('save')">
                  <template #prefix>
                    <IconRenderer icon="iconify:lucide:save" :size="14" />
                  </template>
                  {{ saving ? '保存中' : dirty ? '保存' : '已保存' }}
                </UiButton>
                <UiButton type="button" variant="ghost" size="sm" @click="insertParagraphAtEnd">
                  <template #prefix>
                    <IconRenderer icon="iconify:lucide:plus" :size="14" />
                  </template>
                  添加块
                </UiButton>
                <UiButton type="button" variant="ghost" size="sm" @click="markdownImportOpen = !markdownImportOpen">
                  <template #prefix>
                    <IconRenderer icon="iconify:lucide:import" :size="14" />
                  </template>
                  导入
                </UiButton>
                <UiButton type="button" variant="ghost" size="sm" @click="copyMarkdown">
                  <template #prefix>
                    <IconRenderer icon="iconify:lucide:download" :size="14" />
                  </template>
                  导出
                </UiButton>
              </div>
            </div>
            <input
              class="knowledge-block-editor__page-title"
              type="text"
              :value="title"
              spellcheck="false"
              placeholder="无标题"
              @input="event => emit('update:title', (event.target as HTMLInputElement).value)"
              @blur="emit('save-title')"
              @keydown.enter.prevent="focusFirstContentBlockAfterTitle"
            />
            <KnowledgeBlockRenderer
              v-for="(block, index) in documentDraft.blocks"
              :key="block.id"
              :block="block"
              :depth="0"
              :is-first="index === 0"
              :is-last="index === documentDraft.blocks.length - 1"
              :focus-block-id="pendingFocusBlockId"
              :focus-cursor-offset="pendingFocusCursorOffset"
              :drop-target-block-id="dropTargetBlockId"
              :drop-target-placement="dropTargetPlacement"
              :selected-block-id="selectedBlockId"
              :selected-block-ids="selectedBlockIds"
              @update="payload => updateBlock(payload.blockId, payload.patch)"
              @choose-asset="payload => chooseAsset(payload.blockId, payload.kind)"
              @open-asset="assetId => emit('open-asset', assetId)"
              @show-asset="assetId => emit('show-asset', assetId)"
              @select-asset="assetId => emit('select-asset', assetId)"
              @convert-todo="blockId => emit('convert-todo', blockId)"
              @insert-after="blockId => addBlock('paragraph', blockId)"
              @duplicate="duplicateBlock"
              @remove="removeBlock"
              @indent="indentBlockDraft"
              @outdent="outdentBlockDraft"
              @slash-open="openSlashMenu"
              @block-menu="openBlockMenu"
              @focused="handleBlockFocused"
              @select-block="selectBlock"
              @split-block="splitBlock"
              @merge-backward="mergeBlockBackward"
              @paste-markdown="pasteMarkdownAfterBlock"
              @focus-previous-block="focusPreviousBlock"
              @focus-next-block="focusNextBlock"
              @drag-start="handleBlockDragStart"
              @drag-over="handleBlockDragOver"
              @drag-leave="handleBlockDragLeave"
              @drop-on-block="handleBlockDrop"
            />
          </div>
        </div>
      </UiScrollbar>
    </div>

    <KnowledgeSlashMenu
      :open="Boolean(slashMenu)"
      :x="slashMenu?.x ?? 0"
      :y="slashMenu?.y ?? 0"
      :query="slashMenu?.query ?? ''"
      :prefix="slashMenu?.prefix ?? '/'"
      :options="blockTypes"
      @select="selectSlashBlock"
      @close="slashMenu = null"
    />

    <Teleport to="body">
      <div
        v-if="blockMenu"
        ref="blockMenuRef"
        class="knowledge-block-menu"
        :style="{ left: `${blockMenu.x}px`, top: `${blockMenu.y}px` }"
        role="menu"
        tabindex="-1"
        :aria-activedescendant="`knowledge-block-menu-item-${activeBlockMenuIndex}`"
        @keydown="handleBlockMenuKeydown"
      >
        <div class="knowledge-block-menu__header">
          <div class="knowledge-block-menu__title">
            <span>块操作</span>
            <kbd>⋮⋮</kbd>
          </div>
          <label class="knowledge-block-menu__search">
            <IconRenderer icon="iconify:lucide:search" :size="14" />
            <input
              ref="blockMenuSearchRef"
              v-model="blockMenuQuery"
              type="text"
              spellcheck="false"
              placeholder="搜索操作或转换类型"
            />
          </label>
        </div>

        <div class="knowledge-block-menu__body">
          <UiScrollbar class="knowledge-block-menu__scrollbar" :x="false" :y="true" :size="8">
            <div class="knowledge-block-menu__list">
              <div
                v-for="(group, groupIndex) in filteredBlockMenuGroups"
                :key="group.id"
                class="knowledge-block-menu__group"
              >
                <div class="knowledge-block-menu__section-label">{{ blockMenuGroupLabel(group.id) }}</div>
                <button
                  v-for="(item, itemIndex) in group.items"
                  :id="`knowledge-block-menu-item-${blockMenuItemIndex(groupIndex, itemIndex)}`"
                  :key="item.action"
                  type="button"
                  class="knowledge-block-menu__item"
                  :class="{ 'knowledge-block-menu__item--active': activeBlockMenuIndex === blockMenuItemIndex(groupIndex, itemIndex) }"
                  role="menuitem"
                  :aria-selected="activeBlockMenuIndex === blockMenuItemIndex(groupIndex, itemIndex)"
                  @mouseenter="activeBlockMenuIndex = blockMenuItemIndex(groupIndex, itemIndex)"
                  @click="runBlockMenuAction(item.action)"
                >
                  <span class="knowledge-block-menu__icon-card">
                    <IconRenderer :icon="item.icon" :size="16" />
                  </span>
                  <span class="knowledge-block-menu__item-label">{{ item.label }}</span>
                </button>
              </div>
              <div v-if="!blockMenuItems.length" class="knowledge-block-menu__empty">没有匹配操作</div>
            </div>
          </UiScrollbar>
        </div>

        <div class="knowledge-block-menu__footer" aria-hidden="true">
          <span><kbd>↑↓</kbd> 移动</span>
          <span><kbd>Enter</kbd> 执行</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
      <button
        v-if="blockMenu"
        class="knowledge-block-menu__backdrop"
        type="button"
        aria-label="关闭块菜单"
        @click="closeBlockMenu"
      />
    </Teleport>
  </section>
</template>

<style scoped lang="scss">
.knowledge-block-editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  color: var(--ui-text-primary);
  background: transparent;
}

.knowledge-block-editor :deep(::selection) {
  background: var(--knowledge-selection-bg, color-mix(in srgb, var(--ui-primary-color) 30%, transparent));
}

.knowledge-block-editor__badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--ui-warning-color) 44%, var(--ui-border-subtle));
  border-radius: 8px;
  color: var(--ui-text-muted);
  background: color-mix(in srgb, var(--ui-warning-color) 10%, var(--ui-surface-panel));
  font-size: var(--ui-font-size-xs);
}

.knowledge-block-editor__import {
  display: grid;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);

  :deep(.ui-textarea) {
    min-height: 120px;
    resize: vertical;
    border: 1px solid var(--ui-input-border);
    border-radius: 8px;
    padding: 10px;
    color: var(--ui-input-text);
    background: var(--ui-input-bg);
    font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace);
    font-size: var(--ui-font-size-sm);
    line-height: 1.6;
  }

  div {
    display: flex;
    gap: 8px;
  }
}

.knowledge-block-editor__canvas {
  min-height: 0;
  outline: none;
}

.knowledge-block-editor__canvas-scrollbar {
  height: 100%;
  min-height: 0;
  --ui-scrollbar-track-inset: 5px;
}

.knowledge-block-editor__canvas-inner {
  min-height: 100%;
  padding: clamp(30px, 4.8vw, 72px) clamp(12px, 3.2vw, 52px) 72px;
}

.knowledge-block-editor__page {
  width: min(100%, 840px);
  min-height: calc(100% - 8px);
  margin: 0 auto;
  padding: clamp(14px, 2.2vw, 28px) clamp(16px, 3.4vw, 46px) 72px;
  border-radius: 0;
  background: transparent;
}

.knowledge-block-editor__page-head {
  display: grid;
  gap: 6px;
  width: 100%;
  margin: 0 auto 12px;
}

.knowledge-block-editor__page-icon {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--ui-text-muted);
  background: transparent;
  cursor: default;
  transition: background-color 140ms ease, color 140ms ease;

  &:hover,
  &:focus-visible {
    color: var(--ui-text-primary);
    background: color-mix(in srgb, var(--ui-surface-panel-muted) 44%, transparent);
  }
}

.knowledge-block-editor__page-meta {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-block-editor__page-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 140ms ease, transform 140ms ease;

  :deep(.ui-button) {
    min-height: 26px;
    padding-inline: 6px;
    color: var(--ui-text-muted);
    background: transparent;
  }
}

.knowledge-block-editor__page:hover .knowledge-block-editor__page-tools,
.knowledge-block-editor__page:focus-within .knowledge-block-editor__page-tools {
  opacity: 1;
  transform: translateY(0);
}

.knowledge-block-editor__page-title {
  appearance: none;
  display: block;
  width: 100%;
  min-width: 0;
  margin: 0 auto 18px;
  padding: 0;
  border: 0;
  outline: 0;
  color: var(--ui-text-primary);
  background: transparent;
  font: inherit;
  font-size: 40px;
  font-weight: 750;
  line-height: 1.18;

  &::placeholder {
    color: color-mix(in srgb, var(--ui-text-muted) 68%, transparent);
  }

  &:focus {
    outline: none;
  }
}

.knowledge-block-menu {
  position: fixed;
  z-index: 4300;
  display: grid;
  width: min(324px, calc(100vw - 24px));
  max-height: min(386px, calc(100vh - 24px));
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--ui-surface-panel) 98%, #fff);
  box-shadow:
    0 12px 24px rgb(15 23 42 / 12%),
    0 1px 2px rgb(15 23 42 / 8%);
}

.knowledge-block-menu__header,
.knowledge-block-menu__footer {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-block-menu__header {
  display: grid;
  gap: 6px;
  padding: 7px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle) 58%, transparent);
}

.knowledge-block-menu__title,
.knowledge-block-menu__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.knowledge-block-menu__title {
  padding: 0 2px;
  font-weight: 620;
}

.knowledge-block-menu__search {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 64%, transparent);
  border-radius: 6px;
  color: var(--ui-text-muted);
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 42%, transparent);

  input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: 0;
    color: var(--ui-text-primary);
    background: transparent;
    font: inherit;
    font-size: var(--ui-font-size-sm);

    &::placeholder {
      color: color-mix(in srgb, var(--ui-text-muted) 78%, transparent);
    }
  }
}

.knowledge-block-menu__body {
  height: min(270px, calc(100vh - 116px));
  min-height: 0;
}

.knowledge-block-menu__scrollbar {
  --ui-scrollbar-track-inset: 3px;
}

.knowledge-block-menu__list {
  display: grid;
  gap: 0;
  padding: 4px;
}

.knowledge-block-menu__group {
  display: grid;
  gap: 1px;

  & + & {
    margin-top: 5px;
    padding-top: 5px;
    border-top: 1px solid color-mix(in srgb, var(--ui-border-subtle) 48%, transparent);
  }
}

.knowledge-block-menu__section-label {
  padding: 10px 7px 4px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  font-weight: 600;
  letter-spacing: 0;
}

.knowledge-block-menu__item {
  appearance: none;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 36px;
  padding: 4px 7px;
  border: 0;
  border-radius: 5px;
  color: var(--ui-text-primary);
  background: transparent;
  font-size: var(--ui-font-size-sm);
  font-weight: 500;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible,
  &--active {
    outline: none;
    transform: none;
    background: color-mix(in srgb, var(--ui-text-primary) 7%, transparent);
  }
}

.knowledge-block-menu__icon-card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: var(--ui-text-secondary);
  background: transparent;
  box-shadow: none;
}

.knowledge-block-menu__item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-block-menu__empty {
  padding: 10px 12px 12px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-block-menu__footer {
  padding: 6px 8px;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-subtle) 58%, transparent);

  span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
}

.knowledge-block-menu__title kbd,
.knowledge-block-menu__footer kbd {
  min-width: 20px;
  padding: 1px 5px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 70%, transparent);
  border-radius: 5px;
  color: var(--ui-text-secondary);
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 62%, transparent);
  font-family: var(--ui-font-mono, 'Geist Mono Variable', monospace);
  font-size: 10px;
  font-weight: 650;
  text-align: center;
}

.knowledge-block-menu__backdrop {
  position: fixed;
  inset: 0;
  z-index: 4290;
  border: 0;
  background: transparent;
  cursor: default;
}

@media (max-width: 980px) {
  .knowledge-block-editor__canvas-inner {
    padding: 12px 10px 36px;
  }

  .knowledge-block-editor__page {
    min-height: 100%;
    padding: 20px 14px 40px;
    border-right: 0;
    border-left: 0;
    border-radius: 0;
  }

  .knowledge-block-editor__page-title {
    font-size: 28px;
  }

}
</style>
