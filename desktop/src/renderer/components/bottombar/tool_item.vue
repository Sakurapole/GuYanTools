<script setup lang="ts">
import { defineComponent } from 'vue';

defineComponent({
  name: 'ToolItem'
});
</script>

<template>
  <div class="tool-item-container">
    <span>name</span>
    <div class="close-btn">

    </div>
  </div>
</template>

<style lang="scss">
@use "../../assets/layout.scss";
@use "../../assets/cssvars.scss" as *;

.tool-item-container {
  @include layout.flex-row();
  min-width: 96px;
  height: 100%;
  background-color: #e8e8e8;
  border-right: 1px solid #000;
  transition: background-color 0.3s ease;
  cursor: pointer;

  &:hover {
    background-color: #d0d0d0;
  }
}
</style>