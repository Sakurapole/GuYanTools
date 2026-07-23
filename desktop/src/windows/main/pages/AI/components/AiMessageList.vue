<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AiChatMessage } from '@/contracts/ai';
import AiMessageItem from './AiMessageItem.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiEmptyState from '@/windows/main/components/ui/UiEmptyState.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';

const props = defineProps<{
  messages: AiChatMessage[];
  loading?: boolean;
  streaming?: boolean;
  userAvatar?: string;
  assistantAvatar?: string;
  assistantName?: string;
}>();

const emit = defineEmits<{
  regenerate: [messageId: string];
  remember: [messageId: string];
  insertSelection: [content: string, quoted: boolean];
}>();

const listRef = ref<{
  viewportRef: HTMLElement | null;
  refresh: () => void;
  scrollTo: (options: ScrollToOptions) => void;
} | null>(null);
const messageListRef = ref<HTMLElement | null>(null);
const selectionMenuRef = ref<HTMLElement | null>(null);
const selectionMenu = ref<{ content: string; left: number; top: number } | null>(null);
const activeNavigatorMessageId = ref('');
const hoveredNavigatorMessageId = ref('');
const navigatorMessages = computed(() => props.messages.filter((message) => message.role === 'user'));
let selectionFrame: number | null = null;

const selectionMenuStyle = computed(() => selectionMenu.value
  ? { left: `${selectionMenu.value.left}px`, top: `${selectionMenu.value.top}px` }
  : undefined);

watch(
  () => [props.messages.length, props.messages.at(-1)?.content],
  async () => {
    const element = listRef.value?.viewportRef;
    const stickToBottom = !element
      || element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
    await nextTick();
    const nextElement = listRef.value?.viewportRef;
    if (stickToBottom && nextElement) {
      listRef.value?.scrollTo({ top: nextElement.scrollHeight, behavior: 'auto' });
      listRef.value?.refresh();
    }
  },
);

function queueSelectionMenu() {
  if (selectionFrame !== null) {
    window.cancelAnimationFrame(selectionFrame);
  }
  selectionFrame = window.requestAnimationFrame(() => {
    selectionFrame = null;
    updateSelectionMenu();
  });
}

function updateSelectionMenu() {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  const content = selection?.toString().trim() ?? '';
  if (!range || !content || !isSelectionInMessageList(range.commonAncestorContainer)) {
    selectionMenu.value = null;
    return;
  }

  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  const menuWidth = 312;
  const menuHeight = 38;
  const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.left));
  const top = rect.top > menuHeight + 12
    ? rect.top - menuHeight - 8
    : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 8);

  selectionMenu.value = { content, left, top };
}

function isSelectionInMessageList(node: Node) {
  return Boolean(messageListRef.value?.contains(node));
}

async function copySelection() {
  const content = selectionMenu.value?.content;
  if (!content) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    } else {
      await window.shellApi.writeClipboardText(content);
    }
  } finally {
    clearSelectionMenu();
  }
}

function insertSelection(quoted: boolean) {
  const content = selectionMenu.value?.content;
  if (!content) {
    return;
  }

  emit('insertSelection', content, quoted);
  clearSelectionMenu();
}

function clearSelectionMenu() {
  selectionMenu.value = null;
  window.getSelection()?.removeAllRanges();
}

function handleDocumentPointerDown(event: MouseEvent) {
  const target = event.target;
  if (target instanceof Node && selectionMenuRef.value?.contains(target)) {
    return;
  }
  if (target instanceof Node && messageListRef.value?.contains(target)) {
    return;
  }
  selectionMenu.value = null;
}

function handleViewportChange() {
  selectionMenu.value = null;
}

function navigatorLabel(message: AiChatMessage, index: number) {
  const content = message.content.replace(/\s+/g, ' ').trim();
  return content ? `第 ${index + 1} 问：${content}` : `第 ${index + 1} 问`;
}

