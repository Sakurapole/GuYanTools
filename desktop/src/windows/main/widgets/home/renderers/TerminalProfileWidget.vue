<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import type { TerminalProfile } from '@/contracts/terminal';
import type { SshProfile } from '@/contracts/ssh';
import type { GridItem, TerminalProfileWidgetConfig } from '../../../types/grid';
import { useSshStore } from '../../../stores/ssh_store';
import { useTerminalStore } from '../../../stores/terminal_store';
import { normalizeWidgetConfig } from '../registry';
import { openTerminalProfileFromHome } from '../terminalWidgetNavigation';
import UiButton from '../../../components/ui/UiButton.vue';

const props = withDefaults(defineProps<{
  item: GridItem;
  interactive?: boolean;
}>(), {
  interactive: true,
});

const terminalStore = useTerminalStore();
const sshStore = useSshStore();
const loading = ref(false);
const config = computed(() =>
  normalizeWidgetConfig('terminal_profile', props.item.widgetConfig) as TerminalProfileWidgetConfig,
);
const localProfile = computed(() =>
  config.value.profileKind === 'local'
    ? terminalStore.profiles.find((item) => item.id === config.value.profileId) ?? null
    : null,
);
const sshProfile = computed(() =>
  config.value.profileKind === 'ssh'
    ? sshStore.profiles.find((item) => item.id === config.value.profileId) ?? null
    : null,
);
const connectedSshSession = computed(() =>
  sshProfile.value ? sshStore.mainSessions.find((session) => session.profileId === sshProfile.value?.id) ?? null : null,
);
const isWide = computed(() => props.item.colSpan >= 4);
const isCompact = computed(() => props.item.colSpan <= 2 && props.item.rowSpan <= 2);
const title = computed(() => localProfile.value?.label || sshProfile.value?.label || props.item.label || '终端配置');
const kindLabel = computed(() => config.value.profileKind === 'ssh' ? 'SSH' : '本地');
const actionLabel = computed(() => config.value.profileKind === 'ssh' ? (connectedSshSession.value ? '切换终端' : '连接 SSH') : '新建终端');

function localMeta(profile: TerminalProfile) {
  const cwd = profile.cwd ? ` · ${profile.cwd}` : '';
  return `${profile.command || profile.id}${cwd}`;
}

function sshMeta(profile: SshProfile) {
  return `${profile.username}@${profile.host}:${profile.port}`;
}

const meta = computed(() => {
  if (localProfile.value) return localMeta(localProfile.value);
  if (sshProfile.value) return sshMeta(sshProfile.value);
  return '选择配置后可快速打开终端';
});
const pathText = computed(() => {
  if (localProfile.value?.cwd) return localProfile.value.cwd;
  if (sshProfile.value) return sshProfile.value.authType === 'password' ? 'Password' : sshProfile.value.authType;
  if (loading.value) return '读取配置中...';
  return '';
});

async function loadProfiles() {
  loading.value = true;
  try {
    await Promise.all([
      terminalStore.initialize(),
      sshStore.initialize(),
    ]);
  } finally {
    loading.value = false;
  }
}

async function openProfile() {
  if (!props.interactive || !config.value.profileId) return;
  await openTerminalProfileFromHome({
    kind: config.value.profileKind,
    profileId: config.value.profileId,
  });
}

onMounted(() => {
  void loadProfiles();
});
</script>

<template>
  <div class="terminal-profile-widget" :class="{ 'terminal-profile-widget--wide': isWide, 'terminal-profile-widget--compact': isCompact }" @dblclick.stop="openProfile">
    <header class="terminal-profile-widget__header">
      <span class="terminal-profile-widget__mark">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      </span>
      <span class="terminal-profile-widget__state" :class="{ 'terminal-profile-widget__state--connected': connectedSshSession }">
        {{ connectedSshSession ? '已连接' : kindLabel }}
      </span>
    </header>

    <main class="terminal-profile-widget__main">
      <div class="terminal-profile-widget__title" :title="title">{{ title }}</div>
      <div class="terminal-profile-widget__meta" :title="meta">{{ meta }}</div>
    </main>

    <div v-if="pathText" class="terminal-profile-widget__path" :title="pathText">{{ pathText }}</div>

    <UiButton class="terminal-profile-widget__action" variant="ghost" type="button" :disabled="!config.profileId || !interactive" @click.stop="openProfile">
      {{ actionLabel }}
    </UiButton>
  </div>
