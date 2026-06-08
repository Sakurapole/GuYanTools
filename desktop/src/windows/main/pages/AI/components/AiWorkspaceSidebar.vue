<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { AiAssistantConfig, AiConversation } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiEmptyState from '@/windows/main/components/ui/UiEmptyState.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';

const props = defineProps<{
  assistants: AiAssistantConfig[];
  activeAssistantId: string;
  conversations: AiConversation[];
  activeConversationId: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  createAssistant: [];
  selectAssistant: [assistantId: string];
  configureAssistant: [assistantId: string];
  createConversation: [];
  selectConversation: [conversationId: string];
  renameConversation: [conversationId: string, title: string];
  pinConversation: [conversationId: string, pinned: boolean];
  deleteConversation: [conversationId: string];
}>();

const searchQuery = ref('');
const editingId = ref('');
const editingTitle = ref('');

const activeAssistant = computed(() =>
  props.assistants.find((assistant) => assistant.id === props.activeAssistantId) ?? props.assistants[0],
);

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
    emit('renameConversation', conversation.id, nextTitle);
  }
}

function cancelRename() {
  editingId.value = '';
  editingTitle.value = '';
}

</script>

<template>
  <aside class="ai-workspace-sidebar">
    <section class="ai-workspace-sidebar__section ai-workspace-sidebar__section--roles">
      <header class="ai-workspace-sidebar__section-head">
        <div>
          <span>Assistant</span>
          <h2>角色</h2>
        </div>
        <UiIconButton size="sm" variant="ghost" title="新建角色" @click="emit('createAssistant')">
          <IconRenderer icon="iconify:lucide:plus" :size="15" />
        </UiIconButton>
      </header>

      <div class="ai-workspace-sidebar__role-list">
        <div
          v-for="assistant in assistants"
          :key="assistant.id"
          class="ai-workspace-sidebar__role"
          :class="{ 'is-active': assistant.id === activeAssistant?.id }"
        >
          <UiButton
            class="ai-workspace-sidebar__role-main"
            variant="ghost"
            size="sm"
            block
            :active="assistant.id === activeAssistant?.id"
            @click="emit('selectAssistant', assistant.id)"
          >
            <span class="ai-workspace-sidebar__role-avatar">{{ assistant.emoji }}</span>
            <span class="ai-workspace-sidebar__role-text">
              <strong>{{ assistant.name }}</strong>
              <small>{{ assistant.providerId || '通用 Provider' }}</small>
            </span>
          </UiButton>
          <UiIconButton
            class="ai-workspace-sidebar__role-settings"
            size="sm"
            variant="ghost"
            title="角色设置"
            @click.stop="emit('configureAssistant', assistant.id)"
          >
            <IconRenderer icon="iconify:lucide:settings-2" :size="14" />
          </UiIconButton>
        </div>
      </div>
    </section>

    <section class="ai-workspace-sidebar__section ai-workspace-sidebar__section--topics">
      <header class="ai-workspace-sidebar__section-head">
        <div>
          <span>{{ activeAssistant?.name || '默认助手' }}</span>
          <h2>话题</h2>
        </div>
        <UiButton size="sm" variant="primary" @click="emit('createConversation')">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:plus" :size="14" />
          </template>
          新话题
        </UiButton>
      </header>

      <div class="ai-workspace-sidebar__search">
        <UiInput v-model="searchQuery" size="sm" type="search" placeholder="搜索话题" />
      </div>

      <div class="ai-workspace-sidebar__topic-body">
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
          <section v-if="pinnedConversations.length" class="ai-workspace-sidebar__topic-group">
            <h3>置顶</h3>
            <div
              v-for="conversation in pinnedConversations"
              :key="conversation.id"
              class="ai-workspace-sidebar__topic"
              :class="{ 'is-active': conversation.id === activeConversationId, 'is-pinned': conversation.pinned }"
            >
              <span v-if="editingId === conversation.id" class="ai-workspace-sidebar__topic-main ai-workspace-sidebar__topic-editor">
                <UiInput
                  v-model="editingTitle"
                  class="ai-workspace-sidebar__rename-input"
                  size="sm"
                  @keydown.enter.stop.prevent="commitRename(conversation)"
                  @keydown.esc.stop.prevent="cancelRename"
                  @blur="commitRename(conversation)"
                />
              </span>
              <UiButton
                v-else
                class="ai-workspace-sidebar__topic-main-button"
                variant="ghost"
                size="sm"
                block
                :active="conversation.id === activeConversationId"
                @click="emit('selectConversation', conversation.id)"
              >
                <span class="ai-workspace-sidebar__topic-main">
                  <span class="ai-workspace-sidebar__topic-title" @dblclick.stop="startRename(conversation)">
                  <IconRenderer class="ai-workspace-sidebar__pin-icon" icon="iconify:lucide:pin" :size="12" />
                  {{ conversation.title }}
                  </span>
                  <span class="ai-workspace-sidebar__topic-meta">{{ conversation.providerId }} / {{ conversation.modelId }}</span>
                  <span class="ai-workspace-sidebar__topic-time">{{ formatTime(conversation.updatedAt) }}</span>
                </span>
              </UiButton>
              <UiIconButton class="ai-workspace-sidebar__topic-action" size="sm" variant="ghost" title="取消置顶" @click.stop="emit('pinConversation', conversation.id, false)">
                <IconRenderer icon="iconify:lucide:pin-off" :size="14" />
              </UiIconButton>
              <UiIconButton class="ai-workspace-sidebar__topic-action" size="sm" variant="ghost" title="重命名" @click.stop="startRename(conversation)">
                <IconRenderer icon="iconify:lucide:pencil" :size="14" />
              </UiIconButton>
              <UiIconButton class="ai-workspace-sidebar__topic-action" size="sm" variant="ghost" title="删除话题" @click.stop="emit('deleteConversation', conversation.id)">
                <IconRenderer icon="iconify:lucide:trash-2" :size="14" />
              </UiIconButton>
            </div>
          </section>

          <section v-if="recentConversations.length" class="ai-workspace-sidebar__topic-group">
            <h3>{{ pinnedConversations.length ? '最近' : '最近话题' }}</h3>
            <div
              v-for="conversation in recentConversations"
              :key="conversation.id"
              class="ai-workspace-sidebar__topic"
              :class="{ 'is-active': conversation.id === activeConversationId }"
            >
              <span v-if="editingId === conversation.id" class="ai-workspace-sidebar__topic-main ai-workspace-sidebar__topic-editor">
                <UiInput
                  v-model="editingTitle"
                  class="ai-workspace-sidebar__rename-input"
                  size="sm"
                  @keydown.enter.stop.prevent="commitRename(conversation)"
                  @keydown.esc.stop.prevent="cancelRename"
                  @blur="commitRename(conversation)"
                />
              </span>
              <UiButton
                v-else
                class="ai-workspace-sidebar__topic-main-button"
                variant="ghost"
                size="sm"
                block
                :active="conversation.id === activeConversationId"
                @click="emit('selectConversation', conversation.id)"
              >
                <span class="ai-workspace-sidebar__topic-main">
                  <span class="ai-workspace-sidebar__topic-title" @dblclick.stop="startRename(conversation)">
                    {{ conversation.title }}
                  </span>
                <span class="ai-workspace-sidebar__topic-meta">{{ conversation.providerId }} / {{ conversation.modelId }}</span>
                <span class="ai-workspace-sidebar__topic-time">{{ formatTime(conversation.updatedAt) }}</span>
                </span>
              </UiButton>
              <UiIconButton class="ai-workspace-sidebar__topic-action" size="sm" variant="ghost" title="置顶话题" @click.stop="emit('pinConversation', conversation.id, true)">
                <IconRenderer icon="iconify:lucide:pin" :size="14" />
              </UiIconButton>
              <UiIconButton class="ai-workspace-sidebar__topic-action" size="sm" variant="ghost" title="重命名" @click.stop="startRename(conversation)">
                <IconRenderer icon="iconify:lucide:pencil" :size="14" />
              </UiIconButton>
              <UiIconButton class="ai-workspace-sidebar__topic-action" size="sm" variant="ghost" title="删除话题" @click.stop="emit('deleteConversation', conversation.id)">
                <IconRenderer icon="iconify:lucide:trash-2" :size="14" />
              </UiIconButton>
            </div>
          </section>
        </template>
      </div>
    </section>
  </aside>
