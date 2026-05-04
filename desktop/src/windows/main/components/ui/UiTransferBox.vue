<script lang="ts" setup>
import { computed, ref } from 'vue';
import UiButton from './UiButton.vue';
import UiScrollbar from './UiScrollbar.vue';

interface UiTransferBoxItem {
  key: string;
  label: string;
  description?: string;
  locked?: boolean;
  disabled?: boolean;
}

type TransferDragOrigin = 'source' | 'target';
type TransferDropPanel = TransferDragOrigin | '';

interface TransferDragState {
  key: string;
  origin: TransferDragOrigin;
}

const props = withDefaults(defineProps<{
  items: UiTransferBoxItem[];
  modelValue: string[];
  sourceTitle?: string;
  targetTitle?: string;
  sourceEmptyText?: string;
  targetEmptyText?: string;
}>(), {
  sourceTitle: '可选项',
  targetTitle: '已选择',
  sourceEmptyText: '暂无可选项',
  targetEmptyText: '暂无选择项',
});

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
  change: [value: string[]];
}>();

const activeSourceKey = ref('');
const activeTargetKey = ref('');
const dragState = ref<TransferDragState | null>(null);
const dragOverPanel = ref<TransferDropPanel>('');
const dragOverTargetIndex = ref<number | null>(null);

const itemMap = computed(() => new Map(props.items.map(item => [item.key, item])));
const selectedSet = computed(() => new Set(props.modelValue));
const selectedItems = computed(() => props.modelValue
  .map(key => itemMap.value.get(key))
  .filter((item): item is UiTransferBoxItem => Boolean(item)));
const canAddAll = computed(() => props.items.some(item => !item.disabled && !selectedSet.value.has(item.key)));
const canRemoveAll = computed(() => selectedItems.value.some(item => !item.locked));

function updateValue(nextValue: string[]) {
  const validKeys = new Set(props.items.map(item => item.key));
  const seen = new Set<string>();
  const normalized = nextValue.filter((key) => {
    if (!validKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  emit('update:modelValue', normalized);
  emit('change', normalized);
}

function addItem(key: string) {
  const item = itemMap.value.get(key);
  if (!item || item.disabled || selectedSet.value.has(key)) return;
  updateValue([...props.modelValue, key]);
  activeTargetKey.value = key;
}

function removeItem(key: string) {
  const item = itemMap.value.get(key);
  if (item?.locked) return;
  updateValue(props.modelValue.filter(itemKey => itemKey !== key));
  activeTargetKey.value = '';
}

function addAll() {
  const next = [...props.modelValue];
  for (const item of props.items) {
    if (!item.disabled && !next.includes(item.key)) {
      next.push(item.key);
    }
  }
  updateValue(next);
}

function removeAll() {
  updateValue(props.modelValue.filter(key => itemMap.value.get(key)?.locked));
  activeTargetKey.value = '';
}

function moveItem(key: string, direction: -1 | 1) {
  const index = props.modelValue.indexOf(key);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= props.modelValue.length) return;

  const next = [...props.modelValue];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  updateValue(next);
  activeTargetKey.value = key;
}

function clampTargetIndex(index: number) {
  return Math.min(Math.max(index, 0), props.modelValue.length);
}

function insertItemAt(key: string, index: number) {
  const item = itemMap.value.get(key);
  if (!item || item.disabled || selectedSet.value.has(key)) return;

  const next = [...props.modelValue];
  next.splice(clampTargetIndex(index), 0, key);
  updateValue(next);
  activeTargetKey.value = key;
}

function reorderItem(key: string, targetIndex: number) {
  const currentIndex = props.modelValue.indexOf(key);
  if (currentIndex < 0) return;

  const next = [...props.modelValue];
  const [item] = next.splice(currentIndex, 1);
  const normalizedTargetIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const insertIndex = Math.min(Math.max(normalizedTargetIndex, 0), next.length);
  next.splice(insertIndex, 0, item);
  updateValue(next);
  activeTargetKey.value = key;
}

function setDragPayload(event: DragEvent, state: TransferDragState) {
  dragState.value = state;
  event.dataTransfer?.setData('text/plain', state.key);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = state.origin === 'source' ? 'copyMove' : 'move';
  }
}

function clearDragState() {
  dragState.value = null;
  dragOverPanel.value = '';
  dragOverTargetIndex.value = null;
}

function canDropToSource(state: TransferDragState | null) {
  if (!state || state.origin !== 'target') return false;
  return !itemMap.value.get(state.key)?.locked;
}

function canDropToTarget(state: TransferDragState | null) {
  if (!state) return false;
  if (state.origin === 'target') return true;

  const item = itemMap.value.get(state.key);
  return Boolean(item && !item.disabled && !selectedSet.value.has(item.key));
}

function handleSourceDragStart(event: DragEvent, item: UiTransferBoxItem) {
  if (item.disabled || selectedSet.value.has(item.key)) {
    event.preventDefault();
    return;
  }

  activeSourceKey.value = item.key;
  setDragPayload(event, { key: item.key, origin: 'source' });
}

function handleTargetDragStart(event: DragEvent, item: UiTransferBoxItem) {
  activeTargetKey.value = item.key;
  setDragPayload(event, { key: item.key, origin: 'target' });
}

function handleSourceDragOver(event: DragEvent) {
  if (!canDropToSource(dragState.value)) return;
  event.preventDefault();
  dragOverPanel.value = 'source';
  dragOverTargetIndex.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function handleSourceDrop(event: DragEvent) {
  if (!canDropToSource(dragState.value)) return;
  event.preventDefault();
  removeItem(dragState.value.key);
  activeSourceKey.value = dragState.value.key;
  clearDragState();
}

function readTargetDropIndex(event: DragEvent, index: number) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return index;

  const rect = target.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
}

function handleTargetDragOver(event: DragEvent, index = props.modelValue.length) {
  if (!canDropToTarget(dragState.value)) return;
  event.preventDefault();
  dragOverPanel.value = 'target';
  dragOverTargetIndex.value = clampTargetIndex(index);
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = dragState.value?.origin === 'source' ? 'copy' : 'move';
  }
}

