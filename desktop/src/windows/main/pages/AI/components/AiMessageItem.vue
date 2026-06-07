<script lang="ts" setup>
import { computed, ref } from 'vue';
import { marked } from 'marked';
import type { AiChatMessage } from '@/contracts/ai';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import Svgicon from '@/windows/main/components/svgs/svgicon.vue';
import { sanitizeKnowledgeMarkdownHtml } from '@/windows/main/pages/Knowledge/utils/markdown_sanitize';

const props = defineProps<{
  message: AiChatMessage;
  canRegenerate?: boolean;
}>();

const emit = defineEmits<{
  regenerate: [messageId: string];
}>();

const copied = ref(false);

const reasoningContent = computed(() => {
  const reasoning = props.message.metadata?.reasoning;
  if (!reasoning || typeof reasoning !== 'object') {
    return '';
  }

  const content = (reasoning as Record<string, unknown>).content;
  return typeof content === 'string' ? content.trim() : '';
});

const renderedContent = computed(() => {
  if (props.message.role !== 'assistant' || !props.message.content) {
    return '';
  }

  const rendered = marked.parse(props.message.content, {
    async: false,
    breaks: false,
    gfm: true,
  }) as string;
  return sanitizeKnowledgeMarkdownHtml(rendered);
});

async function copyMessage() {
  if (!props.message.content) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(props.message.content);
    } else {
      await window.shellApi.writeClipboardText(props.message.content);
    }
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1200);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <article class="ai-message-item" :class="`ai-message-item--${message.role}`">
    <div class="ai-message-item__avatar">
      {{ message.role === 'assistant' ? 'AI' : message.role === 'system' ? 'S' : 'U' }}
    </div>
    <div class="ai-message-item__body">
      <div class="ai-message-item__meta">
        <span>{{ message.role === 'assistant' ? 'Assistant' : message.role === 'system' ? 'System' : 'You' }}</span>
        <span v-if="message.status !== 'complete'" class="ai-message-item__status">{{ message.status }}</span>
        <span v-if="copied" class="ai-message-item__status">已复制</span>
      </div>
      <div
        v-if="message.role === 'assistant' && renderedContent"
        class="ai-message-item__content markdown-body"
        v-html="renderedContent"
      />
      <p v-else class="ai-message-item__content">
        {{ message.content || (message.status === 'streaming' ? '正在生成...' : '') }}
      </p>
      <details v-if="reasoningContent" class="ai-message-item__reasoning">
        <summary>思考过程</summary>
        <p>{{ reasoningContent }}</p>
      </details>
      <div class="ai-message-item__actions">
        <UiIconButton
          size="sm"
          variant="ghost"
          title="复制消息"
          :disabled="!message.content"
          @click="copyMessage"
        >
          <Svgicon width="14" height="14" viewBox="0 0 24 24">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
          </Svgicon>
        </UiIconButton>
        <UiIconButton
          v-if="message.role === 'assistant'"
          size="sm"
          variant="ghost"
          title="重新生成"
          :disabled="!canRegenerate || message.status === 'streaming'"
          @click="emit('regenerate', message.id)"
        >
          <Svgicon width="14" height="14" viewBox="0 0 24 24">
            <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.65 0 3.14.67 4.22 1.76L13 11h8V3l-3.35 3.35z" />
          </Svgicon>
        </UiIconButton>
      </div>
      <div v-if="message.tokenUsage?.totalTokens" class="ai-message-item__usage">
        {{ message.tokenUsage.totalTokens }} tokens
      </div>
      <div v-if="message.citations?.length" class="ai-message-item__citations">
        <div class="ai-message-item__citations-title">引用来源</div>
        <a
          v-for="(citation, index) in message.citations"
          :key="citation.id"
          class="ai-message-item__citation"
          :href="citation.url || undefined"
          target="_blank"
          rel="noreferrer noopener"
        >
          <span class="ai-message-item__citation-index">[{{ index + 1 }}]</span>
          <span class="ai-message-item__citation-body">
            <span class="ai-message-item__citation-title">{{ citation.title }}</span>
            <span v-if="citation.snippet" class="ai-message-item__citation-snippet">{{ citation.snippet }}</span>
            <span v-else-if="citation.sourceId" class="ai-message-item__citation-snippet">{{ citation.sourceId }}</span>
          </span>
        </a>
      </div>
    </div>
  </article>
