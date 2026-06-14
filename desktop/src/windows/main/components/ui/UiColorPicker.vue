<script setup lang="ts">
import { computed } from 'vue';
import IconRenderer from './IconRenderer.vue';
import UiIconButton from './UiIconButton.vue';
import UiInput from './UiInput.vue';

const props = withDefaults(defineProps<{
  modelValue: string;
  swatches?: string[];
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  allowTransparent?: boolean;
  allowEmpty?: boolean;
  showInput?: boolean;
  size?: 'sm' | 'md';
}>(), {
  swatches: () => [],
  label: '',
  ariaLabel: '',
  placeholder: '#ffffff',
  allowTransparent: false,
  allowEmpty: false,
  showInput: true,
  size: 'sm',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
}>();

const normalizedValue = computed(() => props.modelValue?.trim() || '');
const colorInputValue = computed(() => toNativeColorValue(normalizedValue.value));
const eyeDropperSupported = computed(() =>
  typeof window !== 'undefined' && 'EyeDropper' in window,
);
const visibleSwatches = computed(() => {
  const values = props.allowTransparent ? ['transparent', ...props.swatches] : props.swatches;
  return [...new Set(values.filter(Boolean))];
});

function toNativeColorValue(value: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '#ffffff';
}

function displaySwatchBackground(color: string) {
  if (color === 'transparent') {
    return 'linear-gradient(45deg, #fff 25%, #d9e2ec 25% 50%, #fff 50% 75%, #d9e2ec 75%)';
  }
  return color;
}

function commit(value: string) {
  const next = value.trim();
  emit('update:modelValue', next);
  emit('change', next);
}

async function pickFromScreen() {
  if (!eyeDropperSupported.value) return;
  try {
    const EyeDropperCtor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropperCtor) return;
    const result = await new EyeDropperCtor().open();
    commit(result.sRGBHex);
  } catch {
    // User cancellation is expected for the native eye dropper.
  }
}
</script>

<template>
  <label class="ui-color-picker" :class="[`ui-color-picker--${size}`]">
    <span v-if="label" class="ui-color-picker__label">{{ label }}</span>
    <span class="ui-color-picker__body">
      <span v-if="visibleSwatches.length" class="ui-color-picker__swatches" role="listbox" :aria-label="ariaLabel || label || '颜色选择'">
        <button
          v-for="color in visibleSwatches"
          :key="color"
          class="ui-color-picker__swatch"
          :class="{ 'ui-color-picker__swatch--active': normalizedValue === color }"
          type="button"
          role="option"
          :aria-selected="normalizedValue === color"
          :title="color === 'transparent' ? '透明' : color"
          :style="{ background: displaySwatchBackground(color) }"
          @click="commit(color)"
        />
      </span>
      <span class="ui-color-picker__custom">
        <input
          class="ui-color-picker__native"
          type="color"
          :value="colorInputValue"
          :aria-label="ariaLabel || label || '自定义颜色'"
          @input="commit(($event.target as HTMLInputElement).value)"
        >
        <UiInput
          v-if="showInput"
          class="ui-color-picker__input"
          :model-value="normalizedValue"
          :placeholder="placeholder"
          :size="size"
          @update:model-value="commit"
        />
        <UiIconButton
          v-if="eyeDropperSupported"
          type="button"
          variant="ghost"
          :size="size"
          title="从屏幕取色"
          @click.prevent="pickFromScreen"
        >
          <IconRenderer icon="iconify:lucide:paintbrush" :size="14" />
        </UiIconButton>
        <UiIconButton
          v-if="allowEmpty && normalizedValue"
          type="button"
          variant="ghost"
          :size="size"
          title="重置颜色"
          @click.prevent="commit('')"
        >
          <IconRenderer icon="iconify:lucide:rotate-ccw" :size="14" />
        </UiIconButton>
      </span>
    </span>
  </label>
</template>

<style scoped lang="scss">
.ui-color-picker {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--ui-text-primary);
}

.ui-color-picker__label {
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-size-xs);
  font-weight: 650;
  line-height: 1.35;
}

.ui-color-picker__body {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.ui-color-picker__swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ui-color-picker__swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-xs);
  background-size: 10px 10px;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: var(--ui-border-strong);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }
}

.ui-color-picker__swatch--active {
  border-color: var(--ui-primary-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary-color) 24%, transparent);
}

.ui-color-picker__custom {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ui-color-picker__native {
  width: 30px;
  height: 30px;
  padding: 2px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-xs);
  background: var(--ui-input-bg);
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }
}

.ui-color-picker__input {
  min-width: 0;
}

.ui-color-picker--md .ui-color-picker__native {
  width: 34px;
  height: 34px;
}
</style>
