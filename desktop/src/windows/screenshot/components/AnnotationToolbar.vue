<script setup lang="ts">
import type { ScreenshotAnnotationTool } from '@/contracts/screenshot';
import { useAnnotation } from '../composables/useAnnotation';

defineProps<{
  annotation: ReturnType<typeof useAnnotation>;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
  (e: 'recognize'): void;
}>();

interface ToolDef {
  tool: ScreenshotAnnotationTool;
  label: string;
  icon: string;
}

const tools: ToolDef[] = [
  { tool: 'rect', label: '矩形', icon: '▭' },
  { tool: 'ellipse', label: '椭圆', icon: '◯' },
  { tool: 'arrow', label: '箭头', icon: '➜' },
  { tool: 'line', label: '线条', icon: '╱' },
  { tool: 'pen', label: '画笔', icon: '✎' },
  { tool: 'text', label: '文字', icon: 'T' },
  { tool: 'mosaic', label: '马赛克', icon: '▦' },
  { tool: 'highlight', label: '高亮', icon: '▬' },
  { tool: 'number', label: '编号', icon: '①' },
];
</script>

<template>
  <div class="annotation-toolbar" @pointerdown.stop>
    <!-- 工具选择 -->
    <div class="annotation-toolbar__tools">
      <button
        v-for="def in tools"
        :key="def.tool"
        class="annotation-toolbar__tool-btn"
        :class="{ 'annotation-toolbar__tool-btn--active': annotation.activeTool.value === def.tool }"
        :title="def.label"
        type="button"
        @click="annotation.setActiveTool(annotation.activeTool.value === def.tool ? null : def.tool)"
      >
        <span class="annotation-toolbar__tool-icon">{{ def.icon }}</span>
      </button>
    </div>

    <!-- 分隔线 -->
    <div class="annotation-toolbar__divider" />

    <!-- 颜色选择 -->
    <div class="annotation-toolbar__colors">
      <button
        v-for="color in annotation.colorPresets"
        :key="color"
        class="annotation-toolbar__color-btn"
        :class="{ 'annotation-toolbar__color-btn--active': annotation.style.value.color === color }"
        :style="{ backgroundColor: color }"
        :title="color"
        type="button"
        @click="annotation.setColor(color)"
      />
    </div>

    <!-- 分隔线 -->
    <div class="annotation-toolbar__divider" />

    <!-- 线宽选择 -->
    <div class="annotation-toolbar__widths">
      <button
        v-for="w in annotation.strokeWidthes"
        :key="w"
        class="annotation-toolbar__width-btn"
        :class="{ 'annotation-toolbar__width-btn--active': annotation.style.value.strokeWidth === w }"
        :title="`${w}px`"
        type="button"
        @click="annotation.setStrokeWidth(w)"
      >
        <span
          class="annotation-toolbar__width-dot"
          :style="{ width: `${w + 4}px`, height: `${w + 4}px` }"
        />
      </button>
    </div>

    <!-- 分隔线 -->
    <div class="annotation-toolbar__divider" />

    <!-- 撤销/重做/清除 -->
    <div class="annotation-toolbar__actions">
      <button
        class="annotation-toolbar__action-btn"
        title="撤销"
        :disabled="!annotation.canUndo.value"
        type="button"
        @click="annotation.undo()"
      >
        ↩
      </button>
      <button
        class="annotation-toolbar__action-btn"
        title="重做"
        :disabled="!annotation.canRedo.value"
        type="button"
        @click="annotation.redo()"
      >
        ↪
      </button>
      <button
        class="annotation-toolbar__action-btn"
        title="清除全部"
        :disabled="!annotation.hasElements.value"
        type="button"
        @click="annotation.clearAll()"
      >
        ✕
      </button>
    </div>

    <!-- 分隔线 -->
    <div class="annotation-toolbar__divider" />

    <!-- UI 块识别（保留旧功能入口） -->
    <button
      class="annotation-toolbar__action-btn"
      title="识别 UI 块"
      type="button"
      @click="emit('recognize')"
    >
      🔍
    </button>

    <!-- 确认/取消 -->
    <div class="annotation-toolbar__confirm">
      <button
        class="annotation-toolbar__confirm-btn annotation-toolbar__confirm-btn--cancel"
        type="button"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        class="annotation-toolbar__confirm-btn annotation-toolbar__confirm-btn--ok"
        type="button"
        @click="emit('confirm')"
      >
        完成
      </button>
    </div>
  </div>
</template>

<style scoped>
.annotation-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  user-select: none;
}

.annotation-toolbar__divider {
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: rgba(148, 163, 184, 0.3);
  flex-shrink: 0;
}

.annotation-toolbar__tools,
.annotation-toolbar__colors,
.annotation-toolbar__widths,
.annotation-toolbar__actions,
.annotation-toolbar__confirm {
  display: flex;
  align-items: center;
  gap: 2px;
}

.annotation-toolbar__tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #e2e8f0;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.annotation-toolbar__tool-btn:hover {
  background: rgba(148, 163, 184, 0.15);
}

.annotation-toolbar__tool-btn--active {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
}

.annotation-toolbar__tool-icon {
  font-size: 14px;
  line-height: 1;
}

.annotation-toolbar__color-btn {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}

.annotation-toolbar__color-btn:hover {
  transform: scale(1.15);
}

.annotation-toolbar__color-btn--active {
  border-color: #fff;
  transform: scale(1.2);
}

.annotation-toolbar__width-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
}

.annotation-toolbar__width-btn:hover {
  background: rgba(148, 163, 184, 0.15);
}

.annotation-toolbar__width-btn--active {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
}

.annotation-toolbar__width-dot {
  display: block;
  border-radius: 50%;
  background: #e2e8f0;
}

.annotation-toolbar__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #e2e8f0;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.annotation-toolbar__action-btn:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.15);
}

.annotation-toolbar__action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.annotation-toolbar__confirm {
  gap: 6px;
}

.annotation-toolbar__confirm-btn {
  padding: 4px 14px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.annotation-toolbar__confirm-btn--cancel {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

.annotation-toolbar__confirm-btn--cancel:hover {
  background: rgba(148, 163, 184, 0.3);
}

.annotation-toolbar__confirm-btn--ok {
  background: #38bdf8;
  color: #0f172a;
}

.annotation-toolbar__confirm-btn--ok:hover {
  background: #7dd3fc;
}
</style>
