<script setup lang="ts">
import { useTodoStore } from '@/windows/main/stores/todo_store';
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
  <div class="prompt-overlay" @click.self="dismiss">
    <div class="prompt-card">
      <!-- 标题区域 -->
      <div class="prompt-header">
        <div class="prompt-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="url(#icon-grad)" stroke-width="2"/>
            <path d="M12 7v5l3 3" stroke="url(#icon-grad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <defs>
              <linearGradient id="icon-grad" x1="4" y1="4" x2="20" y2="20">
                <stop stop-color="#f59e0b"/>
                <stop offset="1" stop-color="#ef4444"/>
              </linearGradient>
            </defs>
          </svg>
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
          <button class="prompt-add-btn" @click="addToToday(todo.id)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            添加
          </button>
        </div>
        </div>
      </UiScrollbar>

      <!-- 底部操作 -->
      <div class="prompt-actions">
        <button class="btn-secondary" @click="dismiss">忽略</button>
        <button class="btn-primary" @click="addAllToToday">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          全部添加到今天
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  z-index: 1000;
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
    0 8px 32px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.06);
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
  background: rgba(245, 158, 11, 0.06);
  border-color: rgba(245, 158, 11, 0.15);
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.76em;
  padding: 5px 12px;
  background: var(--ui-button-ghost-hover-bg);
  color: var(--ui-input-focus-border);
  border: 1px solid var(--ui-border-accent-soft);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
  white-space: nowrap;
}

.prompt-add-btn:hover {
  background: var(--ui-input-focus-border);
  color: white;
  border-color: var(--ui-input-focus-border);
  transform: scale(1.02);
  box-shadow: 0 2px 8px rgba(74, 144, 217, 0.3);
}

.prompt-add-btn:active {
  transform: scale(0.98);
}

/* ─── 底部操作 ─── */
.prompt-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 24px 20px;
  border-top: 1px solid var(--ui-border-subtle);
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  background: linear-gradient(135deg, #4A90D9, #357abd);
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.85em;
  font-weight: 500;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(74, 144, 217, 0.25);
}

.btn-primary:hover {
  background: linear-gradient(135deg, #357abd, #2a69a3);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(74, 144, 217, 0.35);
}

.btn-primary:active {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(74, 144, 217, 0.2);
}

.btn-secondary {
  padding: 9px 20px;
  background: transparent;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.85em;
  font-weight: 500;
  color: var(--ui-text-muted);
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: var(--ui-button-ghost-hover-bg);
  border-color: var(--ui-border-accent-soft);
}

.btn-secondary:active {
  background: var(--ui-surface-overlay);
}
</style>
