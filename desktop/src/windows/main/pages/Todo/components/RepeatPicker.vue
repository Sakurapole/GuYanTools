<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{ modelValue?: string }>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
  clear: [];
}>();

const isOpen = ref(false);
const panelRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);

// 自定义间隔
const customInterval = ref(1);
const customUnit = ref<'day' | 'week' | 'month'>('day');
const showCustom = ref(false);

interface RepeatRule {
  type: string;
  interval?: number;
  unit?: string;
}

function parseRule(json?: string): RepeatRule | null {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

const currentRule = computed(() => parseRule(props.modelValue));
const currentLabel = computed(() => {
  const r = currentRule.value;
  if (!r) return '不重复';
  switch (r.type) {
    case 'daily': return '每天';
    case 'weekday': return '每个工作日';
    case 'weekly': return '每周';
    case 'monthly': return '每月';
    case 'yearly': return '每年';
    case 'custom':
      const unitMap: Record<string, string> = { day: '天', week: '周', month: '月' };
      return `每 ${r.interval || 1} ${unitMap[r.unit || 'day'] || '天'}`;
    default: return '不重复';
  }
});

const hasRule = computed(() => !!currentRule.value);

const presetOptions = [
  { label: '每天', value: '{"type":"daily"}' },
  { label: '每个工作日', value: '{"type":"weekday"}' },
  { label: '每周', value: '{"type":"weekly"}' },
  { label: '每月', value: '{"type":"monthly"}' },
  { label: '每年', value: '{"type":"yearly"}' },
];

function togglePanel() {
  isOpen.value = !isOpen.value;
  showCustom.value = false;
}

function selectPreset(value: string) {
  emit('update:modelValue', value);
  isOpen.value = false;
}

function confirmCustom() {
  const rule = JSON.stringify({ type: 'custom', interval: customInterval.value, unit: customUnit.value });
  emit('update:modelValue', rule);
  isOpen.value = false;
  showCustom.value = false;
}

function clearRule() {
  emit('update:modelValue', '');
  emit('clear');
  isOpen.value = false;
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
  <div class="repeat-picker">
    <button ref="triggerRef" class="repeat-trigger" @click="togglePanel">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
      <span :class="{ 'has-value': hasRule }">{{ currentLabel }}</span>
    </button>

    <Transition name="picker-drop">
      <div v-if="isOpen" ref="panelRef" class="repeat-panel">
        <div class="panel-title">重复规则</div>
        <button v-for="opt in presetOptions" :key="opt.value" class="panel-option"
          :class="{ selected: modelValue === opt.value }" @click="selectPreset(opt.value)">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
          {{ opt.label }}
        </button>
        <div class="panel-divider"/>
        <button class="panel-option" @click="showCustom = !showCustom">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          自定义...
        </button>
        <div v-if="showCustom" class="custom-row">
          <span class="custom-label">每</span>
          <input type="number" v-model.number="customInterval" min="1" max="365" class="custom-number" />
          <select v-model="customUnit" class="custom-select">
            <option value="day">天</option>
            <option value="week">周</option>
            <option value="month">月</option>
          </select>
          <button class="custom-confirm" @click="confirmCustom">确定</button>
        </div>
        <div v-if="hasRule" class="panel-divider"/>
        <button v-if="hasRule" class="panel-option panel-option--danger" @click="clearRule">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>
          </svg>
          移除重复
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.repeat-picker {
  position: relative;
}
.repeat-trigger {
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
.repeat-trigger:hover { color: var(--ui-input-focus-border); }
.has-value { color: var(--ui-input-focus-border); font-weight: 500; }

.repeat-panel {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 999;
  width: 240px;
  padding: 8px 0;
  background: var(--ui-surface-glass-strong, #fff);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06);
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
.panel-option.selected { color: var(--ui-input-focus-border); font-weight: 600; }
.panel-option--danger { color: #ef4444; }
.panel-option--danger:hover { background: rgba(239, 68, 68, 0.06); }
.panel-divider {
  height: 1px;
  background: var(--ui-border-subtle);
  margin: 4px 0;
}

.custom-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
}
.custom-label {
  font-size: 0.82em;
  color: var(--ui-text-muted);
}
.custom-number {
  width: 48px;
  padding: 4px 6px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  font-size: 0.82em;
  outline: none;
  background: var(--ui-input-bg);
  color: var(--ui-text-primary);
  text-align: center;
}
.custom-number:focus { border-color: var(--ui-input-focus-border); }
.custom-select {
  padding: 4px 6px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 6px;
  font-size: 0.82em;
  outline: none;
  background: var(--ui-input-bg);
  color: var(--ui-text-primary);
}
.custom-select:focus { border-color: var(--ui-input-focus-border); }
.custom-confirm {
  padding: 4px 10px;
  background: var(--ui-input-focus-border);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.78em;
  cursor: pointer;
}
.custom-confirm:hover { opacity: 0.9; }

.picker-drop-enter-active, .picker-drop-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: top left;
}
.picker-drop-enter-from, .picker-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
</style>