function navigatorPreview(message: AiChatMessage, index: number) {
  const content = message.content.replace(/\s+/g, ' ').trim();
  return {
    label: `第 ${index + 1} 个问题`,
    content: content || '空问题',
  };
}

function scrollToMessage(messageId: string) {
  const viewport = listRef.value?.viewportRef;
  const target = messageListRef.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!viewport || !target) {
    return;
  }

  const top = target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - 14;
  listRef.value?.scrollTo({ top, behavior: 'smooth' });
  activeNavigatorMessageId.value = messageId;
}

function updateActiveNavigator() {
  const viewport = listRef.value?.viewportRef;
  if (!viewport || !navigatorMessages.value.length) {
    return;
  }

  const viewportTop = viewport.getBoundingClientRect().top + 36;
  let activeId = navigatorMessages.value[0]?.id ?? '';
  for (const message of navigatorMessages.value) {
    const element = messageListRef.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(message.id)}"]`);
    if (element && element.getBoundingClientRect().top <= viewportTop) {
      activeId = message.id;
    }
  }
  activeNavigatorMessageId.value = activeId;
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown, true);
  document.addEventListener('scroll', handleViewportChange, true);
  window.addEventListener('resize', handleViewportChange);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown, true);
  document.removeEventListener('scroll', handleViewportChange, true);
  window.removeEventListener('resize', handleViewportChange);
  if (selectionFrame !== null) {
    window.cancelAnimationFrame(selectionFrame);
  }
});
</script>

<template>
  <main ref="messageListRef" class="ai-message-list" aria-label="对话消息" @mouseup="queueSelectionMenu" @keyup="queueSelectionMenu">
    <UiScrollbar ref="listRef" class="ai-message-list__scrollbar" :x="false" :y="true" :size="8" @scroll="updateActiveNavigator">
      <div class="ai-message-list__content">
        <UiEmptyState
          v-if="loading"
          icon="iconify:lucide:loader-circle"
          title="加载消息中"
          description="正在同步当前话题"
        />
        <UiEmptyState
          v-else-if="!messages.length"
          icon="iconify:lucide:sparkles"
          title="开始第一轮问答"
          description="选择模型后输入问题，联网、知识库、推理和 Canvas 可在下方工具栏调整。"
        />
        <template v-else>
          <AiMessageItem
            v-for="message in messages"
            :key="message.id"
            :message="message"
            :can-regenerate="!streaming"
            :user-avatar="userAvatar"
            :assistant-avatar="assistantAvatar"
            :assistant-name="assistantName"
            @regenerate="emit('regenerate', $event)"
            @remember="emit('remember', $event)"
          />
        </template>
      </div>
    </UiScrollbar>
    <nav v-if="navigatorMessages.length > 1" class="ai-message-list__navigator" aria-label="问答定位">
      <button
        v-for="(message, index) in navigatorMessages"
        :key="message.id"
        class="ai-message-list__navigator-item"
        :class="{ 'is-active': message.id === activeNavigatorMessageId }"
        type="button"
        :title="navigatorLabel(message, index)"
        :aria-label="navigatorLabel(message, index)"
        @mouseenter="hoveredNavigatorMessageId = message.id"
        @mouseleave="hoveredNavigatorMessageId = ''"
        @click="scrollToMessage(message.id)"
      >
        <span
          v-if="hoveredNavigatorMessageId === message.id"
          class="ai-message-list__navigator-preview"
          data-navigator-preview
          role="tooltip"
        >
          <strong>{{ navigatorPreview(message, index).label }}</strong>
          <span>{{ navigatorPreview(message, index).content }}</span>
        </span>
      </button>
    </nav>
  </main>

  <Teleport to="body">
    <div
      v-if="selectionMenu"
      ref="selectionMenuRef"
      class="ai-message-list__selection-menu"
      :style="selectionMenuStyle"
      role="toolbar"
      aria-label="选中文本操作"
      @mousedown.prevent
    >
      <UiIconButton size="sm" variant="ghost" label="复制" title="复制选中文本" @click="copySelection">
        <IconRenderer icon="iconify:lucide:copy" :size="14" />
      </UiIconButton>
      <UiIconButton size="sm" variant="ghost" label="添加" title="添加到对话框" @click="insertSelection(false)">
        <IconRenderer icon="iconify:lucide:message-square-plus" :size="14" />
      </UiIconButton>
      <UiIconButton size="sm" variant="ghost" label="引用" title="引用到对话框" @click="insertSelection(true)">
        <IconRenderer icon="iconify:lucide:quote" :size="14" />
      </UiIconButton>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.ai-message-list {
  position: relative;
  min-width: 0;
  min-height: 0;
  background: transparent;
}

