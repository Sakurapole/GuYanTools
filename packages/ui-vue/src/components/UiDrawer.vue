<script setup lang="ts">
import { computed, useAttrs } from 'vue';

import { ensureGuYanElements } from '../register';

defineOptions({ inheritAttrs: false });

ensureGuYanElements();

const props = withDefaults(defineProps<{
  modelValue: boolean;
  width?: string;
  position?: 'right' | 'left';
  teleported?: boolean;
  teleportTo?: string;
  fixed?: boolean;
  overlay?: boolean;
  closeOnMask?: boolean;
  closeOnEsc?: boolean;
  persistent?: boolean;
  zIndex?: number | string;
}>(), {
  width: '400px',
  position: 'right',
  teleported: true,
  teleportTo: 'body',
  fixed: true,
  overlay: true,
  closeOnMask: true,
  closeOnEsc: true,
  persistent: false,
  zIndex: 'var(--gt-z-overlay)',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  open: [];
  close: [];
}>();

const attrs = useAttrs();
const forwardedAttrs = computed(() => {
  const { style: _style, ...rest } = attrs;
  return rest;
});
const hostStyle = computed(() => [
  attrs.style,
  {
    '--gt-drawer-width': props.width,
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
  <gt-drawer
    :open="modelValue"
    :position="position"
    :width="width"
    :overlay="overlay"
    :close-on-mask="closeOnMask"
    :close-on-esc="closeOnEsc"
    :persistent="persistent"
    :style="hostStyle"
    v-bind="forwardedAttrs"
    @gt-open-change="change"
  >
    <div v-if="$slots.header" slot="header"><slot name="header" /></div>
    <slot />
    <div v-if="$slots.footer" slot="footer"><slot name="footer" /></div>
  </gt-drawer>
</template>
