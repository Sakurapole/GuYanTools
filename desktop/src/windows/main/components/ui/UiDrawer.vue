<script lang="ts" setup>
import UiPopupSurface from './UiPopupSurface.vue';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  width?: string;
  position?: 'right' | 'left';
  closeOnMask?: boolean;
  closeOnEsc?: boolean;
  zIndex?: number | string;
}>(), {
  width: '400px',
  position: 'right',
  closeOnMask: true,
  closeOnEsc: true,
  zIndex: 'var(--ui-z-toast)',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
}>();
</script>

<template>
  <UiPopupSurface
    :model-value="modelValue"
    variant="drawer"
    :placement="position"
    :width="width"
    :close-on-mask="closeOnMask"
    :close-on-esc="closeOnEsc"
    :z-index="zIndex"
    :panel-class="['ui-drawer', `ui-drawer--${position}`]"
    @update:modelValue="emit('update:modelValue', $event)"
    @close="emit('close')"
  >
    <div v-if="$slots.header" class="ui-drawer__header">
      <slot name="header" />
    </div>
    <div class="ui-drawer__body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="ui-drawer__footer">
      <slot name="footer" />
    </div>
  </UiPopupSurface>
</template>

<style lang="scss" scoped>
.ui-drawer {
  display: flex;
  flex-direction: column;
  max-width: 90vw;
  background: var(--ui-card-bg, var(--background-color));
  box-shadow: -6px 0 24px rgba(0, 0, 0, 0.2);
  overflow: hidden;

  &--right {
    border-left: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
  }

  &--left {
    border-right: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
    box-shadow: 6px 0 24px rgba(0, 0, 0, 0.2);
  }
}

.ui-drawer__header {
  flex: 0 0 auto;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
}

.ui-drawer__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.ui-drawer__footer {
  flex: 0 0 auto;
  padding: 12px 20px;
  border-top: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
}
</style>
