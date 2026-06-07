<script setup lang="ts">
import { computed, ref } from 'vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import type { KnowledgeBlockV2, KnowledgeBlockV2Type } from '@/windows/main/utils/knowledge_blocks_v2';
import KnowledgeBlockHandle from './KnowledgeBlockHandle.vue';

const props = defineProps<{
  block: KnowledgeBlockV2;
  depth?: number;
  isFirst?: boolean;
  isLast?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update', payload: { blockId: string; patch: Partial<KnowledgeBlockV2> }): void;
  (event: 'choose-asset', payload: { blockId: string; kind: 'image' | 'attachment' }): void;
  (event: 'open-asset', assetId: string): void;
  (event: 'show-asset', assetId: string): void;
  (event: 'select-asset', assetId: string): void;
  (event: 'convert-todo', blockId: string): void;
  (event: 'move-up', blockId: string): void;
  (event: 'move-down', blockId: string): void;
  (event: 'insert-after', blockId: string): void;
  (event: 'duplicate', blockId: string): void;
  (event: 'remove', blockId: string): void;
  (event: 'indent', blockId: string): void;
  (event: 'outdent', blockId: string): void;
  (event: 'slash-open', payload: { blockId: string; query: string; rect: DOMRect | null }): void;
}>();

const blockRootRef = ref<HTMLElement | null>(null);

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

const headingLevelOptions = [
  { label: 'H1', value: 1 },
  { label: 'H2', value: 2 },
  { label: 'H3', value: 3 },
];

const blockText = computed(() => inlineText(props.block));
const assetId = computed(() => props.block.refs?.assetId ?? '');
const todoId = computed(() => props.block.refs?.todoId ?? '');
const blockStyle = computed(() => ({
  '--knowledge-block-depth': String(Math.min(props.depth ?? 0, 8)),
}));
const codeLineCount = computed(() => Math.max(1, blockText.value.split(/\r\n|\r|\n/).length));
const codeTextareaStyle = computed(() => ({
  '--knowledge-block-code-lines': String(codeLineCount.value),
  '--knowledge-block-code-height': `${codeLineCount.value * 23 + 22}px`,
}));
const tableGrid = computed(() => normalizeTableGrid(blockText.value, props.block.attrs));

function blockIcon(type: KnowledgeBlockV2Type) {
  return blockTypes.find((item) => item.type === type)?.icon || 'iconify:lucide:square';
}

function blockLabel(type: KnowledgeBlockV2Type) {
  return blockTypes.find((item) => item.type === type)?.label || type;
}

function chooseAsset(kind: 'image' | 'attachment') {
  emit('choose-asset', {
    blockId: props.block.id,
    kind,
  });
}

function updateText(value: string) {
  emit('update', {
    blockId: props.block.id,
    patch: { content: value ? [{ type: 'text', text: value }] : [] },
  });

  if (props.block.type === 'paragraph' && value.startsWith('/')) {
    emit('slash-open', {
      blockId: props.block.id,
      query: value.slice(1),
      rect: blockRootRef.value?.getBoundingClientRect() ?? null,
    });
  }
}

function handleTextKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab' && props.block.type !== 'code') {
    event.preventDefault();
    emit(event.shiftKey ? 'outdent' : 'indent', props.block.id);
    return;
  }

  if (event.key === 'Enter' && !event.shiftKey && props.block.type !== 'code') {
    event.preventDefault();
    emit('insert-after', props.block.id);
    return;
  }

  if (event.key === 'Backspace' && !blockText.value && props.block.type !== 'code') {
    event.preventDefault();
    emit('remove', props.block.id);
  }
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

function emitAssetAction(event: 'open-asset' | 'show-asset' | 'select-asset') {
  if (!assetId.value) return;
  emit(event, assetId.value);
}

function updateTableCell(rowIndex: number, columnIndex: number, value: string) {
  const next = cloneTableGrid(tableGrid.value);
  next[rowIndex][columnIndex] = value;
  updateText(serializeTableGrid(next));
}

function addTableRow() {
  const next = cloneTableGrid(tableGrid.value);
  const columnCount = Math.max(1, next[0]?.length ?? 1);
  next.push(Array.from({ length: columnCount }, () => ''));
  updateText(serializeTableGrid(next));
}

function addTableColumn() {
  const next = cloneTableGrid(tableGrid.value).map((row) => [...row, '']);
  updateText(serializeTableGrid(next));
}

function removeTableRow(rowIndex: number) {
  const next = cloneTableGrid(tableGrid.value);
  if (next.length <= 1) return;
  next.splice(rowIndex, 1);
  updateText(serializeTableGrid(next));
}

function removeTableColumn(columnIndex: number) {
  const next = cloneTableGrid(tableGrid.value);
  const columnCount = next[0]?.length ?? 0;
  if (columnCount <= 1) return;
  updateText(serializeTableGrid(next.map((row) => row.filter((_cell, index) => index !== columnIndex))));
}

