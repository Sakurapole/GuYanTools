<script setup lang="ts" generic="T extends string | number | boolean">
import { computed } from 'vue';
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
const props = withDefaults(defineProps<{ modelValue: T; value: T; disabled?: boolean; size?: 'sm' | 'md'; id?: string; name?: string; }>(), { disabled: false, size: 'md', id: '', name: '' });
const emit = defineEmits<{ 'update:modelValue': [value: T]; change: [value: T]; }>();
const checked = computed(() => props.modelValue === props.value);
function change(event: Event): void { if ((event as CustomEvent<{ checked: boolean }>).detail.checked) { emit('update:modelValue', props.value); emit('change', props.value); } }
</script>
<template><gt-radio :checked="checked" :disabled="disabled" :size="size" :id="id" :name="name" :value="String(value)" v-bind="$attrs" @gt-change="change"><slot /></gt-radio></template>
