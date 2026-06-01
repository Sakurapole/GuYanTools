<script setup lang="ts">
import { useTodoStore } from '@/windows/main/stores/todo_store';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiPopupSurface from '@/windows/main/components/ui/UiPopupSurface.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';

const todoStore = useTodoStore();

function addAllToToday() {
  const ids = todoStore.yesterdayIncomplete.map(t => t.id);
  todoStore.addYesterdayToToday(ids);
}

function addToToday(todoId: string) {
  todoStore.addYesterdayToToday([todoId]);
}

function dismiss() {
  todoStore.dismissYesterdayPrompt();
}
</script>

<template>
  <UiPopupSurface
    :model-value="true"
    variant="dialog"
    overlay-class="prompt-overlay"
    panel-class="prompt-card"
    aria-label="昨天未完成任务"
    z-index="var(--ui-z-popover)"
    @close="dismiss"
  >
      <!-- 标题区域 -->
      <div class="prompt-header">
        <div class="prompt-icon">
          <IconRenderer icon="iconify:lucide:clock-3" :size="24" />
        </div>
        <div class="prompt-header-text">
          <h3 class="prompt-title">昨天有 <span class="prompt-count">{{ todoStore.yesterdayIncomplete.length }}</span> 个任务未完成</h3>
          <p class="prompt-subtitle">选择添加到今天继续完成，或忽略它们</p>
        </div>
      </div>

      <!-- 任务列表 -->
      <UiScrollbar :x="false" :size="4" class="prompt-list-scroll">
        <div class="prompt-list">
        <div
          v-for="(todo, index) in todoStore.yesterdayIncomplete"
          :key="todo.id"
          class="prompt-item"
          :style="{ animationDelay: `${index * 0.06}s` }"
        >
          <div class="prompt-item-indicator"></div>
          <span class="prompt-item-title">{{ todo.title }}</span>
          <UiButton class="prompt-add-btn" variant="ghost" size="sm" @click="addToToday(todo.id)">
            <template #prefix>
              <IconRenderer icon="iconify:lucide:plus" :size="14" />
            </template>
            添加
          </UiButton>
        </div>
        </div>
      </UiScrollbar>

      <!-- 底部操作 -->
      <div class="prompt-actions">
        <UiButton class="btn-secondary" variant="secondary" size="sm" @click="dismiss">忽略</UiButton>
        <UiButton class="btn-primary" variant="primary" size="sm" @click="addAllToToday">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:check" :size="14" />
          </template>
          全部添加到今天
        </UiButton>
      </div>
  </UiPopupSurface>
</template>

<style>
.prompt-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ui-z-popover);
  animation: overlay-in 0.3s ease;
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.prompt-card {
  background: var(--ui-surface-glass-strong);
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 20px;
  padding: 0;
  max-width: 460px;
  width: 90%;
  box-shadow:
    var(--todo-popup-shadow);
  animation: card-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
}

@keyframes card-in {
  from {
    transform: scale(0.9) translateY(20px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

/* ─── 标题区域 ─── */
.prompt-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 24px 16px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(239, 68, 68, 0.05) 100%);
  border-bottom: 1px solid var(--ui-border-subtle);
}

.prompt-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(239, 68, 68, 0.1));
  display: flex;
  align-items: center;
  justify-content: center;
}

.prompt-header-text {
  flex: 1;
  min-width: 0;
}

.prompt-title {
  margin: 0;
  font-size: 1.05em;
  font-weight: 600;
  color: var(--ui-text-primary);
  line-height: 1.4;
}

.prompt-count {
  display: inline-block;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
  font-size: 1.15em;
}

.prompt-subtitle {
  margin: 2px 0 0;
  font-size: 0.78em;
  color: var(--ui-text-muted);
  line-height: 1.4;
}

/* ─── 任务列表 ─── */
.prompt-list-scroll {
  max-height: 220px;
}

.prompt-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 20px;
}

.prompt-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--ui-surface-overlay);
  border: 1px solid transparent;
  transition: all 0.2s ease;
  animation: item-in 0.3s ease both;
}

@keyframes item-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.prompt-item:hover {
  background: var(--todo-warning-bg);
  border-color: var(--todo-warning-border);
  transform: translateX(2px);
}

.prompt-item-indicator {
  flex-shrink: 0;
  width: 4px;
  height: 20px;
  border-radius: 2px;
  background: linear-gradient(180deg, #f59e0b, #f97316);
  opacity: 0.7;
}

.prompt-item:hover .prompt-item-indicator {
  opacity: 1;
  height: 24px;
}

.prompt-item-title {
  flex: 1;
  font-size: 0.88em;
  color: var(--ui-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.prompt-add-btn {
  flex-shrink: 0;
}

/* ─── 底部操作 ─── */
.prompt-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 24px 20px;
  border-top: 1px solid var(--ui-border-subtle);
}

</style>
