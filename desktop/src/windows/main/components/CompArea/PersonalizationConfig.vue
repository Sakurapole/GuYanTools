<script lang="ts" setup>
import UiPersonalizationConfig from '../ui/UiPersonalizationConfig.vue';
import type { BackgroundConfirmPayload, BackgroundStyleConfig } from '../../types/grid';

withDefaults(defineProps<{
  visible: boolean;
  currentBackground?: string;
  currentBackgroundImage?: string;
  currentBackgroundVideo?: string;
  currentBackgroundStyle?: BackgroundStyleConfig;
  previewWidth?: number;
  previewHeight?: number;
}>(), {
  currentBackground: '',
  currentBackgroundImage: '',
  currentBackgroundVideo: '',
  currentBackgroundStyle: () => ({}),
  previewWidth: 320,
  previewHeight: 200,
});

const emit = defineEmits<{
  close: [];
  confirm: [background: BackgroundConfirmPayload];
}>();

function handleConfirm(payload: BackgroundConfirmPayload) {
  emit('confirm', payload);
}
</script>

<template>
  <UiPersonalizationConfig
    :visible="visible"
    :current-background="currentBackground"
    :current-background-image="currentBackgroundImage"
    :current-background-video="currentBackgroundVideo"
    :current-background-style="currentBackgroundStyle"
    :preview-width="previewWidth"
    :preview-height="previewHeight"
    @close="emit('close')"
    @confirm="handleConfirm"
  />
</template>
