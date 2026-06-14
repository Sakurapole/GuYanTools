<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import type { KnowledgeBlockV2, KnowledgeBlockV2Type, KnowledgeInlineMarkType } from '@/windows/main/utils/knowledge_blocks_v2';
import {
  editableHtmlToInlineContent,
  inlineContentToEditableHtml,
  inlineContentToPlainText,
} from '../../utils/knowledge_block_editing';
import KnowledgeBlockHandle from './KnowledgeBlockHandle.vue';

type DropPlacement = 'before' | 'after';

const props = defineProps<{
  block: KnowledgeBlockV2;
  depth?: number;
  isFirst?: boolean;
  isLast?: boolean;
  focusBlockId?: string | null;
  focusCursorOffset?: number;
  dropTargetBlockId?: string | null;
  dropTargetPlacement?: DropPlacement | null;
  selectedBlockId?: string | null;
  selectedBlockIds?: string[];
}>();

const emit = defineEmits<{
  (event: 'update', payload: { blockId: string; patch: Partial<KnowledgeBlockV2> }): void;
  (event: 'choose-asset', payload: { blockId: string; kind: 'image' | 'attachment' }): void;
  (event: 'open-asset', assetId: string): void;
  (event: 'show-asset', assetId: string): void;
  (event: 'select-asset', assetId: string): void;
  (event: 'convert-todo', blockId: string): void;
  (event: 'insert-after', blockId: string): void;
  (event: 'duplicate', blockId: string): void;
  (event: 'remove', blockId: string): void;
  (event: 'indent', blockId: string): void;
  (event: 'outdent', blockId: string): void;
  (event: 'slash-open', payload: { blockId: string; query: string; prefix: '/' | '+'; rect: DOMRect | null }): void;
  (event: 'block-menu', payload: { blockId: string; rect: DOMRect | null }): void;
  (event: 'focused', blockId: string): void;
  (event: 'select-block', blockId: string): void;
  (event: 'split-block', payload: { blockId: string; offset: number }): void;
  (event: 'merge-backward', payload: { blockId: string }): void;
  (event: 'paste-markdown', payload: { blockId: string; markdown: string }): void;
  (event: 'focus-previous-block', payload: { blockId: string }): void;
  (event: 'focus-next-block', payload: { blockId: string }): void;
  (event: 'apply-inline-mark', payload: { blockId: string; mark: KnowledgeInlineMarkType }): void;
  (event: 'drag-start', payload: { blockId: string; event: DragEvent }): void;
  (event: 'drag-over', payload: { blockId: string; placement: DropPlacement }): void;
  (event: 'drag-leave', payload: { blockId: string; event: DragEvent }): void;
  (event: 'drop-on-block', payload: { blockId: string; placement: DropPlacement }): void;
}>();

const blockRootRef = ref<HTMLElement | null>(null);
const editableRef = ref<HTMLElement | null>(null);
const isComposing = ref(false);
const inlineToolbar = ref({ visible: false, x: 0, y: 0 });

const blockTypes: Array<{ type: KnowledgeBlockV2Type; icon: string; label: string }> = [
  { type: 'paragraph', icon: 'iconify:lucide:pilcrow', label: '正文' },
  { type: 'heading', icon: 'iconify:lucide:heading-2', label: '标题' },
  { type: 'bullet_list', icon: 'iconify:lucide:list', label: '项目' },
  { type: 'ordered_list', icon: 'iconify:lucide:list-ordered', label: '编号' },
  { type: 'task_list', icon: 'iconify:lucide:square-check', label: '任务' },
  { type: 'code', icon: 'iconify:lucide:code-2', label: '代码' },
  { type: 'quote', icon: 'iconify:lucide:quote', label: '引用' },
  { type: 'callout', icon: 'iconify:lucide:badge-info', label: '提示' },
  { type: 'divider', icon: 'iconify:lucide:minus', label: '分割线' },
  { type: 'toggle', icon: 'iconify:lucide:list-collapse', label: '折叠' },
  { type: 'table', icon: 'iconify:lucide:table-2', label: '表格' },
  { type: 'image', icon: 'iconify:lucide:image-plus', label: '图片' },
  { type: 'attachment', icon: 'iconify:lucide:paperclip', label: '附件' },
  { type: 'todo_reference', icon: 'iconify:lucide:list-checks', label: 'Todo' },
  { type: 'page_reference', icon: 'iconify:lucide:file-text', label: '页面' },
];

const blockText = computed(() => inlineContentToPlainText(props.block.content));
const editableHtml = computed(() => inlineContentToEditableHtml(props.block.content));
const assetId = computed(() => props.block.refs?.assetId ?? '');
const todoId = computed(() => props.block.refs?.todoId ?? '');
const pageId = computed(() => props.block.refs?.pageId ?? '');
const toggleOpen = computed(() => props.block.type !== 'toggle' || props.block.attrs?.open !== false);
const isDropBefore = computed(() => props.dropTargetBlockId === props.block.id && props.dropTargetPlacement === 'before');
const isDropAfter = computed(() => props.dropTargetBlockId === props.block.id && props.dropTargetPlacement === 'after');
const isSelected = computed(() => props.selectedBlockIds?.includes(props.block.id) || props.selectedBlockId === props.block.id);
const blockStyle = computed(() => ({
  '--knowledge-block-depth': String(Math.min(props.depth ?? 0, 8)),
}));
const headingLevel = computed(() => {
  const value = Number(props.block.attrs?.level ?? 2);
  if (value <= 1) return 1;
  if (value >= 4) return 4;
  return Math.round(value) === 3 ? 3 : 2;
});
const headingLevelClass = computed(() => `knowledge-block__editable--heading-${headingLevel.value}`);
const codeLineCount = computed(() => Math.max(1, blockText.value.split(/\r\n|\r|\n/).length));
const codeTextareaStyle = computed(() => ({
  '--knowledge-block-code-lines': String(codeLineCount.value),
  '--knowledge-block-code-height': `${codeLineCount.value * 23 + 22}px`,
}));
const tableGrid = computed(() => normalizeTableGrid(blockText.value, props.block.attrs));

watch(
  () => [props.block.id, props.block.content] as const,
  () => {
    void syncEditableFromBlock();
  },
  { deep: true, immediate: true },
);

