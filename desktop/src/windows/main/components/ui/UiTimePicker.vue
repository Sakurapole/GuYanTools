<script lang="ts" setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';

type PickerSize = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  /** HH:MM 格式字符串 */
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  size?: PickerSize;
  /** 分钟步长，默认 5 */
  minuteStep?: number;
}>(), {
  placeholder: '选择时间',
  disabled: false,
  size: 'md',
  minuteStep: 5,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const isOpen = ref(false);
/** 面板方向与位置 */
const placement = ref<'bottom' | 'top'>('bottom');
const panelStyle = ref<Record<string, string>>({});

const triggerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const hourListRef = ref<HTMLElement | null>(null);
const minuteListRef = ref<HTMLElement | null>(null);

/** 面板预估高度（columns + footer） */
const PANEL_HEIGHT = 240;
const PANEL_WIDTH = 180;
const GAP = 6;

// 解析当前值
const currentHour = computed(() => {
  if (!props.modelValue) return -1;
  const parts = props.modelValue.split(':');
  return parts.length >= 2 ? Number(parts[0]) : -1;
});

const currentMinute = computed(() => {
  if (!props.modelValue) return -1;
  const parts = props.modelValue.split(':');
  return parts.length >= 2 ? Number(parts[1]) : -1;
});

// 候选列表
const hours = Array.from({ length: 24 }, (_, i) => i);
const minutes = computed(() => {
  const result: number[] = [];
  for (let m = 0; m < 60; m += props.minuteStep) result.push(m);
  return result;
});

// 显示文本
const displayText = computed(() => {
  if (!props.modelValue) return '';
  const parts = props.modelValue.split(':');
  if (parts.length < 2) return props.modelValue;
  return `${String(Number(parts[0])).padStart(2, '0')}:${String(Number(parts[1])).padStart(2, '0')}`;
});

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function selectHour(h: number) {
  const m = currentMinute.value >= 0 ? currentMinute.value : 0;
  emit('update:modelValue', `${pad(h)}:${pad(m)}`);
}

function selectMinute(m: number) {
  const h = currentHour.value >= 0 ? currentHour.value : 0;
  emit('update:modelValue', `${pad(h)}:${pad(m)}`);
}

/** 计算弹出位置（fixed 定位） */
function calcPanelPosition() {
  if (!triggerRef.value) return;
  const rect = triggerRef.value.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const needsFlip = spaceBelow < PANEL_HEIGHT + GAP && spaceAbove >= PANEL_HEIGHT + GAP;

  placement.value = needsFlip ? 'top' : 'bottom';

  const style: Record<string, string> = {};

  // 垂直
  if (needsFlip) {
    style.bottom = `${window.innerHeight - rect.top + GAP}px`;
    style.top = 'auto';
  } else {
    style.top = `${rect.bottom + GAP}px`;
    style.bottom = 'auto';
  }

  // 水平：默认左对齐，右侧超出则右对齐
  if (rect.left + PANEL_WIDTH > window.innerWidth - 8) {
    style.right = `${window.innerWidth - rect.right}px`;
    style.left = 'auto';
  } else {
    style.left = `${rect.left}px`;
    style.right = 'auto';
  }

  panelStyle.value = style;
}

function togglePanel() {
  if (props.disabled) return;
  if (!isOpen.value) {
    calcPanelPosition();
  }
  isOpen.value = !isOpen.value;
}

function onClickOutside(e: MouseEvent) {
  if (!isOpen.value) return;
  const t = e.target as Node;
  if (triggerRef.value?.contains(t) || panelRef.value?.contains(t)) return;
  isOpen.value = false;
}

// 打开面板时滚动到当前选中项
watch(isOpen, async (open) => {
  if (!open) return;
  await new Promise(r => setTimeout(r, 20));
  scrollToSelected();
});

function scrollToSelected() {
  if (hourListRef.value) {
    const selected = hourListRef.value.querySelector('.ui-timepicker__item--selected') as HTMLElement | null;
    if (selected) {
      hourListRef.value.scrollTop = selected.offsetTop - hourListRef.value.offsetHeight / 2 + selected.offsetHeight / 2;
    }
  }
  if (minuteListRef.value) {
    const selected = minuteListRef.value.querySelector('.ui-timepicker__item--selected') as HTMLElement | null;
    if (selected) {
      minuteListRef.value.scrollTop = selected.offsetTop - minuteListRef.value.offsetHeight / 2 + selected.offsetHeight / 2;
    }
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside, true));
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside, true));
</script>

