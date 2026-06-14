<script lang="ts" setup>
import { nextTick, ref, watch } from 'vue';
import type { AiChatMessage } from '@/contracts/ai';
import AiMessageItem from './AiMessageItem.vue';
import UiEmptyState from '@/windows/main/components/ui/UiEmptyState.vue';

const props = defineProps<{
  messages: AiChatMessage[];
  loading?: boolean;
  streaming?: boolean;
}>();

const emit = defineEmits<{
  regenerate: [messageId: string];
  remember: [messageId: string];
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
        @regenerate="emit('regenerate', $event)"
        @remember="emit('remember', $event)"
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

</style>
