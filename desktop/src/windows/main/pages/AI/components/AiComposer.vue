<script lang="ts" setup>
import { ref } from 'vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import Svgicon from '@/windows/main/components/svgs/svgicon.vue';

defineProps<{
  disabled?: boolean;
  streaming?: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
  stop: [];
}>();

const content = ref('');

function submit() {
  const trimmed = content.value.trim();
  if (!trimmed) {
    return;
  }
  emit('send', trimmed);
  content.value = '';
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}
</script>

<template>
  <footer class="ai-composer">
    <UiTextarea
      v-model="content"
      class="ai-composer__input"
      :rows="3"
      resize="none"
      :disabled="disabled"
      placeholder="输入问题..."
      @keydown="handleKeydown"
    />
    <div class="ai-composer__actions">
      <UiButton v-if="streaming" variant="danger" @click="emit('stop')">
        <template #prefix>
          <Svgicon width="14" height="14" viewBox="0 0 24 24">
            <path d="M6 6h12v12H6z" />
          </Svgicon>
        </template>
        停止
      </UiButton>
      <UiButton v-else variant="primary" :disabled="disabled || !content.trim()" @click="submit">
        <template #prefix>
          <Svgicon width="14" height="14" viewBox="0 0 24 24">
            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
          </Svgicon>
        </template>
        发送
      </UiButton>
    </div>
  </footer>
</template>

<style lang="scss" scoped>
.ai-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
  padding: 14px 18px;
  border-top: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-base);
}

.ai-composer__input {
  min-height: 76px;
}

.ai-composer__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