watch(
  () => props.focusBlockId,
  (blockId) => {
    if (blockId === props.block.id) {
      void focusPrimaryInput(props.focusCursorOffset);
    }
  },
  { immediate: true },
);

function blockIcon(type: KnowledgeBlockV2Type) {
  return blockTypes.find((item) => item.type === type)?.icon || 'iconify:lucide:square';
}

function blockLabel(type: KnowledgeBlockV2Type) {
  return blockTypes.find((item) => item.type === type)?.label || type;
}

function editablePlaceholder() {
  if (props.isFirst && props.block.type === 'paragraph' && blockText.value.length === 0) return '输入 / 选择命令，或直接开始书写';
  if (props.block.type === 'heading') return '标题';
  if (props.block.type === 'bullet_list' || props.block.type === 'ordered_list') return '列表项';
  if (props.block.type === 'task_list') return '待办事项';
  if (props.block.type === 'toggle') return '折叠标题';
  if (props.block.type === 'page_reference') return '页面标题';
  if (props.block.type === 'todo_reference') return 'Todo 标题';
  if (props.block.type === 'quote') return '引用';
  if (props.block.type === 'callout') return '提示内容';
  return '输入内容，或按 /';
}

function editableClass(extra?: string) {
  return [
    'knowledge-block__editable',
    `knowledge-block__editable--${props.block.type}`,
    extra,
  ];
}

async function syncEditableFromBlock(force = false) {
  await nextTick();
  const editable = editableRef.value;
  if (!editable) return;
  if (!force && (isComposing.value || document.activeElement === editable)) return;
  if (editable.innerHTML !== editableHtml.value) {
    editable.innerHTML = editableHtml.value;
  }
}

function chooseAsset(kind: 'image' | 'attachment') {
  emit('choose-asset', {
    blockId: props.block.id,
    kind,
  });
}

function updatePlainText(value: string) {
  if (applyMarkdownShortcut(value)) return;

  emit('update', {
    blockId: props.block.id,
    patch: { content: value ? [{ type: 'text', text: value }] : [] },
  });

  maybeOpenSlashMenu(value);
}

function updateFromEditable() {
  const editable = editableRef.value;
  if (!editable) return;
  const content = editableHtmlToInlineContent(editable.innerHTML);
  const value = inlineContentToPlainText(content);
  if (applyMarkdownShortcut(value)) {
    editable.innerHTML = '';
    return;
  }

  emit('update', {
    blockId: props.block.id,
    patch: { content },
  });
  maybeOpenSlashMenu(value);
}

function maybeOpenSlashMenu(value: string) {
  const prefix = blockCommandPrefix(value);
  if (!prefix || props.block.type !== 'paragraph') return;
  emit('slash-open', {
    blockId: props.block.id,
    query: value.slice(1),
    prefix,
    rect: blockRootRef.value?.getBoundingClientRect() ?? null,
  });
}

function blockCommandPrefix(value: string): '/' | '+' | null {
  if (value.startsWith('/')) return '/';
  if (value.startsWith('+')) return '+';
  return null;
}

function resolveDropPlacement(event: DragEvent): DropPlacement {
  const target = event.currentTarget as HTMLElement | null;
  const rect = target?.getBoundingClientRect();
  if (!rect) return 'before';
  return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
}

function applyMarkdownShortcut(value: string) {
  if (props.block.type !== 'paragraph') return false;

  if (value === '# ') {
    emitShortcutConversion('heading', { level: 1 });
    return true;
  }
  if (value === '## ') {
    emitShortcutConversion('heading', { level: 2 });
    return true;
  }
  if (value === '### ') {
    emitShortcutConversion('heading', { level: 3 });
    return true;
  }
  if (value === '---') {
    emitShortcutConversion('divider');
    return true;
  }
  if (value === '* ' || value === '- ' || value === '+ ') {
    emitShortcutConversion('bullet_list');
    return true;
  }
  if (value === '1. ') {
    emitShortcutConversion('ordered_list');
    return true;
  }
  if (value === '[x] ' || value === '[X] ') {
    emitShortcutConversion('task_list', { checked: true });
    return true;
  }
  if (value === '[] ' || value === '[ ] ') {
    emitShortcutConversion('task_list', { checked: false });
    return true;
  }
  if (value === '> ') {
    emitShortcutConversion('toggle', { open: true });
    return true;
  }
  if (value === '" ') {
    emitShortcutConversion('quote');
    return true;
  }
  if (value === '```') {
    emitShortcutConversion('code', { language: 'text' });
    return true;
  }

  return false;
}

function emitShortcutConversion(type: KnowledgeBlockV2Type, attrs: Record<string, unknown> = {}) {
  emit('update', {
    blockId: props.block.id,
    patch: {
      type,
      content: [],
      attrs: {
        ...(props.block.attrs ?? {}),
        ...attrs,
      },
    },
  });
}

function handleEditableBeforeInput(event: InputEvent) {
  if (event.inputType === 'insertParagraph') {
    event.preventDefault();
    emit('split-block', { blockId: props.block.id, offset: getCaretTextOffset() });
  }
}

function handleEditablePaste(event: ClipboardEvent) {
  if (props.block.type === 'code') return;
  const clipboardData = event.clipboardData;
  if (!clipboardData) return;
  const text = clipboardData.getData('text/plain');
  if (!shouldPasteAsBlocks(text)) return;
  event.preventDefault();
  emit('paste-markdown', { blockId: props.block.id, markdown: text });
}

