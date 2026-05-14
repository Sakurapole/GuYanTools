<script lang="ts" setup>
import { computed, defineAsyncComponent, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import CompArea from '../../components/CompArea/CompArea.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import UiDialog from '../../components/ui/UiDialog.vue';
import UiField from '../../components/ui/UiField.vue';
import UiIconButton from '../../components/ui/UiIconButton.vue';
import UiInput from '../../components/ui/UiInput.vue';
import UiStateCard from '../../components/ui/UiStateCard.vue';
import UiPersonalizationConfig from '../../components/ui/UiPersonalizationConfig.vue';
import IconPicker from '../../components/ui/IconPicker.vue';
import IconRenderer from '../../components/ui/IconRenderer.vue';
import { notifyError } from '../../composables/useInAppNotification';
import EditIcon from '../../components/svgs/icons/EditIcon.vue';
import { useGridPersistence } from '../../composables/useGridPersistence';
import { useContextMenu, type ContextMenuItem } from '../../composables/useContextMenu';
import { useGlobalStore } from '../../stores/global_store';
import { useHomeProfileStore } from '../../stores/home_profile_store';
import type { CategoryItem, GridConfig, GridItem, BackgroundConfirmPayload } from '../../types/grid';
import type { CreateHomeWidgetPayload } from '@/contracts/home_layout';
import { buildBackgroundTextVars } from '../../utils/backgroundTextColor';
import type * as THREE from 'three';

const GRID_GAP = 8;
const MIN_UNIT_SIZE = 1;
const FIXED_UNIT_SIZE = 72;
const STORAGE_KEY = 'comp-area-grid-items';
const GRID_PADDING = GRID_GAP / 2;
const HOLD_DELAY_MS = 200;
const FIXED_COLUMNS = 16;
const MIN_VIEWPORT_WIDTH = 1024;
const MIN_VIEWPORT_HEIGHT = 640;

const gridConfig: GridConfig = {
  GRID_GAP,
  MIN_UNIT_SIZE,
  FIXED_UNIT_SIZE,
  STORAGE_KEY,
  GRID_PADDING,
  HOLD_DELAY_MS,
  FIXED_COLUMNS,
  MIN_VIEWPORT_WIDTH,
  MIN_VIEWPORT_HEIGHT,
};



const AddIconComponent = defineAsyncComponent(() => import('../../components/svgs/icons/AddIcon.vue'));
const ChevronIconComponent = defineAsyncComponent(() => import('../../components/svgs/icons/ChevronIcon.vue'));
const Ui3DSceneComponent = defineAsyncComponent(() => import('../../components/ui/Ui3DScene.vue'));
const Ui3DFloatingShapesComponent = defineAsyncComponent(() => import('../../components/ui/Ui3DFloatingShapes.vue'));

const homeShellRef = ref<HTMLElement | null>(null);
const compAreaWrapper = ref<HTMLElement | null>(null);
const compAreaStageRef = ref<HTMLElement | null>(null);
const categoryListRef = ref<HTMLElement | null>(null);
const homeHeaderRef = ref<HTMLElement | null>(null);
const sidebarPanelRef = ref<{ $el?: Element } | null>(null);

// 3D scene objects for header decoration
const header3DScene = shallowRef<THREE.Scene | null>(null);
function onHeader3DReady(payload: { scene: THREE.Scene }) {
  header3DScene.value = payload.scene;
}

// ─── 分类选中滑块 ───
const sliderStyle = reactive({
  top: 0,
  height: 0,
  visible: false,
});

const categories = reactive<CategoryItem[]>([]);
const activeCategoryIndex = ref(0);
const slotAIndex = ref(0);
const slotBIndex = ref(-1);
const activeSlot = ref<'A' | 'B'>('A');
const isTransitioning = ref(false);
const transitionDirection = ref<'up' | 'down'>('down');
const isLoading = ref(true);
const loadError = ref('');

let mutationQueue = Promise.resolve();
let wheelTimeout: NodeJS.Timeout | null = null;
const WHEEL_DEBOUNCE_MS = 150;
const categoryDescriptions: Record<string, string> = {
  'category-tools': '聚合高频工具和日常效率入口。',
  'category-media': '围绕音视频处理与素材工作流编排。',
  'category-text': '文本编辑、整理与转换集中区。',
  'category-dev': '面向开发调试与接口效率能力。',
};


const slotACategory = computed<CategoryItem | null>(() => slotAIndex.value >= 0 ? categories[slotAIndex.value] ?? null : null);
const slotBCategory = computed<CategoryItem | null>(() => slotBIndex.value >= 0 ? categories[slotBIndex.value] ?? null : null);
const activeSlotCategory = computed<CategoryItem | null>(() => activeSlot.value === 'A' ? slotACategory.value : slotBCategory.value);
const activeCategory = computed<CategoryItem | null>(() => categories[activeCategoryIndex.value] ?? activeSlotCategory.value);
const activeCategoryDescription = computed(() => {
  if (!activeCategory.value) {
    return '从左侧选择分类，进入你的桌面工作台。';
  }

  return categoryDescriptions[activeCategory.value.icon] ?? `聚合「${activeCategory.value.label}」相关能力。`;
});
const activeCategoryWidgetCount = computed(() => activeCategory.value?.gridItems.filter(item => !item.hidden).length ?? 0);
const visibleCategoryCount = computed(() => categories.length);
const totalWidgetCount = computed(() => categories.reduce(
  (sum, category) => sum + category.gridItems.filter(item => !item.hidden).length,
  0
));

const showAddCategoryDialog = ref(false);
const showCategoryIconPicker = ref(false);
const canScrollCategoryUp = ref(false);
const canScrollCategoryDown = ref(false);
const newCategoryForm = reactive({
  label: '',
  icon: 'iconify:mdi:wrench',
});

let sidebarResizeObserver: ResizeObserver | null = null;

const {
  loadHomeLayout,
  createCategory,
  persistLayout,
  deleteWidget,
  createWidget,
  updateCategoryBackground,
  migrateLegacyLayoutIfNeeded,
} = useGridPersistence(STORAGE_KEY);

const showCategoryBgPicker = ref(false);
const contextMenu = useContextMenu();
const globalStore = useGlobalStore();
const homeProfileStore = useHomeProfileStore();
let profileReloadReady = false;

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

const categoryBgPreviewSize = computed(() => getMeasuredSize(compAreaStageRef.value ?? compAreaWrapper.value, { width: 800, height: 500 }));
const headerBgPreviewSize = computed(() => getMeasuredSize(homeHeaderRef.value, { width: 800, height: 120 }));
const sidebarBgPreviewSize = computed(() => getMeasuredSize(sidebarPanelRef.value, { width: 200, height: 600 }));

function toObjectFit(backgroundSizeValue?: string): 'contain' | 'cover' | 'fill' | 'none' {
  switch (backgroundSizeValue) {
    case 'contain':
      return 'contain';
    case '100% 100%':
      return 'fill';
    case 'auto':
      return 'none';
    default:
      return 'cover';
  }
}

function buildPanelTextStyle(textColor?: string) {
  return buildBackgroundTextVars(textColor, {
    aliases: {
      primary: ['--ui-text-primary'],
      secondary: ['--ui-text-secondary'],
      muted: ['--ui-text-muted'],
      subtle: ['--ui-text-subtle'],
    },
  });
}

// ─── 顶栏背景 ───
const HEADER_BG_STORAGE_KEY = 'home-header-background';
const headerBg = reactive({
  color: '',
  image: '',
  video: '',
  style: undefined as import('../../types/grid').BackgroundStyleConfig | undefined,
});
const showHeaderBgPicker = ref(false);

const headerBgStyle = computed(() => {
  const s: Record<string, string> = {};
  if (headerBg.image) {
    s.backgroundImage = `url(${headerBg.image})`;
    s.backgroundSize = headerBg.style?.backgroundSize || 'cover';
    s.backgroundPosition = headerBg.style?.backgroundPosition || 'center';
    s.backgroundRepeat = headerBg.style?.backgroundRepeat || 'no-repeat';
  } else if (headerBg.color) {
    s.background = headerBg.color;
  }
  if (headerBg.style?.opacity !== undefined && headerBg.style.opacity < 1) {
    s.opacity = String(headerBg.style.opacity);
  }
  Object.assign(s, buildPanelTextStyle(headerBg.style?.textColor));
  return s;
});

const headerBgVideoStyle = computed(() => ({
  objectFit: toObjectFit(headerBg.style?.backgroundSize),
  objectPosition: headerBg.style?.backgroundPosition || 'center',
}));

function handleHeaderContextMenu(e: MouseEvent) {
  e.preventDefault();
  const menuItems: ContextMenuItem[] = [
    {
      id: 'header-bg',
      label: '顶栏个性化配置',
      icon: EditIcon,
      action: () => { showHeaderBgPicker.value = true; },
    },
  ];
  contextMenu.open(e.clientX, e.clientY, menuItems);
}

function handleHeaderBgConfirm(payload: BackgroundConfirmPayload) {
  if (payload.type === 'color') {
    headerBg.color = payload.color || '';
    headerBg.image = '';
    headerBg.video = '';
    headerBg.style = payload.backgroundStyle;
  } else if (payload.type === 'image') {
    headerBg.image = payload.image || '';
    headerBg.video = '';
    headerBg.style = payload.backgroundStyle;
  } else if (payload.type === 'video') {
    headerBg.video = payload.video || '';
    headerBg.image = '';
    headerBg.style = payload.backgroundStyle;
  }

  try {
    window.homeWorkspaceApi?.updateBackground({
      header: {
        color: headerBg.color,
        image: headerBg.image,
        video: headerBg.video,
        style: headerBg.style as Record<string, unknown> | undefined,
      },
    }).catch(() => {
      // fallback: 写 localStorage
      localStorage.setItem(HEADER_BG_STORAGE_KEY, JSON.stringify({ color: headerBg.color, image: headerBg.image, video: headerBg.video, style: headerBg.style }));
    });
  } catch { /* ignore */ }
}

// ─── 侧边栏背景 ───
const SIDEBAR_BG_STORAGE_KEY = 'home-sidebar-background';
const sidebarBg = reactive({
  color: '',
  image: '',
  video: '',
  style: undefined as import('../../types/grid').BackgroundStyleConfig | undefined,
});
const showSidebarBgPicker = ref(false);

const sidebarBgStyle = computed(() => {
  const s: Record<string, string> = {};
  if (sidebarBg.image) {
    s.backgroundImage = `url(${sidebarBg.image})`;
    s.backgroundSize = sidebarBg.style?.backgroundSize || 'cover';
    s.backgroundPosition = sidebarBg.style?.backgroundPosition || 'center';
    s.backgroundRepeat = sidebarBg.style?.backgroundRepeat || 'no-repeat';
  } else if (sidebarBg.color) {
    s.background = sidebarBg.color;
  }
  if (sidebarBg.style?.opacity !== undefined && sidebarBg.style.opacity < 1) {
    s.opacity = String(sidebarBg.style.opacity);
  }
  Object.assign(s, buildPanelTextStyle(sidebarBg.style?.textColor));
  return s;
});

const sidebarBgVideoStyle = computed(() => ({
  objectFit: toObjectFit(sidebarBg.style?.backgroundSize),
  objectPosition: sidebarBg.style?.backgroundPosition || 'center',
}));

function handleSidebarContextMenu(e: MouseEvent) {
  e.preventDefault();
  const menuItems: ContextMenuItem[] = [
    {
      id: 'sidebar-add-category',
      label: '添加类别',
      icon: AddIconComponent,
      action: () => { openAddCategoryDialog(); },
    },
    {
      id: 'sidebar-bg',
      label: '侧边栏个性化配置',
      icon: EditIcon,
      action: () => { showSidebarBgPicker.value = true; },
    },
  ];
  contextMenu.open(e.clientX, e.clientY, menuItems);
}

function handleSidebarBgConfirm(payload: BackgroundConfirmPayload) {
  if (payload.type === 'color') {
    sidebarBg.color = payload.color || '';
    sidebarBg.image = '';
    sidebarBg.video = '';
    sidebarBg.style = payload.backgroundStyle;
  } else if (payload.type === 'image') {
    sidebarBg.image = payload.image || '';
    sidebarBg.video = '';
    sidebarBg.style = payload.backgroundStyle;
  } else if (payload.type === 'video') {
    sidebarBg.video = payload.video || '';
    sidebarBg.image = '';
    sidebarBg.style = payload.backgroundStyle;
  }

  try {
    window.homeWorkspaceApi?.updateBackground({
      sidebar: {
        color: sidebarBg.color,
        image: sidebarBg.image,
        video: sidebarBg.video,
        style: sidebarBg.style as Record<string, unknown> | undefined,
      },
    }).catch(() => {
      localStorage.setItem(SIDEBAR_BG_STORAGE_KEY, JSON.stringify({ color: sidebarBg.color, image: sidebarBg.image, video: sidebarBg.video, style: sidebarBg.style }));
    });
  } catch { /* ignore */ }
}

function resetCategorySelection(hasCategories: boolean) {
  activeCategoryIndex.value = 0;
  slotAIndex.value = hasCategories ? 0 : -1;
  slotBIndex.value = -1;
  activeSlot.value = 'A';
  isTransitioning.value = false;
  transitionDirection.value = 'down';
}

function applyCategories(nextCategories: CategoryItem[], options: { resetActive?: boolean } = {}) {
  const previousActiveCategoryId = categories[activeCategoryIndex.value]?.id;
  categories.splice(0, categories.length, ...nextCategories);

  if (categories.length === 0) {
    resetCategorySelection(false);
    return;
  }

  if (options.resetActive) {
    resetCategorySelection(true);
    void nextTick(() => {
      updateCategoryScrollState();
      updateSliderPosition();
    });
    return;
  }

  const matchedIndex = previousActiveCategoryId
    ? categories.findIndex(category => category.id === previousActiveCategoryId)
    : -1;
  const resolvedIndex = matchedIndex >= 0 ? matchedIndex : Math.min(activeCategoryIndex.value, categories.length - 1);

  activeCategoryIndex.value = resolvedIndex;
  if (activeSlot.value === 'A') {
    slotAIndex.value = resolvedIndex;
  } else {
    slotBIndex.value = resolvedIndex;
  }
  void nextTick(() => {
    updateCategoryScrollState();
    updateSliderPosition();
  });
}

async function reloadHomeLayout(options: { resetActive?: boolean } = {}) {
  const nextCategories = await loadHomeLayout();
  applyCategories(nextCategories, options);
  loadError.value = '';
}

function enqueueMutation(task: () => Promise<void>) {
  mutationQueue = mutationQueue
    .then(task)
    .catch(async error => {
      console.error('Failed to persist home layout mutation:', error);
      loadError.value = '首页布局保存失败，已自动重新加载。';
      notifyError(error, '首页布局保存失败');

      try {
        await reloadHomeLayout();
      } catch (reloadError) {
        console.error('Failed to reload home layout after mutation error:', reloadError);
        notifyError(reloadError, '首页布局重新加载失败');
      }
    });

  return mutationQueue;
}

async function loadWorkspaceBackgrounds() {
  headerBg.color = '';
  headerBg.image = '';
  headerBg.video = '';
  headerBg.style = undefined;
  sidebarBg.color = '';
  sidebarBg.image = '';
  sidebarBg.video = '';
  sidebarBg.style = undefined;

  if (!window.homeWorkspaceApi) {
    return;
  }

  try {
    const bgState = await window.homeWorkspaceApi.getBackground();
    const h = bgState.header;
    const s = bgState.sidebar;

    // 旧版 localStorage 迁移只归入 default 配置，避免新配置被旧数据污染。
    if (homeProfileStore.activeProfileKey === 'default') {
      const hasDbHeader = h.color || h.image || h.video;
      const hasDbSidebar = s.color || s.image || s.video;

      if (!hasDbHeader) {
        const raw = localStorage.getItem(HEADER_BG_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          h.color = saved.color || '';
          h.image = saved.image || '';
          h.video = saved.video || '';
          h.style = saved.style;
          await window.homeWorkspaceApi.updateBackground({ header: h });
          localStorage.removeItem(HEADER_BG_STORAGE_KEY);
        }
      }
      if (!hasDbSidebar) {
        const raw = localStorage.getItem(SIDEBAR_BG_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          s.color = saved.color || '';
          s.image = saved.image || '';
          s.video = saved.video || '';
          s.style = saved.style;
          await window.homeWorkspaceApi.updateBackground({ sidebar: s });
          localStorage.removeItem(SIDEBAR_BG_STORAGE_KEY);
        }
      }
    }

    headerBg.color = h.color || '';
    headerBg.image = h.image || '';
    headerBg.video = h.video || '';
    headerBg.style = h.style as import('../../types/grid').BackgroundStyleConfig | undefined;

    sidebarBg.color = s.color || '';
    sidebarBg.image = s.image || '';
    sidebarBg.video = s.video || '';
    sidebarBg.style = s.style as import('../../types/grid').BackgroundStyleConfig | undefined;
  } catch (e) {
    console.warn('[Home] 加载工作区背景失败，使用空背景:', e);
    notifyError(e, '首页背景加载失败');
  }
}

async function initializeHomeLayout(options: { resetActive?: boolean } = {}) {
  isLoading.value = true;
  loadError.value = '';

  try {
    await loadWorkspaceBackgrounds();
    await reloadHomeLayout({ resetActive: options.resetActive });
    const migrated = homeProfileStore.activeProfileKey === 'default'
      ? await migrateLegacyLayoutIfNeeded()
      : false;
    if (migrated) {
      await reloadHomeLayout({ resetActive: options.resetActive });
    }
  } catch (error) {
    console.error('Failed to initialize home layout:', error);
    loadError.value = '首页布局加载失败。';
    notifyError(error, '首页布局加载失败');
  } finally {
    isLoading.value = false;
  }
}

function switchCategory(index: number) {
  if (categories.length === 0 || index === activeCategoryIndex.value || index < 0 || index >= categories.length) {
    return;
  }

  if (isTransitioning.value) {
    return;
  }

  transitionDirection.value = index > activeCategoryIndex.value ? 'down' : 'up';
  // 将新分类加载到隐藏插槽，作为 incoming-page 滑入
  if (activeSlot.value === 'A') {
    slotBIndex.value = index;
  } else {
    slotAIndex.value = index;
  }
  activeCategoryIndex.value = index;
  isTransitioning.value = true;

  setTimeout(() => {
    // 动画结束：直接交换角色，视频元素不会被销毁
    activeSlot.value = activeSlot.value === 'A' ? 'B' : 'A';
    isTransitioning.value = false;
  }, 550);
}

function getSlotClasses(slot: 'A' | 'B') {
  const isActive = activeSlot.value === slot;
  const isIncoming = !isActive && isTransitioning.value;
  return {
    'current-page': isActive,
    'incoming-page': isIncoming,
    'slide-in-up': isIncoming && transitionDirection.value === 'up',
    'slide-in-down': isIncoming && transitionDirection.value === 'down',
  };
}

function getSlotStyle(slot: 'A' | 'B'): Record<string, string> {
  const isActive = activeSlot.value === slot;
  const isVisible = isActive || isTransitioning.value;
  return isVisible ? {} : { visibility: 'hidden', pointerEvents: 'none' };
}

function openAddCategoryDialog() {
  newCategoryForm.label = '';
  newCategoryForm.icon = 'iconify:mdi:wrench';
  showAddCategoryDialog.value = true;
}

function closeAddCategoryDialog() {
  showAddCategoryDialog.value = false;
}

function handleCategoryLabelKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    confirmAddCategory();
  }
}

