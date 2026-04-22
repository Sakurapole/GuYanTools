<script setup lang="ts">
import { ref } from 'vue';
import UiTreeNodeItem from './UiTreeNodeItem.vue';
import type { UiTreeDropPayload, UiTreeEventPayload, UiTreeNodeData } from './ui_tree';

const props = withDefaults(defineProps<{
  nodes: UiTreeNodeData[];
  selectedId?: string;
  expandedIds?: string[];
  emptyText?: string;
  indentSize?: number;
}>(), {
  selectedId: '',
  expandedIds: () => [],
  emptyText: '暂无内容',
  indentSize: 16,
});

const emit = defineEmits<{
  'update:expandedIds': [ids: string[]];
  select: [node: UiTreeNodeData];
  activate: [node: UiTreeNodeData];
  contextmenu: [payload: UiTreeEventPayload];
  drop: [payload: UiTreeDropPayload];
}>();

const draggedNode = ref<UiTreeNodeData | null>(null);

function toggleNode(node: UiTreeNodeData) {
  const current = new Set(props.expandedIds);
  if (current.has(node.id)) {
    current.delete(node.id);
  } else {
    current.add(node.id);
  }

  emit('update:expandedIds', Array.from(current));
}

function handleDragStart(node: UiTreeNodeData) {
  draggedNode.value = node;
}

function handleDrop(payload: { event: DragEvent; node: UiTreeNodeData }) {
  if (!draggedNode.value || draggedNode.value.id === payload.node.id) {
    return;
  }
  emit('drop', {
    event: payload.event,
    node: payload.node,
    draggedNode: draggedNode.value,
  });
  draggedNode.value = null;
}
</script>

<template>
  <div class="ui-tree" role="tree">
    <template v-if="nodes.length">
      <UiTreeNodeItem
        v-for="node in nodes"
        :key="node.id"
        :node="node"
        :level="0"
        :indent-size="indentSize"
        :expanded-ids="expandedIds"
        :selected-id="selectedId"
        @toggle="toggleNode"
        @select="emit('select', $event)"
        @activate="emit('activate', $event)"
        @contextmenu="emit('contextmenu', $event)"
        @dragstart="handleDragStart"
        @drop="handleDrop"
      />
    </template>
    <div v-else class="ui-tree__empty">
      {{ emptyText }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ui-tree {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.ui-tree__empty {
  padding: 18px 12px;
  color: var(--ui-text-muted);
  font-size: 0.8rem;
  text-align: center;
}
</style>
