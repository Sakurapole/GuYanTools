<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { GridItem, TodoWidgetConfig } from '../../../types/grid';
import { normalizeWidgetConfig } from '../registry';
import type { Todo, TodoList } from '@/contracts/todo';
import { useTodoEvents } from '../../../composables/useTodoEvents';

declare const todoApi: import('@/contracts/todo').TodoApi;

const { todoMutationTick, notifyTodoMutated } = useTodoEvents();

const props = withDefaults(defineProps<{
  item: GridItem;
  interactive?: boolean;
}>(), {
  interactive: true,
});

// ── 尺寸分档 ──────────────────────────────────────────
const isCompact = computed(() => props.item.colSpan <= 2 && props.item.rowSpan <= 2);
const isLarge   = computed(() => props.item.colSpan >= 4 && props.item.rowSpan >= 3);

// ── 配置 ──────────────────────────────────────────────
const config = computed(() => normalizeWidgetConfig('todo', props.item.widgetConfig) as TodoWidgetConfig);

// ── 状态 ──────────────────────────────────────────────
const todos       = ref<Todo[]>([]);
const lists       = ref<TodoList[]>([]);
const loading     = ref(false);
const quickTitle  = ref('');
const showInput   = ref(false);

// ── 辅助函数 ──────────────────────────────────────────
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function genId(): string {
  return `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 计算当前视图的标题
const viewLabel = computed(() => {
  const v = config.value.view;
  if (v === 'my-day')    return '我的一天';
  if (v === 'important') return '重要';
  if (v === 'planned')   return '计划内';
  if (v === 'all')       return '全部任务';
  if (v === 'completed') return '已完成';
  const found = lists.value.find((l: TodoList) => l.id === v);
  return found?.name ?? '待办';
});

// 过滤后的任务列表
// 注意：已完成视图下强制显示全部（否则 isCompleted=true 的条目会被过滤掉变成空列表）
const displayTodos = computed(() => {
  const v = config.value.view;
  if (v === 'completed') return todos.value;
  if (config.value.showCompleted) return todos.value;
  return todos.value.filter((t: Todo) => !t.isCompleted);
});

// 头部角标计数：已完成视图显示完成数；其他视图显示未完成数
const badgeCount = computed(() => {
  if (config.value.view === 'completed') {
    return todos.value.filter((t: Todo) => t.isCompleted).length;
  }
  return todos.value.filter((t: Todo) => !t.isCompleted).length;
});

// ── 数据加载 ──────────────────────────────────────────
async function loadTodos() {
  loading.value = true;
  try {
    const v = config.value.view;
    if (v === 'my-day')    todos.value = await todoApi.getMyDayTodos(todayStr());
    else if (v === 'important') todos.value = await todoApi.getImportantTodos();
    else if (v === 'planned')   todos.value = await todoApi.getPlannedTodos();
    else if (v === 'all')       todos.value = await todoApi.getAllTodos();
    else if (v === 'completed') todos.value = await todoApi.getCompletedTodos();
    else                        todos.value = await todoApi.getTodosByList(v, config.value.showCompleted);
  } catch (err) {
    console.error('[TodoWidget] Failed to load todos:', err);
  } finally {
    loading.value = false;
  }
}

async function loadLists() {
  try {
    lists.value = await todoApi.getAllLists();
  } catch {
    // ignore
  }
}

// ── 操作 ──────────────────────────────────────────────
async function toggleComplete(todo: Todo) {
  if (!props.interactive) return;
  try {
    if (todo.isCompleted) {
      const updated = await todoApi.uncompleteTodo(todo.id);
      const idx = todos.value.findIndex((t: Todo) => t.id === todo.id);
      if (idx !== -1) todos.value[idx] = updated;
    } else {
      const result = await todoApi.completeTodo(todo.id);
      const idx = todos.value.findIndex((t: Todo) => t.id === todo.id);
      if (idx !== -1) todos.value[idx] = result.completedTodo;
    }
    // 通知其他组件（如 Todo 页面）同步更新
    notifyTodoMutated();
  } catch (err) {
    console.error('[TodoWidget] Toggle failed:', err);
  }
}

/** 系统默认列表 ID，与主进程保持一致，由主进程负责确保其存在 */
const SYSTEM_DEFAULT_LIST_ID = 'default-tasks';

async function quickAdd() {
  if (!props.interactive) return;
  const title = quickTitle.value.trim();
  if (!title) return;

  try {
    const v = config.value.view;
    const isSmartList = ['my-day', 'important', 'planned', 'all', 'completed'].includes(v);
    const listId = isSmartList ? SYSTEM_DEFAULT_LIST_ID : v;

    const newTodo = await todoApi.createTodo({
      id: genId(),
      listId,
      title,
      isMyDay: v === 'my-day' ? true : undefined,
      isImportant: v === 'important' ? true : undefined,
    });
    todos.value.unshift(newTodo);
    quickTitle.value = '';
    showInput.value = false;
    // 通知其他组件（如 Todo 页面）同步更新
    notifyTodoMutated();
  } catch (err) {
    console.error('[TodoWidget] Quick add failed:', err);
  }
}

function handleInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    quickAdd();
  }
  if (e.key === 'Escape') {
    e.stopPropagation();
    showInput.value = false;
    quickTitle.value = '';
  }
}

function openQuickAdd(e: MouseEvent) {
  if (!props.interactive || !config.value.allowQuickAdd) return;
  e.stopPropagation();
  showInput.value = true;
}

onMounted(async () => {
  await Promise.all([loadTodos(), loadLists()]);
});

// 监听 todo 全局变更信号，Todo 页面发生写操作时重新拉取当前视图的数据
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
watch(todoMutationTick, () => {
  // 防抖：100ms 内的连续操作只触发一次重载
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    loadTodos();
  }, 100);
});
</script>

<template>
  <div
    class="todo-widget"
    :class="{
      'todo-widget--compact': isCompact,
      'todo-widget--large': isLarge,
    }"
  >
    <!-- 头部 -->
    <div class="todo-widget__head">
      <div class="todo-widget__title-row">
        <svg class="todo-widget__icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="5" width="3" height="3" rx="1" fill="currentColor" opacity="0.7"/>
          <rect x="2" y="9.5" width="3" height="3" rx="1" fill="currentColor" opacity="0.7"/>
          <rect x="2" y="14" width="3" height="3" rx="1" fill="currentColor" opacity="0.7"/>
          <rect x="7" y="6" width="11" height="1.5" rx="0.75" fill="currentColor" opacity="0.85"/>
          <rect x="7" y="10.5" width="8" height="1.5" rx="0.75" fill="currentColor" opacity="0.85"/>
          <rect x="7" y="15" width="9.5" height="1.5" rx="0.75" fill="currentColor" opacity="0.85"/>
        </svg>
        <span class="todo-widget__view-name">{{ viewLabel }}</span>
      </div>
      <span v-if="!isCompact" class="todo-widget__count">
        {{ config.view === 'completed' ? `${badgeCount} 项已完成` : `${badgeCount} 项待办` }}
      </span>
    </div>

    <!-- 任务列表 -->
    <div class="todo-widget__list" :class="{ 'todo-widget__list--loading': loading }">
      <template v-if="loading">
        <div v-for="i in (isCompact ? 2 : isLarge ? 6 : 4)" :key="i" class="todo-widget__skeleton" />
      </template>
      <template v-else-if="displayTodos.length === 0">
        <div class="todo-widget__empty">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
          </svg>
          <span>全部完成了！</span>
        </div>
      </template>
      <template v-else>
        <div
          v-for="todo in displayTodos.slice(0, isCompact ? 3 : isLarge ? 8 : 5)"
          :key="todo.id"
          class="todo-widget__item"
          :class="{ 'todo-widget__item--done': todo.isCompleted }"
          @click.stop="toggleComplete(todo)"
          @pointerdown.stop
        >
          <!-- 复选圆圈 -->
          <div class="todo-widget__check" :class="{ 'todo-widget__check--done': todo.isCompleted }">
            <svg v-if="todo.isCompleted" viewBox="0 0 14 14" fill="none">
              <path d="M3 7l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <!-- 标题 -->
          <span class="todo-widget__item-title" :title="todo.title">{{ todo.title }}</span>
          <!-- 重要标记 -->
          <svg v-if="todo.isImportant && !isCompact" class="todo-widget__star" viewBox="0 0 16 16" fill="none">
            <path d="M8 2l1.6 3.8 4.1.4-3 2.7.9 4L8 11l-3.6 2 .9-4-3-2.7 4.1-.4z"
              fill="currentColor" stroke="currentColor" stroke-width="0.5"/>
          </svg>
        </div>
      </template>

      <!-- 更多提示 -->
      <div
        v-if="!loading && displayTodos.length > (isCompact ? 3 : isLarge ? 8 : 5)"
        class="todo-widget__more"
      >
        还有 {{ displayTodos.length - (isCompact ? 3 : isLarge ? 8 : 5) }} 项…
      </div>
    </div>

    <!-- 快速新增 -->
    <div
      v-if="config.allowQuickAdd && !isCompact"
      class="todo-widget__quick-add"
    >
      <template v-if="showInput">
        <input
          v-model="quickTitle"
          class="todo-widget__input"
          placeholder="新待办…"
          autofocus
          @keydown="handleInputKeydown"
          @click.stop
          @pointerdown.stop
        />
        <button type="button" class="todo-widget__add-btn todo-widget__add-btn--confirm"
          @click.stop="quickAdd" @pointerdown.stop>
          <svg viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </template>
      <template v-else>
        <button type="button" class="todo-widget__add-btn" @click="openQuickAdd" @pointerdown.stop>
          <svg viewBox="0 0 14 14" fill="none">
            <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <span>添加任务</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// ── 容器 ──────────────────────────────────────────────
.todo-widget {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 14px;
  box-sizing: border-box;
  color: var(--widget-text-primary, #fff);
  overflow: hidden;
}

// ── 头部 ──────────────────────────────────────────────
.todo-widget__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.todo-widget__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.todo-widget__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.88;
}

.todo-widget__view-name {
  font-size: 13px;
  font-weight: 700;
  opacity: 0.92;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.todo-widget__count {
  font-size: 11px;
  opacity: 0.65;
  flex-shrink: 0;
}

// ── 任务列表 ──────────────────────────────────────────
.todo-widget__list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

// 骨架屏
.todo-widget__skeleton {
  height: 28px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--widget-text-primary, #fff) 10%, transparent);
  animation: skeleton-pulse 1.6s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.6; }
  50%       { opacity: 0.25; }
}

// 空状态
.todo-widget__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  opacity: 0.52;

  svg {
    width: 28px;
    height: 28px;
  }

  span {
    font-size: 12px;
  }
}

// ── 单项 ──────────────────────────────────────────────
.todo-widget__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.18s ease;
  flex-shrink: 0;
  min-width: 0;

  &:hover {
    background: color-mix(in srgb, var(--widget-text-primary, #fff) 10%, transparent);
  }

  &--done .todo-widget__item-title {
    opacity: 0.42;
    text-decoration: line-through;
  }
}

// 复选圆圈
.todo-widget__check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--widget-text-primary, #fff) 50%, transparent);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s ease, border-color 0.18s ease;

  svg {
    width: 10px;
    height: 10px;
    color: var(--widget-text-primary, #fff);
  }

  &--done {
    background: color-mix(in srgb, var(--widget-text-primary, #fff) 70%, transparent);
    border-color: transparent;
  }
}

// 标题
.todo-widget__item-title {
  font-size: 12.5px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

// 重要星标
.todo-widget__star {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: #fbbf24;
  opacity: 0.85;
}

// 更多提示
.todo-widget__more {
  font-size: 11px;
  opacity: 0.52;
  padding: 2px 6px;
  flex-shrink: 0;
}

// ── 快速新增 ──────────────────────────────────────────
.todo-widget__quick-add {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.todo-widget__input {
  flex: 1;
  min-width: 0;
  background: color-mix(in srgb, var(--widget-text-primary, #fff) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, #fff) 22%, transparent);
  border-radius: 8px;
  padding: 5px 10px;
  color: var(--widget-text-primary, #fff);
  font-size: 12px;
  outline: none;
  transition: background 0.18s ease, border-color 0.18s ease;

  &::placeholder {
    color: var(--widget-text-subtle, rgba(255, 255, 255, 0.4));
  }

  &:focus {
    background: color-mix(in srgb, var(--widget-text-primary, #fff) 18%, transparent);
    border-color: color-mix(in srgb, var(--widget-text-primary, #fff) 38%, transparent);
  }
}

.todo-widget__add-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: color-mix(in srgb, var(--widget-text-primary, #fff) 12%, transparent);
  border: none;
  border-radius: 8px;
  padding: 5px 10px;
  color: var(--widget-text-secondary, rgba(255, 255, 255, 0.72));
  font-size: 12px;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
  white-space: nowrap;

  svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  &:hover {
    background: color-mix(in srgb, var(--widget-text-primary, #fff) 20%, transparent);
    color: var(--widget-text-primary, #fff);
  }

  &--confirm {
    padding: 5px 8px;
    background: color-mix(in srgb, var(--widget-text-primary, #fff) 20%, transparent);
    color: var(--widget-text-primary, #fff);
  }
}

// ── 紧凑模式（2×2）─────────────────────────────────
.todo-widget--compact {
  gap: 8px;
  padding: 12px;

  .todo-widget__view-name {
    font-size: 12px;
    max-width: 90px;
  }

  .todo-widget__item {
    padding: 4px 4px;
    gap: 6px;
    border-radius: 6px;
  }

  .todo-widget__check {
    width: 14px;
    height: 14px;

    svg { width: 8px; height: 8px; }
  }

  .todo-widget__item-title {
    font-size: 11.5px;
  }
}

// ── 大型模式（4×3）─────────────────────────────────
.todo-widget--large {
  gap: 8px;
  padding: 16px;

  .todo-widget__view-name {
    font-size: 14px;
    max-width: 160px;
  }

  .todo-widget__count {
    font-size: 12px;
  }

  .todo-widget__item {
    padding: 6px 8px;
    gap: 9px;
    border-radius: 9px;
  }

  .todo-widget__check {
    width: 17px;
    height: 17px;

    svg { width: 11px; height: 11px; }
  }

  .todo-widget__item-title {
    font-size: 13px;
  }

  .todo-widget__star {
    width: 13px;
    height: 13px;
  }

  .todo-widget__skeleton {
    height: 30px;
  }

  .todo-widget__input,
  .todo-widget__add-btn {
    font-size: 12.5px;
    padding: 6px 11px;
  }
}
</style>
