<template>
  <div class="devtools-page">
    <div class="devtools-header">
      <h2 class="devtools-title">🛠 开发调试工具</h2>
      <span class="devtools-badge">DEV ONLY</span>
    </div>

    <div class="devtools-content">
      <!-- 通知测试面板 -->
      <section class="devtools-section">
        <h3 class="devtools-section-title">系统通知测试</h3>

        <div class="devtools-form">
          <div class="devtools-row">
            <label class="devtools-label">类型</label>
            <div class="devtools-radio-group">
              <label v-for="t in typeOptions" :key="t.value" class="devtools-radio"
                :class="{ active: notifForm.type === t.value }">
                <input type="radio" :value="t.value" v-model="notifForm.type" />
                {{ t.label }}
              </label>
            </div>
          </div>

          <div class="devtools-row">
            <label class="devtools-label">尺寸</label>
            <div class="devtools-radio-group">
              <label v-for="s in sizeOptions" :key="s.value" class="devtools-radio"
                :class="{ active: notifForm.size === s.value }">
                <input type="radio" :value="s.value" v-model="notifForm.size" />
                {{ s.label }}
              </label>
            </div>
          </div>

          <div class="devtools-row">
            <label class="devtools-label">标题</label>
            <input type="text" class="devtools-input" v-model="notifForm.title" placeholder="通知标题" />
          </div>

          <div class="devtools-row">
            <label class="devtools-label">内容</label>
            <textarea class="devtools-input devtools-textarea" v-model="notifForm.message"
              placeholder="通知内容" rows="3" />
          </div>

          <div v-if="notifForm.type === 'image' || notifForm.type === 'richText'" class="devtools-row">
            <label class="devtools-label">图片URL</label>
            <input type="text" class="devtools-input" v-model="notifForm.imageUrl" placeholder="https://..." />
          </div>

          <div v-if="notifForm.type === 'richText'" class="devtools-row">
            <label class="devtools-label">图标</label>
            <input type="text" class="devtools-input" v-model="notifForm.icon" placeholder="emoji 或文字" />
          </div>

          <div class="devtools-row">
            <label class="devtools-label">自动关闭(ms)</label>
            <input type="number" class="devtools-input devtools-input--short" v-model.number="notifForm.duration"
              placeholder="5000" />
          </div>

          <div class="devtools-actions">
            <button class="devtools-btn devtools-btn--primary" @click="sendNotification">
              发送通知
            </button>
            <button class="devtools-btn devtools-btn--secondary" @click="sendQuickText">
              快速文本通知
            </button>
            <button class="devtools-btn devtools-btn--secondary" @click="sendQuickRich">
              快速富文本通知
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import { useGlobalStore } from '../stores/global_store';
import type { NotificationPayload, NotificationType, NotificationSize } from '@/contracts/notification';

declare global {
  interface Window {
    notificationApi?: {
      show: (payload: NotificationPayload) => Promise<void>;
    };
  }
}

const typeOptions: { value: NotificationType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
  { value: 'richText', label: '富文本' },
];

const sizeOptions: { value: NotificationSize; label: string }[] = [
  { value: 'sm', label: '小 (300×80)' },
  { value: 'md', label: '中 (360×120)' },
  { value: 'lg', label: '大 (420×200)' },
];

const notifForm = reactive({
  type: 'text' as NotificationType,
  size: 'md' as NotificationSize,
  title: '测试通知',
  message: '这是一条测试通知消息',
  imageUrl: '',
  icon: '🔔',
  duration: 5000,
});

const globalStore = useGlobalStore();
onMounted(() => {
  globalStore.setTopbarColor('');
});

function sendNotification() {
  const payload: NotificationPayload = {
    type: notifForm.type,
    size: notifForm.size,
    title: notifForm.title || undefined,
    message: notifForm.message || undefined,
    imageUrl: notifForm.imageUrl || undefined,
    icon: notifForm.icon || undefined,
    duration: notifForm.duration,
  };
  window.notificationApi?.show(payload);
}

function sendQuickText() {
  window.notificationApi?.show({
    type: 'text',
    size: 'sm',
    title: '快速通知',
    message: '操作已成功完成 ✅',
    duration: 3000,
  });
}

function sendQuickRich() {
  window.notificationApi?.show({
    type: 'richText',
    size: 'md',
    title: '系统更新',
    message: '新版本已准备就绪，请重启应用以完成更新。',
    icon: '🚀',
    duration: 8000,
  });
}
</script>

<style lang="scss" scoped>
.devtools-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 28px 32px;
  overflow-y: auto;
  background: var(--background-color);
  color: var(--text-primary-color);
}

.devtools-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}

.devtools-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--ui-text-primary);
}

.devtools-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--ui-radius-full);
  background: rgba(239, 68, 68, 0.14);
  color: #ef4444;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.devtools-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 640px;
}

.devtools-section {
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-panel);
  box-shadow: var(--ui-shadow-sm);
  overflow: hidden;
}

.devtools-section-title {
  margin: 0;
  padding: 14px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text-primary);
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-panel-muted);
}

.devtools-form {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.devtools-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.devtools-label {
  flex: 0 0 100px;
  padding-top: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-text-muted);
  text-align: right;
}

.devtools-radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.devtools-radio {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: var(--ui-radius-sm);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);
  font-size: 13px;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: all 0.16s ease;

  input {
    display: none;
  }

  &.active {
    border-color: var(--ui-border-accent);
    background: rgba(102, 204, 255, 0.1);
    color: var(--ui-text-primary);
  }

  &:hover:not(.active) {
    border-color: var(--ui-border-accent-soft);
    background: var(--surface-hover-color);
  }
}

.devtools-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: var(--ui-radius-xs);
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  background: var(--ui-input-bg);
  color: var(--ui-input-text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.16s ease;

  &::placeholder {
    color: var(--ui-input-placeholder);
  }

  &:focus {
    border-color: var(--ui-input-focus-border);
  }
}

.devtools-input--short {
  flex: 0 0 120px;
}

.devtools-textarea {
  resize: vertical;
  min-height: 60px;
}

.devtools-actions {
  display: flex;
  gap: 10px;
  padding-top: 6px;
  padding-left: 112px;
}

.devtools-btn {
  padding: 8px 18px;
  border-radius: var(--ui-radius-sm);
  border: var(--ui-border-width-thin) solid transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
}

.devtools-btn--primary {
  background: var(--ui-button-primary-bg);
  color: var(--ui-button-primary-text);
  border-color: var(--ui-button-primary-border);
  box-shadow: var(--ui-button-primary-shadow);

  &:hover {
    background: var(--ui-button-primary-hover-bg);
  }
}

.devtools-btn--secondary {
  background: var(--ui-button-secondary-bg);
  color: var(--ui-button-secondary-text);
  border-color: var(--ui-button-secondary-border);

  &:hover {
    background: var(--ui-button-secondary-hover-bg);
    border-color: var(--ui-button-secondary-hover-border);
  }
}
</style>
