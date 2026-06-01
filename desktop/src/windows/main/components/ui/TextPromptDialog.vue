<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useTextPromptDialog } from '@/windows/main/composables/useTextPromptDialog';
import IconRenderer from './IconRenderer.vue';
import UiButton from './UiButton.vue';
import UiDialog from './UiDialog.vue';
import UiField from './UiField.vue';
import UiInput from './UiInput.vue';

type UiInputExpose = {
  focus: () => void;
  select: () => void;
};

const { visible, value, options, confirm, cancel } = useTextPromptDialog();
const inputRef = ref<UiInputExpose | null>(null);
const submitted = ref(false);

watch(visible, async (nextVisible) => {
  submitted.value = false;
  if (!nextVisible) return;

  await nextTick();
  inputRef.value?.focus();
  inputRef.value?.select();
});

function handleConfirm() {
  submitted.value = true;
  confirm();
}
</script>

<template>
  <UiDialog
    :model-value="visible"
    :width="420"
    :close-on-mask="false"
    aria-label="文本输入"
    @update:model-value="cancel"
  >
    <template #header>
      <div class="text-prompt-dialog__header">
        <span class="text-prompt-dialog__icon">
          <IconRenderer :icon="options.icon" :size="18" />
        </span>
        <span class="text-prompt-dialog__title">{{ options.title }}</span>
      </div>
    </template>

    <form class="text-prompt-dialog__body" @submit.prevent="handleConfirm">
      <UiField
        :label="options.label"
        :hint="options.hint"
        :error="submitted && !value.trim() ? options.requiredMessage : ''"
        required
      >
        <UiInput
          ref="inputRef"
          v-model="value"
          :type="options.inputType"
          :placeholder="options.placeholder"
          spellcheck="false"
          autocorrect="off"
          autocapitalize="off"
        />
      </UiField>
    </form>

    <template #footer>
      <div class="text-prompt-dialog__footer">
        <UiButton type="button" variant="secondary" size="sm" @click="cancel">
          {{ options.cancelText }}
        </UiButton>
        <UiButton
          type="button"
          variant="primary"
          size="sm"
          :disabled="!value.trim()"
          @click="handleConfirm"
        >
          {{ options.confirmText }}
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>

<style scoped lang="scss">
.text-prompt-dialog__header {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
  padding: 16px 20px;
  color: var(--ui-text-primary);
}

.text-prompt-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: var(--ui-radius-xs, 6px);
  color: var(--primary-color);
  background: var(--ui-tabs-active-bg);
}

.text-prompt-dialog__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 700;
}

.text-prompt-dialog__body {
  padding: 18px 20px 20px;
}

.text-prompt-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
}
</style>
