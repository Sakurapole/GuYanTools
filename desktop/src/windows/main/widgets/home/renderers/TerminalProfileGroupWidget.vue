<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import type { SshProfile, SshProfileFolder } from '@/contracts/ssh';
import type { GridItem, TerminalProfileGroupWidgetConfig } from '../../../types/grid';
import { useSshStore } from '../../../stores/ssh_store';
import { normalizeWidgetConfig } from '../registry';
import { openTerminalProfileFromHome } from '../terminalWidgetNavigation';

const props = withDefaults(defineProps<{
  item: GridItem;
  interactive?: boolean;
}>(), {
  interactive: true,
});

const sshStore = useSshStore();
const loading = ref(false);
const config = computed(() =>
  normalizeWidgetConfig('terminal_profile_group', props.item.widgetConfig) as TerminalProfileGroupWidgetConfig,
);
const selectedFolder = computed(() =>
  config.value.folderId
    ? sshStore.folders.find((folder) => folder.id === config.value.folderId) ?? null
    : null,
);
const title = computed(() => selectedFolder.value?.label || '未分组');
const profiles = computed(() => {
  const folderId = config.value.folderId;
  const profileList = folderId
    ? sshStore.profiles.filter((profile) => isProfileInsideFolder(profile, folderId))
    : sshStore.profiles.filter((profile) => !profile.folderId);

  return profileList.sort((left, right) =>
    left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN'),
  );
});
const isCompact = computed(() => props.item.rowSpan <= 2);

function isProfileInsideFolder(profile: SshProfile, folderId: string) {
  let currentId = profile.folderId || '';
  while (currentId) {
    if (currentId === folderId) return true;
    const folder: SshProfileFolder | undefined = sshStore.folders.find((item) => item.id === currentId);
    currentId = folder?.parentId || '';
  }
  return false;
}

function profileMeta(profile: SshProfile) {
  return `${profile.username}@${profile.host}:${profile.port}`;
}

function profileSession(profileId: string) {
  return sshStore.mainSessions.find((session) => session.profileId === profileId) ?? null;
}

async function loadProfiles() {
  loading.value = true;
  try {
    await sshStore.initialize();
    await Promise.all([
      sshStore.refreshProfiles(),
      sshStore.refreshFolders(),
    ]);
  } finally {
    loading.value = false;
  }
}

async function openProfile(profile: SshProfile) {
  if (!props.interactive) return;
  await openTerminalProfileFromHome({ kind: 'ssh', profileId: profile.id });
}

onMounted(() => {
  void loadProfiles();
});
</script>

<template>
  <div class="terminal-group-widget" :class="{ 'terminal-group-widget--compact': isCompact }">
    <header class="terminal-group-widget__header">
      <div>
        <div class="terminal-group-widget__eyebrow">SSH 分组</div>
        <div class="terminal-group-widget__title" :title="title">{{ title }}</div>
      </div>
      <span class="terminal-group-widget__count">{{ profiles.length }}</span>
    </header>

    <div v-if="loading && !profiles.length" class="terminal-group-widget__state">读取配置中...</div>
    <div v-else-if="!profiles.length" class="terminal-group-widget__state">这个分组还没有配置。</div>
    <div v-else class="terminal-group-widget__list">
      <div
        v-for="profile in profiles"
        :key="profile.id"
        class="terminal-group-widget__item"
        role="button"
        tabindex="0"
        :title="`${profile.label} · ${profileMeta(profile)}`"
        @dblclick.stop="openProfile(profile)"
        @keydown.enter.prevent.stop="openProfile(profile)"
      >
        <span class="terminal-group-widget__status" :class="{ 'terminal-group-widget__status--connected': profileSession(profile.id) }" />
        <div class="terminal-group-widget__item-main">
          <span class="terminal-group-widget__item-title">{{ profile.label }}</span>
          <span class="terminal-group-widget__item-meta">{{ profileMeta(profile) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.terminal-group-widget {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  padding: 14px;
  color: var(--widget-text-primary, rgba(255, 255, 255, 0.94));
  overflow: hidden;
}

.terminal-group-widget__header {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.terminal-group-widget__header > div {
  min-width: 0;
}

.terminal-group-widget__eyebrow {
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.66));
  font-size: 0.68rem;
  font-weight: 700;
}

.terminal-group-widget__title {
  max-width: 100%;
  margin-top: 2px;
  overflow: hidden;
  font-size: 1rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-group-widget__count {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 24%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 12%, transparent);
  font-size: 0.72rem;
  font-weight: 800;
}

.terminal-group-widget__list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow: hidden;
}

.terminal-group-widget__item {
  box-sizing: border-box;
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 38px;
  padding: 7px 8px;
  border: 1px solid color-mix(in srgb, var(--widget-text-primary, white) 16%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 10%, transparent);
}

.terminal-group-widget__item:hover {
  background: color-mix(in srgb, var(--widget-text-primary, white) 17%, transparent);
}

.terminal-group-widget__status {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--widget-text-primary, white) 42%, transparent);
}

.terminal-group-widget__status--connected {
  background: #67e8f9;
  box-shadow: 0 0 0 3px rgba(103, 232, 249, 0.16);
}

.terminal-group-widget__item-main {
  min-width: 0;
}

.terminal-group-widget__item-title,
.terminal-group-widget__item-meta {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-group-widget__item-title {
  font-size: 0.82rem;
  font-weight: 720;
}

.terminal-group-widget__item-meta {
  margin-top: 1px;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.64));
  font-size: 0.68rem;
}

.terminal-group-widget__state {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  min-height: 0;
  overflow: hidden;
  color: var(--widget-text-secondary, rgba(255, 255, 255, 0.72));
  font-size: 0.8rem;
}

.terminal-group-widget--compact {
  padding: 12px;
}

.terminal-group-widget--compact .terminal-group-widget__item {
  min-height: 32px;
  padding-block: 5px;
}
</style>
