<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onActivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import { useGlobalStore } from '@/windows/main/stores/global_store';
import { useTerminalStore } from '@/windows/main/stores/terminal_store';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';
import { useFtpStore } from '@/windows/main/stores/ftp_store';
import { useSshStore } from '@/windows/main/stores/ssh_store';
import type { TerminalRendererMode } from '@/contracts/terminal';
import type { BackgroundConfirmPayload } from '@/contracts/background';
import type { SshProfile, SshSessionDescriptor } from '@/contracts/ssh';
import TerminalSearchPanel from './TerminalSearchPanel.vue';
import TerminalToolbar from './TerminalToolbar.vue';
import TerminalViewport from './TerminalViewport.vue';
import SshSidebarTab from './SshSidebarTab.vue';
import SshProfileDialog from './SshProfileDialog.vue';
import SshKeyManagerDialog from './SshKeyManagerDialog.vue';
import SshFingerprintDialog from './SshFingerprintDialog.vue';
import PortForwardPanel from './PortForwardPanel.vue';
import PortForwardDialog from './PortForwardDialog.vue';

const UiBackgroundPicker = defineAsyncComponent(() => import('@/windows/main/components/ui/UiBackgroundPicker.vue'));

/**
 * Main-window terminal page.
 * This component is used exclusively in the main application window.
 * Detached (independent) terminal windows use DetachedTerminal.vue instead.
 */

const route = useRoute();
const router = useRouter();

const globalStore = useGlobalStore();
const terminalStore = useTerminalStore();
const sshStore = useSshStore();
const ftpStore = useFtpStore();
const appConfigStore = useAppConfigStore();

const viewportRef = ref<InstanceType<typeof TerminalViewport> | null>(null);
const searchVisible = ref(false);
const searchQuery = ref('');
const newSessionProfileId = ref('');
const sidebarCollapsed = ref(false);
/** 'terminal' | 'ssh' */
const sidebarTab = ref<'terminal' | 'ssh'>('terminal');

function syncSidebarTabFromRoute() {
  const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  if (tab === 'ssh' || tab === 'terminal') {
    sidebarTab.value = tab;
  }
}

watch(() => route.query.tab, syncSidebarTabFromRoute, { immediate: true });
onActivated(syncSidebarTabFromRoute);

// ── SSH dialog state ──────────────────────────────────────────

const sshProfileDialogVisible = ref(false);
const sshProfileDialogTarget = ref<SshProfile | null>(null);
const sshKeyManagerVisible = ref(false);
const sshFingerprintVisible = ref(false);
const sshFingerprintInfo = ref({ host: '', port: 22, algorithm: '', fingerprint: '' });
const sshConnectError = ref('');
const sshConnectingProfileId = ref('');
const sshLastFailedProfile = ref<SshProfile | null>(null);
/** Pending connect callback resolved after fingerprint is trusted */
let sshFingerprintResolve: (() => void) | null = null;
let sshFingerprintReject: (() => void) | null = null;

// ── Port forward dialog state ─────────────────────────────────
const pfDialogVisible = ref(false);
const pfDialogTarget = ref<import('@/contracts/ssh').SshPortForward | null>(null);

function openPortForwardDialog(fwd: import('@/contracts/ssh').SshPortForward | null = null) {
  pfDialogTarget.value = fwd;
  pfDialogVisible.value = true;
}

// ── SSH Password Prompt ───────────────────────────────────────
const sshPasswordPromptVisible = ref(false);
const sshPasswordPromptLabel = ref('');
const sshPasswordPromptValue = ref('');
let sshPasswordResolve: ((pwd: string | null) => void) | null = null;

function promptSshPassword(profile: SshProfile): Promise<string | null> {
  sshPasswordPromptLabel.value = `${profile.username}@${profile.host}:${profile.port}`;
  sshPasswordPromptValue.value = '';
  sshPasswordPromptVisible.value = true;
  return new Promise<string | null>((resolve) => {
    sshPasswordResolve = resolve;
  });
}

function handleSshPasswordConfirm() {
  sshPasswordPromptVisible.value = false;
  sshPasswordResolve?.(sshPasswordPromptValue.value || null);
  sshPasswordResolve = null;
}

