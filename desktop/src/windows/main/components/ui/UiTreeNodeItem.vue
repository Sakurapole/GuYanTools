<script setup lang="ts">
import { computed, ref } from 'vue';
import type { UiTreeEventPayload, UiTreeNodeData } from './ui_tree';

defineOptions({ name: 'UiTreeNodeItem' });

const props = withDefaults(defineProps<{
  node: UiTreeNodeData;
  level?: number;
  indentSize?: number;
  expandedIds?: string[];
  selectedId?: string;
}>(), {
  level: 0,
  indentSize: 16,
  expandedIds: () => [],
  selectedId: '',
});

const emit = defineEmits<{
  toggle: [node: UiTreeNodeData];
  select: [node: UiTreeNodeData];
  activate: [node: UiTreeNodeData];
  contextmenu: [payload: UiTreeEventPayload];
  dragstart: [node: UiTreeNodeData];
  drop: [payload: { event: DragEvent; node: UiTreeNodeData; position: 'before' | 'inside' | 'after' }];
}>();

const hasChildren = computed(() => Boolean(props.node.children?.length));
const expanded = computed(() => props.expandedIds.includes(props.node.id));
const selected = computed(() => props.selectedId === props.node.id);
const dropPosition = ref<'before' | 'inside' | 'after' | ''>('');
const nodeClass = computed(() => [
  'ui-tree-node',
  props.node.kind ? `ui-tree-node--${props.node.kind}` : '',
]);
const rowStyle = computed(() => ({
  paddingLeft: `${12 + props.level * props.indentSize}px`,
}));

function isSelectable(node: UiTreeNodeData) {
  if (typeof node.selectable === 'boolean') {
    return node.selectable;
  }

  return !node.children?.length;
}

function handleToggle(event: MouseEvent) {
  event.stopPropagation();
  if (!hasChildren.value || props.node.disabled) {
    return;
  }

  emit('toggle', props.node);
}

function handleRowClick() {
  if (props.node.disabled) {
    return;
  }

  if (hasChildren.value && !isSelectable(props.node)) {
    emit('toggle', props.node);
    return;
  }

  emit('select', props.node);
}

function handleRowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  handleRowClick();
}

function handleContextMenu(event: MouseEvent) {
  emit('contextmenu', { event, node: props.node });
}

function handleRowDoubleClick() {
  if (props.node.disabled || !isSelectable(props.node)) {
    return;
  }

  emit('activate', props.node);
}

function handleDragStart(event: DragEvent) {
  if (props.node.disabled) {
    event.preventDefault();
    return;
  }
  event.dataTransfer?.setData('text/plain', props.node.id);
  event.dataTransfer!.effectAllowed = 'move';
  emit('dragstart', props.node);
}

function resolveDropPosition(event: DragEvent) {
  const row = event.currentTarget as HTMLElement | null;
  if (!row) return 'inside';
  const rect = row.getBoundingClientRect();
  const offset = event.clientY - rect.top;
  if (offset < rect.height * 0.28) return 'before';
  if (offset > rect.height * 0.72) return 'after';
  return 'inside';
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  if (props.node.disabled) {
    dropPosition.value = '';
    return;
  }
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dropPosition.value = resolveDropPosition(event);
}

function clearDropPosition() {
  dropPosition.value = '';
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  const position = dropPosition.value || resolveDropPosition(event);
  clearDropPosition();
  if (props.node.disabled) {
    return;
  }
  emit('drop', { event, node: props.node, position });
}
</script>

