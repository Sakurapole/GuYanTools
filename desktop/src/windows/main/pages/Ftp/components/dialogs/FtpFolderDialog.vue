<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiField from '@/windows/main/components/ui/UiField.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import type { FtpFolderFormState } from '../../types';

defineProps<{
  modelValue: boolean;
  title: string;
  form: FtpFolderFormState;
  parentOptions: Array<{ label: string; value: string }>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [];
}>();
</script>

<template>
  <UiDialog :model-value="modelValue" width="520" max-width="92vw" @update:modelValue="emit('update:modelValue', $event)">
    <template #header>
      <div class="ftp-dialog__header">{{ title }}</div>
    </template>
    <div class="ftp-dialog__body">
      <UiField label="名称" required>
        <UiInput v-model="form.label" placeholder="例如：生产服务器" />
      </UiField>
      <UiField label="父级文件夹">
        <UiSelect v-model="form.parentId" :options="parentOptions" />
      </UiField>
    </div>
    <template #footer>
      <div class="ftp-dialog__footer">
        <UiButton variant="ghost" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" @click="emit('save')">保存</UiButton>
      </div>
    </template>
  </UiDialog>
</template>
