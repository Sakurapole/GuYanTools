<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { DateWidgetConfig, GridItem } from '../../../types/grid';
import { normalizeWidgetConfig } from '../registry';

const props = defineProps<{
  item: GridItem;
  interactive?: boolean;
}>();

const now = ref(new Date());
const timer = ref<number | null>(null);
const config = computed(() => normalizeWidgetConfig('date', props.item.widgetConfig) as DateWidgetConfig);
const isCompact = computed(() => props.item.colSpan <= 2 && props.item.rowSpan <= 2);
const isLarge = computed(() => props.item.colSpan >= 4 && props.item.rowSpan >= 3);

const dateFormatter = computed(() => new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}));

const yearFormatter = computed(() => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
}));

const monthGrid = computed(() => {
  const current = now.value;
  const firstDay = new Date(current.getFullYear(), current.getMonth(), 1);
  const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  const weekStartsOnSunday = config.value.weekStartsOn === 'sunday';
  const firstWeekday = firstDay.getDay();
  const offset = weekStartsOnSunday ? firstWeekday : (firstWeekday + 6) % 7;
  const cells: Array<{ day: number | null; today: boolean }> = [];

  for (let i = 0; i < offset; i += 1) {
    cells.push({ day: null, today: false });
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    cells.push({
      day,
      today: day === current.getDate(),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, today: false });
  }

  return cells;
});

onMounted(() => {
  timer.value = window.setInterval(() => {
    now.value = new Date();
  }, 60000);
});

onBeforeUnmount(() => {
  if (timer.value) clearInterval(timer.value);
});
</script>

<template>
  <div class="date-widget" :class="{ 'date-widget--compact': isCompact, 'date-widget--large': isLarge }">
    <div class="date-widget__top">
      <div class="date-widget__year">{{ yearFormatter.format(now) }}</div>
      <div class="date-widget__headline">{{ dateFormatter.format(now) }}</div>
      <div class="date-widget__day">{{ now.getDate() }}</div>
    </div>

    <div v-if="!isCompact" class="date-widget__weekdays">
      <span v-for="label in config.weekStartsOn === 'sunday' ? ['日', '一', '二', '三', '四', '五', '六'] : ['一', '二', '三', '四', '五', '六', '日']"
        :key="label">{{ label }}</span>
    </div>

    <div v-if="isLarge" class="date-widget__grid">
      <span v-for="(cell, index) in monthGrid" :key="index" :class="{ active: cell.today, muted: !cell.day }">
        {{ cell.day ?? '' }}
      </span>
    </div>

    <div v-else-if="!isCompact" class="date-widget__summary">
      <span>本月第 {{ Math.ceil(now.getDate() / 7) }} 周</span>
      <span v-if="config.showWeekNumber">周序 {{ Math.ceil((now.getDate() + 6) / 7) }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.date-widget {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  color: var(--widget-text-primary, #eff6ff);
}

.date-widget__top {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.date-widget__year {
  font-size: 12px;
  opacity: 0.82;
}

.date-widget__headline {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.date-widget__day {
  font-size: 42px;
  font-weight: 800;
  line-height: 1;
  flex-shrink: 0;
}

.date-widget__weekdays,
.date-widget__summary {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  font-size: 11px;
  opacity: 0.82;
}

.date-widget__summary {
  display: flex;
  gap: 10px;
}

.date-widget__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-template-rows: repeat(6, minmax(0, 1fr));
  gap: 3px;
  font-size: 11px;
  min-height: 0;
  flex: 1;
}

.date-widget__grid span {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--widget-text-primary, #eff6ff) 8%, transparent);
  line-height: 1;
}

.date-widget__grid span.active {
  background: color-mix(in srgb, var(--widget-text-primary, #eff6ff) 22%, transparent);
  font-weight: 700;
}

.date-widget__grid span.muted {
  background: transparent;
}

.date-widget--compact .date-widget__headline {
  font-size: 16px;
}

.date-widget--compact .date-widget__day {
  font-size: 38px;
}

.date-widget--large {
  gap: 6px;
}

.date-widget--large .date-widget__top {
  gap: 2px;
}

.date-widget--large .date-widget__year {
  font-size: 11px;
}

.date-widget--large .date-widget__headline {
  font-size: 14px;
}

.date-widget--large .date-widget__day {
  font-size: 26px;
}

.date-widget--large .date-widget__weekdays {
  font-size: 10px;
  gap: 3px;
}

.date-widget--large .date-widget__grid {
  font-size: 10px;
}
</style>
