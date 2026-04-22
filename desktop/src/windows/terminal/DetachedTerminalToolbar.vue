<script setup lang="ts">
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import type { TerminalRendererMode } from '@/contracts/terminal';
import type { UiSelectOption } from '@/windows/main/components/ui/UiSelect.vue';
import { computed } from 'vue';
import { BUILTIN_SCHEMES } from '@/windows/main/pages/Terminal/terminal-themes';

const props = defineProps<{
  rendererMode: TerminalRendererMode;
  colorSchemeId: string;
  sessionRunning: boolean;
}>();

const emit = defineEmits<{
  'update:colorSchemeId': [value: string];
  'update:rendererMode': [value: TerminalRendererMode];
  clear: [];
  search: [];
  kill: [];
}>();

const rendererOptions: UiSelectOption[] = [
  { label: '自动', value: 'auto' },
  { label: '标准', value: 'standard' },
  { label: 'WebGL', value: 'webgl' },
];

const schemeOptions = computed<UiSelectOption[]>(() => {
  const darkSchemes = BUILTIN_SCHEMES.filter((s) => s.group === 'dark');
  const lightSchemes = BUILTIN_SCHEMES.filter((s) => s.group === 'light');
  const options: UiSelectOption[] = [];

  if (darkSchemes.length > 0) {
    options.push({ label: '-- 深色方案 --', value: '__dark_divider__', disabled: true });
    for (const s of darkSchemes) {
      options.push({ label: s.label, value: s.id });
    }
  }

  if (lightSchemes.length > 0) {
    options.push({ label: '-- 浅色方案 --', value: '__light_divider__', disabled: true });
    for (const s of lightSchemes) {
      options.push({ label: s.label, value: s.id });
    }
  }

  return options;
});
</script>

<template>
  <div class="detached-toolbar">
    <div class="detached-toolbar__selects">
      <UiSelect
        :model-value="colorSchemeId"
        :options="schemeOptions"
        size="sm"
        @update:modelValue="emit('update:colorSchemeId', $event as string)"
      />
      <UiSelect
        :model-value="rendererMode"
        :options="rendererOptions"
        size="sm"
        @update:modelValue="emit('update:rendererMode', $event as TerminalRendererMode)"
      />
    </div>

    <div class="detached-toolbar__actions">
      <!-- Search -->
      <button
        class="detached-toolbar__btn"
        title="搜索"
        @click="emit('search')"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2"
          fill="none" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      <!-- Clear -->
      <button
        class="detached-toolbar__btn"
        title="清屏"
        @click="emit('clear')"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2"
          fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>

      <!-- Kill session -->
      <button
        class="detached-toolbar__btn detached-toolbar__btn--danger"
        :disabled="!sessionRunning"
        title="结束会话"
        @click="emit('kill')"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2"
          fill="none" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.detached-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: transparent;
  border-bottom: 1px solid var(--ui-border-subtle);
  min-height: 36px;
  box-sizing: border-box;
  gap: 8px;
}

.detached-toolbar__selects {
  display: flex;
  align-items: center;
  gap: 6px;
}

.detached-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.detached-toolbar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
  }
}
</style>
