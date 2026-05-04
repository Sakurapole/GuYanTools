<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import UiButton from './UiButton.vue';
import UiDialog from './UiDialog.vue';
import UiIconButton from './UiIconButton.vue';
import UiInput from './UiInput.vue';
import UiTabs from './UiTabs.vue';
import IconRenderer from './IconRenderer.vue';
import {
  POPULAR_ICON_SETS,
  QUICK_PICK_ICONS,
  encodeIconifyIcon,
  encodeImageIcon,
  encodeSvgIcon,
} from '../../composables/iconUtils';

const props = withDefaults(defineProps<{
  modelValue: string;
  visible: boolean;
}>(), {});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  close: [];
}>();

type PickerTab = 'library' | 'svg' | 'image';

const activeTab = ref<PickerTab>('library');
const activeTabTransition = ref('ui-tab-forward');
const activeTabOrder: PickerTab[] = ['library', 'svg', 'image'];
const selectedIcon = ref('');

// ─── 图标库 Tab ───
const searchQuery = ref('');
const activeSetPrefix = ref('mdi');
const searchResults = ref<string[]>([]);
const browseIcons = ref<string[]>([]);
const isSearching = ref(false);
const isBrowsing = ref(false);

let searchDebounce: ReturnType<typeof setTimeout> | null = null;
let abortController: AbortController | null = null;

const pickerTabs = [
  { key: 'library', label: '图标库' },
  { key: 'svg', label: '上传 SVG' },
  { key: 'image', label: '上传图片' },
];

watch(activeTab, (next, previous) => {
  activeTabTransition.value = activeTabOrder.indexOf(next) >= activeTabOrder.indexOf(previous)
    ? 'ui-tab-forward'
    : 'ui-tab-back';
});

const displayIcons = computed(() => {
  if (searchQuery.value.trim()) {
    return searchResults.value;
  }
  return browseIcons.value.length > 0 ? browseIcons.value : QUICK_PICK_ICONS;
});

const showingQuickPicks = computed(() => {
  return !searchQuery.value.trim() && browseIcons.value.length === 0;
});

async function searchIcons(query: string) {
  if (!query.trim()) {
    searchResults.value = [];
    return;
  }

  isSearching.value = true;
  abortController?.abort();
  abortController = new AbortController();

  try {
    const resp = await fetch(
      `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=80`,
      { signal: abortController.signal },
    );
    const data = await resp.json();
    searchResults.value = data.icons ?? [];
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('Icon search failed:', err);
      searchResults.value = [];
    }
  } finally {
    isSearching.value = false;
  }
}

async function browseIconSet(prefix: string) {
  activeSetPrefix.value = prefix;
  isBrowsing.value = true;

  try {
    const resp = await fetch(
      `https://api.iconify.design/collection?prefix=${prefix}`,
    );
    const data = await resp.json();

    // API 返回 uncategorized/categories 列表
    const icons: string[] = [];
    if (data.uncategorized) {
      for (const name of data.uncategorized) {
        icons.push(`${prefix}:${name}`);
        if (icons.length >= 120) break;
      }
    } else if (data.categories) {
      for (const cat of Object.values(data.categories)) {
        for (const name of (cat as string[])) {
          icons.push(`${prefix}:${name}`);
          if (icons.length >= 120) break;
        }
        if (icons.length >= 120) break;
      }
    }

    browseIcons.value = icons;
  } catch (err) {
    console.error('Browse icon set failed:', err);
    browseIcons.value = [];
  } finally {
    isBrowsing.value = false;
  }
}

function handleSearchInput(value: string) {
  searchQuery.value = value;

  if (searchDebounce) {
    clearTimeout(searchDebounce);
  }

  searchDebounce = setTimeout(() => {
    void searchIcons(value);
  }, 350);
}

function selectIconifyIcon(iconName: string) {
  selectedIcon.value = encodeIconifyIcon(iconName);
}

// ─── 上传 SVG Tab ───
const svgInput = ref<HTMLInputElement | null>(null);
const svgPreview = ref('');
const svgFileName = ref('');

function handleSvgSelect() {
  svgInput.value?.click();
}

function handleSvgChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  svgFileName.value = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const svgSource = e.target?.result as string;
    svgPreview.value = svgSource;
    selectedIcon.value = encodeSvgIcon(svgSource);
  };
  reader.readAsText(file);
}

function clearSvg() {
  svgPreview.value = '';
  svgFileName.value = '';
  if (svgInput.value) svgInput.value.value = '';
  selectedIcon.value = '';
}

// ─── 上传图片 Tab ───
const imageInput = ref<HTMLInputElement | null>(null);
const imagePreview = ref('');
const imageFileName = ref('');

