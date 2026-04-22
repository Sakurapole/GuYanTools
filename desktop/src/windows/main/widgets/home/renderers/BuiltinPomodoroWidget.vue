<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { GridItem, PomodoroWidgetConfig } from '../../../types/grid';
import { normalizeWidgetConfig } from '../registry';

const props = withDefaults(defineProps<{
  item: GridItem;
  interactive?: boolean;
}>(), {
  interactive: true,
});

type PomodoroMode = 'focus' | 'shortBreak' | 'longBreak';

type PomodoroRuntimeState = {
  mode: PomodoroMode;
  endAt: number | null;
  remainingMs: number;
  completedFocusSessions: number;
};

const config = computed(() => normalizeWidgetConfig('pomodoro', props.item.widgetConfig) as PomodoroWidgetConfig);
const isCompact = computed(() => props.item.colSpan <= 2 && props.item.rowSpan <= 2);
const isLarge = computed(() => props.item.colSpan >= 4 && props.item.rowSpan >= 3);
const tickTimer = ref<number | null>(null);
const runtime = reactive<PomodoroRuntimeState>({
  mode: 'focus',
  endAt: null,
  remainingMs: config.value.workMinutes * 60 * 1000,
  completedFocusSessions: 0,
});

const storageKey = computed(() => `home-widget-pomodoro:${props.item.id}`);

function getModeDurationMs(mode: PomodoroMode) {
  if (mode === 'shortBreak') return config.value.shortBreakMinutes * 60 * 1000;
  if (mode === 'longBreak') return config.value.longBreakMinutes * 60 * 1000;
  return config.value.workMinutes * 60 * 1000;
}

function persistState() {
  if (!props.interactive) return;
  localStorage.setItem(storageKey.value, JSON.stringify(runtime));
}

function hydrateState() {
  if (!props.interactive) return;
  const raw = localStorage.getItem(storageKey.value);
  if (!raw) {
    runtime.remainingMs = getModeDurationMs(runtime.mode);
    return;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PomodoroRuntimeState>;
    runtime.mode = parsed.mode === 'shortBreak' || parsed.mode === 'longBreak' ? parsed.mode : 'focus';
    runtime.endAt = typeof parsed.endAt === 'number' ? parsed.endAt : null;
    runtime.remainingMs = typeof parsed.remainingMs === 'number' ? parsed.remainingMs : getModeDurationMs(runtime.mode);
    runtime.completedFocusSessions = typeof parsed.completedFocusSessions === 'number' ? parsed.completedFocusSessions : 0;
  } catch {
    runtime.mode = 'focus';
    runtime.endAt = null;
    runtime.remainingMs = getModeDurationMs('focus');
    runtime.completedFocusSessions = 0;
  }
}

function emitNotification() {
  if (!props.interactive || !config.value.enableNotification) {
    return;
  }

  const message = runtime.mode === 'focus' ? '休息结束，继续专注。' : '开始休息一下。';
  window.notificationApi?.show({
    type: 'text',
    size: 'sm',
    title: `${props.item.label} 已完成`,
    message,
    duration: 5000,
  }).catch(() => { /* ignore */ });
}

function resetForMode(mode: PomodoroMode) {
  runtime.mode = mode;
  runtime.endAt = null;
  runtime.remainingMs = getModeDurationMs(mode);
  persistState();
}

function advanceMode() {
  const wasFocus = runtime.mode === 'focus';
  if (wasFocus) {
    runtime.completedFocusSessions += 1;
    const useLongBreak = runtime.completedFocusSessions % config.value.longBreakInterval === 0;
    runtime.mode = useLongBreak ? 'longBreak' : 'shortBreak';
  } else {
    runtime.mode = 'focus';
  }

  runtime.endAt = null;
  runtime.remainingMs = getModeDurationMs(runtime.mode);
  emitNotification();

  if (config.value.autoStartNext && props.interactive) {
    runtime.endAt = Date.now() + runtime.remainingMs;
  }

  persistState();
}

