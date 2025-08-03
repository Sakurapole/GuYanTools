<template>
  <div ref="small-sidebar-btn-ref" class="small-sidebar-btn" :style="style" @click="toggleTheme">
    <svg class="navigation-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-2 -2 28 28">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="m3 11l19-9l-9 19l-2-8z" />
    </svg>
  </div>

  <div class="sidebar-container">
    <div class="sidebar-expand">

    </div>
  </div>
</template>

<script lang="ts" setup>
import { useDraggable, useElementSize } from '@vueuse/core';
import { gsap } from 'gsap';
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

const smallSidebarBtn = useTemplateRef<HTMLDivElement>('small-sidebar-btn-ref');
const { width: elWidth, height: elHeight } = useElementSize(smallSidebarBtn);

const { x, y, style } = useDraggable(smallSidebarBtn, {
  initialValue: { x: 0, y: parentHeight.value / 2 },
  preventDefault: true,
  onMove: (position) => {
    // 计算 x 和 y 的最大可移动值
    const maxX = parentWidth.value - elWidth.value;
    const maxY = parentHeight.value - elHeight.value;
    // 限制 x 的范围
    position.x = 0;

    // 限制 y 的范围
    position.y = Math.max(0, Math.min(position.y, maxY));
  }
});

const { toggleTheme } = useTheme();

onMounted(() => {
  setTimeout(() => {
    const tl = gsap.timeline();
    const path: SVGPathElement = document.querySelector('path');
    const pathLength = path.getTotalLength();
    path.style.strokeDasharray = pathLength.toString();
    path.style.strokeDashoffset = pathLength.toString();
    gsap.to(path, {
      strokeDashoffset: 0,
      duration: 1, // 动画持续时间，单位为秒
      ease: 'power1.inOut' // 动画缓动效果
    })
    console.log(tl);
  });
})
</script>

<style lang="scss">
@use './sidebar.scss';
</style>