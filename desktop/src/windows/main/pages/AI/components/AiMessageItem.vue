<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { marked } from 'marked';
import { cssLanguage } from '@codemirror/lang-css';
import { htmlLanguage } from '@codemirror/lang-html';
import { javascriptLanguage, jsxLanguage, tsxLanguage, typescriptLanguage } from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { pythonLanguage } from '@codemirror/lang-python';
import { rustLanguage } from '@codemirror/lang-rust';
import { sql } from '@codemirror/lang-sql';
import { xmlLanguage } from '@codemirror/lang-xml';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import type { AiChatMessage, AiChatMessageError } from '@/contracts/ai';
import UiDisclosure from '@/windows/main/components/ui/UiDisclosure.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiLink from '@/windows/main/components/ui/UiLink.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import { sanitizeKnowledgeMarkdownHtml } from '@/windows/main/pages/Knowledge/utils/markdown_sanitize';

const props = defineProps<{
  message: AiChatMessage;
  canRegenerate?: boolean;
  userAvatar?: string;
  assistantAvatar?: string;
  assistantName?: string;
}>();

const emit = defineEmits<{
  regenerate: [messageId: string];
  remember: [messageId: string];
}>();

const copied = ref(false);
const renderedContent = ref('');
const STREAM_MARKDOWN_RENDER_INTERVAL = 40;
let markdownRenderTimer: number | null = null;

const codeLanguageParsers = {
  javascript: javascriptLanguage.parser,
  js: javascriptLanguage.parser,
  jsx: jsxLanguage.parser,
  typescript: typescriptLanguage.parser,
  ts: typescriptLanguage.parser,
  tsx: tsxLanguage.parser,
  json: jsonLanguage.parser,
  html: htmlLanguage.parser,
  vue: htmlLanguage.parser,
  css: cssLanguage.parser,
  scss: cssLanguage.parser,
  sass: cssLanguage.parser,
  less: cssLanguage.parser,
  python: pythonLanguage.parser,
  py: pythonLanguage.parser,
  rust: rustLanguage.parser,
  rs: rustLanguage.parser,
  sql: sql().language.parser,
  xml: xmlLanguage.parser,
  svg: xmlLanguage.parser,
  markdown: markdownLanguage.parser,
  md: markdownLanguage.parser,
} as const;

const avatarLabel = computed(() => {
  if (props.message.role === 'assistant') return props.assistantAvatar?.trim() || '助';
  if (props.message.role === 'system') return '系';
  return props.userAvatar?.trim() || '你';
});

const authorLabel = computed(() => {
  if (props.message.role === 'assistant') return props.assistantName?.trim() || '助手';
  if (props.message.role === 'system') return '系统';
  return '你';
});

const messageError = computed<AiChatMessageError | undefined>(() => {
  const value = props.message.metadata?.error;
  if (!value || typeof value !== 'object' || typeof (value as Record<string, unknown>).message !== 'string') {
    return undefined;
  }
  return value as AiChatMessageError;
});

function statusLabel(status: AiChatMessage['status']) {
  if (status === 'streaming') return '生成中';
  if (status === 'error') return '失败';
  if (status === 'aborted') return '已停止';
  if (status === 'pending') return '等待中';
  return status;
}

const reasoningContent = computed(() => {
  const reasoning = props.message.metadata?.reasoning;
  if (!reasoning || typeof reasoning !== 'object') {
    return '';
  }

  const content = (reasoning as Record<string, unknown>).content;
  return typeof content === 'string' ? content.trim() : '';
});

function renderMarkdown(content: string) {
  try {
    const rendered = marked.parse(content, {
      async: false,
      breaks: false,
      gfm: true,
    }) as string;
    renderedContent.value = decorateMarkdownHtml(sanitizeKnowledgeMarkdownHtml(rendered));
  } catch {
    renderedContent.value = '';
  }
}

