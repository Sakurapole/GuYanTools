<script setup lang="ts">
import { computed, ref } from 'vue';
import { ensureGuYanElements } from '../register';
ensureGuYanElements();
const props = withDefaults(defineProps<{ x?: boolean; y?: boolean; showOnHover?: boolean; thumbColor?: string; thumbHoverColor?: string; trackColor?: string; alwaysVisible?: boolean; size?: number }>(), { x: true, y: true, showOnHover: true, thumbColor: '', thumbHoverColor: '', trackColor: '', alwaysVisible: false, size: 0 });
const emit = defineEmits<{ scroll: [event: Event] }>();
const scrollbarRef = ref<HTMLElement | null>(null);
const viewportRef = computed<HTMLElement | null>(() => scrollbarRef.value?.shadowRoot?.querySelector('[part="viewport"]') ?? null);

async function refresh(): Promise<void> {
  const element = scrollbarRef.value as (HTMLElement & { refresh?: () => Promise<void> }) | null;
  if (element?.refresh) await element.refresh();
}

async function updateScrollableState(): Promise<void> {
  const element = scrollbarRef.value as (HTMLElement & { updateScrollableState?: () => Promise<void> }) | null;
  if (element?.updateScrollableState) await element.updateScrollableState();
  else await refresh();
}

async function scrollTo(options: ScrollToOptions): Promise<void> {
  viewportRef.value?.scrollTo(options);
}

async function scrollBy(options: ScrollToOptions): Promise<void> {
  viewportRef.value?.scrollBy(options);
}

defineExpose({ refresh, updateScrollableState, scrollTo, scrollBy, viewportRef });
</script>
<template><gt-scrollbar ref="scrollbarRef" :x="props.x" :y="props.y" :show-on-hover="props.showOnHover" :thumb-color="props.thumbColor" :thumb-hover-color="props.thumbHoverColor" :track-color="props.trackColor" :always-visible="props.alwaysVisible" :size="props.size" v-bind="$attrs" @gt-scroll="emit('scroll', $event)"><slot /></gt-scrollbar></template>
