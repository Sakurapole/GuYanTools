<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';

const todoStore = useTodoStore();
const inputText = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const isFocused = ref(false);

async function handleSubmit() {
  const title = inputText.value.trim();
  if (!title) return;
  await todoStore.addTodo(title);
  inputText.value = '';
  inputRef.value?.focus();
}
</script>

<template>
  <div class="quick-add" :class="{ focused: isFocused }">
    <span class="add-icon-wrap">
      <IconRenderer icon="iconify:lucide:plus" :size="16" />
    </span>
    <input
      ref="inputRef"
      v-model="inputText"
      class="add-input"
      placeholder="添加任务，按 Enter 提交"
      @keydown.enter="handleSubmit"
      @focus="isFocused = true"
      @blur="isFocused = false"
    />
  </div>
</template>

<style scoped>
.quick-add {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  margin: 0 12px 8px;
  border-radius: 10px;
  border: 1.5px dashed var(--ui-border-subtle);
  flex-shrink: 0;
  background: color-mix(in srgb, var(--ui-surface-panel) 94%, var(--ui-surface-overlay));
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: text;
}
.quick-add:hover {
  border-color: var(--ui-input-focus-border);
  border-style: solid;
  background: color-mix(in srgb, var(--ui-surface-panel) 88%, var(--todo-accent-bg-soft));
}
.quick-add.focused {
  border-color: var(--ui-input-focus-border);
  border-style: solid;
  background: color-mix(in srgb, var(--ui-surface-panel) 82%, var(--todo-accent-bg));
  box-shadow: 0 0 0 3px var(--todo-accent-ring);
}

.add-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--ui-text-muted);
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.quick-add.focused .add-icon-wrap,
.quick-add:hover .add-icon-wrap {
  color: var(--ui-input-focus-border);
  background: var(--todo-accent-bg);
}

.add-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 0.88em;
  background: transparent;
  color: var(--ui-text-primary);
  font-weight: 400;
}
.add-input::placeholder {
  color: var(--ui-input-placeholder);
  font-weight: 400;
}
</style>
