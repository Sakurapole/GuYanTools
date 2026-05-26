<script setup lang="ts">
import { ref, watch } from 'vue';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';

const todoStore = useTodoStore();
const query = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    todoStore.search(val);
  }, 300);
});

function clearSearch() {
  query.value = '';
  todoStore.search('');
}
</script>

<template>
  <div class="todo-search">
    <IconRenderer class="search-icon" icon="iconify:lucide:search" :size="16" />
    <input
      v-model="query"
      class="search-input"
      placeholder="搜索任务..."
      type="text"
    />
    <button v-if="query" class="search-clear" @click="clearSearch">
      <IconRenderer icon="iconify:lucide:x" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.todo-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin: 0 8px 4px;
  background: var(--ui-input-bg);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  transition: border-color 0.18s ease;
}
.todo-search:focus-within {
  border-color: var(--ui-input-focus-border);
}
.search-icon {
  flex-shrink: 0;
  color: var(--ui-text-muted);
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.82em;
  color: var(--ui-text-primary);
  min-width: 0;
}
.search-input::placeholder {
  color: var(--ui-input-placeholder);
}
.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.search-clear:hover {
  background: var(--todo-accent-bg-soft);
  color: var(--ui-text-primary);
}
</style>
