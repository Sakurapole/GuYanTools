<script lang="ts" setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

type PickerSize = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  size?: PickerSize;
}>(), {
  placeholder: '选择日期',
  clearable: true,
  disabled: false,
  size: 'md',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  clear: [];
}>();

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

const isOpen = ref(false);
const placement = ref<'bottom' | 'top'>('bottom');
const panelStyle = ref<Record<string, string>>({});
const triggerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const PANEL_HEIGHT = 310;
const PANEL_WIDTH = 280;
const GAP = 6;

// 面板当前查看的月份
const viewYear = ref(new Date().getFullYear());
const viewMonth = ref(new Date().getMonth()); // 0-based

// 今天
const today = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

// 格式化为显示文本
const displayText = computed(() => {
  if (!props.modelValue) return '';
  const parts = props.modelValue.split('-');
  if (parts.length !== 3) return props.modelValue;
  return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
});

// 当选中值变化时，调整视图到选中月
watch(() => props.modelValue, (val) => {
  if (val) {
    const parts = val.split('-');
    if (parts.length === 3) {
      viewYear.value = Number(parts[0]);
      viewMonth.value = Number(parts[1]) - 1;
    }
  }
}, { immediate: true });

// 月份网格数据
const calendarDays = computed(() => {
  const year = viewYear.value;
  const month = viewMonth.value;
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];

  // 上月尾部
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    cells.push({
      day: d,
      dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: false,
    });
  }

  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: true,
    });
  }

  // 下月头部（补满6行42格）
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 1 : month + 2;
    const y = month === 11 ? year + 1 : year;
    cells.push({
      day: d,
      dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      isCurrentMonth: false,
    });
  }

  return cells;
});

const viewMonthLabel = computed(() => `${viewYear.value}年${viewMonth.value + 1}月`);

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value--;
  } else {
    viewMonth.value--;
  }
}
function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value++;
  } else {
    viewMonth.value++;
  }
}

function goToday() {
  const d = new Date();
  viewYear.value = d.getFullYear();
  viewMonth.value = d.getMonth();
}

function calcPanelPosition() {
  if (!triggerRef.value) return;
  const rect = triggerRef.value.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const needsFlip = spaceBelow < PANEL_HEIGHT + GAP && spaceAbove >= PANEL_HEIGHT + GAP;

  placement.value = needsFlip ? 'top' : 'bottom';

  const style: Record<string, string> = {};
  if (needsFlip) {
    style.bottom = `${window.innerHeight - rect.top + GAP}px`;
    style.top = 'auto';
  } else {
    style.top = `${rect.bottom + GAP}px`;
    style.bottom = 'auto';
  }

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
  if (!isOpen.value) calcPanelPosition();
  isOpen.value = !isOpen.value;
}

function selectDate(dateStr: string) {
  emit('update:modelValue', dateStr);
  isOpen.value = false;
}

function clearDate(e: Event) {
  e.stopPropagation();
  emit('update:modelValue', '');
  emit('clear');
}

function onClickOutside(e: MouseEvent) {
  if (!isOpen.value) return;
  const target = e.target as Node;
  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) return;
  isOpen.value = false;
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside, true);
});
</script>

<template>
  <div class="ui-datepicker" :class="[`ui-datepicker--${size}`, { 'ui-datepicker--disabled': disabled }]">
    <!-- 触发区域 -->
    <div ref="triggerRef" class="ui-datepicker__trigger" @click="togglePanel">
      <svg class="ui-datepicker__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span class="ui-datepicker__text" :class="{ 'ui-datepicker__text--placeholder': !modelValue }">
        {{ displayText || placeholder }}
      </span>
      <button
        v-if="clearable && modelValue"
        class="ui-datepicker__clear"
        type="button"
        @click="clearDate"
        tabindex="-1"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <line x1="4" y1="4" x2="12" y2="12"/>
          <line x1="12" y1="4" x2="4" y2="12"/>
        </svg>
      </button>
    </div>

    <!-- 弹出日历面板（fixed 定位） -->
    <Transition :name="placement === 'top' ? 'ui-datepicker-drop-up' : 'ui-datepicker-drop'">
      <div v-if="isOpen" ref="panelRef" class="ui-datepicker__panel" :style="{ ...panelStyle, position: 'fixed' }">
        <!-- 月份导航 -->
        <div class="ui-datepicker__nav">
          <button type="button" class="ui-datepicker__nav-btn" @click="prevMonth">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="10 3 5 8 10 13"/>
            </svg>
          </button>
          <button type="button" class="ui-datepicker__nav-title" @click="goToday">{{ viewMonthLabel }}</button>
          <button type="button" class="ui-datepicker__nav-btn" @click="nextMonth">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 3 11 8 6 13"/>
            </svg>
          </button>
        </div>

        <!-- 星期标题行 -->
        <div class="ui-datepicker__weekdays">
          <span v-for="w in WEEK_LABELS" :key="w" class="ui-datepicker__weekday">{{ w }}</span>
        </div>

        <!-- 日期网格 -->
        <div class="ui-datepicker__grid">
          <button
            v-for="(cell, idx) in calendarDays"
            :key="idx"
            type="button"
            class="ui-datepicker__day"
            :class="{
              'ui-datepicker__day--outside': !cell.isCurrentMonth,
              'ui-datepicker__day--today': cell.dateStr === today,
              'ui-datepicker__day--selected': cell.dateStr === modelValue,
            }"
            @click="selectDate(cell.dateStr)"
          >
            {{ cell.day }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.ui-datepicker {
  position: relative;
  display: inline-flex;
  width: 100%;

  &--disabled {
    opacity: 0.55;
    pointer-events: none;
  }
}

/* ─── 触发区域 ─── */
.ui-datepicker__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: var(--ui-border-width-thin, 1px) solid var(--ui-input-border, #d1d5db);
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-input-bg, #fff);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    border-color: var(--ui-input-focus-border, #4a90d9);
  }
}

