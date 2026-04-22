<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, ref, provide, watch } from 'vue';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import { useTodoListStore } from '@/windows/main/stores/todo_list_store';
import { useTodoSettings, type AreaBackground } from '@/windows/main/composables/useTodoSettings';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { useGlobalStore } from '@/windows/main/stores/global_store';
import TodoSidebar from './components/TodoSidebar.vue';
import TodoContent from './components/TodoContent.vue';
import TodoDetail from './components/TodoDetail.vue';
import YesterdayPrompt from './components/YesterdayPrompt.vue';
import TodoBackground from './components/TodoBackground.vue';
import UiBackgroundPicker from '@/windows/main/components/ui/UiBackgroundPicker.vue';

const todoStore = useTodoStore();
const listStore = useTodoListStore();
const { appBg, sidebarBg, contentBg, detailBg } = useTodoSettings();
const { open: openMenu } = useContextMenu();
const globalStore = useGlobalStore();

const bgPickerVisible = ref(false);
const currentBgTarget = ref<'app' | 'sidebar' | 'content' | 'detail'>('app');

function openBgPicker(target: 'app' | 'sidebar' | 'content' | 'detail') {
  currentBgTarget.value = target;
  bgPickerVisible.value = true;
}

provide('openTodoBgPicker', openBgPicker);

function handleContextMenu(e: MouseEvent) {
  openMenu(e.clientX, e.clientY, [
    {
      id: 'app-bg',
      label: '更换全局背景',
      action: () => openBgPicker('app'),
    }
  ]);
}

function handleBgConfirm(payload: any) {
  const targetBg = currentBgTarget.value === 'app' ? appBg :
                   currentBgTarget.value === 'sidebar' ? sidebarBg :
                   currentBgTarget.value === 'content' ? contentBg : detailBg;
  
  targetBg.value = {
    type: payload.type,
    color: payload.color || '',
    image: payload.image || '',
    video: payload.video || '',
    backgroundStyle: payload.backgroundStyle || { opacity: 1 },
  };
}

const currentBgConfig = () => {
  if (currentBgTarget.value === 'app') return appBg.value;
  if (currentBgTarget.value === 'sidebar') return sidebarBg.value;
  if (currentBgTarget.value === 'content') return contentBg.value;
  return detailBg.value;
};

function syncTopbarColor() {
  const bg = appBg.value;
  globalStore.setTopbarColor(bg.type === 'color' && bg.color ? bg.color : '');
}

onMounted(async () => {
  await listStore.loadLists();
  await todoStore.switchView('my-day');
  await todoStore.checkYesterdayIncomplete();
  await todoStore.loadSmartListCounts();
  syncTopbarColor();
});

onActivated(() => {
  syncTopbarColor();
});

onDeactivated(() => {
  globalStore.setTopbarColor('');
});

// 监听全局背景变化，同步到顶栏沉浸色
watch(() => appBg.value, () => {
  syncTopbarColor();
}, { deep: true });
</script>

<template>
  <div class="todo-app" @contextmenu.prevent="handleContextMenu">
    <TodoBackground :config="appBg" />
    <TodoSidebar />
    <TodoContent />
    <transition name="slide-right">
      <TodoDetail v-if="todoStore.selectedTodo" />
    </transition>
    <YesterdayPrompt v-if="todoStore.showYesterdayPrompt" />

    <UiBackgroundPicker
      :visible="bgPickerVisible"
      :current-background="currentBgConfig().type === 'color' ? currentBgConfig().color : ''"
      :current-background-image="currentBgConfig().type === 'image' ? currentBgConfig().image : ''"
      :current-background-video="currentBgConfig().type === 'video' ? currentBgConfig().video : ''"
      :current-background-style="currentBgConfig().backgroundStyle"
      @close="bgPickerVisible = false"
      @confirm="handleBgConfirm"
    />
  </div>
</template>

<style scoped>
.todo-app {
  display: flex;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  padding: 16px;
  gap: 16px;
  overflow: hidden;
  background: transparent;
  color: var(--color-text-primary, #1e1e1e);
  position: relative;
}

.todo-app > * {
  z-index: 1;
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
  overflow: hidden;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(60px);
  opacity: 0;
  width: 0 !important;
  min-width: 0 !important;
  margin-left: -16px !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  border-left-width: 0 !important;
  border-right-width: 0 !important;
}
</style>
