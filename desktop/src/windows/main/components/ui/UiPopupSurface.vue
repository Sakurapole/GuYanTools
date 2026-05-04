<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue';
import type { CSSProperties, StyleValue } from 'vue';

defineOptions({
  inheritAttrs: false,
});

type PopupVariant = 'dialog' | 'drawer' | 'floating';
type PopupPlacement = 'center' | 'left' | 'right' | 'top' | 'bottom';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  variant?: PopupVariant;
  placement?: PopupPlacement;
  teleported?: boolean;
  teleportTo?: string;
  overlay?: boolean;
  fixed?: boolean;
  width?: string | number;
  maxWidth?: string | number;
  height?: string | number;
  maxHeight?: string | number;
  zIndex?: number;
  closeOnMask?: boolean;
  closeOnOutside?: boolean;
  closeOnEsc?: boolean;
  persistent?: boolean;
  role?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  overlayClass?: string | string[] | Record<string, boolean>;
  panelClass?: string | string[] | Record<string, boolean>;
  panelStyle?: StyleValue;
  outsideIgnoreSelector?: string | string[];
  transitionName?: string;
  panelTransitionName?: string;
}>(), {
  variant: 'dialog',
  placement: 'center',
  teleported: true,
  teleportTo: 'body',
  overlay: true,
  fixed: true,
  width: '',
  maxWidth: '',
  height: '',
  maxHeight: '',
  zIndex: 10000,
  closeOnMask: true,
  closeOnOutside: true,
  closeOnEsc: true,
  persistent: false,
  role: 'dialog',
  ariaLabel: '',
  ariaLabelledby: '',
  overlayClass: '',
  panelClass: '',
  panelStyle: undefined,
  outsideIgnoreSelector: '',
  transitionName: '',
  panelTransitionName: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  open: [];
  close: [];
  maskClick: [event: MouseEvent];
  outsideClick: [event: PointerEvent];
}>();

const attrs = useAttrs();
const panelRef = ref<HTMLElement | null>(null);

function normalizeSize(value: string | number | undefined) {
  if (value === '' || value === undefined) {
    return undefined;
  }

  return typeof value === 'number' ? `${value}px` : value;
}

const hasOverlay = computed(() => props.overlay && props.variant !== 'floating');
const overlayTransition = computed(() => props.transitionName || 'ui-popup-fade');
const panelTransition = computed(() => {
  if (props.panelTransitionName) {
    return props.panelTransitionName;
  }

  if (props.variant === 'drawer') {
    if (props.placement === 'left' || props.placement === 'top' || props.placement === 'bottom') {
      return `ui-popup-drawer-${props.placement}`;
    }

    return 'ui-popup-drawer-right';
  }

  if (props.variant === 'floating') {
    return 'ui-popup-float';
  }

  return 'ui-popup-dialog';
});

const surfaceClass = computed(() => [
  'ui-popup-surface',
  `ui-popup-surface--${props.variant}`,
  `ui-popup-surface--${props.placement}`,
  props.fixed ? 'ui-popup-surface--fixed' : 'ui-popup-surface--absolute',
  { 'ui-popup-surface--overlayless': !hasOverlay.value },
  props.overlayClass,
]);

const panelClassValue = computed(() => [
  'ui-popup-surface__panel',
  `ui-popup-surface__panel--${props.variant}`,
  `ui-popup-surface__panel--${props.placement}`,
  props.panelClass,
]);

const surfaceStyle = computed<CSSProperties>(() => ({
  zIndex: props.zIndex,
}));

const basePanelStyle = computed<CSSProperties>(() => ({
  width: normalizeSize(props.width),
  maxWidth: normalizeSize(props.maxWidth),
  height: normalizeSize(props.height),
  maxHeight: normalizeSize(props.maxHeight),
}));

function requestClose() {
  if (props.persistent) {
    return;
  }

  emit('update:modelValue', false);
  emit('close');
}

function handleMaskClick(event: MouseEvent) {
  emit('maskClick', event);
  if (!props.closeOnMask) {
    return;
  }

  requestClose();
}

function handleDocumentPointerdown(event: PointerEvent) {
  if (!props.modelValue || hasOverlay.value || !props.closeOnOutside) {
    return;
  }

  const target = event.target as Node | null;
  if (target && panelRef.value?.contains(target)) {
    return;
  }

  const targetElement = target instanceof Element
    ? target
    : target?.parentElement;
  const ignoreSelectors = Array.isArray(props.outsideIgnoreSelector)
    ? props.outsideIgnoreSelector
    : [props.outsideIgnoreSelector];

  if (targetElement && ignoreSelectors.some(selector => selector && targetElement.closest(selector))) {
    return;
  }

  emit('outsideClick', event);
  requestClose();
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.modelValue || !props.closeOnEsc || event.key !== 'Escape') {
    return;
  }

  event.preventDefault();
  requestClose();
}

watch(() => props.modelValue, (value) => {
  if (value) {
    emit('open');
    return;
  }
});

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerdown, true);
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerdown, true);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport :to="teleportTo" :disabled="!teleported">
    <Transition :name="overlayTransition">
      <div
        v-if="modelValue"
        :class="surfaceClass"
        :style="surfaceStyle"
        @click.self="hasOverlay ? handleMaskClick($event) : undefined"
      >
        <Transition :name="panelTransition" appear>
          <div
            v-if="modelValue"
            ref="panelRef"
            :class="panelClassValue"
            :style="[basePanelStyle, panelStyle]"
            :role="role"
            :aria-modal="hasOverlay ? 'true' : undefined"
            :aria-label="ariaLabel || undefined"
            :aria-labelledby="ariaLabelledby || undefined"
            v-bind="attrs"
            @click.stop
          >
            <slot />
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.ui-popup-surface {
  inset: 0;
  box-sizing: border-box;

  &,
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
}

.ui-popup-surface--fixed {
  position: fixed;
}

.ui-popup-surface--absolute {
  position: absolute;
}

.ui-popup-surface--dialog {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--ui-dialog-overlay);
  backdrop-filter: var(--ui-backdrop-blur-sm, blur(4px));
  -webkit-backdrop-filter: var(--ui-backdrop-blur-sm, blur(4px));
}

.ui-popup-surface--drawer {
  display: flex;
  background: rgba(0, 0, 0, 0.35);
}

.ui-popup-surface--left {
  justify-content: flex-start;
}

.ui-popup-surface--right {
  justify-content: flex-end;
}

.ui-popup-surface--top {
  align-items: flex-start;
}

.ui-popup-surface--bottom {
  align-items: flex-end;
}

.ui-popup-surface--floating,
.ui-popup-surface--overlayless {
  inset: auto;
  background: transparent;
  pointer-events: none;
}

.ui-popup-surface__panel {
  pointer-events: auto;
  min-width: 0;
  min-height: 0;
}

.ui-popup-surface__panel--dialog {
  width: min(100%, 560px);
  max-height: calc(100vh - 48px);
  overflow: hidden;
}

.ui-popup-surface__panel--drawer {
  height: 100%;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  background: var(--ui-card-bg, var(--background-color));
  box-shadow: -6px 0 24px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.ui-popup-surface__panel--drawer.ui-popup-surface__panel--right {
  border-left: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
}

.ui-popup-surface__panel--drawer.ui-popup-surface__panel--left {
  border-right: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
  box-shadow: 6px 0 24px rgba(0, 0, 0, 0.2);
}

.ui-popup-surface__panel--floating {
  position: fixed;
}

</style>
