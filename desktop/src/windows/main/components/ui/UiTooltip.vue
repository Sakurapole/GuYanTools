<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';

type Placement = 'top' | 'right' | 'bottom' | 'left';
type TooltipPoint = { x: number; y: number };

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
const positioned = ref(false);
const pos = ref<TooltipPoint>({ x: 0, y: 0 });
const actualPlacement = ref<Placement>(props.placement);
const arrowStyle = ref<Record<string, string>>({});
const maxWidth = ref('520px');

let showTimer: number | null = null;
let hideTimer: number | null = null;
let positionFrame: number | null = null;

const VIEWPORT_PADDING = 8;
const EDGE_PADDING = 12;
const GAP = 8;

function clearTimers() {
  if (showTimer !== null) { clearTimeout(showTimer); showTimer = null; }
  if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
}

function clearPositionFrame() {
  if (positionFrame !== null) {
    cancelAnimationFrame(positionFrame);
    positionFrame = null;
  }
}

function oppositePlacement(placement: Placement): Placement {
  switch (placement) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

function getPlacementOrder(placement: Placement): Placement[] {
  const opposite = oppositePlacement(placement);
  const rest = (['top', 'bottom', 'right', 'left'] as Placement[]).filter((item) => item !== placement && item !== opposite);
  return [placement, opposite, ...rest];
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function getBasePosition(placement: Placement, triggerRect: DOMRect, tooltipRect: DOMRect): TooltipPoint {
  switch (placement) {
    case 'top':
      return {
        x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        y: triggerRect.top - tooltipRect.height - GAP,
      };
    case 'bottom':
      return {
        x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        y: triggerRect.bottom + GAP,
      };
    case 'left':
      return {
        x: triggerRect.left - tooltipRect.width - GAP,
        y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
      };
    case 'right':
      return {
        x: triggerRect.right + GAP,
        y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
      };
  }
}

function fitsViewport(point: TooltipPoint, tooltipRect: DOMRect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  return (
    point.x >= VIEWPORT_PADDING &&
    point.y >= VIEWPORT_PADDING &&
    point.x + tooltipRect.width <= viewportWidth - VIEWPORT_PADDING &&
    point.y + tooltipRect.height <= viewportHeight - VIEWPORT_PADDING
  );
}

function getVisibleArea(point: TooltipPoint, tooltipRect: DOMRect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = clamp(point.x, VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING);
  const top = clamp(point.y, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING);
  const right = clamp(point.x + tooltipRect.width, VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING);
  const bottom = clamp(point.y + tooltipRect.height, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function updatePosition() {
  const trigger = triggerRef.value;
  const tooltip = tooltipRef.value;
  if (!trigger || !tooltip) return;

  const el = (trigger.firstElementChild as HTMLElement) || trigger;
  const rect = el.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  maxWidth.value = `${Math.max(80, Math.min(520, viewportWidth - VIEWPORT_PADDING * 2))}px`;

  const candidates = getPlacementOrder(props.placement).map((placement) => ({
    placement,
    point: getBasePosition(placement, rect, tooltipRect),
  }));
  const fitted = candidates.find(({ point }) => fitsViewport(point, tooltipRect));
  const best = fitted ?? candidates.reduce((winner, candidate) => (
    getVisibleArea(candidate.point, tooltipRect) > getVisibleArea(winner.point, tooltipRect) ? candidate : winner
  ));

  const x = clamp(best.point.x, VIEWPORT_PADDING, viewportWidth - tooltipRect.width - VIEWPORT_PADDING);
  const y = clamp(best.point.y, VIEWPORT_PADDING, viewportHeight - tooltipRect.height - VIEWPORT_PADDING);
  const anchorX = rect.left + rect.width / 2;
  const anchorY = rect.top + rect.height / 2;

  pos.value = { x, y };
  actualPlacement.value = best.placement;
  arrowStyle.value = best.placement === 'top' || best.placement === 'bottom'
    ? { '--ui-tooltip-arrow-x': `${clamp(anchorX - x, EDGE_PADDING, tooltipRect.width - EDGE_PADDING)}px` }
    : { '--ui-tooltip-arrow-y': `${clamp(anchorY - y, EDGE_PADDING, tooltipRect.height - EDGE_PADDING)}px` };
  positioned.value = true;
}

function schedulePositionUpdate() {
  clearPositionFrame();
  positionFrame = requestAnimationFrame(() => {
    positionFrame = null;
    updatePosition();
  });
}

async function showTooltip() {
  if (props.disabled || !props.content) return;
  clearTimers();
  positioned.value = false;
  visible.value = true;
  await nextTick();
  updatePosition();
  await nextTick();
  schedulePositionUpdate();
}

function hideTooltip() {
  clearTimers();
  clearPositionFrame();
  visible.value = false;
  positioned.value = false;
}

function handleMouseEnter() {
  if (props.disabled || !props.content) return;
  clearTimers();
  showTimer = window.setTimeout(() => {
    void showTooltip();
  }, props.delay);
}

function handleMouseLeave() {
  clearTimers();
  hideTimer = window.setTimeout(() => {
    hideTooltip();
  }, 100);
}

function handlePointerDown() {
  hideTooltip();
}

function handleViewportChange() {
  if (!visible.value) return;
  schedulePositionUpdate();
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    hideTooltip();
  }
}

watch(() => props.disabled, (val) => {
  if (val) hideTooltip();
});

watch(() => [props.content, props.placement] as const, () => {
  if (!visible.value) return;
  void nextTick().then(schedulePositionUpdate);
});

onMounted(() => {
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('keydown', handleKeyDown, true);
});

onBeforeUnmount(() => {
  clearTimers();
  clearPositionFrame();
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
  document.removeEventListener('pointerdown', handlePointerDown, true);
  document.removeEventListener('keydown', handleKeyDown, true);
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
    @click.capture="handlePointerDown"
  >
    <slot />
  </div>

  <Teleport to="body">
    <Transition name="ui-tooltip-fade">
      <div
        v-if="visible && content"
        ref="tooltipRef"
        class="ui-tooltip"
        :class="`ui-tooltip--${actualPlacement}`"
        :style="{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          maxWidth,
          visibility: positioned ? 'visible' : 'hidden',
          ...arrowStyle,
        }"
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
  box-sizing: border-box;

  &__content {
    display: block;
    box-sizing: border-box;
    max-width: 100%;
    padding: 6px 12px;
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.45;
    white-space: normal;
    overflow-wrap: anywhere;
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
    .ui-tooltip__arrow {
      bottom: -3px;
      left: var(--ui-tooltip-arrow-x, 50%);
      margin-left: -4px;
    }
  }

  &--bottom {
    .ui-tooltip__arrow {
      top: -3px;
      left: var(--ui-tooltip-arrow-x, 50%);
      margin-left: -4px;
    }
  }

  &--left {
    .ui-tooltip__arrow {
      right: -3px;
      top: var(--ui-tooltip-arrow-y, 50%);
      margin-top: -4px;
    }
  }

  &--right {
    .ui-tooltip__arrow {
      left: -3px;
      top: var(--ui-tooltip-arrow-y, 50%);
      margin-top: -4px;
    }
  }
}

// ─── Animation ───
.ui-tooltip-fade-enter-active,
.ui-tooltip-fade-leave-active {
  transition: opacity 0.15s ease;
}
.ui-tooltip-fade-enter-from,
.ui-tooltip-fade-leave-to {
  opacity: 0;
}
</style>
