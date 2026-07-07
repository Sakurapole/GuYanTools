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
              <UiRadio v-for="t in typeOptions" :key="t.value" v-model="notifForm.type" :value="t.value" name="devtools-notification-type" class="devtools-radio"
                :class="{ active: notifForm.type === t.value }">
                {{ t.label }}
              </UiRadio>
            </div>
          </div>

          <div class="devtools-row">
            <label class="devtools-label">尺寸</label>
            <div class="devtools-radio-group">
              <UiRadio v-for="s in sizeOptions" :key="s.value" v-model="notifForm.size" :value="s.value" name="devtools-notification-size" class="devtools-radio"
                :class="{ active: notifForm.size === s.value }">
                {{ s.label }}
              </UiRadio>
            </div>
          </div>

          <div class="devtools-row">
            <label class="devtools-label">标题</label>
            <UiInput v-model="notifForm.title" class="devtools-input" placeholder="通知标题" />
          </div>

          <div class="devtools-row">
            <label class="devtools-label">内容</label>
            <UiTextarea v-model="notifForm.message" class="devtools-input devtools-textarea"
              placeholder="通知内容" :rows="3" />
          </div>

          <div v-if="notifForm.type === 'image' || notifForm.type === 'richText'" class="devtools-row">
            <label class="devtools-label">图片来源</label>
            <div class="devtools-radio-group">
              <UiRadio v-for="source in imageSourceOptions" :key="source.value" v-model="notifForm.imageSourceType" :value="source.value" name="devtools-notification-image-source" class="devtools-radio"
                :class="{ active: notifForm.imageSourceType === source.value }">
                {{ source.label }}
              </UiRadio>
            </div>
          </div>

          <div v-if="notifForm.type === 'image' || notifForm.type === 'richText'" class="devtools-row">
            <label class="devtools-label">图片内容</label>
            <UiInput v-model="notifForm.imageValue" class="devtools-input" :placeholder="imageSourcePlaceholder" />
          </div>

          <div v-if="(notifForm.type === 'image' || notifForm.type === 'richText') && notifForm.imageSourceType === 'base64'" class="devtools-row">
            <label class="devtools-label">MIME</label>
            <UiInput v-model="notifForm.imageMimeType" class="devtools-input devtools-input--short" placeholder="image/png" />
          </div>

          <div v-if="notifForm.type === 'richText'" class="devtools-row">
            <label class="devtools-label">图标</label>
            <UiInput v-model="notifForm.icon" class="devtools-input" placeholder="emoji 或文字" />
          </div>

          <div class="devtools-row">
            <label class="devtools-label">自动关闭(ms)</label>
            <UiInput v-model="notifDurationInput" class="devtools-input devtools-input--short" type="number"
              placeholder="5000" />
          </div>

          <div class="devtools-actions">
            <UiButton class="devtools-btn devtools-btn--primary" variant="primary" type="button" @click="sendNotification">
              发送通知
            </UiButton>
            <UiButton class="devtools-btn devtools-btn--secondary" variant="secondary" type="button" @click="sendQuickText">
              快速文本通知
            </UiButton>
            <UiButton class="devtools-btn devtools-btn--secondary" variant="secondary" type="button" @click="sendQuickRich">
              快速富文本通知
            </UiButton>
          </div>
        </div>
      </section>

      <section class="devtools-section">
        <h3 class="devtools-section-title">页内通知测试</h3>

        <div class="devtools-form">
          <div class="devtools-row">
            <label class="devtools-label">类型</label>
            <div class="devtools-radio-group">
              <UiRadio v-for="t in typeOptions" :key="`in-app-${t.value}`" v-model="inAppForm.type" :value="t.value" name="devtools-in-app-type" class="devtools-radio"
                :class="{ active: inAppForm.type === t.value }">
                {{ t.label }}
              </UiRadio>
            </div>
          </div>

          <div class="devtools-row">
            <label class="devtools-label">尺寸</label>
            <div class="devtools-radio-group">
              <UiRadio v-for="s in sizeOptions" :key="`in-app-size-${s.value}`" v-model="inAppForm.size" :value="s.value" name="devtools-in-app-size" class="devtools-radio"
                :class="{ active: inAppForm.size === s.value }">
                {{ s.label }}
              </UiRadio>
            </div>
          </div>

          <div v-if="inAppForm.type === 'image' || inAppForm.type === 'richText'" class="devtools-row">
            <label class="devtools-label">图片来源</label>
            <div class="devtools-radio-group">
              <UiRadio v-for="source in inAppImageSourceOptions" :key="`in-app-${source.value}`" v-model="inAppForm.imageSourceType" :value="source.value" name="devtools-in-app-image-source" class="devtools-radio"
                :class="{ active: inAppForm.imageSourceType === source.value }">
                {{ source.label }}
              </UiRadio>
            </div>
          </div>

          <div v-if="inAppForm.type === 'image' || inAppForm.type === 'richText'" class="devtools-row">
            <label class="devtools-label">图片内容</label>
            <UiInput v-model="inAppForm.imageValue" class="devtools-input" :placeholder="inAppImageSourcePlaceholder" />
          </div>

          <div class="devtools-row">
            <label class="devtools-label">标题</label>
            <UiInput v-model="inAppForm.title" class="devtools-input" placeholder="页内通知标题" />
          </div>

          <div class="devtools-row">
            <label class="devtools-label">内容</label>
            <UiTextarea v-model="inAppForm.message" class="devtools-input devtools-textarea"
              placeholder="页内通知内容" :rows="3" />
          </div>

          <div class="devtools-row">
            <label class="devtools-label">自动关闭(ms)</label>
            <UiInput v-model="inAppDurationInput" class="devtools-input devtools-input--short" type="number"
              placeholder="3000" />
          </div>

          <div class="devtools-actions devtools-actions--wrap">
            <UiButton class="devtools-btn devtools-btn--secondary" variant="secondary" type="button" @click="sendInAppInfo">
              Info
            </UiButton>
            <UiButton class="devtools-btn devtools-btn--success" variant="secondary" type="button" @click="sendInAppSuccess">
              Success
            </UiButton>
            <UiButton class="devtools-btn devtools-btn--warning" variant="secondary" type="button" @click="sendInAppWarning">
              Warning
            </UiButton>
            <UiButton class="devtools-btn devtools-btn--danger" variant="danger" type="button" @click="sendInAppError">
              Error
            </UiButton>
            <UiButton class="devtools-btn devtools-btn--secondary" variant="secondary" type="button" @click="throwVueError">
              触发组件异常
            </UiButton>
            <UiButton class="devtools-btn devtools-btn--secondary" variant="secondary" type="button" @click="rejectPromise">
              触发 Promise 异常
            </UiButton>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  notifyError,
  notifyInfo,
  notifyInAppPayload,
  notifySuccess,
  notifyWarning,
} from '../composables/useInAppNotification';
import UiButton from '../components/ui/UiButton.vue';
import UiInput from '../components/ui/UiInput.vue';
import UiRadio from '../components/ui/UiRadio.vue';
import UiTextarea from '../components/ui/UiTextarea.vue';
import { useGlobalStore } from '../stores/global_store';
import type { NotificationImageSource, NotificationPayload, NotificationType, NotificationSize } from '@/contracts/notification';

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