function shouldPasteAsBlocks(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (text.includes('\n')) return true;
  return /^(#{1,6}\s|[-*+]\s|\d+\.\s|-\s\[[ xX]\]\s|>\s|```|---$|\|.+\|)/.test(text);
}

function handleEditableInput() {
  if (isComposing.value) return;
  updateFromEditable();
}

function handleCompositionStart() {
  isComposing.value = true;
}

function handleCompositionEnd() {
  isComposing.value = false;
  updateFromEditable();
}

function handleEditableKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('select-block', props.block.id);
    return;
  }

  if (event.key === 'Tab' && props.block.type !== 'code') {
    event.preventDefault();
    emit(event.shiftKey ? 'outdent' : 'indent', props.block.id);
    return;
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === 'Enter') {
    if (toggleBlockCheckedOrOpen()) {
      event.preventDefault();
      return;
    }
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    applyInlineMark('bold');
    return;
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'i') {
    event.preventDefault();
    applyInlineMark('italic');
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'x') {
    event.preventDefault();
    applyInlineMark('strike');
    return;
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'e') {
    event.preventDefault();
    applyInlineMark('code');
    return;
  }

  if (event.key === 'ArrowUp' && props.block.type !== 'code' && isCaretAtStart()) {
    event.preventDefault();
    emit('focus-previous-block', { blockId: props.block.id });
    return;
  }

  if (event.key === 'ArrowDown' && props.block.type !== 'code' && isCaretAtEnd()) {
    event.preventDefault();
    emit('focus-next-block', { blockId: props.block.id });
    return;
  }

  if (event.key === 'Enter' && !event.shiftKey && props.block.type !== 'code') {
    event.preventDefault();
    emit('split-block', { blockId: props.block.id, offset: getCaretTextOffset() });
    return;
  }

  if (event.key === 'Backspace' && props.block.type !== 'code' && isCaretAtStart()) {
    event.preventDefault();
    if (shouldConvertEmptyBlockBackToParagraph()) {
      emitShortcutConversion('paragraph');
      return;
    }
    emit('merge-backward', { blockId: props.block.id });
  }
}

function shouldConvertEmptyBlockBackToParagraph() {
  return props.block.type !== 'paragraph' && blockText.value.length === 0;
}

function toggleBlockCheckedOrOpen() {
  if (props.block.type === 'task_list') {
    updateAttrs({ checked: !props.block.attrs?.checked });
    return true;
  }

  if (props.block.type === 'toggle') {
    updateAttrs({ open: !toggleOpen.value });
    return true;
  }

  return false;
}

function updateAttrs(patch: Record<string, unknown>) {
  emit('update', {
    blockId: props.block.id,
    patch: {
      attrs: {
        ...(props.block.attrs ?? {}),
        ...patch,
      },
    },
  });
}

function updateRefs(patch: NonNullable<KnowledgeBlockV2['refs']>) {
  emit('update', {
    blockId: props.block.id,
    patch: {
      refs: {
        ...(props.block.refs ?? {}),
        ...patch,
      },
    },
  });
}

function emitAssetAction(event: 'open-asset' | 'show-asset' | 'select-asset') {
  if (!assetId.value) return;
  emit(event, assetId.value);
}

function updateTableCell(rowIndex: number, columnIndex: number, value: string) {
  const next = cloneTableGrid(tableGrid.value);
  next[rowIndex][columnIndex] = value;
  updatePlainText(serializeTableGrid(next));
}

function addTableRow() {
  const next = cloneTableGrid(tableGrid.value);
  const columnCount = Math.max(1, next[0]?.length ?? 1);
  next.push(Array.from({ length: columnCount }, () => ''));
  updatePlainText(serializeTableGrid(next));
}

function addTableColumn() {
  const next = cloneTableGrid(tableGrid.value).map((row) => [...row, '']);
  updatePlainText(serializeTableGrid(next));
}

function removeTableRow(rowIndex: number) {
  const next = cloneTableGrid(tableGrid.value);
  if (next.length <= 1) return;
  next.splice(rowIndex, 1);
  updatePlainText(serializeTableGrid(next));
}

function removeTableColumn(columnIndex: number) {
  const next = cloneTableGrid(tableGrid.value);
  const columnCount = next[0]?.length ?? 0;
  if (columnCount <= 1) return;
  updatePlainText(serializeTableGrid(next.map((row) => row.filter((_cell, index) => index !== columnIndex))));
}

function applyInlineMark(mark: KnowledgeInlineMarkType) {
  emit('apply-inline-mark', { blockId: props.block.id, mark });
  const command = mark === 'bold'
    ? 'bold'
    : mark === 'italic'
      ? 'italic'
      : mark === 'strike'
        ? 'strikeThrough'
        : '';

  if (command) {
    document.execCommand(command, false);
  } else {
    wrapSelectionInCode();
  }
  updateFromEditable();
  updateInlineToolbar();
}

function wrapSelectionInCode() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const editable = editableRef.value;
  if (!editable?.contains(range.commonAncestorContainer)) return;
  const wrapper = document.createElement('code');
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(wrapper);
  selection.addRange(nextRange);
}

function updateInlineToolbar() {
  const selection = window.getSelection();
  const editable = editableRef.value;
  if (!selection || !editable || selection.rangeCount === 0 || selection.isCollapsed) {
    inlineToolbar.value = { visible: false, x: 0, y: 0 };
    return;
  }

  const range = selection.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) {
    inlineToolbar.value = { visible: false, x: 0, y: 0 };
    return;
  }

  const rect = range.getBoundingClientRect();
  const toolbarHalfWidth = 88;
  const centerX = rect.left + rect.width / 2;
  inlineToolbar.value = {
    visible: true,
    x: Math.min(window.innerWidth - toolbarHalfWidth, Math.max(toolbarHalfWidth, centerX)),
    y: Math.max(12, rect.top - 8),
  };
}