function decorateMarkdownHtml(html: string) {
  if (typeof DOMParser === 'undefined') {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    const languageClass = [...(code?.classList ?? [])].find((className) => className.startsWith('language-'));
    const language = languageClass?.slice('language-'.length).replace(/[-_]/g, ' ') || '代码';
    const parent = pre.parentNode;
    if (!parent) {
      return;
    }

    const wrapper = doc.createElement('section');
    wrapper.className = 'ai-markdown-code-block';
    const header = doc.createElement('header');
    header.className = 'ai-markdown-code-block__header';
    const label = doc.createElement('span');
    label.className = 'ai-markdown-code-block__language';
    label.textContent = language;
    const copyButton = doc.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'ai-markdown-code-block__copy';
    copyButton.dataset.aiCodeCopy = '';
    copyButton.setAttribute('aria-label', '复制代码');
    copyButton.textContent = '复制';
    header.append(label, copyButton);
    decorateCodeTokens(code, language);
    parent.replaceChild(wrapper, pre);
    wrapper.append(header, pre);
  });

  doc.body.querySelectorAll('table').forEach((table) => {
    const parent = table.parentNode;
    if (!parent || table.parentElement?.classList.contains('ai-markdown-table-scroll')) {
      return;
    }
    const wrapper = doc.createElement('div');
    wrapper.className = 'ai-markdown-table-scroll';
    parent.replaceChild(wrapper, table);
    wrapper.append(table);
  });

  return doc.body.innerHTML;
}

function decorateCodeTokens(code: Element | null, language: string) {
  const parser = codeLanguageParsers[language.toLowerCase() as keyof typeof codeLanguageParsers];
  const source = code?.textContent;
  if (!code || !parser || source === null) {
    return;
  }

  const fragment = document.createDocumentFragment();
  let cursor = 0;
  highlightTree(parser.parse(source), classHighlighter, (from, to, classes) => {
    if (from > cursor) {
      fragment.append(document.createTextNode(source.slice(cursor, from)));
    }
    const token = document.createElement('span');
    token.className = classes;
    token.textContent = source.slice(from, to);
    fragment.append(token);
    cursor = to;
  });
  if (cursor < source.length) {
    fragment.append(document.createTextNode(source.slice(cursor)));
  }
  code.replaceChildren(fragment);
}

function clearMarkdownRenderTimer() {
  if (markdownRenderTimer !== null) {
    window.clearTimeout(markdownRenderTimer);
    markdownRenderTimer = null;
  }
}

watch(
  () => [props.message.role, props.message.content, props.message.status] as const,
  ([role, content, status]) => {
    if (role !== 'assistant' || !content) {
      clearMarkdownRenderTimer();
      renderedContent.value = '';
      return;
    }
    if (status === 'streaming') {
      if (markdownRenderTimer === null) {
        markdownRenderTimer = window.setTimeout(() => {
          markdownRenderTimer = null;
          renderMarkdown(props.message.content);
        }, STREAM_MARKDOWN_RENDER_INTERVAL);
      }
      return;
    }
    clearMarkdownRenderTimer();
    renderMarkdown(content);
  },
  { immediate: true },
);

onBeforeUnmount(clearMarkdownRenderTimer);

async function copyMessage() {
  if (!props.message.content) {
    return;
  }

  try {
    await writeClipboardText(props.message.content);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1200);
  } catch {
    copied.value = false;
  }
}

async function handleMarkdownClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const copyButton = target.closest<HTMLButtonElement>('[data-ai-code-copy]');
  if (!copyButton) {
    return;
  }

  const code = copyButton.closest('.ai-markdown-code-block')?.querySelector('pre code')?.textContent;
  if (!code?.trim()) {
    return;
  }

  try {
    await writeClipboardText(code);
    copyButton.textContent = '已复制';
    window.setTimeout(() => {
      copyButton.textContent = '复制';
    }, 1200);
  } catch {
    copyButton.textContent = '失败';
    window.setTimeout(() => {
      copyButton.textContent = '复制';
    }, 1200);
  }
}

async function writeClipboardText(content: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }
  await window.shellApi.writeClipboardText(content);
}
</script>

