<script setup lang="ts">
import { useSlots } from 'vue';
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
const slots = useSlots();
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    block?: boolean;
    disabled?: boolean;
    active?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  { variant: 'secondary', size: 'md', block: false, disabled: false, active: false, type: 'button' }
);
</script>
<template>
  <gt-button
    :variant="variant"
    :size="size"
    :block="block"
    :disabled="disabled"
    :active="active"
    :type.attr="type"
    v-bind="$attrs"
  >
    <span v-if="slots.prefix" slot="prefix"><slot name="prefix" /></span>
    <slot />
    <span v-if="slots.suffix" slot="suffix"><slot name="suffix" /></span>
  </gt-button>
</template>
