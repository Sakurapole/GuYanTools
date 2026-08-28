<script lang="ts" setup>
import { defineCustomElements } from '@guyantools/ui-core';

defineOptions({ inheritAttrs: false });
defineCustomElements();

const props = withDefaults(defineProps<{
  visible: boolean;
  x?: number;
  y?: number;
  closeOnClickOutside?: boolean;
  outsideIgnoreSelector?: string | string[];
}>(), {
  x: 0,
  y: 0,
  closeOnClickOutside: true,
  outsideIgnoreSelector: '',
});

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <gt-menu
    :visible="props.visible"
    :x="props.x"
    :y="props.y"
    :close-on-click-outside="props.closeOnClickOutside"
    :outside-ignore-selector="props.outsideIgnoreSelector"
    v-bind="$attrs"
    @gt-close="emit('close')"
  >
    <slot />
  </gt-menu>
</template>
