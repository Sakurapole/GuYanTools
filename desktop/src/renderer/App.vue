<script setup lang="ts">
import { useElementBounding, useElementSize } from '@vueuse/core';
import { onBeforeMount, onMounted, ref } from 'vue';
import bottombar from './components/bottombar/bottombar.vue';
import Sidebar from './components/sidebar/sidebar.vue';
import Topbar from './components/topbar/topbar.vue';
import { useTheme } from './composables/theme';

const { theme, toggleTheme } = useTheme();
const pageContainerRef = ref<HTMLElement | null>(null);
const { top: boundsTop, left: boundsLeft } = useElementBounding(pageContainerRef);
const { width: containerWidth, height: containerHeight } = useElementSize(pageContainerRef);

onBeforeMount(() => {
  document.documentElement.classList.add(theme.value);
});

onMounted(() => {
  console.log(boundsLeft.value, boundsTop.value);
  console.log(containerWidth.value, containerHeight.value);
})
</script>

<template>
  <Topbar />
  <div class="page-container" ref="pageContainerRef">
    <Sidebar :parent-height="containerHeight" :parent-width="containerWidth" />
    <!-- <div class="container-wrapper"> -->
    <router-view></router-view>
    <!-- </div> -->
  </div>
  <bottombar />
</template>

<style lang="scss">
@use './assets/theme.scss';
@use './assets/app.scss';

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
