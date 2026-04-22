<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';

defineProps<{
  query: string;
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  previous: [];
  next: [];
  close: [];
}>();
</script>

<template>
  <div class="terminal-search-panel ui-glass-surface">
    <UiInput
      :model-value="query"
      placeholder="搜索当前终端输出"
      size="sm"
      @update:modelValue="emit('update:query', $event)"
      @keydown.enter.prevent="emit('next')"
    />
    <div class="terminal-search-panel__actions">
      <UiButton variant="ghost" size="sm" @click="emit('previous')">上一个</UiButton>
      <UiButton variant="ghost" size="sm" @click="emit('next')">下一个</UiButton>
      <UiButton variant="ghost" size="sm" @click="emit('close')">关闭</UiButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.terminal-search-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--ui-radius-md);
}

.terminal-search-panel__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 860px) {
  .terminal-search-panel {
    flex-direction: column;
    align-items: stretch;
  }

  .terminal-search-panel__actions {
    justify-content: flex-end;
  }
}
</style>
