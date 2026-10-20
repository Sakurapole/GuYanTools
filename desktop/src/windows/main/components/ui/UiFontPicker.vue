<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { LocalFontOption } from '@/contracts/app_config';
import UiInput from './UiInput.vue';
import { filterFontOptions } from '@/windows/main/utils/code_font';

const props = defineProps<{ modelValue: string; options: LocalFontOption[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const field = ref<InstanceType<typeof UiInput> | null>(null);
const anchor = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const position = ref({ left: '0px', top: '0px', width: '0px', maxHeight: '260px' });
const selectedLabel = computed(() => props.options.find((option) => option.value === props.modelValue)?.label ?? props.modelValue);
const matches = computed(() => filterFontOptions(props.options, query.value).slice(0, 80));

watch(() => props.modelValue, () => { if (!open.value) query.value = selectedLabel.value; }, { immediate: true });
watch(() => props.options, () => { if (!open.value) query.value = selectedLabel.value; });

function updatePosition() {
  if (!anchor.value) return;
  const rect = anchor.value.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom;
  const above = rect.top;
  const height = Math.min(260, Math.max(120, Math.max(below, above) - 12));
  const top = below >= Math.min(220, height) || below >= above
    ? rect.bottom + 5
    : rect.top - height - 5;
  position.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`,
    top: `${Math.max(8, top)}px`,
    width: `${Math.min(rect.width, window.innerWidth - 16)}px`,
    maxHeight: `${height}px`,
  };
}

async function show() {
  open.value = true;
  activeIndex.value = 0;
  await nextTick();
  updatePosition();
  field.value?.select?.();
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition, true);
  document.addEventListener('pointerdown', onOutsidePointer, true);
}

function close() {
  open.value = false;
  query.value = selectedLabel.value;
  window.removeEventListener('resize', updatePosition);
  window.removeEventListener('scroll', updatePosition, true);
  document.removeEventListener('pointerdown', onOutsidePointer, true);
}

function onOutsidePointer(event: PointerEvent) {
  const path = event.composedPath();
  if (!path.includes(anchor.value as EventTarget) && !path.includes(panel.value as EventTarget)) close();
}

function select(option: LocalFontOption) {
  emit('update:modelValue', option.value);
  query.value = option.label;
  close();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { close(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) { void show(); return; }
    activeIndex.value = Math.max(0, Math.min(matches.value.length - 1, activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1)));
  }
  if (event.key === 'Enter' && open.value && matches.value[activeIndex.value]) {
    event.preventDefault();
    select(matches.value[activeIndex.value]);
  }
}

onBeforeUnmount(close);
</script>

<template>
  <div ref="anchor" class="ui-font-picker">
    <UiInput
      ref="field"
      v-model="query"
      aria-label="搜索本机已安装字体"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      placeholder="搜索本机字体"
      @focus="show"
      @keydown="onKeydown"
      @update:modelValue="activeIndex = 0"
    />
    <Teleport to="body">
      <div v-if="open" ref="panel" class="ui-font-picker__panel" :style="position" role="listbox" aria-label="本机字体">
        <template v-if="matches.length">
          <button
            v-for="(option, index) in matches"
            :key="option.value"
            type="button"
            role="option"
            class="ui-font-picker__option"
            :class="{ 'is-active': activeIndex === index }"
            :aria-selected="modelValue === option.value"
            @mouseenter="activeIndex = index"
            @click="select(option)"
          >{{ option.label }}</button>
          <p v-if="filterFontOptions(options, query).length > 80" class="ui-font-picker__hint">继续输入以缩小范围</p>
        </template>
        <p v-else class="ui-font-picker__hint">没有找到匹配的本机字体</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.ui-font-picker { width: 100%; }
.ui-font-picker__panel {
  position: fixed;
  z-index: 10020;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 5px;
  border: 1px solid var(--ui-select-dropdown-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-select-dropdown-bg);
  box-shadow: var(--ui-select-dropdown-shadow);
}
.ui-font-picker__option {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: calc(var(--ui-radius-sm) - 3px);
  background: transparent;
  color: var(--ui-select-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.ui-font-picker__option:hover, .ui-font-picker__option.is-active { background: var(--ui-select-option-hover-bg); }
.ui-font-picker__option:focus-visible { outline: 2px solid var(--gt-color-primary); }
.ui-font-picker__hint { margin: 0; padding: 8px 10px; color: var(--ui-text-muted); font-size: 12px; }
</style>
