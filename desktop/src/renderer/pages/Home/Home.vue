<script lang="ts" setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, reactive, ref } from 'vue';
import CompArea from '../../components/CompArea/CompArea.vue';
import { useGridPersistence } from '../../composables/useGridPersistence';
import type { CategoryItem, GridConfig, GridItem } from '../../types/grid';

const GRID_GAP = 8;
const MIN_UNIT_SIZE = 1;
const STORAGE_KEY = 'comp-area-grid-items';
const GRID_PADDING = GRID_GAP / 2;
const HOLD_DELAY_MS = 200;
const FIXED_COLUMNS = 16;

const gridConfig: GridConfig = {
  GRID_GAP,
  MIN_UNIT_SIZE,
  STORAGE_KEY,
  GRID_PADDING,
  HOLD_DELAY_MS,
  FIXED_COLUMNS,
};

// 类别图标映射
const categoryIconComponents: Record<string, any> = {
  'category-tools': defineAsyncComponent(() => import('../../components/svgs/icons/CategoryToolIcon.vue')),
  'category-media': defineAsyncComponent(() => import('../../components/svgs/icons/CategoryMediaIcon.vue')),
  'category-text': defineAsyncComponent(() => import('../../components/svgs/icons/CategoryTextIcon.vue')),
  'category-dev': defineAsyncComponent(() => import('../../components/svgs/icons/CategoryDevIcon.vue')),
};

const AddIconComponent = defineAsyncComponent(() => import('../../components/svgs/icons/AddIcon.vue'));

const defaultCategories: CategoryItem[] = [
  {
    id: 'category-tools',
    label: '常用工具',
    icon: 'category-tools',
    gridItems: [
      {
        id: 'grid-item-1',
        label: '工具1',
        icon: 'tool',
        col: 1,
        row: 1,
        colSpan: 1,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #5c9ded, #84c9ff)',
        isDragging: false,
        preferredCol: 1,
        preferredRow: 1,
        priority: 1,
        hidden: false,
      },
      {
        id: 'grid-item-2',
        label: '工具2',
        icon: 'settings',
        col: 3,
        row: 1,
        colSpan: 1,
        rowSpan: 2,
        color: 'linear-gradient(135deg, #ff9a75, #ffc38f)',
        isDragging: false,
        preferredCol: 3,
        preferredRow: 1,
        priority: 2,
        hidden: false,
      },
      {
        id: 'grid-item-3',
        label: '工具3',
        icon: 'tool',
        col: 5,
        row: 1,
        colSpan: 2,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #6bdcba, #a5f2d4)',
        isDragging: false,
        preferredCol: 5,
        preferredRow: 1,
        priority: 3,
        hidden: false,
      },
    ],
  },
  {
    id: 'category-media',
    label: '媒体处理',
    icon: 'category-media',
    gridItems: [
      {
        id: 'grid-item-4',
        label: '视频',
        icon: 'video',
        col: 1,
        row: 1,
        colSpan: 2,
        rowSpan: 2,
        color: 'linear-gradient(135deg, #b97fff, #d7a6ff)',
        isDragging: false,
        preferredCol: 1,
        preferredRow: 1,
        priority: 1,
        hidden: false,
      },
      {
        id: 'grid-item-5',
        label: '音频',
        icon: 'audio',
        col: 4,
        row: 1,
        colSpan: 1,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #ff6b9d, #ffa0c5)',
        isDragging: false,
        preferredCol: 4,
        preferredRow: 1,
        priority: 2,
        hidden: false,
      },
    ],
  },
  {
    id: 'category-text',
    label: '文本处理',
    icon: 'category-text',
    gridItems: [
      {
        id: 'grid-item-6',
        label: '编辑器',
        icon: 'edit',
        col: 1,
        row: 1,
        colSpan: 3,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #ffd93d, #ffed4e)',
        isDragging: false,
        preferredCol: 1,
        preferredRow: 1,
        priority: 1,
        hidden: false,
      },
      {
        id: 'grid-item-7',
        label: '转换',
        icon: 'convert',
        col: 1,
        row: 3,
        colSpan: 1,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #6bcf7f, #a5f2b4)',
        isDragging: false,
        preferredCol: 1,
        preferredRow: 3,
        priority: 2,
        hidden: false,
      },
    ],
  },
  {
    id: 'category-dev',
    label: '开发工具',
    icon: 'category-dev',
    gridItems: [
      {
        id: 'grid-item-8',
        label: 'API',
        icon: 'api',
        col: 1,
        row: 1,
        colSpan: 2,
        rowSpan: 1,
        color: 'linear-gradient(135deg, #667eea, #764ba2)',
        isDragging: false,
        preferredCol: 1,
        preferredRow: 1,
        priority: 1,
        hidden: false,
      },
    ],
  },
];

