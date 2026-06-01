<script setup lang="ts">
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import { computed, nextTick, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{
  query: string;
  resultIndex?: number;
  resultCount?: number;
}>(), {
  resultIndex: -1,
  resultCount: 0,
});

const emit = defineEmits<{
  'update:query': [value: string];
  previous: [];
  next: [];
  close: [];
}>();

const panelRef = ref<HTMLElement | null>(null);
const resultLabel = computed(() => {
  if (!props.query.trim() || props.resultCount <= 0) {
    return '0/0';
  }

  if (props.resultIndex < 0) {
    return `-/${props.resultCount}`;
  }

  return `${props.resultIndex + 1}/${props.resultCount}`;
});

async function focusInput() {
  await nextTick();
  const input = panelRef.value?.querySelector('input');
  input?.focus();
  input?.select();
}

onMounted(() => {
  void focusInput();
});

defineExpose({
  focusInput,
});
</script>

<template>
  <div ref="panelRef" class="terminal-search-panel ui-glass-surface">
    <UiInput
      :model-value="query"
      placeholder="搜索当前终端输出"
      size="sm"
      @update:modelValue="emit('update:query', $event)"
      @keydown.enter.prevent="emit('next')"
      @keydown.esc.stop.prevent="emit('close')"
    />
    <span class="terminal-search-panel__result-count" title="当前结果 / 全部结果">
      {{ resultLabel }}
    </span>
    <div class="terminal-search-panel__actions">
      <UiIconButton class="terminal-search-panel__icon-btn" size="sm" variant="ghost" title="上一个" @click="emit('previous')">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="m18 15-6-6-6 6" />
        </svg>
      </UiIconButton>
      <UiIconButton class="terminal-search-panel__icon-btn" size="sm" variant="ghost" title="下一个" @click="emit('next')">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </UiIconButton>
      <UiIconButton class="terminal-search-panel__icon-btn" size="sm" variant="ghost" title="关闭" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </UiIconButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.terminal-search-panel {
  position: absolute;
  top: 62px;
  right: 14px;
  z-index: var(--ui-z-overlay);
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(380px, calc(100% - 28px));
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--ui-border-subtle);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);

  :deep(.ui-input) {
    min-height: 30px;
    font-size: 12px;
  }
}

.terminal-search-panel__result-count {
  flex: 0 0 auto;
  min-width: 46px;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.terminal-search-panel__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.terminal-search-panel__icon-btn.ui-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--ui-button-ghost-text);
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;
  transform: none;

  &:hover:not(:disabled) {
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-button-ghost-hover-text);
    transform: none;
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }

  :deep(svg) {
    fill: none;
    stroke: currentColor;
  }
}

@media (max-width: 860px) {
  .terminal-search-panel {
    left: 10px;
    right: 10px;
    width: auto;
  }

  .terminal-search-panel__actions {
    justify-content: flex-end;
  }
}
</style>
