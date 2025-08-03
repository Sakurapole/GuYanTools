<script setup lang="ts">
import { onBeforeMount } from 'vue';
import bottombar from './components/bottombar/bottombar.vue';
import Sidebar from './components/sidebar/sidebar.vue';
import Topbar from './components/topbar/topbar.vue';
import { useTheme } from './composables/theme';
import { i } from 'vite/dist/node/types.d-aGj9QkWt';

const { theme, toggleTheme } = useTheme();

onBeforeMount(() => {
  document.documentElement.classList.add(theme.value);
});
</script>

<template>
  <Topbar />
  <div class="page-container">
    <Sidebar />
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
