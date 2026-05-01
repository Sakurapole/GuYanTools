<script setup lang="ts">
import { computed, ref, watch } from 'vue';

defineOptions({ name: 'FtpTransferTreeNode' });

type FtpTransferTreeNodeView = {
  name: string;
  relativePath: string;
  kind: 'directory' | 'file' | string;
  size: number;
  transferredSize: number;
  status: 'pending' | 'transferring' | 'completed' | 'failed' | string;
  children: FtpTransferTreeNodeView[];
};

const props = defineProps<{
  node: FtpTransferTreeNodeView;
  level?: number;
  formatSize: (size: number) => string;
}>();

const expanded = ref(false);

const hasChildren = computed(() => props.node.children.length > 0);
const progressPercent = computed(() => {
  if (props.node.size <= 0) return props.node.status === 'completed' ? 100 : 0;
  return Math.max(0, Math.min(100, (props.node.transferredSize / props.node.size) * 100));
});
const sortedChildren = computed(() =>
  [...props.node.children].sort((left, right) => {
    const leftIsDirectory = left.kind === 'directory';
    const rightIsDirectory = right.kind === 'directory';
    if (leftIsDirectory !== rightIsDirectory) return leftIsDirectory ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
  }),
);

watch(
  () => props.node.relativePath,
  () => {
    expanded.value = false;
  },
);

function toggleExpanded() {
  if (!hasChildren.value) return;
  expanded.value = !expanded.value;
}
</script>

<template>
  <div
    class="ftp-task-tree-node"
    :class="[
      `ftp-task-tree-node--${node.status}`,
      { 'ftp-task-tree-node--root': (level ?? 0) === 0 },
    ]"
    :style="{ '--ftp-task-tree-level': level ?? 0 }"
  >
    <div
      class="ftp-task-tree-node__row"
      :class="{ 'ftp-task-tree-node__row--expandable': hasChildren }"
      :role="hasChildren ? 'button' : undefined"
      :tabindex="hasChildren ? 0 : undefined"
      :aria-expanded="hasChildren ? expanded : undefined"
      @click="toggleExpanded"
      @keydown.enter.prevent="toggleExpanded"
      @keydown.space.prevent="toggleExpanded"
    >
      <span
        class="ftp-task-tree-node__toggle"
        :class="{
          'ftp-task-tree-node__toggle--hidden': !hasChildren,
          'ftp-task-tree-node__toggle--expanded': expanded,
        }"
        aria-hidden="true"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5.5 3.8 9.7 8l-4.2 4.2" />
        </svg>
      </span>
      <span class="ftp-task-tree-node__glyph" :class="`ftp-task-tree-node__glyph--${node.kind}`">
        <svg v-if="node.kind === 'directory'" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.8 4.2h4l1.2 1.4h7.2v6.2a1.2 1.2 0 0 1-1.2 1.2H3a1.2 1.2 0 0 1-1.2-1.2z" />
        </svg>
        <svg v-else viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 2h5l3 3v9H4z" />
          <path d="M9 2v3h3" />
        </svg>
      </span>
      <span class="ftp-task-tree-node__name" :title="node.relativePath">{{ node.name }}</span>
      <span class="ftp-task-tree-node__progress" :title="`${Math.round(progressPercent)}%`">
        <span class="ftp-task-tree-node__progress-fill" :style="{ width: `${progressPercent}%` }" />
      </span>
      <span class="ftp-task-tree-node__meta">
        {{ formatSize(node.transferredSize) }} / {{ formatSize(node.size) }}
      </span>
      <span class="ftp-task-tree-node__status">{{ node.status === 'completed' ? '完成' : node.status === 'transferring' ? '传输中' : node.status === 'failed' ? '失败' : '等待' }}</span>
    </div>
    <div v-if="hasChildren && expanded" class="ftp-task-tree-node__children">
      <FtpTransferTreeNode
        v-for="child in sortedChildren"
        :key="child.relativePath"
        :node="child"
        :level="(level ?? 0) + 1"
        :format-size="formatSize"
      />
    </div>
  </div>
</template>
