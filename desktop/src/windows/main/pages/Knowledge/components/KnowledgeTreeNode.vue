<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ContextMenuItem } from '@/windows/main/composables/useContextMenu';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import type { KnowledgeNode } from '@/contracts/knowledge';
import { useTextPromptDialog } from '@/windows/main/composables/useTextPromptDialog';
import { useKnowledgeStore } from '@/windows/main/stores/knowledge_store';

defineOptions({ name: 'KnowledgeTreeNode' });

const props = defineProps<{
  node: KnowledgeNode;
  level?: number;
}>();

const store = useKnowledgeStore();
const { open: openContextMenu } = useContextMenu();
const { show: showConfirm } = useConfirmDialog();
const { show: showTextPrompt } = useTextPromptDialog();
const expanded = ref(true);

const children = computed(() => store.childrenFor(props.node.id));
const isFolder = computed(() => props.node.nodeType === 'folder');
const isSelected = computed(() => store.selectedNodeId === props.node.id);
const isSystemInbox = computed(() => props.node.id === 'node-inbox');
const icon = computed(() => {
  if (props.node.icon) return `iconify:lucide:${props.node.icon}`;
  if (props.node.nodeType === 'quick_note') return 'iconify:lucide:sticky-note';
  if (props.node.nodeType === 'document') return 'iconify:lucide:file-search';
  return isFolder.value ? 'iconify:lucide:folder' : 'iconify:lucide:file-text';
});
const levelStyle = computed(() => ({
  '--knowledge-node-depth': String(props.level ?? 0),
}));

function handleClick() {
  if (isFolder.value) {
    expanded.value = !expanded.value;
  }
  store.selectNode(props.node.id);
}

async function createChildFolder() {
  const title = await showTextPrompt({
    title: '新建文件夹',
    label: '文件夹名称',
    initialValue: '新建文件夹',
    confirmText: '创建',
  });
  if (!title) return;
  await store.createFolder({
    parentId: props.node.id,
    title,
  });
  expanded.value = true;
}

async function createChildPage() {
  const title = await showTextPrompt({
    title: '新建 Markdown 页面',
    label: '页面标题',
    initialValue: '未命名页面',
    confirmText: '创建',
  });
  if (!title) return;
  await store.createMarkdownPage({
    parentId: props.node.id,
    title,
  });
  expanded.value = true;
}

async function createChildBlockPage() {
  const title = await showTextPrompt({
    title: '新建块页面',
    label: '页面标题',
    initialValue: '未命名块页面',
    confirmText: '创建',
  });
  if (!title) return;
  await store.createBlockPage({
    parentId: props.node.id,
    title,
  });
  expanded.value = true;
}

async function createChildCanvasPage() {
  const title = await showTextPrompt({
    title: '新建画布页面',
    label: '页面标题',
    initialValue: '未命名画布',
    confirmText: '创建',
  });
  if (!title) return;
  await store.createCanvasPage({
    parentId: props.node.id,
    title,
  });
  expanded.value = true;
}

async function renameNode() {
  const title = await showTextPrompt({
    title: '重命名',
    label: '节点名称',
    initialValue: props.node.title,
    confirmText: '保存',
  });
  if (!title || title === props.node.title) return;
  await store.renameNode(props.node.id, title);
}

async function archiveNode() {
  const ok = await showConfirm({
    title: '归档节点',
    message: `归档「${props.node.title}」后会从当前树中隐藏。`,
    confirmText: '归档',
    danger: true,
  });
  if (ok) {
    await store.archiveNode(props.node.id);
  }
}

async function deleteNode() {
  const ok = await showConfirm({
    title: '删除节点',
    message: `删除「${props.node.title}」会同时隐藏其子节点。`,
    confirmText: '删除',
    danger: true,
  });
  if (ok) {
    await store.deleteNode(props.node.id);
  }
}

