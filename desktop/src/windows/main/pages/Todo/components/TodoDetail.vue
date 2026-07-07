<script setup lang="ts">
import { ref, watch, nextTick, inject, computed, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import { useKnowledgeStore } from '@/windows/main/stores/knowledge_store';
import { useContextMenu } from '@/windows/main/composables/useContextMenu';
import { resolveTodoAreaBackground, useTodoSettings } from '@/windows/main/composables/useTodoSettings';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import type { TodoStep } from '@/contracts/todo';
import TodoBackground from './TodoBackground.vue';
import ReminderPicker from './ReminderPicker.vue';
import RepeatPicker from './RepeatPicker.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import ImagePreviewDialog from '@/windows/main/components/ui/ImagePreviewDialog.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiDateTimePicker from '@/windows/main/components/ui/UiDateTimePicker.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import { marked } from 'marked';
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import { buildBackgroundTextVars } from '@/windows/main/utils/backgroundTextColor';
import { notifyError, notifySuccess } from '@/windows/main/composables/useInAppNotification';

const todoStore = useTodoStore();
const knowledgeStore = useKnowledgeStore();
const router = useRouter();
const { detailBg } = useTodoSettings();
const appConfigStore = useAppConfigStore();
const activeDetailBg = computed(() => resolveTodoAreaBackground(detailBg.value, appConfigStore.config.appearance.theme));
const detailTextStyle = computed(() => buildBackgroundTextVars(activeDetailBg.value.backgroundStyle?.textColor, {
  aliases: {
    primary: ['--ui-text-primary'],
    secondary: ['--ui-text-secondary'],
    muted: ['--ui-text-muted'],
    subtle: ['--ui-text-subtle'],
  },
}));
const openBgPicker = inject<Function>('openTodoBgPicker');
const { open: openMenu } = useContextMenu();

const editingTitle = ref('');
const noteText = ref('');
const newStepText = ref('');
const newStepImages = ref<string[]>([]);
const stepDrafts = ref<Record<string, string>>({});
const stepStrikeLines = ref<Record<string, Array<{ top: number; width: number; delay: number }>>>({});
const stepStrikeRuns = ref<Record<string, number>>({});
const stepStrikeExiting = ref<Record<string, boolean>>({});
const draggedStepId = ref<string | null>(null);
const imagePreviewVisible = ref(false);
const imagePreviewIndex = ref(0);
const detailRef = ref<HTMLElement | null>(null);
const titleRef = ref<InstanceType<typeof UiInput> | null>(null);
const noteEditing = ref(false);
const noteRef = ref<InstanceType<typeof UiTextarea> | null>(null);
let detailResizeObserver: ResizeObserver | null = null;
let textareaResizeFrame = 0;
let stepDragStartOrder: string[] = [];
let stepDragLatestOrder: string[] = [];
let stepDragStartedAt = { x: 0, y: 0 };
let stepDragMoved = false;
const STEP_STRIKE_LINE_DELAY_MS = 140;
const STEP_STRIKE_ANIMATION_BUFFER_MS = 460;

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderedNote = computed(() => {
  if (!noteText.value) return '';
  return marked.parse(noteText.value) as string;
});

const knowledgeSource = computed(() => {
  const note = todoStore.selectedTodo?.note || '';
  const pageId = note.match(/页面 ID：([^\n]+)/)?.[1]?.trim();
  const quickNoteId = note.match(/来源 ID：([^\n]+)/)?.[1]?.trim();
  const blockId = note.match(/块 ID：([^\n]+)/)?.[1]?.trim();
  const title = note.match(/来源：知识库(?:块页面|速记)「([^」]+)」/)?.[1]?.trim();
  if (pageId) {
    return { kind: 'page', id: pageId, blockId, title: title || '知识库页面' };
  }
  if (quickNoteId) {
    return { kind: 'quick_note', id: quickNoteId, blockId: '', title: title || '知识库速记' };
  }
  return null;
});

const stepPreviewImages = computed(() =>
  (todoStore.selectedTodo?.steps ?? [])
    .flatMap(step => parseStepImageUrls(step.imageUrl).map((src, index) => ({
      src,
      title: parseStepImageUrls(step.imageUrl).length > 1 ? `${step.title} (${index + 1})` : step.title,
      alt: `${step.title} 的步骤图片`,
    }))),
);

watch(() => todoStore.selectedTodo, (todo) => {
  if (todo) {
    editingTitle.value = todo.title;
    noteText.value = todo.note;
    syncStepDrafts(todo.steps);
  }
}, { immediate: true });

watch(() => todoStore.selectedTodo?.steps, (steps) => {
  syncStepDrafts(steps ?? []);
}, { deep: true });

watch(detailRef, (el) => {
  detailResizeObserver?.disconnect();
  if (el && typeof ResizeObserver !== 'undefined') {
    detailResizeObserver = new ResizeObserver(() => {
      scheduleTextareaResize();
    });
    detailResizeObserver.observe(el);
  }
}, { flush: 'post' });

onBeforeUnmount(() => {
  detailResizeObserver?.disconnect();
  if (textareaResizeFrame) {
    cancelAnimationFrame(textareaResizeFrame);
  }
  teardownStepDrag();
});

function syncStepDrafts(steps: TodoStep[]) {
  const next: Record<string, string> = {};
  for (const step of steps) {
    next[step.id] = stepDrafts.value[step.id] ?? step.title;
  }
  stepDrafts.value = next;
  resizeAllStepTextareas();
  updateCompletedStepStrikeLines(steps);
}

function close() {
  todoStore.selectTodo(null);
}

function handleContextMenu(e: MouseEvent) {
  openMenu(e.clientX, e.clientY, [
    {
      id: 'detail-bg',
      label: '详情面板个性化配置',
      action: () => openBgPicker && openBgPicker('detail'),
    }
  ]);
}

async function saveTitle() {
  const todo = todoStore.selectedTodo;
  if (!todo || editingTitle.value === todo.title) return;
  await todoStore.updateTodo(todo.id, { title: editingTitle.value });
}

async function saveNote() {
  const todo = todoStore.selectedTodo;
  if (!todo || noteText.value === todo.note) return;
  await todoStore.updateTodo(todo.id, { note: noteText.value });
}

async function openKnowledgeSource() {
  const source = knowledgeSource.value;
  if (!source) return;
  await router.push('/knowledge');
  await knowledgeStore.initialize();
  await knowledgeStore.selectNode(source.id);
}

function enterNoteEdit() {
  noteEditing.value = true;
  nextTick(() => {
    noteRef.value?.focus();
  });
}

function leaveNoteEdit() {
  noteEditing.value = false;
  saveNote();
}

async function toggleMyDay() {
  const todo = todoStore.selectedTodo;
  if (todo) await todoStore.toggleMyDay(todo.id);
}

async function addStep() {
  const title = newStepText.value.trim();
  if (!title || !todoStore.selectedTodo) return;
  await todoStore.addStep(todoStore.selectedTodo.id, title, serializeStepImageUrls(newStepImages.value) || undefined);
  newStepText.value = '';
  newStepImages.value = [];
  resizeAllStepTextareas();
}

async function toggleStep(stepId: string, isCompleted: boolean) {
  if (!isCompleted) {
    await todoStore.updateStep(stepId, { isCompleted: true });
    await nextTick();
    updateStepStrikeLines(stepId);
    stepStrikeRuns.value = {
      ...stepStrikeRuns.value,
      [stepId]: (stepStrikeRuns.value[stepId] ?? 0) + 1,
    };
  } else {
    const lines = stepStrikeLines.value[stepId]?.length
      ? stepStrikeLines.value[stepId]
      : measureStepStrikeLines(stepId, stepDrafts.value[stepId] ?? '');
    stepStrikeLines.value = {
      ...stepStrikeLines.value,
      [stepId]: lines,
    };
    stepStrikeExiting.value = {
      ...stepStrikeExiting.value,
      [stepId]: true,
    };
    stepStrikeRuns.value = {
      ...stepStrikeRuns.value,
      [stepId]: (stepStrikeRuns.value[stepId] ?? 0) + 1,
    };
    await todoStore.updateStep(stepId, { isCompleted: false });
    window.setTimeout(() => {
      const nextLines = { ...stepStrikeLines.value };
      delete nextLines[stepId];
      stepStrikeLines.value = nextLines;
      const nextExiting = { ...stepStrikeExiting.value };
      delete nextExiting[stepId];
      stepStrikeExiting.value = nextExiting;
    }, getStepStrikeAnimationDuration(lines));
  }
}

async function saveStepTitle(step: TodoStep) {
  const draft = stepDrafts.value[step.id] ?? step.title;
  const title = draft.trim();
  if (!title) {
    stepDrafts.value[step.id] = step.title;
    resizeAllStepTextareas();
    return;
  }
  if (title === step.title) return;
  stepDrafts.value[step.id] = title;
  await todoStore.updateStep(step.id, { title });
}

function handleStepTitleKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  (e.currentTarget as HTMLTextAreaElement).blur();
}

function handleNewStepKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  void addStep();
}

async function removeStep(stepId: string) {
  await todoStore.deleteStep(stepId);
}

async function copyStepsAsMarkdown() {
  const steps = todoStore.selectedTodo?.steps ?? [];
  if (!steps.length) return;
  const markdown = steps.map(formatStepAsMarkdown).join('\n');
  try {
    await navigator.clipboard.writeText(markdown);
    notifySuccess(`已复制 ${steps.length} 个步骤`, 'Todo');
  } catch (error) {
    notifyError(error, '复制步骤失败');
  }
}

function formatStepAsMarkdown(step: TodoStep) {
  const marker = step.isCompleted ? 'x' : ' ';
  const title = normalizeMarkdownTaskTitle(step.title);
  const lines = [`- [${marker}] ${title}`];
  const images = parseStepImageUrls(step.imageUrl);
  images.forEach((imageUrl, index) => {
    const suffix = images.length > 1 ? ` ${index + 1}` : '';
    lines.push(`  ![${escapeMarkdownAlt(step.title || '步骤图片')}${suffix}](${imageUrl})`);
  });
  return lines.join('\n');
}

function normalizeMarkdownTaskTitle(value: string) {
  const lines = value
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n')
    .map(line => line.trim());
  const normalized = lines.length ? lines : ['未命名步骤'];
  return normalized
    .map((line, index) => (index === 0 ? (line || '未命名步骤') : `  ${line}`))
    .join('\n');
}

function escapeMarkdownAlt(value: string) {
  return value.replace(/[\r\n]+/g, ' ').replace(/[[\]]/g, '').trim() || '步骤图片';
}

