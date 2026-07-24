<script setup lang="ts">
import { computed } from 'vue';
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
const props = withDefaults(defineProps<{ modelValue?: boolean; checked?: boolean; indeterminate?: boolean; disabled?: boolean; size?: 'sm' | 'md'; id?: string; }>(), { modelValue: undefined, checked: undefined, indeterminate: false, disabled: false, size: 'md', id: '' });
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; change: [value: boolean]; }>();
const value = computed(() => props.modelValue ?? props.checked ?? false);
function change(event: Event): void { const checked = (event as CustomEvent<{ checked: boolean }>).detail.checked; emit('update:modelValue', checked); emit('change', checked); }
</script>
<template><gt-checkbox :checked="value" :indeterminate="indeterminate" :disabled="disabled" :size="size" :id="id" v-bind="$attrs" @gt-change="change"><slot /></gt-checkbox></template>
