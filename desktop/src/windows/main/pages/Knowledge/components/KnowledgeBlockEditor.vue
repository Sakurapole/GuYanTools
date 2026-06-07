<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiFileInput from '@/windows/main/components/ui/UiFileInput.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import {
  blockDocumentV2ToMarkdown,
  blockV2InlineText,
  createBlockV2,
  duplicateBlockById,
  findBlockV2,
  indentBlock,
  insertBlockAfter,
  markdownToBlockDocumentV2,
  moveBlockById,
  normalizeBlockDocumentV2,
  outdentBlock,
  removeBlockById,
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

const props = defineProps<{
  modelValue: KnowledgeBlockDocumentV2;
  dirty?: boolean;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: KnowledgeBlockDocumentV2): void;
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
const slashMenu = ref<{
  blockId: string;
  query: string;
  x: number;
  y: number;
} | null>(null);

const blockTypes: Array<{ type: KnowledgeBlockV2Type; icon: string; label: string; keywords?: string[] }> = [
  { type: 'paragraph', icon: 'iconify:lucide:pilcrow', label: '正文', keywords: ['paragraph', 'text'] },
  { type: 'heading', icon: 'iconify:lucide:heading-2', label: '标题', keywords: ['heading', 'h1', 'h2'] },
  { type: 'bullet_list', icon: 'iconify:lucide:list', label: '项目', keywords: ['bullet', 'list'] },
  { type: 'ordered_list', icon: 'iconify:lucide:list-ordered', label: '编号', keywords: ['ordered', 'number'] },
  { type: 'task_list', icon: 'iconify:lucide:square-check', label: '任务', keywords: ['task', 'todo'] },
  { type: 'code', icon: 'iconify:lucide:code-2', label: '代码', keywords: ['code'] },
  { type: 'quote', icon: 'iconify:lucide:quote', label: '引用', keywords: ['quote'] },
  { type: 'callout', icon: 'iconify:lucide:badge-info', label: '提示', keywords: ['callout', 'note'] },
  { type: 'divider', icon: 'iconify:lucide:minus', label: '分割线', keywords: ['divider', 'hr'] },
  { type: 'image', icon: 'iconify:lucide:image-plus', label: '图片', keywords: ['image'] },
  { type: 'attachment', icon: 'iconify:lucide:paperclip', label: '附件', keywords: ['file', 'attachment'] },
];

const markdownExport = computed(() => blockDocumentV2ToMarkdown(documentDraft.value));

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
    return;
  }
  updateDocument([...documentDraft.value.blocks, block]);
}

function updateBlock(blockId: string, patch: Partial<KnowledgeBlockV2>) {
  if (slashMenu.value?.blockId === blockId && patch.content && !inlineTextFromContent(patch.content).startsWith('/')) {
    slashMenu.value = null;
  }
  const next = updateBlockDocumentV2(documentDraft.value, blockId, patch);
  replaceDocument(next);
}

function convertBlock(blockId: string, type: KnowledgeBlockV2Type) {
  const block = findBlockV2(documentDraft.value.blocks, blockId);
  if (!block) return;

  const text = blockV2InlineText(block);
  replaceDocument(updateBlockDocumentV2(documentDraft.value, blockId, {
    type,
    content: text.startsWith('/') ? [] : block.content,
    attrs: defaultAttrsForType(type, block.attrs),
    refs: block.refs,
  }));
}

function removeBlock(blockId: string) {
  updateDocument(removeBlockById(documentDraft.value.blocks, blockId));
}

function moveBlock(blockId: string, direction: -1 | 1) {
  updateDocument(moveBlockById(documentDraft.value.blocks, blockId, direction));
}

