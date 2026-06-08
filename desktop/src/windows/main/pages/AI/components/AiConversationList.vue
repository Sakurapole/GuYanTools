<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { AiConversation } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiEmptyState from '@/windows/main/components/ui/UiEmptyState.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';

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
const pinnedConversations = computed(() => filteredConversations.value.filter((conversation) => conversation.pinned));
const recentConversations = computed(() => filteredConversations.value.filter((conversation) => !conversation.pinned));

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
      <div>
        <span class="ai-conversation-list__eyebrow">Assistant</span>
        <h1>话题</h1>
      </div>
      <UiButton size="sm" variant="primary" @click="emit('create')">
        <template #prefix>
          <IconRenderer icon="iconify:lucide:plus" :size="14" />
        </template>
        新对话
      </UiButton>
    </div>

    <div class="ai-conversation-list__search">
      <UiInput v-model="searchQuery" size="sm" type="search" placeholder="搜索话题" />
    </div>

    <div class="ai-conversation-list__body">
      <UiEmptyState
        v-if="loading"
        compact
        icon="iconify:lucide:loader-circle"
        title="加载中"
        description="正在读取最近话题"
      />
      <UiEmptyState
        v-else-if="!filteredConversations.length"
        compact
        icon="iconify:lucide:messages-square"
        :title="conversations.length ? '没有匹配的话题' : '暂无话题'"
        :description="conversations.length ? '换个关键词继续搜索' : '创建一个新话题开始问答'"
      />
      <template v-else>
        <section v-if="pinnedConversations.length" class="ai-conversation-list__group">
          <h2>置顶</h2>
          <div
            v-for="conversation in pinnedConversations"
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
                <IconRenderer class="ai-conversation-list__pin-icon" icon="iconify:lucide:pin" :size="12" />
                {{ conversation.title }}
              </span>
              <span class="ai-conversation-list__meta">{{ conversation.providerId }} / {{ conversation.modelId }}</span>
              <span class="ai-conversation-list__time">{{ formatTime(conversation.updatedAt) }}</span>
            </span>
            <UiIconButton
              class="ai-conversation-list__action"
              size="sm"
              variant="ghost"
              title="取消置顶"
              @click.stop="emit('pin', conversation.id, false)"
            >
              <IconRenderer icon="iconify:lucide:pin-off" :size="14" />
            </UiIconButton>
            <UiIconButton
              class="ai-conversation-list__action"
              size="sm"
              variant="ghost"
              title="重命名"
              @click.stop="startRename(conversation)"
            >
              <IconRenderer icon="iconify:lucide:pencil" :size="14" />
            </UiIconButton>
            <UiIconButton
              class="ai-conversation-list__action"
              size="sm"
              variant="ghost"
              title="删除对话"
              @click.stop="emit('delete', conversation.id)"
            >
              <IconRenderer icon="iconify:lucide:trash-2" :size="14" />
            </UiIconButton>
          </div>
        </section>

        <section v-if="recentConversations.length" class="ai-conversation-list__group">
          <h2>{{ pinnedConversations.length ? '最近' : '最近话题' }}</h2>
          <div
            v-for="conversation in recentConversations"
            :key="conversation.id"
            role="button"
            tabindex="0"
            class="ai-conversation-list__item"
            :class="{ 'is-active': conversation.id === activeId }"
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
                {{ conversation.title }}
              </span>
              <span class="ai-conversation-list__meta">{{ conversation.providerId }} / {{ conversation.modelId }}</span>
              <span class="ai-conversation-list__time">{{ formatTime(conversation.updatedAt) }}</span>
            </span>
            <UiIconButton
              class="ai-conversation-list__action"
              size="sm"
              variant="ghost"
              title="置顶对话"
              @click.stop="emit('pin', conversation.id, true)"
            >
              <IconRenderer icon="iconify:lucide:pin" :size="14" />
            </UiIconButton>
            <UiIconButton
              class="ai-conversation-list__action"
              size="sm"
              variant="ghost"
              title="重命名"
              @click.stop="startRename(conversation)"
            >
              <IconRenderer icon="iconify:lucide:pencil" :size="14" />
            </UiIconButton>
            <UiIconButton
              class="ai-conversation-list__action"
              size="sm"
              variant="ghost"
              title="删除对话"
              @click.stop="emit('delete', conversation.id)"
            >
              <IconRenderer icon="iconify:lucide:trash-2" :size="14" />
            </UiIconButton>
          </div>
        </section>
      </template>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.ai-conversation-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
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
    color: var(--ui-text-primary);
    font-size: 1.1rem;
    font-weight: 750;
  }
}

.ai-conversation-list__eyebrow {
  display: block;
  margin-bottom: 2px;
  color: var(--ui-text-muted);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ai-conversation-list__search {
  padding: 10px 12px 0;
}

.ai-conversation-list__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 10px;
  overflow: auto;
}

.ai-conversation-list__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  h2 {
    margin: 4px 4px 2px;
    color: var(--ui-text-muted);
    font-size: 0.72rem;
    font-weight: 720;
  }
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

.ai-conversation-list__pin-icon {
  flex: 0 0 auto;
  color: var(--primary-color);
}

.ai-conversation-list__meta,
.ai-conversation-list__time {
  color: var(--ui-text-muted);
  font-size: 0.76rem;
}

.ai-conversation-list__action {
  opacity: 0;
}

.ai-conversation-list__item:hover .ai-conversation-list__action,
.ai-conversation-list__item:focus-within .ai-conversation-list__action,
.ai-conversation-list__item.is-active .ai-conversation-list__action {
  opacity: 1;
}

.ai-conversation-list__rename-input {
  width: 100%;
}
</style>
