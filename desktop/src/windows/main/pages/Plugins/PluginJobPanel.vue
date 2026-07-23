<script setup lang="ts">
import type { JobRecord } from '@/contracts/plugin_media';

defineProps<{ jobs: JobRecord[] }>();
</script>

<template>
  <div class="job-panel">
    <strong>任务</strong>
    <div v-if="jobs.length === 0" class="job-panel__empty">暂无任务</div>
    <div v-for="job in jobs" :key="job.id" class="job-panel__row">
      <span><code>{{ job.kind }}</code> <small>{{ job.id }}</small></span>
      <span>{{ job.status }} · {{ Math.round(job.progress * 100) }}%</span>
      <span v-if="job.error" class="job-panel__error">{{ typeof job.error === 'string' ? job.error : JSON.stringify(job.error) }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.job-panel { display: grid; gap: 8px; margin-top: 16px; }
.job-panel__row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 10px; padding: 8px 10px; border: 1px solid var(--ui-border-subtle); border-radius: 6px; }
.job-panel__empty { color: var(--ui-text-muted); }
.job-panel__error { overflow: hidden; color: var(--ui-color-danger); text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 720px) { .job-panel__row { grid-template-columns: 1fr; } }
</style>
