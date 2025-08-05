<script setup lang="ts">
import { toRefs } from 'vue';
import Spacer from '../Spacer.vue';
import SvgIcon from '@/renderer/components/svgs/svgicon.vue';
import { useGlobalStore } from '@/renderer/stores/global_store';

const { ipcRenderer } = window;
const { currentPage } = toRefs(useGlobalStore());
</script>

<template>
  <div id="topbar-container">
    <div class="window-title-container">
      <div class="window-title">
        GuYanTools
      </div>
      <Spacer :size="6" direction="horizontal" type="divider" />
      <div class="window-subtitle">
        {{ currentPage }}
      </div>
    </div>
    <div class="application-func-container"></div>
    <div class="drag-area"></div>
    <div class="window-btn-group">
      <div class="mini-btn" @click="ipcRenderer.send('main-renderer-minimize')">
        <SvgIcon width="28" height="28" color="var(--primary-color)" viewBox="0 0 640 640">
          <path
            d="M96 320C96 302.3 110.3 288 128 288L512 288C529.7 288 544 302.3 544 320C544 337.7 529.7 352 512 352L128 352C110.3 352 96 337.7 96 320z" />
        </SvgIcon>
      </div>
      <div class="max-btn" @click="ipcRenderer.send('main-renderer-maximize')">
        <SvgIcon width="26" height="26" color="var(--primary-color)" viewBox="0 0 640 640">
          <path
            d="M128 96C110.3 96 96 110.3 96 128L96 224C96 241.7 110.3 256 128 256C145.7 256 160 241.7 160 224L160 160L224 160C241.7 160 256 145.7 256 128C256 110.3 241.7 96 224 96L128 96zM160 416C160 398.3 145.7 384 128 384C110.3 384 96 398.3 96 416L96 512C96 529.7 110.3 544 128 544L224 544C241.7 544 256 529.7 256 512C256 494.3 241.7 480 224 480L160 480L160 416zM416 96C398.3 96 384 110.3 384 128C384 145.7 398.3 160 416 160L480 160L480 224C480 241.7 494.3 256 512 256C529.7 256 544 241.7 544 224L544 128C544 110.3 529.7 96 512 96L416 96zM544 416C544 398.3 529.7 384 512 384C494.3 384 480 398.3 480 416L480 480L416 480C398.3 480 384 494.3 384 512C384 529.7 398.3 544 416 544L512 544C529.7 544 544 529.7 544 512L544 416z" />
        </SvgIcon>
      </div>
      <div class="close-btn" @click="ipcRenderer.send('main-renderer-close')">
        <SvgIcon width="28" height="28" color="var(--primary-color)" viewBox="0 0 640 640">
          <path
            d="M183.1 137.4C170.6 124.9 150.3 124.9 137.8 137.4C125.3 149.9 125.3 170.2 137.8 182.7L275.2 320L137.9 457.4C125.4 469.9 125.4 490.2 137.9 502.7C150.4 515.2 170.7 515.2 183.2 502.7L320.5 365.3L457.9 502.6C470.4 515.1 490.7 515.1 503.2 502.6C515.7 490.1 515.7 469.8 503.2 457.3L365.8 320L503.1 182.6C515.6 170.1 515.6 149.8 503.1 137.3C490.6 124.8 470.3 124.8 457.8 137.3L320.5 274.7L183.1 137.4z" />
        </SvgIcon>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use './topbar.scss';
</style>