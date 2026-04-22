<script setup lang="ts">
import { ref, watch, nextTick, inject, computed } from 'vue';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { useTodoSettings } from '@/windows/main/composables/useTodoSettings';
import TodoBackground from './TodoBackground.vue';
import ReminderPicker from './ReminderPicker.vue';
import RepeatPicker from './RepeatPicker.vue';
import UiDatePicker from '@/windows/main/components/ui/UiDatePicker.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import { marked } from 'marked';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';

const todoStore = useTodoStore();
const { detailBg } = useTodoSettings();
const openBgPicker = inject<Function>('openTodoBgPicker');
const { open: openMenu } = useContextMenu();

const editingTitle = ref('');
const noteText = ref('');
const newStepText = ref('');
const titleRef = ref<HTMLInputElement | null>(null);
const noteEditing = ref(false);
const noteRef = ref<HTMLTextAreaElement | null>(null);

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderedNote = computed(() => {
  if (!noteText.value) return '';
  return marked.parse(noteText.value) as string;
});

watch(() => todoStore.selectedTodo, (todo) => {
  if (todo) {
    editingTitle.value = todo.title;
    noteText.value = todo.note;
  }
}, { immediate: true });

function close() {
  todoStore.selectTodo(null);
}

function handleContextMenu(e: MouseEvent) {
  openMenu(e.clientX, e.clientY, [
    {
      id: 'detail-bg',
      label: '更换详情面板背景',
      action: () => openBgPicker && openBgPicker('detail'),
    }
  ]);
}

async function saveTitle() {
  const todo = todoStore.selectedTodo;
  if (!todo || editingTitle.value === todo.title) return;
  await todoStore.updateTodo(todo.id, { title: editingTitle.value });
}

async function saveNote() {
  const todo = todoStore.selectedTodo;
  if (!todo || noteText.value === todo.note) return;
  await todoStore.updateTodo(todo.id, { note: noteText.value });
}

function enterNoteEdit() {
  noteEditing.value = true;
  nextTick(() => {
    noteRef.value?.focus();
  });
}

function leaveNoteEdit() {
  noteEditing.value = false;
  saveNote();
}

async function toggleMyDay() {
  const todo = todoStore.selectedTodo;
  if (todo) await todoStore.toggleMyDay(todo.id);
}

async function addStep() {
  const title = newStepText.value.trim();
  if (!title || !todoStore.selectedTodo) return;
  await todoStore.addStep(todoStore.selectedTodo.id, title);
  newStepText.value = '';
}

async function toggleStep(stepId: string, isCompleted: boolean) {
  await todoStore.updateStep(stepId, { isCompleted: !isCompleted });
}

async function removeStep(stepId: string) {
  await todoStore.deleteStep(stepId);
}

const { show: showConfirm } = useConfirmDialog();

async function deleteTodo() {
  const todo = todoStore.selectedTodo;
  if (!todo) return;
  const ok = await showConfirm({
    title: '删除任务',
    message: `确定要删除「${todo.title}」吗？此操作不可撤销。`,
    confirmText: '删除',
    danger: true,
  });
  if (ok) {
    await todoStore.deleteTodo(todo.id);
  }
}

async function onDueDateChange(val: string) {
  const todo = todoStore.selectedTodo;
  if (!todo) return;
  await todoStore.updateTodo(todo.id, { dueDate: val });
}
</script>