function handleSshPasswordCancel() {
  sshPasswordPromptVisible.value = false;
  sshPasswordResolve?.(null);
  sshPasswordResolve = null;
}

function openSshProfileDialog(profile: SshProfile | null) {
  sshProfileDialogTarget.value = profile;
  sshProfileDialogVisible.value = true;
}

async function handleSshConnect(profile: SshProfile) {
  if (!sshStore) return;
  sidebarTab.value = 'ssh';
  sshConnectError.value = '';
  sshConnectingProfileId.value = profile.id;
  sshLastFailedProfile.value = null;

  // If password auth and password not saved, prompt the user
  let password: string | undefined;
  if (profile.authType === 'password' && !profile.savePassword) {
    const input = await promptSshPassword(profile);
    if (input === null) {
      sshConnectingProfileId.value = '';
      return;
    }
    password = input;
  }

  const doConnect = async (pwd?: string) => {
    await sshStore!.connect({ profileId: profile.id, rows: 32, cols: 120, password: pwd });
  };

  try {
    await doConnect(password);
    sshConnectError.value = '';
  } catch (err: unknown) {
    await handleSshConnectFailure(profile, password, err, doConnect);
  } finally {
    if (sshConnectingProfileId.value === profile.id) {
      sshConnectingProfileId.value = '';
    }
  }
}

async function handleSshConnectFailure(
  profile: SshProfile,
  password: string | undefined,
  err: unknown,
  doConnect: (pwd?: string) => Promise<void>,
) {
  const msg = err instanceof Error ? err.message : String(err);
  const hostVerification = extractSshHostVerification(msg);
  if (hostVerification) {
    try {
      sshFingerprintInfo.value = hostVerification;
      sshFingerprintVisible.value = true;
      await new Promise<void>((resolve, reject) => {
        sshFingerprintResolve = resolve;
        sshFingerprintReject = reject;
      });
      try {
        await doConnect(password);
        sshConnectError.value = '';
      } catch (retryErr) {
        showSshConnectError(profile, retryErr);
      }
    } catch {
      sshFingerprintVisible.value = false;
    }
    return;
  }

  showSshConnectError(profile, err);
}

function extractSshHostVerification(message: string) {
  const jsonStart = message.indexOf('{');
  if ((message.includes('unknown_host') || message.includes('mismatch')) && jsonStart !== -1) {
    try {
      const parsed = JSON.parse(message.slice(jsonStart)) as Partial<typeof sshFingerprintInfo.value>;
      if (
        typeof parsed.host === 'string'
        && typeof parsed.port === 'number'
        && typeof parsed.algorithm === 'string'
        && typeof parsed.fingerprint === 'string'
      ) {
        return {
          host: parsed.host,
          port: parsed.port,
          algorithm: parsed.algorithm,
          fingerprint: parsed.fingerprint,
        };
      }
    } catch {
      // Fall through to the native colon-delimited format.
    }
  }

  const match = message.match(/host_verification_(?:required|mismatch):([^:]+):(\d+):([^:]+):([^\s]+)/);
  if (!match) return null;

  return {
    host: match[1],
    port: Number(match[2]),
    algorithm: match[3],
    fingerprint: match[4],
  };
}

function showSshConnectError(profile: SshProfile, err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw
    .replace(/^Error invoking remote method 'ssh:connect': Error:\s*/i, '')
    .replace(/^connect failed:\s*/i, '')
    .replace(/^host_verification_(?:required|mismatch):/i, '需要确认服务器主机指纹：')
    .trim();
  sshLastFailedProfile.value = profile;
  sshConnectError.value = `SSH 连接失败：${message || '未知错误'}`;
  console.warn('[TerminalPage] SSH connect failed:', message || raw);
}

function handleSshFingerprintTrusted() {
  sshFingerprintVisible.value = false;
  sshFingerprintResolve?.();
  sshFingerprintResolve = null;
  sshFingerprintReject = null;
}

function handleSshFingerprintRejected() {
  sshFingerprintVisible.value = false;
  sshFingerprintReject?.();
  sshFingerprintResolve = null;
  sshFingerprintReject = null;
}

function handleSshFocusSession(session: SshSessionDescriptor) {
  sshConnectError.value = '';
  sshLastFailedProfile.value = null;
  sshStore?.focusSession(session.sessionId);
  sidebarTab.value = 'ssh';
}