<template>
  <div class="ui-timepicker" :class="[`ui-timepicker--${size}`, { 'ui-timepicker--disabled': disabled }]">
    <!-- 触发区域 -->
    <div ref="triggerRef" class="ui-timepicker__trigger" @click="togglePanel">
      <svg class="ui-timepicker__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 15" />
      </svg>
      <span class="ui-timepicker__text" :class="{ 'ui-timepicker__text--placeholder': !modelValue }">
        {{ displayText || placeholder }}
      </span>
      <svg class="ui-timepicker__chevron" :class="{ 'ui-timepicker__chevron--open': isOpen }" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4 6 8 10 12 6" />
      </svg>
    </div>

    <!-- 下拉面板（fixed 定位，脱离父容器溢出限制） -->
    <Transition :name="placement === 'top' ? 'ui-dropdown-up' : 'ui-dropdown'">
      <div v-if="isOpen" ref="panelRef" class="ui-timepicker__panel" :style="{ ...panelStyle, position: 'fixed' }">
        <div class="ui-timepicker__columns">
          <!-- 小时列 -->
          <div class="ui-timepicker__col">
            <div class="ui-timepicker__col-header">时</div>
            <div ref="hourListRef" class="ui-timepicker__list">
              <button
                v-for="h in hours"
                :key="h"
                type="button"
                class="ui-timepicker__item"
                :class="{ 'ui-timepicker__item--selected': h === currentHour }"
                @click="selectHour(h)"
              >{{ pad(h) }}</button>
            </div>
          </div>

          <div class="ui-timepicker__sep">:</div>

          <!-- 分钟列 -->
          <div class="ui-timepicker__col">
            <div class="ui-timepicker__col-header">分</div>
            <div ref="minuteListRef" class="ui-timepicker__list">
              <button
                v-for="m in minutes"
                :key="m"
                type="button"
                class="ui-timepicker__item"
                :class="{ 'ui-timepicker__item--selected': m === currentMinute }"
                @click="selectMinute(m)"
              >{{ pad(m) }}</button>
            </div>
          </div>
        </div>

        <!-- 快捷按钮 -->
        <div class="ui-timepicker__footer">
          <button type="button" class="ui-timepicker__now-btn" @click="() => { const now = new Date(); emit('update:modelValue', `${pad(now.getHours())}:${pad(now.getMinutes())}`); isOpen = false; }">
            现在
          </button>
          <button type="button" class="ui-timepicker__ok-btn" @click="isOpen = false">确定</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.ui-timepicker {
  position: relative;
  display: inline-flex;
  width: 100%;
  min-width: 0;

  &--disabled {
    opacity: 0.55;
    pointer-events: none;
  }
}

/* ─── 触发区域 ─── */
.ui-timepicker__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 7px 10px;
  border: var(--ui-border-width-thin, 1px) solid var(--ui-input-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-input-bg);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    border-color: var(--ui-input-focus-border);
  }
}

.ui-timepicker__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
}

.ui-timepicker__text {
  flex: 1;
  min-width: 0;
  font-size: 0.88rem;
  color: var(--ui-input-text);
  line-height: 1.5;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';

  &--placeholder {
    color: var(--ui-input-placeholder);
  }
}

.ui-timepicker__chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--ui-text-muted);
  transition: transform 0.18s ease;

  &--open {
    transform: rotate(180deg);
  }
}

/* ─── 尺寸 ─── */
.ui-timepicker--sm .ui-timepicker__trigger {
  gap: 6px;
  padding: 5px 7px;
  .ui-timepicker__text { font-size: 0.82rem; }
  .ui-timepicker__icon { width: 14px; height: 14px; }
  .ui-timepicker__chevron { width: 12px; height: 12px; }
}
.ui-timepicker--lg .ui-timepicker__trigger {
  padding: 9px 14px;
  .ui-timepicker__text { font-size: 0.96rem; }
  .ui-timepicker__icon { width: 18px; height: 18px; }
}

/* ─── 弹出面板 ─── */
.ui-timepicker__panel {
  z-index: 10040;
  width: 180px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-glass-strong);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.ui-timepicker__columns {
  display: flex;
  align-items: flex-start;
  padding: 8px 4px 4px;
}

.ui-timepicker__sep {
  padding: 28px 2px 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ui-text-muted);
  user-select: none;
}

.ui-timepicker__col {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.ui-timepicker__col-header {
  text-align: center;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--ui-text-muted);
  padding: 0 0 6px;
  user-select: none;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ui-timepicker__list {
  height: 180px;
  overflow-y: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.ui-timepicker__item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-input-text);
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover {
    background: var(--ui-icon-button-hover-bg);
  }

  &--selected {
    background: var(--ui-button-primary-bg) !important;
    color: var(--ui-button-primary-text) !important;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
}

/* ─── 底部操作 ─── */
.ui-timepicker__footer {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 6px 8px;
  border-top: var(--ui-border-width-thin) solid var(--ui-border-subtle);
}

.ui-timepicker__now-btn,
.ui-timepicker__ok-btn {
  padding: 4px 12px;
  border-radius: var(--ui-radius-sm);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.ui-timepicker__now-btn {
  background: transparent;
  color: var(--ui-text-muted);

  &:hover {
    background: var(--ui-icon-button-hover-bg);
    color: var(--ui-input-text);
  }
}

.ui-timepicker__ok-btn {
  background: var(--ui-button-primary-bg);
  color: var(--ui-button-primary-text);
  box-shadow: var(--ui-button-primary-shadow);

  &:hover {
    background: var(--ui-button-primary-hover-bg);
  }
}

</style>
