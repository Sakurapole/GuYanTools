<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import UiDatePicker from './UiDatePicker.vue';
import UiTimePicker from './UiTimePicker.vue';

type PickerSize = 'sm' | 'md' | 'lg';

/**
 * UiDateTimePicker
 * v-model 使用本地时间字符串格式：'YYYY-MM-DDTHH:MM'（与 datetime-local 原生 input 兼容）
 * 或者 Unix 时间戳（毫秒），通过 valueType='timestamp' 控制
 */
const props = withDefaults(defineProps<{
  /** 'datetime-local' 格式字符串 'YYYY-MM-DDTHH:MM'，或 Unix 时间戳（毫秒）*/
  modelValue: string | number | undefined;
  placeholder?: string;
  disabled?: boolean;
  size?: PickerSize;
  /** 值类型：'string' = YYYY-MM-DDTHH:MM，'timestamp' = 毫秒时间戳 */
  valueType?: 'string' | 'timestamp';
  minuteStep?: number;
}>(), {
  placeholder: '选择日期和时间',
  disabled: false,
  size: 'md',
  valueType: 'string',
  minuteStep: 5,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number | undefined];
}>();

// 拆解出 datePart ('YYYY-MM-DD') 和 timePart ('HH:MM')
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

  // YYYY-MM-DDTHH:MM
  const sep = localStr.indexOf('T');
  if (sep === -1) return { date: localStr, time: '' };
  return { date: localStr.slice(0, sep), time: localStr.slice(sep + 1, sep + 6) };
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
    emit('update:modelValue', props.valueType === 'timestamp' ? undefined : '');
    return;
  }
  const combined = `${datePart.value}T${timePart.value || '00:00'}`;
  if (props.valueType === 'timestamp') {
    emit('update:modelValue', new Date(combined).getTime());
  } else {
    emit('update:modelValue', combined);
  }
}

watch(datePart, emitChange);
watch(timePart, emitChange);
</script>

<template>
  <div class="ui-datetimepicker" :class="`ui-datetimepicker--${size}`">
    <UiDatePicker
      :model-value="datePart"
      :disabled="disabled"
      :size="size"
      placeholder="日期"
      class="ui-datetimepicker__date"
      @update:model-value="datePart = String($event)"
    />
    <UiTimePicker
      :model-value="timePart"
      :disabled="disabled || !datePart"
      :size="size"
      :minute-step="minuteStep"
      placeholder="时间"
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

.ui-datetimepicker__time {
  flex: 1;
  min-width: 0;
}
</style>
