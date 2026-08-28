<script lang="ts" setup>
import { defineCustomElements } from '@guyantools/ui-core';

defineOptions({ inheritAttrs: false });
defineCustomElements();

type PopupVariant = 'dialog' | 'drawer' | 'floating';
type PopupPlacement = 'center' | 'left' | 'right' | 'top' | 'bottom';
type ClassValue = string | string[] | Record<string, boolean>;
type StyleValue = string | Record<string, string | number>;

const props = withDefaults(defineProps<{
  modelValue: boolean;
  variant?: PopupVariant;
  placement?: PopupPlacement;
  teleported?: boolean;
  teleportTo?: string;
  fixed?: boolean;
  overlay?: boolean;
  width?: string | number;
  maxWidth?: string | number;
  height?: string | number;
  maxHeight?: string | number;
  zIndex?: number | string;
  closeOnMask?: boolean;
  closeOnOutside?: boolean;
  closeOnEsc?: boolean;
  persistent?: boolean;
  role?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  overlayClass?: ClassValue;
  panelClass?: ClassValue;
  panelStyle?: StyleValue;
}>(), {
  variant: 'dialog',
  placement: 'center',
  teleported: true,
  teleportTo: 'body',
  fixed: true,
  overlay: true,
  width: '',
  maxWidth: '',
  height: '',
  maxHeight: '',
  zIndex: 'var(--ui-z-toast)',
  closeOnMask: true,
  closeOnOutside: true,
  closeOnEsc: true,
  persistent: false,
  role: 'dialog',
  ariaLabel: '',
  ariaLabelledby: '',
  overlayClass: '',
  panelClass: '',
  panelStyle: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  open: [];
  close: [];
  maskClick: [event: MouseEvent];
  outsideClick: [event: PointerEvent];
}>();

function handleOpenChange(event: Event): void {
  const detail = (event as CustomEvent<{ open: boolean }>).detail;
  emit('update:modelValue', detail.open);
  if (!detail.open) emit('close');
}

function handleOutside(event: Event): void {
  emit('outsideClick', event as PointerEvent);
}

function handleMask(event: Event): void {
  emit('maskClick', event as MouseEvent);
}
</script>

<template>
  <gt-popup-surface
    :model-value="props.modelValue"
    :variant="props.variant"
    :placement="props.placement"
    :teleported="props.teleported"
    :teleport-to="props.teleportTo"
    :fixed="props.fixed"
    :overlay="props.overlay"
    :width="props.width"
    :max-width="props.maxWidth"
    :height="props.height"
    :max-height="props.maxHeight"
    :z-index="props.zIndex"
    :close-on-mask="props.closeOnMask"
    :close-on-outside="props.closeOnOutside"
    :close-on-esc="props.closeOnEsc"
    :persistent="props.persistent"
    :role="props.role"
    :aria-label="props.ariaLabel || undefined"
    :aria-labelledby="props.ariaLabelledby || undefined"
    :overlay-class="props.overlayClass"
    :panel-class="props.panelClass"
    :panel-style="props.panelStyle"
    v-bind="$attrs"
    @gt-open-change="handleOpenChange"
    @gt-open="emit('open')"
    @gt-close="emit('close')"
    @gt-mask-click="handleMask"
    @gt-outside-click="handleOutside"
  >
    <slot />
  </gt-popup-surface>
</template>
