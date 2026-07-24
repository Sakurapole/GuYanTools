<script lang="ts" setup>
import { computed, ref, useAttrs, useSlots } from 'vue';

defineOptions({
  inheritAttrs: false,
});

type InputSize = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  size?: InputSize;
  type?: string;
  id?: string;
  list?: string;
  min?: number;
  max?: number;
  step?: number;
  spellcheck?: boolean | 'true' | 'false';
  autocorrect?: string;
  autocapitalize?: string;
}>(), {
  placeholder: '',
  disabled: false,
  readonly: false,
  size: 'md',
  type: 'text',
  id: '',
  list: '',
  min: undefined,
  max: undefined,
  step: 1,
  spellcheck: undefined,
  autocorrect: undefined,
  autocapitalize: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  keydown: [event: KeyboardEvent];
}>();

const isFocused = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);
const slots = useSlots();
const attrs = useAttrs();

const isNumber = computed(() => props.type === 'number');
const hasPrefix = computed(() => Boolean(slots.prefix));
const hasSuffix = computed(() => Boolean(slots.suffix));
const hasAffixes = computed(() => hasPrefix.value || hasSuffix.value);

const inputClass = computed(() => [
  'ui-input',
  `ui-input--${props.size}`,
  { 'ui-input--number': isNumber.value },
  { 'ui-input--affixed': hasAffixes.value },
]);

const wrapperClass = computed(() => [
  'ui-input-number-wrapper',
  `ui-input-number-wrapper--${props.size}`,
  { 'ui-input-number-wrapper--focused': isFocused.value },
  { 'ui-input-number-wrapper--disabled': props.disabled },
]);

const affixWrapperClass = computed(() => [
  'ui-input-affix-wrapper',
  `ui-input-affix-wrapper--${props.size}`,
  { 'ui-input-affix-wrapper--focused': isFocused.value },
  { 'ui-input-affix-wrapper--disabled': props.disabled },
  { 'ui-input-affix-wrapper--readonly': props.readonly },
  { 'ui-input-affix-wrapper--has-prefix': hasPrefix.value },
  { 'ui-input-affix-wrapper--has-suffix': hasSuffix.value },
]);

const rootAttrs = computed(() => ({
  class: attrs.class,
  style: attrs.style,
}));

const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}

function handleFocus(event: FocusEvent) {
  isFocused.value = true;
  emit('focus', event);
}

function handleBlur(event: FocusEvent) {
  isFocused.value = false;
  emit('blur', event);
}

function stepValue(direction: 1 | -1) {
  if (props.disabled || props.readonly) return;
  const current = Number(props.modelValue) || 0;
  const stepSize = props.step ?? 1;
  let next = current + stepSize * direction;
  if (props.min !== undefined && next < props.min) next = props.min;
  if (props.max !== undefined && next > props.max) next = props.max;
  const val = String(next);
  emit('update:modelValue', val);
  emit('change', val);
}

function focus() {
  inputRef.value?.focus();
}

function select() {
  inputRef.value?.select();
}

defineExpose({
  focus,
  select,
});
</script>

<template>
  <!-- 数字输入框 -->
  <div v-if="isNumber" :class="[wrapperClass, rootAttrs.class]" :style="rootAttrs.style">
    <span v-if="$slots.prefix" class="ui-input__affix ui-input__affix--prefix">
      <slot name="prefix" />
    </span>
    <input
      ref="inputRef"
      :id="id || undefined"
      :class="inputClass"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      type="number"
      :list="list || undefined"
      :min="min"
      :max="max"
      :step="step"
      :spellcheck="spellcheck"
      :autocorrect="autocorrect"
      :autocapitalize="autocapitalize"
      v-bind="inputAttrs"
      @input="handleInput"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown="emit('keydown', $event)"
    >
    <span v-if="$slots.suffix" class="ui-input__affix ui-input__affix--suffix">
      <slot name="suffix" />
    </span>
    <div class="ui-input-number-controls">
      <button
        class="ui-input-number-btn ui-input-number-btn--up"
        type="button"
        tabindex="-1"
        :disabled="disabled"
        @click="stepValue(1)"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button
        class="ui-input-number-btn ui-input-number-btn--down"
        type="button"
        tabindex="-1"
        :disabled="disabled"
        @click="stepValue(-1)"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- 普通输入框 -->
  <div v-else-if="hasAffixes" :class="[affixWrapperClass, rootAttrs.class]" :style="rootAttrs.style">
    <span v-if="$slots.prefix" class="ui-input__affix ui-input__affix--prefix">
      <slot name="prefix" />
    </span>
    <input
      ref="inputRef"
      :id="id || undefined"
      :class="inputClass"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :list="list || undefined"
      :type="type"
      :spellcheck="spellcheck"
      :autocorrect="autocorrect"
      :autocapitalize="autocapitalize"
      v-bind="inputAttrs"
      @input="handleInput"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown="emit('keydown', $event)"
    >
    <span v-if="$slots.suffix" class="ui-input__affix ui-input__affix--suffix">
      <slot name="suffix" />
    </span>
  </div>

  <input
    v-else
    ref="inputRef"
    :id="id || undefined"
    :class="inputClass"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :list="list || undefined"
    :type="type"
    :spellcheck="spellcheck"
    :autocorrect="autocorrect"
    :autocapitalize="autocapitalize"
    v-bind="$attrs"
    @input="handleInput"
    @focus="handleFocus"
    @blur="handleBlur"
    @keydown="emit('keydown', $event)"
  >