.ai-message-list__scrollbar {
  min-height: 0;
}

.ai-message-list__content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
  padding: 18px 22px 18px 38px;
  box-sizing: border-box;
}

.ai-message-list__navigator {
  position: absolute;
  z-index: 2;
  top: 18px;
  left: 12px;
  display: flex;
  max-height: calc(100% - 36px);
  flex-direction: column;
  gap: 5px;
  padding: 5px 0;
}

.ai-message-list__navigator-item {
  position: relative;
  width: 3px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: var(--ui-radius-full);
  background: transparent;
  cursor: pointer;
}

.ai-message-list__navigator-item::before {
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 16px;
  border-radius: inherit;
  background: color-mix(in srgb, var(--ui-text-muted) 28%, transparent);
  content: '';
  transform-origin: left center;
  transition: background-color 160ms ease, transform 160ms ease;
}

.ai-message-list__navigator-item:hover,
.ai-message-list__navigator-item.is-active {
  z-index: 1;
}

.ai-message-list__navigator-item:hover::before,
.ai-message-list__navigator-item.is-active::before {
  background: var(--ui-primary-color, var(--primary-color));
  transform: scaleX(1.65) scaleY(1.25);
}

.ai-message-list__navigator-item:focus-visible {
  outline: 2px solid var(--ui-focus-ring, var(--primary-color));
  outline-offset: 2px;
}

.ai-message-list__navigator-preview {
  position: absolute;
  top: 50%;
  left: 14px;
  z-index: var(--ui-z-popover);
  display: flex;
  width: min(300px, calc(100vw - 64px));
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: var(--ui-border-width-thin) solid color-mix(in srgb, var(--primary-color) 18%, var(--ui-border-subtle));
  border-radius: var(--ui-radius-md);
  background: color-mix(in srgb, var(--ui-surface-base) 84%, transparent);
  box-shadow: var(--ui-shadow-popover);
  color: var(--ui-text-primary);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(-50%) translateX(-4px) scale(0.98);
  transform-origin: left center;
  transition: opacity 160ms ease, transform 160ms ease, visibility 160ms ease;
}

.ai-message-list__navigator-item:hover .ai-message-list__navigator-preview,
.ai-message-list__navigator-item:focus-visible .ai-message-list__navigator-preview {
  opacity: 1;
  visibility: visible;
  transform: translateY(-50%) translateX(0) scale(1);
}

.ai-message-list__navigator-preview strong {
  color: var(--primary-color);
  font-size: 0.72rem;
  font-weight: 750;
  line-height: 1.35;
}

.ai-message-list__navigator-preview span {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ui-text-primary);
  font-size: 0.82rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow-wrap: anywhere;
}

.ai-message-list__selection-menu {
  position: fixed;
  z-index: var(--ui-z-popover);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 38px;
  padding: 4px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-base);
  box-shadow: var(--ui-shadow-popover, var(--ui-shadow-lg));
}

@media (prefers-reduced-motion: reduce) {
  .ai-message-list__navigator-item::before,
  .ai-message-list__navigator-preview,
  .ai-message-list__selection-menu {
    transition: none;
  }
}

</style>
