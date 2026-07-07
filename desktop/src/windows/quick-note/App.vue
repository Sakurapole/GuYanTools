<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { CSSProperties } from 'vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiPersonalizationConfig from '@/windows/main/components/ui/UiPersonalizationConfig.vue';
import UiTagChip from '@/windows/main/components/ui/UiTagChip.vue';
import type { AppConfig } from '@/contracts/app_config';
import { createDefaultAppConfig, createDefaultKnowledgeQuickNoteWindowConfig } from '@/contracts/app_config';
import type { BackgroundConfirmPayload } from '@/contracts/background';
import { resolveThemeBackground, withThemeBackground } from '@/contracts/background';
import type {
  KnowledgeQuickNoteColor,
  KnowledgeQuickNoteDetail,
  QuickNotePrefillPayload,
} from '@/contracts/knowledge';
import { eventMatchesAccelerator } from '@/shared/shortcuts';

const title = ref('');
const body = ref('');
const tagDraft = ref('');
const tags = ref<string[]>([]);
const color = ref<KnowledgeQuickNoteColor>('yellow');
const isPinned = ref(true);
const savedNote = ref<KnowledgeQuickNoteDetail | null>(null);
const saving = ref(false);
const message = ref('');
const messageKind = ref<'info' | 'error'>('info');
const appConfig = ref<AppConfig>(createDefaultAppConfig());
const isCollapsed = ref(false);
const isPreviewing = ref(false);
const isPrimaryWindow = ref(false);
const contextMenu = ref({ visible: false, x: 0, y: 0 });
const backgroundPickerVisible = ref(false);
let removeConfigListener: (() => void) | undefined;
let removePrefillListener: (() => void) | undefined;
let removeCollapsedStateListener: (() => void) | undefined;
let composingTag = false;

const TAG_SEPARATOR_PATTERN = /[,，\s]+/;
const TAG_SEPARATOR_INPUT_PATTERN = /[,，\s]/;
const MAX_TAG_COUNT = 20;

const displayTitle = computed(() => title.value.trim() || titleFromBody(body.value));
const canSave = computed(() => body.value.trim().length > 0);
const activeQuickNoteBackground = computed(() => {
  const config = appConfig.value.features.knowledge.quickNote;
  return resolveThemeBackground({
    type: config.backgroundType,
    color: config.backgroundColor,
    image: config.backgroundImage,
    video: config.backgroundVideo,
    backgroundStyle: config.backgroundStyle,
  }, appConfig.value.appearance.theme);
});
const rootClass = computed(() => [
  'quick-note-app',
  `quick-note-app--${color.value}`,
  {
    'quick-note-app--collapsed': isCollapsed.value,
    'quick-note-app--previewing': isCollapsed.value && isPreviewing.value,
  },
]);
const backgroundStyle = computed<CSSProperties>(() => {
  const background = activeQuickNoteBackground.value;
  const style = background.backgroundStyle ?? {};
  const opacity = style.opacity ?? 1;
  const result: CSSProperties = {
    opacity,
    filter: style.blur ? `blur(${style.blur}px)` : undefined,
  };

  if (background.type === 'image' && background.image) {
    result.backgroundImage = `url(${background.image})`;
    result.backgroundSize = style.backgroundSize || 'cover';
    result.backgroundPosition = style.backgroundPosition || 'center';
    result.backgroundRepeat = style.backgroundRepeat || 'no-repeat';
  } else if (background.type === 'color' && background.color) {
    result.background = background.color;
  } else {
    result.background = 'linear-gradient(180deg, color-mix(in srgb, var(--note-color) 82%, var(--ui-surface-panel)) 0%, var(--ui-surface-panel) 100%)';
  }

  return result;
});
const hasBackgroundVideo = computed(() => activeQuickNoteBackground.value.type === 'video' && Boolean(activeQuickNoteBackground.value.video));
const backgroundVideoStyle = computed<CSSProperties>(() => {
  const style = activeQuickNoteBackground.value.backgroundStyle ?? {};
  return {
    opacity: style.opacity ?? 1,
    filter: style.blur ? `blur(${style.blur}px)` : undefined,
    objectFit: style.backgroundSize === 'contain' ? 'contain' : 'cover',
    objectPosition: style.backgroundPosition || 'center',
  };
});
const rootStyle = computed<CSSProperties>(() => {
  const textColor = activeQuickNoteBackground.value.backgroundStyle?.textColor?.trim();
  return textColor ? { '--quick-note-text': textColor } as CSSProperties : {};
});