async function handleSshDisconnect(sessionId: string) {
  await sshStore?.disconnect(sessionId);
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

const activeSession = computed(() => terminalStore.activeSession);
const activeSshSession = computed(() => sshStore.activeSshSession ?? null);
const activeSshProfile = computed(() =>
  activeSshSession.value
    ? sshStore.profiles.find((profile) => profile.id === activeSshSession.value?.profileId) ?? null
    : null,
);
const displaySessions = computed(() => terminalStore.mainSessions);
const rendererMode = computed(() => appConfigStore.config.features.terminal.rendererMode);
const enableSixel = computed(() => appConfigStore.config.features.terminal.enableSixel);
const colorSchemeId = computed(() => appConfigStore.config.features.terminal.colorSchemeId ?? 'dark-default');

// Background config derived from app config
const termBgType = computed(() => appConfigStore.config.features.terminal.viewportBgType ?? 'color');
const termBgColor = computed(() => appConfigStore.config.features.terminal.viewportBgColor ?? '');
const termBgImage = computed(() => appConfigStore.config.features.terminal.viewportBgImage ?? '');
const termBgVideo = computed(() => appConfigStore.config.features.terminal.viewportBgVideo ?? '');
const termBgStyle = computed(() => appConfigStore.config.features.terminal.viewportBgStyle ?? {});
const bgPickerVisible = ref(false);

// Whether a user-defined background is active (drives WebGL skip + terminal key)
const hasCustomBg = computed(() => {
  if (termBgType.value === 'image' && termBgImage.value) return true;
  if (termBgType.value === 'video' && termBgVideo.value) return true;
  if (termBgType.value === 'color' && termBgColor.value) return true;
  return false;
});

async function initializePage() {
  await terminalStore.ensureSession();
  if (!newSessionProfileId.value && terminalStore.profiles.length > 0) {
    newSessionProfileId.value = appConfigStore.config.features.terminal.defaultProfileId
      || terminalStore.profiles.find((profile) => profile.isDefault)?.id
      || terminalStore.profiles[0].id;
  }
}

async function createSession() {
  const session = await terminalStore.createSession({
    profileId: newSessionProfileId.value || undefined,
  });
  if (appConfigStore.config.features.terminal.detachToWindowByDefault) {
    await terminalStore.detachToWindow(session.sessionId);
  }
}

function focusSession(sessionId: string) {
  terminalStore.focusSession(sessionId);
}

function findNext() {
  viewportRef.value?.findNext(searchQuery.value);
}

function findPrevious() {
  viewportRef.value?.findPrevious(searchQuery.value);
}

async function detachActiveSession() {
  if (!activeSession.value) return;
  await terminalStore.detachToWindow(activeSession.value.sessionId);
}

async function closeSession(sessionId: string) {
  await terminalStore.killSession(sessionId);
}

function handleRenameSession(sessionId: string, newLabel: string) {
  terminalStore.renameSession(sessionId, newLabel);
}

// ── Sidebar inline rename ───────────────────────────────────────
const sidebarEditingId = ref<string | null>(null);
const sidebarEditValue = ref('');
const sidebarInputRef = ref<HTMLInputElement | null>(null);

function startSidebarRename(session: { sessionId: string; profileLabel: string }, event: MouseEvent) {
  event.stopPropagation();
  sidebarEditingId.value = session.sessionId;
  sidebarEditValue.value = session.profileLabel;
  void nextTick(() => {
    sidebarInputRef.value?.focus();
    sidebarInputRef.value?.select();
  });
}

function commitSidebarRename(sessionId: string) {
  const trimmed = sidebarEditValue.value.trim();
  if (trimmed && sidebarEditingId.value === sessionId) {
    terminalStore.renameSession(sessionId, trimmed);
  }
  sidebarEditingId.value = null;
}

function handleSidebarKeydown(e: KeyboardEvent, sessionId: string) {
  if (e.key === 'Enter') {
    (e.target as HTMLInputElement)?.blur();
  } else if (e.key === 'Escape') {
    sidebarEditingId.value = null;
  }
}

async function updateRendererMode(nextMode: TerminalRendererMode) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        rendererMode: nextMode,
      },
    },
  });
}