const compAreaWrapper = ref<HTMLElement | null>(null);

const categories = reactive<CategoryItem[]>(defaultCategories);
const activeCategoryIndex = ref(0);
const currentDisplayIndex = ref(0);
const nextCategoryIndex = ref(0);
const isTransitioning = ref(false);
const transitionDirection = ref<'up' | 'down'>('down');

// 滚轮事件处理
let wheelTimeout: NodeJS.Timeout | null = null;
const WHEEL_DEBOUNCE_MS = 150; // 防抖延迟

const activeCategory = computed(() => categories[activeCategoryIndex.value]);
const currentDisplayCategory = computed(() => categories[currentDisplayIndex.value]);
const nextCategory = computed(() => categories[nextCategoryIndex.value]);

// 添加类别对话框相关状态
const showAddCategoryDialog = ref(false);
const newCategoryForm = reactive({
  label: '',
  icon: 'category-tools',
});

// 使用持久化 composable
const { loadAllCategoryLayouts, saveCategoryList, loadCategoryList } = useGridPersistence(STORAGE_KEY);

function switchCategory(index: number) {
  if (index === activeCategoryIndex.value || index < 0 || index >= categories.length) {
    return;
  }

  if (isTransitioning.value) {
    return;
  }

  transitionDirection.value = index > activeCategoryIndex.value ? 'down' : 'up';
  nextCategoryIndex.value = index;

  // 立即更新激活索引，让侧边栏立即响应
  activeCategoryIndex.value = index;
  isTransitioning.value = true;

  // 在动画快结束时切换显示的内容
  setTimeout(() => {
    currentDisplayIndex.value = index;
  }, 450);

  // 动画完全结束后再清理状态
  setTimeout(() => {
    isTransitioning.value = false;
  }, 550);
}

// 打开添加类别对话框
function openAddCategoryDialog() {
  newCategoryForm.label = '';
  newCategoryForm.icon = 'category-tools';
  showAddCategoryDialog.value = true;
}

// 关闭对话框
function closeAddCategoryDialog() {
  showAddCategoryDialog.value = false;
}

// 确认添加类别
function confirmAddCategory() {
  if (!newCategoryForm.label.trim()) {
    return;
  }

  const newCategory: CategoryItem = {
    id: `category-${Date.now()}`,
    label: newCategoryForm.label.trim(),
    icon: newCategoryForm.icon || 'category-tools',
    gridItems: [],
  };

  categories.push(newCategory);

  // 保存到 localStorage
  saveCategoryList(categories);

  closeAddCategoryDialog();

  // 切换到新添加的类别
  switchCategory(categories.length - 1);
}

// 加载保存的类别列表
function loadSavedCategories() {
  const savedCategories = loadCategoryList();
  if (!savedCategories || savedCategories.length === 0) return;

  // 替换为保存的类别
  const customCategories: CategoryItem[] = savedCategories.map(cat => ({
    id: cat.id,
    label: cat.label,
    icon: cat.icon || 'category-tools',
    gridItems: [] as GridItem[],
  }));

  if (customCategories.length > 0) {
    categories.splice(0, categories.length, ...customCategories);
  }
}