function getCategoryListViewport() {
  return categoryListRef.value;
}

function updateCategoryScrollState() {
  const el = getCategoryListViewport();
  if (!el) {
    canScrollCategoryUp.value = false;
    canScrollCategoryDown.value = false;
    return;
  }

  const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  canScrollCategoryUp.value = el.scrollTop > 4;
  canScrollCategoryDown.value = maxScrollTop - el.scrollTop > 4;
}

function updateSliderPosition() {
  const listEl = categoryListRef.value;
  if (!listEl || categories.length === 0) {
    sliderStyle.visible = false;
    return;
  }

  const buttons = listEl.querySelectorAll('.category-item');
  const activeBtn = buttons[activeCategoryIndex.value] as HTMLElement | undefined;
  if (!activeBtn) {
    sliderStyle.visible = false;
    return;
  }

  sliderStyle.top = activeBtn.offsetTop;
  sliderStyle.height = activeBtn.offsetHeight;
  sliderStyle.visible = true;
}

function scrollCategoryList(direction: 'up' | 'down') {
  const el = getCategoryListViewport();
  if (!el) {
    return;
  }

  const offset = Math.max(88, Math.floor(el.clientHeight * 0.35));
  el.scrollBy({
    top: direction === 'down' ? offset : -offset,
    behavior: 'smooth',
  });
}

