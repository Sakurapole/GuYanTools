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
  (event: 'resize-start', value: PointerEvent): void;
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
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && value.trim()) return value;
  return fallback;
}

function fillValue(fallback = 'var(--knowledge-canvas-element-bg, color-mix(in srgb, var(--ui-surface-panel) 42%, transparent))') {
  const fill = styleValue('fill', '');
  if (!fill || isLegacyDefaultFill(fill)) return fallback;
  return fill;
}

function isLegacyDefaultFill(fill: string) {
  return [
    'rgba(74, 144, 217, 0.12)',
    'rgba(34, 197, 94, 0.12)',
    'rgba(100, 116, 139, 0.12)',
    'rgba(74, 144, 217, 0.05)',
  ].includes(fill.trim());
}

function canvasElementLabel() {
  if (props.element.type === 'page_card') return '页面';
  if (props.element.type === 'todo_card') return 'Todo';
  if (props.element.type === 'file') return '文件';
  if (props.element.type === 'group') return '分组';
  if (props.element.type === 'rect') return '标注';
  return '元素';
}

function isInlineTextEditable() {
  return ['rich_text', 'rect', 'file', 'page_card', 'todo_card', 'group'].includes(props.element.type);
}
</script>

<template>
  <g
    data-canvas-element="true"
    class="knowledge-canvas-element"
    :class="{ 'knowledge-canvas-element--selected': selected, 'knowledge-canvas-element--locked': element.locked }"
    :transform="`translate(${element.x} ${element.y}) rotate(${element.rotation ?? 0})`"
    @pointerdown="emit('pointerdown', $event)"
    @dblclick.stop="emit('double-click', element.id)"
  >
    <g v-if="isInlineTextEditable()">
      <rect
        v-if="element.type !== 'rich_text'"
        :width="element.width"
        :height="element.height"
        rx="10"
        :fill="fillValue()"
        :stroke="styleValue('stroke', '#4A90D9')"
        :stroke-width="Number(styleValue('strokeWidth', '2'))"
      />
      <foreignObject :width="element.width" :height="element.height">
        <UiTextarea
          v-if="editing"
          class="knowledge-canvas-element__editor"
          :model-value="element.text || ''"
          xmlns="http://www.w3.org/1999/xhtml"
          autofocus
          @pointerdown.stop
          @keydown.esc.stop.prevent="emit('stop-editing')"
          @blur="emit('stop-editing')"
          @update:model-value="text => emit('commit-text', { elementId: element.id, text })"
        />
        <div
          v-else
          class="knowledge-canvas-element__text"
          :class="{ 'knowledge-canvas-element__text--annotation': element.type !== 'rich_text' }"
          xmlns="http://www.w3.org/1999/xhtml"
        >
          <template v-if="element.type === 'rich_text'">
            {{ element.text || '文本框' }}
          </template>
          <template v-else>
            <em>{{ canvasElementLabel() }}</em>
            <strong>{{ element.title || canvasElementLabel() }}</strong>
            <span>{{ element.text }}</span>
          </template>
        </div>
      </foreignObject>
    </g>

    <g v-else-if="element.type === 'image'">
      <rect :width="element.width" :height="element.height" rx="10" :fill="fillValue('var(--knowledge-canvas-element-bg, transparent)')" stroke="var(--ui-border-subtle)" />
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
    <rect
      v-if="selected && !element.locked"
      class="knowledge-canvas-editor__resize-handle"
      :x="element.width - 5"
      :y="element.height - 5"
      width="10"
      height="10"
      rx="3"
      @pointerdown.stop.prevent="emit('resize-start', $event)"
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

.knowledge-canvas-element--locked {
  cursor: default;
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
  background: var(--knowledge-canvas-element-bg, color-mix(in srgb, var(--ui-primary-color) 10%, var(--ui-surface-panel)));
  font-size: 18px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.knowledge-canvas-element__editor {
  width: 100%;
  height: 100%;
  border: 1px solid var(--ui-primary-color);
  border-radius: 10px;
  background: var(--knowledge-canvas-element-bg, var(--ui-surface-panel));
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

  em {
    color: var(--ui-text-muted);
    font-size: 11px;
    font-style: normal;
    font-weight: 700;
  }

  strong,
  span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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

.knowledge-canvas-element--locked .knowledge-canvas-editor__selection {
  stroke: var(--ui-text-muted);
}

.knowledge-canvas-editor__resize-handle {
  fill: var(--ui-surface-panel);
  stroke: var(--ui-primary-color);
  stroke-width: 1.5;
  cursor: nwse-resize;
}
</style>