// 滚轮事件处理函数
function handleWheel(event: WheelEvent) {
  // 如果正在过渡，忽略滚轮事件
  if (isTransitioning.value) {
    return;
  }

  // 防抖处理
  if (wheelTimeout) {
    return;
  }

  wheelTimeout = setTimeout(() => {
    wheelTimeout = null;
  }, WHEEL_DEBOUNCE_MS);

  // 判断滚动方向
  const delta = event.deltaY;

  if (delta > 0) {
    // 向下滚动，切换到下一个类别（循环到第一个）
    const nextIndex = (activeCategoryIndex.value + 1) % categories.length;
    switchCategory(nextIndex);
  } else if (delta < 0) {
    // 向上滚动，切换到上一个类别（循环到最后一个）
    const prevIndex = (activeCategoryIndex.value - 1 + categories.length) % categories.length;
    switchCategory(prevIndex);
  }
}

onMounted(() => {
  loadSavedCategories();
  loadAllCategoryLayouts(categories);

  // 添加滚轮事件监听
  if (compAreaWrapper.value) {
    compAreaWrapper.value.addEventListener('wheel', handleWheel, { passive: true });
  }
});

onUnmounted(() => {
  // 清理滚轮事件监听
  if (compAreaWrapper.value) {
    compAreaWrapper.value.removeEventListener('wheel', handleWheel);
  }

  // 清理定时器
  if (wheelTimeout) {
    clearTimeout(wheelTimeout);
  }
});
</script>

<template>
  <div class="home-container">
    <!-- 侧边栏 -->
    <div class="category-sidebar">
      <div v-for="(category, index) in categories" :key="category.id" class="category-item"
        :class="{ active: index === activeCategoryIndex }" @click="switchCategory(index)">
        <div class="category-icon">
          <component v-if="categoryIconComponents[category.icon]" :is="categoryIconComponents[category.icon]"
            :width="28" :height="28" />
          <span v-else class="icon-emoji">{{ category.icon }}</span>
        </div>
        <div class="category-label">{{ category.label }}</div>
      </div>

      <!-- 添加类别按钮 -->
      <div class="category-item add-category-btn" @click="openAddCategoryDialog">
        <div class="category-icon">
          <AddIconComponent :width="24" :height="24" />
        </div>
        <div class="category-label">添加类别</div>
      </div>
    </div>

    <!-- 内容区域包装器 -->
    <div class="comp-area-wrapper" ref="compAreaWrapper">
      <!-- 当前显示的页面 -->
      <div class="comp-area-container current-page" :class="{
        'slide-out-up': isTransitioning && transitionDirection === 'up',
        'slide-out-down': isTransitioning && transitionDirection === 'down'
      }">
        <CompArea :category="currentDisplayCategory" :config="gridConfig" />
      </div>

      <!-- 即将进入的页面 -->
      <div v-if="isTransitioning" class="comp-area-container next-page" :class="{
        'slide-in-up': isTransitioning && transitionDirection === 'up',
        'slide-in-down': isTransitioning && transitionDirection === 'down'
      }">
        <CompArea :category="nextCategory" :config="gridConfig" />
      </div>
    </div>

    <!-- 添加类别对话框 -->
    <div v-if="showAddCategoryDialog" class="dialog-overlay" @click="closeAddCategoryDialog">
      <div class="dialog-container" @click.stop>
        <div class="dialog-header">
          <h3>添加新类别</h3>
          <button class="dialog-close-btn" @click="closeAddCategoryDialog">✕</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label for="category-label">类别名称</label>
            <input id="category-label" v-model="newCategoryForm.label" type="text" placeholder="请输入类别名称"
              @keyup.enter="confirmAddCategory" autofocus />
          </div>
          <div class="form-group">
            <label for="category-icon">图标类型</label>
            <select id="category-icon" v-model="newCategoryForm.icon">
              <option value="category-tools">工具图标</option>
              <option value="category-media">媒体图标</option>
              <option value="category-text">文档图标</option>
              <option value="category-dev">开发图标</option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-cancel" @click="closeAddCategoryDialog">取消</button>
          <button class="btn btn-confirm" @click="confirmAddCategory"
            :disabled="!newCategoryForm.label.trim()">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use './home.scss';
</style>