function confirmAddCategory() {
  const label = newCategoryForm.label.trim();
  if (!label) {
    return;
  }

  const sortOrder = categories.reduce((max, category) => Math.max(max, category.sortOrder), 0) + 1;
  const newCategory: CategoryItem = {
    id: `category-${Date.now()}`,
    label,
    icon: newCategoryForm.icon || 'iconify:mdi:wrench',
    sortOrder,
    gridItems: [],
  };

  const wasEmpty = categories.length === 0;
  categories.push(newCategory);
  closeAddCategoryDialog();
  if (wasEmpty) {
    resetCategorySelection(true);
    void nextTick(() => {
      updateCategoryScrollState();
      updateSliderPosition();
    });
  } else {
    switchCategory(categories.length - 1);
  }

  void enqueueMutation(async () => {
    await createCategory(newCategory);
  });
}

function handleLayoutChange(categoryId: string, gridItems: GridItem[]) {
  void enqueueMutation(async () => {
    await persistLayout(categoryId, gridItems);
  });
}

function handleItemDeleted(_categoryId: string, itemId: string) {
  void enqueueMutation(async () => {
    await deleteWidget(itemId);
  });
}

function handleItemCreated(categoryId: string, item: GridItem) {
  void enqueueMutation(async () => {
    const payload: CreateHomeWidgetPayload = {
      id: item.id,
      categoryId,
      label: item.label,
      icon: item.icon,
      action: item.action ? { ...item.action } : undefined,
      sourceType: item.sourceType,
      widgetType: item.widgetType,
      sizePreset: item.sizePreset,
      widgetConfig: item.widgetConfig ? { ...item.widgetConfig } : undefined,
      col: item.col,
      row: item.row,
      colSpan: item.colSpan,
      rowSpan: item.rowSpan,
      preferredCol: item.preferredCol,
      preferredRow: item.preferredRow,
      priority: item.priority,
      color: item.color,
      backgroundImage: item.backgroundImage,
      backgroundVideo: item.backgroundVideo,
      backgroundStyle: item.backgroundStyle ? { ...item.backgroundStyle } : undefined,
      hidden: item.hidden,
    };
    await createWidget(payload);
  });
}

