<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import UiCard from './UiCard.vue';
import UiPopupSurface from './UiPopupSurface.vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  x?: number;
  y?: number;
  closeOnClickOutside?: boolean;
  outsideIgnoreSelector?: string | string[];
}>(), {
  x: 0,
  y: 0,
  closeOnClickOutside: true,
  outsideIgnoreSelector: '',
});

const emit = defineEmits<{
  close: [];
}>();

const menuRef = ref<HTMLElement | null>(null);
const positionRevision = ref(0);

const menuStyle = computed(() => {
  void positionRevision.value;
  let left = props.x;
  let top = props.y;

  if (menuRef.value) {
    const menuWidth = menuRef.value.offsetWidth || 200;
    const menuHeight = menuRef.value.offsetHeight || 150;

    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
    }

    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 10;
    }
  }

  return {
    left: `${Math.max(10, left)}px`,
    top: `${Math.max(10, top)}px`,
  };
});

watch(() => props.visible, visible => {
  if (!visible) {
    return;
  }

  requestAnimationFrame(() => {
    positionRevision.value += 1;
  });
});
</script>

<template>
  <UiPopupSurface
    :model-value="visible"
    variant="floating"
    :overlay="false"
    :close-on-outside="closeOnClickOutside"
    :outside-ignore-selector="outsideIgnoreSelector"
    :panel-style="menuStyle"
    panel-class="ui-menu-shell"
    @close="emit('close')"
  >
    <div ref="menuRef">
      <UiCard class="ui-menu" variant="elevated" padding="none" radius="sm">
        <div class="ui-menu__content">
          <slot />
        </div>
      </UiCard>
    </div>
  </UiPopupSurface>
</template>

<style lang="scss" scoped>
.ui-menu {
  min-width: clamp(80px, 18vw, 120px);
  max-width: clamp(200px, 28vw, 320px);
  max-height: clamp(200px, 50vh, 480px);
  overflow: visible;
  padding: 4px;
  background: var(--ui-menu-bg);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
  box-shadow: var(--ui-menu-shadow);
}

.ui-menu__content {
  max-height: inherit;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
}
</style>
