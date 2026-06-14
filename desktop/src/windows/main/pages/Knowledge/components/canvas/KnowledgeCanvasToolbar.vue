<script setup lang="ts">
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiRange from '@/windows/main/components/ui/UiRange.vue';

export type CanvasTool = 'select' | 'text' | 'rect' | 'arrow' | 'path' | 'image' | 'file' | 'page_card' | 'todo_card' | 'group';
export type CanvasAlignCommand = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type CanvasDistributeCommand = 'horizontal' | 'vertical';

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
  (event: 'align', value: CanvasAlignCommand): void;
  (event: 'distribute', value: CanvasDistributeCommand): void;
  (event: 'merge'): void;
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
  { value: 'file', icon: 'iconify:lucide:file', label: '文件' },
  { value: 'page_card', icon: 'iconify:lucide:file-text', label: '页面' },
  { value: 'todo_card', icon: 'iconify:lucide:list-checks', label: 'Todo' },
  { value: 'group', icon: 'iconify:lucide:boxes', label: '分组' },
];

const alignActions: Array<{ value: CanvasAlignCommand; icon: string; label: string }> = [
  { value: 'left', icon: 'iconify:lucide:align-start-vertical', label: '左齐' },
  { value: 'center', icon: 'iconify:lucide:align-center-vertical', label: '中齐' },
  { value: 'right', icon: 'iconify:lucide:align-end-vertical', label: '右齐' },
  { value: 'top', icon: 'iconify:lucide:align-start-horizontal', label: '顶齐' },
  { value: 'middle', icon: 'iconify:lucide:align-center-horizontal', label: '居中' },
  { value: 'bottom', icon: 'iconify:lucide:align-end-horizontal', label: '底齐' },
];

const distributeActions: Array<{ value: CanvasDistributeCommand; icon: string; label: string }> = [
  { value: 'horizontal', icon: 'iconify:lucide:columns-3', label: '横分布' },
  { value: 'vertical', icon: 'iconify:lucide:rows-3', label: '纵分布' },
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
      <div class="knowledge-canvas-toolbar__group" role="group" aria-label="对齐元素">
        <UiButton
          v-for="item in alignActions"
          :key="item.value"
          type="button"
          class="knowledge-canvas-toolbar__compact-action"
          variant="secondary"
          size="sm"
          :disabled="!hasSelection"
          :title="item.label"
          @click="emit('align', item.value)"
        >
          <template #prefix>
            <IconRenderer :icon="item.icon" :size="14" />
          </template>
          {{ item.label }}
        </UiButton>
      </div>
      <div class="knowledge-canvas-toolbar__group" role="group" aria-label="分布元素">
        <UiButton
          v-for="item in distributeActions"
          :key="item.value"
          type="button"
          class="knowledge-canvas-toolbar__compact-action"
          variant="secondary"
          size="sm"
          :disabled="!hasSelection"
          :title="item.label"
          @click="emit('distribute', item.value)"
        >
          <template #prefix>
            <IconRenderer :icon="item.icon" :size="14" />
          </template>
          {{ item.label }}
        </UiButton>
      </div>
      <UiButton type="button" variant="secondary" size="sm" :disabled="!hasSelection" title="合并选中的文本容器" @click="emit('merge')">
        <template #prefix>
          <IconRenderer icon="iconify:lucide:combine" :size="14" />
        </template>
        合并
      </UiButton>
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

.knowledge-canvas-toolbar__group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  justify-content: center;
}

.knowledge-canvas-toolbar__tool {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
}

.knowledge-canvas-toolbar__compact-action {
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
