<script setup lang="ts">
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
withDefaults(defineProps<{ variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; shape?: 'square' | 'circle'; disabled?: boolean; active?: boolean; title?: string; label?: string; type?: 'button' | 'submit' | 'reset'; }>(), { variant: 'ghost', size: 'md', shape: 'square', disabled: false, active: false, title: '', label: '', type: 'button' });
</script>
<template><gt-icon-button :variant="variant" :size="size" :shape="shape" :disabled="disabled" :active="active" :title="title" :label="label" :type="type" v-bind="$attrs"><slot /></gt-icon-button></template>
