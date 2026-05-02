<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { HomeWidgetType, WidgetConfig } from '../../types/grid';
import UiField from '../../components/ui/UiField.vue';
import UiInput from '../../components/ui/UiInput.vue';
import UiSelect from '../../components/ui/UiSelect.vue';
import { useFtpStore } from '../../stores/ftp_store';
import { normalizeWidgetConfig } from './registry';
import { weatherCityOptions } from './weather_city_options';

const props = defineProps<{
  widgetType: HomeWidgetType;
  modelValue?: WidgetConfig;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: WidgetConfig | undefined];
}>();

const booleanOptions = [
  { label: '开启', value: 'true' },
  { label: '关闭', value: 'false' },
];
const ftpStore = useFtpStore();
const ftpConfigLoading = ref(false);

const normalizedConfig = computed(() => normalizeWidgetConfig(props.widgetType, props.modelValue));
const ftpFolderOptions = computed(() => [
  { label: '未分组', value: '' },
  ...flattenFtpFolders().map(({ id, label, depth }) => ({
    label: `${'  '.repeat(depth)}${label}`,
    value: id,
  })),
]);
const ftpProfileOptions = computed(() =>
  [...ftpStore.profiles]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN'))
    .map((profile) => ({
      label: `${profile.label} (${profile.protocol.toUpperCase()} · ${profile.username}@${profile.host})`,
      value: profile.id,
    })),
);

function updateConfigField(key: string, value: unknown) {
  const next = {
    ...(normalizedConfig.value && typeof normalizedConfig.value === 'object' ? normalizedConfig.value : {}),
    [key]: value,
  };
  emit('update:modelValue', normalizeWidgetConfig(props.widgetType, next));
}

function flattenFtpFolders(parentId = '', depth = 0): Array<{ id: string; label: string; depth: number }> {
  return ftpStore.folders
    .filter((folder) => (folder.parentId ?? '') === parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt)
    .flatMap((folder) => [
      { id: folder.id, label: folder.label, depth },
      ...flattenFtpFolders(folder.id, depth + 1),
    ]);
}

async function loadFtpConfigOptions() {
  if (props.widgetType !== 'ftp_profile_group' && props.widgetType !== 'ftp_profile') return;
  ftpConfigLoading.value = true;
  try {
    await Promise.all([
      ftpStore.refreshProfiles(),
      ftpStore.refreshFolders(),
    ]);
  } finally {
    ftpConfigLoading.value = false;
  }
}

onMounted(() => {
  void loadFtpConfigOptions();
});

watch(() => props.widgetType, () => {
  void loadFtpConfigOptions();
});
</script>

