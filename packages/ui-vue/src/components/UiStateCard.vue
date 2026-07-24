<script setup lang="ts">
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
withDefaults(defineProps<{ state?: 'loading' | 'empty' | 'error' | 'info'; title: string; description?: string; compact?: boolean; }>(), { state: 'info', description: '', compact: false });
</script>
<template><gt-state-card :state="state" :title="title" :description="description" :compact="compact" v-bind="$attrs"><span slot="icon"><slot name="icon" /></span><span slot="actions"><slot name="actions" /></span></gt-state-card></template>
