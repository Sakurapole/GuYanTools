<script setup lang="ts">
defineProps<{ inputLabel: string; inputSize: string; hasInput: boolean; disabled?: boolean }>();
const emit = defineEmits<{ pick: [] }>();
</script>

<template>
  <div class="image-input-preview">
    <div class="section-header section-header--spaced">
      <div><h2>输入与预览</h2></div>
      <gt-badge :tone="hasInput ? 'success' : 'neutral'">{{
        hasInput ? '已选择图片' : '等待输入'
      }}</gt-badge>
    </div>
    <div class="preview-panel">
      <div class="preview-panel__grid"></div>
      <div class="preview-panel__content">
        <div class="preview-panel__icon">⌁</div>
        <strong>{{ inputLabel }}</strong>
        <span>{{
          hasInput
            ? '文件已准备好，继续配置模型与输出。'
            : '支持 PNG、JPG、WEBP 和 BMP，点击选择本机图片。'
        }}</span>
        <gt-button variant="primary" size="sm" :disabled="disabled" @gt-click="emit('pick')"
          >选择输入图片</gt-button
        >
      </div>
    </div>
    <div class="preview-footer">
      <span>{{ inputLabel }}</span
      ><span>{{ inputSize }}</span>
    </div>
  </div>
</template>
