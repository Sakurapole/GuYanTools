<script setup lang="ts">
import { ref, watch } from 'vue';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';

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
    <UiInput
      v-model="query"
      class="search-input"
      placeholder="搜索任务..."
      type="text"
    >
      <template #prefix>
        <IconRenderer class="search-icon" icon="iconify:lucide:search" :size="16" />
      </template>
      <template #suffix>
        <UiIconButton v-if="query" class="search-clear" size="sm" variant="ghost" title="清除搜索" @click="clearSearch">
          <IconRenderer icon="iconify:lucide:x" :size="14" />
        </UiIconButton>
      </template>
    </UiInput>
  </div>
</template>

<style scoped>
.todo-search {
  margin: 0 8px 4px;
}

.search-icon {
  flex-shrink: 0;
  color: var(--ui-text-muted);
}

.search-input.ui-input-affix-wrapper {
  border-color: var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--ui-input-bg);
}

.search-input :deep(.ui-input) {
  font-size: 0.82em;
  color: var(--ui-text-primary);
}

.search-clear.ui-icon-button {
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
  transform: none;
}
.search-clear.ui-icon-button:hover:not(:disabled) {
  background: var(--todo-accent-bg-soft);
  color: var(--ui-text-primary);
  transform: none;
}
</style>
