<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPopupSurface from '@/windows/main/components/ui/UiPopupSurface.vue';
import UiScrollbar from '@/windows/main/components/ui/UiScrollbar.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import type { CreateSshProfileInput, SshProfile, SshProfileFolder, UpdateSshProfileInput } from '@/contracts/ssh';

// ── Props & Emits ─────────────────────────────────────────────

const props = withDefaults(defineProps<{
  visible: boolean;
  /** Pass null to create a new profile, pass profile to edit */
  profile: SshProfile | null;
  /** Initial group when creating from a group node */
  initialGroupId?: string;
}>(), {
  initialGroupId: '',
});

const emit = defineEmits<{
  close: [];
  /** Emitted with the new or updated profile's id after save */
  saved: [profileId: string];
  /** Emitted when the user wants to delete the profile */
  deleted: [];
}>();

const sshStore = useSshStore();

// ── Form state ────────────────────────────────────────────────

const AUTH_TYPES = [
  { value: 'password', label: '密码' },
  { value: 'privateKey', label: '私钥文件' },
  { value: 'agent', label: 'SSH Agent' },
] as const;

type AuthType = 'password' | 'privateKey' | 'agent';

function blankForm() {
  return {
    label: '',
    host: '',
    port: 22,
    username: '',
    authType: 'password' as AuthType,
    password: '',
    savePassword: true,
    privateKeyPath: '',
    certificatePath: '',
    hostCaKeyPath: '',
    privateKeyPassphrase: '',
    autoReconnect: false,
    color: '',
    useJumpHost: false,
    jumpHost: '',
    jumpPort: 22,
    jumpUsername: '',
    jumpAuthType: 'password' as AuthType,
    jumpHostCaKeyPath: '',
  };
}

const form = reactive(blankForm());
const saving = ref(false);
const deleting = ref(false);
const confirmDelete = ref(false);
const error = ref('');
const pickingPrivateKey = ref(false);
const pickingCertificate = ref(false);
const selectedGroupId = ref('');

const isEdit = computed(() => props.profile !== null);
const dialogTitle = computed(() => (isEdit.value ? '编辑 SSH 配置' : '新建 SSH 配置'));
const privateKeyPlaceholder = computed(() =>
  isEdit.value ? '未重新选择则保持当前私钥文件' : '请选择私钥文件',
);
const authTypeOptions = computed(() =>
  AUTH_TYPES.map((item) => ({ label: item.label, value: item.value })),
);
const sshGroups = computed(() =>
  [...sshStore.folders]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.label.localeCompare(b.label, 'zh-CN')),
);
const sshGroupIds = computed(() => new Set(sshGroups.value.map((group) => group.id)));
const groupOptions = computed(() => [
  { label: '未分组', value: '' },
  ...flattenGroups().map((item) => ({
    label: `${'  '.repeat(item.depth)}${item.group.label}`,
    value: item.group.id,
  })),
]);

function groupsByParent(parentId = '') {
  return sshGroups.value.filter((group) => (group.parentId ?? '') === parentId);
}

function flattenGroups(parentId = '', depth = 0): Array<{ group: SshProfileFolder; depth: number }> {
  const output: Array<{ group: SshProfileFolder; depth: number }> = [];
  for (const group of groupsByParent(parentId)) {
    output.push({ group, depth });
    output.push(...flattenGroups(group.id, depth + 1));
  }
  return output;
}

function updatePort(value: string) {
  const next = Number(value);
  form.port = Number.isFinite(next) ? next : 0;
}

function updateJumpPort(value: string) {
  const next = Number(value);
  form.jumpPort = Number.isFinite(next) ? next : 0;
}

function updateJumpAuthType(value: string | number) {
  form.jumpAuthType = String(value) as AuthType;
}

