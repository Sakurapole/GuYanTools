<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createTooltipController, type TooltipPlacement } from './tooltip_core';

const props = withDefaults(defineProps<{
  content: string;
  placement?: TooltipPlacement;
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
let tooltipController: ReturnType<typeof createTooltipController> | null = null;

function getAnchor() {
  const trigger = triggerRef.value;
  return (trigger?.firstElementChild as HTMLElement | null) ?? trigger;
}

watch(() => [props.content, props.placement, props.disabled, props.delay, props.block] as const, () => {
  tooltipController?.sync();
});

onMounted(() => {
  const trigger = triggerRef.value;
  if (!trigger) return;

  tooltipController = createTooltipController(trigger, () => props, () => getAnchor() ?? trigger);
  tooltipController.sync();
});

onBeforeUnmount(() => {
  tooltipController?.destroy();
  tooltipController = null;
});
</script>

<template>
  <div
    ref="triggerRef"
    class="ui-tooltip-trigger ui-tooltip-trigger--component"
    :class="{ 'ui-tooltip-trigger--block': block }"
  >
    <slot />
  </div>
</template>
