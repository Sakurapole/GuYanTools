<template>
  <div class="bottombar-container">
    <div class="bottombar-app-func-container">
      <div class="bottombar-app-func-item switch-sidebar-btn" @click="toggleSidebar" v-ripple>
        <SvgIcon width="24" height="24" viewBox="0 0 1024 1024">
          <path
            d="M896 261.4272L524.7488 475.136a25.6 25.6 0 0 1-25.6 0L128 261.4272a25.6 25.6 0 0 1 0-44.3392L499.2512 3.4304a25.6 25.6 0 0 1 25.6 0L896 217.088a25.6 25.6 0 0 1 0 44.3392zM934.3488 333.4656L563.7632 547.84a25.6 25.6 0 0 0-12.7488 22.1184l-0.512 428.1856a25.6 25.6 0 0 0 38.4512 22.2208l370.5856-214.528a25.6 25.6 0 0 0 12.7488-22.1696l0.512-428.1856a25.6 25.6 0 0 0-38.4512-22.016zM51.2 355.6352l0.512 428.1856a25.6 25.6 0 0 0 12.7488 22.1696L435.2 1020.5184a25.6 25.6 0 0 0 38.2976-22.1184l-0.512-428.1856a25.6 25.6 0 0 0-12.7488-22.3744L89.6512 333.4656A25.6 25.6 0 0 0 51.2 355.6352z"
            p-id="2031"></path>
        </SvgIcon>
      </div>
    </div>
    <div class="bottombar-running-tool-container">
      <ToolItem v-for="tab in tabPages" :key="tab.id" :tab-name="tab.name" :url="tab.url"
        :closable="tab.closable !== false" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import ToolItem from '@/renderer/components/bottombar/tool_item.vue';
import SvgIcon from '@/renderer/components/svgs/svgicon.vue';
import { useBarStore } from '@/renderer/stores/bar_store';
import { toRefs } from 'vue';

const { toggleSidebar } = useBarStore();
const { tabPages } = toRefs(useBarStore());
</script>

<style lang="scss">
@use "./bottombar.scss";
</style>
