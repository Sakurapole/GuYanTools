<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import type { UiSelectOption } from '@/windows/main/components/ui/UiSelect.vue';

const props = defineProps<{ modelValue?: string }>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
  clear: [];
}>();

const isOpen = ref(false);
const placement = ref<'bottom' | 'top'>('bottom');
const panelStyle = ref<Record<string, string>>({});
const panelRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);

// 自定义间隔
const customInterval = ref('1');
const customUnit = ref<'day' | 'week' | 'month'>('day');
const showCustom = ref(false);
const PANEL_WIDTH = 260;
const PANEL_HEIGHT = 360;
const GAP = 8;

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

const repeatUnitOptions: UiSelectOption[] = [
  { label: '天', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
];

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

function selectPreset(value: string) {
  emit('update:modelValue', value);
  isOpen.value = false;
}

function confirmCustom() {
  const interval = Math.min(Math.max(Number(customInterval.value) || 1, 1), 365);
  customInterval.value = String(interval);
  const rule = JSON.stringify({ type: 'custom', interval, unit: customUnit.value });
  emit('update:modelValue', rule);
  isOpen.value = false;
  showCustom.value = false;
}

function setCustomUnit(value: string | number) {
  customUnit.value = String(value) as 'day' | 'week' | 'month';
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
  if (target instanceof Element && target.closest('.ui-select-dropdown')) return;
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
  <div class="repeat-picker">
    <button ref="triggerRef" class="repeat-trigger" @click="togglePanel">
      <IconRenderer icon="iconify:lucide:repeat-2" :size="16" />
      <span :class="{ 'has-value': hasRule }">{{ currentLabel }}</span>
    </button>

    <Teleport to="body">
      <Transition :name="placement === 'top' ? 'ui-dropdown-up' : 'ui-dropdown'">
        <div v-if="isOpen" ref="panelRef" class="repeat-panel" :style="panelStyle">
          <div class="panel-title">重复规则</div>
          <button v-for="opt in presetOptions" :key="opt.value" class="panel-option"
            :class="{ selected: modelValue === opt.value }" @click="selectPreset(opt.value)">
            <IconRenderer icon="iconify:lucide:repeat-2" :size="14" />
            {{ opt.label }}
          </button>
          <div class="panel-divider"/>
          <button class="panel-option" @click="showCustom = !showCustom">
            <IconRenderer icon="iconify:lucide:settings" :size="14" />
            自定义...
          </button>
          <div v-if="showCustom" class="custom-row">
            <span class="custom-label">每</span>
            <UiInput
              v-model="customInterval"
              class="custom-number"
              type="number"
              size="sm"
              :min="1"
              :max="365"
            />
            <UiSelect
              :model-value="customUnit"
              :options="repeatUnitOptions"
              size="sm"
              class="custom-select"
              @update:model-value="setCustomUnit"
            />
            <UiButton class="custom-confirm" variant="primary" size="sm" @click="confirmCustom">确定</UiButton>
          </div>
          <div v-if="hasRule" class="panel-divider"/>
          <button v-if="hasRule" class="panel-option panel-option--danger" @click="clearRule">
            <IconRenderer icon="iconify:lucide:x" :size="14" />
            移除重复
          </button>
        </div>
      </Transition>
    </Teleport>
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
  position: fixed;
  z-index: 10020;
  padding: 8px 0;
  background: var(--ui-surface-glass-strong, #fff);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 10px;
  box-shadow: var(--todo-popup-shadow);
  overflow: auto;
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
.panel-option--danger:hover { background: var(--todo-danger-bg); }
.panel-divider {
  height: 1px;
  background: var(--ui-border-subtle);
  margin: 4px 0;
}

.custom-row {
  display: grid;
  grid-template-columns: auto 56px 78px auto;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
}
.custom-label {
  font-size: 0.82em;
  color: var(--ui-text-muted);
}
.custom-number,
.custom-select {
  min-width: 0;
}
.custom-number :deep(.ui-input-number-controls) {
  display: none;
}
.custom-number :deep(.ui-input--number) {
  padding-right: var(--ui-control-padding-x-sm);
  text-align: center;
}
.custom-confirm {
  min-width: 52px;
}

</style>
