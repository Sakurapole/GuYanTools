<script setup lang="ts">
import { reactive, ref, watch, computed } from 'vue';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPopupSurface from '@/windows/main/components/ui/UiPopupSurface.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import type { CreatePortForwardInput, SshPortForward, UpdatePortForwardInput, PortForwardType } from '@/contracts/ssh';

/** Well-known wildcard addresses that listen on all interfaces */
const WILDCARD_HOSTS = ['0.0.0.0', '::', '*'];

/** Commonly used port forwarding templates */
const TEMPLATES = [
  { label: 'MySQL',         forwardType: 'local' as PortForwardType, localPort: 3306, remoteHost: 'localhost', remotePort: 3306 },
  { label: 'PostgreSQL',    forwardType: 'local' as PortForwardType, localPort: 5432, remoteHost: 'localhost', remotePort: 5432 },
  { label: 'Redis',         forwardType: 'local' as PortForwardType, localPort: 6379, remoteHost: 'localhost', remotePort: 6379 },
  { label: 'MongoDB',       forwardType: 'local' as PortForwardType, localPort: 27017, remoteHost: 'localhost', remotePort: 27017 },
  { label: 'Web HTTP',      forwardType: 'local' as PortForwardType, localPort: 8080, remoteHost: 'localhost', remotePort: 80 },
  { label: 'Web HTTPS',     forwardType: 'local' as PortForwardType, localPort: 8443, remoteHost: 'localhost', remotePort: 443 },
  { label: 'SSH Tunnel',    forwardType: 'local' as PortForwardType, localPort: 2222, remoteHost: 'localhost', remotePort: 22 },
  { label: 'RDP',           forwardType: 'local' as PortForwardType, localPort: 3389, remoteHost: 'localhost', remotePort: 3389 },
  { label: 'VNC',           forwardType: 'local' as PortForwardType, localPort: 5900, remoteHost: 'localhost', remotePort: 5900 },
  { label: 'Expose Local Web', forwardType: 'remote' as PortForwardType, localPort: 3000, remoteHost: '0.0.0.0', remotePort: 8080 },
  { label: 'Expose Local API', forwardType: 'remote' as PortForwardType, localPort: 8080, remoteHost: '0.0.0.0', remotePort: 9090 },
  { label: 'SOCKS5 代理',   forwardType: 'dynamic' as PortForwardType, localPort: 1080, remoteHost: '', remotePort: 0 },
];

const props = defineProps<{
  visible: boolean;
  profileId: string;
  /** Pass a forward rule for edit mode, null to create */
  forward: SshPortForward | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [forward: SshPortForward];
}>();

const sshStore = useSshStore();

function blankForm() {
  return {
    label: '',
    forwardType: 'local' as PortForwardType,
    localHost: '127.0.0.1',
    localPort: 0,
    remoteHost: '',
    remotePort: 0,
    autoStart: false,
  };
}

const form = reactive(blankForm());
const saving = ref(false);
const error = ref('');
const selectedTemplate = ref('');

const isEdit = computed(() => props.forward !== null);
const dialogTitle = computed(() => (isEdit.value ? '编辑端口转发' : '新建端口转发'));

/** Show security warning when user binds to a wildcard address */
const showWildcardWarning = computed(() => {
  if (form.forwardType === 'local') {
    return WILDCARD_HOSTS.includes(form.localHost.trim());
  }
  return false;
});

/** Dynamic section labels by forward type */
const localSectionTitle = computed(() => {
  if (form.forwardType === 'dynamic') return 'SOCKS5 监听';
  return form.forwardType === 'local' ? '本地监听' : '本地目标';
});
const remoteSectionTitle = computed(() =>
  form.forwardType === 'local' ? '远程目标' : '远程监听',
);

/** Whether to show the remote section (hidden for dynamic) */
const showRemoteSection = computed(() => form.forwardType !== 'dynamic');

/** Filtered templates based on currently selected forward type */
const filteredTemplates = computed(() =>
  TEMPLATES.filter(t => t.forwardType === form.forwardType),
);
const templateOptions = computed(() => [
  { label: '选择预设模板…', value: '' },
  ...filteredTemplates.value.map((tpl) => ({
    label: `${tpl.label} (${tpl.remoteHost || '*'}:${tpl.remotePort || '*'})`,
    value: tpl.label,
  })),
]);