onMounted(async () => {
  await applyInitialTheme();
  isPrimaryWindow.value = (await window.quickNoteWindowApi?.getWindowMeta())?.isPrimary ?? false;
  removeConfigListener = window.appConfigApi?.onDidChange(applyTheme);
  removePrefillListener = window.quickNoteWindowApi?.onPrefill(applyPrefill);
  removeCollapsedStateListener = window.quickNoteWindowApi?.onCollapsedState((collapsed, previewing) => {
    isCollapsed.value = collapsed;
    isPreviewing.value = previewing;
  });
  window.quickNoteWindowApi?.setAlwaysOnTop(isPinned.value);
  window.addEventListener('keydown', handleQuickNoteKeydown, true);
  window.addEventListener('pointerdown', handleWindowPointerDown, true);
});

onBeforeUnmount(() => {
  removeConfigListener?.();
  removePrefillListener?.();
  removeCollapsedStateListener?.();
  window.removeEventListener('keydown', handleQuickNoteKeydown, true);
  window.removeEventListener('pointerdown', handleWindowPointerDown, true);
});

function applyTheme(config: AppConfig) {
  appConfig.value = config;
  document.documentElement.classList.toggle('dark', config.appearance.theme === 'dark');
  document.documentElement.classList.toggle('light', config.appearance.theme !== 'dark');
  document.body.classList.toggle('dark', config.appearance.theme === 'dark');
  document.body.classList.toggle('light', config.appearance.theme !== 'dark');
}

async function applyInitialTheme() {
  try {
    appConfig.value = await window.appConfigApi?.getConfig() ?? createDefaultAppConfig();
    applyTheme(appConfig.value);
  } catch {
    applyTheme(createDefaultAppConfig());
  }
}

function applyPrefill(payload: QuickNotePrefillPayload) {
  if (payload.title) title.value = payload.title;
  if (payload.body) body.value = payload.body;
  if (payload.tags?.length) {
    tags.value = [];
    addTags(payload.tags);
    tagDraft.value = '';
  }
  if (payload.color) color.value = payload.color;
  savedNote.value = null;
  showMessage('已捕获剪贴板内容');
}

function showMessage(text: string, kind: 'info' | 'error' = 'info') {
  message.value = text;
  messageKind.value = kind;
}

function titleFromBody(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 60) || '未命名速记';
}

