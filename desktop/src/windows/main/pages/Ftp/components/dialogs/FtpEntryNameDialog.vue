<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiField from '@/windows/main/components/ui/UiField.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';

defineProps<{
  modelValue: boolean;
  title: string;
  label: string;
  confirmText: string;
  value: string;
  placeholder: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:value': [value: string];
  submit: [];
  cancel: [];
}>();
</script>

<template>
  <UiDialog
    :model-value="modelValue"
    width="420"
    max-width="92vw"
    @update:modelValue="(value) => emit('update:modelValue', value)"
  >
    <template #header>
      <div class="ftp-dialog__header">{{ title }}</div>
    </template>
    <div class="ftp-dialog__body">
      <UiField :label="label" required>
        <UiInput
          :model-value="value"
          :placeholder="placeholder"
          @update:modelValue="emit('update:value', $event)"
          @keydown="($event) => $event.key === 'Enter' && emit('submit')"
        />
      </UiField>
    </div>
    <template #footer>
      <div class="ftp-dialog__footer">
        <UiButton variant="ghost" @click="emit('cancel')">取消</UiButton>
        <UiButton variant="primary" :disabled="!value.trim()" @click="emit('submit')">
          {{ confirmText }}
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>