function getCaretTextOffset() {
  const editable = editableRef.value;
  const selection = window.getSelection();
  if (!editable || !selection || selection.rangeCount === 0) return blockText.value.length;
  const range = selection.getRangeAt(0);
  if (!editable.contains(range.endContainer)) return blockText.value.length;
  const preRange = range.cloneRange();
  preRange.selectNodeContents(editable);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

function isCaretAtStart() {
  return getCaretTextOffset() === 0;
}

function isCaretAtEnd() {
  return getCaretTextOffset() === blockText.value.length;
}

async function focusPrimaryInput(offset = blockText.value.length) {
  await syncEditableFromBlock(true);
  await nextTick();
  const editable = editableRef.value;
  if (!editable) return;
  editable.focus();
  setCaretTextOffset(editable, offset);
  emit('focused', props.block.id);
}

function setCaretTextOffset(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }

  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function normalizeTableGrid(value: string, attrs: Record<string, unknown> | undefined) {
  const parsed = parseMarkdownTable(value);
  if (parsed.length) return rectangularizeTable(parsed);

  const rowCount = normalizeTableSize(attrs?.rows, 3, 1, 20);
  const columnCount = normalizeTableSize(attrs?.columns, 3, 1, 12);
  return Array.from({ length: rowCount }, (_row, rowIndex) =>
    Array.from({ length: columnCount }, (_column, columnIndex) => (rowIndex === 0 ? `列 ${columnIndex + 1}` : '')),
  );
}

function normalizeTableSize(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(Math.max(numeric, min), max);
}

function parseMarkdownTable(value: string) {
  const lines = value
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const hasDivider = lines.length > 1 && isMarkdownTableDivider(lines[1]);
  const tableLines = hasDivider ? [lines[0], ...lines.slice(2)] : lines;
  const rows = tableLines
    .filter((line) => countUnescapedPipes(line) > 0)
    .map(splitMarkdownTableRow)
    .filter((row) => row.length > 0);

  return rows;
}

function isMarkdownTableDivider(line: string) {
  return /^:?-{3,}:?$/.test(line.replace(/^\||\|$/g, '').split('|')[0]?.trim() ?? '')
    && line.includes('|');
}

function splitMarkdownTableRow(line: string) {
  const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  let slashRun = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (character === '\\') {
      slashRun += 1;
      current += character;
      continue;
    }

    if (character === '|' && slashRun % 2 === 0) {
      cells.push(unescapeTableCell(current.trim()));
      current = '';
      slashRun = 0;
      continue;
    }

    current += character;
    slashRun = 0;
  }

  cells.push(unescapeTableCell(current.trim()));
  return cells;
}

function rectangularizeTable(rows: string[][]) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  return rows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ''),
  ]);
}

function cloneTableGrid(grid: string[][]) {
  return grid.map((row) => [...row]);
}

function serializeTableGrid(grid: string[][]) {
  const normalized = rectangularizeTable(grid.length ? grid : [['']]);
  const header = normalized[0];
  const divider = header.map(() => '---');
  const body = normalized.slice(1);
  return [
    formatMarkdownTableRow(header),
    formatMarkdownTableRow(divider),
    ...body.map(formatMarkdownTableRow),
  ].join('\n');
}

function formatMarkdownTableRow(row: string[]) {
  return `| ${row.map(escapeTableCell).join(' | ')} |`;
}

function escapeTableCell(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function unescapeTableCell(value: string) {
  return value.replace(/\\\|/g, '|').replace(/\\\\/g, '\\');
}

function countUnescapedPipes(line: string) {
  let count = 0;
  let slashRun = 0;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '\\') {
      slashRun += 1;
      continue;
    }

    if (character === '|' && slashRun % 2 === 0) {
      count += 1;
    }

    slashRun = 0;
  }

  return count;
}
</script>

