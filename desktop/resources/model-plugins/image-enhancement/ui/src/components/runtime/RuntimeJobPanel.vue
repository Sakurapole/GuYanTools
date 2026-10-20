<script setup lang="ts">
import { useRuntimeEnvironmentContext } from '../../composables/runtime-environment-context';
const r = useRuntimeEnvironmentContext();
</script>

<template>
  <section v-if="r.lastJob" class="runtime-manager__job" aria-live="polite">
    <strong>{{ r.lastJob.kind }} · {{ r.lastJob.status }}</strong>
    <p>{{ r.lastJob.currentStep }}</p>
    <p v-if="r.lastJob.error" class="runtime-manager__error" role="alert">
      {{ typeof r.lastJob.error === 'string' ? r.lastJob.error : JSON.stringify(r.lastJob.error) }}
    </p>
    <gt-progress
      v-if="!['completed', 'failed', 'cancelled'].includes(r.lastJob.status)"
      indeterminate
      label="运行环境任务"
    /><gt-button
      v-if="!['completed', 'failed', 'cancelled'].includes(r.lastJob.status)"
      variant="danger"
      size="sm"
      @gt-click="r.cancel"
      >取消环境任务</gt-button
    >
    <pre
      v-if="r.lastJob.output && typeof r.lastJob.output === 'object' && 'log' in r.lastJob.output"
      >{{ r.lastJob.output.log }}</pre>
  </section>
</template>
