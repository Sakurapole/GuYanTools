<script setup lang="ts">
import { inject } from 'vue';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import type { Todo } from '@/contracts/todo';

const props = defineProps<{ todo: Todo }>();
const todoStore = useTodoStore();
const { open: openMenu } = useContextMenu();
const { show: showConfirm } = useConfirmDialog();
const openBgPicker = inject<Function>('openTodoBgPicker');

function handleComplete() {
  if (props.todo.isCompleted) {
    todoStore.uncompleteTodo(props.todo.id);
  } else {
    todoStore.completeTodo(props.todo.id);
  }
}

function handleTitleClick() {
  todoStore.selectTodo(props.todo.id);
}

function handleImportant(e: Event) {
  e.stopPropagation();
  todoStore.toggleImportant(props.todo.id);
}

function dueDateLabel(date: string | undefined): string {
  if (!date) return '';
  const today = new Date();
  const d = new Date(date + 'T00:00:00');
  const diffDays = Math.floor((d.getTime() - today.setHours(0,0,0,0)) / 86400000);
  if (diffDays < 0) return `过期 ${-diffDays}天`;
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '明天';
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function dueDateClass(date: string | undefined): string {
  if (!date) return '';
  const today = new Date();
  const d = new Date(date + 'T00:00:00');
  const diffDays = Math.floor((d.getTime() - today.setHours(0,0,0,0)) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  return '';
}

const stepsInfo = () => {
  const steps = props.todo.steps;
  if (steps.length === 0) return '';
  const done = steps.filter(s => s.isCompleted).length;
  return `步骤 ${done}/${steps.length}`;
};

function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  openMenu(e.clientX, e.clientY, [
    {
      id: 'toggle-important',
      label: props.todo.isImportant ? '取消重要' : '标记重要',
      action: () => todoStore.toggleImportant(props.todo.id),
    },
    {
      id: 'toggle-myday',
      label: props.todo.isMyDay ? '从我的一天移除' : '添加到我的一天',
      action: () => todoStore.toggleMyDay(props.todo.id),
    },
    {
      id: 'todo-item-bg',
      label: '任务项个性化配置',
      divided: true,
      action: () => openBgPicker && openBgPicker('item'),
    },
    {
      id: 'delete-todo',
      label: '删除任务',
      danger: true,
      action: async () => {
        const ok = await showConfirm({
          title: '删除任务',
          message: `确定要删除「${props.todo.title}」吗？此操作不可撤销。`,
          confirmText: '删除',
          danger: true,
        });
        if (ok) {
          await todoStore.deleteTodo(props.todo.id);
        }
      },
    },
  ]);
}
</script>

<template>
  <div class="todo-item" :class="{ completed: todo.isCompleted }" @click="handleTitleClick" @contextmenu="handleContextMenu">
    <button class="checkbox" :class="{ checked: todo.isCompleted }" @click.stop="handleComplete">
      <IconRenderer v-if="todo.isCompleted" icon="iconify:lucide:check" :size="15" />
    </button>
    <div class="item-body">
      <span class="item-title">{{ todo.title }}</span>
      <span class="item-meta" v-if="stepsInfo() || todo.dueDate || todo.reminders.length > 0">
        <span v-if="stepsInfo()">{{ stepsInfo() }}</span>
        <span v-if="todo.dueDate" class="due-date" :class="dueDateClass(todo.dueDate)">
          <IconRenderer icon="iconify:lucide:calendar" :size="13" />
          {{ dueDateLabel(todo.dueDate) }}
        </span>
        <span v-if="todo.reminders.length > 0" class="meta-icon">
          <IconRenderer icon="iconify:lucide:bell" :size="13" />
        </span>
        <span v-if="todo.repeatRule" class="meta-icon">
          <IconRenderer icon="iconify:lucide:repeat-2" :size="13" />
        </span>
      </span>
    </div>
    <button
      class="important-btn"
      :class="{ active: todo.isImportant }"
      @click="handleImportant"
      :title="todo.isImportant ? '取消重要' : '标记重要'"
    >
      <IconRenderer icon="iconify:lucide:star" :size="20" />
    </button>
  </div>
</template>

<style scoped>
.todo-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: transparent;
  backdrop-filter: var(--todo-item-backdrop-filter, blur(10px));
  -webkit-backdrop-filter: var(--todo-item-backdrop-filter, blur(10px));
  border: 1px solid var(--ui-border-subtle);
  border-radius: 12px;
  box-shadow: var(--todo-item-shadow);
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}
.todo-item::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--todo-item-surface-bg, var(--ui-surface-glass));
  opacity: var(--todo-item-surface-opacity, 1);
  transition:
    background 0.22s ease,
    opacity 0.22s ease;
}
.todo-item > * {
  position: relative;
  z-index: 1;
}
.todo-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--todo-item-shadow-hover);
  border-color: var(--ui-border-accent-soft);
}
.todo-item:hover::before {
  background: var(--todo-item-surface-hover-bg, var(--ui-surface-glass-strong));
}
.todo-item.completed .item-title {
  text-decoration: line-through;
  opacity: 0.5;
}

.checkbox {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--ui-text-subtle);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75em;
  color: white;
  transition: all 0.2s;
  flex-shrink: 0;
  padding: 0;
}
.checkbox:hover { border-color: var(--ui-input-focus-border); }
.checkbox.checked {
  background: var(--ui-input-focus-border);
  border-color: var(--ui-input-focus-border);
}
.checkbox.checked :deep(*) {
  animation: todo-check-pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.item-title {
  font-size: 0.9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75em;
  color: var(--ui-text-muted);
}
.due-date,
.meta-icon {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.due-date.overdue { color: #D83B01; }
.due-date.today { color: #F7A93B; }

.important-btn {
  background: none;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-subtle);
  padding: 0;
  transition: transform 0.2s;
}
.important-btn.active { color: #E8553D; fill: currentColor; }
.important-btn:hover { transform: scale(1.2); }

@keyframes todo-check-pop {
  from {
    opacity: 0;
    transform: scale(0.45);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