function handleImageSelect() {
  imageInput.value?.click();
}

function handleImageChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  imageFileName.value = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    imagePreview.value = dataUrl;
    selectedIcon.value = encodeImageIcon(dataUrl);
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  imagePreview.value = '';
  imageFileName.value = '';
  if (imageInput.value) imageInput.value.value = '';
  selectedIcon.value = '';
}

// ─── 清除图标 ───
function clearIcon() {
  selectedIcon.value = '';
}

// ─── 确认 / 关闭 ───
function handleConfirm() {
  emit('update:modelValue', selectedIcon.value);
  emit('close');
}

function handleClose() {
  emit('close');
}

function handleDialogUpdate(value: boolean) {
  if (!value) handleClose();
}

// ─── 打开时初始化 ───
watch(() => props.visible, (visible) => {
  if (visible) {
    activeTab.value = 'library';
    selectedIcon.value = props.modelValue || '';
    searchQuery.value = '';
    searchResults.value = [];
    browseIcons.value = [];
    svgPreview.value = '';
    svgFileName.value = '';
    imagePreview.value = '';
    imageFileName.value = '';
  }
});
</script>

<template>
  <UiDialog class="icon-picker" :model-value="visible" width="640px" max-width="640px"
    @update:modelValue="handleDialogUpdate">
    <template #header>
      <div class="icon-picker__header">
        <h3>选择图标</h3>
        <div class="icon-picker__header-preview">
          <div v-if="selectedIcon" class="icon-picker__current-icon">
            <IconRenderer :icon="selectedIcon" :size="24" color="var(--ui-text-primary)" />
          </div>
        </div>
        <UiIconButton class="close-btn" variant="ghost" size="md" shape="square" title="关闭" @click="handleClose">
          ✕
        </UiIconButton>
      </div>
    </template>

    <div class="icon-picker__tabs">
      <UiTabs v-model="activeTab" :items="pickerTabs" variant="line" size="md" stretch />
    </div>

    <div class="icon-picker__content">
      <Transition :name="activeTabTransition" mode="out-in">
      <!-- ═══ 图标库 ═══ -->
      <div v-if="activeTab === 'library'" class="icon-picker__library">
        <div class="icon-picker__search">
          <UiInput
            :model-value="searchQuery"
            placeholder="搜索图标…（如 home, settings, video）"
            size="md"
            @update:modelValue="handleSearchInput"
          />
        </div>

        <!-- 图标集切换 -->
        <div v-if="!searchQuery.trim()" class="icon-picker__set-chips">
          <button
            v-for="iconSet in POPULAR_ICON_SETS"
            :key="iconSet.prefix"
            class="icon-picker__chip"
            :class="{ 'icon-picker__chip--active': activeSetPrefix === iconSet.prefix && browseIcons.length > 0 }"
            @click="browseIconSet(iconSet.prefix)"
          >
            {{ iconSet.name }}
          </button>
        </div>

        <!-- 加载指示 -->
        <div v-if="isSearching || isBrowsing" class="icon-picker__loading">
          <span class="icon-picker__spinner" />
          <span>加载中…</span>
        </div>

        <!-- 快捷推荐标签 -->
        <div v-if="showingQuickPicks" class="icon-picker__section-label">常用图标</div>

        <!-- 图标网格 -->
        <div class="icon-picker__grid">
          <button
            v-for="iconName in displayIcons"
            :key="iconName"
            class="icon-picker__icon-cell"
            :class="{
              'icon-picker__icon-cell--selected': selectedIcon === `iconify:${iconName}`,
            }"
            :title="iconName"
            @click="selectIconifyIcon(iconName)"
          >
            <Icon :icon="iconName" :width="22" :height="22" />
          </button>
        </div>

        <div v-if="!isSearching && searchQuery.trim() && searchResults.length === 0" class="icon-picker__empty">
          未找到相关图标，换个关键词试试
        </div>
      </div>

      <!-- ═══ 上传 SVG ═══ -->
      <div v-else-if="activeTab === 'svg'" class="icon-picker__upload-section">
        <input ref="svgInput" type="file" accept=".svg" style="display: none" @change="handleSvgChange" />
        <UiButton class="icon-picker__upload-btn" variant="secondary" size="md" @click="handleSvgSelect">
          <span class="upload-icon">📄</span>
          <span>{{ svgFileName || '选择 SVG 文件' }}</span>
        </UiButton>
        <UiButton v-if="svgPreview" variant="danger" size="sm" @click="clearSvg">清除</UiButton>

        <div v-if="svgPreview" class="icon-picker__upload-preview">
          <div class="icon-picker__preview-box" v-html="svgPreview" />
          <p class="icon-picker__preview-label">SVG 预览</p>
        </div>

        <p class="icon-picker__hint">支持 .svg 格式的矢量图标文件</p>
      </div>

      <!-- ═══ 上传图片 ═══ -->
      <div v-else class="icon-picker__upload-section">
        <input ref="imageInput" type="file" accept="image/*" style="display: none" @change="handleImageChange" />
        <UiButton class="icon-picker__upload-btn" variant="secondary" size="md" @click="handleImageSelect">
          <span class="upload-icon">🖼️</span>
          <span>{{ imageFileName || '选择图片文件' }}</span>
        </UiButton>
        <UiButton v-if="imagePreview" variant="danger" size="sm" @click="clearImage">清除</UiButton>

        <div v-if="imagePreview" class="icon-picker__upload-preview">
          <div class="icon-picker__preview-box">
            <img :src="imagePreview" alt="preview" class="icon-picker__preview-image" />
          </div>
          <p class="icon-picker__preview-label">图片预览</p>
        </div>

        <p class="icon-picker__hint">支持 JPG, PNG, GIF, WebP, SVG 等格式</p>
      </div>
      </Transition>
    </div>

    <template #footer>
      <div class="icon-picker__footer">
        <UiButton v-if="selectedIcon" variant="ghost" size="sm" @click="clearIcon">清除图标</UiButton>
        <div class="icon-picker__footer-actions">
          <UiButton variant="secondary" @click="handleClose">取消</UiButton>
          <UiButton variant="primary" @click="handleConfirm">确认</UiButton>
        </div>
      </div>
    </template>
  </UiDialog>