// Populate form when dialog opens
watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    error.value = '';
    selectedTemplate.value = '';
    if (props.forward) {
      const f = props.forward;
      form.label = f.label ?? '';
      form.forwardType = f.forwardType as PortForwardType;
      form.localHost = f.localHost || '127.0.0.1';
      form.localPort = f.localPort;
      form.remoteHost = f.remoteHost ?? '';
      form.remotePort = f.remotePort ?? 0;
      form.autoStart = f.autoStart;
    } else {
      Object.assign(form, blankForm());
    }
  },
  { immediate: true },
);

/** Apply a template preset to the form */
function applyTemplate(value: string | number) {
  const val = String(value || '');
  selectedTemplate.value = val;
  if (!val) return;
  const tpl = TEMPLATES.find(t => t.label === val);
  if (!tpl) return;
  form.label = tpl.label;
  form.forwardType = tpl.forwardType;
  form.localPort = tpl.localPort;
  form.remoteHost = tpl.remoteHost;
  form.remotePort = tpl.remotePort;
  if (tpl.forwardType === 'local') {
    form.localHost = '127.0.0.1';
  } else {
    form.localHost = '127.0.0.1';
  }
}

function updateNumberField(field: 'localPort' | 'remotePort', value: string) {
  const next = Number(value);
  form[field] = Number.isFinite(next) ? next : 0;
}

/**
 * Check if the local port conflicts with another existing rule.
 * Only applies to 'local' type (both bind the same local port).
 */
function checkPortConflict(): string | null {
  if (form.forwardType !== 'local') return null;
  const existingRules = sshStore.portForwards[props.profileId] ?? [];
  const host = form.localHost.trim() || '127.0.0.1';
  const port = form.localPort;
  const editingId = props.forward?.id;
  const conflict = existingRules.find((r) => {
    if (r.id === editingId) return false;
    if (r.forwardType !== 'local') return false;
    if (r.localPort !== port) return false;
    return r.localHost === host
      || WILDCARD_HOSTS.includes(r.localHost)
      || WILDCARD_HOSTS.includes(host);
  });
  if (conflict) {
    return `本地端口 ${port} 已被规则 "${conflict.label || conflict.id}" 占用`;
  }
  return null;
}

function validate(): string | null {
  if (form.localPort < 1 || form.localPort > 65535) return '本地端口需在 1–65535 之间';
  if (form.forwardType !== 'dynamic') {
    if (!form.remoteHost.trim()) return '请输入远程主机地址';
    if (form.remotePort < 1 || form.remotePort > 65535) return '远程端口需在 1–65535 之间';
  }
  const portConflict = checkPortConflict();
  if (portConflict) return portConflict;
  return null;
}