.ui-datepicker__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ui-text-muted, #9ca3af);
}

.ui-datepicker__text {
  flex: 1;
  font-size: 0.88rem;
  color: var(--ui-input-text, #1f2937);
  line-height: 1.5;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &--placeholder {
    color: var(--ui-input-placeholder, #a0aec0);
  }
}

.ui-datepicker__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-text-muted, #9ca3af);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;

  svg {
    width: 12px;
    height: 12px;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.08);
    color: var(--ui-button-danger-bg, #ef4444);
  }
}

/* ─── 尺寸变体 ─── */
.ui-datepicker--sm .ui-datepicker__trigger {
  padding: 5px 8px;
  .ui-datepicker__text { font-size: 0.82rem; }
  .ui-datepicker__icon { width: 14px; height: 14px; }
}
.ui-datepicker--lg .ui-datepicker__trigger {
  padding: 9px 14px;
  .ui-datepicker__text { font-size: 0.96rem; }
  .ui-datepicker__icon { width: 18px; height: 18px; }
}

/* ─── 弹出面板 ─── */
.ui-datepicker__panel {
  z-index: 9999;
  width: 280px;
  padding: 12px;
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface-glass-strong, #fff);
  border: var(--ui-border-width-thin, 1px) solid var(--ui-border-subtle, #e5e7eb);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
}

/* ─── 月份导航 ─── */
.ui-datepicker__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ui-datepicker__nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--ui-radius-sm, 6px);
  background: transparent;
  color: var(--ui-text-muted, #6b7280);
  cursor: pointer;
  transition: all 0.15s ease;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    background: var(--ui-button-ghost-hover-bg, rgba(0, 0, 0, 0.06));
    color: var(--ui-input-focus-border, #4a90d9);
  }
}

.ui-datepicker__nav-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ui-input-text, #1f2937);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--ui-radius-sm, 6px);
  transition: background 0.15s ease;

  &:hover {
    background: var(--ui-button-ghost-hover-bg, rgba(0, 0, 0, 0.06));
  }
}

/* ─── 星期标题 ─── */
.ui-datepicker__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}

.ui-datepicker__weekday {
  text-align: center;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ui-text-muted, #9ca3af);
  padding: 4px 0;
  user-select: none;
}

/* ─── 日期网格 ─── */
.ui-datepicker__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.ui-datepicker__day {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border: none;
  border-radius: var(--ui-radius-sm, 6px);
  background: transparent;
  color: var(--ui-input-text, #1f2937);
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;

  &:hover {
    background: var(--ui-button-ghost-hover-bg, rgba(0, 0, 0, 0.06));
  }

  &--outside {
    color: var(--ui-text-muted, #c0c4cc);
    opacity: 0.45;
  }

  &--today {
    font-weight: 700;
    color: var(--ui-input-focus-border, #4a90d9);
    &::after {
      content: '';
      position: absolute;
      bottom: 3px;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--ui-input-focus-border, #4a90d9);
    }
  }

  &--selected {
    background: var(--ui-input-focus-border, #4a90d9) !important;
    color: #fff !important;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(74, 144, 217, 0.3);

    &::after {
      display: none;
    }
  }
}

/* ─── 展开/收起动画：向下 ─── */
.ui-datepicker-drop-enter-active,
.ui-datepicker-drop-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: top center;
}
.ui-datepicker-drop-enter-from,
.ui-datepicker-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

/* ─── 展开/收起动画：向上 ─── */
.ui-datepicker-drop-up-enter-active,
.ui-datepicker-drop-up-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: bottom center;
}
.ui-datepicker-drop-up-enter-from,
.ui-datepicker-drop-up-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.97);
}
</style>