// ── Populate form when dialog opens ──────────────────────────

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    error.value = '';
    confirmDelete.value = false;
    if (props.profile) {
      const p = props.profile;
      form.label = p.label;
      form.host = p.host;
      form.port = p.port;
      form.username = p.username;
      form.authType = p.authType as AuthType;
      form.password = '';
      form.savePassword = p.savePassword;
      form.privateKeyPath = p.privateKeyPath ?? '';
      form.certificatePath = p.certificatePath ?? '';
      form.hostCaKeyPath = p.hostCaKeyPath ?? '';
      form.privateKeyPassphrase = '';
      form.autoReconnect = p.autoReconnect;
      form.color = p.color ?? '';
      selectedGroupId.value = p.folderId && sshGroupIds.value.has(p.folderId) ? p.folderId : '';
      form.useJumpHost = !!p.jumpHostJson;
      if (p.jumpHostJson) {
        try {
          const jh = JSON.parse(p.jumpHostJson);
          form.jumpHost = jh.host ?? '';
          form.jumpPort = jh.port ?? 22;
          form.jumpUsername = jh.username ?? '';
          form.jumpAuthType = (jh.authType ?? 'password') as AuthType;
          form.jumpHostCaKeyPath = jh.hostCaKeyPath ?? '';
        } catch {
          // ignore
        }
      } else {
        form.jumpHost = '';
        form.jumpPort = 22;
        form.jumpUsername = '';
        form.jumpAuthType = 'password';
        form.jumpHostCaKeyPath = '';
      }
    } else {
      Object.assign(form, blankForm());
      selectedGroupId.value = props.initialGroupId && sshGroupIds.value.has(props.initialGroupId)
        ? props.initialGroupId
        : '';
    }
  },
  { immediate: true },
);

// ── Validation ────────────────────────────────────────────────

function validate(): string | null {
  if (!form.label.trim()) return '请输入配置名称';
  if (!form.host.trim()) return '请输入主机地址';
  if (!form.port || form.port < 1 || form.port > 65535) return '端口号必须在 1–65535 之间';
  if (!form.username.trim()) return '请输入用户名';
  if (form.authType === 'password' && !form.savePassword && !form.password)
    return '请输入密码（或勾选"记住密码"以从密钥链读取）';
  if (form.useJumpHost) {
    if (!form.jumpHost.trim()) return '请输入跳板机地址';
    if (!form.jumpUsername.trim()) return '请输入跳板机用户名';
  }
  return null;
}

// ── Save ─────────────────────────────────────────────────────

async function save() {
  const msg = validate();
  if (msg) {
    error.value = msg;
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const jumpHostJson = form.useJumpHost
      ? JSON.stringify({
          host: form.jumpHost,
          port: form.jumpPort,
          username: form.jumpUsername,
          authType: form.jumpAuthType,
          hostCaKeyPath: form.jumpHostCaKeyPath || undefined,
        })
      : undefined;

    let profileId: string;
    if (isEdit.value && props.profile) {
      const input: UpdateSshProfileInput = {
        id: props.profile.id,
        label: form.label.trim(),
        host: form.host.trim(),
        port: form.port,
        username: form.username.trim(),
        authType: form.authType,
        savePassword: form.savePassword,
        ...(form.password ? { password: form.password } : {}),
        ...(form.privateKeyPath ? { privateKeyPath: form.privateKeyPath } : {}),
        ...(form.certificatePath ? { certificatePath: form.certificatePath } : {}),
        ...(form.hostCaKeyPath ? { hostCaKeyPath: form.hostCaKeyPath } : {}),
        ...(form.privateKeyPassphrase ? { privateKeyPassphrase: form.privateKeyPassphrase } : {}),
        jumpHostJson,
        autoReconnect: form.autoReconnect,
        folderId: selectedGroupId.value,
        color: form.color || undefined,
      };
      const updated = await sshStore.updateProfile(input);
      profileId = updated.id;
    } else {
      const input: CreateSshProfileInput = {
        label: form.label.trim(),
        host: form.host.trim(),
        port: form.port,
        username: form.username.trim(),
        authType: form.authType,
        savePassword: form.savePassword,
        password: form.password || undefined,
        privateKeyPath: form.privateKeyPath || undefined,
        certificatePath: form.certificatePath || undefined,
        hostCaKeyPath: form.hostCaKeyPath || undefined,
        privateKeyPassphrase: form.privateKeyPassphrase || undefined,
        jumpHostJson,
        autoReconnect: form.autoReconnect,
        folderId: selectedGroupId.value || undefined,
        color: form.color || undefined,
      };
      const created = await sshStore.createProfile(input);
      profileId = created.id;
    }
    emit('saved', profileId);
    emit('close');
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '保存失败，请重试';
  } finally {
    saving.value = false;
  }
}

