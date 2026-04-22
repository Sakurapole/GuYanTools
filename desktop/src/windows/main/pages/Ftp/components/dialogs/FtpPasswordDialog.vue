<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiField from '@/windows/main/components/ui/UiField.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';

defineProps<{
  modelValue: boolean;
  label: string;
  password: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:password': [value: string];
  submit: [];
  cancel: [];
}>();
</script>

<template>
  <UiDialog :model-value="modelValue" width="420" max-width="92vw" @update:modelValue="emit('update:modelValue', $event)">
    <template #header>
      <div class="ftp-dialog__header">输入连接密码</div>
    </template>
    <div class="ftp-dialog__body">
      <UiField :label="label">
        <UiInput
          :model-value="password"
          type="password"
          placeholder="请输入密码"
          @update:modelValue="emit('update:password', $event)"
          @keydown="($event) => $event.key === 'Enter' && emit('submit')"
        />
      </UiField>
    </div>
    <template #footer>
      <div class="ftp-dialog__footer">
        <UiButton variant="ghost" @click="emit('cancel')">取消</UiButton>
        <UiButton variant="primary" @click="emit('submit')">连接</UiButton>
      </div>
    </template>
  </UiDialog>
</template>
