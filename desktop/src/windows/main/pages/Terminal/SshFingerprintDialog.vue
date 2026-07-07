<script setup lang="ts">
import { ref } from 'vue';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiPopupSurface from '@/windows/main/components/ui/UiPopupSurface.vue';
import UiRadio from '@/windows/main/components/ui/UiRadio.vue';
import type { TrustHostInput } from '@/contracts/ssh';

// ── Props & Emits ─────────────────────────────────────────────

const props = defineProps<{
  visible: boolean;
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
}>();

const emit = defineEmits<{
  /** User trusted the host (permanently or for this session) */
  trusted: [];
  /** User rejected the connection */
  rejected: [];
}>();

const sshStore = useSshStore();

const trustMode = ref<'permanent' | 'session'>('permanent');
const saving = ref(false);
const error = ref('');

async function accept() {
  saving.value = true;
  error.value = '';
  try {
    const input: TrustHostInput = {
      host: props.host,
      port: props.port,
      algorithm: props.algorithm,
      fingerprint: props.fingerprint,
      trustMode: trustMode.value,
    };
    await sshStore.trustHost(input);
    emit('trusted');
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

function reject() {
  emit('rejected');
}
</script>

<template>
  <UiPopupSurface
    :model-value="visible"
    variant="dialog"
    overlay-class="fp-overlay"
    panel-class="fp-dialog"
    role="alertdialog"
    aria-labelledby="fp-title"
    :close-on-mask="false"
    z-index="var(--ui-z-dialog)"
  >
          <!-- Warning icon -->
          <div class="fp-icon-wrap">
            <div class="fp-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor"
                stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>

          <!-- Content -->
          <div class="fp-body">
            <h3 class="fp-title" id="fp-title">验证主机真实性</h3>
            <p class="fp-desc">
              无法确认主机 <code class="fp-code">{{ host }}:{{ port }}</code> 的真实性。
              服务器发来的指纹如下，请与系统管理员确认后再决定是否信任。
            </p>

            <div class="fp-fingerprint">
              <div class="fp-fingerprint__row">
                <span class="fp-fingerprint__key">算法</span>
                <span class="fp-fingerprint__val">{{ algorithm }}</span>
              </div>
              <div class="fp-fingerprint__row">
                <span class="fp-fingerprint__key">指纹</span>
                <code class="fp-fingerprint__hash">{{ fingerprint }}</code>
              </div>
            </div>

            <!-- Trust mode selection -->
            <div class="fp-trust-mode">
              <UiRadio
                v-model="trustMode"
                class="fp-radio"
                value="permanent"
                id="fp-trust-permanent"
                name="ssh-fingerprint-trust-mode"
              >
                <div class="fp-radio__content">
                  <span class="fp-radio__label">永久信任</span>
                  <span class="fp-radio__desc">将指纹保存到已知主机列表，下次自动验证</span>
                </div>
              </UiRadio>
              <UiRadio
                v-model="trustMode"
                class="fp-radio"
                value="session"
                id="fp-trust-session"
                name="ssh-fingerprint-trust-mode"
              >
                <div class="fp-radio__content">
                  <span class="fp-radio__label">仅本次信任</span>
                  <span class="fp-radio__desc">本次连接后不再保存该指纹</span>
                </div>
              </UiRadio>
            </div>

            <!-- Error -->
            <div v-if="error" class="fp-error">{{ error }}</div>
          </div>

          <!-- Footer -->
          <div class="fp-footer">
            <UiButton class="fp-btn fp-btn--ghost" variant="ghost" size="sm" type="button" @click="reject" id="fp-reject-btn">拒绝连接</UiButton>
            <UiButton class="fp-btn fp-btn--primary" variant="primary" size="sm" type="button" :disabled="saving" @click="accept" id="fp-accept-btn">
              {{ saving ? '保存中...' : '信任并连接' }}
            </UiButton>
          </div>
  </UiPopupSurface>
</template>

<style lang="scss">
.fp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ui-z-dialog);
}

.fp-dialog {
  width: 460px;
  max-width: calc(100vw - 32px);
  border-radius: var(--ui-radius-xl);
  background: var(--ui-surface-dialog, var(--ui-surface-panel));
  border: 1px solid var(--ui-border-subtle);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.5), 0 4px 16px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.fp-icon-wrap {
  display: flex;
  justify-content: center;
  padding: 24px 0 0;
}

.fp-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(234, 179, 8, 0.12);
  color: #f59e0b;
  border: 1px solid rgba(234, 179, 8, 0.25);
}

.fp-body {
  padding: 16px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fp-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text-primary);
  margin: 0;
  text-align: center;
}

.fp-desc {
  font-size: 13px;
  color: var(--ui-text-secondary);
  line-height: 1.6;
  margin: 0;
  text-align: center;
}

.fp-code {
  font-family: Consolas, 'Cascadia Mono', monospace;
  font-size: 12px;
  background: var(--ui-surface-overlay);
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--ui-text-primary);
}

.fp-fingerprint {
  background: var(--ui-surface-bg-muted);
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &__row {
    display: flex;
    gap: 10px;
    font-size: 12px;
    align-items: baseline;
  }

  &__key {
    font-weight: 600;
    color: var(--ui-text-muted);
    min-width: 32px;
    flex-shrink: 0;
  }

  &__val {
    color: var(--ui-text-secondary);
    font-family: Consolas, 'Cascadia Mono', monospace;
  }

  &__hash {
    font-family: Consolas, 'Cascadia Mono', monospace;
    color: #f59e0b;
    font-size: 11px;
    word-break: break-all;
  }
}

.fp-trust-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fp-radio.ui-radio {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  transition: all 0.15s;

  &.ui-radio--checked {
    border-color: var(--primary-color);
    background: rgba(var(--primary-rgb, 99 102 241), 0.06);
  }

  &:hover {
    background: var(--ui-button-ghost-hover-bg);
  }

  .ui-radio__mark {
    margin-top: 3px;
  }

  .ui-radio__label {
    display: block;
    min-width: 0;
  }
}

.fp-radio__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fp-radio__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-primary);
}

.fp-radio__desc {
  font-size: 11px;
  color: var(--ui-text-muted);
  line-height: 1.4;
}

.fp-error {
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--ui-radius-md);
  font-size: 12px;
  color: #ef4444;
}

.fp-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 24px;
  border-top: 1px solid var(--ui-border-subtle);
}

.fp-btn.ui-button {
  padding: 7px 18px;
  border-radius: var(--ui-radius-md);
  font-size: 13px;
  font-weight: 600;
  border: 1px solid transparent;
  transition: all 0.18s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.fp-btn--primary.ui-button {
  background: var(--primary-color);
  color: #fff;
  border-color: var(--primary-color);

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }
}

.fp-btn--ghost.ui-button {
  background: transparent;
  color: var(--ui-text-secondary);
  border-color: var(--ui-border-subtle);

  &:hover:not(:disabled) {
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-state-error, #ef4444);
    border-color: rgba(239, 68, 68, 0.3);
  }
}

.fp-fade-enter-active,
.fp-fade-leave-active {
  transition: opacity 0.2s;

  .fp-dialog {
    transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
  }
}

.fp-fade-enter-from,
.fp-fade-leave-to {
  opacity: 0;

  .fp-dialog {
    transform: scale(0.94) translateY(-8px);
    opacity: 0;
  }
}
</style>