<template>
  <aside class="todo-detail" v-if="todoStore.selectedTodo" @contextmenu.prevent.stop="handleContextMenu">
    <TodoBackground :config="detailBg" />
    <div class="detail-inner" style="position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%;">
      <div class="detail-header">
        <button class="close-btn" @click="close">✕</button>
      </div>

      <UiScrollbar :x="false" :size="6" class="detail-scroll-area">
      <div class="detail-body">
      <!-- 标题 -->
      <input
        ref="titleRef"
        v-model="editingTitle"
        class="detail-title"
        @blur="saveTitle"
        @keydown.enter="($event.target as HTMLInputElement)?.blur()"
      />

      <!-- 步骤 -->
      <div class="detail-section">
        <div class="section-label">📋 步骤</div>
        <div class="steps-list">
          <div v-for="step in todoStore.selectedTodo.steps" :key="step.id" class="step-item">
            <button
              class="step-check"
              :class="{ checked: step.isCompleted }"
              @click="toggleStep(step.id, step.isCompleted)"
            >
              <span v-if="step.isCompleted">✓</span>
            </button>
            <span class="step-title" :class="{ done: step.isCompleted }">{{ step.title }}</span>
            <button class="step-delete" @click="removeStep(step.id)">✕</button>
          </div>
          <div class="step-add">
            <input
              v-model="newStepText"
              class="step-add-input"
              placeholder="添加步骤"
              @keydown.enter="addStep"
            />
          </div>
        </div>
      </div>

      <!-- 我的一天 -->
      <button class="detail-action" @click="toggleMyDay">
        <span>☀️</span>
        <span>{{ todoStore.selectedTodo.isMyDay ? '从我的一天移除' : '添加到我的一天' }}</span>
      </button>

      <!-- 截止日期 -->
      <div class="detail-section">
        <div class="section-label">📅 截止日期</div>
        <UiDatePicker
          :modelValue="todoStore.selectedTodo.dueDate || ''"
          @update:modelValue="onDueDateChange"
          placeholder="设置截止日期"
          size="sm"
        />
      </div>

      <!-- 提醒 -->
      <div class="detail-section">
        <div class="section-label">⏰ 提醒</div>
        <ReminderPicker
          :todoId="todoStore.selectedTodo.id"
          :reminders="todoStore.selectedTodo.reminders"
        />
      </div>

      <!-- 重复 -->
      <div class="detail-section">
        <div class="section-label">🔄 重复</div>
        <RepeatPicker
          :modelValue="todoStore.selectedTodo.repeatRule || ''"
          @update:modelValue="(v: string) => todoStore.updateTodo(todoStore.selectedTodo!.id, { repeatRule: v || undefined })"
        />
      </div>

      <!-- 备注 -->
      <div class="detail-section">
        <div class="section-label">📝 备注</div>
        <!-- 编辑模式 -->
        <textarea
          v-if="noteEditing"
          ref="noteRef"
          v-model="noteText"
          class="note-area note-area--editing"
          placeholder="支持 Markdown 语法..."
          @blur="leaveNoteEdit"
        />
        <!-- 渲染模式 -->
        <div
          v-else
          class="note-area note-area--rendered"
          :class="{ 'note-area--empty': !noteText }"
          @click="enterNoteEdit"
        >
          <div v-if="noteText" class="note-md-content" v-html="renderedNote"></div>
          <span v-else class="note-placeholder">添加备注（支持 Markdown）...</span>
        </div>
      </div>
    </div>
      </UiScrollbar>

    <div class="detail-footer">
      <span class="created-info">创建于 {{ todoStore.selectedTodo.createdAt?.split('T')[0] ?? todoStore.selectedTodo.createdAt?.slice(0, 10) }}</span>
      <button class="delete-btn" @click="deleteTodo">🗑️ 删除</button>
    </div>
    </div>
  </aside>
</template>

<style scoped>
.todo-detail {
  width: 340px;
  min-width: 300px;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  background: transparent;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
}
.detail-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.detail-scroll-area {
  flex: 1;
  min-height: 0;
}
.detail-header {
  display: flex;
  justify-content: flex-end;
  padding: 12px;
}
.close-btn {
  background: none;
  border: none;
  font-size: 1.1em;
  cursor: pointer;
  color: var(--ui-text-muted);
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s ease;
}
.close-btn:hover { background: var(--ui-button-ghost-hover-bg); }