function openCategoryBgPicker() {
  showCategoryBgPicker.value = true;
}

function closeCategoryBgPicker() {
  showCategoryBgPicker.value = false;
}

function handleCategoryBgConfirm(payload: BackgroundConfirmPayload) {
  const cat = activeCategory.value;
  if (!cat) return;

  if (payload.type === 'color') {
    cat.backgroundColor = payload.color || '';
    cat.backgroundImage = '';
    cat.backgroundVideo = '';
    cat.backgroundStyle = payload.backgroundStyle;
  } else if (payload.type === 'image') {
    cat.backgroundColor = '';
    cat.backgroundImage = payload.image || '';
    cat.backgroundVideo = '';
    cat.backgroundStyle = payload.backgroundStyle;
  } else if (payload.type === 'video') {
    cat.backgroundColor = '';
    cat.backgroundVideo = payload.video || '';
    cat.backgroundImage = '';
    cat.backgroundStyle = payload.backgroundStyle;
  }

  void enqueueMutation(async () => {
    await updateCategoryBackground(cat.id, {
      backgroundColor: cat.backgroundColor,
      backgroundImage: cat.backgroundImage,
      backgroundVideo: cat.backgroundVideo,
      backgroundStyle: cat.backgroundStyle,
    });
  });
}

function handleWheel(event: WheelEvent) {
  if (categories.length < 2 || isTransitioning.value) {
    return;
  }

  if (wheelTimeout) {
    return;
  }

  wheelTimeout = setTimeout(() => {
    wheelTimeout = null;
  }, WHEEL_DEBOUNCE_MS);

  if (event.deltaY > 0) {
    switchCategory((activeCategoryIndex.value + 1) % categories.length);
  } else if (event.deltaY < 0) {
    switchCategory((activeCategoryIndex.value - 1 + categories.length) % categories.length);
  }
}

