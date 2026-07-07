<script setup lang="ts">
import { computed, onMounted, ref, provide, watch, type CSSProperties } from 'vue';
import { useRoute } from 'vue-router';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import { useTodoListStore } from '@/windows/main/stores/todo_list_store';
import {
  defaultTodoItemColor,
  defaultTodoSidebarItemColor,
  resolveTodoAreaBackground,
  updateTodoAreaBackground,
  useTodoSettings,
  type AreaBackground,
} from '@/windows/main/composables/useTodoSettings';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import TodoSidebar from './components/TodoSidebar.vue';
import TodoContent from './components/TodoContent.vue';
import TodoDetail from './components/TodoDetail.vue';
import YesterdayPrompt from './components/YesterdayPrompt.vue';
import TodoBackground from './components/TodoBackground.vue';
import UiPersonalizationConfig from '@/windows/main/components/ui/UiPersonalizationConfig.vue';
import { buildBackgroundTextVars } from '@/windows/main/utils/backgroundTextColor';
import type { BackgroundConfirmPayload } from '@/contracts/background';
import type { TodoBackgroundTarget } from '@/contracts/todo';

const todoStore = useTodoStore();
const listStore = useTodoListStore();
const {
  appBg,
  sidebarBg,
  contentBg,
  detailBg,
  itemBg,
  sidebarItemBg,
  loadTodoBackgrounds,
  saveTodoAreaBackground,
  resetTodoAreaBackground,
} = useTodoSettings();
const { open: openMenu } = useContextMenu();
const appConfigStore = useAppConfigStore();
const route = useRoute();
const handledTodoOpenRequestIds = new Set<string>();

const bgPickerVisible = ref(false);
type PersonalizationFeature = 'color' | 'image' | 'video' | 'opacity' | 'blur' | 'textColor';

const currentBgTarget = ref<TodoBackgroundTarget>('app');
const todoAppRef = ref<HTMLElement | null>(null);
const todoSidebarRef = ref<{ $el?: Element } | null>(null);
const todoContentRef = ref<{ $el?: Element } | null>(null);
const todoDetailRef = ref<{ $el?: Element } | null>(null);

function openBgPicker(target: TodoBackgroundTarget) {
  currentBgTarget.value = target;
  bgPickerVisible.value = true;
}

provide('openTodoBgPicker', openBgPicker);

function handleContextMenu(e: MouseEvent) {
  openMenu(e.clientX, e.clientY, [
    {
      id: 'app-bg',
      label: '全局个性化配置',
      action: () => openBgPicker('app'),
    }
  ]);
}

const currentBackgroundTheme = computed(() => appConfigStore.config.appearance.theme);
const activeAppBg = computed(() => resolveTodoAreaBackground(appBg.value, currentBackgroundTheme.value));
const activeSidebarBg = computed(() => resolveTodoAreaBackground(sidebarBg.value, currentBackgroundTheme.value));
const activeContentBg = computed(() => resolveTodoAreaBackground(contentBg.value, currentBackgroundTheme.value));
const activeDetailBg = computed(() => resolveTodoAreaBackground(detailBg.value, currentBackgroundTheme.value));
const activeItemBg = computed(() => resolveTodoAreaBackground(itemBg.value, currentBackgroundTheme.value));
const activeSidebarItemBg = computed(() => resolveTodoAreaBackground(sidebarItemBg.value, currentBackgroundTheme.value));

function getCurrentTargetStorage() {
  return currentBgTarget.value === 'app' ? appBg :
    currentBgTarget.value === 'sidebar' ? sidebarBg :
      currentBgTarget.value === 'content' ? contentBg :
        currentBgTarget.value === 'detail' ? detailBg :
          currentBgTarget.value === 'sidebar-item' ? sidebarItemBg : itemBg;
}

