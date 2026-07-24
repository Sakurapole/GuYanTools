<script setup lang="ts">
import { computed, useAttrs } from 'vue';

import { ensureGuYanElements } from '../register';

defineOptions({ inheritAttrs: false });

ensureGuYanElements();

const props = withDefaults(defineProps<{
  content: string;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  disabled?: boolean;
  delay?: number;
  block?: boolean;
}>(), {
  placement: 'top',
  disabled: false,
  delay: 300,
  block: false,
});

const attrs = useAttrs();
const forwardedAttrs = computed(() => ({ ...attrs }));
</script>

<template>
  <gt-tooltip :content="content" :placement="placement" :disabled="disabled" :delay="delay" :block="block" v-bind="forwardedAttrs">
    <slot />
  </gt-tooltip>
</template>