function handleStepPointerDown(event: PointerEvent, step: TodoStep) {
  if (event.button !== 2 || !todoStore.selectedTodo) return;
  event.preventDefault();
  event.stopPropagation();
  draggedStepId.value = step.id;
  stepDragStartOrder = todoStore.selectedTodo.steps.map(item => item.id);
  stepDragLatestOrder = [...stepDragStartOrder];
  stepDragStartedAt = { x: event.clientX, y: event.clientY };
  stepDragMoved = false;
  window.addEventListener('pointermove', handleStepPointerMove, true);
  window.addEventListener('pointerup', handleStepPointerUp, true);
  window.addEventListener('pointercancel', handleStepPointerCancel, true);
  window.addEventListener('contextmenu', suppressStepDragContextMenu, true);
}

function handleStepPointerMove(event: PointerEvent) {
  const todo = todoStore.selectedTodo;
  const sourceId = draggedStepId.value;
  if (!todo || !sourceId) return;
  if ((event.buttons & 2) === 0) {
    void finishStepDrag();
    return;
  }

  event.preventDefault();
  const distance = Math.hypot(event.clientX - stepDragStartedAt.x, event.clientY - stepDragStartedAt.y);
  if (distance > 3) {
    stepDragMoved = true;
  }

  const target = findStepDragTarget(event.clientX, event.clientY);
  if (!target || target.stepId === sourceId) return;

  const currentIds = todo.steps.map(step => step.id);
  const nextIds = moveStepId(currentIds, sourceId, target.stepId, target.insertAfter);
  if (arraysEqual(currentIds, nextIds)) return;

  stepDragLatestOrder = nextIds;
  todoStore.setLocalStepOrder(todo.id, nextIds);
  resizeAllStepTextareas();
}

function handleStepPointerUp(event: PointerEvent) {
  if (draggedStepId.value) {
    event.preventDefault();
    event.stopPropagation();
  }
  void finishStepDrag();
}

function handleStepPointerCancel() {
  teardownStepDrag();
  resizeAllStepTextareas();
}

async function finishStepDrag() {
  const todo = todoStore.selectedTodo;
  const finalOrder = [...stepDragLatestOrder];
  const shouldPersist = Boolean(todo && stepDragMoved && !arraysEqual(stepDragStartOrder, stepDragLatestOrder));
  teardownStepDrag();
  if (!todo || !shouldPersist) return;
  try {
    await todoStore.reorderSteps(todo.id, finalOrder);
  } catch (error) {
    notifyError(error, '步骤排序失败');
  } finally {
    resizeAllStepTextareas();
  }
}

function teardownStepDrag() {
  window.removeEventListener('pointermove', handleStepPointerMove, true);
  window.removeEventListener('pointerup', handleStepPointerUp, true);
  window.removeEventListener('pointercancel', handleStepPointerCancel, true);
  window.removeEventListener('contextmenu', suppressStepDragContextMenu, true);
  draggedStepId.value = null;
  stepDragStartOrder = [];
  stepDragLatestOrder = [];
  stepDragMoved = false;
}

function suppressStepDragContextMenu(event: MouseEvent) {
  if (!draggedStepId.value) return;
  event.preventDefault();
  event.stopPropagation();
}

function findStepDragTarget(clientX: number, clientY: number) {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const item = element instanceof Element
      ? element.closest<HTMLElement>('.step-item[data-step-id]')
      : null;
    if (!item?.dataset.stepId) continue;
    const rect = item.getBoundingClientRect();
    return {
      stepId: item.dataset.stepId,
      insertAfter: clientY > rect.top + rect.height / 2,
    };
  }
  return null;
}

function moveStepId(ids: string[], sourceId: string, targetId: string, insertAfter: boolean) {
  const withoutSource = ids.filter(id => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  if (targetIndex === -1) return ids;
  const insertIndex = targetIndex + (insertAfter ? 1 : 0);
  const next = [...withoutSource];
  next.splice(insertIndex, 0, sourceId);
  return next;
}

function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function removeStepImage(step: TodoStep, imageIndex: number) {
  const nextImages = parseStepImageUrls(step.imageUrl).filter((_, index) => index !== imageIndex);
  await todoStore.updateStep(step.id, { imageUrl: serializeStepImageUrls(nextImages) });
}

function removeNewStepImage(index: number) {
  newStepImages.value = newStepImages.value.filter((_, imageIndex) => imageIndex !== index);
}

function openStepImage(step: TodoStep, imageSrc: string) {
  const index = stepPreviewImages.value.findIndex(image => image.src === imageSrc);
  imagePreviewIndex.value = Math.max(index, 0);
  imagePreviewVisible.value = true;
}

async function handleStepPaste(e: ClipboardEvent, stepId: string) {
  const imageUrl = await readPastedImageDataUrl(e);
  if (!imageUrl) return;
  e.preventDefault();
  const step = todoStore.selectedTodo?.steps.find(item => item.id === stepId);
  const nextImages = [...parseStepImageUrls(step?.imageUrl), imageUrl];
  await todoStore.updateStep(stepId, { imageUrl: serializeStepImageUrls(nextImages) });
}

async function handleNewStepPaste(e: ClipboardEvent) {
  const imageUrl = await readPastedImageDataUrl(e);
  if (!imageUrl) return;
  e.preventDefault();
  newStepImages.value = [...newStepImages.value, imageUrl];
}

function parseStepImageUrls(value: string | undefined): string[] {
  const raw = value?.trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
    } catch {
      return [raw];
    }
  }
  return [raw];
}

