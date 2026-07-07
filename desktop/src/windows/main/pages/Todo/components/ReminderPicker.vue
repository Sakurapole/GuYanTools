<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useTodoStore } from '@/windows/main/stores/todo_store';
import type { TodoReminder } from '@/contracts/todo';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiDateTimePicker from '@/windows/main/components/ui/UiDateTimePicker.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';

const props = defineProps<{ todoId: string; reminders: TodoReminder[] }>();
const todoStore = useTodoStore();

const isOpen = ref(false);
const placement = ref<'bottom' | 'top'>('bottom');
const panelStyle = ref<Record<string, string>>({});
const panelRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);

// 自定义日期时间
const customDateTime = ref('');
const showCustom = ref(false);
const PANEL_WIDTH = 292;
const PANEL_HEIGHT = 360;
const GAP = 8;

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

function calcPanelPosition() {
  if (!triggerRef.value) return;
  const rect = triggerRef.value.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const needsFlip = spaceBelow < PANEL_HEIGHT + GAP && spaceAbove > spaceBelow;

  placement.value = needsFlip ? 'top' : 'bottom';

  const style: Record<string, string> = {
    width: `${PANEL_WIDTH}px`,
    maxHeight: `${Math.max(220, window.innerHeight - 16)}px`,
  };
  if (needsFlip) {
    style.bottom = `${Math.max(8, window.innerHeight - rect.top + GAP)}px`;
    style.top = 'auto';
  } else {
    style.top = `${Math.min(rect.bottom + GAP, window.innerHeight - 8)}px`;
    style.bottom = 'auto';
  }

  if (rect.left + PANEL_WIDTH > window.innerWidth - 8) {
    style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    style.left = 'auto';
  } else {
    style.left = `${Math.max(8, rect.left)}px`;
    style.right = 'auto';
  }

  panelStyle.value = style;
}

async function togglePanel() {
  if (!isOpen.value) {
    showCustom.value = false;
    calcPanelPosition();
    isOpen.value = true;
    await nextTick();
    calcPanelPosition();
    return;
  }
  isOpen.value = false;
}

async function selectQuickOption(dateTime: string) {
  await todoStore.addReminder(props.todoId, dateTime);
  isOpen.value = false;
}

async function confirmCustom() {
  if (!customDateTime.value) return;
  await todoStore.addReminder(props.todoId, customDateTime.value);
  isOpen.value = false;
  showCustom.value = false;
  customDateTime.value = '';
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
  if (target instanceof Element && target.closest('.ui-datepicker__panel, .ui-timepicker__panel')) return;
  isOpen.value = false;
}

function onViewportChange() {
  if (isOpen.value) calcPanelPosition();
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside, true);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside, true);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
});
</script>

<template>
  <div class="reminder-picker">
    <span ref="triggerRef" class="reminder-trigger-wrap">
      <UiButton class="reminder-trigger" variant="ghost" type="button" @click="togglePanel">
        <IconRenderer icon="iconify:lucide:clock" :size="16" />
        <span>{{ hasReminders ? `${reminders.length} 个提醒` : '添加提醒' }}</span>
      </UiButton>
    </span>

    <!-- 已有提醒列表 -->
    <div v-if="hasReminders" class="reminder-list">
      <div v-for="r in reminders" :key="r.id" class="reminder-tag" :class="{ sent: r.isSent }">
        <IconRenderer icon="iconify:lucide:bell" :size="12" />
        <span>{{ formatDateTime(r.remindAt) }}</span>
        <UiIconButton class="reminder-remove" size="sm" variant="ghost" title="删除提醒" @click="removeReminder(r.id)">
          <IconRenderer icon="iconify:lucide:x" :size="10" />
        </UiIconButton>
      </div>
    </div>

    <Teleport to="body">
      <Transition :name="placement === 'top' ? 'ui-dropdown-up' : 'ui-dropdown'">
        <div v-if="isOpen" ref="panelRef" class="reminder-panel" :style="panelStyle">
          <div class="panel-title">设置提醒</div>
          <UiButton v-for="opt in quickOptions" :key="opt.dateTime" class="panel-option" variant="ghost" type="button" @click="selectQuickOption(opt.dateTime)">
            <IconRenderer icon="iconify:lucide:clock" :size="14" />
            {{ opt.label }}
          </UiButton>
          <div class="panel-divider"/>
          <UiButton class="panel-option" variant="ghost" type="button" @click="showCustom = !showCustom">
            <IconRenderer icon="iconify:lucide:calendar-clock" :size="14" />
            自定义日期和时间...
          </UiButton>
          <div v-if="showCustom" class="custom-inputs">
            <UiDateTimePicker
              v-model="customDateTime"
              mode="datetime"
              value-format="sql"
              size="sm"
              placeholder="选择提醒时间"
              class="custom-datetime"
            />
            <UiButton class="custom-confirm" variant="primary" size="sm" :disabled="!customDateTime" @click="confirmCustom">确定</UiButton>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.reminder-picker {
  position: relative;
}
.reminder-trigger-wrap {
  display: block;
}
.reminder-trigger.ui-button {
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
  font-weight: inherit;
  white-space: normal;
  transform: none;
}
.reminder-trigger.ui-button:hover:not(:disabled) { color: var(--ui-input-focus-border); transform: none; }
.reminder-trigger :deep(.ui-button__label),
.panel-option :deep(.ui-button__label) {
  justify-content: flex-start;
  width: 100%;
}

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
.reminder-remove.ui-icon-button {
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
  transform: none;
}
.reminder-remove.ui-icon-button:hover:not(:disabled) {
  background: var(--todo-danger-bg);
  color: var(--ui-button-danger-text);
  transform: none;
}

.reminder-panel {
  position: fixed;
  z-index: var(--ui-z-picker);
  padding: 8px 0;
  background: var(--ui-surface-glass-strong, #fff);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 10px;
  box-shadow: var(--todo-popup-shadow);
  overflow: visible;
  box-sizing: border-box;
}
.panel-title {
  padding: 6px 14px;
  font-size: 0.78em;
  font-weight: 600;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.panel-option.ui-button {
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
  font-weight: inherit;
  white-space: normal;
  transform: none;
}
.panel-option.ui-button:hover:not(:disabled) { background: var(--ui-button-ghost-hover-bg); transform: none; }
.panel-divider {
  height: 1px;
  background: var(--ui-border-subtle);
  margin: 4px 0;
}

.custom-inputs {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  padding: 8px 14px;
  align-items: center;
}
.custom-datetime {
  min-width: 0;
}
.custom-confirm {
  min-width: 52px;
}

</style>
