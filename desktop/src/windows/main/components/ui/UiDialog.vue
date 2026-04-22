<script lang="ts" setup>
import { computed, onBeforeUnmount, useAttrs, watch } from 'vue';
import UiCard from './UiCard.vue';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<{
  modelValue: boolean;
  width?: string | number;
  maxWidth?: string | number;
  closeOnMask?: boolean;
  closeOnEsc?: boolean;
  persistent?: boolean;
}>(), {
  width: '',
  maxWidth: '',
  closeOnMask: true,
  closeOnEsc: true,
  persistent: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  open: [];
  close: [];
}>();

const attrs = useAttrs();

function normalizeSize(value: string | number | undefined) {
  if (value === '' || value === undefined) {
    return undefined;
  }

  return typeof value === 'number' ? `${value}px` : value;
}

const dialogStyle = computed(() => ({
  width: normalizeSize(props.width),
  maxWidth: normalizeSize(props.maxWidth),
}));

function requestClose() {
  if (props.persistent) {
    return;
  }

  emit('update:modelValue', false);
  emit('close');
}

function handleMaskClick() {
  if (!props.closeOnMask) {
    return;
  }

  requestClose();
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.modelValue || !props.closeOnEsc || event.key !== 'Escape') {
    return;
  }

  event.preventDefault();
  requestClose();
}

watch(() => props.modelValue, value => {
  if (value) {
    emit('open');
  }
}, { immediate: false });

watch(() => props.modelValue, value => {
  if (value) {
    window.addEventListener('keydown', handleKeydown);
    return;
  }

  window.removeEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="ui-dialog-overlay" @click="handleMaskClick">
      <UiCard class="ui-dialog" variant="elevated" padding="none" radius="lg" v-bind="attrs" :style="dialogStyle"
        @click.stop>
        <div v-if="$slots.header" class="ui-dialog__header">
          <slot name="header" />
        </div>
        <div class="ui-dialog__body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="ui-dialog__footer">
          <slot name="footer" />
        </div>
      </UiCard>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.ui-dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: var(--ui-dialog-overlay);
  z-index: 10000;
  animation: uiDialogFadeIn 0.18s ease-out;
}

.ui-dialog {
  width: min(100%, 560px);
  max-height: calc(100vh - 48px);
  overflow: hidden;
  animation: uiDialogSlideIn 0.22s ease-out;
}

.ui-dialog__header,
.ui-dialog__footer {
  flex: 0 0 auto;
}

.ui-dialog__header {
  border-bottom: var(--ui-border-width-thin) solid var(--ui-dialog-header-border);
}

.ui-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
}

.ui-dialog__footer {
  border-top: var(--ui-border-width-thin) solid var(--ui-dialog-footer-border);
}

@keyframes uiDialogFadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes uiDialogSlideIn {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