<template>
  <article
    class="ai-message-item"
    :class="[`ai-message-item--${message.role}`, { 'ai-message-item--error': message.status === 'error' }]"
    :data-message-id="message.id"
  >
    <div class="ai-message-item__avatar" :title="`${authorLabel}头像`" aria-hidden="true">
      {{ avatarLabel }}
    </div>
    <div class="ai-message-item__body">
      <div
        v-if="message.role !== 'user' || message.status !== 'complete' || copied"
        class="ai-message-item__meta"
      >
        <span v-if="message.role !== 'user'">{{ authorLabel }}</span>
        <span v-if="message.status !== 'complete'" class="ai-message-item__status">{{ statusLabel(message.status) }}</span>
        <span v-if="copied" class="ai-message-item__status">已复制</span>
      </div>
      <UiDisclosure
        v-if="reasoningContent"
        class="ai-message-item__reasoning"
        title="思考过程"
        :open="message.status === 'streaming'"
      >
        <p>{{ reasoningContent }}</p>
      </UiDisclosure>
      <div v-if="message.role === 'assistant' && message.status === 'error'" class="ai-message-item__error" role="alert">
        <IconRenderer icon="iconify:lucide:circle-alert" :size="16" />
        <div class="ai-message-item__error-body">
          <strong>请求失败</strong>
          <p>{{ messageError?.message || message.content || 'AI 请求失败，请稍后重试。' }}</p>
          <p v-if="messageError?.detail" class="ai-message-item__error-detail">{{ messageError.detail }}</p>
          <div v-if="messageError?.statusCode || messageError?.code || messageError?.providerId || messageError?.modelId" class="ai-message-item__error-meta">
            <span v-if="messageError?.statusCode">HTTP {{ messageError.statusCode }}</span>
            <span v-if="messageError?.code">错误码: {{ messageError.code }}</span>
            <span v-if="messageError?.providerId">Provider: {{ messageError.providerId }}</span>
            <span v-if="messageError?.modelId">模型: {{ messageError.modelId }}</span>
          </div>
          <UiButton
            v-if="canRegenerate"
            class="ai-message-item__retry"
            size="sm"
            variant="secondary"
            :disabled="message.status === 'streaming'"
            @click="emit('regenerate', message.id)"
          >
            <template #prefix><IconRenderer icon="iconify:lucide:rotate-ccw" :size="14" /></template>
            重新生成
          </UiButton>
        </div>
      </div>
      <div
        v-if="message.role === 'assistant' && renderedContent"
        class="ai-message-item__content markdown-body"
        v-html="renderedContent"
        @click="handleMarkdownClick"
      />
      <p v-else-if="message.status !== 'error'" class="ai-message-item__content">
        {{ message.content || (message.status === 'streaming' ? '正在生成...' : '') }}
      </p>
      <div class="ai-message-item__actions">
        <UiIconButton
          size="sm"
          variant="ghost"
          title="复制消息"
          :disabled="!message.content"
          @click="copyMessage"
        >
          <IconRenderer icon="iconify:lucide:copy" :size="14" />
        </UiIconButton>
        <UiIconButton
          v-if="message.role === 'assistant'"
          size="sm"
          variant="ghost"
          title="重新生成"
          :disabled="!canRegenerate || message.status === 'streaming'"
          @click="emit('regenerate', message.id)"
        >
          <IconRenderer icon="iconify:lucide:rotate-ccw" :size="14" />
        </UiIconButton>
        <UiIconButton
          size="sm"
          variant="ghost"
          title="记住这条"
          :disabled="!message.content || message.status === 'streaming'"
          @click="emit('remember', message.id)"
        >
          <IconRenderer icon="iconify:lucide:brain" :size="14" />
        </UiIconButton>
      </div>
      <div v-if="message.tokenUsage?.totalTokens" class="ai-message-item__usage">
        {{ message.tokenUsage.totalTokens }} tokens
      </div>
      <div v-if="message.citations?.length" class="ai-message-item__citations">
        <div class="ai-message-item__citations-title">引用来源</div>
        <UiLink
          v-for="(citation, index) in message.citations"
          :key="citation.id"
          class="ai-message-item__citation"
          :href="citation.url"
          target="_blank"
          rel="noreferrer noopener"
        >
          <span class="ai-message-item__citation-index">[{{ index + 1 }}]</span>
          <span class="ai-message-item__citation-body">
            <span class="ai-message-item__citation-title">{{ citation.title }}</span>
            <span v-if="citation.snippet" class="ai-message-item__citation-snippet">{{ citation.snippet }}</span>
            <span v-else-if="citation.sourceId" class="ai-message-item__citation-snippet">{{ citation.sourceId }}</span>
          </span>
        </UiLink>
      </div>
    </div>
  </article>
</template>

<style lang="scss" scoped>
.ai-message-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  grid-template-areas: 'avatar body';
  gap: 10px;
  max-width: 860px;
  width: 100%;
}

.ai-message-item--user {
  grid-template-columns: minmax(0, auto) 32px;
  grid-template-areas: 'body avatar';
  align-self: flex-end;
  width: fit-content;
  max-width: min(860px, 100%);
  margin-left: auto;
  margin-bottom: 28px;
}

