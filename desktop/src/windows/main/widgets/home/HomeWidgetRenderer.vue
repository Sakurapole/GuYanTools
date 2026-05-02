<script lang="ts" setup>
import { computed } from 'vue';
import type { GridItem } from '../../types/grid';
import BuiltinDateWidget from './renderers/BuiltinDateWidget.vue';
import BuiltinPomodoroWidget from './renderers/BuiltinPomodoroWidget.vue';
import BuiltinTodoWidget from './renderers/BuiltinTodoWidget.vue';
import BuiltinWeatherWidget from './renderers/BuiltinWeatherWidget.vue';
import FtpProfileGroupWidget from './renderers/FtpProfileGroupWidget.vue';
import FtpProfileWidget from './renderers/FtpProfileWidget.vue';
import ShortcutWidget from './renderers/ShortcutWidget.vue';

const props = withDefaults(defineProps<{
  item: GridItem;
  interactive?: boolean;
}>(), {
  interactive: true,
});

const rendererComponent = computed(() => {
  if (props.item.widgetType === 'pomodoro') return BuiltinPomodoroWidget;
  if (props.item.widgetType === 'date') return BuiltinDateWidget;
  if (props.item.widgetType === 'weather') return BuiltinWeatherWidget;
  if (props.item.widgetType === 'todo') return BuiltinTodoWidget;
  if (props.item.widgetType === 'ftp_profile_group') return FtpProfileGroupWidget;
  if (props.item.widgetType === 'ftp_profile') return FtpProfileWidget;
  return ShortcutWidget;
});
</script>

<template>
  <component :is="rendererComponent" :item="props.item" :interactive="props.interactive" />
</template>