function handleTargetItemDragOver(event: DragEvent, index: number) {
  handleTargetDragOver(event, readTargetDropIndex(event, index));
}

function handleTargetDrop(event: DragEvent, index = props.modelValue.length) {
  const state = dragState.value;
  if (!canDropToTarget(state)) return;

  event.preventDefault();
  const targetIndex = clampTargetIndex(index);
  if (state.origin === 'source') {
    insertItemAt(state.key, targetIndex);
  } else {
    reorderItem(state.key, targetIndex);
  }
  clearDragState();
}

function handleTargetItemDrop(event: DragEvent, index: number) {
  handleTargetDrop(event, readTargetDropIndex(event, index));
}

function itemTooltip(item: UiTransferBoxItem) {
  return item.description ? `${item.label}\n${item.description}` : item.label;
}
</script>

<template>
  <div class="ui-transfer-box">
    <section
      class="ui-transfer-box__panel"
      :class="{ 'is-drop-target': dragOverPanel === 'source' }"
      @dragover="handleSourceDragOver"
      @drop="handleSourceDrop"
    >
      <header class="ui-transfer-box__panel-head">
        <span>{{ sourceTitle }}</span>
        <strong>{{ items.length }}</strong>
      </header>
      <UiScrollbar class="ui-transfer-box__list" :x="true" :y="true" :size="6">
        <div class="ui-transfer-box__list-inner" role="listbox" :aria-label="sourceTitle">
          <button
            v-for="item in items"
            :key="item.key"
            v-tooltip="{ content: itemTooltip(item), placement: 'top' }"
            type="button"
            class="ui-transfer-box__item"
            :class="{
              'is-active': activeSourceKey === item.key,
              'is-selected': selectedSet.has(item.key),
              'is-disabled': item.disabled,
            }"
            :draggable="!item.disabled && !selectedSet.has(item.key)"
            :disabled="item.disabled"
            @click="activeSourceKey = item.key"
            @dblclick="addItem(item.key)"
            @dragstart="handleSourceDragStart($event, item)"
            @dragend="clearDragState"
          >
            <span class="ui-transfer-box__item-main">
              <span class="ui-transfer-box__item-label">{{ item.label }}</span>
              <span v-if="item.description" class="ui-transfer-box__item-desc">{{ item.description }}</span>
            </span>
            <span v-if="selectedSet.has(item.key)" class="ui-transfer-box__pill">已固定</span>
            <span v-else class="ui-transfer-box__pill ui-transfer-box__pill--muted">可添加</span>
          </button>
          <div v-if="!items.length" class="ui-transfer-box__empty">{{ sourceEmptyText }}</div>
        </div>
      </UiScrollbar>
    </section>

    <div class="ui-transfer-box__actions" aria-label="移动操作">
      <UiButton
        size="sm"
        variant="secondary"
        :disabled="!activeSourceKey || selectedSet.has(activeSourceKey)"
        @click="addItem(activeSourceKey)"
      >
        添加
      </UiButton>
      <UiButton size="sm" variant="secondary" :disabled="!canAddAll" @click="addAll">
        全部添加
      </UiButton>
      <UiButton
        size="sm"
        variant="secondary"
        :disabled="!activeTargetKey || itemMap.get(activeTargetKey)?.locked"
        @click="removeItem(activeTargetKey)"
      >
        移除
      </UiButton>
      <UiButton size="sm" variant="ghost" :disabled="!canRemoveAll" @click="removeAll">
        清空可选
      </UiButton>
    </div>

    <section
      class="ui-transfer-box__panel ui-transfer-box__panel--target"
      :class="{ 'is-drop-target': dragOverPanel === 'target' }"
      @dragover="handleTargetDragOver"
      @drop="handleTargetDrop"
    >
      <header class="ui-transfer-box__panel-head">
        <span>{{ targetTitle }}</span>
        <strong>{{ selectedItems.length }}</strong>
      </header>
      <UiScrollbar class="ui-transfer-box__list" :x="true" :y="true" :size="6">
        <div class="ui-transfer-box__list-inner" role="listbox" :aria-label="targetTitle">
          <div
            v-for="(item, index) in selectedItems"
            :key="item.key"
            v-tooltip="{ content: itemTooltip(item), placement: 'top' }"
            role="option"
            tabindex="0"
            class="ui-transfer-box__item ui-transfer-box__item--target"
            :class="{
              'is-active': activeTargetKey === item.key,
              'is-drop-before': dragOverTargetIndex === index,
              'is-drop-after': dragOverTargetIndex === selectedItems.length && index === selectedItems.length - 1,
            }"
            draggable="true"
            @click="activeTargetKey = item.key"
            @keydown.enter.prevent="activeTargetKey = item.key"
            @dragstart="handleTargetDragStart($event, item)"
            @dragover.stop="handleTargetItemDragOver($event, index)"
            @drop.stop="handleTargetItemDrop($event, index)"
            @dragend="clearDragState"
          >
            <span class="ui-transfer-box__order">{{ index + 1 }}</span>
            <span class="ui-transfer-box__item-main">
              <span class="ui-transfer-box__item-label">{{ item.label }}</span>
            </span>
            <span v-if="item.locked" class="ui-transfer-box__pill">常驻</span>
            <span class="ui-transfer-box__inline-actions">
              <button type="button" :disabled="index === 0" title="上移" @click.stop="moveItem(item.key, -1)">↑</button>
              <button type="button" :disabled="index === selectedItems.length - 1" title="下移" @click.stop="moveItem(item.key, 1)">↓</button>
              <button type="button" :disabled="item.locked" title="移除" @click.stop="removeItem(item.key)">×</button>
            </span>
          </div>
          <div v-if="!selectedItems.length" class="ui-transfer-box__empty">{{ targetEmptyText }}</div>
        </div>
      </UiScrollbar>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.ui-transfer-box {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px minmax(0, 1fr);
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-lg);
  background: color-mix(in srgb, var(--ui-surface-panel) 92%, var(--ui-surface-overlay));
}

