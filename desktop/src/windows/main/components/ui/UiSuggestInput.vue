<script lang="ts" setup>
import { computed, ref } from 'vue';
import UiInput from './UiInput.vue';
import UiScrollbar from './UiScrollbar.vue';

type InputSize = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  modelValue: string;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
  size?: InputSize;
}>(), {
  placeholder: '',
  disabled: false,
  size: 'md',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
  enter: [value: string];
  select: [value: string];
  focus: [];
  blur: [];
}>();

const wrapperRef = ref<HTMLElement | null>(null);
const open = ref(false);
const highlightedIndex = ref(-1);
let blurTimer: number | null = null;

const normalizedSuggestions = computed(() =>
  props.suggestions.filter((item, index, array) => item && array.indexOf(item) === index),
);

function clearBlurTimer() {
  if (blurTimer !== null) {
    window.clearTimeout(blurTimer);
    blurTimer = null;
  }
}

function closeSuggestions() {
  open.value = false;
  highlightedIndex.value = -1;
}

function showSuggestions() {
  if (props.disabled || !normalizedSuggestions.value.length) {
    closeSuggestions();
    return;
  }

  open.value = true;
  highlightedIndex.value = highlightedIndex.value >= 0 ? highlightedIndex.value : 0;
}

function handleInput(value: string) {
  emit('update:modelValue', value);
  emit('change', value);
  if (normalizedSuggestions.value.length) {
    open.value = true;
    highlightedIndex.value = 0;
  } else {
    closeSuggestions();
  }
}

function selectSuggestion(value: string) {
  emit('update:modelValue', value);
  emit('change', value);
  emit('select', value);
  closeSuggestions();
}

function moveHighlight(direction: 1 | -1) {
  if (!normalizedSuggestions.value.length) {
    return;
  }

  const max = normalizedSuggestions.value.length - 1;
  const next = highlightedIndex.value < 0
    ? (direction === 1 ? 0 : max)
    : (highlightedIndex.value + direction + normalizedSuggestions.value.length) % normalizedSuggestions.value.length;
  highlightedIndex.value = next;
  open.value = true;
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveHighlight(1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveHighlight(-1);
    return;
  }

  if (event.key === 'Tab' && open.value && highlightedIndex.value >= 0) {
    event.preventDefault();
    selectSuggestion(normalizedSuggestions.value[highlightedIndex.value]);
    return;
  }

  if (event.key === 'Enter') {
    if (open.value && highlightedIndex.value >= 0) {
      event.preventDefault();
      selectSuggestion(normalizedSuggestions.value[highlightedIndex.value]);
      return;
    }

    emit('enter', props.modelValue);
    return;
  }

  if (event.key === 'Escape') {
    closeSuggestions();
  }
}

function handleFocus() {
  clearBlurTimer();
  emit('focus');
  showSuggestions();
}

function handleBlur() {
  clearBlurTimer();
  blurTimer = window.setTimeout(() => {
    closeSuggestions();
    emit('blur');
  }, 120);
}
</script>

<template>
  <div ref="wrapperRef" class="ui-suggest-input">
    <UiInput
      :model-value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :size="size"
      @update:modelValue="handleInput"
      @keydown="handleKeydown"
      @focus="handleFocus"
      @blur="handleBlur"
    />

    <transition name="ui-dropdown">
      <div v-if="open && normalizedSuggestions.length" class="ui-suggest-input__dropdown">
        <UiScrollbar :x="false" :size="6" class="ui-suggest-input__scroll">
          <div class="ui-suggest-input__list">
            <button
              v-for="(suggestion, index) in normalizedSuggestions"
              :key="suggestion"
              type="button"
              class="ui-suggest-input__item"
              :class="{ 'ui-suggest-input__item--highlighted': index === highlightedIndex }"
              @mouseenter="highlightedIndex = index"
              @mousedown.prevent="selectSuggestion(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>
        </UiScrollbar>
      </div>
    </transition>
  </div>
</template>

<style lang="scss" scoped>
.ui-suggest-input {
  position: relative;
  width: 100%;
}

.ui-suggest-input__dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 12;
  border: var(--ui-border-width-thin) solid var(--ui-select-dropdown-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-select-dropdown-bg);
  backdrop-filter: var(--ui-backdrop-blur-md);
  box-shadow: var(--ui-select-dropdown-shadow);
  overflow: hidden;
}

.ui-suggest-input__scroll {
  max-height: 220px;
}

.ui-suggest-input__list {
  display: flex;
  flex-direction: column;
  padding: 5px;
  gap: 3px;
}

.ui-suggest-input__item {
  appearance: none;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: calc(var(--ui-radius-sm) - 3px);
  background: transparent;
  color: var(--ui-select-text);
  cursor: pointer;
  font: inherit;
  font-size: 0.84rem;
  text-align: left;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover,
  &--highlighted {
    background: var(--ui-select-option-hover-bg);
  }
}

</style>
