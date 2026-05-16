<script setup lang="ts">
import { useTodoStore } from '@/windows/main/stores/todo_store';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import type { Todo } from '@/contracts/todo';

const props = defineProps<{ todo: Todo }>();
const todoStore = useTodoStore();
const { open: openMenu } = useContextMenu();
const { show: showConfirm } = useConfirmDialog();

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
      id: 'delete-todo',
      label: '删除任务',
      danger: true,
      divided: true,
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
      <span v-if="todo.isCompleted">✓</span>
    </button>
    <div class="item-body">
      <span class="item-title">{{ todo.title }}</span>
      <span class="item-meta" v-if="stepsInfo() || todo.dueDate || todo.reminders.length > 0">
        <span v-if="stepsInfo()">{{ stepsInfo() }}</span>
        <span v-if="todo.dueDate" class="due-date" :class="dueDateClass(todo.dueDate)">
          📅 {{ dueDateLabel(todo.dueDate) }}
        </span>
        <span v-if="todo.reminders.length > 0">🔔</span>
        <span v-if="todo.repeatRule">🔄</span>
      </span>
    </div>
    <button
      class="important-btn"
      :class="{ active: todo.isImportant }"
      @click="handleImportant"
      :title="todo.isImportant ? '取消重要' : '标记重要'"
    >
      {{ todo.isImportant ? '★' : '☆' }}
    </button>
  </div>
</template>

<style scoped>
.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--ui-surface-glass);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 12px;
  box-shadow: var(--todo-item-shadow);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.todo-item:hover {
  background: var(--ui-surface-glass-strong);
  transform: translateY(-2px);
  box-shadow: var(--todo-item-shadow-hover);
  border-color: var(--ui-border-accent-soft);
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
  gap: 8px;
  font-size: 0.75em;
  color: var(--ui-text-muted);
}
.due-date.overdue { color: #D83B01; }
.due-date.today { color: #F7A93B; }

.important-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2em;
  color: var(--ui-text-subtle);
  padding: 0;
  transition: transform 0.2s;
}
.important-btn.active { color: #E8553D; }
.important-btn:hover { transform: scale(1.2); }
</style>