function inlineText(block: KnowledgeBlockV2) {
  return block.content.map((item) => item.text).join('');
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
    <article ref="blockRootRef" class="knowledge-block" :class="`knowledge-block--${block.type}`">
      <aside class="knowledge-block__rail">
        <IconRenderer :icon="blockIcon(block.type)" :size="15" />
        <span>{{ blockLabel(block.type) }}</span>
      </aside>

      <main class="knowledge-block__body">
        <template v-if="block.type === 'heading'">
          <UiInput
            class="knowledge-block__heading"
            :model-value="blockText"
            spellcheck="true"
            @keydown="handleTextKeydown"
            @update:model-value="value => updateText(value)"
          />
          <UiSelect
            :model-value="Number(block.attrs?.level ?? 2)"
            :options="headingLevelOptions"
            size="sm"
            @update:model-value="value => updateAttrs({ level: Number(value) })"
          />
        </template>

        <template v-else-if="block.type === 'task_list'">
          <label class="knowledge-block__task">
            <UiCheckbox
              size="sm"
              :checked="Boolean(block.attrs?.checked)"
              @change="checked => updateAttrs({ checked })"
            />
            <UiInput
              :model-value="blockText"
              spellcheck="true"
              @keydown="handleTextKeydown"
              @update:model-value="value => updateText(value)"
            />
          </label>
          <UiButton
            type="button"
            variant="secondary"
            size="sm"
            :disabled="Boolean(todoId)"
            @click="emit('convert-todo', block.id)"
          >
            {{ todoId ? '已转 Todo' : '转 Todo' }}
          </UiButton>
        </template>

        <template v-else-if="block.type === 'code'">
          <label class="knowledge-block__code-language">
            <span>语言</span>
            <UiInput
              :model-value="String(block.attrs?.language ?? 'text')"
              size="sm"
              @update:model-value="value => updateAttrs({ language: value })"
            />
          </label>
          <UiTextarea
            class="knowledge-block__code"
            :model-value="blockText"
            :rows="codeLineCount"
            :style="codeTextareaStyle"
            spellcheck="false"
            resize="none"
            @update:model-value="value => updateText(value)"
          />
        </template>

        <template v-else-if="block.type === 'table'">
          <div class="knowledge-block__table-shell">
            <table class="knowledge-block__table">
              <tbody>
                <tr v-for="(row, rowIndex) in tableGrid" :key="`row-${rowIndex}`">
                  <td v-for="(cell, columnIndex) in row" :key="`cell-${rowIndex}-${columnIndex}`">
                    <UiInput
                      class="knowledge-block__table-cell"
                      :model-value="cell"
                      size="sm"
                      @update:model-value="value => updateTableCell(rowIndex, columnIndex, value)"
                    />
                  </td>
                  <td class="knowledge-block__table-row-action">
                    <UiButton type="button" variant="ghost" size="sm" :disabled="tableGrid.length <= 1" @click="removeTableRow(rowIndex)">
                      <template #prefix>
                        <IconRenderer icon="iconify:lucide:minus" :size="13" />
                      </template>
                      行
                    </UiButton>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="knowledge-block__table-actions">
              <UiButton type="button" variant="secondary" size="sm" @click="addTableRow">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:plus" :size="13" />
                </template>
                行
              </UiButton>
              <UiButton type="button" variant="secondary" size="sm" @click="addTableColumn">
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:plus" :size="13" />
                </template>
                列
              </UiButton>
              <UiButton
                type="button"
                variant="ghost"
                size="sm"
                :disabled="(tableGrid[0]?.length ?? 0) <= 1"
                @click="removeTableColumn((tableGrid[0]?.length ?? 1) - 1)"
              >
                <template #prefix>
                  <IconRenderer icon="iconify:lucide:minus" :size="13" />
                </template>
                列
              </UiButton>
            </div>
          </div>
        </template>

        <template v-else-if="block.type === 'image' || block.type === 'attachment'">
          <div v-if="assetId" class="knowledge-block__asset">
            <img
              v-if="block.type === 'image' && block.attrs?.assetUrl"
              :src="String(block.attrs.assetUrl)"
              :alt="String(block.attrs.assetName ?? '图片块')"
            />
            <div>
              <strong>{{ String(block.attrs?.assetName ?? '已入库资产') }}</strong>
              <span>{{ String(block.attrs?.assetMimeType ?? (block.type === 'image' ? 'image' : 'attachment')) }}</span>
            </div>
            <UiButton type="button" variant="secondary" size="sm" @click="emitAssetAction('open-asset')">
              打开
            </UiButton>
            <UiButton type="button" variant="secondary" size="sm" @click="emitAssetAction('show-asset')">
              在系统中显示
            </UiButton>
            <UiButton type="button" variant="secondary" size="sm" @click="emitAssetAction('select-asset')">
              <template #prefix>
                <IconRenderer icon="iconify:lucide:tag" :size="14" />
              </template>
              标记
            </UiButton>
          </div>
          <UiButton type="button" variant="secondary" size="sm" @click="chooseAsset(block.type)">
            <template #prefix>
              <IconRenderer :icon="block.type === 'image' ? 'iconify:lucide:image-plus' : 'iconify:lucide:paperclip'" :size="14" />
            </template>
            {{ assetId ? '替换文件' : '选择文件' }}
          </UiButton>
        </template>

        <template v-else-if="block.type === 'divider'">
          <hr class="knowledge-block__divider" />
        </template>

        <template v-else>
          <UiTextarea
            :model-value="blockText"
            spellcheck="true"
            :placeholder="block.type === 'bullet_list' || block.type === 'ordered_list' ? '每行一个条目' : '输入内容'"
            @keydown="handleTextKeydown"
            @update:model-value="value => updateText(value)"
          />
        </template>
      </main>

      <KnowledgeBlockHandle
        :disabled-up="isFirst"
        :disabled-down="isLast"
        @move-up="emit('move-up', block.id)"
        @move-down="emit('move-down', block.id)"
        @insert-after="emit('insert-after', block.id)"
        @indent="emit('indent', block.id)"
        @outdent="emit('outdent', block.id)"
        @duplicate="emit('duplicate', block.id)"
        @remove="emit('remove', block.id)"
      />
    </article>

    <div v-if="block.children?.length" class="knowledge-block-node__children">
      <KnowledgeBlockRenderer
        v-for="(child, index) in block.children"
        :key="child.id"
        :block="child"
        :depth="(depth ?? 0) + 1"
        :is-first="index === 0"
        :is-last="index === block.children.length - 1"
        @update="payload => emit('update', payload)"
        @choose-asset="payload => emit('choose-asset', payload)"
        @open-asset="asset => emit('open-asset', asset)"
        @show-asset="asset => emit('show-asset', asset)"
        @select-asset="asset => emit('select-asset', asset)"
        @convert-todo="blockId => emit('convert-todo', blockId)"
        @move-up="blockId => emit('move-up', blockId)"
        @move-down="blockId => emit('move-down', blockId)"
        @insert-after="blockId => emit('insert-after', blockId)"
        @duplicate="blockId => emit('duplicate', blockId)"
        @remove="blockId => emit('remove', blockId)"
        @indent="blockId => emit('indent', blockId)"
        @outdent="blockId => emit('outdent', blockId)"
        @slash-open="payload => emit('slash-open', payload)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.knowledge-block {
  --knowledge-block-code-height: 45px;
  --knowledge-block-code-lines: 1;

  display: grid;
  grid-template-columns: 112px minmax(0, 1fr) auto;
  gap: 12px;
  max-width: calc(980px - (var(--knowledge-block-depth, 0) * 22px));
  margin: 0 0 10px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
}

