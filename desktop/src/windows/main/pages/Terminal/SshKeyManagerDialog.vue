<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import UiPopupSurface from '@/windows/main/components/ui/UiPopupSurface.vue';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import type { UiSelectOption } from '@/windows/main/components/ui/UiSelect.vue';
import type { SshManagedKey } from '@/contracts/ssh';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const sshStore = useSshStore();

const algorithmOptions: UiSelectOption[] = [
  { value: 'ed25519', label: 'Ed25519' },
  { value: 'ecdsa', label: 'ECDSA P-256' },
  { value: 'rsa', label: 'RSA' },
];

const generateForm = reactive({
  label: '',
  algorithm: 'ed25519',
  comment: '',
});

const importLabel = ref('');
const error = ref('');
const success = ref('');
const loading = ref(false);
const generating = ref(false);
const importing = ref(false);
const actionKeyId = ref('');
const deleteKeyId = ref('');

const visibleKeys = computed(() => sshStore.managedKeys);

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return;
    error.value = '';
    success.value = '';
    deleteKeyId.value = '';
    if (sshStore.managedKeys.length === 0) {
      loading.value = true;
      try {
        await sshStore.refreshManagedKeys();
      } catch (err: unknown) {
        error.value = err instanceof Error ? err.message : '加载 SSH 密钥列表失败';
      } finally {
        loading.value = false;
      }
    }
  },
);

function resetGenerateForm() {
  generateForm.label = '';
  generateForm.algorithm = 'ed25519';
  generateForm.comment = '';
}

function clearMessages() {
  error.value = '';
  success.value = '';
}

function updateAlgorithm(value: string | number) {
  generateForm.algorithm = String(value);
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000));
}

async function handleGenerate() {
  clearMessages();
  if (!generateForm.label.trim()) {
    error.value = '请输入密钥名称';
    return;
  }

  generating.value = true;
  try {
    await sshStore.generateManagedKey({
      label: generateForm.label.trim(),
      algorithm: generateForm.algorithm,
      comment: generateForm.comment.trim() || undefined,
    });
    success.value = 'SSH 密钥已生成并加密保存到应用密钥库';
    resetGenerateForm();
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '生成 SSH 密钥失败';
  } finally {
    generating.value = false;
  }
}

