<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

type AxisKey = 'x' | 'y';

interface AxisMetrics {
  hasOverflow: boolean;
  viewportSize: number;
  contentSize: number;
  scrollOffset: number;
  maxScroll: number;
  trackSize: number;
  thumbSize: number;
  thumbOffset: number;
}

interface DragState {
  axis: AxisKey;
  pointerId: number;
  startPointer: number;
  startThumbOffset: number;
  maxThumbTravel: number;
  maxScroll: number;
  captureTarget: HTMLElement | null;
}

const props = withDefaults(defineProps<{
  x?: boolean;
  y?: boolean;
  showOnHover?: boolean;
  thumbColor?: string;
  thumbHoverColor?: string;
  trackColor?: string;
  alwaysVisible?: boolean;
  size?: number;
}>(), {
  x: true,
  y: true,
  showOnHover: true,
  thumbColor: '',
  thumbHoverColor: '',
  trackColor: '',
  alwaysVisible: false,
  size: 0,
});

const emit = defineEmits<{
  scroll: [event: Event];
}>();

const rootRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const isHovering = ref(false);
const isScrolling = ref(false);
const draggingAxis = ref<AxisKey | null>(null);
const hasHorizontalScroll = ref(false);
const hasVerticalScroll = ref(false);

const styleMetrics = reactive({
  size: 12,
  minThumbSize: 28,
  trackInset: 4,
});

const nativeScrollbarSize = reactive({
  x: 0,
  y: 0,
});

const axisMetrics = reactive<Record<AxisKey, AxisMetrics>>({
  x: createAxisMetrics(),
  y: createAxisMetrics(),
});

let resizeObserver: ResizeObserver | null = null;
let hideTimer: number | null = null;
let refreshFrame: number | null = null;
let dragState: DragState | null = null;