async function handleRendererFallback(nextMode: Exclude<TerminalRendererMode, 'webgl'>) {
  if (rendererMode.value === 'webgl') {
    await updateRendererMode(nextMode);
  }
}

async function updateColorScheme(schemeId: string) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        colorSchemeId: schemeId,
      },
    },
  });
}

async function handleBgConfirm(payload: BackgroundConfirmPayload) {
  await appConfigStore.updateConfig({
    features: {
      terminal: {
        viewportBgType: payload.type,
        viewportBgColor: payload.color ?? '',
        viewportBgImage: payload.image ?? '',
        viewportBgVideo: payload.video ?? '',
        viewportBgStyle: payload.backgroundStyle ?? {},
      },
    },
  });
}



watch(() => terminalStore.profiles, (profiles) => {
  if (!newSessionProfileId.value && profiles.length > 0) {
    newSessionProfileId.value = profiles.find((profile) => profile.isDefault)?.id ?? profiles[0].id;
  }
}, { deep: true });

// ── Computed: which session & buffer to show ──────────────────

/** Whether the active viewport is for an SSH session */
const isSshMode = computed(() => {
  if (sidebarTab.value === 'ssh' && sshStore.activeSshSessionId) return true;
  return false;
});

/** Buffer content for the active viewport */
const activeViewportBuffer = computed(() => {
  if (isSshMode.value) {
    return sshStore.getBuffer(sshStore.activeSshSessionId);
  }
  const sid = activeSession.value?.sessionId;
  return sid ? terminalStore.getBuffer(sid) : '';
});

/** Session ID for the active viewport */
const activeViewportSessionId = computed(() => {
  if (isSshMode.value) return sshStore.activeSshSessionId;
  return activeSession.value?.sessionId ?? '';
});

function clearTerminal() {
  if (isSshMode.value) {
    sshStore.clearBuffer(sshStore.activeSshSessionId);
  } else {
    const sessionId = activeSession.value?.sessionId;
    if (!sessionId) return;
    terminalStore.clearLocalBuffer(sessionId);
  }
  viewportRef.value?.clear();
}

async function openFileManagerForCurrentSsh() {
  const sshSession = activeSshSession.value;
  if (!sshSession) return;
  const sshProfile = activeSshProfile.value ?? sshStore.profiles.find((profile) => profile.id === sshSession.profileId) ?? null;
  if (!sshProfile) return;

  ftpStore.setPendingOpenRequest({
    requestId: crypto.randomUUID(),
    source: 'ssh',
    sshSessionId: sshSession.sessionId,
    sshProfileId: sshProfile.id,
    label: sshProfile.label,
    host: sshProfile.host,
    port: sshProfile.port,
    username: sshProfile.username,
    authType: sshProfile.authType,
    savePassword: sshProfile.savePassword,
    privateKeyPath: sshProfile.privateKeyPath,
    certificatePath: sshProfile.certificatePath,
    hostCaKeyPath: sshProfile.hostCaKeyPath,
    remotePath: sshStore.getSessionWorkingDirectory(sshSession.sessionId) || '/',
  });

  if (route.path !== '/ftp') {
    await router.push('/ftp');
  }
}

onMounted(() => {
  globalStore.setTopbarColor('');
  void initializePage();
  void sshStore.initialize();
});
</script>