async function save() {
  const msg = validate();
  if (msg) { error.value = msg; return; }
  saving.value = true;
  error.value = '';
  try {
    let result: SshPortForward;
    if (isEdit.value && props.forward) {
      const input: UpdatePortForwardInput = {
        id: props.forward.id,
        label: form.label.trim() || undefined,
        forwardType: form.forwardType,
        localHost: form.localHost.trim(),
        localPort: form.localPort,
        remoteHost: form.remoteHost.trim(),
        remotePort: form.remotePort,
        autoStart: form.autoStart,
      };
      result = await sshStore.updatePortForward(input);
    } else {
      const input: CreatePortForwardInput = {
        profileId: props.profileId,
        label: form.label.trim() || undefined,
        forwardType: form.forwardType,
        localHost: form.localHost.trim() || undefined,
        localPort: form.localPort,
        remoteHost: form.remoteHost.trim(),
        remotePort: form.remotePort,
        autoStart: form.autoStart,
      };
      result = await sshStore.createPortForward(input);
    }
    emit('saved', result);
    emit('close');
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UiPopupSurface
    :model-value="visible"
    variant="dialog"
    overlay-class="pfd-overlay"
    panel-class="pfd-dialog"
    :aria-label="dialogTitle"
    z-index="var(--ui-z-popover)"
    @close="emit('close')"
  >
          <!-- Header -->
          <div class="pfd-dialog__header">
            <h3 class="pfd-dialog__title">{{ dialogTitle }}</h3>
            <UiIconButton class="pfd-close-btn" size="sm" variant="ghost" title="关闭" @click="emit('close')">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2"
                fill="none" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </UiIconButton>
          </div>

          <!-- Body -->
          <div class="pfd-dialog__body">
            <!-- Forward type selector -->
            <div class="pfd-type-selector">
              <UiButton
                class="pfd-type-btn"
                size="sm"
                variant="ghost"
                type="button"
                :active="form.forwardType === 'local'"
                :class="{ 'pfd-type-btn--active': form.forwardType === 'local' }"
                @click="form.forwardType = 'local'"
                id="pf-type-local"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                  <polyline points="7,11 12,16 17,11" />
                  <line x1="12" y1="16" x2="12" y2="4" />
                  <rect x="3" y="18" width="18" height="2" rx="1" />
                </svg>
                <span class="pfd-type-btn__text">本地转发</span>
                <span class="pfd-type-btn__sub">-L</span>
              </UiButton>
              <UiButton
                class="pfd-type-btn"
                size="sm"
                variant="ghost"
                type="button"
                :active="form.forwardType === 'remote'"
                :class="{ 'pfd-type-btn--active': form.forwardType === 'remote' }"
                @click="form.forwardType = 'remote'"
                id="pf-type-remote"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                  <polyline points="7,13 12,8 17,13" />
                  <line x1="12" y1="8" x2="12" y2="20" />
                  <rect x="3" y="4" width="18" height="2" rx="1" />
                </svg>
                <span class="pfd-type-btn__text">远程转发</span>
                <span class="pfd-type-btn__sub">-R</span>
              </UiButton>
              <UiButton
                class="pfd-type-btn"
                size="sm"
                variant="ghost"
                type="button"
                :active="form.forwardType === 'dynamic'"
                :class="{ 'pfd-type-btn--active': form.forwardType === 'dynamic' }"
                @click="form.forwardType = 'dynamic'"
                id="pf-type-dynamic"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v4m0 14v4m-7.07-15.07l2.83 2.83m8.48 8.48l2.83 2.83M1 12h4m14 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                </svg>
                <span class="pfd-type-btn__text">SOCKS5</span>
                <span class="pfd-type-btn__sub">-D</span>
              </UiButton>
            </div>

            <!-- Template preset selector -->
            <div v-if="!isEdit" class="pfd-template-row">
              <label class="pfd-label pfd-label--inline">模板</label>
              <UiSelect
                :model-value="selectedTemplate"
                class="pfd-select"
                :options="templateOptions"
                size="sm"
                id="pf-template"
                @update:modelValue="applyTemplate"
              />
            </div>

            <!-- Diagram -->
            <div class="pfd-diagram">
              <div class="pfd-diagram__node" :class="{ 'pfd-diagram__node--source': form.forwardType === 'local' || form.forwardType === 'dynamic' }">
                <span class="pfd-diagram__label">{{ form.forwardType === 'remote' ? '远程' : '本地' }}</span>
                <span class="pfd-diagram__value">
                  <template v-if="form.forwardType === 'remote'">{{ form.remoteHost || '...' }}:{{ form.remotePort || '...' }}</template>
                  <template v-else>{{ form.localHost || '127.0.0.1' }}:{{ form.localPort || '...' }}</template>
                </span>
              </div>
              <div class="pfd-diagram__arrow">
                <svg viewBox="0 0 40 16" width="40" height="16">
                  <line x1="0" y1="8" x2="32" y2="8" stroke="currentColor" stroke-width="2"/>
                  <polyline points="28,3 35,8 28,13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                </svg>
                <span class="pfd-diagram__tunnel-label">{{ form.forwardType === 'dynamic' ? 'SOCKS5' : 'SSH 隧道' }}</span>
              </div>
              <div class="pfd-diagram__node pfd-diagram__node--remote" :class="{ 'pfd-diagram__node--source': form.forwardType === 'remote' }">
                <span class="pfd-diagram__label">{{ form.forwardType === 'dynamic' ? '任意目标' : (form.forwardType === 'local' ? '远程' : '本地') }}</span>
                <span class="pfd-diagram__value">
                  <template v-if="form.forwardType === 'dynamic'">*:*</template>
                  <template v-else-if="form.forwardType === 'local'">{{ form.remoteHost || '...' }}:{{ form.remotePort || '...' }}</template>
                  <template v-else>{{ form.localHost || '127.0.0.1' }}:{{ form.localPort || '...' }}</template>
                </span>
              </div>
            </div>

            <!-- Form fields -->
            <div class="pfd-section">
              <div class="pfd-field pfd-field--full">
                <label class="pfd-label">标签（可选）</label>
                <UiInput v-model="form.label" class="pfd-input" size="sm" placeholder="例如：MySQL、Redis …"
                  id="pf-label" />
              </div>
            </div>

            <div class="pfd-section">
              <div class="pfd-section__title">{{ localSectionTitle }}</div>
              <div class="pfd-grid">
                <div class="pfd-field">
                  <label class="pfd-label">地址</label>
                  <UiInput v-model="form.localHost" class="pfd-input" size="sm" placeholder="127.0.0.1"
                    id="pf-local-host" />
                </div>
                <div class="pfd-field">
                  <label class="pfd-label">端口 <span class="pfd-required">*</span></label>
                  <UiInput :model-value="String(form.localPort)" class="pfd-input" size="sm" type="number"
                    min="1" max="65535" placeholder="8080" id="pf-local-port"
                    @update:modelValue="updateNumberField('localPort', $event)" />
                </div>
              </div>
            </div>

            <div v-if="showRemoteSection" class="pfd-section">
              <div class="pfd-section__title">{{ remoteSectionTitle }}</div>
              <div class="pfd-grid">
                <div class="pfd-field">
                  <label class="pfd-label">主机 <span class="pfd-required">*</span></label>
                  <UiInput v-model="form.remoteHost" class="pfd-input" size="sm" placeholder="localhost 或 10.0.0.5"
                    id="pf-remote-host" />
                </div>
                <div class="pfd-field">
                  <label class="pfd-label">端口 <span class="pfd-required">*</span></label>
                  <UiInput :model-value="String(form.remotePort)" class="pfd-input" size="sm" type="number"
                    min="1" max="65535" placeholder="3306" id="pf-remote-port"
                    @update:modelValue="updateNumberField('remotePort', $event)" />
                </div>
              </div>
            </div>

            <!-- 0.0.0.0 security warning (local type only) -->
            <div v-if="showWildcardWarning" class="pfd-warning">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor"
                stroke-width="2" fill="none" stroke-linecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>绑定 <code>{{ form.localHost }}</code> 将监听所有网络接口，局域网内其他设备也能访问。如非必要，建议使用 <code>127.0.0.1</code>。</span>
            </div>

            <!-- Remote type info hint -->
            <div v-if="form.forwardType === 'remote'" class="pfd-info">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor"
                stroke-width="2" fill="none" stroke-linecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>远程转发会让 SSH 服务器监听指定端口，将外部流量转发到本地服务。需要服务端配置 <code>GatewayPorts</code> 才能绑定 <code>0.0.0.0</code>。</span>
            </div>

            <!-- SOCKS5 info hint -->
            <div v-if="form.forwardType === 'dynamic'" class="pfd-info">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor"
                stroke-width="2" fill="none" stroke-linecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>SOCKS5 动态代理在本地启动一个 SOCKS5 服务器，通过 SSH 隧道转发所有连接。配置浏览器或应用的 SOCKS5 代理为 <code>{{ form.localHost || '127.0.0.1' }}:{{ form.localPort || '...' }}</code> 即可使用。</span>
            </div>

            <div class="pfd-section">
              <UiCheckbox
                v-model="form.autoStart"
                class="pfd-auto-start"
                size="sm"
                id="pf-auto-start"
                title="启用后，SSH 连接建立时将自动启动此转发规则"
              >
                连接后自动启用该转发
              </UiCheckbox>
            </div>

            <!-- Error -->
            <div v-if="error" class="pfd-error">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor"
                stroke-width="2" fill="none" stroke-linecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {{ error }}
            </div>
          </div>

          <!-- Footer -->
          <div class="pfd-dialog__footer">
            <UiButton class="pfd-btn pfd-btn--ghost" size="sm" variant="ghost" type="button" @click="emit('close')">取消</UiButton>
            <UiButton class="pfd-btn pfd-btn--primary" size="sm" variant="primary" type="button" :disabled="saving" @click="save"
              id="pf-save-btn">
              {{ saving ? '保存中...' : '保存' }}
            </UiButton>
          </div>
  </UiPopupSurface>
</template>

<style lang="scss">
.pfd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ui-z-popover);
}