.ui-transfer-box__panel {
  min-width: 0;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 94%, var(--ui-surface-panel));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent);
  overflow: hidden;
  transition:
    border-color var(--ui-motion-duration-fast) var(--ui-motion-ease-standard),
    box-shadow var(--ui-motion-duration-fast) var(--ui-motion-ease-standard);

  &.is-drop-target {
    border-color: color-mix(in srgb, var(--primary-color) 48%, var(--ui-border-subtle));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
      0 0 0 2px color-mix(in srgb, var(--primary-color) 12%, transparent);
  }
}

.ui-transfer-box__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-surface-panel) 88%, var(--ui-surface-overlay));
  color: var(--ui-text-primary);
  font-size: 13px;
  font-weight: 700;

  strong {
    color: var(--ui-text-muted);
    font-size: 12px;
    font-weight: 700;
  }
}

.ui-transfer-box__list {
  height: 292px;
  min-width: 0;
  background: color-mix(in srgb, var(--ui-surface-panel-muted) 82%, transparent);
}

.ui-transfer-box__list-inner {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}

.ui-transfer-box__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 52px;
  padding: 8px 10px;
  border: var(--ui-border-width-thin) solid transparent;
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--ui-surface-panel) 72%, transparent);
  color: var(--ui-text-primary);
  text-align: left;
  cursor: pointer;
  user-select: none;
  transition:
    background var(--ui-motion-duration-fast) var(--ui-motion-ease-standard),
    border-color var(--ui-motion-duration-fast) var(--ui-motion-ease-standard),
    transform var(--ui-motion-duration-fast) var(--ui-motion-ease-standard);

  &:hover:not(:disabled) {
    background: var(--ui-button-ghost-hover-bg);
  }

  &.is-active {
    border-color: color-mix(in srgb, var(--primary-color) 42%, var(--ui-border-subtle));
    background: color-mix(in srgb, var(--primary-color) 10%, var(--ui-surface-panel));
  }

  &.is-selected {
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &[draggable="true"] {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }
}