<template>
  <div class="terminal-page">
    <div class="terminal-layout">
      <!-- Sidebar -->
      <div class="terminal-sidebar" :class="{ 'terminal-sidebar--collapsed': sidebarCollapsed }">
        <div class="terminal-sidebar__header">
          <svg class="icon-btn" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round" @click="toggleSidebar"
            :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'">
            <line x1="3" y1="6" x2="21" y2="6" class="menu-line menu-line--top"
              :class="{ 'menu-line--collapsed': sidebarCollapsed }" />
            <line x1="3" y1="12" x2="21" y2="12" class="menu-line menu-line--mid"
              :class="{ 'menu-line--collapsed': sidebarCollapsed }" />
            <line x1="3" y1="18" x2="21" y2="18" class="menu-line menu-line--bot"
              :class="{ 'menu-line--collapsed': sidebarCollapsed }" />
          </svg>
          <!-- Tab switcher (only visible when sidebar is expanded) -->
          <div v-show="!sidebarCollapsed" class="sidebar-tabs">
            <button
              class="sidebar-tab"
              :class="{ 'sidebar-tab--active': sidebarTab === 'terminal' }"
              id="sidebar-tab-terminal"
              @click="sidebarTab = 'terminal'"
            >
              <!-- Terminal icon -->
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2"
                fill="none" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              终端
            </button>
            <button
              class="sidebar-tab"
              :class="{ 'sidebar-tab--active': sidebarTab === 'ssh' }"
              id="sidebar-tab-ssh"
              @click="sidebarTab = 'ssh'"
            >
              <!-- SSH / server icon -->
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2"
                fill="none" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
              SSH
              <span v-if="sshStore.sessions.length > 0" class="sidebar-tab__badge">{{ sshStore.sessions.length }}</span>
            </button>
          </div>
        </div>

        <!-- Terminal Tab: local sessions -->
        <div v-show="sidebarTab === 'terminal'" class="terminal-sidebar__sessions">
          <div v-for="session in displaySessions" :key="session.sessionId" class="terminal-session-item"
            :class="{ 'terminal-session-item--active': session.sessionId === activeSession?.sessionId }"
            :title="sidebarCollapsed ? session.profileLabel : ''" @click="focusSession(session.sessionId)">
            <div class="terminal-session-item__left">
              <span class="status-dot"
                :class="session.status === 'running' ? 'status-dot--running' : 'status-dot--stopped'"></span>
              <template v-if="!sidebarCollapsed">
                <input
                  v-if="sidebarEditingId === session.sessionId"
                  ref="sidebarInputRef"
                  v-model="sidebarEditValue"
                  class="terminal-session-item__input"
                  @blur="commitSidebarRename(session.sessionId)"
                  @keydown="handleSidebarKeydown($event, session.sessionId)"
                  @click.stop
                />
                <span
                  v-else
                  class="terminal-session-item__title terminal-session-item__title--editable"
                  @click.stop="startSidebarRename(session, $event)"
                >{{ session.profileLabel }}</span>
              </template>
            </div>
            <div v-show="!sidebarCollapsed" class="terminal-session-item__right">
              <span class="terminal-session-item__badge"
                :class="session.status === 'running' ? 'badge--running' : 'badge--stopped'">
                {{ session.status === 'running' ? 'Running' : 'Stopped' }}
              </span>
              <button
                class="terminal-session-item__close"
                title="关闭会话"
                @click.stop="closeSession(session.sessionId)"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- SSH Tab -->
        <SshSidebarTab
          v-show="!sidebarCollapsed && sidebarTab === 'ssh'"
          @edit-profile="openSshProfileDialog"
          @open-key-manager="sshKeyManagerVisible = true"
          @connect="handleSshConnect"
          @focus-session="handleSshFocusSession"
          @disconnect="handleSshDisconnect"
        />
      </div>

      <!-- Main content area -->
      <div class="terminal-main">
        <TerminalToolbar :profiles="terminalStore.profiles" :active-session="activeSession"
          :renderer-mode="rendererMode" :new-session-profile-id="newSessionProfileId"
          :color-scheme-id="colorSchemeId"
          :ssh-mode="isSshMode" :port-forward-open="sshStore.portForwardPanelOpen"
          @update:newSessionProfileId="newSessionProfileId = $event" @create="createSession"
          @search="searchVisible = !searchVisible" @clear="clearTerminal" @detach="detachActiveSession"
          @rename="handleRenameSession" @update:rendererMode="updateRendererMode"
          @update:colorSchemeId="updateColorScheme" @background="bgPickerVisible = true"
          @port-forward="sshStore.togglePortForwardPanel()"
          @open-file-manager="openFileManagerForCurrentSsh" />

        <TerminalSearchPanel v-if="searchVisible" :query="searchQuery" @update:query="searchQuery = $event"
          @next="findNext" @previous="findPrevious" @close="searchVisible = false" />

        <div v-if="activeViewportSessionId" class="terminal-stage">
          <TerminalViewport
            :key="`${activeViewportSessionId}:${rendererMode}:${enableSixel}:${hasCustomBg}`"
            ref="viewportRef"
            :session-id="activeViewportSessionId"
            :buffer="activeViewportBuffer"
            :renderer-mode="rendererMode"
            :enable-sixel="enableSixel"
            :color-scheme-id="colorSchemeId"
            :bg-type="termBgType" :bg-color="termBgColor" :bg-image="termBgImage"
            :bg-video="termBgVideo" :bg-style="termBgStyle"
            :copy-shortcut="appConfigStore.config.shortcuts.internal.terminalCopy"
            :paste-shortcut="appConfigStore.config.shortcuts.internal.terminalPaste"
            :write-handler="isSshMode
              ? (data: string) => sshStore.write(activeViewportSessionId, data)
              : undefined"
            :resize-handler="isSshMode
              ? (cols: number, rows: number) => sshStore.resizeSession({ sessionId: activeViewportSessionId, cols, rows })
              : undefined"
            @renderer-fallback="handleRendererFallback" />

          <!-- Port forward floating panel (SSH mode only, main window) -->
          <PortForwardPanel
            v-if="isSshMode && sshStore.portForwardPanelOpen && sshStore.activeSshSession"
            :session-id="sshStore.activeSshSessionId"
            :profile-id="sshStore.activeSshSession.profileId"
            @close="sshStore.togglePortForwardPanel(false)"
            @add-forward="openPortForwardDialog(null)"
            @edit-forward="openPortForwardDialog($event)"
          />
        </div>

        <div v-else class="terminal-empty ui-glass-surface ui-glass-surface--strong">
          <div class="terminal-empty__title">
            {{ sidebarTab === 'ssh'
              ? (sshConnectingProfileId ? '正在连接 SSH' : '没有活跃的 SSH 连接')
              : '没有可用的终端会话' }}
          </div>
          <div v-if="sidebarTab === 'ssh' && sshConnectError" class="terminal-empty__error">
            {{ sshConnectError }}
          </div>
          <div class="terminal-empty__desc">
            {{ sidebarTab === 'ssh'
              ? (sshConnectingProfileId ? '正在建立连接，请稍候。' : '从左侧 SSH 配置列表点击连接，或新建一个 SSH 配置。')
              : '创建一个新的本地终端会话开始使用。' }}
          </div>
          <UiButton v-if="sidebarTab === 'terminal'" variant="primary" size="sm" @click="createSession">创建会话</UiButton>
          <div v-else class="terminal-empty__actions">
            <UiButton
              v-if="sshLastFailedProfile"
              variant="primary"
              size="sm"
              :disabled="Boolean(sshConnectingProfileId)"
              @click="handleSshConnect(sshLastFailedProfile)"
            >
              重新连接
            </UiButton>
            <UiButton variant="secondary" size="sm" @click="openSshProfileDialog(null)">添加 SSH 配置</UiButton>
          </div>
        </div>

        <div class="terminal-statusbar">
          <div class="terminal-statusbar__left">
            <span v-if="isSshMode && sshStore.activeSshSession" class="statusbar-ssh-indicator">
              <span class="ssh-dot ssh-dot--connected" />
              SSH: {{ sshStore.activeSshSession.username }}@{{ sshStore.activeSshSession.host }}
            </span>
          </div>
          <div class="terminal-statusbar__right">
            <span>{{ isSshMode ? 'SSH' : 'Local' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Background Picker Dialog -->
    <UiBackgroundPicker
      :visible="bgPickerVisible"
      :current-background="termBgColor"
      :current-background-image="termBgImage"
      :current-background-video="termBgVideo"
      :current-background-style="termBgStyle"
      @close="bgPickerVisible = false"
      @confirm="handleBgConfirm"
    />

    <!-- SSH dialogs (only in main window context) -->
    <template>
      <SshProfileDialog
        :visible="sshProfileDialogVisible"
        :profile="sshProfileDialogTarget"
        @close="sshProfileDialogVisible = false"
        @saved="sshProfileDialogVisible = false"
        @deleted="sshProfileDialogVisible = false"
      />

      <SshKeyManagerDialog
        :visible="sshKeyManagerVisible"
        @close="sshKeyManagerVisible = false"
      />

      <SshFingerprintDialog
        :visible="sshFingerprintVisible"
        :host="sshFingerprintInfo.host"
        :port="sshFingerprintInfo.port"
        :algorithm="sshFingerprintInfo.algorithm"
        :fingerprint="sshFingerprintInfo.fingerprint"
        @trusted="handleSshFingerprintTrusted"
        @rejected="handleSshFingerprintRejected"
      />

      <!-- SSH Password Prompt Dialog -->
      <Teleport to="body">
        <Transition name="dialog-fade">
          <div v-if="sshPasswordPromptVisible" class="ssh-pwd-overlay" @click.self="handleSshPasswordCancel">
            <div class="ssh-pwd-dialog ui-glass-surface ui-glass-surface--strong">
              <div class="ssh-pwd-dialog__header">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2"
                  fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span>输入 SSH 密码</span>
              </div>
              <p class="ssh-pwd-dialog__sub">{{ sshPasswordPromptLabel }}</p>
              <input
                id="ssh-password-input"
                v-model="sshPasswordPromptValue"
                type="password"
                class="ssh-pwd-dialog__input"
                placeholder="请输入密码..."
                autofocus
                @keydown.enter="handleSshPasswordConfirm"
                @keydown.esc="handleSshPasswordCancel"
              />
              <div class="ssh-pwd-dialog__actions">
                <button class="ssh-pwd-btn ssh-pwd-btn--cancel" @click="handleSshPasswordCancel">取消</button>
                <button class="ssh-pwd-btn ssh-pwd-btn--confirm" @click="handleSshPasswordConfirm">连接</button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Port Forward Dialog -->
      <PortForwardDialog
        :visible="pfDialogVisible"
        :profile-id="sshStore.activeSshSession?.profileId ?? ''"
        :forward="pfDialogTarget"
        @close="pfDialogVisible = false"
        @saved="pfDialogVisible = false"
      />
    </template>

  </div>
</template>

<style lang="scss" scoped>
.terminal-page {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--ui-surface-bg-muted);
}

.terminal-layout {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

/* Sidebar Styles */
.terminal-sidebar {
  display: flex;
  flex-direction: column;
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--ui-border-subtle);
  background: var(--ui-surface-panel);
  transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  &--collapsed {
    width: 56px;
  }
}

.terminal-sidebar__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ui-border-subtle);
  gap: 8px;

  .icon-btn {
    cursor: pointer;
    color: var(--ui-text-muted);
    transition: color 0.2s, transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;

    &:hover {
      color: var(--ui-text-primary);
    }
  }
}