async function handleBgConfirm(payload: BackgroundConfirmPayload) {
  const targetBg = getCurrentTargetStorage();
  const nextBackground = updateTodoAreaBackground(targetBg.value, currentBackgroundTheme.value, payload);
  targetBg.value = nextBackground;
  try {
    await saveTodoAreaBackground(currentBgTarget.value, nextBackground);
  } catch (error) {
    console.warn('保存 Todo 背景配置失败', error);
  }
}

async function handleBgReset() {
  try {
    await resetTodoAreaBackground(currentBgTarget.value);
  } catch (error) {
    console.warn('还原 Todo 背景配置失败', error);
  }
}

const currentBgConfig = () => {
  if (currentBgTarget.value === 'app') return activeAppBg.value;
  if (currentBgTarget.value === 'sidebar') return activeSidebarBg.value;
  if (currentBgTarget.value === 'content') return activeContentBg.value;
  if (currentBgTarget.value === 'detail') return activeDetailBg.value;
  if (currentBgTarget.value === 'sidebar-item') return withBackgroundStyleDefaults(activeSidebarItemBg.value, { blur: 0 });
  return withBackgroundStyleDefaults(activeItemBg.value, { blur: 10 });
};

function withBackgroundStyleDefaults(
  background: AreaBackground,
  defaults: Partial<AreaBackground['backgroundStyle']>,
): AreaBackground {
  return {
    ...background,
    backgroundStyle: {
      ...defaults,
      ...background.backgroundStyle,
    },
  };
}

function routeQueryString(key: string) {
  const value = route.query[key];
  return Array.isArray(value) ? value[0] ?? '' : typeof value === 'string' ? value : '';
}

async function handleTodoOpenRequestFromRoute() {
  if (route.name !== 'Todo') return;

  const todoId = routeQueryString('todoId');
  if (!todoId) return;

  const requestId = routeQueryString('openTodoRequestId') || `legacy:${todoId}`;
  if (handledTodoOpenRequestIds.has(requestId)) return;
  handledTodoOpenRequestIds.add(requestId);

  try {
    await todoStore.switchView('all');
    todoStore.selectTodo(todoId);
  } catch (error) {
    console.warn('[quick-launch] Failed to open todo from route:', error);
  }
}

const currentBgTitle = computed(() => {
  const map: Record<TodoBackgroundTarget, string> = {
    app: '全局个性化配置',
    sidebar: '侧边栏个性化配置',
    content: '内容区个性化配置',
    detail: '详情区个性化配置',
    item: '任务项个性化配置',
    'sidebar-item': '侧边栏项个性化配置',
  };
  return map[currentBgTarget.value];
});

const currentBgFeatures = computed<PersonalizationFeature[]>(() => {
  if (currentBgTarget.value === 'item' || currentBgTarget.value === 'sidebar-item') return ['color', 'opacity', 'blur'];
  return ['color', 'image', 'video', 'opacity', 'textColor'];
});

const currentBgShowReset = computed(() =>
  currentBgTarget.value === 'sidebar' || currentBgTarget.value === 'item' || currentBgTarget.value === 'sidebar-item',
);

function getMeasuredSize(target: HTMLElement | { $el?: Element } | null, fallback: { width: number; height: number }) {
  const element = target instanceof HTMLElement
    ? target
    : target?.$el instanceof HTMLElement
      ? target.$el
      : null;

  if (!element) return fallback;

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0
    ? { width: Math.round(rect.width), height: Math.round(rect.height) }
    : fallback;
}

const currentBgPreviewSize = computed(() => {
  if (currentBgTarget.value === 'app') return getMeasuredSize(todoAppRef.value, { width: 960, height: 640 });
  if (currentBgTarget.value === 'sidebar') return getMeasuredSize(todoSidebarRef.value, { width: 260, height: 640 });
  if (currentBgTarget.value === 'content') return getMeasuredSize(todoContentRef.value, { width: 640, height: 640 });
  if (currentBgTarget.value === 'item') return { width: 560, height: 76 };
  if (currentBgTarget.value === 'sidebar-item') return { width: 220, height: 36 };
  return getMeasuredSize(todoDetailRef.value, { width: 320, height: 640 });
});

