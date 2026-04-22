<script setup lang="ts">
import type { FtpAuthChallenge } from '@/contracts/ftp';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiField from '@/windows/main/components/ui/UiField.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';

const props = defineProps<{
  modelValue: boolean;
  challenge: FtpAuthChallenge | null;
  responses: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:responses': [value: string[]];
  submit: [];
  cancel: [];
}>();

function updateResponse(index: number, value: string) {
  const next = [...(props.responses ?? [])];
  next[index] = value;
  emit('update:responses', next);
}
</script>

<template>
  <UiDialog :model-value="modelValue" width="520" max-width="92vw" @update:modelValue="emit('update:modelValue', $event)">
    <template #header>
      <div class="ftp-dialog__header">{{ challenge?.name || '输入交互式认证信息' }}</div>
    </template>
    <div class="ftp-dialog__body">
      <p v-if="challenge?.instructions" class="ftp-dialog__hint">{{ challenge.instructions }}</p>
      <div class="ftp-dialog__grid ftp-dialog__grid--stacked">
        <UiField
          v-for="(prompt, index) in challenge?.prompts ?? []"
          :key="`${challenge?.authSessionId || 'auth'}-${index}`"
          :label="prompt.prompt || `提示 ${index + 1}`"
        >
          <UiInput
            :model-value="responses[index] ?? ''"
            :type="prompt.echo ? 'text' : 'password'"
            :placeholder="prompt.prompt || '请输入认证内容'"
            @update:modelValue="updateResponse(index, $event)"
            @keydown="($event) => $event.key === 'Enter' && emit('submit')"
          />
        </UiField>
      </div>
    </div>
    <template #footer>
      <div class="ftp-dialog__footer">
        <UiButton variant="ghost" @click="emit('cancel')">取消</UiButton>
        <UiButton variant="primary" @click="emit('submit')">继续认证</UiButton>
      </div>
    </template>
  </UiDialog>
</template>
