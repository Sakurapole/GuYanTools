<script setup lang="ts">
import { computed, ref, type StyleValue } from 'vue';

type ClassValue =
  | string
  | Record<string, boolean>
  | Array<string | Record<string, boolean>>
  | null
  | undefined;

const props = withDefaults(defineProps<{
  pageClass?: ClassValue;
  layoutClass?: ClassValue;
  sidebarClass?: ClassValue;
  sidebarCollapsedClass?: string;
  mainClass?: ClassValue;
  stageClass?: ClassValue;
  sidebarCollapsed?: boolean;
  sidebarHidden?: boolean;
  sidebarSide?: 'left' | 'right';
  stageVisible?: boolean;
  style?: StyleValue;
}>(), {
  pageClass: undefined,
  layoutClass: undefined,
  sidebarClass: undefined,
  sidebarCollapsedClass: '',
  mainClass: undefined,
  stageClass: undefined,
  sidebarCollapsed: false,
  sidebarHidden: false,
  sidebarSide: 'left',
  stageVisible: true,
  style: undefined,
});

const mainElement = ref<HTMLElement | null>(null);
const stageElement = ref<HTMLElement | null>(null);

const shellClasses = computed(() => [
  props.pageClass,
  {
    'main-page-shell--sidebar-hidden': props.sidebarHidden,
    'main-page-shell--sidebar-right': props.sidebarSide === 'right',
  },
]);

const sidebarClasses = computed(() => [
  props.sidebarClass,
  {
    'main-page-shell__sidebar--collapsed': props.sidebarCollapsed,
    [props.sidebarCollapsedClass]: Boolean(props.sidebarCollapsedClass) && props.sidebarCollapsed,
  },
]);

defineExpose({
  mainElement,
  stageElement,
});
</script>

<template>
  <div class="main-page-shell" :class="shellClasses" :style="style">
    <div class="main-page-shell__layout" :class="layoutClass">
      <aside
        v-if="!sidebarHidden"
        class="main-page-shell__sidebar"
        :class="sidebarClasses"
      >
        <slot name="sidebar" />
      </aside>

      <main ref="mainElement" class="main-page-shell__main" :class="mainClass">
        <slot name="main-before" />
        <section
          v-if="stageVisible"
          ref="stageElement"
          class="main-page-shell__stage"
          :class="stageClass"
        >
          <slot name="stage" />
        </section>
        <slot name="main-after" />
      </main>
    </div>

    <slot name="overlays" />
  </div>
</template>

<style lang="scss">
.main-page-shell {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--ui-surface-bg-muted);
}

.main-page-shell__layout {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.main-page-shell--sidebar-right .main-page-shell__layout {
  flex-direction: row-reverse;
}

.main-page-shell__sidebar {
  display: flex;
  flex: 0 0 var(--ui-page-sidebar-width);
  width: var(--ui-page-sidebar-width);
  min-width: var(--ui-page-sidebar-width);
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);
  transition:
    width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    min-width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    flex-basis 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.18s ease;
}

.main-page-shell--sidebar-right .main-page-shell__sidebar {
  border-right: none;
  border-left: 1px solid var(--ui-border-subtle);
}

.main-page-shell__sidebar--collapsed {
  flex-basis: var(--ui-page-sidebar-collapsed-width);
  width: var(--ui-page-sidebar-collapsed-width);
  min-width: var(--ui-page-sidebar-collapsed-width);
}

.main-page-shell__main {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--ui-surface-bg);
}

.main-page-shell__stage {
  position: relative;
  display: flex;
  flex: 1;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  padding: 0;
}
</style>
