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
import { useDraggable } from '@vueuse/core';
import { gsap } from 'gsap';
import { onMounted, useTemplateRef } from 'vue';
import { useTheme } from '../../composables/theme';

const smallSidebarBtn = useTemplateRef<HTMLDivElement>('small-sidebar-btn-ref');
const { x, y, style } = useDraggable(smallSidebarBtn, {
  initialValue: { x: 0, y: 0 },
  preventDefault: true,
  containerElement: document.documentElement,
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
  })
})
</script>

<style lang="scss">
@use './sidebar.scss';
</style>