// ── Sidebar tab switcher ───────────────────────────────────────

.sidebar-tabs {
  display: flex;
  flex: 1;
  gap: 2px;
  background: var(--ui-surface-overlay);
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  padding: 2px;
}

.sidebar-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: calc(var(--ui-radius-md) - 2px);
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;

  &--active {
    background: var(--ui-surface-panel);
    color: var(--ui-text-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  &:hover:not(&--active) {
    color: var(--ui-text-secondary);
  }

  &__badge {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: var(--primary-color);
    color: #fff;
    font-size: 9px;
    font-weight: 800;
  }
}

// ── Status bar SSH indicator ──────────────────────────────────

.statusbar-ssh-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-family: Consolas, 'Cascadia Mono', monospace;
  color: #22c55e;
}

.ssh-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &--connected {
    background: #22c55e;
    box-shadow: 0 0 5px rgba(34, 197, 94, 0.5);
  }
}


/* Menu icon line animation - collapses into left-arrow indicator */
.menu-line {
  transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
}

.menu-line--top.menu-line--collapsed {
  transform: rotate(-30deg) translateY(2px) scaleX(0.55);
}

.menu-line--mid.menu-line--collapsed {
  transform: scaleX(0.7);
}

.menu-line--bot.menu-line--collapsed {
  transform: rotate(30deg) translateY(-2px) scaleX(0.55);
}

