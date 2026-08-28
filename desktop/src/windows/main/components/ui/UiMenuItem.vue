<script lang="ts" setup>
import { defineCustomElements } from '@guyantools/ui-core';

defineOptions({ inheritAttrs: false });
defineCustomElements();

const props = withDefaults(defineProps<{ danger?: boolean; disabled?: boolean }>(), {
  danger: false,
  disabled: false,
});

const emit = defineEmits<{ click: [event: MouseEvent] }>();

function handleClick(event: MouseEvent): void {
  if (!props.disabled) emit('click', event);
}
</script>

<template>
  <gt-menu-item :danger="props.danger" :disabled="props.disabled" v-bind="$attrs" @click="handleClick">
    <span v-if="$slots.icon" slot="icon"><slot name="icon" /></span>
    <slot />
    <span v-if="$slots.suffix" slot="suffix"><slot name="suffix" /></span>
  </gt-menu-item>
</template>