// ── Delete ────────────────────────────────────────────────────

async function handleDelete() {
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  if (!props.profile) return;
  deleting.value = true;
  try {
    await sshStore.deleteProfile(props.profile.id);
    emit('deleted');
    emit('close');
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '删除失败';
  } finally {
    deleting.value = false;
    confirmDelete.value = false;
  }
}

// ── Color presets ─────────────────────────────────────────────

const COLOR_PRESETS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#64748b', '',
];

function selectColor(c: string) {
  form.color = c;
}

async function handleSelectPrivateKey() {
  pickingPrivateKey.value = true;
  try {
    const filePath = await window.shellApi.selectFile({
      title: '选择 SSH 私钥文件',
      defaultPath: form.privateKeyPath || undefined,
      filters: [
        { name: 'SSH 私钥', extensions: ['pem', 'key', 'ppk', 'rsa', 'ed25519'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (filePath) {
      form.privateKeyPath = filePath;
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '选择私钥文件失败';
  } finally {
    pickingPrivateKey.value = false;
  }
}

function clearSelectedPrivateKey() {
  form.privateKeyPath = '';
}

async function handleSelectCertificate() {
  pickingCertificate.value = true;
  try {
    const filePath = await window.shellApi.selectFile({
      title: '选择 OpenSSH 证书文件',
      defaultPath: form.certificatePath || undefined,
      filters: [
        { name: 'OpenSSH 证书', extensions: ['pub', 'cert'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (filePath) {
      form.certificatePath = filePath;
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '选择证书文件失败';
  } finally {
    pickingCertificate.value = false;
  }
}

function clearSelectedCertificate() {
  form.certificatePath = '';
}
</script>

<template>
  <UiPopupSurface
    :model-value="visible"
    variant="dialog"
    overlay-class="sp-overlay"
    panel-class="sp-dialog"
    :aria-label="dialogTitle"
    :z-index="1000"
    @close="emit('close')"
  >
          <!-- Header -->
          <div class="sp-dialog__header">
            <h3 class="sp-dialog__title">{{ dialogTitle }}</h3>
            <button class="sp-close-btn" @click="emit('close')">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2"
                fill="none" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="sp-dialog__body">
            <UiScrollbar class="sp-dialog__scroll" :x="false" :size="6">
              <div class="sp-dialog__content">
                <!-- Basic info -->
                <div class="sp-section">
              <div class="sp-section__title">基本信息</div>
              <div class="sp-grid sp-grid--2">
                <div class="sp-field sp-field--full">
                  <label class="sp-label">配置名称 <span class="sp-required">*</span></label>
                  <UiInput v-model="form.label" size="sm" placeholder="例如：我的服务器" id="ssh-profile-label" />
                </div>
                <div class="sp-field">
                  <label class="sp-label">主机地址 <span class="sp-required">*</span></label>
                  <UiInput v-model="form.host" size="sm" placeholder="192.168.1.1 或 example.com" id="ssh-profile-host" />
                </div>
                <div class="sp-field">
                  <label class="sp-label">端口</label>
                  <UiInput
                    :model-value="String(form.port)"
                    size="sm"
                    type="number"
                    :min="1"
                    :max="65535"
                    id="ssh-profile-port"
                    @update:modelValue="updatePort"
                  />
                </div>
                <div class="sp-field">
                  <label class="sp-label">用户名 <span class="sp-required">*</span></label>
                  <UiInput v-model="form.username" size="sm" placeholder="root" id="ssh-profile-username" />
                </div>
                <div class="sp-field">
                  <label class="sp-label">所属分组</label>
                  <UiSelect
                    v-model="selectedGroupId"
                    :options="groupOptions"
                    size="sm"
                    id="ssh-profile-group"
                  />
                </div>
                <!-- Color tag -->
                <div class="sp-field">
                  <label class="sp-label">颜色标记</label>
                  <div class="sp-colors">
                    <button
                      v-for="c in COLOR_PRESETS"
                      :key="c"
                      class="sp-color-swatch"
                      :class="{ 'sp-color-swatch--selected': form.color === c }"
                      :style="c ? { background: c } : {}"
                      @click="selectColor(c)"
                      :title="c || '无'"
                    >
                      <svg v-if="!c" viewBox="0 0 24 24" width="10" height="10" stroke="currentColor"
                        stroke-width="2" fill="none" stroke-linecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Authentication -->
            <div class="sp-section">
              <div class="sp-section__title">认证方式</div>
              <div class="sp-auth-tabs">
                <button
                  v-for="at in AUTH_TYPES"
                  :key="at.value"
                  class="sp-auth-tab"
                  :class="{ 'sp-auth-tab--active': form.authType === at.value }"
                  :id="`ssh-auth-${at.value}`"
                  @click="form.authType = at.value"
                >{{ at.label }}</button>
              </div>

              <!-- Password auth -->
              <template v-if="form.authType === 'password'">
                <div class="sp-grid sp-grid--1" style="margin-top: 12px">
                  <div class="sp-field">
                    <label class="sp-label">密码</label>
                    <UiInput v-model="form.password" size="sm" type="password"
                      :placeholder="isEdit ? '留空则保持不变' : '输入密码'" id="ssh-profile-password" />
                  </div>
                  <UiCheckbox v-model="form.savePassword" size="sm" id="ssh-save-password">
                    记住密码（加密存储到系统密钥链）
                  </UiCheckbox>
                </div>
              </template>

              <!-- Private key auth -->
              <template v-else-if="form.authType === 'privateKey'">
                <div class="sp-grid sp-grid--1" style="margin-top: 12px">
                  <div class="sp-field">
                    <label class="sp-label">私钥文件路径</label>
                    <div class="sp-input-action">
                      <UiInput
                        :model-value="form.privateKeyPath"
                        size="sm"
                        :placeholder="privateKeyPlaceholder"
                        id="ssh-private-key-path"
                        readonly
                      />
                      <UiButton
                        class="sp-inline-btn"
                        variant="ghost"
                        size="sm"
                        type="button"
                        :disabled="pickingPrivateKey"
                        @click="handleSelectPrivateKey"
                      >
                        {{ pickingPrivateKey ? '选择中...' : '选择文件' }}
                      </UiButton>
                      <UiButton
                        v-if="form.privateKeyPath"
                        class="sp-inline-btn"
                        variant="ghost"
                        size="sm"
                        type="button"
                        @click="clearSelectedPrivateKey"
                      >
                        清空
                      </UiButton>
                    </div>
                    <span v-if="isEdit && !form.privateKeyPath" class="sp-hint">
                      未重新选择时，将继续使用当前已保存的私钥文件。
                    </span>
                  </div>
                  <div class="sp-field">
                    <label class="sp-label">私钥密码短语（可留空）</label>
                    <UiInput v-model="form.privateKeyPassphrase" size="sm" type="password"
                      placeholder="Passphrase" id="ssh-key-passphrase" />
                  </div>
                  <div class="sp-field">
                    <label class="sp-label">主机 CA 公钥（可选）</label>
                    <UiInput v-model="form.hostCaKeyPath" size="sm"
                      placeholder="C:\\Users\\me\\.ssh\\ssh_host_ca.pub" id="ssh-host-ca-path" />
                    <span class="sp-hint">
                      服务器使用 OpenSSH Host Certificate 时，可指定签发该证书的 CA 公钥路径。
                    </span>
                  </div>
                  <div class="sp-field">
                    <label class="sp-label">OpenSSH 用户证书（可选）</label>
                    <div class="sp-input-action">
                      <UiInput
                        :model-value="form.certificatePath"
                        size="sm"
                        placeholder="选择 *-cert.pub 证书文件"
                        id="ssh-certificate-path"
                        readonly
                      />
                      <UiButton
                        class="sp-inline-btn"
                        variant="ghost"
                        size="sm"
                        type="button"
                        :disabled="pickingCertificate"
                        @click="handleSelectCertificate"
                      >
                        {{ pickingCertificate ? '选择中...' : '选择文件' }}
                      </UiButton>
                      <UiButton
                        v-if="form.certificatePath"
                        class="sp-inline-btn"
                        variant="ghost"
                        size="sm"
                        type="button"
                        @click="clearSelectedCertificate"
                      >
                        清空
                      </UiButton>
                    </div>
                    <span class="sp-hint">
                      选择 OpenSSH CA 签发的用户证书后，会改用证书认证；未选择时继续使用普通公钥认证。
                    </span>
                  </div>
                </div>
              </template>

              <!-- Agent auth -->
              <template v-else>
                <div class="sp-agent-hint">
                  <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor"
                    stroke-width="2" fill="none">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  将使用系统 SSH Agent（Pageant / ssh-agent）中加载的密钥进行认证。
                </div>
              </template>
            </div>

            <!-- Jump host -->
            <div class="sp-section">
              <UiCheckbox v-model="form.useJumpHost" size="sm" id="ssh-use-jump-host">
                <span class="sp-section__title sp-section__title--inline">启用跳板机（JumpHost）</span>
              </UiCheckbox>

              <div v-if="form.useJumpHost" class="sp-grid sp-grid--2" style="margin-top: 12px">
                <div class="sp-field">
                  <label class="sp-label">跳板机地址</label>
                  <UiInput v-model="form.jumpHost" size="sm" placeholder="jump.example.com" id="ssh-jump-host" />
                </div>
                <div class="sp-field">
                  <label class="sp-label">端口</label>
                  <UiInput
                    :model-value="String(form.jumpPort)"
                    size="sm"
                    type="number"
                    :min="1"
                    :max="65535"
                    id="ssh-jump-port"
                    @update:modelValue="updateJumpPort"
                  />
                </div>
                <div class="sp-field">
                  <label class="sp-label">用户名</label>
                  <UiInput v-model="form.jumpUsername" size="sm" placeholder="root" id="ssh-jump-username" />
                </div>
                <div class="sp-field">
                  <label class="sp-label">认证方式</label>
                  <UiSelect
                    :model-value="form.jumpAuthType"
                    :options="authTypeOptions"
                    size="sm"
                    id="ssh-jump-auth-type"
                    @update:modelValue="updateJumpAuthType"
                  />
                </div>
                <div class="sp-field sp-field--full">
                  <label class="sp-label">跳板机 Host CA 公钥（可选）</label>
                  <UiInput v-model="form.jumpHostCaKeyPath" size="sm"
                    placeholder="C:\\Users\\me\\.ssh\\jump_host_ca.pub" id="ssh-jump-host-ca-path" />
                </div>
              </div>
            </div>

            <!-- Advanced -->
            <div class="sp-section">
              <div class="sp-section__title">高级选项</div>
              <UiCheckbox v-model="form.autoReconnect" size="sm" id="ssh-auto-reconnect">
                连接断开后自动重连
              </UiCheckbox>
            </div>

            <!-- Error -->
            <div v-if="error" class="sp-error">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor"
                stroke-width="2" fill="none" stroke-linecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {{ error }}
            </div>
              </div>
            </UiScrollbar>
          </div>

          <!-- Footer -->
          <div class="sp-dialog__footer">
            <!-- Delete button (edit mode only) -->
            <UiButton v-if="isEdit" variant="danger" size="sm" :disabled="deleting"
              @click="handleDelete">
              {{ confirmDelete ? '确认删除' : '删除配置' }}
            </UiButton>
            <div class="sp-dialog__footer-right">
              <UiButton variant="ghost" size="sm" @click="emit('close')">取消</UiButton>
              <UiButton variant="primary" size="sm" :disabled="saving" @click="save" id="ssh-save-btn">
                {{ saving ? '保存中...' : '保存' }}
              </UiButton>
            </div>
          </div>
  </UiPopupSurface>
</template>

<style lang="scss">
// ── Dialog overlay ────────────────────────────────────────────

.sp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.sp-dialog {
  width: 560px;
  max-width: calc(100vw - 32px);
  height: calc(100vh - 64px);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  border-radius: var(--ui-radius-xs, 6px);
  background: var(--ui-surface-dialog, var(--ui-surface-panel));
  border: 1px solid var(--ui-border-subtle);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.2);
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--ui-border-subtle);
    flex-shrink: 0;
  }

  &__title {
    font-size: 15px;
    font-weight: 700;
    color: var(--ui-text-primary);
    margin: 0;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 16px 20px;
    box-sizing: border-box;
  }

  &__scroll {
    height: 100%;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 14px;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-top: 1px solid var(--ui-border-subtle);
    flex-shrink: 0;
    gap: 8px;
  }

  &__footer-right {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
}

.sp-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
  }
}

// ── Section ───────────────────────────────────────────────────

.sp-section {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ui-text-muted);
    margin-bottom: 4px;

    &--inline {
      margin-bottom: 0;
    }
  }
}

// ── Grid ──────────────────────────────────────────────────────

.sp-grid {
  display: grid;
  gap: 10px;

  &--1 { grid-template-columns: 1fr; }
  &--2 { grid-template-columns: 1fr 1fr; }
}

.sp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;

  &--full { grid-column: 1 / -1; }
}

// ── Form controls ─────────────────────────────────────────────

.sp-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-secondary);
}

.sp-required {
  color: var(--ui-state-error);
  margin-left: 2px;
}

.sp-input-action {
  display: flex;
  gap: 8px;
  align-items: center;

  :deep(.ui-input),
  :deep(.ui-input-number-wrapper),
  :deep(.ui-select-wrap) {
    flex: 1;
    min-width: 0;
  }
}

.sp-inline-btn {
  flex-shrink: 0;
}

.sp-hint {
  font-size: 12px;
  color: var(--ui-text-muted);
  line-height: 1.5;
}

// ── Auth type tabs ────────────────────────────────────────────

.sp-auth-tabs {
  display: flex;
  gap: 4px;
  background: var(--ui-surface-overlay);
  padding: 3px;
  border-radius: var(--ui-radius-md);
  border: 1px solid var(--ui-border-subtle);
}

.sp-auth-tab {
  flex: 1;
  padding: 5px 12px;
  border: none;
  border-radius: calc(var(--ui-radius-md) - 2px);
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s;

  &--active {
    background: var(--ui-surface-panel);
    color: var(--ui-text-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  }

  &:hover:not(&--active) {
    color: var(--ui-text-secondary);
  }
}

// ── Agent hint ────────────────────────────────────────────────

.sp-agent-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: var(--ui-surface-overlay);
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  font-size: 12px;
  color: var(--ui-text-secondary);
  margin-top: 12px;
  line-height: 1.5;

  svg { flex-shrink: 0; margin-top: 1px; }
}

// ── Color swatches ────────────────────────────────────────────

.sp-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.sp-color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-border-subtle);
  transition: all 0.15s;
  color: var(--ui-text-muted);

  &--selected {
    border-color: var(--ui-text-primary);
    transform: scale(1.15);
  }

  &:hover:not(&--selected) {
    transform: scale(1.1);
  }
}

// ── Error ─────────────────────────────────────────────────────

.sp-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(var(--ui-state-error-rgb, 239 68 68), 0.1);
  border: 1px solid rgba(var(--ui-state-error-rgb, 239 68 68), 0.3);
  border-radius: var(--ui-radius-md);
  font-size: 12px;
  color: var(--ui-state-error, #ef4444);
}

// ── Transition ────────────────────────────────────────────────

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s;

  .sp-dialog {
    transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
  }
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;

  .sp-dialog {
    transform: scale(0.94) translateY(8px);
    opacity: 0;
  }
}
</style>
