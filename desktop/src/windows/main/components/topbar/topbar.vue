<script setup lang="ts">
import SvgIcon from '@/windows/main/components/svgs/svgicon.vue';
import { useTheme } from '@/windows/main/composables/theme';
import { useGlobalStore } from '@/windows/main/stores/global_store';
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import Spacer from '../Spacer.vue';
import UiIconButton from '../ui/UiIconButton.vue';

const { ipcRenderer } = window;
const globalStore = useGlobalStore();
const { currentPage, topbarColor } = storeToRefs(globalStore);
const { theme, toggleTheme } = useTheme();

const topbarStyle = computed(() => {
  if (!topbarColor.value) return {};
  return {
    '--topbar-bg-color': topbarColor.value,
  };
});
</script>

<template>
  <div id="topbar-container" :style="topbarStyle">
    <div class="window-title-container">
      <div class="window-title">
        GuYanTools
      </div>
      <Spacer :size="6" direction="horizontal" type="divider" />
      <div class="window-subtitle">
        {{ currentPage }}
      </div>
    </div>
    <div class="application-func-container" aria-label="应用功能区"></div>
    <div class="drag-area"></div>
    <div class="window-btn-group">
      <UiIconButton class="theme-btn" variant="ghost" size="lg" shape="circle" title="切换主题" @click="toggleTheme">
        <SvgIcon width="24" height="24" color="var(--primary-color)" v-if="theme === 'light'" viewBox="0 0 1024 1024">
          <path
            d="M512 768c-140.8 0-256-115.2-256-256s115.2-256 256-256 256 115.2 256 256-115.2 256-256 256z m0-426.666667c-93.866667 0-170.666667 76.8-170.666667 170.666667s76.8 170.666667 170.666667 170.666667 170.666667-76.8 170.666667-170.666667-76.8-170.666667-170.666667-170.666667zM512 170.666667c-25.6 0-42.666667-17.066667-42.666667-42.666667V42.666667c0-25.6 17.066667-42.666667 42.666667-42.666667s42.666667 17.066667 42.666667 42.666667v85.333333c0 25.6-17.066667 42.666667-42.666667 42.666667zM512 1024c-25.6 0-42.666667-17.066667-42.666667-42.666667v-85.333333c0-25.6 17.066667-42.666667 42.666667-42.666667s42.666667 17.066667 42.666667 42.666667v85.333333c0 25.6-17.066667 42.666667-42.666667 42.666667zM238.933333 281.6c-12.8 0-21.333333-4.266667-29.866666-12.8L149.333333 209.066667c-17.066667-17.066667-17.066667-42.666667 0-59.733334s42.666667-17.066667 59.733334 0l59.733333 59.733334c17.066667 17.066667 17.066667 42.666667 0 59.733333-4.266667 8.533333-17.066667 12.8-29.866667 12.8zM844.8 887.466667c-12.8 0-21.333333-4.266667-29.866667-12.8l-59.733333-59.733334c-17.066667-17.066667-17.066667-42.666667 0-59.733333s42.666667-17.066667 59.733333 0l59.733334 59.733333c17.066667 17.066667 17.066667 42.666667 0 59.733334-8.533333 8.533333-21.333333 12.8-29.866667 12.8zM128 554.666667H42.666667c-25.6 0-42.666667-17.066667-42.666667-42.666667s17.066667-42.666667 42.666667-42.666667h85.333333c25.6 0 42.666667 17.066667 42.666667 42.666667s-17.066667 42.666667-42.666667 42.666667zM981.333333 554.666667h-85.333333c-25.6 0-42.666667-17.066667-42.666667-42.666667s17.066667-42.666667 42.666667-42.666667h85.333333c25.6 0 42.666667 17.066667 42.666667 42.666667s-17.066667 42.666667-42.666667 42.666667zM179.2 887.466667c-12.8 0-21.333333-4.266667-29.866667-12.8-17.066667-17.066667-17.066667-42.666667 0-59.733334l59.733334-59.733333c17.066667-17.066667 42.666667-17.066667 59.733333 0s17.066667 42.666667 0 59.733333l-59.733333 59.733334c-8.533333 8.533333-17.066667 12.8-29.866667 12.8zM785.066667 281.6c-12.8 0-21.333333-4.266667-29.866667-12.8-17.066667-17.066667-17.066667-42.666667 0-59.733333l59.733333-59.733334c17.066667-17.066667 42.666667-17.066667 59.733334 0s17.066667 42.666667 0 59.733334l-59.733334 59.733333c-8.533333 8.533333-21.333333 12.8-29.866666 12.8z"
            p-id="7165"></path>
        </SvgIcon>
        <SvgIcon width="24" height="24" color="var(--primary-color)" v-else viewBox="0 0 1024 1024">
          <path
            d="M444.224 177.408A341.44 341.44 0 0 0 512 853.376a341.248 341.248 0 0 0 295.68-170.688 384 384 0 0 1-380.992-384c0-41.792 5.568-82.624 17.536-121.28zM85.312 512A426.688 426.688 0 0 1 512 85.312h73.984l-37.056 64.064C524.224 192.064 512 242.688 512 298.688a298.688 298.688 0 0 0 356.16 293.12l71.808-13.952-23.168 69.376A426.688 426.688 0 0 1 85.376 512z"
            p-id="8138"></path>
        </SvgIcon>
      </UiIconButton>
      <UiIconButton class="mini-btn" variant="ghost" size="lg" shape="square" title="最小化"
        @click="ipcRenderer.send('main-renderer-minimize')">
        <SvgIcon width="28" height="28" color="var(--primary-color)" viewBox="0 0 640 640">
          <path
            d="M96 320C96 302.3 110.3 288 128 288L512 288C529.7 288 544 302.3 544 320C544 337.7 529.7 352 512 352L128 352C110.3 352 96 337.7 96 320z" />
        </SvgIcon>
      </UiIconButton>
      <UiIconButton class="max-btn" variant="ghost" size="lg" shape="square" title="最大化"
        @click="ipcRenderer.send('main-renderer-maximize')">
        <SvgIcon width="26" height="26" color="var(--primary-color)" viewBox="0 0 640 640">
          <path
            d="M128 96C110.3 96 96 110.3 96 128L96 224C96 241.7 110.3 256 128 256C145.7 256 160 241.7 160 224L160 160L224 160C241.7 160 256 145.7 256 128C256 110.3 241.7 96 224 96L128 96zM160 416C160 398.3 145.7 384 128 384C110.3 384 96 398.3 96 416L96 512C96 529.7 110.3 544 128 544L224 544C241.7 544 256 529.7 256 512C256 494.3 241.7 480 224 480L160 480L160 416zM416 96C398.3 96 384 110.3 384 128C384 145.7 398.3 160 416 160L480 160L480 224C480 241.7 494.3 256 512 256C529.7 256 544 241.7 544 224L544 128C544 110.3 529.7 96 512 96L416 96zM544 416C544 398.3 529.7 384 512 384C494.3 384 480 398.3 480 416L480 480L416 480C398.3 480 384 494.3 384 512C384 529.7 398.3 544 416 544L512 544C529.7 544 544 529.7 544 512L544 416z" />
        </SvgIcon>
      </UiIconButton>
      <UiIconButton class="close-btn" variant="danger" size="lg" shape="square" title="关闭"
        @click="ipcRenderer.send('main-renderer-close')">
        <SvgIcon width="28" height="28" color="var(--primary-color)" viewBox="0 0 640 640">
          <path
            d="M183.1 137.4C170.6 124.9 150.3 124.9 137.8 137.4C125.3 149.9 125.3 170.2 137.8 182.7L275.2 320L137.9 457.4C125.4 469.9 125.4 490.2 137.9 502.7C150.4 515.2 170.7 515.2 183.2 502.7L320.5 365.3L457.9 502.6C470.4 515.1 490.7 515.1 503.2 502.6C515.7 490.1 515.7 469.8 503.2 457.3L365.8 320L503.1 182.6C515.6 170.1 515.6 149.8 503.1 137.3C490.6 124.8 470.3 124.8 457.8 137.3L320.5 274.7L183.1 137.4z" />
        </SvgIcon>
      </UiIconButton>
    </div>
  </div>
</template>

<style lang="scss">
@use './topbar.scss';
</style>