</template>

<style lang="scss" scoped>
.ui-input {
  width: 100%;
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  background: var(--ui-input-bg);
  color: var(--ui-input-text);
  border-radius: var(--ui-radius-sm);
  box-sizing: border-box;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;

  &:focus {
    outline: none;
    border-color: var(--ui-input-focus-border);
    box-shadow: var(--ui-focus-ring);
  }

  &:disabled,
  &:read-only {
    background: var(--ui-input-disabled-bg);
    color: var(--ui-input-disabled-text);
  }

  &::placeholder {
    color: var(--ui-input-placeholder);
  }

  &--sm {
    min-height: var(--ui-control-height-sm);
    padding: var(--ui-control-padding-y-sm) var(--ui-control-padding-x-sm);
    font-size: 0.84rem;
  }

  &--md {
    min-height: var(--ui-control-height-md);
    padding: var(--ui-control-padding-y-md) var(--ui-control-padding-x-md);
    font-size: 0.95rem;
  }

  &--lg {
    min-height: var(--ui-control-height-lg);
    padding: var(--ui-control-padding-y-lg) var(--ui-control-padding-x-lg);
    font-size: 1rem;
  }

  /* 数字输入框：隐藏原生 spinner */
  &--number {
    border: none;
    background: transparent;
    padding-right: 0;
    flex: 1;
    min-width: 0;

    &:focus {
      box-shadow: none;
      border-color: transparent;
    }

    /* Chrome / Edge / Safari */
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    /* Firefox */
    -moz-appearance: textfield;
    appearance: textfield;
  }

  &--affixed {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    background: transparent;
    box-shadow: none;

    &:focus {
      border-color: transparent;
      box-shadow: none;
    }
  }
}

.ui-input-affix-wrapper {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-input-bg);
  color: var(--ui-input-text);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;

  &--focused {
    border-color: var(--ui-input-focus-border);
    box-shadow: var(--ui-focus-ring);
  }

  &--disabled,
  &--readonly {
    background: var(--ui-input-disabled-bg);
    color: var(--ui-input-disabled-text);
  }

  &--sm {
    min-height: var(--ui-control-height-sm);
  }

  &--md {
    min-height: var(--ui-control-height-md);
  }

  &--lg {
    min-height: var(--ui-control-height-lg);
  }

  &--has-prefix .ui-input--affixed {
    padding-left: 0;
  }

  &--has-suffix .ui-input--affixed {
    padding-right: 0;
  }
}

.ui-input__affix {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--ui-input-placeholder);
  line-height: 1;

  svg {
    display: block;
  }
}

.ui-input__affix--prefix {
  padding-left: var(--ui-control-padding-x-md);
  padding-right: 8px;
}

.ui-input__affix--suffix {
  padding-left: 8px;
  padding-right: var(--ui-control-padding-x-md);
}

.ui-input-affix-wrapper--sm {
  .ui-input__affix--prefix {
    padding-left: var(--ui-control-padding-x-sm);
    padding-right: 6px;
  }

  .ui-input__affix--suffix {
    padding-left: 6px;
    padding-right: var(--ui-control-padding-x-sm);
  }
}

.ui-input-affix-wrapper--lg {
  .ui-input__affix--prefix {
    padding-left: var(--ui-control-padding-x-lg);
    padding-right: 10px;
  }

  .ui-input__affix--suffix {
    padding-left: 10px;
    padding-right: var(--ui-control-padding-x-lg);
  }
}

/* ─── 数字输入框包裹容器 ─── */
.ui-input-number-wrapper {
  display: flex;
  align-items: stretch;
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-input-bg);
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;

  &--focused {
    border-color: var(--ui-input-focus-border);
    box-shadow: var(--ui-focus-ring);
  }

  &--disabled {
    background: var(--ui-input-disabled-bg);
    opacity: 0.7;
    pointer-events: none;
  }
}

/* ─── 步进按钮容器 ─── */
.ui-input-number-controls {
  display: flex;
  flex-direction: column;
  border-left: var(--ui-border-width-thin) solid var(--ui-input-border);
  flex-shrink: 0;
}

.ui-input-number-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  flex: 1;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;

  &--up {
    border-bottom: var(--ui-border-width-thin) solid var(--ui-input-border);
  }

  &:hover {
    background: var(--ui-input-focus-border, #4a90d9);
    color: white;
  }

  &:active {
    background: color-mix(in srgb, var(--ui-input-focus-border, #4a90d9) 85%, black);
    color: white;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    &:hover {
      background: transparent;
      color: var(--ui-text-muted);
    }
  }
}
</style>