.ai-message-item__avatar {
  grid-area: avatar;
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
  line-height: 1;
  overflow: hidden;
  white-space: nowrap;
}

.ai-message-item--assistant .ai-message-item__avatar {
  background: var(--ui-surface-overlay);
  color: var(--primary-color);
}

.ai-message-item__body {
  grid-area: body;
  min-width: 0;
  padding: 10px 12px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-base);
}

.ai-message-item--user .ai-message-item__body {
  position: relative;
  justify-self: end;
  width: fit-content;
  max-width: 100%;
  background: var(--ui-surface-overlay);
}

.ai-message-item--user .ai-message-item__meta {
  justify-content: flex-end;
}

.ai-message-item--assistant .ai-message-item__body {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
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
  user-select: text;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ai-message-item__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border: var(--ui-border-width-thin) solid var(--ui-state-error);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-state-error-subtle);
  color: var(--ui-state-error);
}

.ai-message-item__error-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 4px;

  strong {
    font-size: 0.84rem;
    font-weight: 750;
  }

  p {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 0.88rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
}

.ai-message-item__error-detail {
  color: var(--ui-text-muted) !important;
  font-size: 0.8rem !important;
}

.ai-message-item__error-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  color: var(--ui-text-muted);
  font-size: 0.74rem;
}

.ai-message-item__retry {
  align-self: flex-start;
  margin-top: 4px;
}

.ai-message-item__reasoning {
  margin-bottom: 10px;

  p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

.markdown-body {
  white-space: normal;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 18px 0 8px;
  color: var(--ui-text-primary);
  font-weight: 760;
  line-height: 1.35;
}

.markdown-body :deep(h1) {
  font-size: 1.24rem;
}

.markdown-body :deep(h2) {
  font-size: 1.12rem;
}

.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  font-size: 1rem;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child),
.markdown-body :deep(h4:first-child) {
  margin-top: 0;
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
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  font-family: var(--ui-font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 0.86em;
}

.markdown-body :deep(.ai-markdown-code-block) {
  margin: 0 0 10px;
  overflow: hidden;
  border: var(--ui-border-width-thin) solid color-mix(in srgb, var(--primary-color) 26%, var(--ui-border-subtle));
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--primary-color) 4%, transparent);
}

.markdown-body :deep(.ai-markdown-code-block__header) {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 8px 0 12px;
  border-bottom: var(--ui-border-width-thin) solid color-mix(in srgb, var(--primary-color) 22%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.markdown-body :deep(.ai-markdown-code-block__language) {
  overflow: hidden;
  color: color-mix(in srgb, var(--primary-color) 62%, var(--ui-text-primary));
  font-family: var(--ui-font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 0.72rem;
  font-weight: 650;
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
}

.markdown-body :deep(.ai-markdown-code-block__copy) {
  appearance: none;
  flex: 0 0 auto;
  min-width: 44px;
  min-height: 24px;
  border: var(--ui-border-width-thin) solid transparent;
  border-radius: calc(var(--ui-radius-sm) - 2px);
  padding: 2px 7px;
  background: color-mix(in srgb, var(--primary-color) 9%, transparent);
  color: var(--ui-text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 0.74rem;
  font-weight: 650;
}

.markdown-body :deep(.ai-markdown-code-block__copy:hover) {
  background: color-mix(in srgb, var(--primary-color) 18%, var(--ui-surface-overlay));
  color: var(--primary-color);
}

.markdown-body :deep(.ai-markdown-code-block__copy:focus-visible) {
  outline: none;
  box-shadow: var(--ui-focus-ring);
}

.markdown-body :deep(.ai-markdown-code-block pre) {
  max-height: 480px;
  margin: 0;
  padding: 12px;
  border: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--primary-color) 4%, transparent);
  overflow: auto;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  scrollbar-width: thin;
  user-select: text;
}

.markdown-body :deep(.ai-markdown-code-block pre::-webkit-scrollbar) {
  width: 8px;
  height: 8px;
}

.markdown-body :deep(.ai-markdown-code-block pre::-webkit-scrollbar-track) {
  background: transparent;
}

.markdown-body :deep(.ai-markdown-code-block pre::-webkit-scrollbar-thumb) {
  border: 2px solid transparent;
  border-radius: var(--ui-radius-full);
  background: var(--scrollbar-thumb);
  background-clip: padding-box;
}

.markdown-body :deep(.ai-markdown-code-block pre::-webkit-scrollbar-thumb:hover) {
  background: var(--scrollbar-thumb-hover);
  background-clip: padding-box;
}

.markdown-body :deep(pre) {
  max-width: 100%;
  padding: 10px 12px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--primary-color) 3%, transparent);
  overflow: auto;
}