const imageSourceOptions = [
  { value: 'url', label: 'URL' },
  { value: 'path', label: '本地路径' },
  { value: 'dataUrl', label: 'Data URL' },
  { value: 'base64', label: 'Base64' },
] as const;

const inAppImageSourceOptions = imageSourceOptions.filter(option => option.value !== 'path');

const notifForm = reactive({
  type: 'text' as NotificationType,
  size: 'md' as NotificationSize,
  title: '测试通知',
  message: '这是一条测试通知消息',
  imageSourceType: 'url' as typeof imageSourceOptions[number]['value'],
  imageValue: '',
  imageMimeType: 'image/png',
  icon: '🔔',
});
const notifDurationInput = ref('5000');

const inAppForm = reactive({
  type: 'text' as NotificationType,
  size: 'md' as NotificationSize,
  title: '页内通知测试',
  message: '这是一条显示在应用右上角的页内通知。',
  imageSourceType: 'url' as typeof inAppImageSourceOptions[number]['value'],
  imageValue: '',
  icon: '🔔',
});
const inAppDurationInput = ref('3000');

const globalStore = useGlobalStore();
onMounted(() => {
  globalStore.setTopbarColor('');
});

const imageSourcePlaceholder = computed(() => imagePlaceholderForType(notifForm.imageSourceType));
const inAppImageSourcePlaceholder = computed(() => imagePlaceholderForType(inAppForm.imageSourceType));

function imagePlaceholderForType(type: string) {
  if (type === 'path') return 'D:\\\\Pictures\\\\notice.png 或 file:///D:/Pictures/notice.png';
  if (type === 'dataUrl') return 'data:image/png;base64,...';
  if (type === 'base64') return 'iVBORw0KGgo...';
  return 'https://example.com/image.png';
}

function parseDuration(value: string) {
  return Math.max(0, Number(value) || 0);
}

function buildImageSource(type: string, value: string, mimeType?: string): { imageUrl?: string; imageSource?: NotificationImageSource } {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (type === 'url') {
    return { imageUrl: trimmed };
  }
  if (type === 'path') {
    return { imageSource: { type: 'path', path: trimmed, mimeType: mimeType?.trim() || undefined } };
  }
  if (type === 'dataUrl') {
    return { imageSource: { type: 'dataUrl', dataUrl: trimmed } };
  }
  return { imageSource: { type: 'base64', base64: trimmed, mimeType: mimeType?.trim() || 'image/png' } };
}

