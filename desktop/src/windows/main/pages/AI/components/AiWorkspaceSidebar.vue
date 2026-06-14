<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { AiAssistantConfig, AiConversation, AiSafeProviderConfig } from '@/contracts/ai';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiEmptyState from '@/windows/main/components/ui/UiEmptyState.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiTabs, { type UiTabItem } from '@/windows/main/components/ui/UiTabs.vue';

const props = withDefaults(defineProps<{
  assistants: AiAssistantConfig[];
  activeAssistantId: string;
  conversations: AiConversation[];
  activeConversationId: string;
  providers: AiSafeProviderConfig[];
  loading?: boolean;
  collapsed?: boolean;
}>(), {
  loading: false,
  collapsed: false,
});

const emit = defineEmits<{
  'update:collapsed': [value: boolean];
  createAssistant: [];
  selectAssistant: [assistantId: string];
  configureAssistant: [assistantId: string];
  createConversation: [];
  selectConversation: [conversationId: string];
  renameConversation: [conversationId: string, title: string];
  pinConversation: [conversationId: string, pinned: boolean];
  deleteConversation: [conversationId: string];
}>();

type SidebarTab = 'conversations' | 'assistants';

const activeTab = ref<SidebarTab>('assistants');
const searchQuery = ref('');
const renamingConversationId = ref('');
const renameDraft = ref('');

const tabs: UiTabItem[] = [
  { key: 'assistants', label: '角色' },
  { key: 'conversations', label: '会话' },
];

const filteredConversations = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const conversations = [...props.conversations].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });

  if (!query) {
    return conversations;
  }

  return conversations.filter((conversation) => {
    const modelLabel = conversationModelLabel(conversation).toLowerCase();
    return conversation.title.toLowerCase().includes(query) || modelLabel.includes(query);
  });
});

const visibleCollapsedConversations = computed(() => filteredConversations.value.slice(0, 12));

function providerLabel(providerId: string) {
  return props.providers.find((provider) => provider.id === providerId)?.name || providerId || 'Provider';
}