</template>

<style lang="scss" scoped>
@use '../../assets/scroll' as *;

.icon-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  gap: 12px;

  h3 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 18px;
    font-weight: 600;
    flex: 1;
  }
}

.icon-picker__header-preview {
  display: flex;
  align-items: center;
}

.icon-picker__current-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.icon-picker__tabs {
  padding: 0 24px;
}

.icon-picker__content {
  flex: 1;
  @include thin-scroll;
  padding: 16px 24px 20px;
  max-height: 420px;
}

/* ─── 图标库 ─── */
.icon-picker__library {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.icon-picker__search {
  position: sticky;
  top: 0;
  z-index: 2;
}

.icon-picker__set-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.icon-picker__chip {
  padding: 5px 12px;
  border-radius: var(--ui-radius-full);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    background: var(--ui-select-option-hover-bg);
    color: var(--ui-text-primary);
    border-color: var(--ui-select-hover-border);
  }

  &--active {
    background: var(--ui-button-primary-bg);
    color: var(--ui-button-primary-text);
    border-color: var(--ui-button-primary-border);
  }
}

.icon-picker__section-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-muted);
}

.icon-picker__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
  justify-content: center;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.icon-picker__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--ui-border-subtle);
  border-top-color: var(--ui-text-primary);
  border-radius: 50%;
  animation: icon-picker-spin 0.6s linear infinite;
}

@keyframes icon-picker-spin {
  to { transform: rotate(360deg); }
}

.icon-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
  gap: 4px;
}

.icon-picker__icon-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-sm);
  border: var(--ui-border-width-thin) solid transparent;
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--ui-select-option-hover-bg);
    color: var(--ui-text-primary);
    border-color: var(--ui-border-subtle);
  }

  &--selected {
    background: var(--ui-select-option-selected-bg);
    color: var(--ui-select-option-selected-text);
    border-color: var(--ui-select-focus-border);
    box-shadow: var(--ui-shadow-sm);
  }
}

.icon-picker__empty {
  text-align: center;
  padding: 30px 0;
  color: var(--ui-text-muted);
  font-size: 13px;
}

/* ─── 上传区域 ─── */
.icon-picker__upload-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
}

.icon-picker__upload-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-style: dashed;
  border-color: var(--modal-upload-border-color);
  background: var(--modal-upload-bg-color);

  .upload-icon {
    font-size: 17px;
  }
}

.icon-picker__upload-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.icon-picker__preview-box {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  overflow: hidden;

  :deep(svg) {
    width: 56px;
    height: 56px;
  }
}

.icon-picker__preview-image {
  max-width: 64px;
  max-height: 64px;
  object-fit: contain;
}

.icon-picker__preview-label {
  font-size: 12px;
  color: var(--ui-text-muted);
  margin: 0;
}

.icon-picker__hint {
  color: var(--modal-hint-color);
  font-size: 12px;
  margin: 4px 0 0;
  text-align: center;
}

/* ─── Footer ─── */
.icon-picker__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  gap: 12px;
}

.icon-picker__footer-actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
}
</style>
