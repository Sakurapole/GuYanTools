<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import type { FtpProfile, FtpSessionFolder } from '@/contracts/ftp';
import type { FtpProfileGroupWidgetConfig, GridItem } from '../../../types/grid';
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
  normalizeWidgetConfig('ftp_profile_group', props.item.widgetConfig) as FtpProfileGroupWidgetConfig,
);
const selectedFolder = computed(() =>
  config.value.folderId
    ? ftpStore.folders.find((folder) => folder.id === config.value.folderId) ?? null
    : null,
);
const title = computed(() => selectedFolder.value?.label || '未分组');
const profiles = computed(() => {
  const folderId = config.value.folderId;
  const profileList = folderId
    ? ftpStore.profiles.filter((profile) => isProfileInsideFolder(profile, folderId))
    : ftpStore.profiles.filter((profile) => !profile.folderId);

  return profileList.sort((left, right) =>
    left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'zh-CN'),
  );
});
const isCompact = computed(() => props.item.rowSpan <= 2);

function isProfileInsideFolder(profile: FtpProfile, folderId: string) {
  let currentId = profile.folderId || '';
  while (currentId) {
    if (currentId === folderId) return true;
    const folder: FtpSessionFolder | undefined = ftpStore.folders.find((item) => item.id === currentId);
    currentId = folder?.parentId || '';
  }
  return false;
}

function profileMeta(profile: FtpProfile) {
  return `${profile.protocol.toUpperCase()} · ${profile.username}@${profile.host}`;
}

function isProfileConnected(profileId: string) {
  return ftpStore.sessions.some((session) => session.profileId === profileId);
}

async function loadProfiles() {
  loading.value = true;
  try {
    await Promise.all([
      ftpStore.refreshProfiles(),
      ftpStore.refreshFolders(),
    ]);
  } finally {
    loading.value = false;
  }
}

async function openProfile(profile: FtpProfile) {
  if (!props.interactive) return;
  await openFtpProfileFromHome(profile);
}

onMounted(() => {
  void loadProfiles();
});
</script>

<template>
  <div class="ftp-group-widget" :class="{ 'ftp-group-widget--compact': isCompact }">
    <header class="ftp-group-widget__header">
      <div>
        <div class="ftp-group-widget__eyebrow">FTP 分组</div>
        <div class="ftp-group-widget__title" :title="title">{{ title }}</div>
      </div>
      <span class="ftp-group-widget__count">{{ profiles.length }}</span>
    </header>

    <div v-if="loading && !profiles.length" class="ftp-group-widget__state">读取配置中...</div>
    <div v-else-if="!profiles.length" class="ftp-group-widget__state">这个分组还没有配置。</div>
    <div v-else class="ftp-group-widget__list">
      <div
        v-for="profile in profiles"
        :key="profile.id"
        class="ftp-group-widget__item"
        role="button"
        tabindex="0"
        :title="`${profile.label} · ${profileMeta(profile)}`"
        @dblclick.stop="openProfile(profile)"
        @keydown.enter.prevent.stop="openProfile(profile)"
      >
        <span class="ftp-group-widget__status" :class="{ 'ftp-group-widget__status--connected': isProfileConnected(profile.id) }" />
        <div class="ftp-group-widget__item-main">
          <span class="ftp-group-widget__item-title">{{ profile.label }}</span>
          <span class="ftp-group-widget__item-meta">{{ profileMeta(profile) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ftp-group-widget {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  padding: 14px;
  color: rgba(255, 255, 255, 0.94);
  overflow: hidden;
}

.ftp-group-widget__header {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.ftp-group-widget__header > div {
  min-width: 0;
}

.ftp-group-widget__eyebrow {
  color: rgba(255, 255, 255, 0.66);
  font-size: 0.68rem;
  font-weight: 700;
}

.ftp-group-widget__title {
  max-width: 100%;
  margin-top: 2px;
  overflow: hidden;
  font-size: 1rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ftp-group-widget__count {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 0.72rem;
  font-weight: 800;
}

.ftp-group-widget__list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow: hidden;
}

.ftp-group-widget__item {
  box-sizing: border-box;
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 38px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.1);
}

.ftp-group-widget__item:hover {
  background: rgba(255, 255, 255, 0.17);
}

.ftp-group-widget__status {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.42);
}

.ftp-group-widget__status--connected {
  background: #86efac;
  box-shadow: 0 0 0 3px rgba(134, 239, 172, 0.16);
}

.ftp-group-widget__item-main {
  min-width: 0;
}

.ftp-group-widget__item-title,
.ftp-group-widget__item-meta {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ftp-group-widget__item-title {
  font-size: 0.82rem;
  font-weight: 720;
}

.ftp-group-widget__item-meta {
  margin-top: 1px;
  color: rgba(255, 255, 255, 0.64);
  font-size: 0.68rem;
}

.ftp-group-widget__state {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  min-height: 0;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.8rem;
}

.ftp-group-widget--compact {
  padding: 12px;
}

.ftp-group-widget--compact .ftp-group-widget__item {
  min-height: 32px;
  padding-block: 5px;
}
</style>