<template>
  <div :class="nodeClass">
    <div class="ui-tree-node__row" :class="{
      'ui-tree-node__row--selected': selected,
      'ui-tree-node__row--disabled': node.disabled,
      [`ui-tree-node__row--drop-${dropPosition}`]: Boolean(dropPosition),
    }" :style="rowStyle" role="treeitem" :aria-expanded="hasChildren ? expanded : undefined" :aria-selected="selected"
      :draggable="!node.disabled" tabindex="0" @click="handleRowClick" @dblclick="handleRowDoubleClick"
      @keydown="handleRowKeydown" @contextmenu.prevent="handleContextMenu" @dragstart="handleDragStart"
      @dragover="handleDragOver" @dragleave="clearDropPosition" @dragend="clearDropPosition" @drop="handleDrop">
      <button class="ui-tree-node__toggle" :class="{
        'ui-tree-node__toggle--hidden': !hasChildren,
        'ui-tree-node__toggle--expanded': expanded,
      }" type="button" tabindex="-1" :disabled="!hasChildren || node.disabled" @click="handleToggle">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5.5 3.5L10.5 8L5.5 12.5" />
        </svg>
      </button>

      <span v-if="node.iconText" class="ui-tree-node__icon">
        {{ node.iconText }}
      </span>

      <span class="ui-tree-node__content">
        <span
          v-tooltip="{ content: node.tooltip, placement: 'right', delay: 450, block: true, disabled: !node.tooltip }"
          class="ui-tree-node__label"
        >{{ node.label }}</span>
        <span v-if="node.meta" class="ui-tree-node__meta">{{ node.meta }}</span>
      </span>

      <span v-if="node.badge" class="ui-tree-node__badge">{{ node.badge }}</span>
    </div>

    <TransitionGroup v-if="hasChildren && expanded" name="ui-tree-list" tag="div" class="ui-tree-node__children" role="group">
      <UiTreeNodeItem v-for="child in node.children" :key="child.id" :node="child" :level="level + 1"
        :indent-size="indentSize" :expanded-ids="expandedIds" :selected-id="selectedId" @toggle="emit('toggle', $event)"
        @select="emit('select', $event)" @activate="emit('activate', $event)" @contextmenu="emit('contextmenu', $event)"
        @dragstart="emit('dragstart', $event)" @drop="emit('drop', $event)" />
    </TransitionGroup>
  </div>
</template>

<style lang="scss" scoped>
.ui-tree-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ui-tree-node__row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;

  &:hover {
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }

  &--selected {
    border-color: color-mix(in srgb, var(--primary-color) 24%, var(--ui-border-subtle));
    background: color-mix(in srgb, var(--primary-color) 10%, var(--ui-surface-panel));
  }

  &--disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }

  &--drop-inside {
    border-color: color-mix(in srgb, var(--primary-color) 42%, var(--ui-border-subtle));
    background: color-mix(in srgb, var(--primary-color) 12%, var(--ui-surface-panel));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 24%, transparent);
  }

  &--drop-before,
  &--drop-after {
    border-color: transparent;
    background: color-mix(in srgb, var(--ui-surface-overlay) 86%, transparent);
  }

  &--drop-before {
    box-shadow: inset 0 2px 0 var(--primary-color);
    transform: translateY(1px);
  }

  &--drop-after {
    box-shadow: inset 0 -2px 0 var(--primary-color);
    transform: translateY(-1px);
  }
}

.ui-tree-node__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  flex: 0 0 auto;

  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
    transition: transform 0.16s ease;
  }

  &--expanded svg {
    transform: rotate(90deg);
  }

  &--hidden {
    visibility: hidden;
  }
}

.ui-tree-node__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--ui-radius-full);
  background: color-mix(in srgb, var(--ui-surface-overlay) 92%, transparent);
  color: var(--primary-color);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  flex: 0 0 auto;
}

.ui-tree-node__content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.ui-tree-node__label {
  min-width: 0;
  color: var(--ui-text-primary);
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ui-tree-node__meta {
  color: var(--ui-text-muted);
  font-size: 0.74rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ui-tree-node__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 8px;
  border-radius: var(--ui-radius-full);
  background: color-mix(in srgb, var(--ui-surface-overlay) 92%, transparent);
  color: var(--ui-text-secondary, var(--ui-text-primary));
  font-size: 0.68rem;
  font-weight: 700;
  flex: 0 0 auto;
}

.ui-tree-node__children {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ui-tree-list-move,
.ui-tree-list-enter-active,
.ui-tree-list-leave-active {
  transition:
    transform 0.18s var(--ui-motion-ease-emphasized),
    opacity 0.16s var(--ui-motion-ease-standard);
}

.ui-tree-list-enter-from,
.ui-tree-list-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .ui-tree-node__row,
  .ui-tree-list-move,
  .ui-tree-list-enter-active,
  .ui-tree-list-leave-active {
    transition: none;
    transform: none;
  }
}
</style>