.ui-transfer-box__item--target {
  display: grid;
  grid-template-columns: 22px minmax(64px, 108px) 48px max-content;
  align-items: center;
  column-gap: 8px;
  justify-content: start;
  min-height: 48px;

  .ui-transfer-box__pill {
    grid-column: 3;
    justify-self: end;
    max-width: 100%;
  }

  .ui-transfer-box__inline-actions {
    grid-column: 4;
  }

  &.is-drop-before::before,
  &.is-drop-after::after {
    content: "";
    position: absolute;
    left: 8px;
    right: 8px;
    height: 2px;
    border-radius: 999px;
    background: var(--primary-color);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 16%, transparent);
    pointer-events: none;
  }

  &.is-drop-before::before {
    top: -4px;
  }

  &.is-drop-after::after {
    bottom: -4px;
  }
}

.ui-transfer-box__item-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.ui-transfer-box__item-label {
  overflow: hidden;
  color: var(--ui-text-primary);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-transfer-box__item-desc {
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

.ui-transfer-box__pill {
  flex: 0 0 auto;
  max-width: 56px;
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-transfer-box__pill--muted {
  background: color-mix(in srgb, var(--ui-text-muted) 10%, transparent);
  color: var(--ui-text-muted);
}

.ui-transfer-box__actions {
  display: flex;
  align-self: center;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 8px 0;
}

.ui-transfer-box__order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--ui-tabs-active-bg);
  color: var(--ui-text-primary);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.ui-transfer-box__inline-actions {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 4px;

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
    border-radius: var(--ui-radius-xs);
    background: var(--ui-surface-panel);
    color: var(--ui-text-secondary);
    cursor: pointer;

    &:hover:not(:disabled) {
      color: var(--ui-text-primary);
      border-color: color-mix(in srgb, var(--primary-color) 34%, var(--ui-border-subtle));
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ui-surface-panel));
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.38;
    }
  }
}

.ui-transfer-box__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: var(--ui-text-muted);
  font-size: 13px;
}

@media (max-width: 860px) {
  .ui-transfer-box {
    grid-template-columns: minmax(0, 1fr);
  }

  .ui-transfer-box__actions {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .ui-transfer-box__list-inner {
    min-width: 280px;
  }

  .ui-transfer-box__panel--target .ui-transfer-box__list-inner {
    min-width: 340px;
  }
}
</style>
