<script setup lang="ts">
import { computed, ref, inject } from 'vue';
import { useTodoStore, type SmartListType } from '@/windows/main/stores/todo_store';
import { useTodoListStore } from '@/windows/main/stores/todo_list_store';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { resolveTodoAreaBackground, useTodoSettings } from '@/windows/main/composables/useTodoSettings';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import TodoBackground from './TodoBackground.vue';
import TodoSearch from './TodoSearch.vue';
import IconPicker from '@/windows/main/components/ui/IconPicker.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import { buildBackgroundTextVars } from '@/windows/main/utils/backgroundTextColor';
import type { TodoList } from '@/contracts/todo';

const todoStore = useTodoStore();
const listStore = useTodoListStore();
const { sidebarBg, isSidebarCollapsed } = useTodoSettings();
const appConfigStore = useAppConfigStore();
const activeSidebarBg = computed(() => resolveTodoAreaBackground(sidebarBg.value, appConfigStore.config.appearance.theme));
const sidebarTextStyle = computed(() => buildBackgroundTextVars(activeSidebarBg.value.backgroundStyle?.textColor, {
  aliases: {
    primary: ['--ui-text-primary'],
    secondary: ['--ui-text-secondary'],
    muted: ['--ui-text-muted'],
    subtle: ['--ui-text-subtle'],
  },
}));
const openBgPicker = inject<Function>('openTodoBgPicker');
const { open: openMenu } = useContextMenu();
const { show: showConfirm } = useConfirmDialog();

function handleContextMenu(e: MouseEvent) {
  openMenu(e.clientX, e.clientY, [
    {
      id: 'sidebar-bg',
      label: '侧边栏个性化配置',
      action: () => openBgPicker && openBgPicker('sidebar'),
    },
    {
      id: 'sidebar-item-bg',
      label: '侧边栏项个性化配置',
      action: () => openBgPicker && openBgPicker('sidebar-item'),
    }
  ]);
}
const newListName = ref('');
const showNewListInput = ref(false);
const showIconPicker = ref(false);
const iconPickerValue = ref('');
const iconPickerList = ref<TodoList | null>(null);

const smartLists: { id: SmartListType; icon: string; label: string }[] = [
  { id: 'my-day', icon: 'iconify:lucide:sun', label: '我的一天' },
  { id: 'important', icon: 'iconify:lucide:star', label: '重要' },
  { id: 'planned', icon: 'iconify:lucide:calendar', label: '已计划' },
  { id: 'all', icon: 'iconify:lucide:list-checks', label: '全部' },
  { id: 'completed', icon: 'iconify:lucide:square-check-big', label: '已完成' },
];

function handleSmartListClick(id: SmartListType) {
  todoStore.switchView(id);
}

function handleUserListClick(listId: string) {
  todoStore.switchView(listId);
}

async function confirmDeleteAll(viewId: SmartListType | string, label: string, keepList = false) {
  const ok = await showConfirm({
    title: '删除全部',
    message: keepList
      ? `确定要删除列表「${label}」中的全部任务吗？列表会保留，但其中的任务会被彻底删除，此操作不可撤销。`
      : `确定要删除「${label}」中的全部任务吗？这些任务会被彻底删除，而不是仅从该视图移除，此操作不可撤销。`,
    confirmText: '删除全部',
    danger: true,
  });

  if (!ok) return;
  await todoStore.deleteAllTodosInView(viewId);
}

async function createNewList() {
  const name = newListName.value.trim();
  if (!name) return;
  await listStore.createList(name);
  newListName.value = '';
  showNewListInput.value = false;
}

function handleNewListKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') createNewList();
  if (e.key === 'Escape') {
    showNewListInput.value = false;
    newListName.value = '';
  }
}

function handleSmartListContextMenu(e: MouseEvent, item: { id: SmartListType; label: string }) {
  openMenu(e.clientX, e.clientY, [
    {
      id: 'sidebar-bg',
      label: '侧边栏个性化配置',
      action: () => openBgPicker && openBgPicker('sidebar'),
    },
    {
      id: 'sidebar-item-bg',
      label: '侧边栏项个性化配置',
      action: () => openBgPicker && openBgPicker('sidebar-item'),
    },
    {
      id: `delete-all-${item.id}`,
      label: '删除全部',
      danger: true,
      divided: true,
      disabled: todoStore.smartListCounts[item.id] === 0,
      action: async () => {
        await confirmDeleteAll(item.id, item.label);
      },
    },
  ]);
}

function openListIconPicker(list: TodoList) {
  iconPickerList.value = list;
  iconPickerValue.value = list.icon || 'list';
  showIconPicker.value = true;
}

async function handleListIconChange(icon: string) {
  const list = iconPickerList.value;
  if (!list) return;
  iconPickerValue.value = icon;
  await listStore.updateList(list.id, { icon: icon || 'list' });
}

function handleIconPickerClose() {
  showIconPicker.value = false;
  iconPickerList.value = null;
}