function serializeStepImageUrls(urls: string[]): string {
  const normalized = urls.map(url => url.trim()).filter(Boolean);
  if (normalized.length === 0) return '';
  if (normalized.length === 1) return normalized[0];
  return JSON.stringify(normalized);
}

function readPastedImageDataUrl(e: ClipboardEvent): Promise<string | null> {
  const items = Array.from(e.clipboardData?.items ?? []);
  const imageItem = items.find(item => item.type.startsWith('image/'));
  const file = imageItem?.getAsFile();
  if (!file) return Promise.resolve(null);

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function resizeStepTextarea(e: Event) {
  const textarea = e.currentTarget as HTMLTextAreaElement;
  resizeTextarea(textarea);
  const stepId = textarea.dataset.stepId;
  const step = todoStore.selectedTodo?.steps.find(item => item.id === stepId);
  if (step?.isCompleted && stepId) {
    updateStepStrikeLines(stepId);
  }
}

function resizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = `${measureTextareaHeight(el)}px`;
}

function scheduleTextareaResize() {
  if (textareaResizeFrame) {
    cancelAnimationFrame(textareaResizeFrame);
  }
  textareaResizeFrame = requestAnimationFrame(() => {
    textareaResizeFrame = 0;
    resizeAllStepTextareas();
  });
}

function resizeAllStepTextareas() {
  nextTick(() => {
    document.querySelectorAll<HTMLTextAreaElement>('.step-title-input, .step-add-input')
      .forEach(resizeTextarea);
    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLTextAreaElement>('.step-title-input, .step-add-input')
        .forEach(resizeTextarea);
      updateCompletedStepStrikeLines(todoStore.selectedTodo?.steps ?? []);
    });
  });
}

function measureTextareaHeight(el: HTMLTextAreaElement) {
  const style = window.getComputedStyle(el);
  const lineHeight = Number.parseFloat(style.lineHeight) || 22;
  const verticalPadding = toPixels(style.paddingTop) + toPixels(style.paddingBottom);
  const verticalBorder = toPixels(style.borderTopWidth) + toPixels(style.borderBottomWidth);
  const lines = getTextareaVisualLines(el, style);
  return Math.ceil(Math.max(lines.length, 1) * lineHeight + verticalPadding + verticalBorder);
}

function getTextareaVisualLines(el: HTMLTextAreaElement, style = window.getComputedStyle(el)) {
  const maxWidth = getTextareaContentWidth(el, style);
  if (maxWidth <= 0) return [el.value || ''];

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return [el.value || ''];
  context.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return wrapTextToVisualLines(el.value || '', maxWidth, context);
}

function getTextareaContentWidth(el: HTMLTextAreaElement, style = window.getComputedStyle(el)) {
  const inlinePadding = toPixels(style.paddingLeft) + toPixels(style.paddingRight);
  const selfWidth = el.clientWidth - inlinePadding;
  if (selfWidth > 0) return selfWidth;

  const parentWidth = el.parentElement?.clientWidth ?? 0;
  return Math.max(parentWidth - inlinePadding, 0);
}

function toPixels(value: string) {
  return Number.parseFloat(value) || 0;
}

function updateCompletedStepStrikeLines(steps: TodoStep[]) {
  nextTick(() => {
    const next = { ...stepStrikeLines.value };
    for (const step of steps) {
      if (step.isCompleted) {
        next[step.id] = measureStepStrikeLines(step.id, stepDrafts.value[step.id] ?? step.title);
      } else if (!stepStrikeExiting.value[step.id]) {
        delete next[step.id];
      }
    }
    stepStrikeLines.value = next;
  });
}

function updateStepStrikeLines(stepId: string) {
  stepStrikeLines.value = {
    ...stepStrikeLines.value,
    [stepId]: measureStepStrikeLines(stepId, stepDrafts.value[stepId] ?? ''),
  };
}

function measureStepStrikeLines(stepId: string, text: string) {
  if (typeof document === 'undefined') return [];
  const textarea = document.querySelector<HTMLTextAreaElement>(`.step-title-input[data-step-id="${stepId}"]`);
  if (!textarea) return [];

  const style = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(style.lineHeight) || 22;
  const maxWidth = getTextareaContentWidth(textarea, style);
  if (maxWidth <= 0) return [];

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return [];
  context.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

  const visualLines = wrapTextToVisualLines(text || '', maxWidth, context);

  return visualLines.map((line, index) => ({
    top: index * lineHeight + lineHeight / 2,
    width: Math.min(Math.ceil(context.measureText(line).width) + 2, maxWidth),
    delay: index * STEP_STRIKE_LINE_DELAY_MS,
  })).filter(line => line.width > 2);
}

function getStepStrikeAnimationDuration(lines: Array<{ delay: number }>) {
  const maxDelay = lines.reduce((max, line) => Math.max(max, line.delay), 0);
  const maxExitDelay = Math.max(lines.length - 1, 0) * STEP_STRIKE_LINE_DELAY_MS;
  return Math.max(maxDelay, maxExitDelay) + STEP_STRIKE_ANIMATION_BUFFER_MS;
}

function getStepStrikeLineDelay(stepId: string, index: number, line: { delay: number }) {
  if (!stepStrikeExiting.value[stepId]) return line.delay;
  const lineCount = stepStrikeLines.value[stepId]?.length ?? 0;
  return Math.max(lineCount - index - 1, 0) * STEP_STRIKE_LINE_DELAY_MS;
}

