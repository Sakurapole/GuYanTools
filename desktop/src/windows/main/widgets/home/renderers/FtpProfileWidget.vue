<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import type { FtpProfileWidgetConfig, GridItem } from '../../../types/grid';
import { useFtpStore } from '../../../stores/ftp_store';
import { normalizeWidgetConfig } from '../registry';
import { openFtpProfileFromHome } from '../ftpWidgetNavigation';

const props = withDefaults(defineProps<{
  item: GridItem;
  interactive?: boolean;
}>(), {
  interactive: true,
});

const ftpStore = useFtpStore();
const loading = ref(false);
const config = computed(() =>
  normalizeWidgetConfig('ftp_profile', props.item.widgetConfig) as FtpProfileWidgetConfig,
);
const profile = computed(() =>
  ftpStore.profiles.find((item) => item.id === config.value.profileId) ?? null,
);
const connectedSession = computed(() =>
  profile.value ? ftpStore.sessions.find((session) => session.profileId === profile.value?.id) ?? null : null,
);
const isWide = computed(() => props.item.colSpan >= 4);
const isCompact = computed(() => props.item.colSpan <= 2 && props.item.rowSpan <= 2);
const title = computed(() => profile.value?.label || props.item.label || '传输配置');
const remoteRoot = computed(() => profile.value?.defaultRemotePath || connectedSession.value?.remoteRoot || '/');

function profileMeta() {
  if (!profile.value) return '选择配置后可快速打开远程连接';
  return `${profile.value.protocol.toUpperCase()} · ${profile.value.username}@${profile.value.host}`;
}

async function loadProfiles() {
  loading.value = true;
  try {
    await ftpStore.refreshProfiles();
  } finally {
    loading.value = false;
  }
}

async function openProfile() {
  if (!props.interactive || !profile.value) return;
  await openFtpProfileFromHome(profile.value);
}

onMounted(() => {
  void loadProfiles();
});
</script>

<template>
  <div class="ftp-profile-widget" :class="{ 'ftp-profile-widget--wide': isWide, 'ftp-profile-widget--compact': isCompact }" @dblclick.stop="openProfile">
    <header class="ftp-profile-widget__header">
      <span class="ftp-profile-widget__mark">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="6" rx="2" />
          <rect x="3" y="14" width="18" height="6" rx="2" />
          <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
        </svg>
      </span>
      <span class="ftp-profile-widget__state" :class="{ 'ftp-profile-widget__state--connected': connectedSession }">
        {{ connectedSession ? '已连接' : '可连接' }}
      </span>
    </header>

    <main class="ftp-profile-widget__main">
      <div class="ftp-profile-widget__title" :title="title">{{ title }}</div>
      <div class="ftp-profile-widget__meta" :title="profileMeta()">{{ profileMeta() }}</div>
    </main>

    <div v-if="profile" class="ftp-profile-widget__path" :title="remoteRoot">{{ remoteRoot }}</div>
    <div v-else-if="loading" class="ftp-profile-widget__path">读取配置中...</div>

    <button class="ftp-profile-widget__action" type="button" :disabled="!profile || !interactive" @click.stop="openProfile">
      打开传输
    </button>
  </div>
</template>

<style lang="scss" scoped>
.ftp-profile-widget {
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
  color: rgba(255, 255, 255, 0.95);
  overflow: hidden;
}

.ftp-profile-widget__header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.ftp-profile-widget__mark {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.14);
}

.ftp-profile-widget__mark svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.ftp-profile-widget__state {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.68rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ftp-profile-widget__state--connected {
  border-color: rgba(134, 239, 172, 0.42);
  background: rgba(34, 197, 94, 0.18);
  color: #dcfce7;
}

.ftp-profile-widget__main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.ftp-profile-widget__title,
.ftp-profile-widget__meta,
.ftp-profile-widget__path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ftp-profile-widget__title {
  font-size: 1.04rem;
  font-weight: 780;
}

.ftp-profile-widget__meta {
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.76rem;
}

.ftp-profile-widget__path {
  flex: 0 0 auto;
  min-width: 0;
  color: rgba(255, 255, 255, 0.62);
  font-family: var(--ui-font-mono);
  font-size: 0.68rem;
}

.ftp-profile-widget__action {
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.76rem;
  font-weight: 760;
  cursor: pointer;
}

.ftp-profile-widget__action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.22);
}

.ftp-profile-widget__action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.ftp-profile-widget--wide {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 112px;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-content: center;
  align-items: center;
}

.ftp-profile-widget--wide .ftp-profile-widget__header {
  grid-column: 1;
  grid-row: 1;
  justify-content: center;
}

.ftp-profile-widget--wide .ftp-profile-widget__state {
  display: none;
}

.ftp-profile-widget--wide .ftp-profile-widget__main,
.ftp-profile-widget--wide .ftp-profile-widget__action {
  min-width: 0;
}

.ftp-profile-widget--wide .ftp-profile-widget__main {
  grid-column: 2;
  grid-row: 1;
  align-self: center;
}

.ftp-profile-widget--wide .ftp-profile-widget__action {
  grid-column: 3;
  grid-row: 1;
  min-height: 38px;
  align-self: center;
}

.ftp-profile-widget--wide .ftp-profile-widget__path {
  grid-column: 1 / -1;
  grid-row: 2;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.1);
}

.ftp-profile-widget--compact {
  gap: 6px;
  padding: 10px;
  justify-content: space-between;
}

.ftp-profile-widget--compact .ftp-profile-widget__mark {
  width: 28px;
  height: 28px;
  border-radius: 7px;
}

.ftp-profile-widget--compact .ftp-profile-widget__mark svg {
  width: 16px;
  height: 16px;
}

.ftp-profile-widget--compact .ftp-profile-widget__state {
  padding: 2px 7px;
  font-size: 0.64rem;
}

.ftp-profile-widget--compact .ftp-profile-widget__main {
  flex: 0 1 auto;
}

.ftp-profile-widget--compact .ftp-profile-widget__title {
  font-size: 0.94rem;
}

.ftp-profile-widget--compact .ftp-profile-widget__meta {
  margin-top: 2px;
  font-size: 0.66rem;
}

.ftp-profile-widget--compact .ftp-profile-widget__path {
  display: none;
}

.ftp-profile-widget--compact .ftp-profile-widget__action {
  min-height: 42px;
  border-color: rgba(255, 255, 255, 0.34);
  background: rgba(255, 255, 255, 0.22);
  font-size: 0.86rem;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
}
</style>