// ─── 首次挂载：仅初始化数据 ───
onMounted(() => {
  void (async () => {
    try {
      await homeProfileStore.loadProfiles();
    } catch (error) {
      console.warn('[Home] 首页配置文件初始化失败，继续尝试加载默认布局:', error);
      notifyError(error, '首页配置文件加载失败');
    }
    await initializeHomeLayout();
    profileReloadReady = true;
  })();
});

// ─── 辅助函数：绑定/解绑事件监听 ───
function attachEventListeners() {
  if (compAreaWrapper.value) {
    compAreaWrapper.value.addEventListener('wheel', handleWheel, { passive: true });
  }

  if (!sidebarResizeObserver) {
    sidebarResizeObserver = new ResizeObserver(() => {
      updateCategoryScrollState();
    });
  }

  window.addEventListener('resize', updateCategoryScrollState);
  void nextTick(() => {
    const viewport = getCategoryListViewport();
    if (viewport) {
      sidebarResizeObserver?.observe(viewport);
    }
    updateCategoryScrollState();
  });
}

function detachEventListeners() {
  if (compAreaWrapper.value) {
    compAreaWrapper.value.removeEventListener('wheel', handleWheel);
  }

  if (wheelTimeout) {
    clearTimeout(wheelTimeout);
  }

  sidebarResizeObserver?.disconnect();
  window.removeEventListener('resize', updateCategoryScrollState);
}

