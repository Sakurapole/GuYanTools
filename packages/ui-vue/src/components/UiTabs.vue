<script setup lang="ts">
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
export type UiTabItem = { key: string; label: string; disabled?: boolean };
withDefaults(defineProps<{ modelValue: string; items: UiTabItem[]; variant?: 'line' | 'segmented'; size?: 'sm' | 'md'; stretch?: boolean; }>(), { variant: 'line', size: 'md', stretch: false });
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string]; }>();
function change(event: Event): void { const value = (event as CustomEvent<{ value: string }>).detail.value; emit('update:modelValue', value); emit('change', value); }
</script>
<template><gt-tabs :value="modelValue" :items="items.map(item => ({ value: item.key, label: item.label, disabled: item.disabled }))" :variant="variant" :size="size" :stretch="stretch" v-bind="$attrs" @gt-change="change" /></template>