</template>

<style lang="scss" scoped>
.ai-workspace-sidebar {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  height: 100%;
  background: var(--ui-surface-base);
}

.ai-workspace-sidebar__section {
  min-width: 0;
}

.ai-workspace-sidebar__section--roles {
  padding: 12px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.ai-workspace-sidebar__section--topics {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
}

.ai-workspace-sidebar__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;

  span {
    display: block;
    margin-bottom: 2px;
    color: var(--ui-text-muted);
    font-size: 0.68rem;
    font-weight: 750;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 1.02rem;
    font-weight: 760;
    line-height: 1.3;
  }
}

.ai-workspace-sidebar__role-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.ai-workspace-sidebar__role {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.ai-workspace-sidebar__role-main.ui-button {
  width: 100%;
  padding: 8px;
  border: var(--ui-border-width-thin) solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-primary);
  text-align: left;
  box-shadow: none;

  &:hover,
  &.ui-button--active {
    border-color: var(--ui-border-subtle);
    background: var(--ui-surface-overlay);
  }

  :deep(.ui-button__label) {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 28px;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }
}

.ai-workspace-sidebar__role-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  font-size: 1.12rem;
}

.ai-workspace-sidebar__role-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 0.88rem;
    font-weight: 700;
  }

  small {
    color: var(--ui-text-muted);
    font-size: 0.74rem;
  }
}