// ─── KeepAlive 激活 / 停用 ───
function resumeAllVideos() {
  if (!homeShellRef.value) return;
  const videos = homeShellRef.value.querySelectorAll('video');
  videos.forEach(video => {
    if (video.paused && video.src) {
      video.play().catch(() => { /* 忽略自动播放被阻止的情况 */ });
    }
  });
}

function pauseAllVideos() {
  if (!homeShellRef.value) return;
  const videos = homeShellRef.value.querySelectorAll('video');
  videos.forEach(video => {
    if (!video.paused) {
      video.pause();
    }
  });
}

onActivated(() => {
  attachEventListeners();
  // 恢复所有背景视频播放
  void nextTick(() => resumeAllVideos());
  // 恢复顶栏沉浸色
  globalStore.setTopbarColor(activeCategory.value?.backgroundColor || '');
  // 恢复滑块位置
  void nextTick(updateSliderPosition);
});

onDeactivated(() => {
  detachEventListeners();
  // 暂停所有背景视频以节省资源
  pauseAllVideos();
  // 离开时清除沉浸色
  globalStore.setTopbarColor('');
});

// ─── 最终销毁时兜底清理 ───
onUnmounted(() => {
  detachEventListeners();
  sidebarResizeObserver = null;
});

watch(() => categories.length, async () => {
  await nextTick();
  updateCategoryScrollState();
  updateSliderPosition();
});

// ─── 监听活跃分类索引变化，更新滑块位置 ───
watch(activeCategoryIndex, async () => {
  await nextTick();
  updateSliderPosition();
});

// ─── 监听活跃分类背景色变化，同步到顶栏沉浸色 ───
watch(() => activeCategory.value?.backgroundColor, (bgColor) => {
  globalStore.setTopbarColor(bgColor || '');
});