function todoId() {
  return `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sourceNoteText(note: KnowledgeQuickNoteDetail) {
  return [
    note.quickNote.body,
    '',
    `---`,
    `来源：知识库速记「${note.quickNote.title}」`,
    `来源 ID：${note.quickNote.id}`,
  ].join('\n');
}

async function saveNote() {
  if (!window.knowledgeApi || !canSave.value || saving.value) return null;

  saving.value = true;
  try {
    const payload = {
      title: displayTitle.value,
      body: body.value.trim(),
      tagsJson: JSON.stringify(tags.value),
      color: color.value,
      isPinned: isPinned.value,
    };
    savedNote.value = savedNote.value
      ? await window.knowledgeApi.updateQuickNote(savedNote.value.quickNote.id, payload)
      : await window.knowledgeApi.createQuickNote(payload);
    showMessage('已保存到快速收集箱');
    return savedNote.value;
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '保存失败', 'error');
    return null;
  } finally {
    saving.value = false;
  }
}

async function convertToPage() {
  const note = savedNote.value ?? await saveNote();
  if (!note || !window.knowledgeApi) return;

  saving.value = true;
  try {
    const page = await window.knowledgeApi.convertQuickNoteToPage(note.quickNote.id, {
      title: note.quickNote.title,
    });
    savedNote.value = await window.knowledgeApi.updateQuickNote(note.quickNote.id, {
      convertedPageId: page.node.id,
    });
    showMessage('已转换为 Markdown 页面');
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '转换页面失败', 'error');
  } finally {
    saving.value = false;
  }
}

async function convertToTodo() {
  const note = savedNote.value ?? await saveNote();
  if (!note || !window.todoApi || !window.knowledgeApi) return;

  saving.value = true;
  try {
    const todo = await window.todoApi.createTodo({
      id: todoId(),
      listId: 'default-tasks',
      title: note.quickNote.title,
      note: sourceNoteText(note),
    });
    savedNote.value = await window.knowledgeApi.linkQuickNoteTodo(note.quickNote.id, todo.id);
    showMessage('已转换为 Todo');
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '转换 Todo 失败', 'error');
  } finally {
    saving.value = false;
  }
}

async function archiveNote() {
  if (!savedNote.value || !window.knowledgeApi) return;
  saving.value = true;
  try {
    savedNote.value = await window.knowledgeApi.archiveQuickNote(savedNote.value.quickNote.id);
    showMessage('已归档');
    newNote();
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '归档失败', 'error');
  } finally {
    saving.value = false;
  }
}

function newNote() {
  savedNote.value = null;
  title.value = '';
  body.value = '';
  tagDraft.value = '';
  tags.value = [];
  color.value = 'yellow';
  showMessage('新速记');
}

function addTags(values: string[]) {
  const next = [...tags.value];
  for (const value of values) {
    const tag = value.trim().replace(/^#+/, '');
    if (!tag || next.includes(tag) || next.length >= MAX_TAG_COUNT) {
      continue;
    }
    next.push(tag);
  }
  tags.value = next;
}

function parseTagDraft(value: string, keepRemainder: boolean) {
  const hasSeparator = TAG_SEPARATOR_INPUT_PATTERN.test(value);
  if (!hasSeparator) {
    if (!keepRemainder) {
      addTags([value]);
      tagDraft.value = '';
      return;
    }
    tagDraft.value = value;
    return;
  }

  const hasTrailingSeparator = TAG_SEPARATOR_INPUT_PATTERN.test(value.at(-1) ?? '');
  const parts = value.split(TAG_SEPARATOR_PATTERN);
  const remainder = keepRemainder && !hasTrailingSeparator
    ? parts.pop()?.trim() ?? ''
    : '';
  addTags(parts);
  tagDraft.value = remainder;
}

function handleTagInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  if (composingTag) {
    tagDraft.value = value;
    return;
  }
  parseTagDraft(value, true);
}

function handleTagCompositionStart() {
  composingTag = true;
}

function handleTagCompositionEnd(event: CompositionEvent) {
  composingTag = false;
  parseTagDraft((event.target as HTMLInputElement).value, true);
}

function commitTagDraft() {
  parseTagDraft(tagDraft.value, false);
}

function removeTag(index: number) {
  tags.value = tags.value.filter((_, currentIndex) => currentIndex !== index);
}

function handleTagKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitTagDraft();
    return;
  }

  if (event.key === 'Backspace' && !tagDraft.value && tags.value.length) {
    event.preventDefault();
    tags.value = tags.value.slice(0, -1);
  }
}

function createSiblingWindow() {
  closeContextMenu();
  void window.quickNoteWindowApi?.create();
}

function handleQuickNoteKeydown(event: KeyboardEvent) {
  const shortcuts = appConfig.value.shortcuts.internal;
  let matched = true;

  if (eventMatchesAccelerator(event, shortcuts.quickNoteSave)) {
    void saveNote();
  } else if (eventMatchesAccelerator(event, shortcuts.quickNoteNew)) {
    newNote();
  } else if (eventMatchesAccelerator(event, shortcuts.quickNoteCollapse)) {
    toggleCollapsedWindow();
  } else if (eventMatchesAccelerator(event, shortcuts.quickNoteClose)) {
    closeWindow();
  } else {
    matched = false;
  }

  if (matched) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function handleWindowPointerDown(event: PointerEvent) {
  if (!contextMenu.value.visible) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target?.closest('.quick-note-context-menu')) {
    return;
  }
  closeContextMenu();
}

function openContextMenu(event: MouseEvent) {
  contextMenu.value = {
    visible: true,
    x: Math.min(event.clientX, window.innerWidth - 174),
    y: Math.min(event.clientY, window.innerHeight - 112),
  };
}

function closeContextMenu() {
  contextMenu.value.visible = false;
}

function openBackgroundPicker() {
  closeContextMenu();
  backgroundPickerVisible.value = true;
}

async function handleBackgroundConfirm(payload: BackgroundConfirmPayload) {
  const current = appConfig.value.features.knowledge.quickNote;
  const nextBackground = withThemeBackground({
    type: current.backgroundType,
    color: current.backgroundColor,
    image: current.backgroundImage,
    video: current.backgroundVideo,
    backgroundStyle: current.backgroundStyle,
  }, appConfig.value.appearance.theme, {
    type: payload.type,
    color: payload.color,
    image: payload.image,
    video: payload.video,
    backgroundStyle: payload.backgroundStyle,
  });

  await window.appConfigApi?.updateConfig({
    features: {
      knowledge: {
        quickNote: {
          backgroundType: nextBackground.type,
          backgroundColor: nextBackground.color,
          backgroundImage: nextBackground.image,
          backgroundVideo: nextBackground.video,
          backgroundStyle: nextBackground.backgroundStyle,
        },
      },
    },
  });
  backgroundPickerVisible.value = false;
}

async function resetBackground() {
  closeContextMenu();
  await window.appConfigApi?.updateConfig({
    features: {
      knowledge: {
        quickNote: createDefaultKnowledgeQuickNoteWindowConfig(),
      },
    },
  });
  backgroundPickerVisible.value = false;
}

async function togglePinned() {
  isPinned.value = !isPinned.value;
  await window.quickNoteWindowApi?.setAlwaysOnTop(isPinned.value);
}

function toggleCollapsedWindow() {
  if (isCollapsed.value) {
    void window.quickNoteWindowApi?.expand();
    return;
  }
  void window.quickNoteWindowApi?.collapse();
}

function previewCollapsedWindow(expanded: boolean) {
  if (!isCollapsed.value) {
    return;
  }
  void window.quickNoteWindowApi?.preview(expanded);
}

function closeWindow() {
  void window.quickNoteWindowApi?.close();
}
</script>

<template>
  <main
    :class="rootClass"
    :style="rootStyle"
    @contextmenu.prevent="openContextMenu"
    @mouseenter="previewCollapsedWindow(true)"
    @mouseleave="previewCollapsedWindow(false)"
  >
    <div class="quick-note-background" :style="backgroundStyle" />
    <video
      v-if="hasBackgroundVideo"
      class="quick-note-background quick-note-background--video"
      :src="activeQuickNoteBackground.video"
      :style="backgroundVideoStyle"
      autoplay
      loop
      muted
      playsinline
    />
    <header class="quick-note-titlebar">
      <div class="quick-note-titlebar__brand">
        <IconRenderer icon="iconify:lucide:sticky-note" :size="17" />
        <span>{{ displayTitle }}</span>
      </div>
      <div class="quick-note-titlebar__actions">
        <UiIconButton
          v-if="isPrimaryWindow"
          type="button"
          size="sm"
          title="新建速记窗口"
          @click="createSiblingWindow"
        >
          <IconRenderer icon="iconify:lucide:plus" :size="14" />
        </UiIconButton>
        <UiIconButton type="button" size="sm" :title="isPinned ? '取消置顶' : '置顶'" @click="togglePinned">
          <IconRenderer :icon="isPinned ? 'iconify:lucide:pin' : 'iconify:lucide:pin-off'" :size="14" />
        </UiIconButton>
        <UiIconButton
          type="button"
          size="sm"
          :title="isCollapsed ? '展开编辑' : '收起为标题条'"
          @click="toggleCollapsedWindow"
        >
          <IconRenderer :icon="isCollapsed ? 'iconify:lucide:maximize-2' : 'iconify:lucide:minimize-2'" :size="14" />
        </UiIconButton>
        <UiIconButton type="button" size="sm" title="关闭" @click="closeWindow">
          <IconRenderer icon="iconify:lucide:x" :size="15" />
        </UiIconButton>
      </div>
    </header>

    <section v-if="!isCollapsed" class="quick-note-editor">
      <input
        v-model="title"
        class="quick-note-editor__title"
        type="text"
        placeholder="标题"
        spellcheck="false"
      />
      <textarea
        v-model="body"
        class="quick-note-editor__body"
        placeholder="快速记录..."
        spellcheck="true"
        autofocus
      />
      <label class="quick-note-tag-input" aria-label="标签">
        <UiTagChip
          v-for="tag in tags"
          :key="tag"
          :label="tag"
          :color="'var(--note-color-strong)'"
          removable
          subtle
          @remove="removeTag(tags.indexOf(tag))"
        />
        <input
          :value="tagDraft"
          class="quick-note-tag-input__field"
          type="text"
          :placeholder="tags.length ? '' : '标签，用空格或逗号分隔'"
          spellcheck="false"
          @input="handleTagInput"
          @keydown="handleTagKeydown"
          @blur="commitTagDraft"
          @compositionstart="handleTagCompositionStart"
          @compositionend="handleTagCompositionEnd"
        />
      </label>
    </section>

    <section v-else-if="isPreviewing" class="quick-note-preview" aria-label="速记预览">
      <strong>{{ displayTitle }}</strong>
      <p>{{ body || '暂无内容' }}</p>
      <div v-if="tags.length" class="quick-note-preview__tags">
        <UiTagChip
          v-for="tag in tags"
          :key="tag"
          :label="tag"
          :color="'var(--note-color-strong)'"
          subtle
        />
      </div>
    </section>

    <section v-if="!isCollapsed" class="quick-note-controls" aria-label="便签设置">
      <span class="quick-note-status" :class="{ 'quick-note-status--error': messageKind === 'error' }">
        {{ message || (savedNote ? '已保存' : '未保存') }}
      </span>
    </section>

    <footer v-if="!isCollapsed" class="quick-note-actions">
      <UiIconButton type="button" size="md" variant="ghost" title="新建" @click="newNote">
        <IconRenderer icon="iconify:lucide:file-plus-2" :size="16" />
      </UiIconButton>
      <UiIconButton
        type="button"
        size="md"
        variant="secondary"
        title="归档"
        :disabled="!savedNote || saving"
        @click="archiveNote"
      >
        <IconRenderer icon="iconify:lucide:archive" :size="16" />
      </UiIconButton>
      <UiIconButton
        type="button"
        size="md"
        variant="secondary"
        title="转 Todo"
        :disabled="!canSave || saving"
        @click="convertToTodo"
      >
        <IconRenderer icon="iconify:lucide:list-todo" :size="16" />
      </UiIconButton>
      <UiIconButton
        type="button"
        size="md"
        variant="secondary"
        title="转页面"
        :disabled="!canSave || saving"
        @click="convertToPage"
      >
        <IconRenderer icon="iconify:lucide:file-text" :size="16" />
      </UiIconButton>
      <UiIconButton
        type="button"
        size="md"
        variant="primary"
        title="保存"
        :disabled="!canSave || saving"
        @click="saveNote"
      >
        <IconRenderer icon="iconify:lucide:save" :size="16" />
      </UiIconButton>
    </footer>

    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="quick-note-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @contextmenu.prevent
      >
        <button v-if="isPrimaryWindow" type="button" @click="createSiblingWindow">
          <IconRenderer icon="iconify:lucide:plus" :size="14" />
          <span>新建窗口</span>
        </button>
        <button type="button" @click="openBackgroundPicker">
          <IconRenderer icon="iconify:lucide:image" :size="14" />
          <span>窗口背景</span>
        </button>
        <button type="button" @click="resetBackground">
          <IconRenderer icon="iconify:lucide:rotate-ccw" :size="14" />
          <span>恢复默认背景</span>
        </button>
      </div>
    </Teleport>

    <UiPersonalizationConfig
      :visible="backgroundPickerVisible"
      title="速记窗口背景"
      :current-background="activeQuickNoteBackground.type === 'color' ? activeQuickNoteBackground.color : ''"
      :current-background-image="activeQuickNoteBackground.type === 'image' ? activeQuickNoteBackground.image : ''"
      :current-background-video="activeQuickNoteBackground.type === 'video' ? activeQuickNoteBackground.video : ''"
      :current-background-style="activeQuickNoteBackground.backgroundStyle"
      :enabled-features="['color', 'image', 'video', 'opacity', 'textColor']"
      :show-reset="true"
      :show-preview="false"
      :fill-viewport="true"
      reset-text="恢复便签主题色"
      @close="backgroundPickerVisible = false"
      @confirm="handleBackgroundConfirm"
      @reset="resetBackground"
    />
  </main>
</template>

<style scoped lang="scss">
:global(html),
:global(body),
:global(#quick-note-app) {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}

.quick-note-app {
  --note-color: #fff3a3;
  --note-color-strong: #f4d35e;
  --quick-note-text: var(--ui-text-primary);
  --quick-note-window-gap: 14px;
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  width: 100vw;
  height: 100vh;
  padding: var(--quick-note-window-gap);
  overflow: hidden;
  border: 0;
  border-radius: 0;
  color: var(--quick-note-text);
  background: transparent;
  box-shadow: none;
  isolation: isolate;
  box-sizing: border-box;
}

.quick-note-app--collapsed {
  grid-template-rows: auto minmax(0, 1fr);
}

.quick-note-background {
  position: absolute;
  inset: var(--quick-note-window-gap);
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: 10px;
  background: transparent;
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.08),
    0 8px 18px rgba(15, 23, 42, 0.10);
}

.quick-note-background--video {
  width: auto;
  height: auto;
  object-fit: cover;
}

.quick-note-titlebar,
.quick-note-editor,
.quick-note-preview,
.quick-note-controls,
.quick-note-actions {
  position: relative;
  z-index: 1;
}

.quick-note-app--blue {
  --note-color: #c8e7ff;
  --note-color-strong: #63a7dc;
}

.quick-note-app--green {
  --note-color: #d7f7d0;
  --note-color-strong: #75bd68;
}

.quick-note-app--pink {
  --note-color: #ffd7e7;
  --note-color-strong: #dc7aa2;
}

.quick-note-app--purple {
  --note-color: #e9dcff;
  --note-color-strong: #9b7bd9;
}

.quick-note-app--gray {
  --note-color: #e9edf3;
  --note-color-strong: #94a3b8;
}

.quick-note-titlebar {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--note-color-strong) 35%, transparent);
}

.quick-note-app--collapsed .quick-note-titlebar {
  -webkit-app-region: no-drag;
}

.quick-note-titlebar__brand,
.quick-note-titlebar__actions {
  display: flex;
  align-items: center;
}

.quick-note-titlebar__brand {
  min-width: 0;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.quick-note-titlebar__actions {
  -webkit-app-region: no-drag;
  gap: 4px;
}

.quick-note-editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
  padding: 14px 14px 10px;
}

.quick-note-editor__title,
.quick-note-editor__body {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--quick-note-text);
  background: transparent;
  font: inherit;
}

.quick-note-preview {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 8px;
  padding: 12px 14px 14px;
  overflow: hidden;
  border-top: 1px solid color-mix(in srgb, var(--note-color-strong) 26%, transparent);
}

.quick-note-preview strong {
  overflow: hidden;
  color: var(--quick-note-text);
  font-size: 15px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-note-preview p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--quick-note-text) 82%, transparent);
  font-size: 13px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  white-space: pre-wrap;
}

.quick-note-preview__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  overflow: hidden;
}

.quick-note-editor__title {
  height: 34px;
  font-size: 18px;
  font-weight: 750;
}

.quick-note-editor__body {
  min-height: 0;
  resize: none;
  padding: 8px 0;
  line-height: 1.62;
}

.quick-note-tag-input {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-height: 36px;
  gap: 6px;
  padding: 6px 0 2px;
  border-top: 1px solid color-mix(in srgb, var(--note-color-strong) 22%, transparent);
  color: var(--ui-text-muted);
  font-size: 12px;
  cursor: text;
}

.quick-note-tag-input__field {
  flex: 1 1 128px;
  min-width: 90px;
  height: 24px;
  border: 0;
  outline: 0;
  color: var(--quick-note-text);
  background: transparent;
  font: inherit;
}

.quick-note-tag-input__field::placeholder {
  color: var(--ui-text-muted);
}

.quick-note-controls,
.quick-note-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 10px;
}

.quick-note-controls {
  justify-content: flex-start;
  min-height: 22px;
  padding-bottom: 8px;
}

.quick-note-status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
  font-size: 12px;
}

.quick-note-status--error {
  color: var(--ui-button-danger-text);
}

.quick-note-actions {
  justify-content: flex-end;
  padding-bottom: 12px;
  border-top: 1px solid color-mix(in srgb, var(--note-color-strong) 20%, transparent);
  padding-top: 10px;
}

.quick-note-context-menu {
  position: fixed;
  z-index: 30;
  display: flex;
  flex-direction: column;
  min-width: 164px;
  padding: 5px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--ui-surface-panel);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22);
}

.quick-note-context-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  color: var(--ui-text-primary);
  background: transparent;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.quick-note-context-menu button:hover {
  background: var(--ui-hover-bg);
}

@media (prefers-reduced-motion: reduce) {
  .quick-note-context-menu {
    transition: none;
  }
}
</style>