.detail-body {
  flex: 1;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.detail-title {
  font-size: 1.2em;
  font-weight: 600;
  border: none;
  outline: none;
  background: transparent;
  width: 100%;
  padding: 4px 0;
  color: var(--ui-text-primary);
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.section-label {
  font-size: 0.85em;
  color: var(--ui-text-muted);
  font-weight: 500;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.step-check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--ui-text-subtle);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65em;
  color: white;
  padding: 0;
  flex-shrink: 0;
}
.step-check.checked { background: var(--ui-input-focus-border); border-color: var(--ui-input-focus-border); }
.step-title { flex: 1; font-size: 0.85em; }
.step-title.done { text-decoration: line-through; opacity: 0.5; }
.step-delete {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8em;
  color: var(--ui-text-subtle);
  opacity: 0;
  transition: opacity 0.15s;
}
.step-item:hover .step-delete { opacity: 1; }

.step-add-input {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--ui-border-subtle);
  padding: 6px 0;
  font-size: 0.85em;
  outline: none;
  background: transparent;
  color: var(--ui-text-primary);
}

.detail-action {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.9em;
  color: var(--ui-text-primary);
  width: 100%;
  text-align: left;
  border-bottom: 1px solid var(--ui-border-subtle);
}
.detail-action:hover { color: var(--ui-input-focus-border); }



.note-area {
  width: 100%;
  min-height: 80px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.85em;
  outline: none;
  background: transparent;
  color: var(--ui-text-primary);
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.note-area--editing {
  resize: vertical;
  border-color: var(--ui-input-focus-border);
  box-shadow: 0 0 0 2px var(--ui-focus-ring-color, rgba(92, 157, 237, 0.16));
}

.note-area--rendered {
  cursor: pointer;
  min-height: 60px;
}
.note-area--rendered:hover {
  border-color: var(--ui-border-accent-soft);
  background: var(--ui-surface-overlay);
}

.note-area--empty {
  min-height: 52px;
  display: flex;
  align-items: center;
}

.note-placeholder {
  color: var(--ui-input-placeholder);
  font-style: italic;
  font-size: 0.92em;
}

/* ─── Markdown 渲染样式 ─── */
.note-md-content {
  line-height: 1.65;
  word-break: break-word;
}

.note-md-content :deep(h1),
.note-md-content :deep(h2),
.note-md-content :deep(h3),
.note-md-content :deep(h4) {
  margin: 8px 0 4px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ui-text-primary);
}
.note-md-content :deep(h1) { font-size: 1.2em; }
.note-md-content :deep(h2) { font-size: 1.1em; }
.note-md-content :deep(h3) { font-size: 1em; }
.note-md-content :deep(h4) { font-size: 0.95em; }

.note-md-content :deep(p) {
  margin: 4px 0;
}

.note-md-content :deep(ul),
.note-md-content :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}

.note-md-content :deep(li) {
  margin: 2px 0;
}

.note-md-content :deep(code) {
  background: var(--ui-surface-overlay);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}

.note-md-content :deep(pre) {
  background: var(--ui-surface-overlay);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 6px 0;
  overflow-x: auto;
}

.note-md-content :deep(pre code) {
  background: transparent;
  padding: 0;
}

.note-md-content :deep(blockquote) {
  margin: 6px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--ui-border-accent);
  color: var(--ui-text-muted);
}

.note-md-content :deep(a) {
  color: var(--ui-input-focus-border);
  text-decoration: none;
}
.note-md-content :deep(a:hover) {
  text-decoration: underline;
}

.note-md-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--ui-border-subtle);
  margin: 8px 0;
}

.note-md-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 6px 0;
  font-size: 0.92em;
}

.note-md-content :deep(th),
.note-md-content :deep(td) {
  border: 1px solid var(--ui-border-subtle);
  padding: 4px 8px;
  text-align: left;
}

.note-md-content :deep(th) {
  background: var(--ui-surface-overlay);
  font-weight: 600;
}

.note-md-content :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}

.note-md-content :deep(input[type="checkbox"]) {
  margin-right: 6px;
  pointer-events: none;
}

.detail-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--ui-border-subtle);
  font-size: 0.8em;
  color: var(--ui-text-subtle);
}
.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ui-button-danger-text);
  font-size: 0.85em;
}
.delete-btn:hover { text-decoration: underline; }
</style>