watch(() => homeProfileStore.activeProfileKey, (key, previousKey) => {
  if (!profileReloadReady || key === previousKey) {
    return;
  }

  void initializeHomeLayout({ resetActive: true });
});
</script>

<template>
  <div class="home-shell" ref="homeShellRef">
    <div class="home-container">
      <aside class="category-sidebar" @contextmenu="handleSidebarContextMenu">
        <UiCard ref="sidebarPanelRef" class="sidebar-panel" variant="elevated" :bordered="false" padding="none" radius="lg" :style="sidebarBgStyle">
          <video v-if="sidebarBg.video" class="sidebar-panel__video" :src="sidebarBg.video" :style="sidebarBgVideoStyle"
            autoplay loop muted playsinline />
          <div class="sidebar-heading">
            <span class="sidebar-heading__title">分类导航</span>
          </div>

          <div class="category-list-shell">
            <button v-if="canScrollCategoryUp" class="category-scroll-btn category-scroll-btn--up" type="button"
              aria-label="向上滚动分类列表" @click="scrollCategoryList('up')">
              <span class="category-scroll-btn__icon">
                <ChevronIconComponent direction="up" :width="18" :height="18" />
              </span>
            </button>

            <div ref="categoryListRef" class="category-list" @scroll="updateCategoryScrollState">
              <div
                v-if="sliderStyle.visible"
                class="category-slider"
                :style="{
                  transform: `translateY(${sliderStyle.top}px)`,
                  height: `${sliderStyle.height}px`,
                }"
              />
              <button v-for="(category, index) in categories" :key="category.id" class="category-item"
                :class="{ active: index === activeCategoryIndex }" :title="category.label"
                @click="switchCategory(index)">
                <div class="category-icon">
                  <IconRenderer :icon="category.icon" :size="26" />
                </div>
                <div class="category-label">{{ category.label }}</div>
              </button>
            </div>

            <button v-if="canScrollCategoryDown" class="category-scroll-btn category-scroll-btn--down" type="button"
              aria-label="向下滚动分类列表" @click="scrollCategoryList('down')">
              <span class="category-scroll-btn__icon">
                <ChevronIconComponent direction="down" :width="18" :height="18" />
              </span>
            </button>
          </div>
        </UiCard>
      </aside>

      <section class="home-stage">
        <header ref="homeHeaderRef" class="home-stage__header" :style="headerBgStyle" @contextmenu="handleHeaderContextMenu">
          <video v-if="headerBg.video" class="home-stage__header-video" :src="headerBg.video" :style="headerBgVideoStyle"
            autoplay loop muted playsinline />
          <!-- 3D ambient decoration behind header content -->
          <Ui3DSceneComponent
            class="home-stage__header-3d"
            :paused="false"
            :camera-z="5"
            :ambient-intensity="0.8"
            :directional-intensity="0.3"
            @scene-ready="onHeader3DReady"
          />
          <Ui3DFloatingShapesComponent :scene="header3DScene" :speed="0.4" :opacity="0.18" />
          <div class="home-stage__header-inner">
            <div class="home-stage__title-group">
              <h1>{{ activeCategory?.label || '首页工作台' }}</h1>
              <p>{{ activeCategoryDescription }}</p>
            </div>


            <div class="home-stage__metrics">
              <div class="home-metric-chip">
                <span class="metric-label">当前分类</span>
                <strong>{{ activeCategoryWidgetCount }}</strong>
                <span class="metric-unit">个组件</span>
              </div>
              <div class="home-metric-chip">
                <span class="metric-label">分类总数</span>
                <strong>{{ visibleCategoryCount }}</strong>
                <span class="metric-unit">个分组</span>
              </div>
              <div class="home-metric-chip">
                <span class="metric-label">全部组件</span>
                <strong>{{ totalWidgetCount }}</strong>
                <span class="metric-unit">个入口</span>
              </div>
            </div>
          </div>
        </header>

        <div class="comp-area-wrapper" ref="compAreaWrapper">
          <UiCard class="comp-area-panel" variant="elevated" :bordered="false" padding="none" radius="lg">
            <div v-if="isLoading" class="home-state">
              <UiStateCard class="home-state-card" state="loading" title="首页布局加载中..." description="正在恢复你的桌面工作台布局。" />
            </div>
            <div v-else-if="!activeSlotCategory" class="home-state">
              <!-- 3D ambient background scene -->
              <Ui3DSceneComponent :paused="false" :camera-z="7" :ambient-intensity="0.7" :directional-intensity="0.5"
                @scene-ready="({ scene }: any) => (header3DScene = scene)" />
              <Ui3DFloatingShapesComponent :scene="header3DScene" :speed="0.6" :opacity="0.28" />
              <UiStateCard class="home-state-card" :state="loadError ? 'error' : 'empty'" :title="loadError || '暂无首页分类'"
                :description="loadError ? '请稍后重试，或检查布局数据。' : '从左侧添加一个类别，开始组织你的工具。'" />
            </div>

            <div v-else ref="compAreaStageRef" class="comp-area-stage">
              <!-- Slot A -->
              <div class="comp-area-container" :class="getSlotClasses('A')" :style="getSlotStyle('A')">
                <CompArea v-if="slotACategory" :category="slotACategory" :config="gridConfig"
                  @layout-change="handleLayoutChange" @item-deleted="handleItemDeleted"
                  @item-created="handleItemCreated" @change-background="openCategoryBgPicker" />
              </div>

              <!-- Slot B -->
              <div class="comp-area-container" :class="getSlotClasses('B')" :style="getSlotStyle('B')">
                <CompArea v-if="slotBCategory" :category="slotBCategory" :config="gridConfig"
                  @layout-change="handleLayoutChange" @item-deleted="handleItemDeleted"
                  @item-created="handleItemCreated" @change-background="openCategoryBgPicker" />
              </div>
            </div>
          </UiCard>
        </div>
      </section>
    </div>

    <!-- 添加类别对话框 -->
    <UiDialog v-model="showAddCategoryDialog" class="dialog-container" width="400px" max-width="400px" :close-on-mask="false">
      <template #header>
        <div class="dialog-header">
          <h3>添加新类别</h3>
          <UiIconButton class="dialog-close-btn" variant="ghost" size="md" shape="square" title="关闭"
            @click="closeAddCategoryDialog">
            ✕
          </UiIconButton>
        </div>
      </template>

      <div class="dialog-body">
        <UiField label="类别名称" for="category-label">
          <UiInput id="category-label" v-model="newCategoryForm.label" placeholder="请输入类别名称"
            @keydown="handleCategoryLabelKeydown" />
        </UiField>
        <UiField label="图标" for="category-icon">
          <div class="icon-pick-trigger" @click="showCategoryIconPicker = true">
            <div v-if="newCategoryForm.icon" class="icon-pick-trigger__preview">
              <IconRenderer :icon="newCategoryForm.icon" :size="20" color="var(--ui-text-primary)" />
              <span class="icon-pick-trigger__label">更换图标</span>
            </div>
            <span v-else class="icon-pick-trigger__placeholder">点击选择图标</span>
            <span class="icon-pick-trigger__arrow" />
          </div>
        </UiField>

        <IconPicker :visible="showCategoryIconPicker" v-model="newCategoryForm.icon"
          @close="showCategoryIconPicker = false" />
      </div>

      <template #footer>
        <div class="dialog-footer">
          <UiButton variant="secondary" @click="closeAddCategoryDialog">取消</UiButton>
          <UiButton variant="primary" @click="confirmAddCategory" :disabled="!newCategoryForm.label.trim()">确认
          </UiButton>
        </div>
      </template>
    </UiDialog>

    <!-- 类别区域个性化配置 -->
    <UiPersonalizationConfig :visible="showCategoryBgPicker" :currentBackground="activeCategory?.backgroundColor"
      :currentBackgroundImage="activeCategory?.backgroundImage"
      :currentBackgroundVideo="activeCategory?.backgroundVideo"
      :currentBackgroundStyle="activeCategory?.backgroundStyle"
      :preview-width="categoryBgPreviewSize.width" :preview-height="categoryBgPreviewSize.height"
      @close="closeCategoryBgPicker" @confirm="handleCategoryBgConfirm" />

    <!-- 顶栏个性化配置 -->
    <UiPersonalizationConfig :visible="showHeaderBgPicker" :currentBackground="headerBg.color"
      :currentBackgroundImage="headerBg.image" :currentBackgroundVideo="headerBg.video"
      :currentBackgroundStyle="headerBg.style"
      :preview-width="headerBgPreviewSize.width" :preview-height="headerBgPreviewSize.height"
      @close="showHeaderBgPicker = false" @confirm="handleHeaderBgConfirm" />

    <!-- 侧边栏个性化配置 -->
    <UiPersonalizationConfig :visible="showSidebarBgPicker" :currentBackground="sidebarBg.color"
      :currentBackgroundImage="sidebarBg.image" :currentBackgroundVideo="sidebarBg.video"
      :currentBackgroundStyle="sidebarBg.style"
      :preview-width="sidebarBgPreviewSize.width" :preview-height="sidebarBgPreviewSize.height"
      @close="showSidebarBgPicker = false" @confirm="handleSidebarBgConfirm" />
  </div>
</template>

<style lang="scss">
@use './home.scss';
</style>