function syncRemaining() {
  if (!runtime.endAt) return;
  const remaining = runtime.endAt - Date.now();
  runtime.remainingMs = Math.max(0, remaining);

  if (remaining <= 0) {
    advanceMode();
  } else {
    persistState();
  }
}

function toggleTimer() {
  if (!props.interactive) return;
  if (runtime.endAt) {
    syncRemaining();
    runtime.endAt = null;
    persistState();
    return;
  }

  runtime.endAt = Date.now() + runtime.remainingMs;
  persistState();
}

function resetTimer() {
  if (!props.interactive) return;
  resetForMode(runtime.mode);
}

function setMode(mode: PomodoroMode) {
  if (!props.interactive) return;
  resetForMode(mode);
}

const remainingText = computed(() => {
  const totalSeconds = Math.ceil(runtime.remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
});

const modeLabel = computed(() => {
  if (runtime.mode === 'shortBreak') return '短休息';
  if (runtime.mode === 'longBreak') return '长休息';
  return '专注';
});

watch(() => props.item.widgetConfig, () => {
  if (!runtime.endAt) {
    runtime.remainingMs = getModeDurationMs(runtime.mode);
  }
}, { deep: true });

onMounted(() => {
  hydrateState();
  if (!props.interactive) return;
  tickTimer.value = window.setInterval(() => {
    syncRemaining();
  }, 1000);
  syncRemaining();
});

onBeforeUnmount(() => {
  if (tickTimer.value) {
    clearInterval(tickTimer.value);
  }
});
</script>

<template>
  <div class="pomodoro-widget" :class="{ 'pomodoro-widget--compact': isCompact, 'pomodoro-widget--large': isLarge }">
    <div class="pomodoro-widget__header">
      <span class="pomodoro-widget__eyebrow">{{ modeLabel }}</span>
      <span v-if="!isCompact" class="pomodoro-widget__meta">已完成 {{ runtime.completedFocusSessions }} 次</span>
    </div>

    <div class="pomodoro-widget__time">{{ remainingText }}</div>

    <div v-if="!isCompact" class="pomodoro-widget__modes">
      <button type="button" :class="{ active: runtime.mode === 'focus' }" @click.stop="setMode('focus')" @pointerdown.stop>专注</button>
      <button type="button" :class="{ active: runtime.mode === 'shortBreak' }" @click.stop="setMode('shortBreak')" @pointerdown.stop>短休</button>
      <button type="button" :class="{ active: runtime.mode === 'longBreak' }" @click.stop="setMode('longBreak')" @pointerdown.stop>长休</button>
    </div>

    <div class="pomodoro-widget__actions">
      <button type="button" class="primary" @click.stop="toggleTimer" @pointerdown.stop>
        {{ runtime.endAt ? '暂停' : '开始' }}
      </button>
      <button v-if="!isCompact" type="button" @click.stop="resetTimer" @pointerdown.stop>重置</button>
    </div>

    <div v-if="isLarge" class="pomodoro-widget__footer">
      <span>工作 {{ config.workMinutes }} 分钟</span>
      <span>休息 {{ config.shortBreakMinutes }} / {{ config.longBreakMinutes }} 分钟</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.pomodoro-widget {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  color: #fff7ed;
}

.pomodoro-widget__header,
.pomodoro-widget__footer,
.pomodoro-widget__actions,
.pomodoro-widget__modes {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pomodoro-widget__eyebrow,
.pomodoro-widget__meta,
.pomodoro-widget__footer {
  font-size: 12px;
  opacity: 0.88;
}

.pomodoro-widget__time {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.pomodoro-widget__modes button,
.pomodoro-widget__actions button {
  border: none;
  border-radius: 999px;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.14);
  color: inherit;
  cursor: pointer;
}

.pomodoro-widget__modes button.active,
.pomodoro-widget__actions button.primary {
  background: rgba(255, 255, 255, 0.26);
}

.pomodoro-widget--compact .pomodoro-widget__time {
  font-size: 28px;
}
</style>
