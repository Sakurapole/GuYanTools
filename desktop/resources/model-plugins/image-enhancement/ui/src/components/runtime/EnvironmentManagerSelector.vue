<script setup lang="ts">
import { useRuntimeEnvironmentContext } from '../../composables/runtime-environment-context';
const r = useRuntimeEnvironmentContext();
</script>

<template>
  <div class="runtime-manager__mode-bar">
    <label class="control-field runtime-manager__mode-field">
      <span>环境管理方式</span>
      <gt-select
        aria-label="环境管理方式"
        :value="r.environmentManager"
        :options="r.managerOptions"
        :disabled="r.locked"
        @gt-change="r.switchManager(String($event.detail.value))"
      />
    </label>
    <div class="runtime-manager__active-summary">
      <span>图像处理使用</span>
      <strong>{{ r.activeEnvironment?.label || '尚未指定环境' }}</strong>
      <span>选择环境后，点击“用于图像处理”使其生效。</span>
    </div>
  </div>
</template>
