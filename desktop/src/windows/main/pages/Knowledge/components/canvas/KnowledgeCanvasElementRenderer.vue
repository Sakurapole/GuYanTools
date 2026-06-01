<script setup lang="ts">
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import type { KnowledgeCanvasElementV2 } from '@/windows/main/utils/knowledge_canvas_v2';

const props = defineProps<{
  element: KnowledgeCanvasElementV2;
  selected?: boolean;
  editing?: boolean;
}>();

const emit = defineEmits<{
  (event: 'pointerdown', value: PointerEvent): void;
  (event: 'double-click', elementId: string): void;
  (event: 'commit-text', payload: { elementId: string; text: string }): void;
  (event: 'stop-editing'): void;
}>();

function linePoints() {
  return (props.element.points ?? []).map((point) => `${point.x},${point.y}`).join(' ');
}

function pathViewBox() {
  return `0 0 ${Math.max(1, props.element.width)} ${Math.max(1, props.element.height)}`;
}

function styleValue(key: string, fallback = '') {
  const value = props.element.style?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}
</script>

<template>
  <g
    data-canvas-element="true"
    class="knowledge-canvas-element"
    :class="{ 'knowledge-canvas-element--selected': selected }"
    :transform="`translate(${element.x} ${element.y}) rotate(${element.rotation ?? 0})`"
    @pointerdown="emit('pointerdown', $event)"
    @dblclick.stop="emit('double-click', element.id)"
  >
    <foreignObject v-if="element.type === 'rich_text'" :width="element.width" :height="element.height">
      <UiTextarea
        v-if="editing"
        class="knowledge-canvas-element__editor"
        :model-value="element.text || ''"
        xmlns="http://www.w3.org/1999/xhtml"
        autofocus
        @keydown.esc.stop.prevent="emit('stop-editing')"
        @blur="emit('stop-editing')"
        @update:model-value="text => emit('commit-text', { elementId: element.id, text })"
      />
      <div v-else class="knowledge-canvas-element__text" xmlns="http://www.w3.org/1999/xhtml">
        {{ element.text || '文本框' }}
      </div>
    </foreignObject>

    <g v-else-if="element.type === 'image'">
      <rect :width="element.width" :height="element.height" rx="10" :fill="styleValue('fill', 'transparent')" stroke="var(--ui-border-subtle)" />
      <image
        v-if="styleValue('assetUrl')"
        :href="styleValue('assetUrl')"
        :width="element.width"
        :height="element.height"
        preserveAspectRatio="xMidYMid meet"
      />
      <text v-else x="18" y="36" class="knowledge-canvas-element__placeholder">选择图片或粘贴截图</text>
      <text v-if="element.title || styleValue('assetName')" x="12" :y="element.height - 14" class="knowledge-canvas-element__caption">
        {{ element.title || styleValue('assetName') }}
      </text>
    </g>

    <g v-else-if="element.type === 'rect' || element.type === 'file' || element.type === 'page_card' || element.type === 'todo_card' || element.type === 'group'">
      <rect
        :width="element.width"
        :height="element.height"
        rx="10"
        :fill="styleValue('fill', 'rgba(74, 144, 217, 0.12)')"
        :stroke="styleValue('stroke', '#4A90D9')"
        :stroke-width="Number(styleValue('strokeWidth', '2'))"
      />
      <foreignObject :width="element.width" :height="element.height">
        <div class="knowledge-canvas-element__text knowledge-canvas-element__text--annotation" xmlns="http://www.w3.org/1999/xhtml">
          <strong v-if="element.title">{{ element.title }}</strong>
          <span>{{ element.text }}</span>
        </div>
      </foreignObject>
    </g>

    <line
      v-else-if="element.type === 'arrow'"
      x1="0"
      y1="0"
      :x2="element.width"
      :y2="element.height"
      :stroke="styleValue('stroke', '#4A90D9')"
      :stroke-width="Number(styleValue('strokeWidth', '2'))"
      marker-end="url(#knowledge-canvas-arrow)"
      stroke-linecap="round"
    />

    <svg
      v-else-if="element.type === 'path'"
      :width="element.width"
      :height="element.height"
      :viewBox="pathViewBox()"
      overflow="visible"
    >
      <polyline
        :points="linePoints()"
        fill="none"
        :stroke="styleValue('stroke', '#4A90D9')"
        :stroke-width="Number(styleValue('strokeWidth', '3'))"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>

    <rect
      v-if="selected"
      class="knowledge-canvas-editor__selection"
      :x="-4"
      :y="-4"
      :width="element.width + 8"
      :height="element.height + 8"
      rx="8"
    />
  </g>
</template>

<style scoped lang="scss">
.knowledge-canvas-element {
  cursor: grab;
}

.knowledge-canvas-element:active {
  cursor: grabbing;
}

.knowledge-canvas-element__text {
  display: flex;
  align-items: flex-start;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ui-primary-color) 30%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--ui-primary-color) 10%, var(--ui-surface-panel));
  font-size: 18px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.knowledge-canvas-element__editor {
  width: 100%;
  height: 100%;
  border: 1px solid var(--ui-primary-color);
  border-radius: 10px;
  background: var(--ui-surface-panel);
}

.knowledge-canvas-element__text--annotation {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  font-size: 16px;
  text-align: center;
}

.knowledge-canvas-element__placeholder,
.knowledge-canvas-element__caption {
  fill: var(--ui-text-muted);
  font-size: 14px;
}

.knowledge-canvas-editor__selection {
  fill: transparent;
  stroke: var(--ui-primary-color);
  stroke-width: 2;
  stroke-dasharray: 6 4;
  pointer-events: none;
}
</style>
