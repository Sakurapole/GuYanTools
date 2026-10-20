<script setup lang="ts">
import PluginActionIcon from './PluginActionIcon.vue';
import { computed } from 'vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiSelect, { type UiSelectOption } from '../../components/ui/UiSelect.vue';

const props = withDefaults(
  defineProps<{
    page: number;
    pageSize: number;
    total: number;
    pageSizeOptions?: number[];
  }>(),
  { pageSizeOptions: () => [6, 12, 24] }
);

const emit = defineEmits<{
  'update:page': [value: number];
  'update:pageSize': [value: number];
}>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const pageSizeOptions = computed<UiSelectOption[]>(() =>
  props.pageSizeOptions.map((value) => ({ label: `${value} / 页`, value }))
);
const pages = computed(() => {
  const count = pageCount.value;
  const current = Math.min(props.page, count);
  const start = Math.max(1, Math.min(current - 2, count - 4));
  return Array.from({ length: Math.min(5, count) }, (_, index) => start + index);
});
const startItem = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1));
const endItem = computed(() => Math.min(props.page * props.pageSize, props.total));

function goTo(page: number): void {
  emit('update:page', Math.max(1, Math.min(page, pageCount.value)));
}

function changePageSize(value: string | number): void {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return;
  emit('update:pageSize', next);
  goTo(1);
}
</script>

<template>
  <nav v-if="total > 0" class="plugin-pagination" aria-label="插件分页">
    <span class="plugin-pagination__summary">{{ startItem }}-{{ endItem }} / {{ total }}</span>
    <div class="plugin-pagination__controls">
      <UiButton
        variant="ghost"
        size="sm"
        :disabled="page <= 1"
        aria-label="上一页"
        @click="goTo(page - 1)"
        ><template #prefix><PluginActionIcon name="previous" /></template>上一页</UiButton
      >
      <UiButton
        v-for="item in pages"
        :key="item"
        variant="ghost"
        size="sm"
        :active="item === page"
        :aria-label="`第 ${item} 页`"
        :aria-current="item === page ? 'page' : undefined"
        @click="goTo(item)"
        ><template #prefix><PluginActionIcon name="page" /></template>{{ item }}</UiButton
      >
      <UiButton
        variant="ghost"
        size="sm"
        :disabled="page >= pageCount"
        aria-label="下一页"
        @click="goTo(page + 1)"
        ><template #prefix><PluginActionIcon name="next" /></template>下一页</UiButton
      >
    </div>
    <UiSelect
      class="plugin-pagination__page-size"
      :model-value="pageSize"
      :options="pageSizeOptions"
      size="sm"
      aria-label="每页显示数量"
      @update:model-value="changePageSize"
    />
  </nav>
</template>

<style scoped lang="scss">
.plugin-pagination {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 34px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.plugin-pagination__summary {
  flex: 0 0 auto;
  white-space: nowrap;
}

.plugin-pagination__controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
}

.plugin-pagination__controls > gt-button {
  min-width: 30px;
  --ui-control-height-sm: 30px;
  --ui-control-padding-x-sm: 7px;
}

.plugin-pagination__page-size {
  flex: 0 0 104px;
  width: 104px;
  min-width: 104px;
  max-width: 104px;
}

@media (max-width: 480px) {
  .plugin-pagination {
    flex-wrap: wrap;
  }
}
</style>
