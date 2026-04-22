<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import type { SshManagedKey } from '@/contracts/ssh';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const sshStore = useSshStore();

const ALGORITHMS = [
  { value: 'ed25519', label: 'Ed25519' },
  { value: 'ecdsa', label: 'ECDSA P-256' },
  { value: 'rsa', label: 'RSA' },
] as const;

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
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="key-manager-overlay" @click.self="emit('close')">
        <div class="key-manager ui-glass-surface ui-glass-surface--strong">
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
                <select v-model="generateForm.algorithm">
                  <option v-for="item in ALGORITHMS" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </option>
                </select>
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
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.key-manager-overlay {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(8, 13, 23, 0.58);
  backdrop-filter: blur(10px);
}

.key-manager {
  width: min(1100px, calc(100vw - 48px));
  max-height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid var(--ui-border-subtle);
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(9, 14, 24, 0.96));

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    h3 {
      margin: 0;
      font-size: 20px;
      color: var(--ui-text-primary);
    }

    p {
      margin: 6px 0 0;
      font-size: 13px;
      line-height: 1.6;
      color: var(--ui-text-secondary);
    }
  }

  &__close {
    padding: 8px 12px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: 10px;
    background: transparent;
    color: var(--ui-text-secondary);
    cursor: pointer;
  }

  &__body {
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 18px;
    padding: 20px 24px 24px;
    min-height: 0;
    overflow: hidden;
  }

  &__panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
  }

  &__panel--list {
    overflow: hidden;
  }

  &__panel-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--ui-text-primary);
  }

  &__panel-title--spaced {
    margin-top: 8px;
  }

  &__actions {
    display: flex;
    gap: 10px;
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
    border-radius: 12px;
    font-size: 12px;
    line-height: 1.5;
  }

  &__message--error {
    background: rgba(239, 68, 68, 0.16);
    color: #fecaca;
  }

  &__message--success {
    background: rgba(34, 197, 94, 0.16);
    color: #bbf7d0;
  }

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    border: 1px dashed rgba(255, 255, 255, 0.09);
    border-radius: 14px;
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

  span {
    font-size: 12px;
    font-weight: 600;
    color: var(--ui-text-secondary);
  }

  input,
  select {
    width: 100%;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.78);
    color: var(--ui-text-primary);
    font-size: 13px;
    outline: none;
  }
}

.key-primary-btn,
.key-secondary-btn,
.key-danger-btn {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: 0.18s ease;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.key-primary-btn {
  background: linear-gradient(135deg, #2563eb, #0f766e);
  color: #fff;
}

.key-secondary-btn {
  background: rgba(255, 255, 255, 0.04);
  color: var(--ui-text-secondary);
  border-color: rgba(255, 255, 255, 0.08);
}

.key-danger-btn {
  background: rgba(239, 68, 68, 0.12);
  color: #fecaca;
  border-color: rgba(239, 68, 68, 0.22);
}

.managed-key-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);

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
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--ui-text-secondary);
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
    color: #93c5fd;
    word-break: break-all;
  }

  &__comment {
    font-size: 12px;
    color: var(--ui-text-secondary);
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