const appTextStyle = computed(() => buildBackgroundTextVars(activeAppBg.value.backgroundStyle?.textColor, {
  aliases: {
    primary: ['--color-text-primary', '--ui-text-primary'],
    secondary: ['--color-text-secondary', '--ui-text-secondary'],
    muted: ['--color-text-muted', '--ui-text-muted'],
    subtle: ['--color-text-subtle', '--ui-text-subtle'],
  },
}));

const todoItemSurfaceVars = computed<CSSProperties>(() => {
  const color = activeItemBg.value.type === 'color' ? activeItemBg.value.color : defaultTodoItemColor;
  const blur = activeItemBg.value.backgroundStyle?.blur ?? 10;
  return {
    '--todo-item-surface-bg': color,
    '--todo-item-surface-hover-bg': color === defaultTodoItemColor ? 'var(--ui-surface-glass-strong)' : color,
    '--todo-item-surface-opacity': String(activeItemBg.value.backgroundStyle?.opacity ?? 1),
    '--todo-item-backdrop-filter': blur > 0 ? `blur(${blur}px)` : 'none',
  } as CSSProperties;
});

const todoSidebarItemSurfaceVars = computed<CSSProperties>(() => {
  const color = activeSidebarItemBg.value.type === 'color' ? activeSidebarItemBg.value.color : defaultTodoSidebarItemColor;
  const blur = activeSidebarItemBg.value.backgroundStyle?.blur ?? 0;
  return {
    '--todo-sidebar-item-surface-bg': color,
    '--todo-sidebar-item-surface-opacity': String(activeSidebarItemBg.value.backgroundStyle?.opacity ?? 1),
    '--todo-sidebar-item-backdrop-filter': blur > 0 ? `blur(${blur}px)` : 'none',
  } as CSSProperties;
});

const appStyle = computed<CSSProperties>(() => ({
  ...appTextStyle.value,
  ...todoItemSurfaceVars.value,
  ...todoSidebarItemSurfaceVars.value,
} as CSSProperties));

onMounted(async () => {
  await Promise.all([
    loadTodoBackgrounds(),
    listStore.loadLists(),
  ]);
  await todoStore.switchView('my-day');
  await todoStore.checkYesterdayIncomplete();
  await todoStore.loadSmartListCounts();
  await handleTodoOpenRequestFromRoute();
});

watch(
  [
    () => route.name,
    () => route.query.openTodoRequestId,
    () => route.query.todoId,
  ],
  () => {
    void handleTodoOpenRequestFromRoute();
  },
);
</script>

<template>
  <div
    ref="todoAppRef"
    class="todo-app"
    :style="appStyle"
    @contextmenu.prevent="handleContextMenu"
  >
    <TodoBackground :config="activeAppBg" />
    <TodoSidebar ref="todoSidebarRef" />
    <TodoContent ref="todoContentRef" />
    <transition name="slide-right">
      <TodoDetail v-if="todoStore.selectedTodo" ref="todoDetailRef" />
    </transition>
    <YesterdayPrompt v-if="todoStore.showYesterdayPrompt" />

    <UiPersonalizationConfig
      :visible="bgPickerVisible"
      :title="currentBgTitle"
      :current-background="currentBgConfig().type === 'color' ? currentBgConfig().color : ''"
      :current-background-image="currentBgConfig().type === 'image' ? currentBgConfig().image : ''"
      :current-background-video="currentBgConfig().type === 'video' ? currentBgConfig().video : ''"
      :current-background-style="currentBgConfig().backgroundStyle"
      :enabled-features="currentBgFeatures"
      :show-reset="currentBgShowReset"
      :preview-width="currentBgPreviewSize.width"
      :preview-height="currentBgPreviewSize.height"
      @close="bgPickerVisible = false"
      @confirm="handleBgConfirm"
      @reset="handleBgReset"
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
  color: var(--color-text-primary, var(--ui-text-primary));
  position: relative;
  contain: paint;
  transform: translateZ(0);
  backface-visibility: hidden;
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
