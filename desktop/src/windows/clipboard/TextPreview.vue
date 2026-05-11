<script lang="ts" setup>
import type { AppConfig } from '@/contracts/app_config';
import type { MultiDeviceClipboardItem } from '@/contracts/multi_device_clipboard';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface TextSegment {
  id: string;
  text: string;
  matched: boolean;
  matchIndex: number;
}

const item = ref<MultiDeviceClipboardItem | null>(null);
const searchVisible = ref(false);
const searchQuery = ref('');
const activeMatchIndex = ref(0);

let removeDataListener: (() => void) | undefined;
let removeConfigListener: (() => void) | undefined;

const title = computed(() => {
  const firstLine = item.value?.text?.split(/\r?\n/).find((line) => line.trim())?.trim();
  return firstLine?.slice(0, 80) || '文本内容';
});

const sourceMeta = computed(() => {
  if (!item.value) return '';
  return `${item.value.sourceDeviceName} · ${formatSize(item.value.byteSize)}`;
});

const textContent = computed(() => item.value?.text || '');

const textSegments = computed<TextSegment[]>(() => {
  const text = textContent.value;
  const query = searchQuery.value;
  if (!query) {
    return [{ id: 'text-0', text, matched: false, matchIndex: -1 }];
  }

  const segments: TextSegment[] = [];
  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  let cursor = 0;
  let matchIndex = 0;

  while (cursor < text.length) {
    const foundAt = lowerText.indexOf(lowerQuery, cursor);
    if (foundAt === -1) {
      segments.push({
        id: `text-${cursor}`,
        text: text.slice(cursor),
        matched: false,
        matchIndex: -1,
      });
      break;
    }

    if (foundAt > cursor) {
      segments.push({
        id: `text-${cursor}`,
        text: text.slice(cursor, foundAt),
        matched: false,
        matchIndex: -1,
      });
    }

    const end = foundAt + query.length;
    segments.push({
      id: `match-${matchIndex}-${foundAt}`,
      text: text.slice(foundAt, end),
      matched: true,
      matchIndex,
    });
    matchIndex += 1;
    cursor = end;
  }

  if (!segments.length) {
    segments.push({ id: 'text-empty', text: '', matched: false, matchIndex: -1 });
  }

  return segments;
});

const matchCount = computed(() => textSegments.value.filter(segment => segment.matched).length);

const matchCounterLabel = computed(() => {
  if (!searchQuery.value) return '输入关键词';
  if (!matchCount.value) return '无结果';
  return `${activeMatchIndex.value + 1} / ${matchCount.value}`;
});

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function applyTheme(config: AppConfig) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(config.appearance.theme);
}

function closeWindow() {
  window.ipcRenderer?.send('window:close');
}

async function openSearch() {
  searchVisible.value = true;
  await nextTick();
  const input = document.querySelector<HTMLInputElement>('.text-preview__search-input');
  input?.focus();
  input?.select();
}

function closeSearch() {
  searchVisible.value = false;
  searchQuery.value = '';
  activeMatchIndex.value = 0;
}

function goToMatch(direction: 1 | -1) {
  if (!matchCount.value) return;
  activeMatchIndex.value = (activeMatchIndex.value + direction + matchCount.value) % matchCount.value;
}

function scrollActiveMatchIntoView() {
  if (!searchVisible.value || !matchCount.value) return;
  void nextTick(() => {
    document.querySelector<HTMLElement>('[data-active-match="true"]')?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth',
    });
  });
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    goToMatch(event.shiftKey ? -1 : 1);
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeSearch();
  }
}

function handleWindowKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'f') {
    event.preventDefault();
    void openSearch();
    return;
  }

  if (event.key === 'Escape' && searchVisible.value) {
    event.preventDefault();
    closeSearch();
  }
}

