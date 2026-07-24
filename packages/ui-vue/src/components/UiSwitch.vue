<script setup lang="ts">
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
withDefaults(defineProps<{ modelValue: boolean; disabled?: boolean; size?: 'sm' | 'md'; ariaLabel?: string; }>(), { disabled: false, size: 'md', ariaLabel: '' });
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; change: [value: boolean]; }>();
function change(event: Event): void { const checked = (event as CustomEvent<{ checked: boolean }>).detail.checked; emit('update:modelValue', checked); emit('change', checked); }
</script>
<template><gt-switch :checked="modelValue" :disabled="disabled" :size="size" :aria-label="ariaLabel" v-bind="$attrs" @gt-change="change" /></template>
