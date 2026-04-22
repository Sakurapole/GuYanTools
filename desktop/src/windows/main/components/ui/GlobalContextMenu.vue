<script lang="ts" setup>
import { useContextMenu } from '../../composables/useContextMenu';
import ContextMenuBranch from './ContextMenuBranch.vue';
import UiMenu from './UiMenu.vue';

const { visible, position, items, close } = useContextMenu();
</script>

<template>
  <UiMenu :visible="visible" :x="position.x" :y="position.y" @close="close">
    <ContextMenuBranch :items="items" :close-menu="close" />
  </UiMenu>
</template>