function handleListContextMenu(e: MouseEvent, list: TodoList) {
  openMenu(e.clientX, e.clientY, [
    {
      id: 'custom-list-icon',
      label: '配置图标',
      action: () => openListIconPicker(list),
    },
    {
      id: 'sidebar-bg',
      label: '侧边栏个性化配置',
      action: () => openBgPicker && openBgPicker('sidebar'),
    },
    {
      id: 'sidebar-item-bg',
      label: '侧边栏项个性化配置',
      action: () => openBgPicker && openBgPicker('sidebar-item'),
    },
    {
      id: 'delete-all-todos',
      label: '删除全部',
      divided: true,
      danger: true,
      action: async () => {
        await confirmDeleteAll(list.id, list.name, true);
      },
    },
    {
      id: 'delete-list',
      label: '删除列表',
      danger: true,
      divided: true,
      action: async () => {
        const ok = await showConfirm({
          title: '删除列表',
          message: `确定要删除列表「${list.name}」吗？列表中的所有任务也会被删除，此操作不可撤销。`,
          confirmText: '删除',
          danger: true,
        });
        if (ok) {
          await listStore.deleteList(list.id);
          if (todoStore.currentView === list.id) {
            todoStore.switchView('my-day');
          }
        }
      },
    },
  ]);
}
</script>

<template>
  <aside class="todo-sidebar" :class="{ 'collapsed': isSidebarCollapsed }" :style="sidebarTextStyle" @contextmenu.prevent.stop="handleContextMenu">
    <TodoBackground :config="activeSidebarBg" />
    <div class="sidebar-content" style="position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%;">
      <div class="sidebar-header">
        <h2 v-if="!isSidebarCollapsed">Todo</h2>
        <UiIconButton
          v-tooltip="{
            content: isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏',
            placement: isSidebarCollapsed ? 'right' : 'bottom',
            delay: 400,
          }"
          class="collapse-btn"
          size="sm"
          variant="ghost"
          :title="isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
          @click="isSidebarCollapsed = !isSidebarCollapsed"
        >
          <IconRenderer icon="iconify:lucide:chevron-left" :size="18" :class="{ 'collapse-icon-rotated': isSidebarCollapsed }" class="collapse-icon" />
        </UiIconButton>
      </div>

      <!-- 搜索框 -->
      <TodoSearch v-if="!isSidebarCollapsed" />

    <UiScrollbar :x="false" :size="6" class="sidebar-scroll-area">
    <nav class="smart-lists">
      <UiButton
        v-for="item in smartLists"
        :key="item.id"
        v-tooltip="{ content: item.label, placement: 'right', disabled: !isSidebarCollapsed, block: true }"
        class="nav-item"
        variant="ghost"
        type="button"
        :class="{ active: todoStore.currentView === item.id }" @click="handleSmartListClick(item.id)"
        @contextmenu.prevent.stop="handleSmartListContextMenu($event, item)"
      >
        <span class="nav-icon">
          <IconRenderer :icon="item.icon" :size="20" />
        </span>
        <span class="nav-label">{{ item.label }}</span>
        <span v-if="todoStore.smartListCounts[item.id] > 0" class="nav-badge">{{ todoStore.smartListCounts[item.id] }}</span>
      </UiButton>
    </nav>

    <div class="divider" />

    <nav class="user-lists">
      <UiButton
        v-for="list in listStore.lists"
        :key="list.id"
        v-tooltip="{ content: list.name, placement: 'right', disabled: !isSidebarCollapsed, block: true }"
        class="nav-item"
        variant="ghost"
        type="button"
        :class="{ active: todoStore.currentView === list.id }" @click="handleUserListClick(list.id)"
        @contextmenu.prevent.stop="handleListContextMenu($event, list)"
      >
        <span class="nav-icon">
          <IconRenderer :icon="list.icon || 'list'" :size="20" />
        </span>
        <span class="nav-label">{{ list.name }}</span>
        <span class="nav-badge" v-if="list.incompleteCount > 0">{{ list.incompleteCount }}</span>
      </UiButton>
    </nav>
    </UiScrollbar>

    <div class="sidebar-footer">
      <template v-if="showNewListInput">
        <UiInput
          v-model="newListName"
          class="new-list-input"
          placeholder="输入列表名称..."
          size="sm"
          @keydown="handleNewListKeydown"
          @blur="() => { if (!newListName.trim()) showNewListInput = false }"
          autofocus
        />
      </template>
      <UiButton
        v-else
        v-tooltip="{ content: '新建列表', placement: 'right', disabled: !isSidebarCollapsed, block: true }"
        class="add-list-btn"
        variant="ghost"
        type="button"
        @click="showNewListInput = true"
      >
        <span class="nav-icon">
          <IconRenderer icon="iconify:lucide:plus" :size="20" />
        </span>
        <span class="nav-label">新建列表</span>
      </UiButton>
    </div>
    </div>
  </aside>

  <IconPicker
    v-model="iconPickerValue"
    :visible="showIconPicker"
    @update:modelValue="handleListIconChange"
    @close="handleIconPickerClose"
  />
