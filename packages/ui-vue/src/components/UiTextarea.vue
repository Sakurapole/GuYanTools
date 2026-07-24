<script setup lang="ts">
import { ref } from 'vue';
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
const props = withDefaults(defineProps<{ modelValue: string; placeholder?: string; disabled?: boolean; readonly?: boolean; id?: string; rows?: number; resize?: 'none' | 'vertical' | 'horizontal' | 'both'; }>(), { placeholder: '', disabled: false, readonly: false, id: '', rows: 3, resize: 'vertical' });
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string]; focus: [event: FocusEvent]; blur: [event: FocusEvent]; keydown: [event: KeyboardEvent]; }>();
const element = ref<HTMLElement & { focus: () => void; select: () => void } | null>(null);
function valueFrom(event: Event): string { return (event as CustomEvent<{ value: string }>).detail.value; }
defineExpose({ focus: () => element.value?.focus(), select: () => element.value?.select() });
</script>
<template><gt-textarea ref="element" :value="props.modelValue" :placeholder="placeholder" :disabled="disabled" :readonly="readonly" :id="id" :rows="rows" :resize="resize" v-bind="$attrs" @gt-input="emit('update:modelValue', valueFrom($event))" @gt-change="emit('change', valueFrom($event))" @focus="emit('focus', $event as FocusEvent)" @blur="emit('blur', $event as FocusEvent)" @keydown="emit('keydown', $event as KeyboardEvent)" /></template>