<template>
  <div class="knowledge-block-node" :style="blockStyle">
    <article
      ref="blockRootRef"
      class="knowledge-block"
      :class="[
        `knowledge-block--${block.type}`,
        {
          'knowledge-block--drop-before': isDropBefore,
          'knowledge-block--drop-after': isDropAfter,
          'knowledge-block--selected': isSelected,
        },
      ]"
      :aria-selected="isSelected"
      :data-knowledge-block-id="block.id"
      @dragover.prevent="event => emit('drag-over', { blockId: block.id, placement: resolveDropPlacement(event) })"
      @dragleave="event => emit('drag-leave', { blockId: block.id, event })"
      @drop.prevent="event => emit('drop-on-block', { blockId: block.id, placement: resolveDropPlacement(event) })"
    >
      <KnowledgeBlockHandle
        @insert-after="emit('insert-after', block.id)"
        @menu="event => emit('block-menu', { blockId: block.id, rect: (event.currentTarget as HTMLElement | null)?.getBoundingClientRect() ?? null })"
        @dragstart="event => emit('drag-start', { blockId: block.id, event })"
      />

      <main class="knowledge-block__body">
        <template v-if="block.type === 'heading'">
          <div
            ref="editableRef"
            :class="editableClass(`knowledge-block__editable--heading ${headingLevelClass}`)"
            :data-placeholder="editablePlaceholder()"
            contenteditable="true"
            spellcheck="true"
            role="textbox"
            @beforeinput="handleEditableBeforeInput"
            @paste="handleEditablePaste"
            @input="handleEditableInput"
            @keydown="handleEditableKeydown"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
            @mouseup="updateInlineToolbar"
            @keyup="updateInlineToolbar"
            @blur="inlineToolbar.visible = false"
          />
        </template>

        <template v-else-if="block.type === 'task_list'">
          <label class="knowledge-block__task">
            <UiCheckbox
              size="sm"
              :checked="Boolean(block.attrs?.checked)"
              @change="checked => updateAttrs({ checked })"
            />
            <div
              ref="editableRef"
              :class="editableClass()"
              :data-placeholder="editablePlaceholder()"
              contenteditable="true"
              spellcheck="true"
              role="textbox"
              @beforeinput="handleEditableBeforeInput"
              @paste="handleEditablePaste"
              @input="handleEditableInput"
              @keydown="handleEditableKeydown"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @mouseup="updateInlineToolbar"
              @keyup="updateInlineToolbar"
              @blur="inlineToolbar.visible = false"
            />
          </label>
        </template>

        <template v-else-if="block.type === 'bullet_list' || block.type === 'ordered_list'">
          <div class="knowledge-block__list-row">
            <span class="knowledge-block__list-marker">{{ block.type === 'ordered_list' ? '1.' : '•' }}</span>
            <div
              ref="editableRef"
              :class="editableClass()"
              :data-placeholder="editablePlaceholder()"
              contenteditable="true"
              spellcheck="true"
              role="textbox"
              @beforeinput="handleEditableBeforeInput"
              @paste="handleEditablePaste"
              @input="handleEditableInput"
              @keydown="handleEditableKeydown"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @mouseup="updateInlineToolbar"
              @keyup="updateInlineToolbar"
              @blur="inlineToolbar.visible = false"
            />
          </div>
        </template>

        <template v-else-if="block.type === 'code'">
          <div class="knowledge-block__code-shell">
            <div class="knowledge-block__code-header">
              <IconRenderer icon="iconify:lucide:code-2" :size="14" />
              <input
                class="knowledge-block__code-language"
                :value="String(block.attrs?.language ?? 'text')"
                type="text"
                spellcheck="false"
                aria-label="代码语言"
                @input="event => updateAttrs({ language: (event.target as HTMLInputElement).value })"
              />
            </div>
            <UiTextarea
              class="knowledge-block__code"
              :model-value="blockText"
              :rows="codeLineCount"
              :style="codeTextareaStyle"
              spellcheck="false"
              resize="none"
              @update:model-value="value => updatePlainText(value)"
            />
          </div>
        </template>

        <template v-else-if="block.type === 'toggle'">
          <div class="knowledge-block__toggle">
            <button class="knowledge-block__toggle-button" type="button" :aria-expanded="toggleOpen" @click="updateAttrs({ open: !toggleOpen })">
              <IconRenderer :icon="toggleOpen ? 'iconify:lucide:chevron-down' : 'iconify:lucide:chevron-right'" :size="14" />
            </button>
            <div
              ref="editableRef"
              :class="editableClass()"
              :data-placeholder="editablePlaceholder()"
              contenteditable="true"
              spellcheck="true"
              role="textbox"
              @beforeinput="handleEditableBeforeInput"
              @paste="handleEditablePaste"
              @input="handleEditableInput"
              @keydown="handleEditableKeydown"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @mouseup="updateInlineToolbar"
              @keyup="updateInlineToolbar"
              @blur="inlineToolbar.visible = false"
            />
          </div>
        </template>

        <template v-else-if="block.type === 'table'">
          <div class="knowledge-block__table-shell">
            <UiScrollbar class="knowledge-block__table-scrollbar" :x="true" :y="false" :size="8">
              <div class="knowledge-block__table-frame">
                <table class="knowledge-block__table">
                  <tbody>
                    <tr v-for="(row, rowIndex) in tableGrid" :key="`row-${rowIndex}`">
                      <td v-for="(cell, columnIndex) in row" :key="`cell-${rowIndex}-${columnIndex}`">
                        <input
                          class="knowledge-block__table-cell"
                          :value="cell"
                          type="text"
                          spellcheck="false"
                          :aria-label="`表格 ${rowIndex + 1} 行 ${columnIndex + 1} 列`"
                          @input="event => updateTableCell(rowIndex, columnIndex, (event.target as HTMLInputElement).value)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div class="knowledge-block__table-edge-actions knowledge-block__table-edge-actions--column" aria-label="表格列操作">
                  <UiButton class="knowledge-block__table-edge-button" type="button" variant="ghost" size="sm" aria-label="添加表格列" @click="addTableColumn">
                    <template #prefix>
                      <IconRenderer icon="iconify:lucide:plus" :size="14" />
                    </template>
                  </UiButton>
                  <UiButton
                    class="knowledge-block__table-edge-button"
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="删除最后一列"
                    :disabled="(tableGrid[0]?.length ?? 0) <= 1"
                    @click="removeTableColumn((tableGrid[0]?.length ?? 1) - 1)"
                  >
                    <template #prefix>
                      <IconRenderer icon="iconify:lucide:minus" :size="14" />
                    </template>
                  </UiButton>
                </div>
                <div class="knowledge-block__table-edge-actions knowledge-block__table-edge-actions--row" aria-label="表格行操作">
                  <UiButton class="knowledge-block__table-edge-button" type="button" variant="ghost" size="sm" aria-label="添加表格行" @click="addTableRow">
                    <template #prefix>
                      <IconRenderer icon="iconify:lucide:plus" :size="14" />
                    </template>
                  </UiButton>
                  <UiButton
                    class="knowledge-block__table-edge-button"
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="删除最后一行"
                    :disabled="tableGrid.length <= 1"
                    @click="removeTableRow(tableGrid.length - 1)"
                  >
                    <template #prefix>
                      <IconRenderer icon="iconify:lucide:minus" :size="14" />
                    </template>
                  </UiButton>
                </div>
              </div>
            </UiScrollbar>
          </div>
        </template>

        <template v-else-if="block.type === 'image' || block.type === 'attachment'">
          <div class="knowledge-block__asset" :class="{ 'knowledge-block__asset--empty': !assetId }">
            <div class="knowledge-block__asset-preview">
              <img
                v-if="assetId && block.type === 'image' && block.attrs?.assetUrl"
                :src="String(block.attrs.assetUrl)"
                :alt="String(block.attrs.assetName ?? '图片块')"
              />
              <IconRenderer
                v-else
                :icon="block.type === 'image' ? 'iconify:lucide:image' : 'iconify:lucide:paperclip'"
                :size="18"
              />
            </div>
            <div class="knowledge-block__asset-meta">
              <strong>{{ assetId ? String(block.attrs?.assetName ?? '已入库资产') : (block.type === 'image' ? '添加图片' : '添加附件') }}</strong>
              <span>{{ assetId ? String(block.attrs?.assetMimeType ?? (block.type === 'image' ? 'image' : 'attachment')) : '选择一个文件作为当前块内容' }}</span>
            </div>
            <div class="knowledge-block__asset-actions" aria-label="资产操作">
              <UiButton v-if="assetId" type="button" variant="ghost" size="sm" aria-label="打开文件" @click="emitAssetAction('open-asset')">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:external-link" :size="14" />
                </template>
              </UiButton>
              <UiButton v-if="assetId" type="button" variant="ghost" size="sm" aria-label="在系统中显示" @click="emitAssetAction('show-asset')">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:folder-open" :size="14" />
                </template>
              </UiButton>
              <UiButton v-if="assetId" type="button" variant="ghost" size="sm" aria-label="标记文件" @click="emitAssetAction('select-asset')">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:tag" :size="14" />
                </template>
              </UiButton>
              <UiButton type="button" variant="ghost" size="sm" :aria-label="assetId ? '替换文件' : '选择文件'" @click="chooseAsset(block.type)">
                <template #prefix>
                  <IconRenderer :icon="assetId ? 'iconify:lucide:replace' : 'iconify:lucide:plus'" :size="14" />
                </template>
              </UiButton>
            </div>
          </div>
        </template>

        <template v-else-if="block.type === 'page_reference'">
          <div class="knowledge-block__reference-line knowledge-block__reference-line--page">
            <IconRenderer icon="iconify:lucide:file-text" :size="18" />
            <div class="knowledge-block__reference-fields">
              <div
                ref="editableRef"
                :class="editableClass()"
                :data-placeholder="editablePlaceholder()"
                contenteditable="true"
                spellcheck="true"
                role="textbox"
                @beforeinput="handleEditableBeforeInput"
                @paste="handleEditablePaste"
                @input="handleEditableInput"
                @keydown="handleEditableKeydown"
                @compositionstart="handleCompositionStart"
                @compositionend="handleCompositionEnd"
                @mouseup="updateInlineToolbar"
                @keyup="updateInlineToolbar"
                @blur="inlineToolbar.visible = false"
              />
              <UiInput
                class="knowledge-block__reference-id"
                :model-value="pageId"
                placeholder="页面 ID 或标题快照"
                size="sm"
                @update:model-value="value => updateRefs({ pageId: value.trim() || undefined })"
              />
            </div>
          </div>
        </template>

        <template v-else-if="block.type === 'todo_reference'">
          <div class="knowledge-block__reference-line knowledge-block__reference-line--todo">
            <IconRenderer icon="iconify:lucide:list-checks" :size="18" />
            <div class="knowledge-block__reference-fields">
              <div
                ref="editableRef"
                :class="editableClass()"
                :data-placeholder="editablePlaceholder()"
                contenteditable="true"
                spellcheck="true"
                role="textbox"
                @beforeinput="handleEditableBeforeInput"
                @paste="handleEditablePaste"
                @input="handleEditableInput"
                @keydown="handleEditableKeydown"
                @compositionstart="handleCompositionStart"
                @compositionend="handleCompositionEnd"
                @mouseup="updateInlineToolbar"
                @keyup="updateInlineToolbar"
                @blur="inlineToolbar.visible = false"
              />
              <UiInput
                class="knowledge-block__reference-id"
                :model-value="todoId"
                placeholder="Todo ID"
                size="sm"
                @update:model-value="value => updateRefs({ todoId: value.trim() || undefined })"
              />
            </div>
          </div>
        </template>

        <template v-else-if="block.type === 'divider'">
          <hr class="knowledge-block__divider" />
        </template>

        <template v-else-if="block.type === 'callout'">
          <div class="knowledge-block__callout">
            <span class="knowledge-block__callout-icon" aria-hidden="true">
              <IconRenderer icon="iconify:lucide:lightbulb" :size="17" />
            </span>
            <div
              ref="editableRef"
              :class="editableClass()"
              :data-placeholder="editablePlaceholder()"
              contenteditable="true"
              spellcheck="true"
              role="textbox"
              @beforeinput="handleEditableBeforeInput"
              @paste="handleEditablePaste"
              @input="handleEditableInput"
              @keydown="handleEditableKeydown"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @mouseup="updateInlineToolbar"
              @keyup="updateInlineToolbar"
              @blur="inlineToolbar.visible = false"
            />
          </div>
        </template>

        <template v-else>
          <div
            ref="editableRef"
            :class="editableClass()"
            :data-placeholder="editablePlaceholder()"
            contenteditable="true"
            spellcheck="true"
            role="textbox"
            @beforeinput="handleEditableBeforeInput"
            @paste="handleEditablePaste"
            @input="handleEditableInput"
            @keydown="handleEditableKeydown"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
            @mouseup="updateInlineToolbar"
            @keyup="updateInlineToolbar"
            @blur="inlineToolbar.visible = false"
          />
        </template>
      </main>

      <Teleport to="body">
        <div
          v-if="inlineToolbar.visible"
          class="knowledge-block-inline-toolbar"
          role="toolbar"
          aria-label="文本格式"
          :style="{ left: `${inlineToolbar.x}px`, top: `${inlineToolbar.y}px` }"
        >
          <UiButton
            class="knowledge-block-inline-toolbar__button"
            variant="ghost"
            size="sm"
            title="加粗"
            aria-label="加粗"
            @mousedown.prevent="applyInlineMark('bold')"
          >
            <IconRenderer icon="iconify:lucide:bold" :size="14" />
          </UiButton>
          <UiButton
            class="knowledge-block-inline-toolbar__button"
            variant="ghost"
            size="sm"
            title="斜体"
            aria-label="斜体"
            @mousedown.prevent="applyInlineMark('italic')"
          >
            <IconRenderer icon="iconify:lucide:italic" :size="14" />
          </UiButton>
          <span class="knowledge-block-inline-toolbar__divider" aria-hidden="true" />
          <UiButton
            class="knowledge-block-inline-toolbar__button"
            variant="ghost"
            size="sm"
            title="删除线"
            aria-label="删除线"
            @mousedown.prevent="applyInlineMark('strike')"
          >
            <IconRenderer icon="iconify:lucide:strikethrough" :size="14" />
          </UiButton>
          <UiButton
            class="knowledge-block-inline-toolbar__button"
            variant="ghost"
            size="sm"
            title="行内代码"
            aria-label="行内代码"
            @mousedown.prevent="applyInlineMark('code')"
          >
            <IconRenderer icon="iconify:lucide:code-2" :size="14" />
          </UiButton>
        </div>
      </Teleport>
    </article>

    <div v-if="block.children?.length && toggleOpen" class="knowledge-block-node__children">
      <KnowledgeBlockRenderer
        v-for="(child, index) in block.children"
        :key="child.id"
        :block="child"
        :depth="(depth ?? 0) + 1"
        :is-first="index === 0"
        :is-last="index === block.children.length - 1"
        :focus-block-id="focusBlockId"
        :focus-cursor-offset="focusCursorOffset"
        :drop-target-block-id="dropTargetBlockId"
        :drop-target-placement="dropTargetPlacement"
        :selected-block-id="selectedBlockId"
        :selected-block-ids="selectedBlockIds"
        @update="payload => emit('update', payload)"
        @choose-asset="payload => emit('choose-asset', payload)"
        @open-asset="asset => emit('open-asset', asset)"
        @show-asset="asset => emit('show-asset', asset)"
        @select-asset="asset => emit('select-asset', asset)"
        @convert-todo="blockId => emit('convert-todo', blockId)"
        @insert-after="blockId => emit('insert-after', blockId)"
        @duplicate="blockId => emit('duplicate', blockId)"
        @remove="blockId => emit('remove', blockId)"
        @indent="blockId => emit('indent', blockId)"
        @outdent="blockId => emit('outdent', blockId)"
        @slash-open="payload => emit('slash-open', payload)"
        @block-menu="payload => emit('block-menu', payload)"
        @focused="blockId => emit('focused', blockId)"
        @select-block="blockId => emit('select-block', blockId)"
        @split-block="payload => emit('split-block', payload)"
        @merge-backward="payload => emit('merge-backward', payload)"
        @paste-markdown="payload => emit('paste-markdown', payload)"
        @focus-previous-block="payload => emit('focus-previous-block', payload)"
        @focus-next-block="payload => emit('focus-next-block', payload)"
        @apply-inline-mark="payload => emit('apply-inline-mark', payload)"
        @drag-start="payload => emit('drag-start', payload)"
        @drag-over="payload => emit('drag-over', payload)"
        @drag-leave="payload => emit('drag-leave', payload)"
        @drop-on-block="payload => emit('drop-on-block', payload)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.knowledge-block-node {
  --knowledge-block-depth: 0;

  max-width: 840px;
  margin: 0 auto;
  padding-left: calc(var(--knowledge-block-depth, 0) * 20px);
}