<template>
  <div v-if="props.widgetType === 'pomodoro'" class="home-widget-config-fields">
    <UiField label="专注时长（分钟）">
      <UiInput :model-value="String((normalizedConfig as any)?.workMinutes ?? 25)" type="number" :min="1" :max="180"
        size="md" @update:modelValue="updateConfigField('workMinutes', Number($event))" />
    </UiField>
    <UiField label="短休息（分钟）">
      <UiInput :model-value="String((normalizedConfig as any)?.shortBreakMinutes ?? 5)" type="number" :min="1" :max="60"
        size="md" @update:modelValue="updateConfigField('shortBreakMinutes', Number($event))" />
    </UiField>
    <UiField label="长休息（分钟）">
      <UiInput :model-value="String((normalizedConfig as any)?.longBreakMinutes ?? 15)" type="number" :min="1" :max="120"
        size="md" @update:modelValue="updateConfigField('longBreakMinutes', Number($event))" />
    </UiField>
    <UiField label="长休轮次">
      <UiInput :model-value="String((normalizedConfig as any)?.longBreakInterval ?? 4)" type="number" :min="2" :max="10"
        size="md" @update:modelValue="updateConfigField('longBreakInterval', Number($event))" />
    </UiField>
    <UiField label="自动进入下一阶段">
      <UiSelect :model-value="String((normalizedConfig as any)?.autoStartNext ?? false)"
        :options="booleanOptions" size="md" @update:modelValue="updateConfigField('autoStartNext', $event === 'true')" />
    </UiField>
    <UiField label="到时通知">
      <UiSelect :model-value="String((normalizedConfig as any)?.enableNotification ?? true)"
        :options="booleanOptions" size="md" @update:modelValue="updateConfigField('enableNotification', $event === 'true')" />
    </UiField>
    <UiField label="到时提示音">
      <UiSelect :model-value="String((normalizedConfig as any)?.enableSound ?? false)"
        :options="booleanOptions" size="md" @update:modelValue="updateConfigField('enableSound', $event === 'true')" />
    </UiField>
  </div>

  <div v-else-if="props.widgetType === 'date'" class="home-widget-config-fields">
    <UiField label="默认展示模式">
      <UiSelect :model-value="(normalizedConfig as any)?.displayMode ?? 'today'" size="md" :options="[
        { label: '今日优先', value: 'today' },
        { label: '月历优先', value: 'calendar' },
      ]" @update:modelValue="updateConfigField('displayMode', $event)" />
    </UiField>
    <UiField label="每周起始日">
      <UiSelect :model-value="(normalizedConfig as any)?.weekStartsOn ?? 'monday'" size="md" :options="[
        { label: '周一', value: 'monday' },
        { label: '周日', value: 'sunday' },
      ]" @update:modelValue="updateConfigField('weekStartsOn', $event)" />
    </UiField>
    <UiField label="显示周数">
      <UiSelect :model-value="String((normalizedConfig as any)?.showWeekNumber ?? true)"
        :options="booleanOptions" size="md" @update:modelValue="updateConfigField('showWeekNumber', $event === 'true')" />
    </UiField>
  </div>

  <div v-else-if="props.widgetType === 'weather'" class="home-widget-config-fields">
    <UiField label="城市">
      <UiSelect :model-value="(normalizedConfig as any)?.city ?? '上海'" size="md" :options="weatherCityOptions"
        placeholder="请选择城市" @update:modelValue="updateConfigField('city', $event)" />
    </UiField>
    <UiField label="温度单位">
      <UiSelect :model-value="(normalizedConfig as any)?.unit ?? 'celsius'" size="md" :options="[
        { label: '摄氏度', value: 'celsius' },
        { label: '华氏度', value: 'fahrenheit' },
      ]" @update:modelValue="updateConfigField('unit', $event)" />
    </UiField>
    <UiField label="刷新频率（分钟）">
      <UiInput :model-value="String((normalizedConfig as any)?.refreshMinutes ?? 30)" type="number" :min="5" :max="180"
        size="md" @update:modelValue="updateConfigField('refreshMinutes', Number($event))" />
    </UiField>
    <UiField label="显示小时趋势">
      <UiSelect :model-value="String((normalizedConfig as any)?.showHourly ?? true)"
        :options="booleanOptions" size="md" @update:modelValue="updateConfigField('showHourly', $event === 'true')" />
    </UiField>
    <UiField label="显示未来预报">
      <UiSelect :model-value="String((normalizedConfig as any)?.showDaily ?? true)"
        :options="booleanOptions" size="md" @update:modelValue="updateConfigField('showDaily', $event === 'true')" />
    </UiField>
  </div>

  <div v-else-if="props.widgetType === 'todo'" class="home-widget-config-fields">
    <UiField label="显示视图">
      <UiSelect :model-value="(normalizedConfig as any)?.view ?? 'my-day'" size="md" :options="[
        { label: '我的一天', value: 'my-day' },
        { label: '重要', value: 'important' },
        { label: '计划内', value: 'planned' },
        { label: '全部任务', value: 'all' },
        { label: '已完成', value: 'completed' },
      ]" @update:modelValue="updateConfigField('view', $event)" />
    </UiField>
    <UiField label="快速新增任务">
      <UiSelect :model-value="String((normalizedConfig as any)?.allowQuickAdd ?? true)"
        :options="booleanOptions" size="md" @update:modelValue="updateConfigField('allowQuickAdd', $event === 'true')" />
    </UiField>
    <UiField label="显示已完成任务">
      <UiSelect :model-value="String((normalizedConfig as any)?.showCompleted ?? false)"
        :options="booleanOptions" size="md" @update:modelValue="updateConfigField('showCompleted', $event === 'true')" />
    </UiField>
  </div>

  <div v-else-if="props.widgetType === 'ftp_profile_group'" class="home-widget-config-fields">
    <UiField label="配置分组">
      <UiSelect :model-value="(normalizedConfig as any)?.folderId ?? ''" size="md" :options="ftpFolderOptions"
        :placeholder="ftpConfigLoading ? '正在读取分组...' : '请选择分组'"
        @update:modelValue="updateConfigField('folderId', $event)" />
    </UiField>
  </div>

  <div v-else-if="props.widgetType === 'ftp_profile'" class="home-widget-config-fields">
    <UiField label="配置文件">
      <UiSelect :model-value="(normalizedConfig as any)?.profileId ?? ''" size="md" :options="ftpProfileOptions"
        :placeholder="ftpConfigLoading ? '正在读取配置...' : '请选择配置文件'"
        @update:modelValue="updateConfigField('profileId', $event)" />
    </UiField>
  </div>
</template>

<style lang="scss" scoped>
.home-widget-config-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
