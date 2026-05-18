<script setup lang="ts">
import { computed, ref, inject, onMounted, onBeforeUnmount } from 'vue';
import { useTodoStore, type SortBy } from '@/windows/main/stores/todo_store';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { resolveTodoAreaBackground, useTodoSettings } from '@/windows/main/composables/useTodoSettings';
import { useTodoListStore } from '@/windows/main/stores/todo_list_store';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import TodoItem from './TodoItem.vue';
import QuickAdd from './QuickAdd.vue';
import TodoBackground from './TodoBackground.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import { buildBackgroundTextVars } from '@/windows/main/utils/backgroundTextColor';

const todoStore = useTodoStore();
const listStore = useTodoListStore();
const { contentBg } = useTodoSettings();
const appConfigStore = useAppConfigStore();
const activeContentBg = computed(() => resolveTodoAreaBackground(contentBg.value, appConfigStore.config.appearance.theme));
const contentTextStyle = computed(() => buildBackgroundTextVars(activeContentBg.value.backgroundStyle?.textColor, {
  aliases: {
    primary: ['--ui-text-primary'],
    secondary: ['--ui-text-secondary'],
    muted: ['--ui-text-muted'],
    subtle: ['--ui-text-subtle'],
  },
}));
const openBgPicker = inject<Function>('openTodoBgPicker');
const { open: openMenu } = useContextMenu();

function handleContextMenu(e: MouseEvent) {
  // 只有点击空白区域时才弹背景菜单，不影响 TodoItem 内部的右键
  openMenu(e.clientX, e.clientY, [
    {
      id: 'content-bg',
      label: '内容区个性化配置',
      action: () => openBgPicker && openBgPicker('content'),
    }
  ]);
}

const viewTitle = computed(() => {
  const v = todoStore.currentView;
  const map: Record<string, string> = {
    'my-day': '☀️ 我的一天',
    'important': '⭐ 重要',
    'planned': '📅 已计划',
    'all': '📋 全部',
    'completed': '✅ 已完成',
  };
  if (map[v]) return map[v];
  // 用户自定义列表：查找列表名称
  const userList = listStore.lists.find(l => l.id === v);
  return userList ? `📄 ${userList.name}` : '📄 列表';
});

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

