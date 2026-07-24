<script setup lang="ts">
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
withDefaults(defineProps<{ icon?: string; title?: string; description?: string; compact?: boolean; }>(), { icon: '', title: '', description: '', compact: false });
</script>
<template><gt-empty-state :title="title" :description="description" :compact="compact" v-bind="$attrs"><span slot="icon"><slot name="icon">{{ icon }}</slot></span><span slot="actions"><slot /></span></gt-empty-state></template>