function conversationModelLabel(conversation: AiConversation) {
  const provider = props.providers.find((item) => item.id === conversation.providerId);
  const model = provider?.models.find((item) => item.id === conversation.modelId || item.providerModelId === conversation.modelId);
  const modelName = model?.displayName || conversation.modelId || 'Model';
  return `${provider?.name || conversation.providerId || 'Provider'} / ${modelName}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  const now = Date.now();
  const diffDays = Math.floor((now - date.getTime()) / 86400000);
  if (diffDays <= 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function topicInitial(conversation: AiConversation) {
  return (conversation.title.trim().charAt(0) || '话').toUpperCase();
}

function startRename(conversation: AiConversation) {
  renamingConversationId.value = conversation.id;
  renameDraft.value = conversation.title;
}

function commitRename(conversation: AiConversation) {
  const title = renameDraft.value.trim();
  renamingConversationId.value = '';
  renameDraft.value = '';
  if (title && title !== conversation.title) {
    emit('renameConversation', conversation.id, title);
  }
}

function cancelRename() {
  renamingConversationId.value = '';
  renameDraft.value = '';
}

function setCollapsed(value: boolean) {
  emit('update:collapsed', value);
}

function selectAssistantAndShowTopics(assistantId: string) {
  emit('selectAssistant', assistantId);
  activeTab.value = 'conversations';
}
</script>

<template>
  <aside class="ai-workspace-sidebar" :class="{ 'ai-workspace-sidebar--collapsed': collapsed }">
    <template v-if="collapsed">
      <div class="ai-workspace-sidebar__collapsed-head">
        <UiIconButton size="sm" variant="secondary" title="展开侧栏" @click="setCollapsed(false)">
          <IconRenderer icon="iconify:lucide:panel-left-open" :size="16" />
        </UiIconButton>
        <UiIconButton size="sm" variant="primary" title="新建话题" @click="emit('createConversation')">
          <IconRenderer icon="iconify:lucide:plus" :size="15" />
        </UiIconButton>
      </div>

      <div class="ai-workspace-sidebar__collapsed-tabs" role="tablist" aria-label="AI 侧栏">
        <UiIconButton
          size="sm"
          :active="activeTab === 'assistants'"
          title="角色"
          @click="activeTab = 'assistants'"
        >
          <IconRenderer icon="iconify:lucide:bot" :size="15" />
        </UiIconButton>
        <UiIconButton
          size="sm"
          :active="activeTab === 'conversations'"
          title="会话"
          @click="activeTab = 'conversations'"
        >
          <IconRenderer icon="iconify:lucide:messages-square" :size="15" />
        </UiIconButton>
      </div>

      <div v-if="activeTab === 'conversations'" class="ai-workspace-sidebar__mini-list">
        <button
          v-for="conversation in visibleCollapsedConversations"
          :key="conversation.id"
          type="button"
          class="ai-workspace-sidebar__mini-topic"
          :class="{ 'is-active': conversation.id === activeConversationId }"
          :title="`${conversation.title}\n${conversationModelLabel(conversation)}`"
          @click="emit('selectConversation', conversation.id)"
        >
          <span class="ai-workspace-sidebar__mini-topic-initial">{{ topicInitial(conversation) }}</span>
          <span v-if="conversation.pinned" class="ai-workspace-sidebar__mini-topic-pin" aria-hidden="true" />
        </button>
      </div>

      <div v-else class="ai-workspace-sidebar__mini-list">
        <button
          v-for="assistant in assistants"
          :key="assistant.id"
          type="button"
          class="ai-workspace-sidebar__mini-topic"
          :class="{ 'is-active': assistant.id === activeAssistantId }"
          :title="assistant.name"
          @click="selectAssistantAndShowTopics(assistant.id)"
        >
          <span class="ai-workspace-sidebar__mini-topic-initial">{{ assistant.emoji || assistant.name.charAt(0) || '助' }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <header class="ai-workspace-sidebar__header">
        <div class="ai-workspace-sidebar__title">
          <span>AI</span>
          <strong>{{ activeTab === 'conversations' ? '会话' : '角色' }}</strong>
        </div>
        <UiIconButton size="sm" variant="ghost" title="收起侧栏" @click="setCollapsed(true)">
          <IconRenderer icon="iconify:lucide:panel-left-close" :size="16" />
        </UiIconButton>
      </header>

      <div class="ai-workspace-sidebar__tabs">
        <UiTabs
          v-model="activeTab"
          :items="tabs"
          variant="segmented"
          size="sm"
          stretch
        />
      </div>

      <section v-if="activeTab === 'conversations'" class="ai-workspace-sidebar__pane">
        <div class="ai-workspace-sidebar__toolbar">
          <UiButton size="sm" variant="primary" @click="emit('createConversation')">新话题</UiButton>
          <UiInput v-model="searchQuery" size="sm" placeholder="搜索话题或模型" />
        </div>

        <UiEmptyState
          v-if="!loading && filteredConversations.length === 0"
          compact
          icon="lucide:messages-square"
          title="暂无话题"
          description="新建话题后会显示在这里。"
        />

        <div v-else class="ai-workspace-sidebar__topic-list">
          <article
            v-for="conversation in filteredConversations"
            :key="conversation.id"
            class="ai-workspace-sidebar__topic-card"
            :class="{ 'is-active': conversation.id === activeConversationId }"
            @click="emit('selectConversation', conversation.id)"
          >
            <div class="ai-workspace-sidebar__topic-main">
              <UiInput
                v-if="renamingConversationId === conversation.id"
                v-model="renameDraft"
                class="ai-workspace-sidebar__rename"
                size="sm"
                @click.stop
                @keydown.enter.prevent="commitRename(conversation)"
                @keydown.esc.prevent="cancelRename"
                @blur="commitRename(conversation)"
              />
              <h3 v-else>{{ conversation.title }}</h3>
            </div>

            <div class="ai-workspace-sidebar__topic-actions" @click.stop>
              <UiIconButton
                size="sm"
                variant="ghost"
                :title="conversation.pinned ? '取消置顶' : '置顶'"
                :active="conversation.pinned"
                @click="emit('pinConversation', conversation.id, !conversation.pinned)"
              >
                <IconRenderer icon="iconify:lucide:pin" :size="14" />
              </UiIconButton>
              <UiIconButton size="sm" variant="ghost" title="重命名" @click="startRename(conversation)">
                <IconRenderer icon="iconify:lucide:pencil" :size="14" />
              </UiIconButton>
              <UiIconButton size="sm" variant="danger" title="删除" @click="emit('deleteConversation', conversation.id)">
                <IconRenderer icon="iconify:lucide:trash-2" :size="14" />
              </UiIconButton>
            </div>
          </article>
        </div>
      </section>

      <section v-else class="ai-workspace-sidebar__pane">
        <div class="ai-workspace-sidebar__toolbar">
          <UiButton size="sm" variant="primary" @click="emit('createAssistant')">新角色</UiButton>
        </div>

        <div class="ai-workspace-sidebar__assistant-list">
          <article
            v-for="assistant in assistants"
            :key="assistant.id"
            class="ai-workspace-sidebar__assistant-card"
            :class="{ 'is-active': assistant.id === activeAssistantId }"
            @click="selectAssistantAndShowTopics(assistant.id)"
          >
            <span class="ai-workspace-sidebar__assistant-emoji">{{ assistant.emoji || '助' }}</span>
            <div class="ai-workspace-sidebar__assistant-main">
              <h3>{{ assistant.name }}</h3>
              <p>{{ assistant.providerId ? providerLabel(assistant.providerId) : '跟随默认模型' }}</p>
            </div>
            <UiIconButton size="sm" variant="ghost" title="设置角色" @click.stop="emit('configureAssistant', assistant.id)">
              <IconRenderer icon="iconify:lucide:settings" :size="14" />
            </UiIconButton>
          </article>
        </div>
      </section>
    </template>
  </aside>
</template>

<style lang="scss">
.ai-chat-shell .ai-workspace-sidebar,
.ai-workspace-sidebar {
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  height: 100%;
  border-right: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.1));
  background: var(--ui-surface-base, #f8fbfd);
  color: var(--ui-text-primary, #0f172a);
  font-family: var(--ui-font-family, inherit);
  overflow: hidden;
}

.ai-workspace-sidebar *,
.ai-workspace-sidebar *::before,
.ai-workspace-sidebar *::after {
  box-sizing: border-box;
}

.ai-workspace-sidebar--collapsed {
  grid-template-rows: auto auto minmax(0, 1fr);
  align-items: start;
  justify-items: center;
  padding: 8px 7px;
}

.ai-workspace-sidebar__header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 54px;
  padding: 10px 10px 8px 12px;
  border-bottom: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.08));
}

.ai-workspace-sidebar__title {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.ai-workspace-sidebar__title span {
  color: var(--ui-text-muted, #64748b);
  font-size: 0.7rem;
  font-weight: 760;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ai-workspace-sidebar__title strong {
  display: block;
  overflow: hidden;
  color: var(--ui-text-primary, #0f172a);
  font-size: 1rem;
  font-weight: 780;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-workspace-sidebar__tabs {
  padding: 8px 10px 10px;
  border-bottom: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.08));
}

.ai-workspace-sidebar__pane {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 9px;
  padding: 10px;
  overflow: hidden;
}

.ai-workspace-sidebar__toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  flex: 0 0 auto;
}

.ai-workspace-sidebar__assistant-list,
.ai-workspace-sidebar__topic-list {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 7px;
  overflow: auto;
  padding-right: 2px;
}

.ai-workspace-sidebar__topic-card {
  appearance: none;
  position: relative;
  display: block;
  min-width: 0;
  min-height: 34px;
  padding: 7px 10px;
  border: var(--ui-border-width-thin, 1px) solid rgba(14, 165, 233, 0.18);
  border-radius: var(--ui-radius-sm, 6px);
  background: color-mix(in srgb, var(--ui-color-primary, #0ea5e9) 16%, transparent);
  box-shadow: none;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.ai-workspace-sidebar__topic-card:hover,
.ai-workspace-sidebar__topic-card.is-active,
.ai-workspace-sidebar__assistant-card:hover,
.ai-workspace-sidebar__assistant-card.is-active {
  border-color: var(--ui-color-primary-border, rgba(14, 165, 233, 0.34));
  background: var(--ui-color-primary-soft, rgba(224, 242, 254, 0.66));
}

.ai-workspace-sidebar__topic-card.is-active,
.ai-workspace-sidebar__assistant-card.is-active {
  box-shadow:
    inset 3px 0 0 var(--ui-color-primary, #0ea5e9),
    0 1px 2px rgba(15, 23, 42, 0.04);
}

.ai-workspace-sidebar__topic-main {
  min-width: 0;
  padding-right: 76px;
}

.ai-workspace-sidebar__topic-main h3,
.ai-workspace-sidebar__assistant-main h3 {
  display: block;
  margin: 0;
  overflow: hidden;
  color: var(--ui-text-primary, #0f172a);
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 720;
  line-height: 1.35;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-workspace-sidebar__topic-main p,
.ai-workspace-sidebar__assistant-main p {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--ui-text-secondary, #475569);
  font-family: inherit;
  font-size: 0.76rem;
  line-height: 1.35;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-workspace-sidebar__topic-main span {
  display: block;
  margin-top: 4px;
  color: var(--ui-text-muted, #64748b);
  font-family: inherit;
  font-size: 0.72rem;
  line-height: 1.2;
  letter-spacing: 0;
}

.ai-workspace-sidebar__topic-actions {
  position: absolute;
  top: 50%;
  right: 5px;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding-left: 10px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ui-color-primary, #0ea5e9) 16%, var(--ui-surface-base, #f8fbfd)) 28%);
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 0.16s ease;
}

.ai-workspace-sidebar__topic-card:hover .ai-workspace-sidebar__topic-actions,
.ai-workspace-sidebar__topic-card.is-active .ai-workspace-sidebar__topic-actions {
  opacity: 1;
}

.ai-workspace-sidebar__rename {
  width: 100%;
}

.ai-workspace-sidebar__assistant-card {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 9px;
  border: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.1));
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-surface-overlay, #fff);
  cursor: pointer;
}

.ai-workspace-sidebar__assistant-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-surface-muted, #eaf4fb);
  font-size: 1rem;
  line-height: 1;
}

.ai-workspace-sidebar__assistant-main {
  min-width: 0;
}

.ai-workspace-sidebar__collapsed-head,
.ai-workspace-sidebar__collapsed-tabs,
.ai-workspace-sidebar__mini-list {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 7px;
}

.ai-workspace-sidebar__collapsed-head {
  margin-bottom: 8px;
}

.ai-workspace-sidebar__collapsed-tabs {
  padding: 7px 0;
  border-top: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.1));
  border-bottom: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.1));
}

.ai-workspace-sidebar__mini-list {
  width: 100%;
  min-height: 0;
  margin-top: 8px;
  overflow: auto;
}

.ai-workspace-sidebar__mini-topic {
  appearance: none;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, rgba(15, 23, 42, 0.1));
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-surface-overlay, #fff);
  color: var(--ui-text-primary, #0f172a);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.ai-workspace-sidebar__mini-topic:hover,
.ai-workspace-sidebar__mini-topic.is-active {
  border-color: var(--ui-color-primary-border, rgba(14, 165, 233, 0.34));
  background: var(--ui-color-primary-soft, rgba(224, 242, 254, 0.66));
}

.ai-workspace-sidebar__mini-topic.is-active {
  box-shadow: inset 0 -3px 0 var(--ui-color-primary, #0ea5e9);
}

.ai-workspace-sidebar__mini-topic-initial {
  max-width: 30px;
  overflow: hidden;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 760;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-workspace-sidebar__mini-topic-pin {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 6px;
  height: 6px;
  border-radius: var(--ui-radius-full, 999px);
  background: var(--ui-color-primary, #0ea5e9);
}
</style>
