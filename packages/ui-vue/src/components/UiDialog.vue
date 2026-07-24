<script setup lang="ts">
import { computed, ref } from 'vue';
import { useOverlayFocus } from '../composables/useOverlayFocus';
import { useOverlayPosition } from '../composables/useOverlayPosition';
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
const props = withDefaults(defineProps<{ modelValue: boolean; width?: string | number; maxWidth?: string | number; closeOnMask?: boolean; closeOnEsc?: boolean; persistent?: boolean; role?: string; ariaLabel?: string; ariaLabelledby?: string; zIndex?: number | string; }>(), { width: '', maxWidth: '', closeOnMask: true, closeOnEsc: true, persistent: false, role: 'dialog', ariaLabel: '', ariaLabelledby: '', zIndex: 'var(--gt-z-overlay)' });
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; open: []; close: []; }>();
const trigger = ref<HTMLElement | null>(null);
const isOpen = computed(() => props.modelValue);
useOverlayFocus(isOpen, trigger);
useOverlayPosition(isOpen, () => window.dispatchEvent(new Event('resize')));
function styleValue(value: string | number): string | undefined { return value === '' ? undefined : typeof value === 'number' ? `${value}px` : value; }
function change(event: Event): void { const detail = (event as CustomEvent<{ open: boolean }>).detail; emit('update:modelValue', detail.open); if (detail.open) emit('open'); else emit('close'); }
</script>
<template><Teleport to="body"><gt-dialog v-if="modelValue" :open="modelValue" :close-on-mask="closeOnMask" :close-on-esc="closeOnEsc" :persistent="persistent" :aria-label="ariaLabel" v-bind="$attrs" @gt-open-change="change"><section class="ui-vue-dialog" :role="role" :aria-labelledby="ariaLabelledby || undefined" :style="{ width: styleValue(width), maxWidth: styleValue(maxWidth), zIndex }"><header v-if="$slots.header"><slot name="header" /></header><div><slot /></div><footer v-if="$slots.footer"><slot name="footer" /></footer></section></gt-dialog></Teleport></template>
<style scoped>.ui-vue-dialog{display:flex;max-height:inherit;flex-direction:column;overflow:hidden}.ui-vue-dialog>div{min-height:0;flex:1 1 auto}.ui-vue-dialog>header{border-bottom:1px solid var(--gt-color-border)}.ui-vue-dialog>footer{border-top:1px solid var(--gt-color-border)}</style>
