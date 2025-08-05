<template>
  <svg xmlns="http://www.w3.org/2000/svg" :width="width" :height="height" :fill="color" v-bind="$attrs"
    :viewBox="viewBox">
    <slot />
  </svg>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'SVGIcon',
  props: {
    width: {
      type: [Number, String],
      default: 24
    },
    height: {
      type: [Number, String],
      default: 24
    },
    color: {
      type: String,
      default: 'currentColor'
    },
    viewBox: {
      type: String,
      default: '0 0 1024 1024'
    }
  }
})
</script>