.knowledge-block-node {
  --knowledge-block-depth: 0;

  max-width: 980px;
  margin: 0 auto;
  padding-left: calc(var(--knowledge-block-depth, 0) * 22px);
}

.knowledge-block-node__children {
  display: grid;
  gap: 0;
}

.knowledge-block:hover {
  border-color: color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 72%, transparent);
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
    border-radius: 7px;
    color: var(--ui-input-text);
    background: color-mix(in srgb, var(--ui-input-bg) 74%, transparent);
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
  --knowledge-block-code-line-height: 23px;

  height: var(--knowledge-block-code-height, 45px);
  min-height: var(--knowledge-block-code-height, 45px) !important;
  font-family: var(--font-mono, 'Cascadia Mono', Consolas, monospace) !important;
  line-height: var(--knowledge-block-code-line-height) !important;
}

.knowledge-block__divider {
  width: 100%;
  border: 0;
  border-top: 1px solid var(--ui-border-subtle);
}

.knowledge-block__table-shell {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.knowledge-block__table {
  width: 100%;
  min-width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 72%, transparent);

  td {
    min-width: 0;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  }

  tr:first-child .knowledge-block__table-cell {
    font-weight: 750;
    background: color-mix(in srgb, var(--ui-surface-panel-muted) 88%, transparent);
  }
}

.knowledge-block__table-cell {
  display: block;
  width: 100%;
  min-width: 0;
  height: 34px;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 0 10px;
  overflow: hidden;
  background: transparent !important;
  font-size: var(--ui-font-size-sm);
  text-overflow: ellipsis;
}

.knowledge-block__table-row-action {
  width: 60px;
  background: transparent;

  :deep(.ui-button) {
    width: 100%;
    min-width: 0;
    border-radius: 0;
  }
}

.knowledge-block__table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.knowledge-block__asset {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 7px;
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 72%, transparent);

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

.knowledge-block--quote {
  border-left-color: color-mix(in srgb, var(--ui-primary-color) 52%, transparent);
}

.knowledge-block--callout {
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 78%, transparent);
}

@media (max-width: 980px) {
  .knowledge-block {
    grid-template-columns: 1fr;
  }

  .knowledge-block__asset {
    grid-template-columns: auto minmax(0, 1fr);
  }
}
</style>
