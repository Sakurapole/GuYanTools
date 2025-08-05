<template>
  <!-- <div ref="small-sidebar-btn-ref" class="small-sidebar-btn" :style="style" @click="sidebarClick">
    <svg class="navigation-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-2 -2 28 28">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="m3 11l19-9l-9 19l-2-8z" />
    </svg>
  </div> -->

  <div class="sidebar-container" :class="{ 'visible': sidebarVisible }">
    <div class="sidebar-expand">

    </div>
  </div>
</template>

<script lang="ts" setup>
import { bottombarHeight, sidebarBtnSize, topbarHeight } from '@/common/constants/renderer_process_constants';
import { useBarStore } from '@/renderer/stores/bar_store';
import { useDraggable, useElementSize } from '@vueuse/core';
import { onMounted, toRefs, useTemplateRef } from 'vue';
import { useTheme } from '../../composables/theme';

const props = withDefaults(defineProps<{
  boundsTop?: number;
  boundsLeft?: number;
  parentWidth?: number;
  parentHeight?: number;
}>(), {
});
const { parentWidth, parentHeight } = toRefs(props);

const { sidebarVisible } = toRefs(useBarStore());
const { setSidebarVisible } = useBarStore();
const smallSidebarBtn = useTemplateRef<HTMLDivElement>('small-sidebar-btn-ref');
const { width: elWidth, height: elHeight } = useElementSize(smallSidebarBtn);

const { x, y, style } = useDraggable(smallSidebarBtn, {
  initialValue: { x: 0, y: parentHeight.value / 2 },
  preventDefault: true,
  axis: 'y',
  onMove: (position, e) => {
    // 计算 y 的最大可移动值
    const maxY = parentHeight.value - elHeight.value;

    // 限制 y 的范围
    position.y = Math.max(0, Math.min(position.y - 30, maxY));
  }
});

const { toggleTheme } = useTheme();

onMounted(() => {
  y.value = window.innerHeight - bottombarHeight - topbarHeight - sidebarBtnSize;
  document.addEventListener('mousedown', (e) => {
    const container = document.querySelector('.sidebar-container');
    const bottombarContainer = document.querySelector('.bottombar-container');
    const switchSidebarBtn = document.querySelector('.switch-sidebar-btn');
    if (!container.contains(e.target as Node) && !switchSidebarBtn.contains(e.target as Node)) {
      setSidebarVisible(false);
    }
  })
})
</script>

<style lang="scss">
@use './sidebar.scss';
</style>