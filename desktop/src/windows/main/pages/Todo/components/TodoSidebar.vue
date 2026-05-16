<script setup lang="ts">
import { computed, ref, inject } from 'vue';
import { useTodoStore, type SmartListType } from '@/windows/main/stores/todo_store';
import { useTodoListStore } from '@/windows/main/stores/todo_list_store';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { useTodoSettings } from '@/windows/main/composables/useTodoSettings';
import TodoBackground from './TodoBackground.vue';
import TodoSearch from './TodoSearch.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import { buildBackgroundTextVars } from '@/windows/main/utils/backgroundTextColor';

const todoStore = useTodoStore();
const listStore = useTodoListStore();
const { sidebarBg, isSidebarCollapsed } = useTodoSettings();
const sidebarTextStyle = computed(() => buildBackgroundTextVars(sidebarBg.value.backgroundStyle?.textColor, {
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
    }
  ]);
}
const newListName = ref('');
const showNewListInput = ref(false);

const smartLists: { id: SmartListType; svgIcon: string; label: string }[] = [
  { id: 'my-day', svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`, label: '我的一天' },
  { id: 'important', svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`, label: '重要' },
  { id: 'planned', svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`, label: '已计划' },
  { id: 'all', svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`, label: '全部' },
  { id: 'completed', svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, label: '已完成' },
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
      id: `delete-all-${item.id}`,
      label: '删除全部',
      danger: true,
      disabled: todoStore.smartListCounts[item.id] === 0,
      action: async () => {
        await confirmDeleteAll(item.id, item.label);
      },
    },
  ]);
}

function handleListContextMenu(e: MouseEvent, list: { id: string; name: string }) {
  openMenu(e.clientX, e.clientY, [
    {
      id: 'delete-all-todos',
      label: '删除全部',
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
    <TodoBackground :config="sidebarBg" />
    <div class="sidebar-content" style="position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%;">
      <div class="sidebar-header">
        <h2 v-if="!isSidebarCollapsed">Todo</h2>
        <button
          v-tooltip="{
            content: isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏',
            placement: isSidebarCollapsed ? 'right' : 'bottom',
            delay: 400,
          }"
          class="collapse-btn"
          @click="isSidebarCollapsed = !isSidebarCollapsed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            :class="{ 'collapse-icon-rotated': isSidebarCollapsed }" class="collapse-icon">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </div>

      <!-- 搜索框 -->
      <TodoSearch v-if="!isSidebarCollapsed" />

    <UiScrollbar :x="false" :size="6" class="sidebar-scroll-area">
    <nav class="smart-lists">
      <button
        v-for="item in smartLists"
        :key="item.id"
        v-tooltip="{ content: item.label, placement: 'right', disabled: !isSidebarCollapsed, block: true }"
        class="nav-item"
        :class="{ active: todoStore.currentView === item.id }" @click="handleSmartListClick(item.id)"
        @contextmenu.prevent.stop="handleSmartListContextMenu($event, item)"
      >
        <span class="nav-icon" v-html="item.svgIcon"></span>
        <span class="nav-label">{{ item.label }}</span>
        <span v-if="todoStore.smartListCounts[item.id] > 0" class="nav-badge">{{ todoStore.smartListCounts[item.id] }}</span>
      </button>
    </nav>

    <div class="divider" />

    <nav class="user-lists">
      <button
        v-for="list in listStore.lists"
        :key="list.id"
        v-tooltip="{ content: list.name, placement: 'right', disabled: !isSidebarCollapsed, block: true }"
        class="nav-item"
        :class="{ active: todoStore.currentView === list.id }" @click="handleUserListClick(list.id)"
        @contextmenu.prevent.stop="handleListContextMenu($event, list)"
      >
        <span class="nav-icon" v-html="`<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z'/><polyline points='14 2 14 8 20 8'/></svg>`"></span>
        <span class="nav-label">{{ list.name }}</span>
        <span class="nav-badge" v-if="list.incompleteCount > 0">{{ list.incompleteCount }}</span>
      </button>
    </nav>
    </UiScrollbar>

    <div class="sidebar-footer">
      <template v-if="showNewListInput">
        <input v-model="newListName" class="new-list-input" placeholder="输入列表名称..." @keydown="handleNewListKeydown"
          @blur="() => { if (!newListName.trim()) showNewListInput = false }" autofocus />
      </template>
      <button
        v-else
        v-tooltip="{ content: '新建列表', placement: 'right', disabled: !isSidebarCollapsed, block: true }"
        class="add-list-btn"
        @click="showNewListInput = true"
      >
        <span class="nav-icon" v-html="`<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='12' x2='12' y1='5' y2='19'/><line x1='5' x2='19' y1='12' y2='12'/></svg>`"></span>
        <span class="nav-label">新建列表</span>
      </button>
    </div>
    </div>
  </aside>
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

.collapse-btn {
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
}
.collapse-btn:hover {
  background: var(--ui-button-ghost-hover-bg);
  color: var(--ui-text-primary);
  transform: scale(1.08);
}
.collapse-btn:active {
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

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9em;
  color: var(--ui-text-primary);
  transition: background 0.15s, transform 0.1s;
  text-align: left;
  width: 100%;
}

.nav-item:hover {
  background: var(--ui-button-ghost-hover-bg);
}

.nav-item.active {
  background: var(--ui-tabs-active-bg);
  color: var(--ui-input-focus-border);
  font-weight: 600;
}

.nav-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: inherit;
}

.nav-label {
  flex: 1;
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

.add-list-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  width: 100%;
  border: 1.5px dashed transparent;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--ui-input-focus-border);
  font-size: 0.9em;
  transition: all 0.2s ease;
}

.add-list-btn:hover {
  background: var(--todo-accent-bg-soft);
  border-color: var(--ui-border-accent-soft);
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