.terminal-sidebar__sessions {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  gap: 6px;
}

.terminal-session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  overflow: hidden;

  &:hover {
    background: var(--ui-button-ghost-hover-bg);

    .terminal-session-item__close {
      opacity: 1;
    }
  }

  &.terminal-session-item--active {
    background: var(--ui-tabs-active-bg);
    border-color: var(--ui-border-accent-soft);
    color: var(--ui-text-primary);

    .terminal-session-item__close {
      opacity: 1;
    }
  }
}

/* Collapsed sidebar: center session item status dots */
.terminal-sidebar--collapsed .terminal-session-item {
  justify-content: center;
  padding: 8px;
}

.terminal-sidebar--collapsed .terminal-session-item__left {
  justify-content: center;
}

.terminal-sidebar--collapsed .terminal-sidebar__sessions {
  padding: 12px 8px;
}

.terminal-session-item__left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.terminal-session-item__right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &--running {
    background-color: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
  }

  &--stopped {
    background-color: var(--ui-text-subtle);
  }
}

.terminal-session-item__title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &--editable {
    cursor: text;
    border-radius: 3px;
    padding: 0 3px;
    margin: 0 -3px;
    transition: background 0.15s;

    &:hover {
      background: var(--ui-surface-overlay);
    }
  }
}