.knowledge-block-node__children {
  display: grid;
  gap: 0;
}

.knowledge-block {
  --knowledge-block-code-height: 45px;
  --knowledge-block-code-lines: 1;

  position: relative;
  display: block;
  max-width: calc(840px - (var(--knowledge-block-depth, 0) * 20px));
  margin: 0 0 1px;
  padding: 2px 4px;
  border-radius: 5px;
  background: transparent;

  &:hover,
  &:focus-within {
    background: color-mix(in srgb, var(--ui-surface-panel-muted) 52%, transparent);
  }
}

.knowledge-block--drop-before::before,
.knowledge-block--drop-after::after {
  content: "";
  position: absolute;
  z-index: 2;
  left: 4px;
  right: 4px;
  height: 2px;
  border-radius: 999px;
  background: var(--ui-primary-color);
  pointer-events: none;
}

.knowledge-block--drop-before::before {
  top: -1px;
}

.knowledge-block--drop-after::after {
  bottom: -1px;
}

.knowledge-block--selected {
  background: color-mix(in srgb, var(--ui-primary-color) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-primary-color) 36%, transparent);
}

.knowledge-block__body {
  display: grid;
  gap: 4px;
  min-width: 0;
}

@media (max-width: 980px) {
  .knowledge-block {
    display: grid;
    gap: 2px;
  }
}