function wrapTextToVisualLines(text: string, maxWidth: number, context: CanvasRenderingContext2D) {
  const visualLines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      visualLines.push('');
      continue;
    }

    let current = '';
    for (const char of Array.from(paragraph)) {
      const candidate = `${current}${char}`;
      if (current && context.measureText(candidate).width > maxWidth) {
        visualLines.push(current);
        current = char;
      } else {
        current = candidate;
      }
    }
    visualLines.push(current);
  }
  return visualLines.length > 0 ? visualLines : [''];
}

const { show: showConfirm } = useConfirmDialog();

async function deleteTodo() {
  const todo = todoStore.selectedTodo;
  if (!todo) return;
  const ok = await showConfirm({
    title: '删除任务',
    message: `确定要删除「${todo.title}」吗？此操作不可撤销。`,
    confirmText: '删除',
    danger: true,
  });
  if (ok) {
    await todoStore.deleteTodo(todo.id);
  }
}

async function onDueDateChange(val: string | number | undefined) {
  const todo = todoStore.selectedTodo;
  if (!todo) return;
  await todoStore.updateTodo(todo.id, { dueDate: typeof val === 'string' ? val : '' });
}
</script>

<template>
  <aside ref="detailRef" class="todo-detail" v-if="todoStore.selectedTodo" :style="detailTextStyle" @contextmenu.prevent.stop="handleContextMenu">
    <TodoBackground :config="activeDetailBg" />
    <div class="detail-inner" style="position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%;">
      <div class="detail-header">
        <UiInput
          ref="titleRef"
          v-model="editingTitle"
          class="detail-title"
          @blur="saveTitle"
          @keydown.enter="($event.target as HTMLInputElement)?.blur()"
        />
        <UiIconButton class="close-btn" size="md" variant="ghost" title="关闭" @click="close">
          <IconRenderer icon="iconify:lucide:x" :size="18" />
        </UiIconButton>
      </div>

      <UiScrollbar :x="false" :size="6" class="detail-scroll-area">
      <div class="detail-body">
      <!-- 步骤 -->
      <div class="detail-section">
        <div class="section-label section-label--with-actions">
          <span class="section-label__title">
            <IconRenderer icon="iconify:lucide:list-checks" :size="15" />
            <span>步骤</span>
          </span>
          <UiIconButton
            class="copy-steps-btn"
            size="sm"
            variant="ghost"
            :disabled="todoStore.selectedTodo.steps.length === 0"
            title="复制步骤为 Markdown"
            @click="copyStepsAsMarkdown"
          >
            <IconRenderer icon="iconify:lucide:copy" :size="14" />
          </UiIconButton>
        </div>
        <UiScrollbar :x="false" :y="true" :size="5" class="steps-scroll-area">
        <TransitionGroup name="step-reorder" tag="div" class="steps-list">
          <div
            v-for="step in todoStore.selectedTodo.steps"
            :key="step.id"
            class="step-item"
            :class="{ 'is-completed': step.isCompleted, 'is-dragging': draggedStepId === step.id }"
            :data-step-id="step.id"
            title="右键拖动排序"
            @pointerdown="handleStepPointerDown($event, step)"
            @contextmenu.prevent.stop
          >
            <UiIconButton
              class="step-check"
              :class="{ checked: step.isCompleted }"
              size="sm"
              variant="ghost"
              :title="step.isCompleted ? '标记步骤未完成' : '标记步骤完成'"
              @click="toggleStep(step.id, step.isCompleted)"
            >
              <IconRenderer v-if="step.isCompleted" icon="iconify:lucide:check" :size="13" />
            </UiIconButton>
            <div class="step-main">
              <div class="step-title-wrap" :class="{ done: step.isCompleted }">
                <UiTextarea
                  v-model="stepDrafts[step.id]"
                  class="step-title-input"
                  :data-step-id="step.id"
                  :rows="1"
                  wrap="soft"
                  resize="none"
                  @input="resizeStepTextarea"
                  @blur="saveStepTitle(step)"
                  @keydown="handleStepTitleKeydown"
                  @paste="handleStepPaste($event, step.id)"
                />
                <span
                  v-if="step.isCompleted || stepStrikeExiting[step.id]"
                  :key="`${step.id}-${stepStrikeRuns[step.id] ?? 0}`"
                  class="step-strike-lines"
                  :class="{ 'is-exiting': stepStrikeExiting[step.id] }"
                >
                  <span
                    v-for="(line, index) in stepStrikeLines[step.id] ?? []"
                    :key="`${step.id}-line-${index}`"
                    class="step-strike-line"
                    :class="{ 'is-exiting': stepStrikeExiting[step.id] }"
                    :style="{
                      top: `${line.top}px`,
                      width: `${line.width}px`,
                      animationDelay: `${getStepStrikeLineDelay(step.id, index, line)}ms`,
                    }"
                  />
                </span>
              </div>
              <div v-if="parseStepImageUrls(step.imageUrl).length > 0" class="step-images">
                <div
                  v-for="(imageUrl, imageIndex) in parseStepImageUrls(step.imageUrl)"
                  :key="`${step.id}-image-${imageIndex}`"
                  class="step-image-preview"
                >
                  <UiButton class="step-image-open" variant="ghost" type="button" title="预览图片" @click="openStepImage(step, imageUrl)">
                    <img :src="imageUrl" alt="步骤图片" draggable="false" />
                  </UiButton>
                  <UiIconButton class="step-image-remove" size="sm" variant="ghost" title="移除图片" @click="removeStepImage(step, imageIndex)">
                    <IconRenderer icon="iconify:lucide:x" :size="14" />
                  </UiIconButton>
                </div>
              </div>
            </div>
            <UiIconButton class="step-delete" size="sm" variant="ghost" title="删除步骤" @click="removeStep(step.id)">
              <IconRenderer icon="iconify:lucide:x" :size="15" />
            </UiIconButton>
          </div>
          <div key="step-add" class="step-add">
            <UiTextarea
              v-model="newStepText"
              class="step-add-input"
              placeholder="添加步骤"
              :rows="1"
              wrap="soft"
              resize="none"
              @input="resizeStepTextarea"
              @keydown="handleNewStepKeydown"
              @paste="handleNewStepPaste"
            />
            <div v-if="newStepImages.length > 0" class="step-images step-images--draft">
              <div
                v-for="(imageUrl, imageIndex) in newStepImages"
                :key="`draft-image-${imageIndex}`"
                class="step-image-preview step-image-preview--draft"
              >
                <img :src="imageUrl" alt="步骤图片" draggable="false" />
                <UiIconButton class="step-image-remove" size="sm" variant="ghost" title="移除图片" @click="removeNewStepImage(imageIndex)">
                  <IconRenderer icon="iconify:lucide:x" :size="14" />
                </UiIconButton>
              </div>
            </div>
          </div>
        </TransitionGroup>
        </UiScrollbar>
      </div>

      <!-- 我的一天 -->
      <UiButton class="detail-action" variant="ghost" type="button" @click="toggleMyDay">
        <IconRenderer icon="iconify:lucide:sun" :size="17" />
        <span>{{ todoStore.selectedTodo.isMyDay ? '从我的一天移除' : '添加到我的一天' }}</span>
      </UiButton>

      <!-- 截止日期 -->
      <div class="detail-section">
        <div class="section-label">
          <IconRenderer icon="iconify:lucide:calendar" :size="15" />
          <span>截止日期</span>
        </div>
        <UiDateTimePicker
          :modelValue="todoStore.selectedTodo.dueDate || ''"
          mode="date"
          value-format="date"
          @update:modelValue="onDueDateChange"
          placeholder="设置截止日期"
          size="sm"
        />
      </div>

      <!-- 提醒 -->
      <div class="detail-section">
        <div class="section-label">
          <IconRenderer icon="iconify:lucide:alarm-clock" :size="15" />
          <span>提醒</span>
        </div>
        <ReminderPicker
          :todoId="todoStore.selectedTodo.id"
          :reminders="todoStore.selectedTodo.reminders"
        />
      </div>

      <!-- 重复 -->
      <div class="detail-section">
        <div class="section-label">
          <IconRenderer icon="iconify:lucide:repeat-2" :size="15" />
          <span>重复</span>
        </div>
        <RepeatPicker
          :modelValue="todoStore.selectedTodo.repeatRule || ''"
          @update:modelValue="(v: string) => todoStore.updateTodo(todoStore.selectedTodo!.id, { repeatRule: v || undefined })"
        />
      </div>

      <div v-if="knowledgeSource" class="detail-section knowledge-source-card">
        <div class="section-label">
          <IconRenderer icon="iconify:lucide:library" :size="15" />
          <span>知识库来源</span>
        </div>
        <UiButton type="button" variant="ghost" class="knowledge-source-card__button" @click="openKnowledgeSource">
          <strong>{{ knowledgeSource.title }}</strong>
          <span>{{ knowledgeSource.kind === 'page' ? '页面' : '速记' }} · {{ knowledgeSource.id }}</span>
          <small v-if="knowledgeSource.blockId">块 ID：{{ knowledgeSource.blockId }}</small>
        </UiButton>
      </div>

      <!-- 备注 -->
      <div class="detail-section">
        <div class="section-label">
          <IconRenderer icon="iconify:lucide:sticky-note" :size="15" />
          <span>备注</span>
        </div>
        <!-- 编辑模式 -->
        <UiTextarea
          v-if="noteEditing"
          ref="noteRef"
          v-model="noteText"
          class="note-area note-area--editing"
          placeholder="支持 Markdown 语法..."
          resize="vertical"
          @blur="leaveNoteEdit"
        />
        <!-- 渲染模式 -->
        <div
          v-else
          class="note-area note-area--rendered"
          :class="{ 'note-area--empty': !noteText }"
          @click="enterNoteEdit"
        >
          <div v-if="noteText" class="note-md-content" v-html="renderedNote"></div>
          <span v-else class="note-placeholder">添加备注（支持 Markdown）...</span>
        </div>
      </div>
    </div>
      </UiScrollbar>

    <div class="detail-footer">
      <span class="created-info">创建于 {{ todoStore.selectedTodo.createdAt?.split('T')[0] ?? todoStore.selectedTodo.createdAt?.slice(0, 10) }}</span>
      <UiButton class="delete-btn" variant="ghost" type="button" @click="deleteTodo">
        <IconRenderer icon="iconify:lucide:trash-2" :size="15" />
        <span>删除</span>
      </UiButton>
    </div>
    </div>

    <ImagePreviewDialog
      v-model="imagePreviewVisible"
      :images="stepPreviewImages"
      :initial-index="imagePreviewIndex"
      @update:index="imagePreviewIndex = $event"
    />
  </aside>