async function handleImportFromFile() {
  clearMessages();
  importing.value = true;
  try {
    const filePath = await window.shellApi.selectFile({
      title: '导入 OpenSSH 私钥',
      filters: [
        { name: 'SSH 私钥', extensions: ['pem', 'key', 'rsa', 'ed25519'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (!filePath) return;
    await sshStore.importManagedKey({
      label: importLabel.value.trim() || undefined,
      filePath,
    });
    importLabel.value = '';
    success.value = '已从文件导入 SSH 私钥';
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '导入 SSH 私钥失败';
  } finally {
    importing.value = false;
  }
}

async function handleImportFromClipboard() {
  clearMessages();
  importing.value = true;
  try {
    const privateKey = (await window.shellApi.readClipboardText()).trim();
    if (!privateKey) {
      error.value = '剪贴板中没有可导入的私钥内容';
      return;
    }
    await sshStore.importManagedKey({
      label: importLabel.value.trim() || undefined,
      privateKey,
    });
    importLabel.value = '';
    success.value = '已从剪贴板导入 SSH 私钥';
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '导入 SSH 私钥失败';
  } finally {
    importing.value = false;
  }
}

async function handleCopyPublicKey(key: SshManagedKey) {
  clearMessages();
  actionKeyId.value = key.id;
  try {
    await window.shellApi.writeClipboardText(key.publicKey);
    success.value = `已复制 ${key.label} 的公钥内容`;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '复制公钥失败';
  } finally {
    actionKeyId.value = '';
  }
}

async function handleExportKey(key: SshManagedKey) {
  clearMessages();
  actionKeyId.value = key.id;
  try {
    const exported = await sshStore.exportManagedKey(key.id);
    const privateKeyPath = await window.shellApi.saveFile({
      title: `导出 SSH 私钥: ${key.label}`,
      defaultPath: exported.suggestedPrivateKeyName,
      buttonLabel: '导出私钥',
      filters: [
        { name: 'SSH 私钥', extensions: ['key', 'pem'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (!privateKeyPath) return;
    const publicKeyPath = `${privateKeyPath}.pub`;
    await window.shellApi.writeTextFile(privateKeyPath, exported.privateKey);
    await window.shellApi.writeTextFile(publicKeyPath, exported.publicKey);
    success.value = `已导出私钥到 ${privateKeyPath}，并生成同名 .pub 公钥文件`;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '导出 SSH 密钥失败';
  } finally {
    actionKeyId.value = '';
  }
}

async function handleDeleteKey(key: SshManagedKey) {
  if (deleteKeyId.value !== key.id) {
    deleteKeyId.value = key.id;
    return;
  }

  clearMessages();
  actionKeyId.value = key.id;
  try {
    await sshStore.deleteManagedKey(key.id);
    deleteKeyId.value = '';
    success.value = `已删除 ${key.label}`;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '删除 SSH 密钥失败';
  } finally {
    actionKeyId.value = '';
  }
}
</script>

<template>
  <UiPopupSurface
    :model-value="visible"
    variant="dialog"
    overlay-class="key-manager-overlay"
    :panel-class="['key-manager', 'ui-glass-surface', 'ui-glass-surface--strong']"
    width="min(1100px, calc(100vw - 48px))"
    max-height="calc(100vh - 56px)"
    aria-label="SSH 密钥管理"
    :z-index="2400"
    @close="emit('close')"
  >
          <div class="key-manager__header">
            <div>
              <h3>SSH 密钥管理</h3>
              <p>集中生成、导入、导出和保管应用内 SSH 私钥，私钥内容按当前应用加密存储。</p>
            </div>
            <button class="key-manager__close" @click="emit('close')">关闭</button>
          </div>

          <div class="key-manager__body">
            <section class="key-manager__panel">
              <div class="key-manager__panel-title">生成新密钥</div>
              <label class="key-field">
                <span>名称</span>
                <input v-model="generateForm.label" type="text" placeholder="例如：Prod Bastion" />
              </label>
              <label class="key-field">
                <span>算法</span>
                <UiSelect
                  :model-value="generateForm.algorithm"
                  :options="algorithmOptions"
                  size="md"
                  @update:modelValue="updateAlgorithm"
                />
              </label>
              <label class="key-field">
                <span>注释</span>
                <input v-model="generateForm.comment" type="text" placeholder="留空时默认使用名称" />
              </label>
              <button class="key-primary-btn" :disabled="generating" @click="handleGenerate">
                {{ generating ? '生成中...' : '生成并保存' }}
              </button>

              <div class="key-manager__panel-title key-manager__panel-title--spaced">导入现有密钥</div>
              <label class="key-field">
                <span>显示名称</span>
                <input v-model="importLabel" type="text" placeholder="可选，留空则自动推断" />
              </label>
              <div class="key-manager__actions">
                <button class="key-secondary-btn" :disabled="importing" @click="handleImportFromFile">
                  {{ importing ? '导入中...' : '从文件导入' }}
                </button>
                <button class="key-secondary-btn" :disabled="importing" @click="handleImportFromClipboard">
                  {{ importing ? '导入中...' : '从剪贴板导入' }}
                </button>
              </div>
            </section>

            <section class="key-manager__panel key-manager__panel--list">
              <div class="key-manager__list-header">
                <div>
                  <div class="key-manager__panel-title">已管理密钥</div>
                  <p>{{ visibleKeys.length }} 个条目</p>
                </div>
                <button class="key-secondary-btn" :disabled="loading" @click="sshStore.refreshManagedKeys()">
                  刷新
                </button>
              </div>

              <div v-if="error" class="key-manager__message key-manager__message--error">{{ error }}</div>
              <div v-else-if="success" class="key-manager__message key-manager__message--success">{{ success }}</div>

              <div v-if="loading" class="key-manager__empty">正在加载 SSH 密钥列表...</div>
              <div v-else-if="visibleKeys.length === 0" class="key-manager__empty">
                还没有托管密钥。可以先生成一把 Ed25519 密钥，或导入现有 OpenSSH 私钥。
              </div>
              <div v-else class="key-manager__list">
                <article v-for="key in visibleKeys" :key="key.id" class="managed-key-card">
                  <div class="managed-key-card__top">
                    <div>
                      <div class="managed-key-card__title">{{ key.label }}</div>
                      <div class="managed-key-card__meta">
                        <span>{{ key.algorithm }}</span>
                        <span>{{ key.source === 'generated' ? '应用生成' : '外部导入' }}</span>
                        <span>{{ key.isEncrypted ? '源文件已加密' : 'OpenSSH 明文格式' }}</span>
                      </div>
                    </div>
                    <div class="managed-key-card__time">{{ formatDate(key.updatedAt) }}</div>
                  </div>

                  <div class="managed-key-card__fingerprint">{{ key.fingerprint }}</div>
                  <div v-if="key.comment" class="managed-key-card__comment">{{ key.comment }}</div>

                  <div class="managed-key-card__actions">
                    <button
                      class="key-secondary-btn"
                      :disabled="actionKeyId === key.id"
                      @click="handleCopyPublicKey(key)"
                    >
                      复制公钥
                    </button>
                    <button
                      class="key-secondary-btn"
                      :disabled="actionKeyId === key.id"
                      @click="handleExportKey(key)"
                    >
                      导出
                    </button>
                    <button
                      class="key-danger-btn"
                      :disabled="actionKeyId === key.id"
                      @click="handleDeleteKey(key)"
                    >
                      {{ deleteKeyId === key.id ? '再次点击确认删除' : '删除' }}
                    </button>
                  </div>
                </article>
              </div>
            </section>
          </div>
  </UiPopupSurface>
</template>

<style lang="scss">
.key-manager-overlay {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: var(--ui-dialog-overlay, var(--modal-overlay-bg-color));
  backdrop-filter: var(--ui-backdrop-blur-md);
}

.key-manager {
  width: min(1100px, calc(100vw - 48px));
  max-height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 6px;
  border: 1px solid var(--modal-border-color, var(--ui-border-subtle));
  background: var(--modal-bg-color, var(--ui-surface-glass-strong));
  box-shadow: 0 22px 60px var(--modal-shadow-color, rgba(9, 38, 64, 0.2));

  &,
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--modal-header-border-color, var(--ui-border-subtle));
    background: color-mix(in srgb, var(--ui-surface-panel-muted) 72%, transparent);

    h3 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: var(--ui-text-primary);
    }

    p {
      margin: 6px 0 0;
      font-size: 13px;
      line-height: 1.6;
      color: var(--ui-text-muted);
    }
  }

  &__close {
    padding: 8px 12px;
    border: 1px solid transparent;
    border-radius: var(--ui-radius-sm);
    background: transparent;
    color: var(--modal-close-btn-color, var(--ui-button-ghost-text));
    cursor: pointer;
    transition:
      background 0.18s ease,
      color 0.18s ease,
      border-color 0.18s ease;

    &:hover {
      border-color: var(--ui-border-subtle);
      background: var(--modal-close-btn-hover-bg-color, var(--ui-button-ghost-hover-bg));
      color: var(--ui-button-ghost-hover-text);
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--ui-focus-ring);
    }
  }

  &__body {
    display: grid;
    grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);
    gap: 18px;
    padding: 20px 24px 24px;
    width: 100%;
    min-height: 0;
    overflow: hidden;
  }

  &__panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: 4px;
    background: var(--ui-surface-panel);
    box-shadow: var(--ui-button-secondary-shadow);
  }

  &__panel--list {
    overflow: hidden;
  }

  &__panel-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--modal-section-title-color, var(--ui-text-primary));
  }

  &__panel-title::before {
    content: "";
    display: inline-block;
    width: 3px;
    height: 12px;
    margin-right: 8px;
    border-radius: var(--ui-radius-full);
    background: var(--ui-tabs-active-indicator, var(--primary-color));
    vertical-align: -1px;
  }

  &__panel-title--spaced {
    margin-top: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--ui-border-subtle);
  }

  &__actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  &__list-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;

    p {
      margin: 4px 0 0;
      color: var(--ui-text-muted);
      font-size: 12px;
    }
  }

  &__message {
    padding: 10px 12px;
    border-radius: var(--ui-radius-sm);
    border: 1px solid transparent;
    font-size: 12px;
    line-height: 1.5;
  }

  &__message--error {
    border-color: var(--ui-button-danger-border);
    background: var(--ui-button-danger-bg);
    color: var(--ui-button-danger-text);
  }

  &__message--success {
    border-color: color-mix(in srgb, #16a34a 22%, var(--ui-border-subtle));
    background: color-mix(in srgb, #22c55e 12%, var(--ui-surface-panel));
    color: color-mix(in srgb, #15803d 82%, var(--ui-text-primary));
  }

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    border: 1px dashed var(--ui-border-accent-soft);
    border-radius: 4px;
    background: color-mix(in srgb, var(--ui-surface-panel-muted) 74%, transparent);
    color: var(--ui-text-muted);
    text-align: center;
    padding: 18px;
    font-size: 13px;
    line-height: 1.6;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: auto;
    padding-right: 4px;
  }
}

.key-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  span {
    font-size: 12px;
    font-weight: 600;
    color: var(--ui-field-label);
  }

  input {
    width: 100%;
    min-width: 0;
    min-height: var(--ui-control-height-md);
    padding: var(--ui-control-padding-y-md) var(--ui-control-padding-x-md);
    border: 1px solid var(--ui-input-border);
    border-radius: var(--ui-radius-sm);
    background: var(--ui-input-bg);
    color: var(--ui-input-text);
    font-size: 13px;
    outline: none;
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;

    &:hover {
      border-color: var(--ui-select-hover-border, var(--ui-border-accent-soft));
    }

    &:focus {
      border-color: var(--ui-input-focus-border);
      box-shadow: var(--ui-focus-ring);
    }

    &::placeholder {
      color: var(--ui-input-placeholder);
    }
  }
}

.key-primary-btn,
.key-secondary-btn,
.key-danger-btn {
  min-height: var(--ui-control-height-sm);
  padding: 9px 12px;
  border-radius: var(--ui-radius-sm);
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;

  &:not(:disabled):hover {
    transform: translateY(-1px);
  }

  &:not(:disabled):active {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.key-primary-btn {
  background: var(--ui-button-primary-bg);
  color: var(--ui-button-primary-text);
  border-color: var(--ui-button-primary-border);
  box-shadow: var(--ui-button-primary-shadow);

  &:not(:disabled):hover {
    background: var(--ui-button-primary-hover-bg);
  }
}

.key-secondary-btn {
  background: var(--ui-button-secondary-bg);
  color: var(--ui-button-secondary-text);
  border-color: var(--ui-button-secondary-border);
  box-shadow: var(--ui-button-secondary-shadow);

  &:not(:disabled):hover {
    background: var(--ui-button-secondary-hover-bg);
    border-color: var(--ui-button-secondary-hover-border);
  }
}

.key-danger-btn {
  background: var(--ui-button-danger-bg);
  color: var(--ui-button-danger-text);
  border-color: var(--ui-button-danger-border);
  box-shadow: var(--ui-button-danger-shadow);

  &:not(:disabled):hover {
    background: var(--ui-button-danger-hover-bg);
  }
}

.managed-key-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: var(--ui-radius-md);
  border: 1px solid var(--ui-card-border);
  background: color-mix(in srgb, var(--ui-card-bg) 88%, var(--ui-surface-panel-muted));
  box-shadow: var(--ui-button-secondary-shadow);

  &__top {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }

  &__title {
    font-size: 15px;
    font-weight: 700;
    color: var(--ui-text-primary);
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;

    span {
      padding: 3px 8px;
      border: 1px solid var(--ui-border-subtle);
      border-radius: var(--ui-radius-full);
      background: var(--ui-surface-overlay);
      color: var(--ui-text-muted);
      font-size: 11px;
    }
  }

  &__time {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--ui-text-muted);
  }

  &__fingerprint {
    font-family: Consolas, 'Cascadia Mono', monospace;
    font-size: 12px;
    color: var(--ui-input-focus-border);
    word-break: break-all;
    font-variant-numeric: tabular-nums;
  }

  &__comment {
    font-size: 12px;
    color: var(--ui-text-muted);
  }

  &__actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
}

@media (max-width: 980px) {
  .key-manager {
    &__body {
      grid-template-columns: 1fr;
    }
  }
}
</style>