.knowledge-block__editable {
  min-height: 28px;
  padding: 2px 2px;
  border-radius: 5px;
  color: var(--ui-text-primary);
  line-height: 1.58;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;

  &:focus {
    background: color-mix(in srgb, var(--ui-text-primary) 3%, transparent);
  }

  &:empty::before {
    color: var(--ui-text-muted);
    content: attr(data-placeholder);
    pointer-events: none;
  }

  :deep(code),
  code {
    padding: 1px 4px;
    border-radius: 4px;
    color: var(--ui-text-primary);
    background: var(--knowledge-block-inline-code-bg, var(--ui-surface-panel-muted));
    font-family: var(--ui-font-mono, 'Geist Mono Variable', monospace);
    font-size: 0.92em;
  }
}

.knowledge-block__editable--heading {
  min-height: 34px;
  font-weight: 750;
  line-height: 1.24;
}

.knowledge-block__editable--heading-1 {
  min-height: 44px;
  margin-top: 8px;
  font-size: 32px;
}

.knowledge-block__editable--heading-2 {
  margin-top: 6px;
  font-size: 25px;
}

.knowledge-block__editable--heading-3 {
  min-height: 30px;
  margin-top: 4px;
  font-size: 19px;
}

.knowledge-block__editable--heading-4 {
  min-height: 28px;
  font-size: 16px;
}

.knowledge-block__task,
.knowledge-block__list-row,
.knowledge-block__toggle {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px;
  align-items: start;
}

.knowledge-block__list-marker {
  width: 20px;
  padding-top: 4px;
  color: var(--ui-text-muted);
  text-align: right;
  user-select: none;
}

.knowledge-block__toggle-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 24px;
  margin-top: 1px;
  border: 0;
  border-radius: var(--ui-radius-xs);
  color: var(--ui-text-muted);
  background: transparent;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    outline: none;
    color: var(--ui-text-primary);
    background: var(--ui-surface-panel-muted);
  }
}

.knowledge-block__code-shell {
  display: grid;
  gap: 2px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 62%, transparent);
  border-radius: 5px;
  background: var(--knowledge-block-code-bg, color-mix(in srgb, var(--ui-surface-panel-muted) 38%, transparent));
}

.knowledge-block__code-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 3px 9px 0;
  color: var(--ui-text-muted);

}

.knowledge-block__code-language {
  width: 132px;
  height: 24px;
  min-width: 0;
  padding: 0 2px;
  border: 0;
  border-radius: 4px;
  color: var(--ui-text-muted);
  background: transparent;
  font-family: var(--ui-font-mono, 'Geist Mono Variable', monospace);
  font-size: var(--ui-font-size-xs);
  outline: none;

  &:focus {
    background: color-mix(in srgb, var(--ui-text-primary) 5%, transparent);
  }
}

.knowledge-block__code {
  --knowledge-block-code-line-height: 23px;

  height: var(--knowledge-block-code-height, 45px);
  min-height: 45px !important;
  border: 0;
  border-radius: 0;
  color: var(--ui-text-primary);
  background: transparent;
  font-family: var(--ui-font-mono, 'Geist Mono Variable', monospace);
  line-height: var(--knowledge-block-code-line-height);

  :deep(textarea) {
    padding: 4px 10px 10px;
    border: 0;
    background: transparent;
    box-shadow: none;
  }
}

.knowledge-block__table-shell {
  width: 100%;
  overflow: hidden;
}