</template>

<style lang="scss" scoped>
.ai-message-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  max-width: 860px;
  width: 100%;
}

.ai-message-item--user {
  margin-left: auto;
}

.ai-message-item__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
  color: var(--ui-text-muted);
  font-size: 0.72rem;
  font-weight: 750;
}

.ai-message-item--assistant .ai-message-item__avatar {
  background: var(--primary-color);
  color: var(--ui-button-primary-text);
}

.ai-message-item__body {
  min-width: 0;
  padding: 10px 12px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-base);
}

.ai-message-item--user .ai-message-item__body {
  background: var(--ui-surface-overlay);
}

.ai-message-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--ui-text-muted);
  font-size: 0.76rem;
  font-weight: 650;
}

.ai-message-item__status {
  padding: 1px 6px;
  border-radius: var(--ui-radius-full);
  background: var(--ui-surface-muted);
}

.ai-message-item__content {
  margin: 0;
  color: var(--ui-text-primary);
  font-size: 0.94rem;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ai-message-item__reasoning {
  margin-top: 10px;
  padding: 8px 10px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  line-height: 1.55;

  summary {
    cursor: pointer;
    color: var(--ui-text-secondary);
    font-weight: 650;
  }

  p {
    margin: 8px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

.markdown-body {
  white-space: normal;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote),
.markdown-body :deep(pre),
.markdown-body :deep(table) {
  margin: 0 0 10px;
}

.markdown-body :deep(p:last-child),
.markdown-body :deep(ul:last-child),
.markdown-body :deep(ol:last-child),
.markdown-body :deep(blockquote:last-child),
.markdown-body :deep(pre:last-child),
.markdown-body :deep(table:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(code) {
  padding: 2px 5px;
  border-radius: calc(var(--ui-radius-sm) - 2px);
  background: var(--ui-surface-muted);
  font-family: var(--ui-font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 0.86em;
}

.markdown-body :deep(pre) {
  max-width: 100%;
  padding: 10px 12px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  overflow: auto;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-body :deep(blockquote) {
  padding-left: 10px;
  border-left: 3px solid var(--ui-border-strong);
  color: var(--ui-text-muted);
}

.markdown-body :deep(table) {
  display: block;
  max-width: 100%;
  border-collapse: collapse;
  overflow: auto;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 6px 8px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.ai-message-item__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  opacity: 0;
}

.ai-message-item:hover .ai-message-item__actions {
  opacity: 1;
}

.ai-message-item__usage {
  margin-top: 8px;
  color: var(--ui-text-muted);
  font-size: 0.74rem;
}

.ai-message-item__citations {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.ai-message-item__citations-title {
  color: var(--ui-text-muted);
  font-size: 0.74rem;
  font-weight: 700;
}

.ai-message-item__citation {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px;
  color: var(--ui-text-primary);
  text-decoration: none;

  &:hover .ai-message-item__citation-title {
    color: var(--primary-color);
  }
}

.ai-message-item__citation-index {
  color: var(--primary-color);
  font-size: 0.76rem;
  font-weight: 750;
}

.ai-message-item__citation-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.ai-message-item__citation-title,
.ai-message-item__citation-snippet {
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-message-item__citation-title {
  white-space: nowrap;
  font-size: 0.8rem;
  font-weight: 650;
}

.ai-message-item__citation-snippet {
  display: -webkit-box;
  color: var(--ui-text-muted);
  font-size: 0.74rem;
  line-height: 1.45;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