function sendNotification() {
  const imageFields = buildImageSource(notifForm.imageSourceType, notifForm.imageValue, notifForm.imageMimeType);
  const payload: NotificationPayload = {
    type: notifForm.type,
    size: notifForm.size,
    title: notifForm.title || undefined,
    message: notifForm.message || undefined,
    ...imageFields,
    icon: notifForm.icon || undefined,
    duration: parseDuration(notifDurationInput.value),
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

function inAppOptions() {
  return {
    type: inAppForm.type,
    size: inAppForm.size,
    icon: inAppForm.icon,
    ...buildImageSource(inAppForm.imageSourceType, inAppForm.imageValue),
    duration: parseDuration(inAppDurationInput.value),
    dedupeKey: `devtools:${Date.now()}`,
  };
}

function sendInApp(tone: 'info' | 'success' | 'warning' | 'error') {
  notifyInAppPayload({
    tone,
    title: inAppForm.title || undefined,
    message: inAppForm.message,
    ...inAppOptions(),
  });
}

function sendInAppInfo() {
  if (inAppForm.type === 'text') {
    notifyInfo(inAppForm.message, inAppForm.title || '提示', inAppOptions());
    return;
  }
  sendInApp('info');
}

function sendInAppSuccess() {
  if (inAppForm.type === 'text') {
    notifySuccess(inAppForm.message, inAppForm.title || '已完成', inAppOptions());
    return;
  }
  sendInApp('success');
}

function sendInAppWarning() {
  if (inAppForm.type === 'text') {
    notifyWarning(inAppForm.message, inAppForm.title || '请注意', inAppOptions());
    return;
  }
  sendInApp('warning');
}

function sendInAppError() {
  if (inAppForm.type === 'text') {
    notifyError(new Error(inAppForm.message), inAppForm.title || '操作失败', inAppOptions());
    return;
  }
  sendInApp('error');
}

function throwVueError() {
  throw new Error('DevTools 手动触发的组件异常');
}

function rejectPromise() {
  void Promise.reject(new Error('DevTools 手动触发的 Promise 异常'));
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

.devtools-radio.ui-radio {
  display: inline-flex;
  align-items: center;
  gap: 0;
  padding: 6px 14px;
  border-radius: var(--ui-radius-sm);
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);
  font-size: 13px;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: all 0.16s ease;

  :deep(.ui-radio__mark) {
    display: none;
  }

  :deep(.ui-radio__label) {
    color: inherit;
    font-size: inherit;
    line-height: inherit;
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

  &:focus-within {
    border-color: var(--ui-input-focus-border);
    box-shadow: var(--ui-focus-ring);
  }
}

.devtools-input.ui-input,
.devtools-input.ui-textarea,
.devtools-input.ui-input-number-wrapper {
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
  box-shadow: none;

  &::placeholder {
    color: var(--ui-input-placeholder);
  }

  &:focus,
  &:focus-within {
    border-color: var(--ui-input-focus-border);
    box-shadow: none;
  }
}

.devtools-input--short.ui-input,
.devtools-input--short.ui-input-number-wrapper {
  flex: 0 0 120px;
}

.devtools-textarea.ui-textarea {
  resize: vertical;
  min-height: 60px;
}

.devtools-actions {
  display: flex;
  gap: 10px;
  padding-top: 6px;
  padding-left: 112px;
}

.devtools-actions--wrap {
  flex-wrap: wrap;
}

.devtools-btn.ui-button {
  padding: 8px 18px;
  border-radius: var(--ui-radius-sm);
  border: var(--ui-border-width-thin) solid transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
  min-height: auto;

  &:hover:not(:disabled),
  &:active:not(:disabled) {
    transform: none;
  }
}

.devtools-btn--primary.ui-button {
  background: var(--ui-button-primary-bg);
  color: var(--ui-button-primary-text);
  border-color: var(--ui-button-primary-border);
  box-shadow: var(--ui-button-primary-shadow);

  &:hover:not(:disabled) {
    background: var(--ui-button-primary-hover-bg);
  }
}

.devtools-btn--secondary.ui-button {
  background: var(--ui-button-secondary-bg);
  color: var(--ui-button-secondary-text);
  border-color: var(--ui-button-secondary-border);

  &:hover:not(:disabled) {
    background: var(--ui-button-secondary-hover-bg);
    border-color: var(--ui-button-secondary-hover-border);
  }
}

.devtools-btn--success.ui-button {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
  border-color: rgba(16, 185, 129, 0.22);

  &:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.18);
  }
}

.devtools-btn--warning.ui-button {
  background: rgba(245, 158, 11, 0.13);
  color: #92400e;
  border-color: rgba(245, 158, 11, 0.24);

  &:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.2);
  }
}

.devtools-btn--danger.ui-button {
  background: var(--ui-button-danger-bg);
  color: var(--ui-button-danger-text);
  border-color: var(--ui-button-danger-border);

  &:hover:not(:disabled) {
    background: var(--ui-button-danger-hover-bg);
  }
}
</style>
