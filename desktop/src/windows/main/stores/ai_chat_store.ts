import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AiChatMessage,
  AiConversation,
  AiStreamEvent,
  CreateAiConversationPayload,
  RegenerateAiMessagePayload,
  SendAiMessagePayload,
  UpdateAiConversationPayload,
} from '@/contracts/ai';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface PendingStreamUpdate {
  textDelta: string;
  reasoningDelta: string;
}

export const useAiChatStore = defineStore('ai-chat', () => {
  const conversations = ref<AiConversation[]>([]);
  const activeConversationId = ref('');
  const messagesByConversation = ref<Record<string, AiChatMessage[]>>({});
  const activeRuns = ref<Record<string, string>>({});
  const loadingConversations = ref(false);
  const loadingMessages = ref(false);
  const sending = ref(false);
  const error = ref('');
  const pendingStreamUpdates = new Map<string, PendingStreamUpdate>();
  const runMessageIds = new Map<string, string>();
  let unsubscribeStream: (() => void) | null = null;
  let streamFlushFrame: number | null = null;

  const activeConversation = computed(() =>
    conversations.value.find((conversation) => conversation.id === activeConversationId.value) ?? null,
  );
  const activeMessages = computed(() => messagesByConversation.value[activeConversationId.value] ?? []);
  const activeRunId = computed(() => activeConversationId.value ? activeRuns.value[activeConversationId.value] : '');
  const isStreaming = computed(() => Boolean(activeRunId.value));

  function ensureStreamSubscription() {
    if (unsubscribeStream || !window.aiApi) {
      return;
    }

    unsubscribeStream = window.aiApi.onStreamEvent(handleStreamEvent);
  }

  async function refreshConversations() {
    if (!window.aiApi) {
      return conversations.value;
    }

    loadingConversations.value = true;
    error.value = '';
    try {
      conversations.value = await window.aiApi.listConversations();
      return conversations.value;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      loadingConversations.value = false;
    }
  }

  async function createConversation(input: CreateAiConversationPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }

    const conversation = await window.aiApi.createConversation(clone(input));
    conversations.value = [conversation, ...conversations.value.filter((item) => item.id !== conversation.id)];
    activeConversationId.value = conversation.id;
    messagesByConversation.value[conversation.id] = [];
    return conversation;
  }

  async function updateConversation(id: string, input: UpdateAiConversationPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }

    const conversation = await window.aiApi.updateConversation(id, clone(input));
    conversations.value = conversations.value.map((item) => item.id === id ? conversation : item);
    return conversation;
  }

  async function deleteConversation(id: string) {
    if (!window.aiApi) {
      return;
    }

    await window.aiApi.deleteConversation(id);
    conversations.value = conversations.value.filter((item) => item.id !== id);
    delete messagesByConversation.value[id];
    if (activeConversationId.value === id) {
      activeConversationId.value = '';
    }
  }

  async function loadMessages(conversationId: string) {
    if (!window.aiApi || !conversationId) {
      return [];
    }

    loadingMessages.value = true;
    try {
      const messages = await window.aiApi.listMessages(conversationId);
      messagesByConversation.value = {
        ...messagesByConversation.value,
        [conversationId]: messages,
      };
      flushPendingStreamUpdates();
      return messages;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      loadingMessages.value = false;
    }
  }

  async function setActiveConversation(conversationId: string) {
    activeConversationId.value = conversationId;
    error.value = '';
    if (!conversationId) {
      return;
    }
    if (!messagesByConversation.value[conversationId]) {
      await loadMessages(conversationId);
    }
  }

  async function sendMessage(input: SendAiMessagePayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }

    ensureStreamSubscription();
    sending.value = true;
    error.value = '';
    try {
      const result = await window.aiApi.sendMessage(clone(input));
      appendMessages(input.conversationId, [result.userMessage, result.assistantMessage]);
      activeRuns.value = {
        ...activeRuns.value,
        [input.conversationId]: result.runId,
      };
      return result;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      sending.value = false;
    }
  }

  async function regenerateMessage(input: RegenerateAiMessagePayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }

    ensureStreamSubscription();
    sending.value = true;
    error.value = '';
    try {
      const result = await window.aiApi.regenerateMessage(clone(input));
      appendMessages(input.conversationId, [result.assistantMessage]);
      activeRuns.value = {
        ...activeRuns.value,
        [input.conversationId]: result.runId,
      };
      return result;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      sending.value = false;
    }
  }

  async function stopActiveRun() {
    if (!window.aiApi || !activeRunId.value) {
      return;
    }

    await window.aiApi.stopRun(activeRunId.value);
  }

  function appendMessages(conversationId: string, nextMessages: AiChatMessage[]) {
    const current = messagesByConversation.value[conversationId] ?? [];
    const merged = [...current];
    for (const message of nextMessages) {
      const index = merged.findIndex((item) => item.id === message.id);
      if (index >= 0) {
        const existing = merged[index];
        merged[index] = message.role === 'assistant'
          && message.status === 'streaming'
          && !message.content
          && existing.content
          ? {
            ...message,
            content: existing.content,
            status: existing.status,
            metadata: existing.metadata ?? message.metadata,
          }
          : message;
      } else {
        merged.push(message);
      }
    }
    messagesByConversation.value = {
      ...messagesByConversation.value,
      [conversationId]: merged,
    };
    flushPendingStreamUpdates();
  }

  function updateMessage(messageId: string, updater: (message: AiChatMessage) => AiChatMessage) {
    for (const [conversationId, messages] of Object.entries(messagesByConversation.value)) {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) {
        continue;
      }

      const nextMessages = [...messages];
      nextMessages[index] = updater(nextMessages[index]);
      messagesByConversation.value = {
        ...messagesByConversation.value,
        [conversationId]: nextMessages,
      };
      return conversationId;
    }

    return '';
  }

  function queueStreamUpdate(messageId: string, update: Partial<PendingStreamUpdate>) {
    const current = pendingStreamUpdates.get(messageId) ?? { textDelta: '', reasoningDelta: '' };
    pendingStreamUpdates.set(messageId, {
      textDelta: `${current.textDelta}${update.textDelta ?? ''}`,
      reasoningDelta: `${current.reasoningDelta}${update.reasoningDelta ?? ''}`,
    });
    if (streamFlushFrame === null) {
      streamFlushFrame = window.requestAnimationFrame(() => {
        streamFlushFrame = null;
        flushPendingStreamUpdates();
      });
    }
  }

  function flushPendingStreamUpdates(targetMessageId?: string) {
    for (const [messageId, update] of pendingStreamUpdates) {
      if (targetMessageId && messageId !== targetMessageId) {
        continue;
      }
      const conversationId = updateMessage(messageId, (message) => ({
        ...message,
        content: `${message.content}${update.textDelta}`,
        metadata: update.reasoningDelta
          ? appendReasoningDelta(message.metadata, update.reasoningDelta)
          : message.metadata,
        status: 'streaming',
      }));
      if (conversationId) {
        pendingStreamUpdates.delete(messageId);
      }
    }
  }

  function finishPendingStreamUpdates(runId: string, fallbackMessageId?: string) {
    const messageId = fallbackMessageId || runMessageIds.get(runId);
    if (!messageId) {
      return;
    }
    flushPendingStreamUpdates(messageId);
    pendingStreamUpdates.delete(messageId);
  }

  function clearRun(runId: string) {
    const nextRuns = { ...activeRuns.value };
    for (const [conversationId, activeRun] of Object.entries(nextRuns)) {
      if (activeRun === runId) {
        delete nextRuns[conversationId];
      }
    }
    activeRuns.value = nextRuns;
    runMessageIds.delete(runId);
  }

  function findRunConversationId(runId: string) {
    return Object.entries(activeRuns.value).find(([, activeRun]) => activeRun === runId)?.[0] ?? '';
  }

  function refreshRunConversation(conversationId: string) {
    if (!conversationId) {
      return;
    }
    loadMessages(conversationId).catch((): undefined => undefined);
  }

  function handleStreamEvent(event: AiStreamEvent) {
    if (event.type === 'run-start') {
      runMessageIds.set(event.runId, event.messageId);
      activeRuns.value = {
        ...activeRuns.value,
        [event.conversationId]: event.runId,
      };
      return;
    }

    if (event.type === 'text-delta') {
      queueStreamUpdate(event.messageId, { textDelta: event.delta });
      return;
    }

    if (event.type === 'reasoning-delta') {
      queueStreamUpdate(event.messageId, { reasoningDelta: event.delta });
      return;
    }

    if (event.type === 'usage') {
      updateMessage(event.messageId, (message) => ({
        ...message,
        tokenUsage: event.usage,
      }));
      return;
    }

    if (event.type === 'citation') {
      updateMessage(event.messageId, (message) => {
        const citations = message.citations ?? [];
        if (citations.some((citation) => citation.id === event.citation.id)) {
          return message;
        }

        return {
          ...message,
          citations: [...citations, event.citation],
        };
      });
      return;
    }

    if (event.type === 'run-finish') {
      const conversationId = findRunConversationId(event.runId);
      finishPendingStreamUpdates(event.runId);
      clearRun(event.runId);
      refreshConversations().catch((): undefined => undefined);
      refreshRunConversation(conversationId);
      return;
    }

    if (event.type === 'run-aborted') {
      const conversationId = findRunConversationId(event.runId);
      finishPendingStreamUpdates(event.runId);
      clearRun(event.runId);
      refreshRunConversation(conversationId);
      return;
    }

    if (event.type === 'run-error') {
      const conversationId = findRunConversationId(event.runId);
      finishPendingStreamUpdates(event.runId, event.messageId);
      clearRun(event.runId);
      updateMessage(event.messageId, (message) => ({
        ...message,
        status: 'error',
        metadata: {
          ...(message.metadata ?? {}),
          error: {
            message: event.message,
            detail: event.detail,
            statusCode: event.statusCode,
            code: event.code,
            providerId: event.providerId,
            modelId: event.modelId,
            retryable: event.retryable,
          },
        },
      }));
      error.value = '';
      refreshRunConversation(conversationId);
    }
  }

  function dispose() {
    unsubscribeStream?.();
    unsubscribeStream = null;
    if (streamFlushFrame !== null) {
      window.cancelAnimationFrame(streamFlushFrame);
      streamFlushFrame = null;
    }
    pendingStreamUpdates.clear();
    runMessageIds.clear();
  }

  return {
    conversations,
    activeConversationId,
    messagesByConversation,
    activeConversation,
    activeMessages,
    activeRunId,
    loadingConversations,
    loadingMessages,
    sending,
    error,
    isStreaming,
    ensureStreamSubscription,
    refreshConversations,
    createConversation,
    updateConversation,
    deleteConversation,
    loadMessages,
    setActiveConversation,
    sendMessage,
    regenerateMessage,
    stopActiveRun,
    dispose,
  };
});

function appendReasoningDelta(metadata: Record<string, unknown> | undefined, delta: string) {
  const reasoning = isRecord(metadata?.reasoning) ? metadata.reasoning : {};
  const content = typeof reasoning.content === 'string' ? reasoning.content : '';
  return {
    ...(metadata ?? {}),
    reasoning: {
      ...reasoning,
      enabled: true,
      content: `${content}${delta}`,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAiChatStore, import.meta.hot));
}
