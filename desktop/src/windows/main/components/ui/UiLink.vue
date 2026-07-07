<script lang="ts" setup>
withDefaults(defineProps<{
  href?: string;
  target?: string;
  rel?: string;
}>(), {
  href: '',
  target: '',
  rel: '',
});
</script>

<template>
  <a
    class="ui-link"
    :href="href || undefined"
    :target="target || undefined"
    :rel="rel || undefined"
  >
    <slot />
  </a>
</template>

<style lang="scss" scoped>
.ui-link {
  color: var(--ui-text-primary);
  text-decoration: none;

  &:hover {
    color: var(--primary-color);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }
}
</style>