function createAxisMetrics(): AxisMetrics {
  return {
    hasOverflow: false,
    viewportSize: 0,
    contentSize: 0,
    scrollOffset: 0,
    maxScroll: 0,
    trackSize: 0,
    thumbSize: 0,
    thumbOffset: 0,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readLengthVariable(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readStyleMetrics() {
  const root = rootRef.value;
  if (!root) {
    return;
  }

  const styles = getComputedStyle(root);
  styleMetrics.size = readLengthVariable(styles.getPropertyValue('--ui-scrollbar-size'), styleMetrics.size);
  styleMetrics.minThumbSize = readLengthVariable(
    styles.getPropertyValue('--ui-scrollbar-min-thumb-size'),
    styleMetrics.minThumbSize
  );
  styleMetrics.trackInset = readLengthVariable(
    styles.getPropertyValue('--ui-scrollbar-track-inset'),
    styleMetrics.trackInset
  );
}

function resetAxis(axis: AxisKey) {
  Object.assign(axisMetrics[axis], createAxisMetrics());
}

function getTrackSize(axis: AxisKey, nextHasX: boolean, nextHasY: boolean) {
  const viewport = viewportRef.value;
  if (!viewport) {
    return 0;
  }

  const baseSize = axis === 'x' ? viewport.clientWidth : viewport.clientHeight;
  const crossOffset = axis === 'x'
    ? (nextHasY ? styleMetrics.size : 0)
    : (nextHasX ? styleMetrics.size : 0);

  return Math.max(0, baseSize - (styleMetrics.trackInset * 2) - crossOffset);
}

function updateAxisMetrics(axis: AxisKey, nextHasX: boolean, nextHasY: boolean) {
  const viewport = viewportRef.value;
  if (!viewport) {
    resetAxis(axis);
    return;
  }

  const enabled = axis === 'x' ? props.x : props.y;
  if (!enabled) {
    resetAxis(axis);
    return;
  }

  const viewportSize = axis === 'x' ? viewport.clientWidth : viewport.clientHeight;
  const contentSize = axis === 'x' ? viewport.scrollWidth : viewport.scrollHeight;
  const scrollOffset = axis === 'x' ? viewport.scrollLeft : viewport.scrollTop;
  const maxScroll = Math.max(0, contentSize - viewportSize);
  const hasOverflow = axis === 'x' ? nextHasX : nextHasY;

  if (!hasOverflow) {
    Object.assign(axisMetrics[axis], {
      hasOverflow: false,
      viewportSize,
      contentSize,
      scrollOffset,
      maxScroll,
      trackSize: 0,
      thumbSize: 0,
      thumbOffset: 0,
    });
    return;
  }

  const trackSize = getTrackSize(axis, nextHasX, nextHasY);
  const rawThumbSize = contentSize > 0 ? (trackSize * viewportSize) / contentSize : 0;
  const thumbSize = clamp(rawThumbSize, Math.min(trackSize, styleMetrics.minThumbSize), trackSize);
  const maxThumbTravel = Math.max(0, trackSize - thumbSize);
  const thumbOffset = maxScroll > 0 ? (scrollOffset / maxScroll) * maxThumbTravel : 0;

  Object.assign(axisMetrics[axis], {
    hasOverflow,
    viewportSize,
    contentSize,
    scrollOffset,
    maxScroll,
    trackSize,
    thumbSize,
    thumbOffset,
  });
}

function updateMetrics() {
  readStyleMetrics();

  const viewport = viewportRef.value;
  if (!viewport) {
    hasHorizontalScroll.value = false;
    hasVerticalScroll.value = false;
    nativeScrollbarSize.x = 0;
    nativeScrollbarSize.y = 0;
    resetAxis('x');
    resetAxis('y');
    return;
  }

  const nextHasX = props.x && viewport.scrollWidth - viewport.clientWidth > 1;
  const nextHasY = props.y && viewport.scrollHeight - viewport.clientHeight > 1;
  const nextNativeScrollbarWidth = nextHasY ? Math.max(0, viewport.offsetWidth - viewport.clientWidth) : 0;
  const nextNativeScrollbarHeight = nextHasX ? Math.max(0, viewport.offsetHeight - viewport.clientHeight) : 0;
  const compensationChanged = nativeScrollbarSize.x !== nextNativeScrollbarWidth
    || nativeScrollbarSize.y !== nextNativeScrollbarHeight;

  hasHorizontalScroll.value = nextHasX;
  hasVerticalScroll.value = nextHasY;
  nativeScrollbarSize.x = nextNativeScrollbarWidth;
  nativeScrollbarSize.y = nextNativeScrollbarHeight;

  updateAxisMetrics('x', nextHasX, nextHasY);
  updateAxisMetrics('y', nextHasX, nextHasY);

  if (compensationChanged) {
    scheduleRefresh();
  }
}

function scheduleRefresh() {
  if (refreshFrame !== null) {
    cancelAnimationFrame(refreshFrame);
  }

  refreshFrame = requestAnimationFrame(() => {
    refreshFrame = null;
    updateMetrics();
  });
}

function clearHideTimer() {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function scheduleHide() {
  if (props.alwaysVisible || !props.showOnHover || draggingAxis.value || isHovering.value) {
    return;
  }

  clearHideTimer();
  hideTimer = window.setTimeout(() => {
    if (!draggingAxis.value && !isHovering.value) {
      isScrolling.value = false;
    }
  }, 200);
}

function showScrollbar() {
  if (props.alwaysVisible || !props.showOnHover) {
    return;
  }

  clearHideTimer();
  isScrolling.value = true;
}

function handleMouseEnter() {
  isHovering.value = true;
  showScrollbar();
}

function handleMouseLeave() {
  isHovering.value = false;
  scheduleHide();
}

function setAxisScroll(axis: AxisKey, value: number) {
  const viewport = viewportRef.value;
  if (!viewport) {
    return;
  }

  if (axis === 'x') {
    viewport.scrollTo({ left: value, top: viewport.scrollTop, behavior: 'auto' });
    return;
  }

  viewport.scrollTo({ left: viewport.scrollLeft, top: value, behavior: 'auto' });
}

function refresh() {
  scheduleRefresh();
}

function handleScroll(event: Event) {
  showScrollbar();
  scheduleHide();
  scheduleRefresh();
  emit('scroll', event);
}

function canScrollAxis(axis: AxisKey, delta: number) {
  const viewport = viewportRef.value;
  if (!viewport || delta === 0) {
    return false;
  }

  if (axis === 'x') {
    if (!props.x) {
      return false;
    }

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    if (maxScrollLeft <= 0) {
      return false;
    }

    return delta < 0
      ? viewport.scrollLeft > 0
      : viewport.scrollLeft < maxScrollLeft - 1;
  }

  if (!props.y) {
    return false;
  }

  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  if (maxScrollTop <= 0) {
    return false;
  }

  return delta < 0
    ? viewport.scrollTop > 0
    : viewport.scrollTop < maxScrollTop - 1;
}

function handleWheel(event: WheelEvent) {
  const canConsumeY = canScrollAxis('y', event.deltaY);
  const canConsumeX = canScrollAxis('x', event.deltaX);

  if (!canConsumeX && !canConsumeY) {
    return;
  }

  showScrollbar();
  scheduleHide();
  event.stopPropagation();
}

function scrollBy(options: ScrollToOptions) {
  viewportRef.value?.scrollBy(options);
}

function scrollTo(options: ScrollToOptions) {
  viewportRef.value?.scrollTo(options);
}

function handleRailPointerDown(axis: AxisKey, event: PointerEvent) {
  const metrics = axisMetrics[axis];
  if (!metrics.hasOverflow) {
    return;
  }

  const rail = event.currentTarget as HTMLElement | null;
  if (!rail) {
    return;
  }

  const rect = rail.getBoundingClientRect();
  const pointerPosition = axis === 'x'
    ? event.clientX - rect.left
    : event.clientY - rect.top;
  const maxThumbTravel = Math.max(0, metrics.trackSize - metrics.thumbSize);
  const nextThumbOffset = clamp(pointerPosition - (metrics.thumbSize / 2), 0, maxThumbTravel);
  const nextScroll = maxThumbTravel > 0
    ? (nextThumbOffset / maxThumbTravel) * metrics.maxScroll
    : 0;

  event.preventDefault();
  showScrollbar();
  setAxisScroll(axis, nextScroll);
  scheduleHide();
  scheduleRefresh();
}

function handleThumbPointerDown(axis: AxisKey, event: PointerEvent) {
  const metrics = axisMetrics[axis];
  if (!metrics.hasOverflow) {
    return;
  }

  const captureTarget = event.currentTarget as HTMLElement | null;
  captureTarget?.setPointerCapture?.(event.pointerId);

  dragState = {
    axis,
    pointerId: event.pointerId,
    startPointer: axis === 'x' ? event.clientX : event.clientY,
    startThumbOffset: metrics.thumbOffset,
    maxThumbTravel: Math.max(0, metrics.trackSize - metrics.thumbSize),
    maxScroll: metrics.maxScroll,
    captureTarget,
  };

  draggingAxis.value = axis;
  showScrollbar();
  clearHideTimer();

  window.addEventListener('pointermove', handleDragPointerMove);
  window.addEventListener('pointerup', handleDragPointerEnd);
  window.addEventListener('pointercancel', handleDragPointerEnd);

  event.preventDefault();
}

function stopDrag(pointerId?: number) {
  if (dragState?.captureTarget && pointerId !== undefined && dragState.captureTarget.hasPointerCapture?.(pointerId)) {
    dragState.captureTarget.releasePointerCapture(pointerId);
  }

  dragState = null;
  draggingAxis.value = null;

  window.removeEventListener('pointermove', handleDragPointerMove);
  window.removeEventListener('pointerup', handleDragPointerEnd);
  window.removeEventListener('pointercancel', handleDragPointerEnd);

  scheduleHide();
}

function handleDragPointerMove(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  const pointerPosition = dragState.axis === 'x' ? event.clientX : event.clientY;
  const delta = pointerPosition - dragState.startPointer;
  const nextThumbOffset = clamp(dragState.startThumbOffset + delta, 0, dragState.maxThumbTravel);
  const nextScroll = dragState.maxThumbTravel > 0
    ? (nextThumbOffset / dragState.maxThumbTravel) * dragState.maxScroll
    : 0;

  setAxisScroll(dragState.axis, nextScroll);
  scheduleRefresh();
  event.preventDefault();
}

function handleDragPointerEnd(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  stopDrag(event.pointerId);
}

function bindResizeObserver() {
  resizeObserver?.disconnect();

  resizeObserver = new ResizeObserver(() => {
    scheduleRefresh();
  });

  if (viewportRef.value) {
    resizeObserver.observe(viewportRef.value);
  }

  if (contentRef.value) {
    resizeObserver.observe(contentRef.value);
  }
}

const isScrollbarVisible = computed(() => (
  props.alwaysVisible
  || !props.showOnHover
  || isHovering.value
  || isScrolling.value
  || draggingAxis.value !== null
));

const rootClass = computed(() => [
  'ui-scrollbar',
  {
    'ui-scrollbar--x': props.x,
    'ui-scrollbar--y': props.y,
    'ui-scrollbar--visible': isScrollbarVisible.value,
    'ui-scrollbar--has-x': hasHorizontalScroll.value,
    'ui-scrollbar--has-y': hasVerticalScroll.value,
  },
]);

const rootStyle = computed(() => {
  const style: Record<string, string> = {
    '--ui-scrollbar-thumb-color': props.thumbColor || 'var(--scrollbar-thumb)',
    '--ui-scrollbar-thumb-hover-color': props.thumbHoverColor || 'var(--scrollbar-thumb-hover)',
    '--ui-scrollbar-track-color': props.trackColor || 'var(--scrollbar-track)',
  };

  if (props.size > 0) {
    style['--ui-scrollbar-size'] = `${props.size}px`;
  }

  return style;
});

const viewportStyle = computed(() => ({
  width: nativeScrollbarSize.x > 0 ? `calc(100% + ${nativeScrollbarSize.x}px)` : '100%',
  height: nativeScrollbarSize.y > 0 ? `calc(100% + ${nativeScrollbarSize.y}px)` : '100%',
  marginRight: nativeScrollbarSize.x > 0 ? `${-nativeScrollbarSize.x}px` : '0',
  marginBottom: nativeScrollbarSize.y > 0 ? `${-nativeScrollbarSize.y}px` : '0',
}));

const railXStyle = computed(() => ({
  left: `${styleMetrics.trackInset}px`,
  right: `${styleMetrics.trackInset + (hasVerticalScroll.value ? styleMetrics.size : 0)}px`,
  bottom: `${styleMetrics.trackInset}px`,
  height: `${styleMetrics.size}px`,
}));

const railYStyle = computed(() => ({
  top: `${styleMetrics.trackInset}px`,
  bottom: `${styleMetrics.trackInset + (hasHorizontalScroll.value ? styleMetrics.size : 0)}px`,
  right: `${styleMetrics.trackInset}px`,
  width: `${styleMetrics.size}px`,
}));

const thumbXStyle = computed(() => ({
  width: `${axisMetrics.x.thumbSize}px`,
  transform: `translate3d(${axisMetrics.x.thumbOffset}px, 0, 0)`,
}));

const thumbYStyle = computed(() => ({
  height: `${axisMetrics.y.thumbSize}px`,
  transform: `translate3d(0, ${axisMetrics.y.thumbOffset}px, 0)`,
}));

watch(
  () => [props.x, props.y],
  () => {
    void nextTick(refresh);
  }
);

onMounted(() => {
  bindResizeObserver();
  void nextTick(refresh);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;

  if (refreshFrame !== null) {
    cancelAnimationFrame(refreshFrame);
    refreshFrame = null;
  }

  clearHideTimer();
  stopDrag();
});

defineExpose({
  viewportRef,
  refresh,
  updateScrollableState: refresh,
  scrollBy,
  scrollTo,
});
</script>

<template>
  <div ref="rootRef" :class="rootClass" :style="rootStyle" @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave">
    <div ref="viewportRef" class="ui-scrollbar__viewport" :style="viewportStyle" @wheel.passive="handleWheel"
      @scroll="handleScroll">
      <div ref="contentRef" class="ui-scrollbar__content">
        <slot />
      </div>
    </div>

    <div v-if="props.x" class="ui-scrollbar__rail ui-scrollbar__rail--x" :class="{
      'is-active': hasHorizontalScroll,
      'is-visible': isScrollbarVisible,
      'is-dragging': draggingAxis === 'x',
    }" :style="railXStyle" @pointerdown="handleRailPointerDown('x', $event)">
      <div class="ui-scrollbar__thumb ui-scrollbar__thumb--x" :style="thumbXStyle"
        @pointerdown.stop="handleThumbPointerDown('x', $event)" />
    </div>

    <div v-if="props.y" class="ui-scrollbar__rail ui-scrollbar__rail--y" :class="{
      'is-active': hasVerticalScroll,
      'is-visible': isScrollbarVisible,
      'is-dragging': draggingAxis === 'y',
    }" :style="railYStyle" @pointerdown="handleRailPointerDown('y', $event)">
      <div class="ui-scrollbar__thumb ui-scrollbar__thumb--y" :style="thumbYStyle"
        @pointerdown.stop="handleThumbPointerDown('y', $event)" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ui-scrollbar {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  --ui-scrollbar-size: 12px;
  --ui-scrollbar-min-thumb-size: 28px;
  --ui-scrollbar-track-inset: 4px;
}

.ui-scrollbar__viewport {
  display: block;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
}

.ui-scrollbar__content {
  min-width: 100%;
  min-height: 100%;
}

.ui-scrollbar--x .ui-scrollbar__viewport {
  overflow-x: auto;
}

.ui-scrollbar--y .ui-scrollbar__viewport {
  overflow-y: auto;
}

.ui-scrollbar__rail {
  position: absolute;
  z-index: 3;
  border-radius: var(--ui-radius-full);
  background: var(--ui-scrollbar-track-color);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    background 0.18s ease;

  &.is-active.is-visible,
  &.is-dragging {
    opacity: 1;
    pointer-events: auto;
  }
}

.ui-scrollbar__rail--x {
  left: 0;
}

.ui-scrollbar__rail--y {
  top: 0;
}

.ui-scrollbar__thumb {
  position: absolute;
  border-radius: var(--ui-radius-full);
  background: var(--ui-scrollbar-thumb-color);
  transition: background 0.18s ease;
  touch-action: none;
  user-select: none;

  &:hover {
    background: var(--ui-scrollbar-thumb-hover-color);
  }
}

.ui-scrollbar__thumb--x {
  top: 0;
  left: 0;
  height: 100%;
}

.ui-scrollbar__thumb--y {
  top: 0;
  left: 0;
  width: 100%;
}

.ui-scrollbar__rail.is-dragging .ui-scrollbar__thumb,
.ui-scrollbar__rail:hover .ui-scrollbar__thumb {
  background: var(--ui-scrollbar-thumb-hover-color);
}
</style>
