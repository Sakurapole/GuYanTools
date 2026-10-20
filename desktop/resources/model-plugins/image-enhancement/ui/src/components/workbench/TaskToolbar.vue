<script setup lang="ts">
import { TASKS } from '../../model_catalog';

defineProps<{ taskType: string; disabled?: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
  <div class="task-grid" aria-label="任务类别">
    <gt-button
      v-for="task in TASKS"
      :key="task.id"
      class="task-card"
      :variant="taskType === task.id ? 'primary' : 'secondary'"
      :active="taskType === task.id"
      :title="task.description"
      size="sm"
      :disabled="disabled"
      @gt-click="emit('select', task.id)"
    >
      {{ task.label }}
    </gt-button>
  </div>
</template>