.pfd-dialog {
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  border-radius: var(--ui-radius-md);
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
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 14px 20px;
    border-top: 1px solid var(--ui-border-subtle);
    flex-shrink: 0;
    gap: 8px;
  }
}

.pfd-close-btn.ui-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  transition: all 0.15s;
  transform: none;

  &:hover:not(:disabled) {
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
    transform: none;
  }

  svg {
    fill: none;
    stroke: currentColor;
  }
}

// ── Forward type selector ─────────────────────────────
.pfd-type-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pfd-type-btn.ui-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 0;
  padding: 10px 14px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-overlay);
  color: var(--ui-text-secondary);
  transition: all 0.18s;
  font-size: 13px;
  font-weight: 500;
  box-shadow: none;
  transform: none;

  &:hover:not(.pfd-type-btn--active, :disabled) {
    border-color: var(--ui-text-muted);
    color: var(--ui-text-primary);
    transform: none;
  }

  .ui-button__label {
    gap: 6px;
  }

  svg {
    fill: none;
    stroke: currentColor;
  }
}

.pfd-type-btn--active.ui-button {
  border-color: var(--primary-color);
  background: rgba(var(--primary-rgb, 99 102 241), 0.08);
  color: var(--primary-color);
  font-weight: 600;
  box-shadow: 0 0 0 1px var(--primary-color);
}

