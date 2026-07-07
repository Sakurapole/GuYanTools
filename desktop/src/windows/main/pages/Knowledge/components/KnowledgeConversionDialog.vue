<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';

defineProps<{
  open: boolean;
  title: string;
  warning: string;
  confirmLabel: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (event: 'confirm'): void;
  (event: 'close'): void;
}>();
</script>

<template>
  <UiDialog :model-value="open" max-width="420px" @update:model-value="value => !value && emit('close')" @close="emit('close')">
    <template #header>
      <div class="knowledge-conversion-dialog__header">
        <strong>{{ title }}</strong>
      </div>
    </template>
    <div class="knowledge-conversion-dialog">
      <p>{{ warning }}</p>
      <p>将创建一个新页面副本，原页面不会被覆盖。</p>
    </div>
    <template #footer>
      <UiButton type="button" variant="secondary" :disabled="loading" @click="emit('close')">取消</UiButton>
      <UiButton type="button" variant="primary" :disabled="loading" @click="emit('confirm')">
        {{ loading ? '转换中' : confirmLabel }}
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped lang="scss">
.knowledge-conversion-dialog {
  display: grid;
  gap: 8px;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-size-sm);
  line-height: 1.7;
}

.knowledge-conversion-dialog__header {
  padding: 14px 16px;
}
</style>