</template>

<style lang="scss" scoped>
.terminal-profile-widget {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  padding: 14px;
  color: var(--widget-text-primary, rgba(255, 255, 255, 0.95));
  overflow: hidden;
}

.terminal-profile-widget__header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.terminal-profile-widget__mark {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 22%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 14%, transparent);
}

.terminal-profile-widget__mark svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}

.terminal-profile-widget__state {
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 20%, transparent);
  border-radius: 999px;
  padding: 3px 8px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 10%, transparent);
  color: var(--widget-text-secondary, rgba(255, 255, 255, 0.72));
  font-size: 0.68rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-profile-widget__state--connected {
  border-color: rgba(103, 232, 249, 0.42);
  background: rgba(6, 182, 212, 0.18);
  color: #cffafe;
}

.terminal-profile-widget__main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.terminal-profile-widget__title,
.terminal-profile-widget__meta,
.terminal-profile-widget__path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-profile-widget__title {
  font-size: 1.04rem;
  font-weight: 780;
}

.terminal-profile-widget__meta {
  margin-top: 5px;
  color: var(--widget-text-secondary, rgba(255, 255, 255, 0.7));
  font-size: 0.76rem;
}

.terminal-profile-widget__path {
  flex: 0 0 auto;
  min-width: 0;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.62));
  font-family: var(--ui-font-mono);
  font-size: 0.68rem;
}

.terminal-profile-widget__action.ui-button {
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 24%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 14%, transparent);
  color: var(--widget-text-primary, rgba(255, 255, 255, 0.92));
  font-size: 0.76rem;
  font-weight: 760;
  cursor: pointer;
  transform: none;
}

.terminal-profile-widget__action.ui-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--widget-text-primary, white) 22%, transparent);
  transform: none;
}

.terminal-profile-widget__action.ui-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.terminal-profile-widget--wide {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 112px;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-content: center;
  align-items: center;
}

.terminal-profile-widget--wide .terminal-profile-widget__header {
  grid-column: 1;
  grid-row: 1;
  justify-content: center;
}

.terminal-profile-widget--wide .terminal-profile-widget__state {
  display: none;
}

.terminal-profile-widget--wide .terminal-profile-widget__main,
.terminal-profile-widget--wide .terminal-profile-widget__action {
  min-width: 0;
}

.terminal-profile-widget--wide .terminal-profile-widget__main {
  grid-column: 2;
  grid-row: 1;
  align-self: center;
}

.terminal-profile-widget--wide .terminal-profile-widget__action {
  grid-column: 3;
  grid-row: 1;
  min-height: 38px;
  align-self: center;
}

.terminal-profile-widget--wide .terminal-profile-widget__path {
  grid-column: 1 / -1;
  grid-row: 2;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 14%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 10%, transparent);
}

.terminal-profile-widget--compact {
  gap: 6px;
  padding: 10px;
  justify-content: space-between;
}

.terminal-profile-widget--compact .terminal-profile-widget__mark {
  width: 28px;
  height: 28px;
  border-radius: 7px;
}

.terminal-profile-widget--compact .terminal-profile-widget__mark svg {
  width: 16px;
  height: 16px;
}

.terminal-profile-widget--compact .terminal-profile-widget__state {
  padding: 2px 7px;
  font-size: 0.64rem;
}

.terminal-profile-widget--compact .terminal-profile-widget__main {
  flex: 0 1 auto;
}

.terminal-profile-widget--compact .terminal-profile-widget__title {
  font-size: 0.94rem;
}

.terminal-profile-widget--compact .terminal-profile-widget__meta {
  margin-top: 2px;
  font-size: 0.66rem;
}

.terminal-profile-widget--compact .terminal-profile-widget__path {
  display: none;
}

.terminal-profile-widget--compact .terminal-profile-widget__action {
  min-height: 42px;
  border-color: color-mix(in srgb, var(--widget-text-primary, white) 34%, transparent);
  background: color-mix(in srgb, var(--widget-text-primary, white) 22%, transparent);
  font-size: 0.86rem;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
}
</style>
