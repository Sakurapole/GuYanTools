<script setup lang="ts">
defineProps<{
  running: boolean;
  failed: boolean;
  title: string;
  detail: string;
  progressVisible: boolean;
  progress: number;
  backendLabel: string;
  modelName: string;
  status: string;
}>();
</script>

<template>
  <div class="activity-bar" aria-live="polite">
    <div
      class="activity-bar__indicator"
      :data-state="failed ? 'danger' : running ? 'running' : status"
    ></div>
    <div>
      <strong>{{ running ? title : '运行状态' }}</strong
      ><span>{{ running ? detail : status }}</span>
    </div>
    <gt-progress
      v-if="progressVisible"
      :value="progress"
      max="100"
      :show-value="true"
      label="任务进度"
    ></gt-progress>
    <span class="activity-bar__backend">{{ backendLabel }} · {{ modelName }}</span>
  </div>
</template>