onMounted(() => {
  removeDataListener = window.ipcRenderer?.on('multi-device-clipboard:text-preview-data', (payload: MultiDeviceClipboardItem) => {
    item.value = payload;
    document.title = title.value;
  });
  removeConfigListener = window.appConfigApi?.onDidChange(applyTheme);
  void window.appConfigApi?.getConfig().then(applyTheme);
  window.ipcRenderer?.send('multi-device-clipboard:text-preview-ready');
  window.addEventListener('keydown', handleWindowKeydown);
});

onBeforeUnmount(() => {
  removeDataListener?.();
  removeConfigListener?.();
  window.removeEventListener('keydown', handleWindowKeydown);
});

watch(matchCount, (count) => {
  if (!count) {
    activeMatchIndex.value = 0;
    return;
  }

  if (activeMatchIndex.value >= count) {
    activeMatchIndex.value = 0;
  }
});

watch([activeMatchIndex, matchCount], scrollActiveMatchIntoView);

watch(searchQuery, () => {
  activeMatchIndex.value = 0;
});
</script>

<template>
  <main class="text-preview">
    <header class="text-preview__titlebar">
      <div class="text-preview__title-lockup">
        <span class="text-preview__icon" aria-hidden="true">
          <svg class="text-preview__svg-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
          </svg>
        </span>
        <div class="text-preview__title-copy">
          <h1>{{ title }}</h1>
          <p>{{ sourceMeta }}</p>
        </div>
      </div>
      <div class="text-preview__title-actions">
        <UiIconButton class="text-preview__title-button" variant="ghost" size="sm" shape="square" title="搜索文本 Ctrl+F"
          :active="searchVisible" @click="openSearch">
          <svg class="text-preview__svg-icon text-preview__svg-icon--button" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </UiIconButton>
        <UiIconButton class="text-preview__title-button" variant="danger" size="sm" shape="square" title="关闭" @click="closeWindow">
          <svg class="text-preview__svg-icon text-preview__svg-icon--close" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </UiIconButton>
      </div>
    </header>

    <section v-if="searchVisible" class="text-preview__searchbar">
      <div class="text-preview__search-field">
        <svg class="text-preview__svg-icon text-preview__svg-icon--search" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <UiInput class="text-preview__search-input" v-model="searchQuery" size="sm" placeholder="搜索文本"
          @keydown="handleSearchKeydown" />
      </div>
      <span class="text-preview__search-count">{{ matchCounterLabel }}</span>
      <UiIconButton class="text-preview__search-action" variant="ghost" size="sm" shape="square" title="上一个 Shift+Enter"
        :disabled="!matchCount" @click="goToMatch(-1)">
        <svg class="text-preview__svg-icon text-preview__svg-icon--button" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m18 15-6-6-6 6" />
        </svg>
      </UiIconButton>
      <UiIconButton class="text-preview__search-action" variant="ghost" size="sm" shape="square" title="下一个 Enter"
        :disabled="!matchCount" @click="goToMatch(1)">
        <svg class="text-preview__svg-icon text-preview__svg-icon--button" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </UiIconButton>
      <UiIconButton class="text-preview__search-action" variant="ghost" size="sm" shape="square" title="关闭搜索 Esc"
        @click="closeSearch">
        <svg class="text-preview__svg-icon text-preview__svg-icon--button" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </UiIconButton>
    </section>

    <UiScrollbar class="text-preview__scroll" :x="false" :y="true" :size="6"
      thumb-color="var(--preview-scrollbar-thumb)"
      thumb-hover-color="var(--preview-scrollbar-thumb-hover)"
      track-color="var(--preview-scrollbar-track)">
      <pre class="text-preview__content"><template v-for="segment in textSegments" :key="segment.id"><mark
        v-if="segment.matched"
        class="text-preview__match"
        :class="{ 'text-preview__match--active': segment.matchIndex === activeMatchIndex }"
        :data-active-match="segment.matchIndex === activeMatchIndex ? 'true' : undefined"
      >{{ segment.text }}</mark><span v-else>{{ segment.text }}</span></template></pre>
    </UiScrollbar>
  </main>
</template>

<style lang="scss">
@use '@/windows/main/assets/foundation.scss';
@use '@/windows/main/assets/theme.scss';

