<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}>(), {
  accept: '',
  multiple: false,
  disabled: false,
});

const emit = defineEmits<{
  change: [event: Event];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

function click() {
  inputRef.value?.click();
}

function clear() {
  if (inputRef.value) {
    inputRef.value.value = '';
  }
}

function files() {
  return inputRef.value?.files ?? null;
}

function handleChange(event: Event) {
  emit('change', event);
}

defineExpose({
  click,
  clear,
  files,
  inputRef,
});
</script>

<template>
  <input
    ref="inputRef"
    class="ui-file-input"
    type="file"
    :accept="accept || undefined"
    :multiple="multiple"
    :disabled="disabled"
    @change="handleChange"
  >
</template>

<style scoped lang="scss">
.ui-file-input {
  display: none;
}
</style>
