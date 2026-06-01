<script setup lang="ts">
import { ref } from 'vue';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';

const todoStore = useTodoStore();
const inputText = ref('');
const inputRef = ref<InstanceType<typeof UiInput> | null>(null);
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
    <UiInput
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

.add-input.ui-input {
  flex: 1;
  border: none;
  outline: none;
  min-height: auto;
  padding: 0;
  font-size: 0.88em;
  background: transparent;
  color: var(--ui-text-primary);
  font-weight: 400;
  box-shadow: none;
}
.add-input.ui-input:focus {
  border-color: transparent;
  box-shadow: none;
}
.add-input::placeholder {
  color: var(--ui-input-placeholder);
  font-weight: 400;
}
</style>