function handleContextMenu(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  const items: ContextMenuItem[] = [
    {
      id: 'rename',
      label: '重命名',
      icon: IconRenderer,
      iconProps: { icon: 'iconify:lucide:pencil', size: 14 },
      disabled: isSystemInbox.value,
      action: renameNode,
    },
    {
      id: 'new-page',
      label: '新建 Markdown 页面',
      icon: IconRenderer,
      iconProps: { icon: 'iconify:lucide:file-plus-2', size: 14 },
      disabled: !isFolder.value,
      action: createChildPage,
    },
    {
      id: 'new-block-page',
      label: '新建块页面',
      icon: IconRenderer,
      iconProps: { icon: 'iconify:lucide:layout-template', size: 14 },
      disabled: !isFolder.value,
      action: createChildBlockPage,
    },
    {
      id: 'new-canvas-page',
      label: '新建画布页面',
      icon: IconRenderer,
      iconProps: { icon: 'iconify:lucide:layout-dashboard', size: 14 },
      disabled: !isFolder.value,
      action: createChildCanvasPage,
    },
    {
      id: 'new-folder',
      label: '新建文件夹',
      icon: IconRenderer,
      iconProps: { icon: 'iconify:lucide:folder-plus', size: 14 },
      disabled: !isFolder.value,
      action: createChildFolder,
    },
    {
      id: 'move-root',
      label: '移到空间根目录',
      icon: IconRenderer,
      iconProps: { icon: 'iconify:lucide:move-up', size: 14 },
      disabled: isSystemInbox.value || !props.node.parentId,
      divided: true,
      action: () => store.moveNodeToRoot(props.node.id),
    },
    {
      id: 'favorite',
      label: props.node.isFavorite ? '取消收藏' : '加入收藏',
      icon: IconRenderer,
      iconProps: { icon: 'iconify:lucide:star', size: 14 },
      action: () => store.toggleFavorite(props.node.id),
    },
    {
      id: 'archive',
      label: '归档',
      icon: IconRenderer,
      iconProps: { icon: 'iconify:lucide:archive', size: 14 },
      divided: true,
      danger: true,
      disabled: isSystemInbox.value,
      action: archiveNode,
    },
    {
      id: 'delete',
      label: '删除',
      icon: IconRenderer,
      iconProps: { icon: 'iconify:lucide:trash-2', size: 14 },
      danger: true,
      disabled: isSystemInbox.value,
      action: deleteNode,
    },
  ];

  openContextMenu(event.clientX, event.clientY, items);
}
</script>

<template>
  <div class="knowledge-node">
    <UiButton
      type="button"
      variant="ghost"
      size="sm"
      class="knowledge-node__row"
      :class="{ 'knowledge-node__row--selected': isSelected }"
      :style="levelStyle"
      :aria-current="isSelected ? 'page' : undefined"
      :aria-expanded="isFolder ? expanded : undefined"
      @click="handleClick"
      @contextmenu="handleContextMenu"
    >
      <span class="knowledge-node__toggle">
        <IconRenderer
          v-if="isFolder && children.length"
          :icon="expanded ? 'iconify:lucide:chevron-down' : 'iconify:lucide:chevron-right'"
          :size="14"
        />
      </span>
      <IconRenderer class="knowledge-node__icon" :icon="icon" :size="15" />
      <span class="knowledge-node__title">{{ node.title }}</span>
      <IconRenderer
        v-if="node.isFavorite"
        class="knowledge-node__favorite"
        icon="iconify:lucide:star"
        :size="13"
      />
    </UiButton>

    <div v-if="isFolder && expanded && children.length" class="knowledge-node__children">
      <KnowledgeTreeNode
        v-for="child in children"
        :key="child.id"
        :node="child"
        :level="(level ?? 0) + 1"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.knowledge-node {
  min-width: 0;
}

.knowledge-node__row {
  --knowledge-node-depth: 0;
  display: grid;
  grid-template-columns: 16px 18px minmax(0, 1fr) 16px;
  align-items: center;
  width: 100%;
  min-height: 30px;
  padding: 0 8px 0 calc(8px + var(--knowledge-node-depth) * 16px);
  border: 0;
  border-radius: 6px;
  color: var(--ui-text-primary);
  background: transparent;
  cursor: default;
  text-align: left;
  font-weight: inherit;
  line-height: normal;
  white-space: normal;
  box-shadow: none;
  transform: none;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.knowledge-node__row :deep(.ui-button__label) {
  display: contents;
}

.knowledge-node__row:hover,
.knowledge-node__row.ui-button:hover:not(:disabled),
.knowledge-node__row.ui-button--ghost:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-primary-color) 12%, transparent);
  color: var(--ui-text-primary);
  border-color: transparent;
  box-shadow: none;
  transform: none;
}

.knowledge-node__row--selected,
.knowledge-node__row--selected.ui-button--ghost:hover:not(:disabled) {
  color: var(--ui-primary-color);
  background: color-mix(in srgb, var(--ui-primary-color) 18%, transparent);
}

.knowledge-node__toggle,
.knowledge-node__icon,
.knowledge-node__favorite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.knowledge-node__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-font-size-sm);
}

.knowledge-node__favorite {
  color: #d8a628;
}
</style>
