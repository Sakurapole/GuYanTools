<script setup lang="ts">
import { ref, watch } from 'vue';
import { useTodoStore } from '@/windows/main/stores/todo_store';

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
    <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
    </svg>
    <input
      v-model="query"
      class="search-input"
      placeholder="搜索任务..."
      type="text"
    />
    <button v-if="query" class="search-clear" @click="clearSearch">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>
      </svg>
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
  background: rgba(0, 0, 0, 0.08);
  color: var(--ui-text-primary);
}
</style>
