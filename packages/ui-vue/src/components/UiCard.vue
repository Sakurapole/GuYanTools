<script setup lang="ts">
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
withDefaults(defineProps<{ variant?: 'default' | 'muted' | 'elevated' | 'interactive'; padding?: 'none' | 'sm' | 'md' | 'lg'; radius?: 'sm' | 'md' | 'lg'; bordered?: boolean; hoverable?: boolean; }>(), { variant: 'default', padding: 'md', radius: 'md', bordered: true, hoverable: false });
</script>
<template><gt-card :variant="variant === 'interactive' ? 'default' : variant" :padding="padding" :radius="radius" :hoverable="hoverable || variant === 'interactive'" :interactive="variant === 'interactive'" :bordered="bordered" v-bind="$attrs"><div slot="header"><slot name="header" /></div><slot /><div slot="footer"><slot name="footer" /></div></gt-card></template>