html,
body,
#multi-device-clipboard-text-preview-app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
  font-family: "Geist Variable", "Microsoft YaHei", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}
</style>

<style scoped>
:global(:root) {
  --preview-text: var(--ui-text-primary, rgba(30, 70, 90, 0.92));
  --preview-muted: var(--ui-text-muted, rgba(30, 70, 90, 0.58));
  --preview-surface: var(--ui-surface-panel, rgba(255, 255, 255, 0.98));
  --preview-surface-muted: var(--ui-surface-panel-muted, rgba(247, 251, 255, 0.96));
  --preview-accent: var(--primary-color, #66ccff);
  --preview-accent-soft: var(--ui-tabs-active-bg, rgba(102, 204, 255, 0.16));
  --preview-border: var(--ui-border-subtle, rgba(15, 23, 42, 0.1));
  --preview-shadow: none;
  --preview-search-bg: var(--ui-surface-glass-strong, var(--preview-surface-muted));
  --preview-match-bg: rgba(255, 214, 102, 0.38);
  --preview-match-active-bg: rgba(102, 204, 255, 0.46);
  --preview-match-active-ring: rgba(102, 204, 255, 0.52);
  --preview-scrollbar-thumb: var(--scrollbar-thumb, rgba(30, 70, 90, 0.28));
  --preview-scrollbar-thumb-hover: var(--scrollbar-thumb-hover, rgba(30, 70, 90, 0.44));
  --preview-scrollbar-track: var(--scrollbar-track, rgba(30, 70, 90, 0.08));
}

.text-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--preview-text);
  background: var(--preview-surface);
  box-shadow: none;
}

.text-preview__titlebar {
  flex: 0 0 auto;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 8px 7px 12px;
  border-bottom: 1px solid var(--preview-border);
  background: var(--preview-surface-muted);
  -webkit-app-region: drag;
  user-select: none;
}

.text-preview__title-lockup {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.text-preview__icon {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  display: grid;
  place-items: center;
  border-radius: var(--ui-radius-sm, 10px);
  color: var(--preview-accent);
  background: var(--preview-accent-soft);
  border: 1px solid var(--preview-border);
}

.text-preview__svg-icon {
  width: 17px;
  height: 17px;
  display: block;
  fill: none !important;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.text-preview__svg-icon--close {
  width: 15px;
  height: 15px;
}

.text-preview__svg-icon--button,
.text-preview__svg-icon--search {
  width: 15px;
  height: 15px;
}

.text-preview__title-copy {
  min-width: 0;
}

.text-preview__title-copy h1 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1.35;
}

.text-preview__title-copy p {
  margin: 3px 0 0;
  color: var(--preview-muted);
  font-size: 12px;
}

.text-preview__title-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.text-preview__title-button {
  -webkit-app-region: no-drag;
}

.text-preview__searchbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--preview-border);
  background: var(--preview-search-bg);
}

.text-preview__search-field {
  position: relative;
  flex: 1;
  min-width: 0;
  color: var(--preview-muted);
}

.text-preview__search-field .text-preview__svg-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  z-index: 1;
  transform: translateY(-50%);
  pointer-events: none;
}

.text-preview__search-input {
  padding-left: 32px;
}

.text-preview__search-count {
  flex: 0 0 auto;
  min-width: 64px;
  color: var(--preview-muted);
  font-size: 12px;
  text-align: center;
  white-space: nowrap;
}

.text-preview__search-action {
  flex: 0 0 auto;
}

.text-preview__scroll {
  flex: 1;
  min-height: 0;
}

.text-preview__content {
  margin: 0;
  padding: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 13px/1.62 "Geist Mono", "Cascadia Mono", Consolas, "Microsoft YaHei", monospace;
}

.text-preview__match {
  padding: 1px 0;
  border-radius: 3px;
  color: inherit;
  background: var(--preview-match-bg);
}

.text-preview__match--active {
  background: var(--preview-match-active-bg);
  box-shadow: 0 0 0 1px var(--preview-match-active-ring);
}
</style>
