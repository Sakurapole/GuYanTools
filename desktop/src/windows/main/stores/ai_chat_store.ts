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

export const useAiChatStore = defineStore('ai-chat', () => {
  const conversations = ref<AiConversation[]>([]);
  const activeConversationId = ref('');
  const messagesByConversation = ref<Record<string, AiChatMessage[]>>({});
  const activeRuns = ref<Record<string, string>>({});
  const loadingConversations = ref(false);
  const loadingMessages = ref(false);
  const sending = ref(false);
  const error = ref('');
  let unsubscribeStream: (() => void) | null = null;

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
      if (!activeConversationId.value && conversations.value[0]) {
        activeConversationId.value = conversations.value[0].id;
        await loadMessages(activeConversationId.value);
      }
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
      activeConversationId.value = conversations.value[0]?.id ?? '';
      if (activeConversationId.value) {
        await loadMessages(activeConversationId.value);
      }
    }
  }

  async function loadMessages(conversationId: string) {
    if (!window.aiApi || !conversationId) {
      return [];
    }

    loadingMessages.value = true;
    error.value = '';
    try {
      const messages = await window.aiApi.listMessages(conversationId);
      messagesByConversation.value = {
        ...messagesByConversation.value,
        [conversationId]: messages,
      };
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
        merged[index] = message;
      } else {
        merged.push(message);
      }
    }
    messagesByConversation.value = {
      ...messagesByConversation.value,
      [conversationId]: merged,
    };
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

  function clearRun(runId: string) {
    const nextRuns = { ...activeRuns.value };
    for (const [conversationId, activeRun] of Object.entries(nextRuns)) {
      if (activeRun === runId) {
        delete nextRuns[conversationId];
      }
    }
    activeRuns.value = nextRuns;
  }

  function handleStreamEvent(event: AiStreamEvent) {
    if (event.type === 'text-delta') {
      updateMessage(event.messageId, (message) => ({
        ...message,
        content: `${message.content}${event.delta}`,
        status: 'streaming',
      }));
      return;
    }

    if (event.type === 'reasoning-delta') {
      updateMessage(event.messageId, (message) => ({
        ...message,
        metadata: appendReasoningDelta(message.metadata, event.delta),
        status: 'streaming',
      }));
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
      clearRun(event.runId);
      refreshConversations().catch((): undefined => undefined);
      if (activeConversationId.value) {
        loadMessages(activeConversationId.value).catch((): undefined => undefined);
      }
      return;
    }

    if (event.type === 'run-aborted') {
      clearRun(event.runId);
      return;
    }

    if (event.type === 'run-error') {
      clearRun(event.runId);
      error.value = event.message;
    }
  }

  function dispose() {
    unsubscribeStream?.();
    unsubscribeStream = null;
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
