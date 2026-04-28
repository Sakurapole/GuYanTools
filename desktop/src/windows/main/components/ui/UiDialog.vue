<script lang="ts" setup>
import { computed, useAttrs } from 'vue';
import UiCard from './UiCard.vue';
import UiPopupSurface from './UiPopupSurface.vue';

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
  role?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  zIndex?: number;
}>(), {
  width: '',
  maxWidth: '',
  closeOnMask: true,
  closeOnEsc: true,
  persistent: false,
  role: 'dialog',
  ariaLabel: '',
  ariaLabelledby: '',
  zIndex: 10000,
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

const dialogShellStyle = computed(() => ({
  width: normalizeSize(props.width),
  maxWidth: normalizeSize(props.maxWidth),
}));
</script>

<template>
  <UiPopupSurface
    :model-value="modelValue"
    variant="dialog"
    placement="center"
    panel-class="ui-dialog-shell"
    :panel-style="dialogShellStyle"
    :close-on-mask="closeOnMask"
    :close-on-esc="closeOnEsc"
    :persistent="persistent"
    :role="role"
    :aria-label="ariaLabel"
    :aria-labelledby="ariaLabelledby"
    :z-index="zIndex"
    @update:modelValue="emit('update:modelValue', $event)"
    @open="emit('open')"
    @close="emit('close')"
  >
    <UiCard
      class="ui-dialog"
      variant="elevated"
      padding="none"
      radius="lg"
      v-bind="attrs"
    >
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
  </UiPopupSurface>
</template>

<style lang="scss" scoped>
.ui-dialog-shell {
  width: min(100%, 560px);
  max-height: calc(100vh - 48px);
}

.ui-dialog {
  width: 100%;
  max-width: 100%;
  max-height: inherit;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
</style>
