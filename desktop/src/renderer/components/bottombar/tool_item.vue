<script setup lang="ts">
import { useRouter } from 'vue-router';
import Svgicon from '../svgs/svgicon.vue';

const props = withDefaults(defineProps<{
  tabName: string;
  url?: string;
  closable?: boolean;
}>(), {
  tabName: 'default',
  url: '/',
  closable: true
});

const router = useRouter();

// 点击标签页主体区域，跳转到对应页面
const handleTabClick = () => {
  if (props.url) {
    router.push(props.url);
  }
};

// 点击关闭按钮
const handleClose = (event: Event) => {
  event.stopPropagation(); // 阻止事件冒泡，避免触发标签页的跳转
  // TODO: 添加关闭标签页的逻辑
  console.log('关闭标签页:', props.tabName);
};

</script>

<template>
  <div class="tool-item-container" v-ripple @click="handleTabClick">
    <span class="tool-name">{{ props.tabName }}</span>
    <div v-if="props.closable" class="close-btn" @click="handleClose">
      <Svgicon width="16" height="16" viewBox="0 0 1024 1024">
        <path
          d="M810.666667 273.493333L750.506667 213.333333 512 451.84 273.493333 213.333333 213.333333 273.493333 451.84 512 213.333333 750.506667 273.493333 810.666667 512 572.16 750.506667 810.666667 810.666667 750.506667 572.16 512z"
          p-id="7150"></path>
      </Svgicon>
    </div>
  </div>
</template>

<style lang="scss">
@use "../../assets/layout.scss";
@use "../../assets/cssvars.scss" as *;

.tool-item-container {
  @include layout.flex-row($justify-content: space-between, $align-items: center);
  min-width: 96px;
  height: 100%;
  background-color: var(--surface-color);
  border-right: 1px solid var(--bar-border-color);
  transition: background-color 0.3s ease, color 0.3s ease;
  cursor: pointer;
  color: var(--text-primary-color);

  &:hover {
    background-color: var(--surface-hover-color);
  }

  & .tool-name {
    @include layout.flex-row($justify-content: center, $align-items: center);
    display: inline-flex;
    font-size: 14px;
    color: var(--text-primary-color);
    padding-left: 8px;
  }

  & .close-btn {
    @include layout.flex-row();
    width: 24px;
    height: 24px;
    margin-right: 8px;
    border-radius: 50%;
    transition: background-color 0.3s ease;
    color: var(--text-muted-color);

    & svg {
      fill: currentColor;
      transition: fill 0.3s ease;
    }

    &:hover {
      background-color: var(--surface-hover-color);
      color: var(--primary-color);
    }
  }
}
</style>
