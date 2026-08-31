<script lang="ts" setup>
import { defineCustomElements } from '@guyantools/ui-core';

defineOptions({ inheritAttrs: false });
defineCustomElements();

const props = withDefaults(defineProps<{ title: string; open?: boolean }>(), { open: false });
const emit = defineEmits<{ 'update:open': [value: boolean]; toggle: [value: boolean] }>();

function handleChange(event: Event): void {
  const open = (event as CustomEvent<{ open: boolean }>).detail.open;
  emit('update:open', open);
  emit('toggle', open);
}
</script>

<template>
  <gt-disclosure :heading="props.title" :open="props.open" v-bind="$attrs" @gt-open-change="handleChange">
    <slot />
  </gt-disclosure>
</template>
