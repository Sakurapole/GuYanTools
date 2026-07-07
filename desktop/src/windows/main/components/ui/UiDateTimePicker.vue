<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import UiDatePicker from './UiDatePicker.vue';
import UiTimePicker from './UiTimePicker.vue';

type PickerSize = 'sm' | 'md' | 'lg';

type PickerMode = 'date' | 'datetime';
type ValueFormat = 'date' | 'datetime-local' | 'sql' | 'timestamp';

const props = withDefaults(defineProps<{
  /** 支持 YYYY-MM-DD、YYYY-MM-DDTHH:MM、YYYY-MM-DD HH:MM[:SS] 或 Unix 毫秒时间戳 */
  modelValue: string | number | undefined;
  placeholder?: string;
  datePlaceholder?: string;
  timePlaceholder?: string;
  disabled?: boolean;
  size?: PickerSize;
  mode?: PickerMode;
  /** 输出格式。date 输出 YYYY-MM-DD；sql 输出 YYYY-MM-DD HH:MM:00。 */
  valueFormat?: ValueFormat;
  /** 兼容旧调用：valueType='string' 等价 datetime-local，valueType='timestamp' 等价 timestamp。 */
  valueType?: 'string' | 'timestamp';
  minuteStep?: number;
  clearable?: boolean;
}>(), {
  placeholder: '选择日期和时间',
  datePlaceholder: '日期',
  timePlaceholder: '时间',
  disabled: false,
  size: 'md',
  mode: 'datetime',
  valueFormat: undefined,
  valueType: undefined,
  minuteStep: 5,
  clearable: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number | undefined];
}>();

// 拆解出 datePart ('YYYY-MM-DD') 和 timePart ('HH:MM')
const resolvedValueFormat = computed<ValueFormat>(() => {
  if (props.valueFormat) return props.valueFormat;
  if (props.valueType === 'timestamp') return 'timestamp';
  if (props.mode === 'date') return 'date';
  return 'datetime-local';
});

function parseValue(val: string | number | undefined): { date: string; time: string } {
  if (!val && val !== 0) return { date: '', time: '' };

  let localStr: string;
  if (typeof val === 'number') {
    // 转换为本地时间字符串
    const d = new Date(val);
    const YYYY = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    localStr = `${YYYY}-${MM}-${DD}T${hh}:${mm}`;
  } else {
    localStr = val;
  }

  const normalized = localStr.trim();
  const sep = normalized.includes('T') ? normalized.indexOf('T') : normalized.indexOf(' ');
  if (sep === -1) return { date: localStr, time: '' };
  return { date: normalized.slice(0, sep), time: normalized.slice(sep + 1, sep + 6) };
}

const { date: initDate, time: initTime } = parseValue(props.modelValue);
const datePart = ref(initDate);
const timePart = ref(initTime || '00:00');

// 监听外部变更同步
watch(() => props.modelValue, (val) => {
  const { date, time } = parseValue(val);
  datePart.value = date;
  if (time) timePart.value = time;
});

// 内部变更 → emit 外部
function emitChange() {
  if (!datePart.value) {
    emit('update:modelValue', resolvedValueFormat.value === 'timestamp' ? undefined : '');
    return;
  }

  if (props.mode === 'date' || resolvedValueFormat.value === 'date') {
    emit('update:modelValue', datePart.value);
    return;
  }

  const combined = `${datePart.value}T${timePart.value || '00:00'}`;
  if (resolvedValueFormat.value === 'timestamp') {
    emit('update:modelValue', new Date(combined).getTime());
  } else if (resolvedValueFormat.value === 'sql') {
    emit('update:modelValue', `${datePart.value} ${timePart.value || '00:00'}:00`);
  } else {
    emit('update:modelValue', combined);
  }
}

watch(datePart, emitChange);
watch(timePart, emitChange);
</script>

<template>
  <div class="ui-datetimepicker" :class="[`ui-datetimepicker--${size}`, `ui-datetimepicker--${mode}`]">
    <UiDatePicker
      :model-value="datePart"
      :disabled="disabled"
      :size="size"
      :placeholder="mode === 'date' ? placeholder : datePlaceholder"
      :clearable="clearable"
      class="ui-datetimepicker__date"
      @update:model-value="datePart = String($event)"
    />
    <UiTimePicker
      v-if="mode === 'datetime'"
      :model-value="timePart"
      :disabled="disabled || !datePart"
      :size="size"
      :minute-step="minuteStep"
      :placeholder="timePlaceholder"
      class="ui-datetimepicker__time"
      @update:model-value="timePart = String($event)"
    />
  </div>
</template>

<style lang="scss" scoped>
.ui-datetimepicker {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.ui-datetimepicker__date {
  flex: 1.4;
  min-width: 0;
}

.ui-datetimepicker--date .ui-datetimepicker__date {
  flex: 1;
}

.ui-datetimepicker__time {
  flex: 1;
  min-width: 0;
}
</style>