const dateStr = computed(() => {
  const d = new Date();
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${days[d.getDay()]}`;
});

// 排序
const showSortMenu = ref(false);
const sortMenuRef = ref<HTMLElement | null>(null);
const sortTriggerRef = ref<HTMLElement | null>(null);

const sortOptions: { label: string; value: SortBy }[] = [
  { label: '默认排序', value: 'default' },
  { label: '按重要性', value: 'importance' },
  { label: '按截止日期', value: 'dueDate' },
  { label: '按创建时间', value: 'createdDate' },
  { label: '按字母顺序', value: 'alphabetical' },
];

const currentSortLabel = computed(() => sortOptions.find(o => o.value === todoStore.sortBy)?.label ?? '默认排序');

function selectSort(value: SortBy) {
  todoStore.sortBy = value;
  showSortMenu.value = false;
}

function onSortClickOutside(e: MouseEvent) {
  if (!showSortMenu.value) return;
  const target = e.target as Node;
  if (sortMenuRef.value?.contains(target) || sortTriggerRef.value?.contains(target)) return;
  showSortMenu.value = false;
}

onMounted(() => document.addEventListener('mousedown', onSortClickOutside, true));
onBeforeUnmount(() => document.removeEventListener('mousedown', onSortClickOutside, true));
</script>

<template>
  <main class="todo-content" :style="contentTextStyle" @contextmenu.prevent.stop="handleContextMenu">
    <TodoBackground :config="activeContentBg" />
    <div class="content-inner" style="position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%;">
      <header class="content-header">
        <div class="header-info">
          <h1 class="view-title">{{ viewTitle }}</h1>
          <p v-if="todoStore.currentView === 'my-day'" class="view-subtitle">
            {{ greeting }} · {{ dateStr }}
          </p>
        </div>
        <div class="header-actions">
          <div class="sort-wrapper">
            <button ref="sortTriggerRef" class="sort-btn" @click="showSortMenu = !showSortMenu" :title="currentSortLabel">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>
              </svg>
              <span class="sort-label">{{ currentSortLabel }}</span>
            </button>
            <Transition name="ui-dropdown">
              <div v-if="showSortMenu" ref="sortMenuRef" class="sort-menu">
                <button v-for="opt in sortOptions" :key="opt.value" class="sort-option"
                  :class="{ active: todoStore.sortBy === opt.value }" @click="selectSort(opt.value)">
                  {{ opt.label }}
                  <svg v-if="todoStore.sortBy === opt.value" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </header>

      <UiScrollbar :x="false" :size="6" class="todo-list-area" v-if="!todoStore.loading">
        <div class="todo-list-inner">
        <TransitionGroup name="list" tag="div" class="todo-list">
          <TodoItem
            v-for="todo in todoStore.sortedIncompleteTodos"
            :key="todo.id"
            :todo="todo"
          />
        </TransitionGroup>

        <!-- 已完成视图：直接展示所有已完成任务 -->
        <TransitionGroup
          v-if="todoStore.currentView === 'completed'"
          name="list" tag="div" class="todo-list"
        >
          <TodoItem
            v-for="todo in todoStore.completedTodos"
            :key="todo.id"
            :todo="todo"
          />
        </TransitionGroup>

        <!-- 其他视图：已完成放在折叠区块内 -->
        <details v-else-if="todoStore.completedTodos.length > 0" class="completed-section">
          <summary class="completed-header">
            已完成 ({{ todoStore.completedTodos.length }})
          </summary>
          <TransitionGroup name="list" tag="div" class="todo-list">
            <TodoItem
              v-for="todo in todoStore.completedTodos"
              :key="todo.id"
              :todo="todo"
            />
          </TransitionGroup>
        </details>

        <div v-if="todoStore.todos.length === 0" class="empty-state">
          <p class="empty-emoji">📝</p>
          <p class="empty-text" v-if="todoStore.currentView === 'my-day'">今天的任务列表是空的</p>
          <p class="empty-text" v-else-if="todoStore.currentView === 'important'">标记重要的任务会出现在这里</p>
          <p class="empty-text" v-else-if="todoStore.currentView === 'planned'">设置了截止日期的任务会出现在这里</p>
          <p class="empty-text" v-else-if="todoStore.currentView === 'completed'">还没有完成的任务</p>
          <p class="empty-text" v-else>还没有任务，添加一些吧</p>
        </div>
        </div>
      </UiScrollbar>

      <div v-else class="loading">
        <span class="spinner"></span>
      </div>

      <QuickAdd v-if="todoStore.currentView !== 'completed'" />
    </div>
  </main>
</template>

<style scoped>
.todo-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 360px;
  overflow: hidden;
  position: relative;
  background: transparent;
  border-radius: 16px;
  box-shadow: var(--todo-panel-shadow);
  box-sizing: border-box;
}
.content-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 24px 12px;
  flex-shrink: 0;
}
.header-info { flex: 1; min-width: 0; }
.header-actions { flex-shrink: 0; padding-top: 4px; }
.view-title {
  margin: 0;
  font-size: 1.4em;
  font-weight: 700;
}
.view-subtitle {
  margin: 4px 0 0;
  font-size: 0.85em;
  opacity: 0.6;
}

/* 排序 */
.sort-wrapper { position: relative; }
.sort-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 0.78em;
  color: var(--ui-text-muted);
  transition: all 0.15s;
}
.sort-btn:hover {
  border-color: var(--ui-input-focus-border);
  color: var(--ui-input-focus-border);
}
.sort-label { white-space: nowrap; }
.sort-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 999;
  min-width: 150px;
  padding: 6px 0;
  background: var(--ui-surface-glass-strong, #fff);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 10px;
  box-shadow: var(--todo-popup-shadow);
}
.sort-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.82em;
  color: var(--ui-text-primary);
  text-align: left;
  transition: background 0.15s;
}
.sort-option:hover { background: var(--ui-button-ghost-hover-bg); }
.sort-option.active { color: var(--ui-input-focus-border); font-weight: 600; }

.todo-list-area {
  flex: 1;
  min-height: 0;
}
.todo-list-inner {
  padding: 0 16px 16px;
}
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.completed-section {
  margin-top: 16px;
}
.completed-header {
  font-size: 0.85em;
  color: var(--ui-text-muted);
  cursor: pointer;
  padding: 8px 0;
  user-select: none;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  opacity: 0.5;
}
.empty-emoji { font-size: 3em; margin: 0; }
.empty-text { font-size: 0.9em; margin: 8px 0 0; }

.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--ui-border-subtle);
  border-top-color: var(--ui-input-focus-border);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.list-enter-active { animation: slide-in 0.3s ease; }
.list-leave-active { animation: slide-out 0.25s ease; }
@keyframes slide-in { from { opacity: 0; transform: translateY(-10px); } }
@keyframes slide-out { to { opacity: 0; transform: translateX(30px); } }
</style>
