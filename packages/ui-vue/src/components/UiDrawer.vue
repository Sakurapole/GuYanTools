<script setup lang="ts">
import { computed, ref } from 'vue';
import { useOverlayFocus } from '../composables/useOverlayFocus';
import { useOverlayPosition } from '../composables/useOverlayPosition';
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
const props = withDefaults(defineProps<{ modelValue: boolean; width?: string; position?: 'right' | 'left'; teleported?: boolean; teleportTo?: string; fixed?: boolean; overlay?: boolean; closeOnMask?: boolean; closeOnEsc?: boolean; zIndex?: number | string; }>(), { width: '400px', position: 'right', teleported: true, teleportTo: 'body', fixed: true, overlay: true, closeOnMask: true, closeOnEsc: true, zIndex: 'var(--gt-z-overlay)' });
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; open: []; close: []; }>();
const trigger = ref<HTMLElement | null>(null);
const isOpen = computed(() => props.modelValue);
useOverlayFocus(isOpen, trigger);
useOverlayPosition(isOpen, () => window.dispatchEvent(new Event('resize')));
function change(event: Event): void { const detail = (event as CustomEvent<{ open: boolean }>).detail; emit('update:modelValue', detail.open); if (detail.open) emit('open'); else emit('close'); }
</script>
<template><Teleport :to="teleported ? teleportTo : 'body'"><gt-drawer v-if="modelValue" :open="modelValue" :position="position" :width="width" :overlay="overlay" :close-on-mask="closeOnMask" :close-on-esc="closeOnEsc" v-bind="$attrs" @gt-open-change="change"><section class="ui-vue-drawer" :class="`ui-vue-drawer--${position}`" :style="{ width, zIndex }"><header v-if="$slots.header"><slot name="header" /></header><div><slot /></div><footer v-if="$slots.footer"><slot name="footer" /></footer></section></gt-drawer></Teleport></template>
<style scoped>.ui-vue-drawer{display:flex;height:100%;max-width:90vw;flex-direction:column}.ui-vue-drawer>div{min-height:0;flex:1 1 auto;overflow:auto}.ui-vue-drawer>header,.ui-vue-drawer>footer{padding:var(--gt-space-lg);border-color:var(--gt-color-border);border-style:solid}.ui-vue-drawer>header{border-width:0 0 1px}.ui-vue-drawer>footer{border-width:1px 0 0}</style>