.markdown-body :deep(pre code) {
  display: block;
  padding: 0;
  background: transparent;
  color: var(--ui-text-primary);
  font-size: 0.84rem;
  line-height: 1.6;
}

.markdown-body :deep(.tok-keyword),
.markdown-body :deep(.tok-controlKeyword),
.markdown-body :deep(.tok-definitionKeyword),
.markdown-body :deep(.tok-operatorKeyword) {
  color: color-mix(in srgb, var(--primary-color) 84%, #7c3aed);
}

.markdown-body :deep(.tok-string),
.markdown-body :deep(.tok-specialString),
.markdown-body :deep(.tok-regexp) {
  color: #0f9f7a;
}

.markdown-body :deep(.tok-number),
.markdown-body :deep(.tok-bool),
.markdown-body :deep(.tok-null) {
  color: #c06d12;
}

.markdown-body :deep(.tok-comment),
.markdown-body :deep(.tok-lineComment),
.markdown-body :deep(.tok-blockComment) {
  color: var(--ui-text-muted);
  font-style: italic;
}

.markdown-body :deep(.tok-function),
.markdown-body :deep(.tok-variableName),
.markdown-body :deep(.tok-propertyName),
.markdown-body :deep(.tok-typeName),
.markdown-body :deep(.tok-className) {
  color: color-mix(in srgb, var(--primary-color) 66%, var(--ui-text-primary));
}

.markdown-body :deep(.tok-operator),
.markdown-body :deep(.tok-punctuation),
.markdown-body :deep(.tok-bracket) {
  color: var(--ui-text-secondary);
}

.markdown-body :deep(blockquote) {
  padding: 8px 10px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: calc(var(--ui-radius-sm) - 2px);
  background: color-mix(in srgb, var(--primary-color) 5%, transparent);
  color: var(--ui-text-muted);
}

.markdown-body :deep(blockquote.knowledge-md-callout) {
  color: var(--ui-text-primary);
}

.markdown-body :deep(.knowledge-md-callout__title) {
  margin-bottom: 5px;
  color: var(--ui-text-secondary);
  font-size: 0.74rem;
  font-weight: 750;
}

.markdown-body :deep(hr) {
  height: 1px;
  margin: 16px 0;
  border: 0;
  background: var(--ui-border-subtle);
}

.markdown-body :deep(a) {
  color: var(--primary-color);
  text-decoration-color: color-mix(in srgb, var(--primary-color) 52%, transparent);
  text-underline-offset: 2px;
}

.markdown-body :deep(kbd) {
  display: inline-flex;
  min-height: 18px;
  align-items: center;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: 4px;
  padding: 0 4px;
  background: color-mix(in srgb, var(--primary-color) 6%, transparent);
  color: var(--ui-text-secondary);
  font-family: var(--ui-font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 0.78em;
}

.markdown-body :deep(.ai-markdown-table-scroll) {
  width: 100%;
  margin: 0 0 10px;
  overflow-x: auto;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--primary-color) 3%, transparent);
}

.markdown-body :deep(table) {
  display: table;
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  margin: 0;
  background: transparent;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 6px 8px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  text-align: left;
  vertical-align: top;
}

.markdown-body :deep(th) {
  background: color-mix(in srgb, var(--primary-color) 7%, transparent);
  color: var(--ui-text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
}

.markdown-body :deep(tbody tr:nth-child(even) td) {
  background: color-mix(in srgb, var(--primary-color) 4%, transparent);
}

.ai-message-item__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  opacity: 0;
}

.ai-message-item--user .ai-message-item__actions {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: var(--ui-z-base, 1);
  margin-top: 0;
}

.ai-message-item:hover .ai-message-item__actions {
  opacity: 1;
}

.ai-message-item:focus-within .ai-message-item__actions {
  opacity: 1;
}

@media (pointer: coarse) {
  .ai-message-item__actions {
    opacity: 1;
  }
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