</template>

<style scoped>
.todo-detail {
  width: 340px;
  min-width: 300px;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  background: transparent;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--todo-panel-shadow);
  box-sizing: border-box;
}
.detail-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.detail-scroll-area {
  flex: 1;
  min-height: 0;
}
.detail-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 18px 16px 8px;
  flex-shrink: 0;
}
.close-btn.ui-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  background: var(--ui-button-ghost-hover-bg);
  border: none;
  cursor: pointer;
  color: var(--ui-text-muted);
  padding: 0;
  line-height: 0;
  border-radius: 6px;
  transition: all 0.15s ease;
  transform: none;
}
.close-btn.ui-icon-button:hover:not(:disabled) {
  background: var(--todo-accent-bg-soft);
  color: var(--ui-text-primary);
  transform: none;
}

.detail-body {
  flex: 1;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.detail-title.ui-input {
  flex: 1;
  min-width: 0;
  align-self: flex-end;
  font-size: 1.2em;
  font-weight: 600;
  border: none;
  outline: none;
  background: transparent;
  width: auto;
  padding: 0 0 2px;
  color: var(--ui-text-primary);
  line-height: 1.35;
  box-shadow: none;
}
.detail-title.ui-input:focus {
  border-color: transparent;
  box-shadow: none;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.section-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  color: var(--ui-text-muted);
  font-weight: 500;
}
.section-label--with-actions {
  width: 100%;
  justify-content: space-between;
}
.section-label__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.copy-steps-btn.ui-icon-button {
  width: 24px;
  height: 24px;
  color: var(--ui-text-muted);
  transform: none;
}
.copy-steps-btn.ui-icon-button:hover:not(:disabled) {
  color: var(--ui-input-focus-border);
  background: var(--todo-accent-bg-soft);
  transform: none;
}

.knowledge-source-card__button.ui-button {
  display: grid;
  gap: 3px;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  padding: 9px 10px;
  color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--primary-color) 8%, var(--ui-surface-glass));
  text-align: left;
  cursor: pointer;
  font-weight: inherit;
  white-space: normal;
  transform: none;
}

