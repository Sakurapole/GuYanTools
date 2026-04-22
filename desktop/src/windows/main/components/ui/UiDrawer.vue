<script lang="ts" setup>
import { onBeforeUnmount, watch } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  width?: string;
  position?: 'right' | 'left';
  closeOnMask?: boolean;
  closeOnEsc?: boolean;
}>(), {
  width: '400px',
  position: 'right',
  closeOnMask: true,
  closeOnEsc: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

function requestClose() {
  emit('update:modelValue', false);
}

function handleMaskClick() {
  if (props.closeOnMask) {
    requestClose();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.modelValue || !props.closeOnEsc || event.key !== 'Escape') return;
  event.preventDefault();
  requestClose();
}

watch(() => props.modelValue, (value) => {
  if (value) {
    window.addEventListener('keydown', handleKeydown);
  } else {
    window.removeEventListener('keydown', handleKeydown);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-drawer-fade">
      <div v-if="modelValue" class="ui-drawer-overlay" @click="handleMaskClick">
        <Transition :name="`ui-drawer-slide-${position}`">
          <div
            v-if="modelValue"
            class="ui-drawer"
            :class="[`ui-drawer--${position}`]"
            :style="{ width }"
            @click.stop
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
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.ui-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 10000;
  display: flex;
}

.ui-drawer {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  max-width: 90vw;
  background: var(--ui-card-bg, var(--background-color));
  box-shadow: -6px 0 24px rgba(0, 0, 0, 0.2);
  overflow: hidden;

  &--right {
    right: 0;
    border-left: 1px solid var(--ui-border-subtle, rgba(128, 128, 128, 0.12));
  }

  &--left {
    left: 0;
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

/* ─── 遮罩淡入淡出 ─── */
.ui-drawer-fade-enter-active,
.ui-drawer-fade-leave-active {
  transition: opacity 0.25s ease;
}

.ui-drawer-fade-enter-from,
.ui-drawer-fade-leave-to {
  opacity: 0;
}

/* ─── 右侧滑入 ─── */
.ui-drawer-slide-right-enter-active,
.ui-drawer-slide-right-leave-active {
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.ui-drawer-slide-right-enter-from,
.ui-drawer-slide-right-leave-to {
  transform: translateX(100%);
}

/* ─── 左侧滑入 ─── */
.ui-drawer-slide-left-enter-active,
.ui-drawer-slide-left-leave-active {
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.ui-drawer-slide-left-enter-from,
.ui-drawer-slide-left-leave-to {
  transform: translateX(-100%);
}
</style>
