<script lang="ts" setup>
import { nextTick, ref, watch } from 'vue';
import type { AiChatMessage } from '@/contracts/ai';
import AiMessageItem from './AiMessageItem.vue';

const props = defineProps<{
  messages: AiChatMessage[];
  loading?: boolean;
  streaming?: boolean;
}>();

const emit = defineEmits<{
  regenerate: [messageId: string];
}>();

const listRef = ref<HTMLElement | null>(null);

watch(
  () => [props.messages.length, props.messages.at(-1)?.content],
  async () => {
    await nextTick();
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight;
    }
  },
);
</script>

<template>
  <main ref="listRef" class="ai-message-list">
    <p v-if="loading" class="ai-message-list__empty">加载消息中...</p>
    <p v-else-if="!messages.length" class="ai-message-list__empty">选择模型后开始第一轮问答</p>
    <template v-else>
      <AiMessageItem
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :can-regenerate="!streaming"
        @regenerate="emit('regenerate', $event)"
      />
    </template>
  </main>
</template>

<style lang="scss" scoped>
.ai-message-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding: 18px 22px;
  overflow: auto;
  background: var(--ui-surface-muted);
}

.ai-message-list__empty {
  align-self: center;
  margin: auto;
  color: var(--ui-text-muted);
  font-size: 0.92rem;
}
</style>
