<script setup lang="ts">
import { defineComponent } from 'vue';
import Svgicon from '../svgs/svgicon.vue';

defineComponent({
  name: 'ToolItem'
});
</script>

<template>
  <div class="tool-item-container">
    <span class="tool-name">name</span>
    <div class="close-btn">
      <Svgicon width="16" height="16" color="#888" viewBox="0 0 1024 1024">
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
  background-color: rgb(230, 230, 230);
  border-right: 1px solid #dbdbdb;
  transition: background-color 0.3s ease;
  cursor: pointer;

  &:hover {
    background-color: #f9f9f9;
  }

  & .tool-name {
    @include layout.flex-row($justify-content: center, $align-items: center);
    display: inline-flex;
    font-size: 14px;
    color: #333;
    padding-left: 8px;
  }

  & .close-btn {
    @include layout.flex-row();
    width: 24px;
    height: 24px;
    margin-right: 8px;
    border-radius: 50%;
    transition: background-color 0.3s ease;

    &:hover {
      background-color: rgba(0, 0, 0, 0.2);
    }
  }
}
</style>