.terminal-session-item__input {
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-text-primary);
  background: var(--ui-input-bg);
  border: 1px solid var(--ui-input-focus-border, var(--primary-color));
  border-radius: 3px;
  padding: 0 3px;
  outline: none;
  width: 100%;
  min-width: 0;
  font-family: inherit;
}

.terminal-session-item__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
  flex-shrink: 0;

  &:hover {
    background: rgba(239, 68, 68, 0.18);
    color: #ef4444;
  }
}

.terminal-session-item__badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;

  &.badge--running {
    background: rgba(34, 197, 94, 0.16);
    color: #4ade80;
  }

  &.badge--stopped {
    background: var(--ui-surface-overlay);
    color: var(--ui-text-muted);
  }
}

/* Main Content Styles */
.terminal-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  position: relative;
  background: var(--ui-surface-bg);
}

.terminal-stage {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.terminal-stage__path {
  min-width: 0;
  color: var(--primary-color);
  font-size: 13px;
  font-family: Consolas, 'Cascadia Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &::first-line {
    color: var(--ui-text-primary);
  }
}

.terminal-stage__error {
  flex-shrink: 0;
  color: var(--ui-state-error);
  font-size: 12px;
}

.terminal-empty {
  display: flex;
  flex: 1;
  min-width: 0;
  margin: 16px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface-panel);
  border: 1px solid var(--ui-border-subtle);
}

.terminal-empty__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--ui-text-primary);
}

.terminal-empty__desc {
  max-width: 420px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.terminal-empty__error {
  max-width: min(560px, 80%);
  padding: 10px 12px;
  border: 1px solid rgba(var(--ui-state-error-rgb, 239 68 68), 0.28);
  border-radius: var(--ui-radius-md);
  background: rgba(var(--ui-state-error-rgb, 239 68 68), 0.1);
  color: var(--ui-state-error, #ef4444);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  overflow-wrap: anywhere;
}

.terminal-empty__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Status Bar Styles */
.terminal-statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 16px;
  background: var(--ui-surface-panel-muted);
  border-top: 1px solid var(--ui-border-subtle);
  font-size: 12px;
  color: var(--ui-text-muted);
}

.terminal-statusbar__right {
  display: flex;
  gap: 12px;
  align-items: center;
}

// ── SSH Password Prompt ───────────────────────────────────────

.ssh-pwd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.ssh-pwd-dialog {
  width: 340px;
  border-radius: var(--ui-radius-lg);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);

  &__header {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 700;
    color: var(--ui-text-primary);

    svg { color: var(--primary-color); }
  }

  &__sub {
    margin: 0;
    font-size: 12px;
    font-family: Consolas, 'Cascadia Mono', monospace;
    color: var(--ui-text-muted);
  }

  &__input {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 12px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: var(--ui-radius-md);
    background: var(--ui-surface-overlay);
    color: var(--ui-text-primary);
    font-size: 14px;
    outline: none;
    transition: border-color 0.18s;

    &:focus {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.15);
    }
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
}

.ssh-pwd-btn {
  padding: 7px 18px;
  border-radius: var(--ui-radius-md);
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;

  &--cancel {
    background: var(--ui-surface-overlay);
    color: var(--ui-text-secondary);

    &:hover { background: var(--ui-surface-panel); }
  }

  &--confirm {
    background: var(--primary-color);
    color: #fff;

    &:hover { filter: brightness(1.1); }
  }
}

// Dialog fade transition
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;

  .ssh-pwd-dialog {
    transition: transform 0.2s ease;
  }
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;

  .ssh-pwd-dialog {
    transform: translateY(-12px) scale(0.97);
  }
}
</style>