</template>

<style scoped>
.todo-sidebar {
  width: 260px;
  min-width: 220px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 16px;
  box-shadow: var(--todo-panel-shadow);
  overflow: hidden;
  box-sizing: border-box;
  position: relative;
  transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), min-width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.todo-sidebar.collapsed {
  width: 68px;
  min-width: 68px;
}

.todo-sidebar.collapsed .nav-label,
.todo-sidebar.collapsed .nav-badge {
  display: none;
}

.todo-sidebar.collapsed .sidebar-header h2 {
  display: none;
}

.todo-sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 10px 0;
  gap: 0;
}

.todo-sidebar.collapsed .nav-icon {
  margin: 0 auto;
}

.todo-sidebar.collapsed .add-list-btn {
  justify-content: center;
  gap: 0;
}

.todo-sidebar.collapsed .sidebar-header {
  justify-content: center;
  padding: 16px 8px 8px;
}


.todo-sidebar.collapsed .smart-lists,
.todo-sidebar.collapsed .user-lists {
  padding: 0 4px;
}

.todo-sidebar.collapsed .divider {
  margin: 8px 8px;
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sidebar-scroll-area {
  flex: 1;
  min-height: 0;
}

.sidebar-header {
  padding: 20px 16px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.collapse-btn.ui-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 0;
  border-radius: var(--ui-radius-sm, 6px);
  transition: all 0.2s ease;
  flex-shrink: 0;
  transform: none;
}
.collapse-btn.ui-icon-button:hover:not(:disabled) {
  background: var(--ui-button-ghost-hover-bg);
  color: var(--ui-text-primary);
  transform: scale(1.08);
}
.collapse-btn.ui-icon-button:active:not(:disabled) {
  transform: scale(0.95);
}
.collapse-icon {
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.collapse-icon-rotated {
  transform: rotate(180deg);
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.3em;
  font-weight: 700;
  background: linear-gradient(135deg, var(--ui-text-primary), var(--ui-text-secondary));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.smart-lists,
.user-lists {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.nav-item,
.add-list-btn {
  position: relative;
  background: transparent;
  isolation: isolate;
  overflow: hidden;
}

.nav-item.ui-button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9em;
  color: var(--ui-text-primary);
  transition: background 0.15s, transform 0.1s;
  text-align: left;
  width: 100%;
  font-weight: inherit;
  white-space: normal;
  transform: none;
}

.nav-item::before,
.add-list-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: var(--todo-sidebar-item-surface-bg, transparent);
  opacity: var(--todo-sidebar-item-surface-opacity, 1);
  backdrop-filter: var(--todo-sidebar-item-backdrop-filter, none);
  -webkit-backdrop-filter: var(--todo-sidebar-item-backdrop-filter, none);
  pointer-events: none;
  transition:
    background 0.22s ease,
    opacity 0.22s ease,
    backdrop-filter 0.22s ease;
}

.nav-item.ui-button:hover:not(:disabled) {
  background: var(--ui-button-ghost-hover-bg);
  transform: none;
}

.nav-item.active {
  background: var(--ui-tabs-active-bg);
  color: var(--ui-input-focus-border);
  font-weight: 600;
}

.nav-item > *,
.add-list-btn > * {
  position: relative;
  z-index: 1;
}

.nav-item :deep(.ui-button__label),
.add-list-btn :deep(.ui-button__label) {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: inherit;
  width: 100%;
  min-width: 0;
}

.nav-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: inherit;
  line-height: 0;
}

.nav-icon :deep(svg) {
  display: block;
  width: 20px;
  height: 20px;
}

.nav-label {
  display: flex;
  align-items: center;
  flex: 1;
  min-height: 20px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-badge {
  font-size: 0.75em;
  background: var(--ui-tabs-active-bg);
  color: var(--ui-input-focus-border);
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.divider {
  height: 1px;
  background: var(--ui-border-subtle);
  margin: 8px 16px;
}

.sidebar-footer {
  padding: 8px;
  margin-top: auto;
}

.add-list-btn.ui-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  width: 100%;
  border: 1.5px dashed transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--ui-input-focus-border);
  font-size: 0.9em;
  transition: all 0.2s ease;
  font-weight: inherit;
  white-space: normal;
  transform: none;
}

.add-list-btn.ui-button:hover:not(:disabled) {
  background: var(--todo-accent-bg-soft);
  border-color: var(--ui-border-accent-soft);
  transform: none;
}

.new-list-input {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid var(--ui-input-focus-border);
  border-radius: 8px;
  font-size: 0.88em;
  outline: none;
  background: var(--ui-input-bg);
  color: var(--ui-text-primary);
  box-sizing: border-box;
  box-shadow: 0 0 0 3px var(--todo-accent-ring);
  animation: list-input-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.new-list-input:focus {
  box-shadow: 0 0 0 3px var(--todo-accent-ring);
}
.new-list-input::placeholder {
  color: var(--ui-input-placeholder);
}

@keyframes list-input-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
