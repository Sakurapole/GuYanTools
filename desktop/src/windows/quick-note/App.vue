<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import type { AppConfig } from '@/contracts/app_config';
import { createDefaultAppConfig } from '@/contracts/app_config';
import type {
  KnowledgeQuickNoteColor,
  KnowledgeQuickNoteDetail,
  QuickNotePrefillPayload,
} from '@/contracts/knowledge';

const colorOptions: Array<{ id: KnowledgeQuickNoteColor; label: string }> = [
  { id: 'yellow', label: '黄' },
  { id: 'blue', label: '蓝' },
  { id: 'green', label: '绿' },
  { id: 'pink', label: '粉' },
  { id: 'purple', label: '紫' },
  { id: 'gray', label: '灰' },
];

const title = ref('');
const body = ref('');
const tagInput = ref('');
const color = ref<KnowledgeQuickNoteColor>('yellow');
const isPinned = ref(true);
const savedNote = ref<KnowledgeQuickNoteDetail | null>(null);
const saving = ref(false);
const message = ref('');
const messageKind = ref<'info' | 'error'>('info');
let removeConfigListener: (() => void) | undefined;
let removePrefillListener: (() => void) | undefined;

const tags = computed(() =>
  tagInput.value
    .split(/[,，#\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20),
);

const displayTitle = computed(() => title.value.trim() || titleFromBody(body.value));
const canSave = computed(() => body.value.trim().length > 0);
const rootClass = computed(() => `quick-note-app quick-note-app--${color.value}`);

onMounted(async () => {
  await applyInitialTheme();
  removeConfigListener = window.appConfigApi?.onDidChange(applyTheme);
  removePrefillListener = window.quickNoteWindowApi?.onPrefill(applyPrefill);
  window.quickNoteWindowApi?.setAlwaysOnTop(isPinned.value);
});

onBeforeUnmount(() => {
  removeConfigListener?.();
  removePrefillListener?.();
});

function applyTheme(config: AppConfig) {
  document.documentElement.classList.toggle('dark', config.appearance.theme === 'dark');
  document.documentElement.classList.toggle('light', config.appearance.theme !== 'dark');
  document.body.classList.toggle('dark', config.appearance.theme === 'dark');
  document.body.classList.toggle('light', config.appearance.theme !== 'dark');
}

async function applyInitialTheme() {
  try {
    applyTheme(await window.appConfigApi?.getConfig() ?? createDefaultAppConfig());
  } catch {
    applyTheme(createDefaultAppConfig());
  }
}

function applyPrefill(payload: QuickNotePrefillPayload) {
  if (payload.title) title.value = payload.title;
  if (payload.body) body.value = payload.body;
  if (payload.tags?.length) tagInput.value = payload.tags.join(', ');
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
  tagInput.value = '';
  color.value = 'yellow';
  showMessage('新速记');
}

async function togglePinned() {
  isPinned.value = !isPinned.value;
  await window.quickNoteWindowApi?.setAlwaysOnTop(isPinned.value);
}

function dockWindow() {
  void window.quickNoteWindowApi?.dock();
}

function closeWindow() {
  void window.quickNoteWindowApi?.close();
}
</script>

<template>
  <main :class="rootClass">
    <header class="quick-note-titlebar">
      <div class="quick-note-titlebar__brand">
        <IconRenderer icon="iconify:lucide:sticky-note" :size="17" />
        <span>速记</span>
      </div>
      <div class="quick-note-titlebar__actions">
        <UiIconButton type="button" size="sm" :title="isPinned ? '取消置顶' : '置顶'" @click="togglePinned">
          <IconRenderer :icon="isPinned ? 'iconify:lucide:pin' : 'iconify:lucide:pin-off'" :size="14" />
        </UiIconButton>
        <UiIconButton type="button" size="sm" title="收起" @click="dockWindow">
          <IconRenderer icon="iconify:lucide:minimize-2" :size="14" />
        </UiIconButton>
        <UiIconButton type="button" size="sm" title="关闭" @click="closeWindow">
          <IconRenderer icon="iconify:lucide:x" :size="15" />
        </UiIconButton>
      </div>
    </header>

    <section class="quick-note-editor">
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
      <input
        v-model="tagInput"
        class="quick-note-editor__tags"
        type="text"
        placeholder="标签，用空格或逗号分隔"
      />
    </section>

    <section class="quick-note-controls" aria-label="便签设置">
      <div class="quick-note-colors">
        <button
          v-for="item in colorOptions"
          :key="item.id"
          type="button"
          class="quick-note-color"
          :class="[`quick-note-color--${item.id}`, { 'quick-note-color--active': color === item.id }]"
          :aria-label="item.label"
          @click="color = item.id"
        />
      </div>
      <span class="quick-note-status" :class="{ 'quick-note-status--error': messageKind === 'error' }">
        {{ message || (savedNote ? '已保存' : '未保存') }}
      </span>
    </section>

    <footer class="quick-note-actions">
      <UiButton type="button" size="sm" variant="ghost" @click="newNote">新建</UiButton>
      <UiButton type="button" size="sm" variant="secondary" :disabled="!savedNote || saving" @click="archiveNote">归档</UiButton>
      <UiButton type="button" size="sm" variant="secondary" :disabled="!canSave || saving" @click="convertToTodo">
        转 Todo
      </UiButton>
      <UiButton type="button" size="sm" variant="secondary" :disabled="!canSave || saving" @click="convertToPage">
        转页面
      </UiButton>
      <UiButton type="button" size="sm" variant="primary" :disabled="!canSave || saving" @click="saveNote">
        保存
      </UiButton>
    </footer>
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
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--note-color-strong) 56%, var(--ui-border-subtle));
  border-radius: 8px;
  color: var(--ui-text-primary);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--note-color) 82%, var(--ui-surface-panel)) 0%, var(--ui-surface-panel) 100%);
  box-shadow: var(--ui-shadow-xl, 0 28px 70px rgba(15, 23, 42, 0.22));
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
.quick-note-editor__body,
.quick-note-editor__tags {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--ui-text-primary);
  background: transparent;
  font: inherit;
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

.quick-note-editor__tags {
  height: 32px;
  border-top: 1px solid color-mix(in srgb, var(--note-color-strong) 22%, transparent);
  color: var(--ui-text-muted);
  font-size: 12px;
}

.quick-note-controls,
.quick-note-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 10px;
}

.quick-note-controls {
  justify-content: space-between;
}

.quick-note-colors {
  display: flex;
  gap: 6px;
}

.quick-note-color {
  width: 18px;
  height: 18px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-radius: 50%;
  background: var(--swatch);
  cursor: pointer;
}

.quick-note-color--active {
  outline: 2px solid color-mix(in srgb, var(--primary-color) 72%, transparent);
  outline-offset: 2px;
}

.quick-note-color--yellow { --swatch: #f4d35e; }
.quick-note-color--blue { --swatch: #63a7dc; }
.quick-note-color--green { --swatch: #75bd68; }
.quick-note-color--pink { --swatch: #dc7aa2; }
.quick-note-color--purple { --swatch: #9b7bd9; }
.quick-note-color--gray { --swatch: #94a3b8; }

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
</style>
