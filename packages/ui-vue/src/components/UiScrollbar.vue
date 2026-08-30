<script setup lang="ts">
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
const props = withDefaults(defineProps<{ x?: boolean; y?: boolean; showOnHover?: boolean; thumbColor?: string; thumbHoverColor?: string; trackColor?: string; alwaysVisible?: boolean; size?: number }>(), { x: true, y: true, showOnHover: true, thumbColor: '', thumbHoverColor: '', trackColor: '', alwaysVisible: false, size: 0 });
const emit = defineEmits<{ scroll: [event: Event] }>();
</script>
<template><gt-scrollbar :x="props.x" :y="props.y" :show-on-hover="props.showOnHover" :thumb-color="props.thumbColor" :thumb-hover-color="props.thumbHoverColor" :track-color="props.trackColor" :always-visible="props.alwaysVisible" :size="props.size" v-bind="$attrs" @gt-scroll="emit('scroll', $event)"><slot /></gt-scrollbar></template>
