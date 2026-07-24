<script setup lang="ts">
import { ref } from 'vue';
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
const props = withDefaults(defineProps<{ modelValue: string; placeholder?: string; disabled?: boolean; readonly?: boolean; size?: 'sm' | 'md' | 'lg'; type?: string; id?: string; list?: string; min?: number; max?: number; step?: number; spellcheck?: boolean | 'true' | 'false'; autocorrect?: string; autocapitalize?: string; }>(), { placeholder: '', disabled: false, readonly: false, size: 'md', type: 'text', id: '', list: '', step: 1 });
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string]; focus: [event: FocusEvent]; blur: [event: FocusEvent]; keydown: [event: KeyboardEvent]; }>();
const element = ref<HTMLElement & { focus: () => void; select: () => void } | null>(null);
function valueFrom(event: Event): string { return (event as CustomEvent<{ value: string }>).detail.value; }
defineExpose({ focus: () => element.value?.focus(), select: () => element.value?.select() });
</script>
<template><gt-input ref="element" :value="props.modelValue" :placeholder="placeholder" :disabled="disabled" :readonly="readonly" :size="size" :type="type" :id="id" :list="list" :min="min" :max="max" :step="step" :spellcheck="spellcheck" :autocorrect="autocorrect" :autocapitalize="autocapitalize" v-bind="$attrs" @gt-input="emit('update:modelValue', valueFrom($event))" @gt-change="emit('change', valueFrom($event))" @focus="emit('focus', $event as FocusEvent)" @blur="emit('blur', $event as FocusEvent)" @keydown="emit('keydown', $event as KeyboardEvent)"><span slot="prefix"><slot name="prefix" /></span><span slot="suffix"><slot name="suffix" /></span></gt-input></template>
