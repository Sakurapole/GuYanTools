<script setup lang="ts">
import SvgIcon from '@/windows/main/components/svgs/SVGIcon.vue';

const paths = {
  folder: 'M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  refresh: 'M20 7a8 8 0 0 0-13-2L3 9m0-6v6h6m-5 8a8 8 0 0 0 13 2l4-4m0 6v-6h-6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12 4 4L19 6',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  info: 'M12 8h.01M12 11v6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  external: 'M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
  plug: 'M8 3v5m8-5v5M5 8h14v4a7 7 0 0 1-14 0V8Zm7 11v3',
  unplug: 'M3 3l18 18M8 3v2m8-2v5M5 8v4a7 7 0 0 0 10 6m4-6V8h-7m0 11v3',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  undo: 'M3 9h10a6 6 0 0 1 0 12M3 9l5-5m-5 5 5 5',
  previous: 'm15 5-7 7 7 7',
  next: 'm9 5 7 7-7 7',
  filter: 'M4 4h16l-6 8v7l-4 2v-9L4 4Z',
  terminal: 'm4 6 5 6-5 6m8 0h8',
  sparkles: 'm12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z',
  network: 'M12 3v6M4 15v-3h16v3M9 3h6v6H9ZM1 15h6v6H1Zm16 0h6v6h-6Z',
  order: 'M7 4v16m-3-3 3 3 3-3M13 4h7m-7 6h5m-5 6h3',
  copy: 'M9 9h12v12H9ZM15 9V3H3v12h6',
  memory: 'M5 4h14v16H5V4Zm4 4h6m-6 4h6m-6 4h4',
  shield: 'M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Zm-3 9 2 2 4-4',
  page: 'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6',
} as const;

defineProps<{ name: keyof typeof paths }>();
</script>

<template>
  <span class="plugin-action-icon">
    <SvgIcon
      :width="16"
      :height="16"
      view-box="0 0 24 24"
      color="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path :d="paths[name]" />
    </SvgIcon>
  </span>
</template>

<style scoped>
.plugin-action-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}
:deep(svg) {
  display: block;
}
</style>
