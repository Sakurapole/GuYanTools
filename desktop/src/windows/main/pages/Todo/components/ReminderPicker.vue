<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import type { TodoReminder } from '@/contracts/todo';

const props = defineProps<{ todoId: string; reminders: TodoReminder[] }>();
const todoStore = useTodoStore();

const isOpen = ref(false);
const panelRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);

// 自定义日期时间
const customDate = ref('');
const customTime = ref('');
const showCustom = ref(false);

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextMondayStr(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const quickOptions = computed(() => [
  { label: '今天晚些时候 (18:00)', dateTime: `${todayStr()} 18:00:00` },
  { label: '明天上午 (09:00)', dateTime: `${tomorrowStr()} 09:00:00` },
  { label: '下周一上午 (09:00)', dateTime: `${nextMondayStr()} 09:00:00` },
]);

const hasReminders = computed(() => props.reminders.length > 0);

function togglePanel() {
  isOpen.value = !isOpen.value;
  showCustom.value = false;
}

async function selectQuickOption(dateTime: string) {
  await todoStore.addReminder(props.todoId, dateTime);
  isOpen.value = false;
}

async function confirmCustom() {
  if (!customDate.value || !customTime.value) return;
  const dateTime = `${customDate.value} ${customTime.value}:00`;
  await todoStore.addReminder(props.todoId, dateTime);
  isOpen.value = false;
  showCustom.value = false;
  customDate.value = '';
  customTime.value = '';
}

async function removeReminder(reminderId: string) {
  await todoStore.deleteReminder(reminderId);
}

function formatDateTime(dt: string): string {
  if (!dt) return '';
  const parts = dt.split(' ');
  const datePart = parts[0] || '';
  const timePart = parts[1] || '';
  const dp = datePart.split('-');
  if (dp.length !== 3) return dt;
  return `${Number(dp[1])}月${Number(dp[2])}日 ${timePart.slice(0, 5)}`;
}

function onClickOutside(e: MouseEvent) {
  if (!isOpen.value) return;
  const target = e.target as Node;
  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) return;
  isOpen.value = false;
}

onMounted(() => document.addEventListener('mousedown', onClickOutside, true));
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside, true));
</script>

<template>
  <div class="reminder-picker">
    <button ref="triggerRef" class="reminder-trigger" @click="togglePanel">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      <span>{{ hasReminders ? `${reminders.length} 个提醒` : '添加提醒' }}</span>
    </button>

    <!-- 已有提醒列表 -->
    <div v-if="hasReminders" class="reminder-list">
      <div v-for="r in reminders" :key="r.id" class="reminder-tag" :class="{ sent: r.isSent }">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span>{{ formatDateTime(r.remindAt) }}</span>
        <button class="reminder-remove" @click="removeReminder(r.id)">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 下拉面板 -->
    <Transition name="ui-dropdown">
      <div v-if="isOpen" ref="panelRef" class="reminder-panel">
        <div class="panel-title">设置提醒</div>
        <button v-for="opt in quickOptions" :key="opt.dateTime" class="panel-option" @click="selectQuickOption(opt.dateTime)">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {{ opt.label }}
        </button>
        <div class="panel-divider"/>
        <button class="panel-option" @click="showCustom = !showCustom">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
          </svg>
          自定义日期和时间...
        </button>
        <div v-if="showCustom" class="custom-inputs">
          <input type="date" v-model="customDate" class="custom-input" />
          <input type="time" v-model="customTime" class="custom-input" />
          <button class="custom-confirm" @click="confirmCustom" :disabled="!customDate || !customTime">确定</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.reminder-picker {
  position: relative;
}
.reminder-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.85em;
  color: var(--ui-text-primary);
  width: 100%;
  text-align: left;
}
.reminder-trigger:hover { color: var(--ui-input-focus-border); }

.reminder-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.reminder-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 0.75em;
  background: var(--ui-surface-overlay);
  border-radius: 6px;
  color: var(--ui-input-focus-border);
  border: 1px solid var(--ui-border-accent-soft);
}
.reminder-tag.sent {
  opacity: 0.5;
  text-decoration: line-through;
}
.reminder-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  border-radius: 50%;
}
.reminder-remove:hover {
  background: var(--todo-danger-bg);
  color: var(--ui-button-danger-text);
}

.reminder-panel {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 999;
  width: 260px;
  padding: 8px 0;
  background: var(--ui-surface-glass-strong, #fff);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 10px;
  box-shadow: var(--todo-popup-shadow);
}
.panel-title {
  padding: 6px 14px;
  font-size: 0.78em;
  font-weight: 600;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.panel-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.82em;
  color: var(--ui-text-primary);
  text-align: left;
  transition: background 0.15s;
}
.panel-option:hover { background: var(--ui-button-ghost-hover-bg); }
.panel-divider {
  height: 1px;
  background: var(--ui-border-subtle);
  margin: 4px 0;
}

.custom-inputs {
  display: flex;
  gap: 6px;
  padding: 8px 14px;
  flex-wrap: wrap;
}
.custom-input {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  font-size: 0.8em;
  outline: none;
  background: var(--ui-input-bg);
  color: var(--ui-text-primary);
}
.custom-input:focus { border-color: var(--ui-input-focus-border); }
.custom-confirm {
  padding: 5px 12px;
  background: var(--ui-input-focus-border);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.8em;
  cursor: pointer;
  transition: opacity 0.15s;
}
.custom-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
.custom-confirm:hover:not(:disabled) { opacity: 0.9; }

</style>
