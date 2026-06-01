<script setup lang="ts">
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiRange from '@/windows/main/components/ui/UiRange.vue';

export type CanvasTool = 'select' | 'text' | 'rect' | 'arrow' | 'path' | 'image';

defineProps<{
  activeTool: CanvasTool;
  zoom: number;
  dirty?: boolean;
  saving?: boolean;
  hasSelection?: boolean;
}>();

const emit = defineEmits<{
  (event: 'tool', value: CanvasTool): void;
  (event: 'zoom', value: number): void;
  (event: 'delete'): void;
  (event: 'duplicate'): void;
  (event: 'front'): void;
  (event: 'back'): void;
  (event: 'image'): void;
  (event: 'export-svg'): void;
  (event: 'export-png'): void;
  (event: 'save'): void;
}>();

const tools: Array<{ value: CanvasTool; icon: string; label: string }> = [
  { value: 'select', icon: 'iconify:lucide:mouse-pointer-2', label: '选择' },
  { value: 'text', icon: 'iconify:lucide:type', label: '文本' },
  { value: 'rect', icon: 'iconify:lucide:square', label: '矩形' },
  { value: 'arrow', icon: 'iconify:lucide:arrow-up-right', label: '箭头' },
  { value: 'path', icon: 'iconify:lucide:pencil-line', label: '线条' },
  { value: 'image', icon: 'iconify:lucide:image-plus', label: '图片' },
];
</script>

<template>
  <header class="knowledge-canvas-toolbar">
    <div class="knowledge-canvas-toolbar__tools">
      <UiButton
        v-for="item in tools"
        :key="item.value"
        type="button"
        class="knowledge-canvas-toolbar__tool"
        variant="ghost"
        size="sm"
        :active="activeTool === item.value"
        :aria-pressed="activeTool === item.value"
        :title="item.label"
        @click="emit('tool', item.value)"
      >
        <template #prefix>
          <IconRenderer :icon="item.icon" :size="15" />
        </template>
        <span>{{ item.label }}</span>
      </UiButton>
    </div>

    <div class="knowledge-canvas-toolbar__actions">
      <label class="knowledge-canvas-toolbar__zoom">
        缩放
        <UiRange :model-value="zoom" :min="0.1" :max="4" :step="0.05" aria-label="画布缩放" @update:model-value="emit('zoom', Number($event))" />
        <span>{{ Math.round(zoom * 100) }}%</span>
      </label>
      <UiButton type="button" variant="secondary" size="sm" :disabled="!hasSelection" @click="emit('duplicate')">复制</UiButton>
      <UiButton type="button" variant="secondary" size="sm" :disabled="!hasSelection" @click="emit('front')">置顶</UiButton>
      <UiButton type="button" variant="secondary" size="sm" :disabled="!hasSelection" @click="emit('back')">置底</UiButton>
      <UiButton type="button" variant="danger" size="sm" :disabled="!hasSelection" @click="emit('delete')">删除</UiButton>
      <UiButton type="button" variant="secondary" size="sm" @click="emit('image')">
        <template #prefix>
          <IconRenderer icon="iconify:lucide:image-plus" :size="14" />
        </template>
        插入图片
      </UiButton>
      <UiButton type="button" variant="secondary" size="sm" @click="emit('export-svg')">导出 SVG</UiButton>
      <UiButton type="button" variant="secondary" size="sm" @click="emit('export-png')">导出 PNG</UiButton>
      <UiButton type="button" variant="primary" size="sm" :disabled="saving || !dirty" @click="emit('save')">
        <template #prefix>
          <IconRenderer icon="iconify:lucide:save" :size="14" />
        </template>
        {{ saving ? '保存中' : dirty ? '保存' : '已保存' }}
      </UiButton>
    </div>
  </header>
</template>

<style scoped lang="scss">
.knowledge-canvas-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);
}

.knowledge-canvas-toolbar__tools,
.knowledge-canvas-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.knowledge-canvas-toolbar__actions {
  justify-content: flex-end;
}

.knowledge-canvas-toolbar__tool {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
}

.knowledge-canvas-toolbar__zoom {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);

  :deep(.ui-range) {
    width: 88px;
  }
}
</style>
