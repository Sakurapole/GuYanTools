<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { usePluginAppMenu } from '../../composables/usePluginAppMenu';
import UiButton from '../ui/UiButton.vue';
import UiMenu from '../ui/UiMenu.vue';
import UiMenuItem from '../ui/UiMenuItem.vue';

const trigger = ref<HTMLElement | null>(null);
const position = ref({ x: 0, y: 0 });
const menu = usePluginAppMenu();

function updatePosition() {
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect) return;
  position.value = {
    x: Math.min(rect.left, Math.max(8, window.innerWidth - 240)),
    y: rect.bottom,
  };
}

function handleViewportChange() {
  if (menu.visible.value) updatePosition();
}

function toggle() {
  if (menu.visible.value) {
    menu.close();
    return;
  }
  updatePosition();
  void menu.open();
}

onMounted(() => {
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
});
onBeforeUnmount(() => {
  menu.close();
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
});
</script>

<template>
  <span ref="trigger" class="plugin-app-menu">
    <UiButton
      class="plugin-app-menu__trigger"
      variant="ghost"
      size="sm"
      type="button"
      :aria-expanded="menu.visible.value"
      aria-haspopup="menu"
      @click="toggle"
    >插件</UiButton>
  </span>
  <Teleport to="body">
    <UiMenu
      :visible="menu.visible.value"
      :x="position.x"
      :y="position.y"
      outside-ignore-selector=".plugin-app-menu__trigger"
      @close="menu.close"
    >
      <UiMenuItem v-if="menu.items.value.length === 0" disabled>暂无可用插件菜单</UiMenuItem>
      <UiMenuItem
        v-for="item in menu.items.value"
        :key="`${item.pluginId}:${item.contribution.id}`"
        @click="menu.execute(item)"
      >{{ item.contribution.title }}</UiMenuItem>
    </UiMenu>
  </Teleport>
</template>

<style lang="scss" scoped>
.plugin-app-menu {
  display: inline-flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

.plugin-app-menu__trigger {
  min-height: 28px;
  color: var(--ui-text-primary);
}
</style>
