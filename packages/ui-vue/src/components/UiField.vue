<script setup lang="ts">
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
const props = withDefaults(
  defineProps<{
    label?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    for?: string;
    layout?: 'vertical' | 'horizontal';
  }>(),
  { label: '', hint: '', error: '', required: false, for: '', layout: 'vertical' }
);
</script>
<template>
  <gt-field
    :label="props.label"
    :hint="props.hint"
    :error="props.error"
    :required="props.required"
    :for="props['for']"
    :layout="props.layout"
    v-bind="$attrs"
    ><span v-if="$slots.label" slot="label"><slot name="label" /></span><slot /><span
      v-if="$slots.hint"
      slot="hint"
      ><slot name="hint" /></span
    ><span v-if="$slots.error" slot="error"><slot name="error" /></span
  ></gt-field>
</template>