.knowledge-source-card__button.ui-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--primary-color) 45%, var(--ui-border-subtle));
  transform: none;
}

.knowledge-source-card__button :deep(.ui-button__label) {
  display: grid;
  justify-content: stretch;
  gap: 3px;
  width: 100%;
  min-width: 0;
}

.knowledge-source-card__button strong,
.knowledge-source-card__button span,
.knowledge-source-card__button small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-source-card__button span,
.knowledge-source-card__button small {
  color: var(--ui-text-muted);
  font-size: 0.82em;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 4px;
}
.steps-scroll-area {
  height: auto;
  max-height: min(34vh, 320px);
  min-height: 34px;
}
.steps-scroll-area :deep(.ui-scrollbar__viewport) {
  max-height: min(34vh, 320px);
}
.steps-scroll-area :deep(.ui-scrollbar__content) {
  min-height: 0;
}
.step-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
  border-radius: 0;
  transition:
    background-color 0.16s ease,
    box-shadow 0.16s ease,
    opacity 0.16s ease,
    transform 0.18s cubic-bezier(0.2, 0, 0, 1);
  cursor: grab;
}
.step-item.is-dragging {
  opacity: 0.72;
  background: var(--todo-accent-bg-soft);
  box-shadow: inset 2px 0 0 var(--ui-input-focus-border);
  cursor: grabbing;
}
.step-reorder-move,
.step-reorder-enter-active,
.step-reorder-leave-active {
  transition: transform 0.18s cubic-bezier(0.2, 0, 0, 1), opacity 0.16s ease;
}
.step-reorder-enter-from,
.step-reorder-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
.step-reorder-leave-active {
  position: absolute;
}
.step-check.ui-icon-button {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--ui-text-subtle);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65em;
  color: white;
  line-height: 0;
  padding: 0;
  margin-top: 2px;
  flex-shrink: 0;
  transition:
    background-color 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.18s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.14s cubic-bezier(0.4, 0, 0.2, 1);
}
.step-check.ui-icon-button:hover:not(:disabled) { transform: scale(1.06); border-color: var(--ui-input-focus-border); }
.step-check.checked { background: var(--ui-input-focus-border); border-color: var(--ui-input-focus-border); }
.step-check.checked :deep(*) { animation: step-check-pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1); }
.step-main {
  flex: 1;
  min-width: 0;
}
.step-title-wrap {
  position: relative;
}
.step-strike-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.step-strike-line {
  position: absolute;
  left: 0;
  height: 1.5px;
  background: currentColor;
  opacity: 0.52;
  transform: scaleX(0);
  transform-origin: left center;
  animation: step-strike-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.step-strike-line.is-exiting {
  transform: scaleX(1);
  transform-origin: left center;
  animation-name: step-strike-out;
  animation-duration: 0.42s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
.step-title-input.ui-textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 22px;
  border: none;
  border-radius: 0;
  outline: none;
  padding: 0;
  background: transparent;
  color: var(--ui-text-primary);
  font: inherit;
  font-size: 0.85em;
  line-height: 22px;
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  transition:
    opacity 0.18s ease,
    color 0.18s ease,
    text-decoration-color 0.22s ease;
  box-shadow: none;
}
.step-title-input.ui-textarea:focus {
  border-color: transparent;
  box-shadow: none;
}
.step-title-wrap.done .step-title-input {
  opacity: 0.5;
}
.step-delete.ui-icon-button {
  background: none;
  border: none;
  cursor: pointer;
  line-height: 0;
  color: var(--ui-text-subtle);
  opacity: 0;
  padding: 4px;
  transition: opacity 0.15s;
  transform: none;
}
.step-item:hover .step-delete { opacity: 1; }

.step-add-input.ui-textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--ui-border-subtle);
  border-radius: 0;
  padding: 3px 0 6px;
  font-size: 0.85em;
  line-height: 22px;
  outline: none;
  background: transparent;
  color: var(--ui-text-primary);
  font-family: inherit;
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  box-shadow: none;
}
.step-add-input.ui-textarea:focus {
  border-color: var(--ui-border-subtle);
  box-shadow: none;
}
.step-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 5px;
}
.step-image-preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 80px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  overflow: hidden;
  background:
    linear-gradient(45deg, rgba(127, 127, 127, 0.12) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(127, 127, 127, 0.12) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(127, 127, 127, 0.12) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(127, 127, 127, 0.12) 75%),
    var(--ui-surface-overlay);
  background-position: 0 0, 0 6px, 6px -6px, -6px 0;
  background-size: 12px 12px;
}
.step-image-open.ui-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: zoom-in;
  min-height: auto;
  transform: none;
}
.step-image-open.ui-button:hover:not(:disabled) {
  transform: none;
}
.step-image-open :deep(.ui-button__label) {
  width: 100%;
  height: 100%;
}
.step-image-preview img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.step-image-preview--draft {
  margin-left: 0;
}
.step-image-preview--draft img {
  max-width: 120px;
  max-height: 80px;
}
.step-image-remove.ui-icon-button {
  position: absolute;
  top: 4px;
  right: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.52);
  color: #fff;
  cursor: pointer;
  padding: 0;
  line-height: 0;
  transform: none;
}