function duplicateBlock(blockId: string) {
  updateDocument(duplicateBlockById(documentDraft.value.blocks, blockId));
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

function openSlashMenu(payload: { blockId: string; query: string; rect: DOMRect | null }) {
  const rect = payload.rect;
  slashMenu.value = {
    blockId: payload.blockId,
    query: payload.query,
    x: Math.min(Math.max(rect?.left ?? 24, 12), window.innerWidth - 252),
    y: Math.min((rect?.bottom ?? 96) + 6, window.innerHeight - 372),
  };
}

function selectSlashBlock(type: KnowledgeBlockV2Type) {
  const menu = slashMenu.value;
  if (!menu) return;

  const block = findBlockV2(documentDraft.value.blocks, menu.blockId);
  if (!block) {
    slashMenu.value = null;
    return;
  }

  if (blockV2InlineText(block).startsWith('/')) {
    convertBlock(block.id, type);
  } else {
    addBlock(type, block.id);
  }
  slashMenu.value = null;
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

</script>

<template>
  <section class="knowledge-block-editor" aria-label="块笔记编辑器">
    <header class="knowledge-block-editor__toolbar">
      <div class="knowledge-block-editor__insert">
        <UiButton
          v-for="item in blockTypes"
          :key="item.type"
          type="button"
          variant="secondary"
          size="sm"
          @click="addBlock(item.type)"
        >
          <template #prefix>
            <IconRenderer :icon="item.icon" :size="14" />
          </template>
          {{ item.label }}
        </UiButton>
      </div>
      <div class="knowledge-block-editor__actions">
        <span v-if="documentDraft.importedFromMarkdown" class="knowledge-block-editor__badge">
          Markdown 有损导入
        </span>
        <UiButton type="button" variant="secondary" size="sm" @click="markdownImportOpen = !markdownImportOpen">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:import" :size="14" />
          </template>
          Markdown 导入
        </UiButton>
        <UiButton type="button" variant="secondary" size="sm" @click="copyMarkdown">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:download" :size="14" />
          </template>
          导出 Markdown
        </UiButton>
        <UiButton type="button" variant="primary" size="sm" :disabled="saving || !dirty" @click="emit('save')">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:save" :size="14" />
          </template>
          {{ saving ? '保存中' : dirty ? '保存' : '已保存' }}
        </UiButton>
      </div>
      <UiFileInput ref="fileInputRef" @change="handleFileSelected" />
    </header>

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

    <div class="knowledge-block-editor__canvas">
      <KnowledgeBlockRenderer
        v-for="(block, index) in documentDraft.blocks"
        :key="block.id"
        :block="block"
        :depth="0"
        :is-first="index === 0"
        :is-last="index === documentDraft.blocks.length - 1"
        @update="payload => updateBlock(payload.blockId, payload.patch)"
        @choose-asset="payload => chooseAsset(payload.blockId, payload.kind)"
        @open-asset="assetId => emit('open-asset', assetId)"
        @show-asset="assetId => emit('show-asset', assetId)"
        @select-asset="assetId => emit('select-asset', assetId)"
        @convert-todo="blockId => emit('convert-todo', blockId)"
        @move-up="blockId => moveBlock(blockId, -1)"
        @move-down="blockId => moveBlock(blockId, 1)"
        @insert-after="blockId => addBlock('paragraph', blockId)"
        @duplicate="duplicateBlock"
        @remove="removeBlock"
        @indent="indentBlockDraft"
        @outdent="outdentBlockDraft"
        @slash-open="openSlashMenu"
      />
    </div>

    <KnowledgeSlashMenu
      :open="Boolean(slashMenu)"
      :x="slashMenu?.x ?? 0"
      :y="slashMenu?.y ?? 0"
      :query="slashMenu?.query ?? ''"
      :options="blockTypes"
      @select="selectSlashBlock"
      @close="slashMenu = null"
    />
  </section>
</template>

<style scoped lang="scss">
.knowledge-block-editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  color: var(--ui-text-primary);
  background: var(--ui-surface-panel-muted);
}

.knowledge-block-editor__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);
}

.knowledge-block-editor__insert,
.knowledge-block-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.knowledge-block-editor__actions {
  align-items: center;
  justify-content: flex-end;
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
  overflow: auto;
  padding: 22px 32px 48px;
}

.knowledge-block {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr) auto;
  gap: 12px;
  max-width: 980px;
  margin: 0 auto 10px;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--ui-surface-panel);
}

.knowledge-block:hover {
  border-color: var(--ui-border-subtle);
}

.knowledge-block__rail {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-block__body {
  display: grid;
  gap: 8px;
  min-width: 0;

  input,
  :deep(.ui-textarea),
  select {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--ui-input-border);
    border-radius: 8px;
    color: var(--ui-input-text);
    background: var(--ui-input-bg);
    font: inherit;
  }

  input,
  select {
    height: 34px;
    padding: 0 10px;
  }

  :deep(.ui-textarea) {
    min-height: 74px;
    resize: vertical;
    padding: 10px;
    line-height: 1.65;
  }
}

.knowledge-block__heading {
  font-size: 22px !important;
  font-weight: 750 !important;
}

.knowledge-block__task {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;

  input[type='checkbox'] {
    width: 18px;
    height: 18px;
  }
}

.knowledge-block__code-language {
  display: grid;
  grid-template-columns: 42px minmax(0, 180px);
  gap: 8px;
  align-items: center;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-block__code {
  font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace) !important;
}

.knowledge-block__asset {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--ui-surface-glass);

  img {
    width: 92px;
    height: 62px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--ui-surface-panel-muted);
  }

  div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  strong,
  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
  }
}

.knowledge-block__actions {
  display: flex;
  gap: 4px;
  align-self: start;
}

.knowledge-block--quote {
  border-left-color: color-mix(in srgb, var(--ui-primary-color) 52%, transparent);
}

.knowledge-block--callout {
  background: color-mix(in srgb, var(--ui-primary-color) 8%, var(--ui-surface-panel));
}

@media (max-width: 980px) {
  .knowledge-block-editor__toolbar,
  .knowledge-block {
    grid-template-columns: 1fr;
  }

  .knowledge-block__asset {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .knowledge-block__actions {
    justify-content: flex-end;
  }
}
</style>
