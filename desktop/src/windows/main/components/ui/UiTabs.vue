<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';

type TabsVariant = 'line' | 'segmented';
type TabsSize = 'sm' | 'md';

export type UiTabItem = {
  key: string;
  label: string;
  disabled?: boolean;
};

const props = withDefaults(defineProps<{
  modelValue: string;
  items: UiTabItem[];
  variant?: TabsVariant;
  size?: TabsSize;
  stretch?: boolean;
}>(), {
  variant: 'line',
  size: 'md',
  stretch: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
}>();

const tabsRef = ref<HTMLElement | null>(null);
const activeIndicatorStyle = ref<CSSProperties>({});
let resizeObserver: ResizeObserver | undefined;

const tabsClass = computed(() => [
  'ui-tabs',
  `ui-tabs--${props.variant}`,
  `ui-tabs--${props.size}`,
  {
    'ui-tabs--stretch': props.stretch,
  },
]);

function updateActiveIndicator() {
  const root = tabsRef.value;
  const activeButton = root?.querySelector<HTMLElement>('.ui-tabs__item.is-active');
  if (!root || !activeButton) {
    activeIndicatorStyle.value = { opacity: 0 };
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const activeRect = activeButton.getBoundingClientRect();
  activeIndicatorStyle.value = {
    opacity: 1,
    width: `${activeRect.width}px`,
    transform: `translate3d(${activeRect.left - rootRect.left}px, 0, 0)`,
  };
}

function queueIndicatorUpdate() {
  void nextTick(updateActiveIndicator);
}

function selectTab(item: UiTabItem) {
  if (item.disabled || item.key === props.modelValue) {
    return;
  }

  emit('update:modelValue', item.key);
  emit('change', item.key);
}

watch(() => [props.modelValue, props.items, props.variant, props.stretch], queueIndicatorUpdate, { deep: true });

onMounted(() => {
  queueIndicatorUpdate();
  if (typeof ResizeObserver !== 'undefined' && tabsRef.value) {
    resizeObserver = new ResizeObserver(queueIndicatorUpdate);
    resizeObserver.observe(tabsRef.value);
  }
  window.addEventListener('resize', queueIndicatorUpdate);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('resize', queueIndicatorUpdate);
});
</script>

<template>
  <div ref="tabsRef" :class="tabsClass" role="tablist">
    <span class="ui-tabs__active-indicator" :style="activeIndicatorStyle" aria-hidden="true" />
    <button v-for="item in items" :key="item.key" class="ui-tabs__item"
      :class="{ 'is-active': item.key === modelValue }" :disabled="item.disabled" type="button" role="tab"
      :aria-selected="item.key === modelValue" @click="selectTab(item)">
      <slot name="label" :item="item">
        {{ item.label }}
      </slot>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.ui-tabs {
  position: relative;
  display: inline-flex;
  gap: 8px;

  &--stretch {
    display: flex;
    width: 100%;

    .ui-tabs__item {
      flex: 1 1 0;
    }
  }

  &--line {
    border-bottom: var(--ui-border-width-thin) solid var(--ui-tabs-border);
  }

  &--segmented {
    padding: 4px;
    background: var(--ui-tabs-segmented-bg);
    border: var(--ui-border-width-thin) solid var(--ui-tabs-border);
    border-radius: var(--ui-radius-md);
  }
}

.ui-tabs__item {
  appearance: none;
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--ui-tabs-text);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  transition:
    color 0.18s ease,
    background-color 0.18s ease,
    transform 0.18s ease;

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }

  &:hover:not(:disabled) {
    color: var(--ui-tabs-hover-text);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.is-active {
    color: var(--ui-tabs-active-text);
  }
}

.ui-tabs--sm .ui-tabs__item {
  min-height: var(--ui-control-height-sm);
  padding: 6px var(--ui-control-padding-x-sm);
  font-size: 0.84rem;
}

.ui-tabs--md .ui-tabs__item {
  min-height: 40px;
  padding: 9px var(--ui-control-padding-x-lg);
  font-size: 0.9rem;
}

.ui-tabs--line .ui-tabs__item {
  &.is-active {
    background: var(--ui-tabs-active-bg);
  }
}

.ui-tabs--segmented .ui-tabs__item {
  border-radius: var(--ui-radius-xs);
}

.ui-tabs__active-indicator {
  position: absolute;
  left: 0;
  pointer-events: none;
  opacity: 0;
  transition:
    width var(--ui-motion-duration-base) var(--ui-motion-ease-emphasized),
    transform var(--ui-motion-duration-base) var(--ui-motion-ease-emphasized),
    opacity var(--ui-motion-duration-fast) var(--ui-motion-ease-standard);
}

.ui-tabs--line .ui-tabs__active-indicator {
  bottom: -1px;
  height: var(--ui-border-width-strong);
  background: var(--ui-tabs-active-indicator);
}

.ui-tabs--segmented .ui-tabs__active-indicator {
  top: 4px;
  bottom: 4px;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-tabs-active-bg);
}
</style>
