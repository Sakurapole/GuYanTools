<script setup lang="ts">
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
withDefaults(defineProps<{ content: string; placement?: 'top' | 'right' | 'bottom' | 'left'; disabled?: boolean; delay?: number; block?: boolean; }>(), { placement: 'top', disabled: false, delay: 300, block: false });
</script>
<template><gt-tooltip :content="content" :placement="placement" :disabled="disabled" :delay="delay" :block="block" v-bind="$attrs"><slot /></gt-tooltip></template>
