<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue';

type SelectSize = 'sm' | 'md' | 'lg';
type SelectAnimation = 'fade' | 'slide' | 'scale' | 'slideScale';

export type UiSelectOption = {
  label: string;
  value: string | number;
  disabled?: boolean;
};

const props = withDefaults(defineProps<{
  modelValue: string | number;
  options: UiSelectOption[];
  disabled?: boolean;
  size?: SelectSize;
  id?: string;
  placeholder?: string;
  animation?: SelectAnimation;
}>(), {
  disabled: false,
  size: 'md',
  id: '',
  placeholder: '请选择…',
  animation: 'slideScale',
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
  change: [value: string | number];
  focus: [];
  blur: [];
}>();

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const dropdownRef = ref<HTMLElement | null>(null);
const highlightedIndex = ref(-1);
const isClosing = ref(false);
const slots = useSlots();

const selectedOption = computed(() =>
  props.options.find(option => String(option.value) === String(props.modelValue)),
);

const displayLabel = computed(() => selectedOption.value?.label ?? '');

const triggerClass = computed(() => [
  'ui-select-trigger',
  `ui-select-trigger--${props.size}`,
  {
    'ui-select-trigger--open': isOpen.value,
    'ui-select-trigger--disabled': props.disabled,
    'ui-select-trigger--placeholder': !selectedOption.value,
    'ui-select-trigger--has-prefix': Boolean(slots.prefix),
    'ui-select-trigger--has-suffix': Boolean(slots.suffix),
  },
]);

const animationClass = computed(() => `ui-select-dropdown--${props.animation}`);

function getDropdownPosition() {
  if (!triggerRef.value) {
    return { top: '0px', left: '0px', minWidth: '0px' };
  }

  const rect = triggerRef.value.getBoundingClientRect();
  const dropdownHeight = 260;
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

  return {
    top: openUpward ? `${rect.top - 6}px` : `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    minWidth: `${rect.width}px`,
    transformOrigin: openUpward ? 'bottom center' : 'top center',
    maxHeight: `${Math.min(openUpward ? rect.top - 16 : spaceBelow - 16, 280)}px`,
  };
}

const dropdownStyle = ref<Record<string, string>>({});

function openDropdown() {
  if (props.disabled || isOpen.value) {
    return;
  }

  isClosing.value = false;
  isOpen.value = true;
  dropdownStyle.value = getDropdownPosition();
  highlightedIndex.value = props.options.findIndex(
    option => String(option.value) === String(props.modelValue),
  );
  emit('focus');

  nextTick(() => {
    scrollToHighlighted();
  });
}

function closeDropdown() {
  if (!isOpen.value) {
    return;
  }

  isClosing.value = true;

  const duration = getAnimationDuration();
  setTimeout(() => {
    isOpen.value = false;
    isClosing.value = false;
    highlightedIndex.value = -1;
    emit('blur');
  }, duration);
}

function getAnimationDuration() {
  switch (props.animation) {
    case 'fade': return 120;
    case 'slide': return 160;
    case 'scale': return 140;
    case 'slideScale': return 180;
    default: return 150;
  }
}

function toggleDropdown() {
  if (isOpen.value) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function selectOption(option: UiSelectOption) {
  if (option.disabled) {
    return;
  }

  emit('update:modelValue', option.value);
  emit('change', option.value);
  closeDropdown();
}

function scrollToHighlighted() {
  if (!dropdownRef.value || highlightedIndex.value < 0) {
    return;
  }

  const items = dropdownRef.value.querySelectorAll('.ui-select-option');
  const item = items[highlightedIndex.value] as HTMLElement | undefined;
  item?.scrollIntoView({ block: 'nearest' });
}

function handleKeydown(event: KeyboardEvent) {
  if (!isOpen.value) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      openDropdown();
    }

    return;
  }

  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      closeDropdown();
      triggerRef.value?.focus();
      break;
    case 'ArrowDown':
      event.preventDefault();
      moveHighlight(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveHighlight(-1);
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      if (highlightedIndex.value >= 0 && highlightedIndex.value < props.options.length) {
        selectOption(props.options[highlightedIndex.value]);
      }
      break;
  }
}

function moveHighlight(direction: number) {
  const length = props.options.length;
  if (!length) {
    return;
  }

  let next = highlightedIndex.value + direction;

  // Skip disabled options
  for (let i = 0; i < length; i++) {
    if (next < 0) {
      next = length - 1;
    }
    if (next >= length) {
      next = 0;
    }
    if (!props.options[next].disabled) {
      break;
    }
    next += direction;
  }

  highlightedIndex.value = next;
  scrollToHighlighted();
}

function handleClickOutside(event: MouseEvent) {
  if (!isOpen.value) {
    return;
  }

  const target = event.target as Node;
  if (
    triggerRef.value?.contains(target)
    || dropdownRef.value?.contains(target)
  ) {
    return;
  }

  closeDropdown();
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (!isOpen.value || event.key !== 'Escape') {
    return;
  }

  event.preventDefault();
  closeDropdown();
  triggerRef.value?.focus();
}

watch(() => props.options, () => {
  if (isOpen.value) {
    nextTick(() => {
      dropdownStyle.value = getDropdownPosition();
    });
  }
});

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
  window.addEventListener('keydown', handleWindowKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  window.removeEventListener('keydown', handleWindowKeydown);
});
</script>

<template>
  <div class="ui-select-wrap">
    <div :id="id || undefined" ref="triggerRef" :class="triggerClass" role="combobox" :aria-expanded="isOpen"
      :aria-disabled="disabled" tabindex="0" @click="toggleDropdown" @keydown="handleKeydown">
      <span v-if="$slots.prefix" class="ui-select-trigger__affix ui-select-trigger__affix--prefix">
        <slot name="prefix" />
      </span>
      <span v-if="displayLabel" class="ui-select-trigger__label">
        {{ displayLabel }}
      </span>
      <span v-else class="ui-select-trigger__placeholder">
        {{ placeholder }}
      </span>
      <span v-if="$slots.suffix" class="ui-select-trigger__affix ui-select-trigger__affix--suffix">
        <slot name="suffix" />
      </span>
      <span class="ui-select-trigger__arrow" />
    </div>

    <Teleport to="body">
      <div v-if="isOpen" ref="dropdownRef"
        :class="['ui-select-dropdown', animationClass, { 'ui-select-dropdown--closing': isClosing }]"
        :style="dropdownStyle" role="listbox">
        <div class="ui-select-dropdown__inner">
          <div v-for="(option, index) in options" :key="String(option.value)" :class="[
            'ui-select-option',
            {
              'ui-select-option--selected': String(option.value) === String(modelValue),
              'ui-select-option--highlighted': index === highlightedIndex,
              'ui-select-option--disabled': option.disabled,
            },
          ]" role="option" :aria-selected="String(option.value) === String(modelValue)"
            :aria-disabled="option.disabled" @click.stop="selectOption(option)" @mouseenter="highlightedIndex = index">
            <span class="ui-select-option__check">
              <svg v-if="String(option.value) === String(modelValue)" viewBox="0 0 16 16" fill="none">
                <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" />
              </svg>
            </span>
            <span class="ui-select-option__label">{{ option.label }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.ui-select-wrap {
  position: relative;
  width: 100%;
}

/* ─── Trigger ─── */
.ui-select-trigger {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  border: var(--ui-border-width-thin) solid var(--ui-select-border);
  background: var(--ui-select-bg);
  color: var(--ui-select-text);
  border-radius: var(--ui-radius-sm);
  transition:
    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover:not(&--disabled) {
    border-color: var(--ui-select-hover-border);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--ui-select-focus-border);
    box-shadow: var(--ui-focus-ring);
  }

  &--open {
    border-color: var(--ui-select-focus-border);
    box-shadow: var(--ui-focus-ring);

    .ui-select-trigger__arrow {
      transform: translateY(-35%) rotate(-135deg);
    }
  }

  &--disabled {
    background: var(--ui-select-disabled-bg);
    color: var(--ui-select-disabled-text);
    cursor: not-allowed;
    opacity: 0.7;
  }

  &--placeholder {
    .ui-select-trigger__label {
      color: var(--ui-select-placeholder);
    }
  }

  &--sm {
    min-height: var(--ui-control-height-sm);
    padding: var(--ui-control-padding-y-sm) 36px var(--ui-control-padding-y-sm) var(--ui-control-padding-x-sm);
    font-size: 0.84rem;
  }

  &--md {
    min-height: var(--ui-control-height-md);
    padding: var(--ui-control-padding-y-md) 40px var(--ui-control-padding-y-md) var(--ui-control-padding-x-md);
    font-size: 0.95rem;
  }

  &--lg {
    min-height: var(--ui-control-height-lg);
    padding: var(--ui-control-padding-y-lg) 42px var(--ui-control-padding-y-lg) var(--ui-control-padding-x-lg);
    font-size: 1rem;
  }
}

.ui-select-trigger__label,
.ui-select-trigger__placeholder {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ui-select-trigger__placeholder {
  color: var(--ui-select-placeholder);
}

.ui-select-trigger__affix {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--ui-select-placeholder);
  line-height: 1;

  svg {
    display: block;
  }
}

.ui-select-trigger__affix--prefix {
  margin-right: 8px;
}

.ui-select-trigger__affix--suffix {
  margin-left: 8px;
}

.ui-select-trigger__arrow {
  position: absolute;
  top: 50%;
  right: var(--ui-control-padding-x-md);
  width: 7px;
  height: 7px;
  border-right: var(--ui-border-width-strong) solid var(--ui-select-arrow);
  border-bottom: var(--ui-border-width-strong) solid var(--ui-select-arrow);
  transform: translateY(-60%) rotate(45deg);
  pointer-events: none;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ─── Dropdown ─── */
.ui-select-dropdown {
  position: fixed;
  z-index: var(--ui-z-critical);
  box-sizing: border-box;
  overflow: hidden;
  border-radius: var(--ui-radius-sm);
  border: var(--ui-border-width-thin) solid var(--ui-select-dropdown-border);
  background: var(--ui-select-dropdown-bg);
  backdrop-filter: var(--ui-backdrop-blur-md);
  box-shadow: var(--ui-select-dropdown-shadow);
}

.ui-select-dropdown__inner {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 5px;
  overflow-y: auto;
  max-height: inherit;

  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: var(--ui-radius-full);
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }
}

/* ─── Options ─── */
.ui-select-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: calc(var(--ui-radius-sm) - 3px);
  cursor: pointer;
  color: var(--ui-select-text);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &--highlighted {
    background: var(--ui-select-option-hover-bg);
  }

  &--selected {
    color: var(--ui-select-option-selected-text);
    background: var(--ui-select-option-selected-bg);
    font-weight: 500;
  }

  &--selected.ui-select-option--highlighted {
    background: var(--ui-select-option-selected-bg);
  }

  &--disabled {
    color: var(--ui-select-option-disabled-text);
    cursor: not-allowed;

    &.ui-select-option--highlighted {
      background: transparent;
    }
  }
}

.ui-select-option__check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ui-select-focus-border);

  svg {
    width: 14px;
    height: 14px;
  }
}

.ui-select-option__label {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 0.92rem;
  line-height: 1.5;
}

/* ─── Animation: Fade ─── */
.ui-select-dropdown--fade {
  animation: uiSelectFadeIn 0.12s cubic-bezier(0.4, 0, 0.2, 1) forwards;

  &.ui-select-dropdown--closing {
    animation: uiSelectFadeOut 0.12s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
}

@keyframes uiSelectFadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes uiSelectFadeOut {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

/* ─── Animation: Slide ─── */
.ui-select-dropdown--slide {
  animation: uiSelectSlideIn 0.16s cubic-bezier(0.4, 0, 0.2, 1) forwards;

  &.ui-select-dropdown--closing {
    animation: uiSelectSlideOut 0.16s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
}

@keyframes uiSelectSlideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes uiSelectSlideOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }

  to {
    opacity: 0;
    transform: translateY(-8px);
  }
}

/* ─── Animation: Scale ─── */
.ui-select-dropdown--scale {
  animation: uiSelectScaleIn 0.14s cubic-bezier(0.4, 0, 0.2, 1) forwards;

  &.ui-select-dropdown--closing {
    animation: uiSelectScaleOut 0.14s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
}

@keyframes uiSelectScaleIn {
  from {
    opacity: 0;
    transform: scale(0.94);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes uiSelectScaleOut {
  from {
    opacity: 1;
    transform: scale(1);
  }

  to {
    opacity: 0;
    transform: scale(0.94);
  }
}

/* ─── Animation: SlideScale (default) ─── */
.ui-select-dropdown--slideScale {
  animation: uiSelectSlideScaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;

  &.ui-select-dropdown--closing {
    animation: uiSelectSlideScaleOut 0.18s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
}

@keyframes uiSelectSlideScaleIn {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes uiSelectSlideScaleOut {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  to {
    opacity: 0;
    transform: translateY(-4px) scale(0.97);
  }
}
</style>
