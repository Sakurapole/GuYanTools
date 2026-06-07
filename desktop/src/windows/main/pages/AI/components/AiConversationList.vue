<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { AiConversation } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import Svgicon from '@/windows/main/components/svgs/svgicon.vue';

const props = defineProps<{
  conversations: AiConversation[];
  activeId: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  create: [];
  select: [conversationId: string];
  rename: [conversationId: string, title: string];
  pin: [conversationId: string, pinned: boolean];
  delete: [conversationId: string];
}>();

const searchQuery = ref('');
const editingId = ref('');
const editingTitle = ref('');

const filteredConversations = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) {
    return props.conversations;
  }

  return props.conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(query)
    || conversation.providerId.toLowerCase().includes(query)
    || conversation.modelId.toLowerCase().includes(query),
  );
});

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function startRename(conversation: AiConversation) {
  editingId.value = conversation.id;
  editingTitle.value = conversation.title;
}

function commitRename(conversation: AiConversation) {
  const nextTitle = editingTitle.value.trim();
  if (editingId.value !== conversation.id) {
    return;
  }

  editingId.value = '';
  editingTitle.value = '';
  if (nextTitle && nextTitle !== conversation.title) {
    emit('rename', conversation.id, nextTitle);
  }
}

function cancelRename() {
  editingId.value = '';
  editingTitle.value = '';
}

function handleItemKeydown(event: KeyboardEvent, conversationId: string) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('select', conversationId);
  }
}
</script>

<template>
  <aside class="ai-conversation-list">
    <div class="ai-conversation-list__head">
      <h1>AI</h1>
      <UiButton size="sm" variant="primary" @click="emit('create')">
        <template #prefix>
          <Svgicon width="14" height="14" viewBox="0 0 24 24">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </Svgicon>
        </template>
        新对话
      </UiButton>
    </div>

    <div class="ai-conversation-list__search">
      <UiInput v-model="searchQuery" size="sm" type="search" placeholder="搜索对话" />
    </div>

    <div class="ai-conversation-list__body">
      <p v-if="loading" class="ai-conversation-list__empty">加载中...</p>
      <p v-else-if="!filteredConversations.length" class="ai-conversation-list__empty">
        {{ conversations.length ? '没有匹配的对话' : '暂无对话' }}
      </p>
      <template v-else>
        <div
          v-for="conversation in filteredConversations"
          :key="conversation.id"
          role="button"
          tabindex="0"
          class="ai-conversation-list__item"
          :class="{ 'is-active': conversation.id === activeId, 'is-pinned': conversation.pinned }"
          @click="emit('select', conversation.id)"
          @keydown="handleItemKeydown($event, conversation.id)"
        >
          <span class="ai-conversation-list__item-main">
            <UiInput
              v-if="editingId === conversation.id"
              v-model="editingTitle"
              class="ai-conversation-list__rename-input"
              size="sm"
              @click.stop
              @keydown.enter.stop.prevent="commitRename(conversation)"
              @keydown.esc.stop.prevent="cancelRename"
              @blur="commitRename(conversation)"
            />
            <span v-else class="ai-conversation-list__title" @dblclick.stop="startRename(conversation)">
              <span v-if="conversation.pinned" class="ai-conversation-list__pin-dot" aria-hidden="true" />
              {{ conversation.title }}
            </span>
            <span class="ai-conversation-list__meta">{{ conversation.providerId }} / {{ conversation.modelId }}</span>
            <span class="ai-conversation-list__time">{{ formatTime(conversation.updatedAt) }}</span>
          </span>
          <UiIconButton
            class="ai-conversation-list__action"
            size="sm"
            variant="ghost"
            :title="conversation.pinned ? '取消置顶' : '置顶对话'"
            @click.stop="emit('pin', conversation.id, !conversation.pinned)"
          >
            <Svgicon width="14" height="14" viewBox="0 0 24 24">
              <path d="M14 2l8 8-2 2-1.5-1.5-4.5 4.5v5l-2 2-4-4-5 5-1.5-1.5 5-5-4-4 2-2h5L13.5 6 12 4l2-2z" />
            </Svgicon>
          </UiIconButton>
          <UiIconButton
            class="ai-conversation-list__action"
            size="sm"
            variant="ghost"
            title="重命名"
            @click.stop="startRename(conversation)"
          >
            <Svgicon width="14" height="14" viewBox="0 0 24 24">
              <path d="M4 17.25V21h3.75L18.8 9.95l-3.75-3.75L4 17.25zm17.7-10.2c.4-.4.4-1 0-1.4l-2.35-2.35a1 1 0 0 0-1.4 0l-1.85 1.85 3.75 3.75 1.85-1.85z" />
            </Svgicon>
          </UiIconButton>
          <UiIconButton
            class="ai-conversation-list__action"
            size="sm"
            variant="ghost"
            title="删除对话"
            @click.stop="emit('delete', conversation.id)"
          >
            <Svgicon width="14" height="14" viewBox="0 0 24 24">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4z" />
            </Svgicon>
          </UiIconButton>
        </div>
      </template>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.ai-conversation-list {
  display: flex;
  flex-direction: column;
  width: 268px;
  min-width: 220px;
  height: 100%;
  border-right: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-base);
}

.ai-conversation-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);

  h1 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 750;
    color: var(--ui-text-primary);
  }
}

.ai-conversation-list__search {
  padding: 10px 12px 0;
}

.ai-conversation-list__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 10px;
  overflow: auto;
}

.ai-conversation-list__empty {
  margin: 18px 4px;
  color: var(--ui-text-muted);
  font-size: 0.86rem;
}

.ai-conversation-list__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, 28px);
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 8px 10px 10px;
  border: var(--ui-border-width-thin) solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-primary);
  text-align: left;
  cursor: pointer;

  &:hover,
  &.is-active {
    background: var(--ui-surface-overlay);
    border-color: var(--ui-border-subtle);
  }

  &.is-pinned {
    border-color: color-mix(in srgb, var(--primary-color) 34%, var(--ui-border-subtle));
  }
}

.ai-conversation-list__item-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}

.ai-conversation-list__title,
.ai-conversation-list__meta,
.ai-conversation-list__time {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ai-conversation-list__title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.9rem;
  font-weight: 650;
}

.ai-conversation-list__pin-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: var(--ui-radius-full);
  background: var(--primary-color);
}

.ai-conversation-list__meta,
.ai-conversation-list__time {
  font-size: 0.76rem;
  color: var(--ui-text-muted);
}

.ai-conversation-list__rename-input {
  width: 100%;
}

.ai-conversation-list__action {
  opacity: 0;
}

.ai-conversation-list__item:hover .ai-conversation-list__action,
.ai-conversation-list__item.is-active .ai-conversation-list__action,
.ai-conversation-list__item.is-pinned .ai-conversation-list__action:first-of-type {
  opacity: 1;
}
</style>
