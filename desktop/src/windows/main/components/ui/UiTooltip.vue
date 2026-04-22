<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';

type Placement = 'top' | 'right' | 'bottom' | 'left';

const props = withDefaults(defineProps<{
  content: string;
  placement?: Placement;
  disabled?: boolean;
  delay?: number;
  block?: boolean;
}>(), {
  placement: 'top',
  disabled: false,
  delay: 300,
  block: false,
});

const triggerRef = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
const visible = ref(false);
const pos = ref({ x: 0, y: 0 });

let showTimer: number | null = null;
let hideTimer: number | null = null;

function clearTimers() {
  if (showTimer !== null) { clearTimeout(showTimer); showTimer = null; }
  if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
}

function updatePosition() {
  const trigger = triggerRef.value;
  if (!trigger) return;

  const el = (trigger.firstElementChild as HTMLElement) || trigger;
  const rect = el.getBoundingClientRect();
  const gap = 8;

  switch (props.placement) {
    case 'top':
      pos.value = { x: rect.left + rect.width / 2, y: rect.top - gap };
      break;
    case 'bottom':
      pos.value = { x: rect.left + rect.width / 2, y: rect.bottom + gap };
      break;
    case 'left':
      pos.value = { x: rect.left - gap, y: rect.top + rect.height / 2 };
      break;
    case 'right':
      pos.value = { x: rect.right + gap, y: rect.top + rect.height / 2 };
      break;
  }
}

function handleMouseEnter() {
  if (props.disabled || !props.content) return;
  clearTimers();
  showTimer = window.setTimeout(() => {
    updatePosition();
    visible.value = true;
  }, props.delay);
}

function handleMouseLeave() {
  clearTimers();
  hideTimer = window.setTimeout(() => {
    visible.value = false;
  }, 100);
}

watch(() => props.disabled, (val) => {
  if (val) {
    clearTimers();
    visible.value = false;
  }
});

onBeforeUnmount(() => {
  clearTimers();
});
</script>

<template>
  <div
    ref="triggerRef"
    class="ui-tooltip-trigger"
    :class="{ 'ui-tooltip-trigger--block': block }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @focus="handleMouseEnter"
    @blur="handleMouseLeave"
  >
    <slot />
  </div>

  <Teleport to="body">
    <Transition name="ui-tooltip-fade">
      <div
        v-if="visible && content"
        ref="tooltipRef"
        class="ui-tooltip"
        :class="`ui-tooltip--${placement}`"
        :style="{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
        }"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
      >
        <span class="ui-tooltip__content">{{ content }}</span>
        <span class="ui-tooltip__arrow" />
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.ui-tooltip-trigger {
  display: inline-flex;
}

.ui-tooltip-trigger--block {
  display: flex;
  width: 100%;
}

.ui-tooltip {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  max-width: 240px;

  &__content {
    display: block;
    padding: 6px 12px;
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.45;
    white-space: nowrap;
    color: var(--ui-text-inverse, #fff);
    background: var(--ui-tooltip-bg, rgba(22, 34, 45, 0.92));
    border-radius: var(--ui-radius-sm, 6px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  &__arrow {
    position: absolute;
    width: 8px;
    height: 8px;
    background: var(--ui-tooltip-bg, rgba(22, 34, 45, 0.92));
    transform: rotate(45deg);
  }

  // ─── Placement ───
  &--top {
    transform: translateX(-50%) translateY(-100%);

    .ui-tooltip__arrow {
      bottom: -3px;
      left: 50%;
      margin-left: -4px;
    }
  }

  &--bottom {
    transform: translateX(-50%);

    .ui-tooltip__arrow {
      top: -3px;
      left: 50%;
      margin-left: -4px;
    }
  }

  &--left {
    transform: translateX(-100%) translateY(-50%);

    .ui-tooltip__arrow {
      right: -3px;
      top: 50%;
      margin-top: -4px;
    }
  }

  &--right {
    transform: translateY(-50%);

    .ui-tooltip__arrow {
      left: -3px;
      top: 50%;
      margin-top: -4px;
    }
  }
}

// ─── Animation ───
.ui-tooltip-fade-enter-active,
.ui-tooltip-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.ui-tooltip-fade-enter-from,
.ui-tooltip-fade-leave-to {
  opacity: 0;
}
</style>
