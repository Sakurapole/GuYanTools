<script setup lang="ts">
import { computed, useAttrs } from 'vue';

import { ensureGuYanElements } from '../register';

defineOptions({ inheritAttrs: false });

ensureGuYanElements();

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
  zIndex?: number | string;
}>(), {
  width: '',
  maxWidth: '',
  closeOnMask: true,
  closeOnEsc: true,
  persistent: false,
  role: 'dialog',
  ariaLabel: '',
  ariaLabelledby: '',
  zIndex: 'var(--gt-z-overlay)',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  open: [];
  close: [];
}>();

const attrs = useAttrs();

function styleValue(value: string | number): string | undefined {
  return value === '' ? undefined : typeof value === 'number' ? `${value}px` : value;
}

const forwardedAttrs = computed(() => {
  const { style: _style, ...rest } = attrs;
  return rest;
});

const hostStyle = computed(() => [
  attrs.style,
  {
    '--gt-dialog-width': styleValue(props.width),
    '--gt-dialog-max-width': styleValue(props.maxWidth),
    '--gt-overlay-z-index': String(props.zIndex),
  },
]);

function change(event: Event): void {
  const detail = (event as CustomEvent<{ open: boolean }>).detail;
  emit('update:modelValue', detail.open);
  if (detail.open) emit('open');
  else emit('close');
}
</script>

<template>
  <gt-dialog
    :open="modelValue"
    :close-on-mask="closeOnMask"
    :close-on-esc="closeOnEsc"
    :persistent="persistent"
    :aria-label="ariaLabel"
    :aria-labelledby="ariaLabelledby || undefined"
    :style="hostStyle"
    v-bind="forwardedAttrs"
    @gt-open-change="change"
  >
    <div v-if="$slots.header" slot="header"><slot name="header" /></div>
    <slot />
    <div v-if="$slots.footer" slot="footer"><slot name="footer" /></div>
  </gt-dialog>
</template>