.detail-action.ui-button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.9em;
  color: var(--ui-text-primary);
  width: 100%;
  text-align: left;
  border-bottom: 1px solid var(--ui-border-subtle);
  font-weight: inherit;
  white-space: normal;
  transform: none;
}
.detail-action.ui-button:hover:not(:disabled) { color: var(--ui-input-focus-border); transform: none; }
.detail-action :deep(.ui-button__label) {
  justify-content: flex-start;
  width: 100%;
}



.note-area {
  width: 100%;
  min-height: 80px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.85em;
  outline: none;
  background: transparent;
  color: var(--ui-text-primary);
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.note-area--editing.ui-textarea {
  resize: vertical;
  border-color: var(--ui-input-focus-border);
  box-shadow: 0 0 0 2px var(--ui-focus-ring-color, rgba(92, 157, 237, 0.16));
}

.note-area--rendered {
  cursor: pointer;
  min-height: 60px;
}
.note-area--rendered:hover {
  border-color: var(--ui-border-accent-soft);
  background: var(--ui-surface-overlay);
}

.note-area--empty {
  min-height: 52px;
  display: flex;
  align-items: center;
}

.note-placeholder {
  color: var(--ui-input-placeholder);
  font-style: italic;
  font-size: 0.92em;
}

/* ─── Markdown 渲染样式 ─── */
.note-md-content {
  line-height: 1.65;
  word-break: break-word;
}

.note-md-content :deep(h1),
.note-md-content :deep(h2),
.note-md-content :deep(h3),
.note-md-content :deep(h4) {
  margin: 8px 0 4px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ui-text-primary);
}
.note-md-content :deep(h1) { font-size: 1.2em; }
.note-md-content :deep(h2) { font-size: 1.1em; }
.note-md-content :deep(h3) { font-size: 1em; }
.note-md-content :deep(h4) { font-size: 0.95em; }

.note-md-content :deep(p) {
  margin: 4px 0;
}

.note-md-content :deep(ul),
.note-md-content :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}

.note-md-content :deep(li) {
  margin: 2px 0;
}

.note-md-content :deep(code) {
  background: var(--ui-surface-overlay);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}

.note-md-content :deep(pre) {
  background: var(--ui-surface-overlay);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 6px 0;
  overflow-x: auto;
}

.note-md-content :deep(pre code) {
  background: transparent;
  padding: 0;
}

.note-md-content :deep(blockquote) {
  margin: 6px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--ui-border-accent);
  color: var(--ui-text-muted);
}

.note-md-content :deep(a) {
  color: var(--ui-input-focus-border);
  text-decoration: none;
}
.note-md-content :deep(a:hover) {
  text-decoration: underline;
}

.note-md-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--ui-border-subtle);
  margin: 8px 0;
}

.note-md-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 6px 0;
  font-size: 0.92em;
}

.note-md-content :deep(th),
.note-md-content :deep(td) {
  border: 1px solid var(--ui-border-subtle);
  padding: 4px 8px;
  text-align: left;
}

.note-md-content :deep(th) {
  background: var(--ui-surface-overlay);
  font-weight: 600;
}

.note-md-content :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}

.note-md-content :deep(input[type="checkbox"]) {
  margin-right: 6px;
  pointer-events: none;
}

.detail-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--ui-border-subtle);
  font-size: 0.8em;
  color: var(--ui-text-subtle);
}
.delete-btn.ui-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ui-button-danger-text);
  font-size: 0.85em;
  font-weight: inherit;
  transform: none;
}
.delete-btn.ui-button:hover:not(:disabled) { text-decoration: underline; transform: none; }

@keyframes step-check-pop {
  from {
    opacity: 0;
    transform: scale(0.45);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes step-strike-in {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

@keyframes step-strike-out {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
</style>