.ai-workspace-sidebar__role-settings,
.ai-workspace-sidebar__topic-action {
  opacity: 0;
}

.ai-workspace-sidebar__role:hover .ai-workspace-sidebar__role-settings,
.ai-workspace-sidebar__role.is-active .ai-workspace-sidebar__role-settings,
.ai-workspace-sidebar__topic:hover .ai-workspace-sidebar__topic-action,
.ai-workspace-sidebar__topic:focus-within .ai-workspace-sidebar__topic-action,
.ai-workspace-sidebar__topic.is-active .ai-workspace-sidebar__topic-action {
  opacity: 1;
}

.ai-workspace-sidebar__section--topics > .ai-workspace-sidebar__section-head {
  padding: 12px 12px 0;
}

.ai-workspace-sidebar__search {
  padding: 10px 12px 0;
}

.ai-workspace-sidebar__topic-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 10px;
  overflow: auto;
}

.ai-workspace-sidebar__topic-group {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;

  h3 {
    margin: 4px 4px 2px;
    color: var(--ui-text-muted);
    font-size: 0.72rem;
    font-weight: 720;
  }
}

.ai-workspace-sidebar__topic {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, 28px);
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.ai-workspace-sidebar__topic-main-button.ui-button {
  justify-content: flex-start;
  min-width: 0;
  min-height: 68px;
  padding: 10px;
  border: var(--ui-border-width-thin) solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-primary);
  text-align: left;
  box-shadow: none;

  &:hover,
  &.ui-button--active {
    border-color: var(--ui-border-subtle);
    background: var(--ui-surface-overlay);
  }

  :deep(.ui-button__label) {
    justify-content: flex-start;
    width: 100%;
    min-width: 0;
  }
}

.ai-workspace-sidebar__topic-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.ai-workspace-sidebar__topic-editor {
  min-height: 68px;
  justify-content: center;
  padding: 10px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.ai-workspace-sidebar__topic-title,
.ai-workspace-sidebar__topic-meta,
.ai-workspace-sidebar__topic-time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-workspace-sidebar__topic-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.88rem;
  font-weight: 650;
}

.ai-workspace-sidebar__pin-icon {
  flex: 0 0 auto;
  color: var(--primary-color);
}

.ai-workspace-sidebar__topic-meta,
.ai-workspace-sidebar__topic-time {
  color: var(--ui-text-muted);
  font-size: 0.74rem;
}

.ai-workspace-sidebar__rename-input {
  width: 100%;
}
</style>