.pfd-type-btn {
  &__text { white-space: nowrap; }

  &__sub {
    font-family: Consolas, 'Cascadia Mono', monospace;
    font-size: 11px;
    opacity: 0.6;
    font-weight: 600;
  }
}

// ── Template selector ──────────────────────────────────
.pfd-template-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pfd-select.ui-select {
  flex: 1;
}

// ── Flow diagram ──────────────────────────────────────
.pfd-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 12px;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface-overlay);
  border: 1px solid var(--ui-border-subtle);
}

.pfd-diagram__node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-panel);
  border: 1px solid var(--ui-border-subtle);
  min-width: 100px;

  &--remote { border-color: var(--primary-color); }
  &--source { border-color: var(--ui-state-success, #22c55e); }
}

.pfd-diagram__label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ui-text-muted);
}

.pfd-diagram__value {
  font-size: 12px;
  font-family: Consolas, 'Cascadia Mono', monospace;
  color: var(--ui-text-primary);
  font-weight: 500;
}

.pfd-diagram__arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: var(--primary-color);
}

.pfd-diagram__tunnel-label {
  font-size: 9px;
  font-weight: 600;
  color: var(--primary-color);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

// ── Form ──────────────────────────────────────────────
.pfd-section {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ui-text-muted);
    margin-bottom: 2px;
  }
}

.pfd-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.pfd-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  &--full { grid-column: 1 / -1; }
}

.pfd-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-secondary);

  &--inline {
    white-space: nowrap;
    flex-shrink: 0;
  }
}

.pfd-required {
  color: var(--ui-state-error);
  margin-left: 2px;
}

.pfd-input.ui-input,
.pfd-input.ui-input-number-wrapper {
  font-size: 13px;
  width: 100%;
}

.pfd-auto-start {
  align-self: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-overlay);
}

.pfd-error {
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

.pfd-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: var(--ui-radius-md);
  font-size: 12px;
  color: #f59e0b;
  line-height: 1.5;

  svg { flex-shrink: 0; margin-top: 1px; }
  code {
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(245, 158, 11, 0.12);
    font-size: 11px;
    font-weight: 600;
  }
}

.pfd-info {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(var(--primary-rgb, 99 102 241), 0.06);
  border: 1px solid rgba(var(--primary-rgb, 99 102 241), 0.2);
  border-radius: var(--ui-radius-md);
  font-size: 12px;
  color: var(--primary-color);
  line-height: 1.5;

  svg { flex-shrink: 0; margin-top: 1px; }
  code {
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(var(--primary-rgb, 99 102 241), 0.1);
    font-size: 11px;
    font-weight: 600;
  }
}

.pfd-btn.ui-button {
  padding: 7px 18px;
  border-radius: var(--ui-radius-md);
  font-size: 13px;
  font-weight: 600;
  border: 1px solid transparent;
  transition: all 0.18s;
  white-space: nowrap;
  box-shadow: none;
  transform: none;

  &:disabled {
    opacity: 0.5;
  }
}

.pfd-btn--primary.ui-button {
  background: var(--primary-color);
  color: #fff;
  border-color: var(--primary-color);

  &:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: none;
  }
}

.pfd-btn--ghost.ui-button {
  background: transparent;
  color: var(--ui-text-secondary);
  border-color: var(--ui-border-subtle);

  &:hover:not(:disabled) {
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
    transform: none;
  }
}

// Transition
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
  .pfd-dialog { transition: transform 0.2s ease; }
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
  .pfd-dialog { transform: translateY(-12px) scale(0.97); }
}
</style>
