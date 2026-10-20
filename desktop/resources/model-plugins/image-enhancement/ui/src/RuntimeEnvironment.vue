<script setup lang="ts">
import RuntimeEnvironmentPage from './RuntimeEnvironmentPage.vue';
import type {
  RuntimeEnvironmentEmit,
  RuntimeEnvironmentProps,
} from './composables/useRuntimeEnvironment';

const props = defineProps<RuntimeEnvironmentProps>();
const emit = defineEmits<RuntimeEnvironmentEmit>();
</script>

<template>
  <RuntimeEnvironmentPage
    v-bind="props"
    @job="emit('job', $event)"
    @changed="emit('changed')"
    @open="emit('open', $event)"
  />
</template>