.knowledge-block__table-scrollbar {
  width: 100%;
  height: auto;
  padding: 2px 32px 10px 2px;
  --ui-scrollbar-track-inset: 3px;
}

.knowledge-block__table-frame {
  position: relative;
  width: max-content;
  min-width: min(100%, 392px);
}

.knowledge-block__table {
  width: 100%;
  border-collapse: collapse;
  background: var(--knowledge-block-table-bg, transparent);

  td {
    min-width: 120px;
    border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 66%, transparent);
    transition: background-color 140ms ease, border-color 140ms ease;
  }

  td:hover,
  td:focus-within {
    border-color: color-mix(in srgb, var(--ui-primary-color) 36%, var(--ui-border-subtle));
    background: color-mix(in srgb, var(--ui-primary-color) 5%, transparent);
  }

}

.knowledge-block__table-cell {
  width: 100%;
  min-height: 28px;
  padding-inline: 7px;
  border: 0;
  border-radius: 0;
  color: var(--ui-text-primary);
  background: var(--knowledge-block-table-cell-bg, transparent);
  outline: none;

  &:focus {
    background: color-mix(in srgb, var(--ui-text-primary) 4%, transparent);
  }
}

.knowledge-block__table-edge-actions {
  position: absolute;
  display: inline-flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 140ms ease, transform 140ms ease;
}

.knowledge-block__table-frame:hover .knowledge-block__table-edge-actions,
.knowledge-block__table-frame:focus-within .knowledge-block__table-edge-actions {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.knowledge-block__table-edge-actions--column {
  top: 0;
  right: -30px;
  flex-direction: column;
  transform: translate3d(-4px, 0, 0);
}

.knowledge-block__table-edge-actions--row {
  bottom: -30px;
  left: 0;
  transform: translate3d(0, -4px, 0);
}

.knowledge-block__table-edge-button {
  :deep(.ui-button) {
    width: 24px;
    height: 24px;
    min-width: 24px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
    border-radius: 5px;
    background: color-mix(in srgb, var(--ui-surface-panel) 82%, transparent);
    box-shadow: 0 4px 8px rgb(15 23 42 / 8%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .knowledge-block__table-edge-actions,
  .knowledge-block__table td {
    transition: none;
  }
}

.knowledge-block__reference-line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 30px;
  padding: 2px 4px;
  border-radius: 5px;
  background: transparent;
  transition: background-color 140ms ease;

  &:hover,
  &:focus-within {
    background: color-mix(in srgb, var(--ui-surface-panel-muted) 46%, transparent);
  }

  > svg {
    color: var(--ui-primary-color);
  }
}

.knowledge-block__reference-fields {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  .knowledge-block__editable {
    flex: 1 1 auto;
    min-width: 80px;
  }
}

.knowledge-block__reference-id {
  flex: 0 1 180px;
  opacity: 0;
  transition: opacity 140ms ease;

  :deep(.ui-input-affix-wrapper),
  :deep(input) {
    min-height: 26px;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
}

.knowledge-block__reference-line:hover .knowledge-block__reference-id,
.knowledge-block__reference-line:focus-within .knowledge-block__reference-id {
  opacity: 1;
}

.knowledge-block__reference-line--todo > svg {
  color: var(--ui-success-color);
}

.knowledge-block__asset {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  max-width: 800px;
  min-height: 38px;
  padding: 4px;
  border-radius: 5px;
  background: transparent;
  transition: background-color 140ms ease;

  &:hover,
  &:focus-within {
    background: color-mix(in srgb, var(--ui-surface-panel-muted) 50%, transparent);
  }

  img {
    width: 38px;
    height: 30px;
    object-fit: cover;
    border-radius: 5px;
  }

  :deep(.ui-button) {
    width: 26px;
    height: 26px;
    min-width: 26px;
    padding: 0;
  }

  strong,
  span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }
}

.knowledge-block__asset-preview {
  display: grid;
  place-items: center;
  width: 38px;
  height: 30px;
  border-radius: 5px;
  color: var(--ui-text-muted);
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 46%, transparent);
}

.knowledge-block__asset-meta {
  min-width: 0;
}

.knowledge-block__asset-actions {
  display: inline-flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 140ms ease;
}

.knowledge-block__asset:hover .knowledge-block__asset-actions,
.knowledge-block__asset:focus-within .knowledge-block__asset-actions,
.knowledge-block__asset--empty .knowledge-block__asset-actions {
  opacity: 1;
}

.knowledge-block__divider {
  border: 0;
  border-top: 1px solid var(--ui-border-subtle);
}

.knowledge-block__callout {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 7px 9px;
  border-radius: 5px;
  background: var(--knowledge-block-callout-bg, color-mix(in srgb, var(--ui-surface-panel-muted) 44%, transparent));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-border-subtle) 58%, transparent);
}

.knowledge-block--quote .knowledge-block__body {
  padding: 2px 0 2px 12px;
  border-left: 3px solid color-mix(in srgb, var(--ui-text-muted) 72%, transparent);
  background: var(--knowledge-block-quote-bg, transparent);
}

.knowledge-block__callout-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 28px;
  color: var(--ui-warning-color);
}

.knowledge-block-inline-toolbar {
  position: fixed;
  z-index: 4300;
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(25 25 25);
  box-shadow: 0 8px 24px rgb(0 0 0 / 24%);
  transform: translate(-50%, -100%);

  :deep(.knowledge-block-inline-toolbar__button.ui-button) {
    width: 28px;
    height: 26px;
    min-height: 26px;
    padding: 0;
    border: 0;
    color: rgb(245 245 245 / 82%);
    background: transparent;
    box-shadow: none;
    transform: none;

    &:hover,
    &:focus-visible {
      color: #fff;
      background: rgb(255 255 255 / 12%);
    }
  }

  :deep(.ui-button__label) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

.knowledge-block-inline-toolbar__divider {
  width: 1px;
  height: 18px;
  margin: 4px 3px;
  background: rgb(255 255 255 / 14%);
}

@media (max-width: 980px) {
  .knowledge-block-node {
    padding-left: 0;
  }

  .knowledge-block {
    grid-template-columns: 28px minmax(0, 1fr);
    padding-right: 2px;
  }

  .knowledge-block--heading .knowledge-block__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .knowledge-block__asset {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
